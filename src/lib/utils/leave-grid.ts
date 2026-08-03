import type { SupabaseClient } from "@supabase/supabase-js";
import { teamToPosition, type Team } from "@/lib/utils/team";
import {
  portionDays,
  chargedToPeriod,
  type DayPortion,
  type LeaveGrant,
  type LeaveGridCell,
  type LeaveGridColumn,
} from "@/lib/types/leave";

/**
 * 엑셀형 연차표 한 팀분을 조립.
 * Server Action(사용자 세션)과 롤오버 Cron(service_role) 양쪽에서 쓰므로
 * "use server" 밖에 두고 supabase 클라이언트를 주입받는다.
 */
export async function buildLeaveGrid(
  supabase: SupabaseClient,
  team: Team,
): Promise<LeaveGridColumn[]> {
  const { data: memberRows } = await supabase
    .from("profiles")
    .select("id, full_name, position")
    .eq("is_active", true)
    .eq("position", teamToPosition(team))
    .order("full_name");
  const members = memberRows ?? [];
  if (members.length === 0) return [];

  const memberIds = members.map((m) => m.id as string);

  const { data: balRows } = await supabase
    .from("leave_balances")
    .select("id, user_id, total_days, period_start, period_end, confirmed")
    .in("user_id", memberIds)
    .eq("status", "active");
  const balMap = new Map(
    (balRows ?? []).map((b) => [
      b.user_id as string,
      {
        id: b.id as string,
        base: Number(b.total_days ?? 0),
        start: (b.period_start as string | null) ?? null,
        end: (b.period_end as string | null) ?? null,
        confirmed: (b.confirmed as boolean | null) ?? true,
      },
    ]),
  );

  const balanceIds = [...balMap.values()].map((b) => b.id);
  const grantMap = new Map<string, LeaveGrant[]>();
  if (balanceIds.length > 0) {
    const { data: grantRows } = await supabase
      .from("leave_grants")
      .select("id, user_id, days, reason, granted_date, created_at")
      .in("balance_id", balanceIds)
      .order("granted_date");
    for (const g of grantRows ?? []) {
      const uid = g.user_id as string;
      const list = grantMap.get(uid) ?? [];
      list.push({
        id: g.id as string,
        user_id: uid,
        days: Number(g.days ?? 0),
        reason: (g.reason as string) ?? "",
        granted_date: g.granted_date as string,
        created_at: g.created_at as string,
      });
      grantMap.set(uid, list);
    }
  }

  const { data: typeRows } = await supabase
    .from("leave_types")
    .select("id")
    .eq("deducts_balance", true);
  const deductIds = (typeRows ?? []).map((t) => t.id as string);

  const { data: entryRows } = deductIds.length
    ? await supabase
        .from("leave_entries")
        .select("user_id, leave_date, day_portion, balance_id")
        .in("user_id", memberIds)
        .in("leave_type_id", deductIds)
        .order("leave_date")
    : { data: [] };

  const byUser = new Map<string, { date: string; portion: DayPortion; borrowed: boolean }[]>();
  for (const e of entryRows ?? []) {
    const uid = e.user_id as string;
    const bal = balMap.get(uid);
    if (!bal) continue;
    const d = e.leave_date as string;
    const balanceId = (e.balance_id as string | null) ?? null;
    // 기준기간 밖 = 지난 회차 → 제외. 단 balance_id 로 이 주기에 걸린 선사용분은 포함.
    if (!chargedToPeriod({ leave_date: d, balance_id: balanceId }, bal)) continue;
    const list = byUser.get(uid) ?? [];
    list.push({
      date: d,
      portion: e.day_portion as DayPortion,
      // 날짜는 이 주기 밖인데 당겨 쓴 항목
      borrowed: !!balanceId && !!bal.start && !!bal.end && (d < bal.start || d > bal.end),
    });
    byUser.set(uid, list);
  }

  return members.map((m) => {
    const uid = m.id as string;
    const bal = balMap.get(uid);
    const list = (byUser.get(uid) ?? []).sort((a, b) => a.date.localeCompare(b.date));

    // 종일=1칸, 반차는 2건이 1칸 (엑셀의 대각선 분할과 동일)
    const cells: LeaveGridCell[] = [];
    let pendingHalf: { date: string; borrowed: boolean } | null = null;
    for (const e of list) {
      if (e.portion === "full") {
        cells.push({ top: e.date, bottom: null, half: false, borrowed: e.borrowed });
      } else if (pendingHalf === null) {
        pendingHalf = { date: e.date, borrowed: e.borrowed };
      } else {
        cells.push({
          top: pendingHalf.date,
          bottom: e.date,
          half: true,
          borrowed: pendingHalf.borrowed || e.borrowed,
        });
        pendingHalf = null;
      }
    }
    if (pendingHalf !== null) {
      cells.push({ top: pendingHalf.date, bottom: null, half: true, borrowed: pendingHalf.borrowed });
    }
    cells.sort((a, b) => a.top.localeCompare(b.top));

    const used = list.reduce((s, e) => s + portionDays(e.portion), 0);
    const grants = grantMap.get(uid) ?? [];
    const grantDays = grants.reduce((s, g) => s + g.days, 0);
    const baseDays = bal?.base ?? 0;
    const total = baseDays + grantDays;

    return {
      userId: uid,
      full_name: m.full_name as string,
      team,
      total,
      baseDays,
      grantDays,
      grants,
      used,
      remaining: total - used,
      periodStart: bal?.start ?? null,
      expire: bal?.end ?? null,
      confirmed: bal?.confirmed ?? true,
      balanceId: bal?.id ?? null,
      cells,
    };
  });
}
