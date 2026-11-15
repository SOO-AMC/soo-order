import type { SupabaseClient } from "@supabase/supabase-js";
import { kstDate } from "./kst";
import { planChanges, settlePlan, type CurrentIssue, type Plan, type PlanMove, type PlanPaper } from "./planner";
import { DEFAULT_PLAN_SETTINGS, LEGACY_LIMITS, PER_DAY_RANGE, PLAN_LIMITS, QUEUE_DATE, type PlanSettings, type PublishLimits } from "./types";

/**
 * 논문 브리핑 날짜 묶음의 예약 상태를 DB 에 맞춘다 ("use server" 밖 — 액션들이 같이 쓴다).
 *
 * 관리자가 논문을 올리고·검수하고·지우고·옮길 때마다, 그리고 관리 화면을 열 때 부른다.
 * 논문은 스스로 옮기지 않는다 — moves 로 시킨 것만 옮긴다. 그날 논문이 전부 검수돼 있으면 08:30 예약, 아니면 초안.
 * 계산은 planner.ts(순수 함수)가 하고, 여기서는 지금 상태를 읽고 → 바뀐 것만 briefing_apply_plan() 으로 한 번에 적용한다.
 *
 * supabase/migrate-briefing-planner.sql 을 아직 실행하지 않았으면 ready=false 로 돌려주고 아무것도 하지 않는다
 * (그동안은 예전 방식 — 날짜를 골라 직접 넣고 예약 — 이 그대로 동작한다).
 *
 * 호출하는 쪽이 requireAdmin() 으로 권한을 확인한 뒤에 부른다. DB 함수도 관리자만 받는다.
 */

/** PostgREST: 표·함수가 없을 때의 오류 코드 */
const MISSING = new Set(["42P01", "PGRST205", "42883", "PGRST202"]);
const isMissing = (e: { code?: string } | null) => !!e && MISSING.has(e.code ?? "");

const clamp = (n: unknown, fallback: number) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(Math.max(v, PER_DAY_RANGE.min), PER_DAY_RANGE.max) : fallback;
};

export type PlanConfig = {
  /** migrate-briefing-planner.sql 을 실행했는가 */
  ready: boolean;
  settings: PlanSettings;
  /** 발행 조건의 건수 범위 (준비 전이면 예전 규칙 3~4건) */
  limits: PublishLimits;
};

export async function loadPlanConfig(sb: SupabaseClient): Promise<PlanConfig> {
  const { data, error } = await sb.from("briefing_settings").select("papers_per_day").maybeSingle();
  if (error) {
    if (!isMissing(error)) console.error("[briefing] 설정 조회 실패:", error.message);
    return { ready: false, settings: DEFAULT_PLAN_SETTINGS, limits: LEGACY_LIMITS };
  }
  return { ready: true, settings: { perDay: clamp(data?.papers_per_day, DEFAULT_PLAN_SETTINGS.perDay) }, limits: PLAN_LIMITS };
}

export type SyncResult = {
  ready: boolean;
  /** DB 를 바꿨는가 */
  changed: boolean;
  /** locked = 그사이 발행돼 잠긴 묶음이 끼어 있었다(다음 호출에서 풀린다), failed = 그 밖의 실패 */
  error?: "locked" | "failed";
  plan?: Plan;
  config: PlanConfig;
};

type IssueRow = { id: string; issue_date: string; status: "draft" | "scheduled" | "published"; scheduled_at: string | null };

export async function syncPlan(
  sb: SupabaseClient,
  opts: { now?: Date; /** 논문을 다른 날짜·자리로 옮긴다 (관리자가 시킨 것만) */ moves?: PlanMove[]; config?: PlanConfig } = {},
): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const config = opts.config ?? (await loadPlanConfig(sb));
  if (!config.ready) return { ready: false, changed: false, config };

  const today = kstDate(now);
  // 아직 발행 전인 묶음 전부 + 오늘 이후의 발행된 묶음(그 날짜는 건너뛰어야 한다)
  const { data: issueRows, error: issueErr } = await sb.from("briefing_issues").select("id, issue_date, status, scheduled_at").or(`status.neq.published,issue_date.gte.${today}`);
  if (issueErr) {
    console.error("[briefing] 배치: 묶음 조회 실패:", issueErr.message);
    return { ready: true, changed: false, error: "failed", config };
  }
  const issues = (issueRows as IssueRow[] | null) ?? [];
  const isLocked = (i: IssueRow) => i.status === "published" || (i.status === "scheduled" && !!i.scheduled_at && new Date(i.scheduled_at).getTime() <= now.getTime());
  const lockedDates = new Set(issues.filter(isLocked).map((i) => i.issue_date));
  // 잠긴 날짜(발행됨·이미 보임)로는 옮기지 않는다
  if ((opts.moves ?? []).some((m) => lockedDates.has(m.date))) return { ready: true, changed: false, error: "locked", config };
  const open = issues.filter((i) => !isLocked(i));
  const dateOf = new Map(open.map((i) => [i.id, i.issue_date]));

  let papers: PlanPaper[] = [];
  if (open.length > 0) {
    // has = 카드가 있으면 1, 없으면 null (카드 전체를 읽지 않는다)
    const { data: paperRows, error: paperErr } = await sb
      .from("briefing_papers")
      .select("id, issue_id, display_order, review_status, has:card_content->schemaVersion")
      .in("issue_id", open.map((i) => i.id));
    if (paperErr) {
      console.error("[briefing] 배치: 논문 조회 실패:", paperErr.message);
      return { ready: true, changed: false, error: "failed", config };
    }
    papers = ((paperRows as unknown as { id: string; issue_id: string; display_order: number; review_status: string; has: unknown }[] | null) ?? []).map((p) => ({
      id: p.id,
      issueDate: dateOf.get(p.issue_id) ?? QUEUE_DATE,
      order: p.display_order,
      reviewed: p.review_status === "reviewed",
      hasCard: p.has !== null && p.has !== undefined,
    }));
  }

  const plan = settlePlan({ papers, now, moves: opts.moves });
  const current: CurrentIssue[] = open.map((i) => ({ date: i.issue_date, status: i.status as "draft" | "scheduled", scheduledAt: i.scheduled_at }));
  const changes = planChanges(papers, current, plan);
  if (changes.items.length === 0 && changes.days.length === 0) return { ready: true, changed: false, plan, config };

  const { error } = await sb.rpc("briefing_apply_plan", { p_items: changes.items, p_days: changes.days });
  if (error) {
    if (isMissing(error)) return { ready: false, changed: false, config: { ...config, ready: false, limits: LEGACY_LIMITS } };
    if (/BRIEFING_LOCKED/.test(error.message)) return { ready: true, changed: false, error: "locked", config };
    console.error("[briefing] 배치 적용 실패:", error.message);
    return { ready: true, changed: false, error: "failed", config };
  }
  return { ready: true, changed: true, plan, config };
}
