"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireAdmin } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/utils/activity-log";
import { positionToTeam, teamToPosition, TEAMS } from "@/lib/utils/team";
import { buildLeaveGrid } from "@/lib/utils/leave-grid";
import type { Team } from "@/lib/utils/team";
import type { Position } from "@/lib/types/member";
import {
  type DayPortion,
  type LeaveType,
  type LeaveCycle,
  type LeaveEntry,
  type LeaveCalendarData,
  type LeaveBalanceView,
  type LeaveGridColumn,
  type LeaveGrant,
  type LeavePeriodOption,
  type LeaveSnapshotMeta,
  type LeaveGridSnapshot,
  type SnapshotKind,
  type LeaveDetail,
  type LeaveDetailEntry,
  type MyBalance,
  type ResolvedCycle,
  type RequestType,
  type LeaveRequestView,
  type SubmitMode,
  type LeaveLogView,
  type LeaveHistoryView,
  type HistoryAction,
  type LeaveSnapshot,
  REQUEST_TYPE_LABEL,
  HISTORY_ACTION_LABEL,
  DAY_PORTION_LABEL,
  portionDays,
  chargedToPeriod,
  resolveCycle,
  isSubmitOpen,
  kstTodayStr,
} from "@/lib/types/leave";

type ActionState = { error?: string; success?: boolean };

interface ViewerProfile {
  userId: string;
  fullName: string;
  isAdmin: boolean;
  isTeamManager: boolean;
  team: Team | null;
}

async function getViewer(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
): Promise<ViewerProfile> {
  const { data } = await supabase
    .from("profiles")
    .select("role, full_name, position")
    .eq("id", userId)
    .single();
  return {
    userId,
    fullName: data?.full_name ?? "알 수 없음",
    isAdmin: data?.role === "admin",
    isTeamManager: data?.role === "team_manager",
    team: positionToTeam(data?.position as Position | null),
  };
}

/** 팀관리자가 해당 팀을 관리할 수 있는지 (전체관리자는 모든 팀) */
function canManageTeam(viewer: ViewerProfile, team: Team | null): boolean {
  return viewer.isAdmin || (viewer.isTeamManager && team != null && team === viewer.team);
}

/** 팀관리자 권한 행동을 전체관리자에게 알림 (전체관리자 본인 행동은 제외) */
async function notifyAdminsOfManagerAction(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  viewer: ViewerProfile,
  description: string,
) {
  if (!viewer.isTeamManager) return; // 전체관리자/일반 행동은 알림 안 함
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true);
  const rows = (admins ?? []).map((a) => ({
    user_id: a.id as string,
    type: "team_manager_action",
    title: "팀관리자 활동",
    body: `${viewer.fullName}: ${description}`,
    link: "/leave",
  }));
  if (rows.length > 0) await supabase.from("notifications").insert(rows);
}

/** 팀별 신청 주기 해석 (override 없으면 기본 규칙) */
async function resolveCycleForTeam(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  yearMonth: string,
  team: Team,
) {
  const { data } = await supabase
    .from("leave_cycles")
    .select("*")
    .eq("year_month", yearMonth)
    .eq("team", team)
    .maybeSingle();
  return resolveCycle(yearMonth, (data as LeaveCycle | null) ?? null);
}

/** 팀별 신청 잠금 상태 (없으면 auto) */
async function getTeamSubmitMode(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  team: Team,
): Promise<SubmitMode> {
  const { data } = await supabase
    .from("leave_locks")
    .select("submit_mode")
    .eq("team", team)
    .maybeSingle();
  return (data?.submit_mode as SubmitMode | undefined) ?? "auto";
}

/** 차감 대상 휴가 유형 id 목록 */
/** 그 사람의 현재(active) 주기 1건 */
type ActiveBalance = {
  id: string;
  base: number;
  start: string | null;
  end: string | null;
  confirmed: boolean;
};

async function activeBalances(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userIds: string[],
): Promise<Map<string, ActiveBalance>> {
  if (userIds.length === 0) return new Map();
  const { data } = await supabase
    .from("leave_balances")
    .select("id, user_id, total_days, period_start, period_end, confirmed")
    .in("user_id", userIds)
    .eq("status", "active");
  return new Map(
    (data ?? []).map((b) => [
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
}

/** 특별연차 부여 내역 (주기별) */
async function grantsByUser(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  balanceIds: string[],
): Promise<Map<string, LeaveGrant[]>> {
  if (balanceIds.length === 0) return new Map();
  const { data } = await supabase
    .from("leave_grants")
    .select("id, user_id, days, reason, granted_date, created_at")
    .in("balance_id", balanceIds)
    .order("granted_date");
  const map = new Map<string, LeaveGrant[]>();
  for (const g of data ?? []) {
    const uid = g.user_id as string;
    const list = map.get(uid) ?? [];
    list.push({
      id: g.id as string,
      user_id: uid,
      days: Number(g.days ?? 0),
      reason: (g.reason as string) ?? "",
      granted_date: g.granted_date as string,
      created_at: g.created_at as string,
    });
    map.set(uid, list);
  }
  return map;
}

const sumGrants = (list: LeaveGrant[] | undefined): number =>
  (list ?? []).reduce((s, g) => s + g.days, 0);

async function deductTypeIds(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
): Promise<string[]> {
  const { data } = await supabase
    .from("leave_types")
    .select("id")
    .eq("deducts_balance", true);
  return (data ?? []).map((r) => r.id as string);
}

// ---------------------------------------------------------------------------
// 잔여 회계 — 등록/수정/요청승인 세 경로가 모두 이 게이트를 통과해야 한다
// ---------------------------------------------------------------------------

const addYearsIso = (iso: string, years: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
};
const addDaysIso = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

type PeriodRow = { id: string; base: number; start: string; end: string };
/** unset = 연차 주기를 한 번도 설정한 적 없는 사람 / outside = 주기는 있으나 그 날짜를 못 담음 */
type PeriodLookup =
  | { kind: "found"; period: PeriodRow }
  | { kind: "unset" }
  | { kind: "outside" };

/**
 * 그 날짜가 속한 연차 주기를 찾는다. 없고 바로 다음 주기에 해당하면 미리 만든다(scheduled).
 * 신청주기가 "전달 1~10일"이라 다음 달 연차를 미리 신청하는데, 그 날짜가 현재 주기를
 * 넘어가면 어느 주기에도 안 잡혀 사용 집계에서 빠지는 문제를 막는다.
 */
async function periodForDate(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  date: string,
): Promise<PeriodLookup> {
  // 겹치는 주기가 있어도 죽지 않도록 maybeSingle 대신 최신 1건
  const { data: hits } = await supabase
    .from("leave_balances")
    .select("id, total_days, period_start, period_end")
    .eq("user_id", userId)
    .lte("period_start", date)
    .gte("period_end", date)
    .order("period_start", { ascending: false })
    .limit(1);
  const hit = hits?.[0];
  if (hit) {
    return {
      kind: "found",
      period: {
        id: hit.id as string,
        base: Number(hit.total_days ?? 0),
        start: hit.period_start as string,
        end: hit.period_end as string,
      },
    };
  }

  // 가장 최근 주기 뒤로 한 주기만 굴려 본다
  const { data: latestRows } = await supabase
    .from("leave_balances")
    .select("total_days, period_end")
    .eq("user_id", userId)
    .not("period_end", "is", null)
    .order("period_end", { ascending: false })
    .limit(1);
  const latest = latestRows?.[0];
  if (!latest) return { kind: "unset" };

  const start = addDaysIso(latest.period_end as string, 1);
  const end = addDaysIso(addYearsIso(start, 1), -1);
  // 너무 먼 미래·과거는 만들지 않는다 (오타 방지) — 바로 다음 주기까지만
  if (date > end || date < start) return { kind: "outside" };

  const { data: created, error } = await supabase
    .from("leave_balances")
    .insert({
      user_id: userId,
      total_days: Number(latest.total_days ?? 0),
      period_start: start,
      period_end: end,
      status: "scheduled",
      confirmed: false, // 관리자 확인 대기
    })
    .select("id, total_days, period_start, period_end")
    .maybeSingle();

  if (error || !created) {
    // 동시 생성 경합 → 이미 만들어진 것을 다시 읽는다
    const { data: retry } = await supabase
      .from("leave_balances")
      .select("id, total_days, period_start, period_end")
      .eq("user_id", userId)
      .eq("period_start", start)
      .maybeSingle();
    if (!retry) return { kind: "outside" };
    return {
      kind: "found",
      period: {
        id: retry.id as string,
        base: Number(retry.total_days ?? 0),
        start: retry.period_start as string,
        end: retry.period_end as string,
      },
    };
  }
  return {
    kind: "found",
    period: {
      id: created.id as string,
      base: Number(created.total_days ?? 0),
      start: created.period_start as string,
      end: created.period_end as string,
    },
  };
}

/**
 * 잔여 초과 여부 검사. 통과하면 null, 막아야 하면 사유 문자열.
 * 미차감 유형(병가·경조사 등)은 총량과 무관하므로 통과시킨다.
 *
 * ⚠ service_role 클라이언트로 도는 이유:
 *  - leave_balances 쓰기는 RLS 상 admin 전용 → 직원이 다음 달 연차를 미리 신청할 때
 *    scheduled 주기 생성이 막힌다.
 *  - leave_balances 읽기는 "본인 또는 admin" → 팀관리자가 팀원 연차를 등록하면
 *    주기를 못 읽어 검사가 조용히 통과된다.
 * 호출자(createLeaveEntry / updateLeaveEntry / approveLeaveRequest)가 이미
 * canManageTeam 등으로 권한을 검증한 뒤에만 부른다.
 */
async function checkQuota(input: {
  targetUserId: string;
  leaveDate: string;
  dayPortion: DayPortion;
  leaveTypeId: string;
  excludeEntryId?: string;
  /** 선사용(가불) — 차감할 주기를 명시 지정 */
  chargeBalanceId?: string | null;
}): Promise<string | null> {
  const supabase = createAdminClient();
  const deductIds = await deductTypeIds(supabase);
  if (!deductIds.includes(input.leaveTypeId)) return null; // 차감 안 하는 휴가

  let period: PeriodRow;
  if (input.chargeBalanceId) {
    // 지정된 주기가 정말 그 사람 것인지 확인 (남의 주기로 떠넘기기 방지)
    const { data: row } = await supabase
      .from("leave_balances")
      .select("id, total_days, period_start, period_end, user_id")
      .eq("id", input.chargeBalanceId)
      .maybeSingle();
    if (!row || row.user_id !== input.targetUserId) {
      return "지정한 차감 주기가 올바르지 않습니다.";
    }
    period = {
      id: row.id as string,
      base: Number(row.total_days ?? 0),
      start: row.period_start as string,
      end: row.period_end as string,
    };
  } else {
    const lookup = await periodForDate(supabase, input.targetUserId, input.leaveDate);
    // 연차 주기를 아직 설정하지 않은 사람(미임포트 팀 등)은 기존처럼 통과시킨다.
    // 여기서 막으면 잔여가 설정된 적 없는 팀 전체가 신청 불가가 된다.
    if (lookup.kind === "unset") return null;
    if (lookup.kind === "outside") {
      return (
        "해당 날짜를 포함하는 연차 주기가 없습니다. " +
        "다른 주기에서 당겨 쓰려면 관리자가 '차감 주기'를 지정해야 합니다."
      );
    }
    period = lookup.period;
  }

  // 이 주기에서 이미 쓴 양 (수정 중이면 자기 자신은 제외)
  // 선사용(balance_id 지정) 항목은 날짜 범위 밖에 있으므로 전 기간을 읽고 JS 에서 판정
  let q = supabase
    .from("leave_entries")
    .select("id, leave_date, day_portion, balance_id")
    .eq("user_id", input.targetUserId)
    .in("leave_type_id", deductIds);
  if (input.excludeEntryId) q = q.neq("id", input.excludeEntryId);
  const { data: used } = await q;
  const usedDays = (used ?? [])
    .filter((e) =>
      chargedToPeriod(
        { leave_date: e.leave_date as string, balance_id: e.balance_id as string | null },
        period,
      ),
    )
    .reduce((s, e) => s + portionDays(e.day_portion as DayPortion), 0);

  const { data: grantRows } = await supabase
    .from("leave_grants")
    .select("days")
    .eq("balance_id", period.id);
  const grantDays = (grantRows ?? []).reduce((s, g) => s + Number(g.days ?? 0), 0);

  const total = period.base + grantDays;
  const need = portionDays(input.dayPortion);
  if (usedDays + need > total) {
    const left = total - usedDays;
    return (
      `잔여 연차가 부족합니다. (${period.start}~${period.end} 주기 · 총 ${total}일 · ` +
      `사용 ${usedDays}일 · 잔여 ${left}일, 필요 ${need}일)` +
      ` 특별연차를 부여하거나 총 일수를 조정해주세요.`
    );
  }
  return null;
}

/** 유니크 인덱스 위반(23505)을 사용자 문구로 */
const isDuplicateEntry = (message: string): boolean =>
  message.includes("leave_entries_user_date_portion_uniq") || message.includes("duplicate key");

// ---------------------------------------------------------------------------
// 조회: 연차종합 달력
// ---------------------------------------------------------------------------

export async function fetchLeaveCalendar(
  yearMonth: string,
  teamParam?: Team,
): Promise<{ error?: string; data?: LeaveCalendarData }> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);

  const effectiveTeam: Team | null = viewer.isAdmin
    ? teamParam ?? viewer.team ?? "vet"
    : viewer.team;

  if (!effectiveTeam) {
    return { error: "연차 대상 팀이 없습니다. 직책(수의사/매니저/테크니션)이 설정되어야 합니다." };
  }

  // 팀 구성원
  const { data: memberRows } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)
    .eq("position", teamToPosition(effectiveTeam))
    .order("full_name");
  const members = (memberRows ?? []).map((m) => ({ id: m.id as string, full_name: m.full_name as string }));

  // 팀별 cycle override
  const cycle = await resolveCycleForTeam(supabase, yearMonth, effectiveTeam);

  // 이 팀의 해당 주기 범위 내 연차 항목
  const { data: entryRows } = await supabase
    .from("leave_entries")
    .select("*")
    .eq("team", effectiveTeam)
    .gte("leave_date", cycle.leave_start)
    .lte("leave_date", cycle.leave_end)
    .order("leave_date");
  const entries = (entryRows ?? []) as LeaveEntry[];

  // 활성 휴가 유형
  const { data: typeRows } = await supabase
    .from("leave_types")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  const leaveTypes = (typeRows ?? []) as LeaveType[];

  const today = kstTodayStr();
  const canManage = canManageTeam(viewer, effectiveTeam);
  let canSubmit: boolean;
  if (canManage) {
    canSubmit = true;
  } else {
    const mode = await getTeamSubmitMode(supabase, effectiveTeam);
    canSubmit = mode === "open" ? true : mode === "locked" ? false : isSubmitOpen(cycle, today);
  }

  // 내 잔여 (본인만)
  const myBalance = await computeMyBalance(supabase, userId, leaveTypes);

  return {
    data: {
      team: effectiveTeam,
      members,
      entries,
      leaveTypes,
      cycle,
      canSubmit,
      isAdmin: viewer.isAdmin,
      canManage,
      availableTeams: viewer.isAdmin ? TEAMS : [effectiveTeam],
      myBalance,
      currentUserId: userId,
    },
  };
}

async function computeMyBalance(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  leaveTypes: LeaveType[],
): Promise<MyBalance | null> {
  const bal = (await activeBalances(supabase, [userId])).get(userId) ?? null;

  const deductIds = leaveTypes.filter((t) => t.deducts_balance).map((t) => t.id);
  const used = await sumUsed(supabase, userId, deductIds, bal);

  // 총 연차 = 기본 부여 + 특별연차
  const grants = bal ? (await grantsByUser(supabase, [bal.id])).get(userId) : undefined;
  const total = (bal?.base ?? 0) + sumGrants(grants);
  return {
    total,
    used,
    remaining: total - used,
    period_start: bal?.start ?? null,
    period_end: bal?.end ?? null,
  };
}

/** 특정 사용자가 그 주기에서 차감한 일수 합계 (선사용 balance_id 포함) */
async function sumUsed(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  deductIds: string[],
  period: { id: string; start: string | null; end: string | null } | null,
): Promise<number> {
  if (deductIds.length === 0 || !period) return 0;
  // 날짜 범위 밖이라도 balance_id 로 이 주기에 걸린 항목이 있으므로 전 기간을 읽고 JS 에서 판정
  const { data } = await supabase
    .from("leave_entries")
    .select("leave_date, day_portion, balance_id")
    .eq("user_id", userId)
    .in("leave_type_id", deductIds);
  return (data ?? [])
    .filter((r) =>
      chargedToPeriod(
        { leave_date: r.leave_date as string, balance_id: r.balance_id as string | null },
        period,
      ),
    )
    .reduce((sum, r) => sum + portionDays(r.day_portion as DayPortion), 0);
}

// ---------------------------------------------------------------------------
// 등록 / 삭제
// ---------------------------------------------------------------------------

export async function createLeaveEntry(input: {
  leaveDate: string;
  leaveTypeId: string;
  dayPortion: DayPortion;
  note?: string;
  targetUserId?: string;
  /** 선사용(가불) — 전체관리자만 지정 가능 */
  chargeBalanceId?: string | null;
}): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);
  const chargeBalanceId = viewer.isAdmin ? input.chargeBalanceId || null : null;

  const targetId =
    input.targetUserId && (viewer.isAdmin || viewer.isTeamManager) ? input.targetUserId : userId;

  // 대상자의 팀
  const { data: target } = await supabase
    .from("profiles")
    .select("full_name, position")
    .eq("id", targetId)
    .single();
  const team = positionToTeam(target?.position as Position | null);
  if (!team) return { error: "대상자의 팀이 없습니다. (직책 미설정)" };

  // 다른 사람 대상 등록은 관리 권한 필요
  if (targetId !== userId && !canManageTeam(viewer, team)) {
    return { error: "권한이 없습니다." };
  }

  // 신청기간 검증 (관리자/팀관리자는 본인 팀 우회)
  if (!canManageTeam(viewer, team)) {
    const mode = await getTeamSubmitMode(supabase, team);
    if (mode === "locked") return { error: "연차 신청이 잠겨 있습니다." };
    if (mode !== "open") {
      const ym = input.leaveDate.slice(0, 7);
      const cycle = await resolveCycleForTeam(supabase, ym, team);
      if (!isSubmitOpen(cycle, kstTodayStr())) {
        return { error: "지금은 신청 기간이 아닙니다." };
      }
    }
  }

  // 중복 방지: 같은 날짜에 종일이 있거나, 동일 반차가 이미 있으면 거부
  const { data: existing } = await supabase
    .from("leave_entries")
    .select("day_portion")
    .eq("user_id", targetId)
    .eq("leave_date", input.leaveDate);
  if (existing && existing.length > 0) {
    const hasFull = existing.some((e) => e.day_portion === "full");
    const samePortion = existing.some((e) => e.day_portion === input.dayPortion);
    if (input.dayPortion === "full" || hasFull || samePortion) {
      return { error: "이미 등록된 날짜입니다." };
    }
  }

  // 잔여 초과 차단 (관리자도 예외 없음 — 초과가 필요하면 특별연차를 부여할 것)
  const quotaError = await checkQuota({
    targetUserId: targetId,
    leaveDate: input.leaveDate,
    dayPortion: input.dayPortion,
    leaveTypeId: input.leaveTypeId,
    chargeBalanceId,
  });
  if (quotaError) return { error: quotaError };

  const { error } = await supabase.from("leave_entries").insert({
    user_id: targetId,
    team,
    leave_date: input.leaveDate,
    leave_type_id: input.leaveTypeId,
    day_portion: input.dayPortion,
    note: input.note?.trim() || null,
    balance_id: chargeBalanceId,
    created_by: userId,
  });
  if (error) {
    return {
      error: isDuplicateEntry(error.message)
        ? "이미 등록된 날짜입니다."
        : `연차 등록 실패: ${error.message}`,
    };
  }

  await logActivity({
    userId,
    userName: viewer.fullName,
    category: "leave",
    action: "create_leave",
    description: `${target?.full_name ?? "?"} ${input.leaveDate} 연차 등록`,
  });
  if (targetId !== userId) {
    await notifyAdminsOfManagerAction(supabase, viewer, `${target?.full_name ?? "?"} ${input.leaveDate} 연차 등록`);
  }
  revalidatePath("/leave");
  return { success: true };
}

export async function updateLeaveEntry(input: {
  id: string;
  leaveDate: string;
  leaveTypeId: string;
  dayPortion: DayPortion;
  note?: string;
  targetUserId?: string; // 관리자만 대상자 변경 가능
  /** 선사용(가불) — 전체관리자만 지정 가능. undefined 면 기존 값 유지 */
  chargeBalanceId?: string | null;
}): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);

  const { data: entry } = await supabase
    .from("leave_entries")
    .select("user_id, leave_date, team, balance_id")
    .eq("id", input.id)
    .maybeSingle();
  if (!entry) return { error: "항목을 찾을 수 없습니다." };

  const chargeBalanceId = viewer.isAdmin
    ? input.chargeBalanceId !== undefined
      ? input.chargeBalanceId || null
      : ((entry.balance_id as string | null) ?? null)
    : ((entry.balance_id as string | null) ?? null);

  const canMngEntry = canManageTeam(viewer, entry.team as Team);
  if (!canMngEntry && entry.user_id !== userId) {
    return { error: "본인 연차만 수정할 수 있습니다." };
  }

  // 대상자: 관리자/팀관리자만 변경 가능
  const targetId =
    (viewer.isAdmin || viewer.isTeamManager) ? input.targetUserId || (entry.user_id as string) : (entry.user_id as string);

  const { data: target } = await supabase
    .from("profiles")
    .select("full_name, position")
    .eq("id", targetId)
    .single();
  const team = positionToTeam(target?.position as Position | null);
  if (!team) return { error: "대상자의 팀이 없습니다. (직책 미설정)" };

  // 다른 팀으로 옮기거나 다른 사람 대상이면 관리 권한 필요
  if (targetId !== userId && !canManageTeam(viewer, team)) {
    return { error: "권한이 없습니다." };
  }

  if (!canManageTeam(viewer, team)) {
    const mode = await getTeamSubmitMode(supabase, team);
    if (mode === "locked") return { error: "연차 신청이 잠겨 있습니다." };
    if (mode !== "open") {
      const ym = input.leaveDate.slice(0, 7);
      const cycle = await resolveCycleForTeam(supabase, ym, team);
      if (!isSubmitOpen(cycle, kstTodayStr())) {
        return { error: "지금은 신청 기간이 아닙니다." };
      }
    }
  }

  // 중복 방지 (자기 자신 제외)
  const { data: existing } = await supabase
    .from("leave_entries")
    .select("id, day_portion")
    .eq("user_id", targetId)
    .eq("leave_date", input.leaveDate)
    .neq("id", input.id);
  if (existing && existing.length > 0) {
    const hasFull = existing.some((e) => e.day_portion === "full");
    const samePortion = existing.some((e) => e.day_portion === input.dayPortion);
    if (input.dayPortion === "full" || hasFull || samePortion) {
      return { error: "이미 등록된 날짜입니다." };
    }
  }

  // 잔여 초과 차단 — 수정 중인 자기 자신은 사용량에서 제외
  const quotaError = await checkQuota({
    targetUserId: targetId,
    leaveDate: input.leaveDate,
    dayPortion: input.dayPortion,
    leaveTypeId: input.leaveTypeId,
    excludeEntryId: input.id,
    chargeBalanceId,
  });
  if (quotaError) return { error: quotaError };

  const { error } = await supabase
    .from("leave_entries")
    .update({
      user_id: targetId,
      team,
      leave_date: input.leaveDate,
      leave_type_id: input.leaveTypeId,
      day_portion: input.dayPortion,
      note: input.note?.trim() || null,
      balance_id: chargeBalanceId,
    })
    .eq("id", input.id);
  if (error) {
    return {
      error: isDuplicateEntry(error.message)
        ? "이미 등록된 날짜입니다."
        : `수정 실패: ${error.message}`,
    };
  }

  await logActivity({
    userId,
    userName: viewer.fullName,
    category: "leave",
    action: "update_leave",
    description: `${target?.full_name ?? "?"} ${input.leaveDate} 연차 수정`,
  });
  if (targetId !== userId || (entry.user_id as string) !== userId) {
    await notifyAdminsOfManagerAction(supabase, viewer, `${target?.full_name ?? "?"} ${input.leaveDate} 연차 수정`);
  }
  revalidatePath("/leave");
  return { success: true };
}

export async function deleteLeaveEntry(id: string): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);

  const { data: entry } = await supabase
    .from("leave_entries")
    .select("user_id, leave_date, team")
    .eq("id", id)
    .maybeSingle();
  if (!entry) return { error: "항목을 찾을 수 없습니다." };

  const canMng = canManageTeam(viewer, entry.team as Team);
  if (!canMng) {
    if (entry.user_id !== userId) return { error: "본인 연차만 삭제할 수 있습니다." };
    const team = entry.team as Team;
    const mode = await getTeamSubmitMode(supabase, team);
    if (mode === "locked") return { error: "연차 신청이 잠겨 있어 삭제할 수 없습니다." };
    if (mode !== "open") {
      const ym = (entry.leave_date as string).slice(0, 7);
      const cycle = await resolveCycleForTeam(supabase, ym, team);
      if (!isSubmitOpen(cycle, kstTodayStr())) {
        return { error: "신청 기간이 지나 삭제할 수 없습니다. 관리자에게 문의하세요." };
      }
    }
  }

  const { error } = await supabase.from("leave_entries").delete().eq("id", id);
  if (error) return { error: `삭제 실패: ${error.message}` };

  await logActivity({
    userId,
    userName: viewer.fullName,
    category: "leave",
    action: "delete_leave",
    description: `${entry.leave_date} 연차 삭제`,
  });
  if ((entry.user_id as string) !== userId) {
    await notifyAdminsOfManagerAction(supabase, viewer, `${entry.leave_date} 연차 삭제`);
  }
  revalidatePath("/leave");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 연차표: 잔여 현황 / 개인 상세
// ---------------------------------------------------------------------------

/** 잔여 현황 — 일반: 본인만 / 관리자: 전체(또는 팀 필터) */
export async function fetchLeaveBalances(
  teamParam?: Team,
): Promise<{ error?: string; rows?: LeaveBalanceView[] }> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);

  let memberQuery = supabase
    .from("profiles")
    .select("id, full_name, position")
    .eq("is_active", true);

  if (viewer.isAdmin) {
    const teams = teamParam ? [teamParam] : TEAMS;
    memberQuery = memberQuery.in(
      "position",
      teams.map(teamToPosition),
    );
  } else {
    // 일반 사용자: 본인만
    memberQuery = memberQuery.eq("id", userId);
  }

  const { data: memberRows } = await memberQuery.order("position").order("full_name");
  const members = (memberRows ?? []).filter((m) => positionToTeam(m.position as Position | null));
  if (members.length === 0) return { rows: [] };

  const memberIds = members.map((m) => m.id as string);

  // 현재 주기 + 특별연차
  const balMap = await activeBalances(supabase, memberIds);
  const grantMap = await grantsByUser(
    supabase,
    [...balMap.values()].map((b) => b.id),
  );

  const deductIds = await deductTypeIds(supabase);

  // 차감 항목 한 번에 조회 후 사용자별 집계
  const usedMap = new Map<string, number>();
  if (deductIds.length > 0) {
    const { data: entryRows } = await supabase
      .from("leave_entries")
      .select("user_id, day_portion, leave_date, balance_id")
      .in("user_id", memberIds)
      .in("leave_type_id", deductIds);
    for (const e of entryRows ?? []) {
      const uid = e.user_id as string;
      const bal = balMap.get(uid);
      if (!bal) continue;
      const entry = {
        leave_date: e.leave_date as string,
        balance_id: e.balance_id as string | null,
      };
      if (!chargedToPeriod(entry, bal)) continue;
      usedMap.set(uid, (usedMap.get(uid) ?? 0) + portionDays(e.day_portion as DayPortion));
    }
  }

  const rows: LeaveBalanceView[] = members.map((m) => {
    const uid = m.id as string;
    const bal = balMap.get(uid);
    const total = (bal?.base ?? 0) + sumGrants(grantMap.get(uid));
    const used = usedMap.get(uid) ?? 0;
    return {
      userId: uid,
      full_name: m.full_name as string,
      team: positionToTeam(m.position as Position | null)!,
      total,
      used,
      remaining: total - used,
      period_start: bal?.start ?? null,
      period_end: bal?.end ?? null,
    };
  });

  return { rows };
}

/**
 * 엑셀형 연차현황 (전체관리자 전용)
 * 사람 1명 = 세로 1열, 칸 1개 = 연차 1일. 반차 2건은 한 칸을 대각선으로 나눠 씀.
 */
export async function fetchLeaveGrid(
  team: Team,
): Promise<{ error?: string; columns?: LeaveGridColumn[] }> {
  await requireAdmin();
  const { supabase } = await requireUser();
  return { columns: await buildLeaveGrid(supabase, team) };
}

// ---------------------------------------------------------------------------
// 특별연차 (추가 부여) — 전체관리자 전용
// ---------------------------------------------------------------------------

/** 대체근무 보상 등으로 연차를 더 부여. days 음수면 부여 취소·정정 */
export async function createLeaveGrant(input: {
  targetUserId: string;
  days: number;
  reason: string;
  grantedDate?: string;
}): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();

  const reason = input.reason?.trim();
  if (!reason) return { error: "부여 사유를 입력해주세요." };
  if (!input.days || Number.isNaN(input.days)) return { error: "일수를 입력해주세요." };
  if (Math.abs(input.days * 2) % 1 !== 0) return { error: "0.5일 단위로만 부여할 수 있습니다." };

  const bal = (await activeBalances(supabase, [input.targetUserId])).get(input.targetUserId);
  if (!bal) return { error: "진행 중인 연차 주기가 없습니다. 먼저 연차 기간을 설정해주세요." };

  const { data: target } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", input.targetUserId)
    .single();

  const { error } = await supabase.from("leave_grants").insert({
    balance_id: bal.id,
    user_id: input.targetUserId,
    days: input.days,
    reason,
    granted_date: input.grantedDate || kstTodayStr(),
    created_by: userId,
  });
  if (error) return { error: `특별연차 부여 실패: ${error.message}` };

  await logActivity({
    userId,
    userName,
    category: "leave",
    action: "grant_leave",
    description: `${target?.full_name ?? "?"} 특별연차 ${input.days > 0 ? "+" : ""}${input.days}일 (${reason})`,
  });
  await notifyUser(
    supabase,
    input.targetUserId,
    "특별연차 부여",
    `${input.days > 0 ? "+" : ""}${input.days}일 — ${reason}`,
  );
  revalidatePath("/leave");
  return { success: true };
}

// 부여 내역 삭제 액션은 두지 않는다 — 취소는 음수 부여로만(이력 보존).
// leave_grants 는 RLS 에서도 DELETE 정책이 없어 앱 경로로는 지울 수 없다.

/** 롤오버가 자동 생성한 미확정 주기를 관리자가 확정 */
export async function confirmLeavePeriod(
  balanceId: string,
  totalDays?: number,
): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();

  const { error } = await supabase
    .from("leave_balances")
    .update({
      confirmed: true,
      ...(totalDays !== undefined ? { total_days: totalDays } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", balanceId);
  if (error) return { error: `확정 실패: ${error.message}` };

  await logActivity({
    userId,
    userName,
    category: "leave",
    action: "confirm_period",
    description: `연차 주기 확정${totalDays !== undefined ? ` (${totalDays}일)` : ""}`,
  });
  revalidatePath("/leave");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 연차표 버전 (스냅샷) — 전체관리자 전용
// ---------------------------------------------------------------------------

/** 지금 시점의 팀 연차표를 버전으로 저장 */
export async function saveLeaveSnapshot(
  team: Team,
  kind: SnapshotKind = "manual",
): Promise<ActionState> {
  const { userId, userName } = await requireAdmin();

  const { columns, error } = await fetchLeaveGrid(team);
  if (error) return { error };
  if (!columns || columns.length === 0) return { error: "저장할 내용이 없습니다." };

  const { supabase } = await requireUser();
  const { error: insErr } = await supabase.from("leave_grid_snapshots").insert({
    kind,
    snapshot_date: kstTodayStr(),
    team,
    data: columns,
    created_by: userId,
  });
  if (insErr) return { error: `저장 실패: ${insErr.message}` };

  await logActivity({
    userId,
    userName,
    category: "leave",
    action: "save_snapshot",
    description: `${team} 연차표 버전 저장 (${kstTodayStr()})`,
  });
  revalidatePath("/leave");
  return { success: true };
}

export async function fetchLeaveSnapshots(
  team: Team,
): Promise<{ error?: string; rows?: LeaveSnapshotMeta[] }> {
  await requireAdmin();
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("leave_grid_snapshots")
    .select("id, kind, snapshot_date, team, user_name, period_start, period_end, created_at")
    // 팀 단위(monthly/manual) + 그 팀 개인의 주기마감(cycle_end) 모두 team 이 채워짐
    .eq("team", team)
    .order("snapshot_date", { ascending: false })
    .limit(200);
  if (error) return { error: error.message };

  return {
    rows: (data ?? []).map((r) => ({
      id: r.id as string,
      kind: r.kind as SnapshotKind,
      snapshot_date: r.snapshot_date as string,
      team: (r.team as Team | null) ?? null,
      user_name: (r.user_name as string | null) ?? null,
      period_start: (r.period_start as string | null) ?? null,
      period_end: (r.period_end as string | null) ?? null,
      created_at: r.created_at as string,
    })),
  };
}

export async function fetchLeaveSnapshot(
  id: string,
): Promise<{ error?: string; snapshot?: LeaveGridSnapshot }> {
  await requireAdmin();
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("leave_grid_snapshots")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "버전을 찾을 수 없습니다." };

  return {
    snapshot: {
      id: data.id as string,
      kind: data.kind as SnapshotKind,
      snapshot_date: data.snapshot_date as string,
      team: (data.team as Team | null) ?? null,
      user_name: (data.user_name as string | null) ?? null,
      period_start: (data.period_start as string | null) ?? null,
      period_end: (data.period_end as string | null) ?? null,
      created_at: data.created_at as string,
      columns: (data.data as LeaveGridColumn[]) ?? [],
    },
  };
}

/**
 * 선사용(가불) 지정용 — 그 사람의 연차 주기 목록 (전체관리자 전용)
 * 날짜가 속한 주기가 기본이고, 다른 주기를 고르면 거기서 차감된다.
 */
export async function fetchLeavePeriodOptions(
  targetUserId: string,
): Promise<{ error?: string; periods?: LeavePeriodOption[] }> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);
  if (!viewer.isAdmin) return { error: "권한이 없습니다." };

  const admin = createAdminClient();
  const { data } = await admin
    .from("leave_balances")
    .select("id, period_start, period_end, total_days, status")
    .eq("user_id", targetUserId)
    .order("period_start", { ascending: false });

  return {
    periods: (data ?? []).map((b) => ({
      id: b.id as string,
      period_start: (b.period_start as string | null) ?? null,
      period_end: (b.period_end as string | null) ?? null,
      total_days: Number(b.total_days ?? 0),
      status: (b.status as LeavePeriodOption["status"]) ?? "active",
    })),
  };
}

/** 개인 상세 — 일반: 본인만 / 관리자: 임의 사용자 */
export async function fetchLeaveDetail(
  targetUserId?: string,
): Promise<{ error?: string; detail?: LeaveDetail }> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);

  const targetId = targetUserId && viewer.isAdmin ? targetUserId : userId;
  if (targetId !== userId && !viewer.isAdmin) {
    return { error: "권한이 없습니다." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, position")
    .eq("id", targetId)
    .single();

  const bal = (await activeBalances(supabase, [targetId])).get(targetId) ?? null;
  const grants = bal ? (await grantsByUser(supabase, [bal.id])).get(targetId) : undefined;

  const { data: entryRows } = await supabase
    .from("leave_entries")
    .select("id, leave_date, day_portion, note, balance_id, leave_types(name, deducts_balance)")
    .eq("user_id", targetId)
    .order("leave_date", { ascending: false });

  const entries: LeaveDetailEntry[] = (entryRows ?? []).map((e) => {
    const lt = e.leave_types as unknown as { name: string; deducts_balance: boolean } | null;
    return {
      id: e.id as string,
      leave_date: e.leave_date as string,
      day_portion: e.day_portion as DayPortion,
      type_name: lt?.name ?? "?",
      deducts: lt?.deducts_balance ?? false,
      note: (e.note as string | null) ?? null,
      // 날짜는 다른 주기인데 이번 주기에서 당겨 쓴 항목
      borrowed: !!e.balance_id && !!bal && e.balance_id === bal.id,
      balance_id: (e.balance_id as string | null) ?? null,
    };
  });

  // 총 연차 = 기본 부여 + 특별연차
  const total = (bal?.base ?? 0) + sumGrants(grants);
  const used = entries
    .filter((e) => e.deducts && bal && chargedToPeriod(e, bal))
    .reduce((sum, e) => sum + portionDays(e.day_portion), 0);

  return {
    detail: {
      userId: targetId,
      full_name: profile?.full_name ?? "?",
      team: positionToTeam(profile?.position as Position | null),
      total,
      used,
      remaining: total - used,
      period_start: bal?.start ?? null,
      period_end: bal?.end ?? null,
      grants: grants ?? [],
      entries,
    },
  };
}

// ---------------------------------------------------------------------------
// 관리자: 주기(cycle) 설정 / 잔여 설정 / 휴가유형 관리
// ---------------------------------------------------------------------------

/** 특정 월·팀의 적용 중인 주기(override 반영) — 설정 화면 프리필용 */
export async function fetchLeaveCycle(
  yearMonth: string,
  team: Team,
): Promise<{ error?: string; cycle?: ResolvedCycle }> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);
  if (!viewer.isAdmin && !viewer.isTeamManager) return { error: "권한이 없습니다." };
  return { cycle: await resolveCycleForTeam(supabase, yearMonth, team) };
}

export async function upsertLeaveCycle(input: {
  yearMonth: string;
  team: Team;
  leaveStart: string;
  leaveEnd: string;
  submitStart: string;
  submitEnd: string;
}): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);
  if (!canManageTeam(viewer, input.team)) return { error: "권한이 없습니다." };

  if (input.leaveStart > input.leaveEnd) return { error: "연차 기간 시작일이 종료일보다 늦습니다." };
  if (input.submitStart > input.submitEnd) return { error: "신청 기간 시작일이 종료일보다 늦습니다." };

  const { error } = await supabase
    .from("leave_cycles")
    .upsert(
      {
        year_month: input.yearMonth,
        team: input.team,
        leave_start: input.leaveStart,
        leave_end: input.leaveEnd,
        submit_start: input.submitStart,
        submit_end: input.submitEnd,
        created_by: userId,
      },
      { onConflict: "year_month,team" },
    );
  if (error) return { error: `주기 설정 실패: ${error.message}` };

  await logActivity({
    userId,
    userName: viewer.fullName,
    category: "leave",
    action: "set_cycle",
    description: `${input.yearMonth} ${input.team} 연차 주기 설정`,
  });
  await notifyAdminsOfManagerAction(supabase, viewer, `${input.yearMonth} ${input.team} 연차 주기 설정`);
  revalidatePath("/leave");
  return { success: true };
}

/** 주기 override 삭제 → 기본 규칙으로 복귀 */
export async function resetLeaveCycle(yearMonth: string, team: Team): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);
  if (!canManageTeam(viewer, team)) return { error: "권한이 없습니다." };
  const { error } = await supabase
    .from("leave_cycles")
    .delete()
    .eq("year_month", yearMonth)
    .eq("team", team);
  if (error) return { error: `초기화 실패: ${error.message}` };
  await logActivity({
    userId,
    userName: viewer.fullName,
    category: "leave",
    action: "reset_cycle",
    description: `${yearMonth} ${team} 연차 주기 기본값 복귀`,
  });
  await notifyAdminsOfManagerAction(supabase, viewer, `${yearMonth} ${team} 연차 주기 기본값 복귀`);
  revalidatePath("/leave");
  return { success: true };
}

export async function setLeaveBalance(input: {
  targetUserId: string;
  totalDays: number;
  periodStart?: string | null;
  periodEnd?: string | null;
}): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();

  const { data: target } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", input.targetUserId)
    .single();

  // user_id 단독 UNIQUE 가 제거돼 upsert 불가 — active 주기가 있으면 UPDATE, 없으면 INSERT
  const existing = (await activeBalances(supabase, [input.targetUserId])).get(input.targetUserId);
  const payload = {
    total_days: input.totalDays,
    period_start: input.periodStart || null,
    period_end: input.periodEnd || null,
    confirmed: true, // 관리자가 직접 만졌으므로 확정 처리
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await supabase.from("leave_balances").update(payload).eq("id", existing.id)
    : await supabase
        .from("leave_balances")
        .insert({ ...payload, user_id: input.targetUserId, status: "active" });
  if (error) return { error: `잔여 연차 설정 실패: ${error.message}` };

  await logActivity({
    userId,
    userName,
    category: "leave",
    action: "set_balance",
    description: `${target?.full_name ?? "?"} 연차 ${input.totalDays}일 설정`,
  });
  revalidatePath("/leave");
  return { success: true };
}

export async function fetchLeaveTypesAll(): Promise<{ error?: string; types?: LeaveType[] }> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("leave_types")
    .select("*")
    .order("sort_order");
  if (error) return { error: error.message };
  return { types: (data ?? []) as LeaveType[] };
}

export async function createLeaveType(input: {
  name: string;
  deductsBalance: boolean;
}): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();
  const name = input.name.trim();
  if (!name) return { error: "유형명을 입력해주세요." };

  const { data: maxRow } = await supabase
    .from("leave_types")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { error } = await supabase
    .from("leave_types")
    .insert({ name, deducts_balance: input.deductsBalance, sort_order: nextOrder });
  if (error) {
    if (error.code === "23505") return { error: "이미 존재하는 유형명입니다." };
    return { error: `유형 추가 실패: ${error.message}` };
  }

  await logActivity({
    userId,
    userName,
    category: "leave",
    action: "create_type",
    description: `휴가유형 '${name}' 추가 (차감 ${input.deductsBalance ? "O" : "X"})`,
  });
  revalidatePath("/leave");
  return { success: true };
}

export async function updateLeaveType(input: {
  id: string;
  name: string;
  deductsBalance: boolean;
  isActive: boolean;
}): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();
  const name = input.name.trim();
  if (!name) return { error: "유형명을 입력해주세요." };

  const { error } = await supabase
    .from("leave_types")
    .update({ name, deducts_balance: input.deductsBalance, is_active: input.isActive })
    .eq("id", input.id);
  if (error) {
    if (error.code === "23505") return { error: "이미 존재하는 유형명입니다." };
    return { error: `유형 수정 실패: ${error.message}` };
  }

  await logActivity({
    userId,
    userName,
    category: "leave",
    action: "update_type",
    description: `휴가유형 '${name}' 수정`,
  });
  revalidatePath("/leave");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 수정요청 (변경요청 워크플로)
// ---------------------------------------------------------------------------

function entryLabel(date: string, typeName: string, portion: DayPortion): string {
  const [, mm, dd] = date.split("-");
  const tag = portion === "full" ? "" : ` ${DAY_PORTION_LABEL[portion]}`;
  return `${Number(mm)}/${Number(dd)} ${typeName}${tag}`;
}

async function notifyAdmins(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  title: string,
  body: string,
) {
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true);
  const rows = (admins ?? []).map((a) => ({
    user_id: a.id as string,
    type: "leave_request",
    title,
    body,
    link: "/leave",
  }));
  if (rows.length > 0) await supabase.from("notifications").insert(rows);
}

async function notifyUser(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  recipientId: string,
  title: string,
  body: string,
) {
  if (!recipientId) return;
  await supabase.from("notifications").insert({
    user_id: recipientId,
    type: "leave_request_handled",
    title,
    body,
    link: "/leave",
  });
}

/** 활성 휴가 유형 (요청 폼용 — 직원 접근 가능) */
/** 팀별 신청 잠금 상태 전체 (설정 화면용) */
export async function fetchLeaveLocks(): Promise<{ modes: Record<string, SubmitMode> }> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);
  if (!viewer.isAdmin && !viewer.isTeamManager) return { modes: {} };
  const { data } = await supabase.from("leave_locks").select("team, submit_mode");
  const modes: Record<string, SubmitMode> = {};
  for (const r of data ?? []) modes[r.team as string] = r.submit_mode as SubmitMode;
  return { modes };
}

export async function setLeaveLock(team: Team, mode: SubmitMode): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);
  if (!canManageTeam(viewer, team)) return { error: "권한이 없습니다." };
  const { error } = await supabase
    .from("leave_locks")
    .upsert(
      { team, submit_mode: mode, updated_by: userId, updated_at: new Date().toISOString() },
      { onConflict: "team" },
    );
  if (error) return { error: `잠금 설정 실패: ${error.message}` };
  await logActivity({
    userId,
    userName: viewer.fullName,
    category: "leave",
    action: "set_lock",
    description: `${team} 신청 상태 → ${mode}`,
  });
  await notifyAdminsOfManagerAction(supabase, viewer, `${team} 신청 상태 → ${mode}`);
  revalidatePath("/leave");
  return { success: true };
}

export async function fetchActiveLeaveTypes(): Promise<{ types: LeaveType[] }> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("leave_types")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  return { types: (data ?? []) as LeaveType[] };
}

export async function createLeaveRequest(input: {
  requestType: RequestType;
  targetEntryId?: string;
  leaveDate?: string;
  leaveTypeId?: string;
  dayPortion?: DayPortion;
  reason: string;
}): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);

  const reason = input.reason?.trim();
  if (!reason) return { error: "사유를 입력해주세요." };

  const team = viewer.team;
  if (!team) return { error: "연차 대상 팀이 없습니다. (직책 미설정)" };

  let targetLabel: string | null = null;

  if (input.requestType === "modify" || input.requestType === "delete") {
    if (!input.targetEntryId) return { error: "대상 연차를 선택해주세요." };
    const { data: tgt } = await supabase
      .from("leave_entries")
      .select("user_id, leave_date, day_portion, leave_types(name)")
      .eq("id", input.targetEntryId)
      .maybeSingle();
    if (!tgt) return { error: "대상 연차를 찾을 수 없습니다." };
    if (!viewer.isAdmin && tgt.user_id !== userId) {
      return { error: "본인 연차에 대해서만 요청할 수 있습니다." };
    }
    const tn = (tgt.leave_types as unknown as { name: string } | null)?.name ?? "연차";
    targetLabel = entryLabel(tgt.leave_date as string, tn, tgt.day_portion as DayPortion);
  }

  if (input.requestType === "add" || input.requestType === "modify") {
    if (!input.leaveDate || !input.leaveTypeId || !input.dayPortion) {
      return { error: "희망 날짜·종류·구분을 입력해주세요." };
    }
  }

  const isDelete = input.requestType === "delete";
  const { error } = await supabase.from("leave_requests").insert({
    requester_id: userId,
    team,
    request_type: input.requestType,
    target_entry_id: input.targetEntryId ?? null,
    target_label: targetLabel,
    leave_date: isDelete ? null : input.leaveDate ?? null,
    leave_type_id: isDelete ? null : input.leaveTypeId ?? null,
    day_portion: isDelete ? null : input.dayPortion ?? null,
    reason,
    created_by: userId,
  });
  if (error) return { error: `요청 등록 실패: ${error.message}` };

  await notifyAdmins(
    supabase,
    `연차 수정요청 (${REQUEST_TYPE_LABEL[input.requestType]})`,
    `${viewer.fullName}: ${reason}`,
  );
  await logActivity({
    userId,
    userName: viewer.fullName,
    category: "leave",
    action: "create_request",
    description: `연차 수정요청(${REQUEST_TYPE_LABEL[input.requestType]})`,
  });
  revalidatePath("/leave");
  return { success: true };
}

export async function fetchLeaveRequests(
  status: "pending" | "all" = "all",
  team?: Team,
): Promise<{ error?: string; rows?: LeaveRequestView[] }> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);

  let q = supabase.from("leave_requests").select("*").order("created_at", { ascending: false });
  if (viewer.isAdmin) {
    if (team) q = q.eq("team", team);
  } else if (viewer.isTeamManager && viewer.team) {
    q = q.eq("team", viewer.team);
  } else {
    q = q.eq("requester_id", userId);
  }
  if (status === "pending") q = q.eq("status", "pending");

  const { data, error } = await q;
  if (error) return { error: error.message };
  const reqs = data ?? [];

  const reqIds = [...new Set(reqs.map((r) => r.requester_id as string))];
  const nameMap = new Map<string, string>();
  if (reqIds.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", reqIds);
    for (const p of profs ?? []) nameMap.set(p.id as string, p.full_name as string);
  }
  const { data: types } = await supabase.from("leave_types").select("id, name");
  const typeMap = new Map<string, string>();
  for (const t of types ?? []) typeMap.set(t.id as string, t.name as string);

  const rows: LeaveRequestView[] = reqs.map((r) => ({
    id: r.id as string,
    requester_id: r.requester_id as string,
    requester_name: nameMap.get(r.requester_id as string) ?? "?",
    team: r.team as Team,
    request_type: r.request_type as RequestType,
    target_label: (r.target_label as string | null) ?? null,
    leave_date: (r.leave_date as string | null) ?? null,
    type_name: r.leave_type_id ? typeMap.get(r.leave_type_id as string) ?? null : null,
    day_portion: (r.day_portion as DayPortion | null) ?? null,
    reason: r.reason as string,
    status: r.status as LeaveRequestView["status"],
    admin_note: (r.admin_note as string | null) ?? null,
    handled_at: (r.handled_at as string | null) ?? null,
    created_at: r.created_at as string,
  }));
  return { rows };
}

export async function fetchLeaveRequestCount(): Promise<number> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);
  let q = supabase
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (viewer.isAdmin) {
    // 전체
  } else if (viewer.isTeamManager && viewer.team) {
    q = q.eq("team", viewer.team);
  } else {
    q = q.eq("requester_id", userId);
  }
  const { count } = await q;
  return count ?? 0;
}

/** 본인이 낸 대기 중 요청 철회 (전체관리자는 임의 삭제 가능) */
export async function cancelLeaveRequest(id: string): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);

  const { data: req } = await supabase
    .from("leave_requests")
    .select("requester_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!req) return { error: "요청을 찾을 수 없습니다." };

  if (!viewer.isAdmin) {
    if (req.requester_id !== userId) return { error: "본인 요청만 취소할 수 있습니다." };
    if (req.status !== "pending") return { error: "이미 처리된 요청은 취소할 수 없습니다." };
  }

  const { error } = await supabase.from("leave_requests").delete().eq("id", id);
  if (error) return { error: `취소 실패: ${error.message}` };
  revalidatePath("/leave");
  return { success: true };
}

export async function approveLeaveRequest(id: string): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);

  const { data: req } = await supabase.from("leave_requests").select("*").eq("id", id).maybeSingle();
  if (!req) return { error: "요청을 찾을 수 없습니다." };
  if (req.status !== "pending") return { error: "이미 처리된 요청입니다." };
  if (!canManageTeam(viewer, req.team as Team)) return { error: "권한이 없습니다." };

  if (req.request_type === "add") {
    const { data: existing } = await supabase
      .from("leave_entries")
      .select("day_portion")
      .eq("user_id", req.requester_id)
      .eq("leave_date", req.leave_date);
    if (existing && existing.length > 0) {
      const hasFull = existing.some((e) => e.day_portion === "full");
      const samePortion = existing.some((e) => e.day_portion === req.day_portion);
      if (req.day_portion === "full" || hasFull || samePortion) {
        return { error: "해당 날짜에 이미 연차가 있어 추가할 수 없습니다." };
      }
    }
    // 승인 경로도 잔여 검사를 통과해야 한다 (직접 등록과 동일 기준)
    const quotaError = await checkQuota({
      targetUserId: req.requester_id as string,
      leaveDate: req.leave_date as string,
      dayPortion: req.day_portion as DayPortion,
      leaveTypeId: req.leave_type_id as string,
    });
    if (quotaError) return { error: quotaError };

    const { error } = await supabase.from("leave_entries").insert({
      user_id: req.requester_id,
      team: req.team,
      leave_date: req.leave_date,
      leave_type_id: req.leave_type_id,
      day_portion: req.day_portion,
      created_by: userId,
    });
    if (error) {
      return {
        error: isDuplicateEntry(error.message)
          ? "해당 날짜에 이미 연차가 있어 추가할 수 없습니다."
          : `반영 실패: ${error.message}`,
      };
    }
  } else if (req.request_type === "modify") {
    if (!req.target_entry_id) return { error: "원본 연차가 없어 반영할 수 없습니다." };
    const { data: tgt } = await supabase
      .from("leave_entries")
      .select("id")
      .eq("id", req.target_entry_id)
      .maybeSingle();
    if (!tgt) return { error: "원본 연차가 이미 삭제되었습니다." };
    const quotaError = await checkQuota({
      targetUserId: req.requester_id as string,
      leaveDate: req.leave_date as string,
      dayPortion: req.day_portion as DayPortion,
      leaveTypeId: req.leave_type_id as string,
      excludeEntryId: req.target_entry_id as string,
    });
    if (quotaError) return { error: quotaError };

    const { error } = await supabase
      .from("leave_entries")
      .update({
        leave_date: req.leave_date,
        leave_type_id: req.leave_type_id,
        day_portion: req.day_portion,
      })
      .eq("id", req.target_entry_id);
    if (error) {
      return {
        error: isDuplicateEntry(error.message)
          ? "해당 날짜에 이미 연차가 있어 변경할 수 없습니다."
          : `반영 실패: ${error.message}`,
      };
    }
  } else {
    if (req.target_entry_id) {
      const { error } = await supabase.from("leave_entries").delete().eq("id", req.target_entry_id);
      if (error) return { error: `반영 실패: ${error.message}` };
    }
  }

  await supabase
    .from("leave_requests")
    .update({ status: "approved", handled_by: userId, handled_at: new Date().toISOString() })
    .eq("id", id);
  await notifyUser(
    supabase,
    req.requester_id as string,
    "연차 수정요청 승인",
    `${REQUEST_TYPE_LABEL[req.request_type as RequestType]} 요청이 승인되어 반영되었습니다.`,
  );
  await logActivity({
    userId,
    userName: viewer.fullName,
    category: "leave",
    action: "approve_request",
    description: `연차 수정요청 승인(${REQUEST_TYPE_LABEL[req.request_type as RequestType]})`,
  });
  await notifyAdminsOfManagerAction(
    supabase,
    viewer,
    `연차 수정요청 승인(${REQUEST_TYPE_LABEL[req.request_type as RequestType]})`,
  );
  revalidatePath("/leave");
  return { success: true };
}

export async function rejectLeaveRequest(id: string, adminNote?: string): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const viewer = await getViewer(supabase, userId);

  const { data: req } = await supabase
    .from("leave_requests")
    .select("requester_id, request_type, status, team")
    .eq("id", id)
    .maybeSingle();
  if (!req) return { error: "요청을 찾을 수 없습니다." };
  if (req.status !== "pending") return { error: "이미 처리된 요청입니다." };
  if (!canManageTeam(viewer, req.team as Team)) return { error: "권한이 없습니다." };

  const note = adminNote?.trim() || null;
  await supabase
    .from("leave_requests")
    .update({ status: "rejected", admin_note: note, handled_by: userId, handled_at: new Date().toISOString() })
    .eq("id", id);
  await notifyUser(
    supabase,
    req.requester_id as string,
    "연차 수정요청 반려",
    note ? `반려 사유: ${note}` : "요청이 반려되었습니다.",
  );
  await logActivity({
    userId,
    userName: viewer.fullName,
    category: "leave",
    action: "reject_request",
    description: "연차 수정요청 반려",
  });
  await notifyAdminsOfManagerAction(supabase, viewer, "연차 수정요청 반려");
  revalidatePath("/leave");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 로그 / 버전이력 / 복구 (관리자 전용)
// ---------------------------------------------------------------------------

export async function fetchLeaveLogs(limit = 100): Promise<{ rows: LeaveLogView[] }> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("activity_logs")
    .select("id, user_name, action, description, created_at")
    .eq("category", "leave")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows: LeaveLogView[] = (data ?? []).map((r) => ({
    id: r.id as string,
    user_name: (r.user_name as string) ?? "?",
    action: (r.action as string) ?? "",
    description: (r.description as string) ?? "",
    created_at: r.created_at as string,
  }));
  return { rows };
}

type EntrySnapshot = {
  id?: string;
  user_id?: string;
  team?: string;
  leave_date?: string;
  leave_type_id?: string;
  day_portion?: DayPortion;
  note?: string | null;
  created_by?: string;
};

export async function fetchLeaveEntryHistory(limit = 100): Promise<{ rows: LeaveHistoryView[] }> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("leave_entry_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  const hist = data ?? [];

  // 이름·유형 맵
  const userIds = new Set<string>();
  for (const h of hist) {
    const o = h.old_data as EntrySnapshot | null;
    const n = h.new_data as EntrySnapshot | null;
    if (o?.user_id) userIds.add(o.user_id);
    if (n?.user_id) userIds.add(n.user_id);
    if (h.actor_id) userIds.add(h.actor_id as string);
  }
  const nameMap = new Map<string, string>();
  if (userIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...userIds]);
    for (const p of profs ?? []) nameMap.set(p.id as string, p.full_name as string);
  }
  const { data: types } = await supabase.from("leave_types").select("id, name");
  const typeMap = new Map<string, string>();
  for (const t of types ?? []) typeMap.set(t.id as string, t.name as string);

  const snap = (d: EntrySnapshot | null): LeaveSnapshot | null => {
    if (!d || !d.leave_date) return null;
    return {
      member_name: nameMap.get(d.user_id ?? "") ?? "?",
      leave_date: d.leave_date,
      type_name: typeMap.get(d.leave_type_id ?? "") ?? "연차",
      day_portion: (d.day_portion as DayPortion) ?? "full",
    };
  };

  const rows: LeaveHistoryView[] = hist.map((h) => {
    const action = h.action as HistoryAction;
    return {
      id: h.id as string,
      action,
      actor_name: nameMap.get((h.actor_id as string) ?? "") ?? "?",
      created_at: h.created_at as string,
      before: snap(h.old_data as EntrySnapshot | null),
      after: snap(h.new_data as EntrySnapshot | null),
      canRestore: action === "delete" || action === "update",
    };
  });
  return { rows };
}

export async function restoreLeaveHistory(historyId: string): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();

  const { data: h } = await supabase
    .from("leave_entry_history")
    .select("*")
    .eq("id", historyId)
    .maybeSingle();
  if (!h) return { error: "이력을 찾을 수 없습니다." };

  const action = h.action as HistoryAction;
  const old = h.old_data as EntrySnapshot | null;

  const restoreRow = (d: EntrySnapshot) => ({
    user_id: d.user_id,
    team: d.team,
    leave_date: d.leave_date,
    leave_type_id: d.leave_type_id,
    day_portion: d.day_portion,
    note: d.note ?? null,
    created_by: d.created_by ?? userId,
  });

  if (action === "delete") {
    if (!old) return { error: "복구할 데이터가 없습니다." };
    const { error } = await supabase.from("leave_entries").insert({ id: old.id, ...restoreRow(old) });
    if (error) return { error: `복구 실패: ${error.message}` };
  } else if (action === "update") {
    if (!old) return { error: "복구할 데이터가 없습니다." };
    const entryId = h.entry_id as string;
    const { data: exists } = await supabase
      .from("leave_entries")
      .select("id")
      .eq("id", entryId)
      .maybeSingle();
    if (exists) {
      const { error } = await supabase
        .from("leave_entries")
        .update({
          user_id: old.user_id,
          team: old.team,
          leave_date: old.leave_date,
          leave_type_id: old.leave_type_id,
          day_portion: old.day_portion,
          note: old.note ?? null,
        })
        .eq("id", entryId);
      if (error) return { error: `복구 실패: ${error.message}` };
    } else {
      const { error } = await supabase.from("leave_entries").insert({ id: entryId, ...restoreRow(old) });
      if (error) return { error: `복구 실패: ${error.message}` };
    }
  } else {
    return { error: "등록 이력은 복구 대상이 아닙니다." };
  }

  await logActivity({
    userId,
    userName,
    category: "leave",
    action: "restore_entry",
    description: `연차 ${HISTORY_ACTION_LABEL[action]} 이력 복구`,
  });
  revalidatePath("/leave");
  return { success: true };
}
