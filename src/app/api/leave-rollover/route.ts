import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildLeaveGrid } from "@/lib/utils/leave-grid";
import { TEAMS, positionToTeam } from "@/lib/utils/team";
import type { Position } from "@/lib/types/member";
import { kstTodayStr } from "@/lib/types/leave";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** KST 기준 날짜 산술 ('YYYY-MM-DD' 문자열 유지) */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}
/** 그 날짜가 그 달의 말일인지 */
function isMonthEnd(iso: string): boolean {
  return addDays(iso, 1).slice(5, 7) !== iso.slice(5, 7);
}

/**
 * 연차 주기 롤오버 (Vercel Cron, 매일 KST 00:10)
 *  1. 월말이면 팀별 연차표 스냅샷
 *  2. 만료된 주기 → 개인 스냅샷 저장 → closed → 다음 주기 자동 생성(미확정) → 관리자 알림
 *  3. 만료 30일 전 사전 알림
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const today = kstTodayStr();
  const result = {
    today,
    monthlySnapshots: 0,
    closed: 0,
    opened: 0,
    warned: 0,
    errors: [] as string[],
  };

  // 전체관리자 목록 (알림 대상)
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true);
  const adminIds = (admins ?? []).map((a) => a.id as string);
  const notify = async (title: string, body: string) => {
    if (adminIds.length === 0) return;
    await supabase.from("notifications").insert(
      adminIds.map((id) => ({
        user_id: id,
        type: "leave_rollover",
        title,
        body,
        link: "/leave",
      })),
    );
  };

  // --- 1. 월말 팀별 스냅샷 ---
  if (isMonthEnd(today)) {
    for (const team of TEAMS) {
      try {
        const columns = await buildLeaveGrid(supabase, team);
        if (columns.length === 0) continue;
        const { error } = await supabase.from("leave_grid_snapshots").insert({
          kind: "monthly",
          snapshot_date: today,
          team,
          data: columns,
        });
        // 유니크 인덱스 충돌 = 이미 저장됨 → 무시
        if (error && !error.message.includes("duplicate")) {
          result.errors.push(`monthly ${team}: ${error.message}`);
        } else if (!error) {
          result.monthlySnapshots++;
        }
      } catch (e) {
        result.errors.push(`monthly ${team}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // --- 2. 만료된 주기 마감 + 다음 주기 생성 ---
  const { data: expired } = await supabase
    .from("leave_balances")
    .select("id, user_id, total_days, period_start, period_end")
    .eq("status", "active")
    .not("period_end", "is", null)
    .lt("period_end", today);

  for (const bal of expired ?? []) {
    const uid = bal.user_id as string;
    const periodEnd = bal.period_end as string;
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, position")
        .eq("id", uid)
        .maybeSingle();
      const team = positionToTeam(prof?.position as Position | null);

      // 2-1. 마감 직전 상태를 개인 스냅샷으로 고정
      if (team) {
        const columns = await buildLeaveGrid(supabase, team);
        const mine = columns.filter((c) => c.userId === uid);
        await supabase.from("leave_grid_snapshots").insert({
          kind: "cycle_end",
          snapshot_date: today,
          team,
          user_id: uid,
          user_name: (prof?.full_name as string) ?? null,
          period_start: (bal.period_start as string | null) ?? null,
          period_end: periodEnd,
          data: mine,
        });
      }

      // 2-2. 마감 (미사용 잔여는 소멸 — 이월 없음)
      await supabase
        .from("leave_balances")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", bal.id as string);
      result.closed++;

      // 2-3. 다음 주기 — 미리 신청 때 만들어진 scheduled 가 있으면 승격, 없으면 생성
      const nextStart = addDays(periodEnd, 1);
      const nextEnd = addDays(addYears(nextStart, 1), -1);
      const { data: pre } = await supabase
        .from("leave_balances")
        .select("id")
        .eq("user_id", uid)
        .eq("period_start", nextStart)
        .maybeSingle();

      const { error: insErr } = pre
        ? await supabase
            .from("leave_balances")
            .update({ status: "active" })
            .eq("id", pre.id as string)
        : await supabase.from("leave_balances").insert({
            user_id: uid,
            total_days: Number(bal.total_days ?? 0),
            period_start: nextStart,
            period_end: nextEnd,
            status: "active",
            confirmed: false,
          });
      if (insErr) {
        result.errors.push(`open ${uid}: ${insErr.message}`);
      } else {
        result.opened++;
        await notify(
          "연차 주기 갱신 — 확인 필요",
          `${prof?.full_name ?? "?"} 님의 연차가 ${periodEnd}로 만료되어 ` +
            `${nextStart}~${nextEnd} 주기를 ${bal.total_days}일로 자동 생성했습니다. 실제 일수를 확인해주세요.`,
        );
      }
    } catch (e) {
      result.errors.push(`rollover ${uid}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // --- 3. 만료 30일 전 사전 알림 ---
  const in30 = addDays(today, 30);
  const { data: soon } = await supabase
    .from("leave_balances")
    .select("user_id, period_end")
    .eq("status", "active")
    .eq("period_end", in30);

  if (soon && soon.length > 0) {
    const ids = soon.map((s) => s.user_id as string);
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    const names = (profs ?? []).map((p) => p.full_name as string).join(", ");
    await notify("연차 만료 30일 전", `${in30} 만료 예정: ${names}`);
    result.warned = soon.length;
  }

  return NextResponse.json(result);
}
