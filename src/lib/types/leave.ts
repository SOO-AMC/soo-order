import type { Team } from "@/lib/utils/team";

export type DayPortion = "full" | "am" | "pm";

export const DAY_PORTION_LABEL: Record<DayPortion, string> = {
  full: "종일",
  am: "오전반차",
  pm: "오후반차",
};

/** 반차는 0.5일 차감 */
export const portionDays = (p: DayPortion): number => (p === "full" ? 1 : 0.5);

/**
 * 이 연차가 그 주기에서 차감되는가.
 * balance_id 가 지정돼 있으면 날짜와 무관하게 그 주기에서 차감한다(선사용/가불).
 * 없으면 종전대로 날짜가 주기 안에 드는지로 판정한다.
 *
 * ※ 잔여 계산이 있는 모든 곳이 이 함수를 써야 한다. 날짜만으로 거르면
 *   선사용 항목이 집계에서 증발한다.
 */
export function chargedToPeriod(
  entry: { leave_date: string; balance_id?: string | null },
  period: { id: string; start: string | null; end: string | null },
): boolean {
  if (entry.balance_id) return entry.balance_id === period.id;
  if (period.start && entry.leave_date < period.start) return false;
  if (period.end && entry.leave_date > period.end) return false;
  return true;
}

export interface LeaveType {
  id: string;
  name: string;
  deducts_balance: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface LeaveCycle {
  id: string;
  year_month: string; // 'YYYY-MM'
  team: Team | null;
  leave_start: string;
  leave_end: string;
  submit_start: string;
  submit_end: string;
}

export interface LeaveEntry {
  id: string;
  user_id: string;
  team: Team;
  leave_date: string;
  leave_type_id: string;
  day_portion: DayPortion;
  note: string | null;
  /** 차감할 주기 지정 (선사용/가불). null = leave_date 가 속한 주기 */
  balance_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LeaveBalance {
  user_id: string;
  period_start: string | null;
  period_end: string | null;
  total_days: number;
}

// --- 신청 주기 (cycle) 계산 헬퍼 ---

const pad2 = (n: number) => String(n).padStart(2, "0");

/** month1: 1~12 */
export function lastDayOfMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

/** KST 기준 오늘 (YYYY-MM-DD) — 서버가 UTC여도 한국 날짜로 계산 */
export function kstTodayStr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

export interface ResolvedCycle {
  year_month: string; // 'YYYY-MM'
  leave_start: string;
  leave_end: string;
  submit_start: string;
  submit_end: string;
  is_override: boolean;
}

/** 기본 규칙: 연차기간=해당 달력월, 신청기간=전달 1~10일 */
export function defaultCycleRange(yearMonth: string): Omit<ResolvedCycle, "is_override"> {
  const [y, m] = yearMonth.split("-").map(Number);
  const leaveStart = `${y}-${pad2(m)}-01`;
  const leaveEnd = `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}`;
  let py = y;
  let pm = m - 1;
  if (pm < 1) {
    pm = 12;
    py = y - 1;
  }
  return {
    year_month: yearMonth,
    leave_start: leaveStart,
    leave_end: leaveEnd,
    submit_start: `${py}-${pad2(pm)}-01`,
    submit_end: `${py}-${pad2(pm)}-10`,
  };
}

/** override(leave_cycles 행)가 있으면 우선, 없으면 기본 규칙 */
export function resolveCycle(yearMonth: string, override: LeaveCycle | null): ResolvedCycle {
  const def = defaultCycleRange(yearMonth);
  if (!override) return { ...def, is_override: false };
  return {
    year_month: yearMonth,
    leave_start: override.leave_start,
    leave_end: override.leave_end,
    submit_start: override.submit_start,
    submit_end: override.submit_end,
    is_override: true,
  };
}

/** 문자열(YYYY-MM-DD) 비교로 신청 기간 열림 여부 판정 */
export function isSubmitOpen(cycle: ResolvedCycle, today: string): boolean {
  return today >= cycle.submit_start && today <= cycle.submit_end;
}

// --- 서버 액션 반환 타입 ---

export interface LeaveMember {
  id: string;
  full_name: string;
}

export interface MyBalance {
  total: number;
  used: number;
  remaining: number;
  period_start: string | null;
  period_end: string | null;
}

export interface LeaveCalendarData {
  team: Team;
  members: LeaveMember[];
  entries: LeaveEntry[];
  leaveTypes: LeaveType[];
  cycle: ResolvedCycle;
  canSubmit: boolean;
  isAdmin: boolean;
  canManage: boolean;
  availableTeams: Team[];
  myBalance: MyBalance | null;
  currentUserId: string;
}

export interface LeaveBalanceView {
  userId: string;
  full_name: string;
  team: Team;
  total: number;
  used: number;
  remaining: number;
  period_start: string | null;
  period_end: string | null;
}

/** 특별연차(추가 부여) — 대체근무 보상 등. days 음수는 부여 취소·정정 */
export interface LeaveGrant {
  id: string;
  user_id: string;
  days: number;
  reason: string;
  granted_date: string;
  created_at: string;
}

/** 엑셀형 연차현황 — 한 칸(=연차 1일). 반차 2건이 한 칸을 나눠 씀 */
export interface LeaveGridCell {
  /** 위쪽(또는 종일) 날짜 */
  top: string;
  /** 반차일 때 아래쪽 날짜 (한쪽만 썼으면 null) */
  bottom: string | null;
  /** 반차 칸이면 true → 대각선 분할 */
  half: boolean;
  /** 날짜는 다른 주기인데 이 주기에서 당겨 쓴 선사용분 */
  borrowed?: boolean;
}

/** 엑셀형 연차현황 — 사람 1명 = 세로 1열 */
export interface LeaveGridColumn {
  userId: string;
  full_name: string;
  team: Team;
  /** 총 연차 = base + grant. 칸 개수와 같음 */
  total: number;
  /** 기본 부여 (leave_balances.total_days) */
  baseDays: number;
  /** 특별연차 합계 — 표에서 base 이후 칸을 다르게 칠함 */
  grantDays: number;
  grants: LeaveGrant[];
  used: number;
  remaining: number;
  periodStart: string | null;
  /** 만료일 (leave_balances.period_end) */
  expire: string | null;
  /** false = 롤오버가 자동 생성한 미확정 주기 (관리자 확인 대기) */
  confirmed: boolean;
  /** 주기 행 id — 확정 처리에 사용 */
  balanceId: string | null;
  cells: LeaveGridCell[];
}

/** 선사용(가불) 지정용 주기 선택지 */
export interface LeavePeriodOption {
  id: string;
  period_start: string | null;
  period_end: string | null;
  total_days: number;
  status: "active" | "scheduled" | "closed";
}

export type SnapshotKind = "monthly" | "cycle_end" | "manual";

export const SNAPSHOT_KIND_LABEL: Record<SnapshotKind, string> = {
  monthly: "월말",
  cycle_end: "주기마감",
  manual: "수동",
};

/** 연차표 버전 목록 항목 (data 제외) */
export interface LeaveSnapshotMeta {
  id: string;
  kind: SnapshotKind;
  snapshot_date: string;
  team: Team | null;
  user_name: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

/** 저장된 연차표 버전 (열람용) */
export interface LeaveGridSnapshot extends LeaveSnapshotMeta {
  columns: LeaveGridColumn[];
}

export interface LeaveDetailEntry {
  id: string;
  leave_date: string;
  day_portion: DayPortion;
  type_name: string;
  deducts: boolean;
  note: string | null;
  /** 차감 주기를 명시 지정한 항목 (선사용/가불). null = 날짜 기준 자동 */
  balance_id?: string | null;
  /** 날짜는 다른 주기인데 이번 주기에서 당겨 쓴 항목 */
  borrowed?: boolean;
}

export interface LeaveDetail {
  userId: string;
  full_name: string;
  team: Team | null;
  total: number;
  used: number;
  remaining: number;
  period_start: string | null;
  period_end: string | null;
  /** 이번 주기에 추가로 받은 특별연차 */
  grants: LeaveGrant[];
  entries: LeaveDetailEntry[];
}

// --- 수정요청 ---

export type SubmitMode = "auto" | "open" | "locked";

export const SUBMIT_MODE_LABEL: Record<SubmitMode, string> = {
  auto: "자동",
  open: "상시 열림",
  locked: "잠금",
};

export type RequestType = "add" | "modify" | "delete";
export type RequestStatus = "pending" | "approved" | "rejected";

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  add: "추가",
  modify: "변경",
  delete: "취소",
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "대기",
  approved: "승인됨",
  rejected: "반려됨",
};

export interface LeaveRequestView {
  id: string;
  requester_id: string;
  requester_name: string;
  team: Team;
  request_type: RequestType;
  target_label: string | null;
  leave_date: string | null;
  type_name: string | null;
  day_portion: DayPortion | null;
  reason: string;
  status: RequestStatus;
  admin_note: string | null;
  handled_at: string | null;
  created_at: string;
}

// --- 로그 / 버전이력 ---

export interface LeaveLogView {
  id: string;
  user_name: string;
  action: string;
  description: string;
  created_at: string;
}

export type HistoryAction = "create" | "update" | "delete";

export const HISTORY_ACTION_LABEL: Record<HistoryAction, string> = {
  create: "등록",
  update: "수정",
  delete: "삭제",
};

/** 스냅샷 표시용 (날짜·종류·반차) */
export interface LeaveSnapshot {
  member_name: string;
  leave_date: string;
  type_name: string;
  day_portion: DayPortion;
}

export interface LeaveHistoryView {
  id: string;
  action: HistoryAction;
  actor_name: string;
  created_at: string;
  before: LeaveSnapshot | null;
  after: LeaveSnapshot | null;
  canRestore: boolean;
}
