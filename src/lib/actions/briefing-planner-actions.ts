"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/server";
import { logActivity } from "@/lib/utils/activity-log";
import { checkFidelity } from "@/lib/briefing/fidelity";
import { addDays, defaultIssueDate, formatIssueDate, isPastPublishTime, kstDate } from "@/lib/briefing/kst";
import { ensureIssue, loadPlanConfig, syncPlan } from "@/lib/briefing/plan-sync";
import { extractDois, findDuplicate, nextFreeDate, splitSummaries, type DupHit, type DupItem, type PlanDay } from "@/lib/briefing/planner";
import { isIssueVisible } from "@/lib/briefing/publish-rules";
import type { PaperCardContent } from "@/lib/briefing/schema";
import { PER_DAY_RANGE, QUEUE_DATE, type BriefingIssue, type BriefingPaper, type IssueStatus, type PlanSettings } from "@/lib/briefing/types";

/**
 * 논문 브리핑 관리 첫 화면의 액션 (관리자 전용).
 *
 * 흐름: 날짜를 정하고(기본은 다음 빈 날짜) 논문 칸마다 요약을 붙여넣어 올린다(uploadPapers)
 *       → 카드를 만든다(기존 generatePaperCard) → 넘기면서 검수한다 → 그날 논문이 전부 검수되면 앱이 08:30 발행을 예약한다(syncPlan).
 * 한 번에 올린 논문들이 그날의 브리핑이다. 앱이 논문을 다른 날짜로 옮기지 않는다 — 옮기는 것은 movePaper 로 시켰을 때뿐.
 *
 * supabase/migrate-briefing-planner.sql 을 실행해야 동작한다 — 실행 전에는 fetchPlanner 가 ready=false 를 돌려주고
 * 관리 화면은 예전 목록을 보여 준다.
 */

export type PlannerResult<T> = { ok: true; data: T } | { ok: false; error: string };

const PAPER_COLS =
  "id, issue_id, display_order, raw_summary_text, raw_text_hash, headline, card_content, previous_card_content, layout_variant, category, source_url, doi, admin_memo, generation_status, ai_provider_info, review_status, reviewed_by, reviewed_at, created_by, created_at, updated_at";
const ISSUE_COLS = "id, issue_date, status, scheduled_at, published_at, created_by, created_at, updated_at";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PER_DAY = PER_DAY_RANGE.max;
const NOT_READY = "아직 준비되지 않았어요. supabase/migrate-briefing-planner.sql 을 먼저 실행해 주세요.";

const hashOf = (text: string) => createHash("sha256").update(text).digest("hex");
const isRealDate = (d: unknown): d is string => typeof d === "string" && DATE_RE.test(d) && !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime());

function touch() {
  revalidatePath("/briefing/admin");
  revalidatePath("/briefing");
}

export type PlannerPaperRow = { id: string; headline: string | null; reviewed: boolean; hasCard: boolean };
export type PlannerDay = {
  date: string;
  issueId: string;
  status: IssueStatus;
  /** 예약되지 않은 이유 (예약됐으면 null) */
  blocked: PlanDay["blocked"];
  papers: PlannerPaperRow[];
};
export type PlannerPublished = { date: string; paperCount: number; headlines: string[] };
/** 검수 전 논문 (전체 내용 + 어느 날짜 것인지) */
export type PendingPaper = BriefingPaper & { issue_date: string };

export type PlannerData = {
  /** false = SQL 미실행. 나머지 값은 비어 있다 */
  ready: boolean;
  settings: PlanSettings;
  today: string;
  /** 올리기 화면의 기본 날짜 = 다음 빈 날짜 (오늘 08:30 전이면 오늘부터, 지났으면 내일부터) */
  defaultDate: string;
  /** 오늘 08:30이 지났는가 */
  todayPast: boolean;
  /** 발행됐거나 이미 직원에게 보이는 날짜 — 이 날짜에는 올리거나 옮길 수 없다 */
  lockedDates: string[];
  /** 검수 전 논문 (날짜순, 날짜 미정은 맨 뒤) */
  pending: PendingPaper[];
  /** 논문이 있는 발행 전 날짜 묶음 (날짜순, 지난 날짜 포함) */
  days: PlannerDay[];
  /** 날짜 미정 논문 */
  undated: PlannerPaperRow[];
  /** 오늘 이후 예약된 날 수 = 앞으로 며칠치가 준비됐나 */
  stock: number;
  /** 최근 발행 완료 */
  published: PlannerPublished[];
  /** 검수 전 논문 중 이미 올린 것과 같아 보이는 것 (논문 id → 무엇과 같은지) */
  duplicates: Record<string, DupHit>;
  /** 화면을 열 때 예약 상태를 맞추다 생긴 문제 */
  syncError: "locked" | "failed" | null;
};

type LiteRow = { id: string; issue_id: string; display_order: number; headline: string | null; review_status: string; raw_text_hash: string | null; doi: string | null; has: unknown; sdoi: string | null };

/** 관리 첫 화면에 필요한 것 전부. 열 때마다 날짜별 예약 상태를 먼저 맞춘다(08:30이 지난 예약 등). */
export async function fetchPlanner(): Promise<PlannerData> {
  const { supabase } = await requireAdmin();
  const now = new Date();
  const today = kstDate(now);
  const config = await loadPlanConfig(supabase);
  const base: PlannerData = {
    ready: config.ready,
    settings: config.settings,
    today,
    defaultDate: defaultIssueDate(now),
    todayPast: isPastPublishTime(today, now),
    lockedDates: [],
    pending: [],
    days: [],
    undated: [],
    stock: 0,
    published: [],
    duplicates: {},
    syncError: null,
  };
  if (!config.ready) return base;

  const sync = await syncPlan(supabase, { now, config });
  if (!sync.ready) return { ...base, ready: false };

  // 발행 전 묶음 전부 + 최근 3주의 발행분
  const { data: issueRows, error: issueErr } = await supabase
    .from("briefing_issues")
    .select(ISSUE_COLS)
    .or(`status.neq.published,issue_date.gte.${addDays(today, -21)}`)
    .order("issue_date");
  if (issueErr) throw new Error("briefing-planner: issues");
  const issues = (issueRows as BriefingIssue[] | null) ?? [];
  const issueById = new Map(issues.map((i) => [i.id, i]));
  const openIds = issues.filter((i) => !isIssueVisible(i, now)).map((i) => i.id);

  // 논문: 목록·중복 비교용 가벼운 값(전체 논문) + 검수 전 논문의 전체 내용
  const [liteRes, pendingRes] = await Promise.all([
    supabase
      .from("briefing_papers")
      .select("id, issue_id, display_order, headline, review_status, raw_text_hash, doi, has:card_content->schemaVersion, sdoi:card_content->source->>doi")
      .order("created_at", { ascending: false })
      .limit(1000),
    openIds.length > 0 ? supabase.from("briefing_papers").select(PAPER_COLS).in("issue_id", openIds).eq("review_status", "draft") : Promise.resolve({ data: [], error: null }),
  ]);
  if (liteRes.error || pendingRes.error) throw new Error("briefing-planner: papers");
  const lite = (liteRes.data as unknown as LiteRow[] | null) ?? [];

  const byIssue = new Map<string, LiteRow[]>();
  for (const p of lite) {
    const arr = byIssue.get(p.issue_id) ?? [];
    arr.push(p);
    byIssue.set(p.issue_id, arr);
  }
  for (const arr of byIssue.values()) arr.sort((a, b) => a.display_order - b.display_order);
  const rowOf = (p: LiteRow): PlannerPaperRow => ({ id: p.id, headline: p.headline, reviewed: p.review_status === "reviewed", hasCard: p.has !== null && p.has !== undefined });

  const days: PlannerDay[] = [];
  const published: PlannerPublished[] = [];
  const lockedDates: string[] = [];
  let undated: PlannerPaperRow[] = [];
  for (const issue of issues) {
    const papers = byIssue.get(issue.id) ?? [];
    if (issue.issue_date === QUEUE_DATE) {
      undated = papers.map(rowOf);
      continue;
    }
    if (isIssueVisible(issue, now)) {
      lockedDates.push(issue.issue_date);
      // 논문을 모두 지운 발행분은 직원에게도 안 보이므로 목록에서 뺀다
      if (papers.length > 0) published.push({ date: issue.issue_date, paperCount: papers.length, headlines: papers.map((p) => p.headline ?? "(제목 없음)") });
      continue;
    }
    if (papers.length === 0) continue; // 빈 묶음은 보여 주지 않는다
    const rows = papers.map(rowOf);
    const allReady = rows.every((p) => p.reviewed && p.hasCard);
    const blocked: PlanDay["blocked"] = issue.status === "scheduled" ? null : !allReady ? "unreviewed" : "past-time";
    days.push({ date: issue.issue_date, issueId: issue.id, status: issue.status, blocked, papers: rows });
  }

  const dateOf = (issueId: string) => issueById.get(issueId)?.issue_date ?? QUEUE_DATE;
  const pending = ((pendingRes.data as BriefingPaper[] | null) ?? [])
    .map((p) => ({ ...p, issue_date: dateOf(p.issue_id) }))
    .sort((a, b) => (a.issue_date === b.issue_date ? a.display_order - b.display_order : a.issue_date < b.issue_date ? -1 : 1));

  // 중복: 검수 전 논문을 다른 모든 논문과 비교한다 (검수 전 논문은 원문에서도 DOI 를 찾는다)
  const whereOf = (issueId: string) => {
    const i = issueById.get(issueId);
    if (!i) return "지난 발행분";
    if (i.issue_date === QUEUE_DATE) return "날짜 미정";
    return `${formatIssueDate(i.issue_date)} ${isIssueVisible(i, now) ? "발행분" : "예정분"}`;
  };
  const rawOf = new Map(pending.map((p) => [p.id, p.raw_summary_text]));
  const dupItems: DupItem[] = lite.map((p) => ({
    id: p.id,
    hash: p.raw_text_hash,
    dois: [...new Set([...extractDois(p.doi), ...extractDois(p.sdoi), ...extractDois(rawOf.get(p.id))])],
    headline: p.headline,
    where: whereOf(p.issue_id),
  }));
  const dupById = new Map(dupItems.map((d) => [d.id, d]));
  const duplicates: Record<string, DupHit> = {};
  for (const p of pending) {
    const self = dupById.get(p.id);
    const hit = self ? findDuplicate(self, dupItems) : null;
    if (hit) duplicates[p.id] = hit;
  }

  // 올리기 기본 날짜: 논문이 이미 있거나 잠긴 날을 건너뛴 다음 빈 날짜
  const taken = new Set([...lockedDates, ...days.map((d) => d.date)]);
  return {
    ...base,
    settings: sync.config.settings,
    defaultDate: nextFreeDate(defaultIssueDate(now), taken),
    lockedDates,
    pending,
    days,
    undated,
    stock: days.filter((d) => d.status === "scheduled" && d.date >= today).length,
    published: published.reverse().slice(0, 14),
    duplicates,
    syncError: sync.error ?? null,
  };
}

/**
 * 논문 올리기: 고른 날짜의 묶음에 논문 칸마다 1건씩 넣는다. 한 번에 올린 논문들이 그날의 브리핑이 된다.
 * (한 칸에 구분선 --- 로 여러 건을 붙여넣었으면 나눠서 넣는다.)
 * 카드는 여기서 만들지 않는다 — 화면이 논문마다 generatePaperCard 를 차례로 부른다(진행 상황을 보여 줄 수 있고, AI 를 써도 시간 초과가 없다).
 */
export async function uploadPapers(texts: string[], issueDate: string): Promise<PlannerResult<{ papers: BriefingPaper[]; issueDate: string }>> {
  const { supabase, userId, userName } = await requireAdmin();
  if (!(await loadPlanConfig(supabase)).ready) return { ok: false, error: NOT_READY };
  if (!isRealDate(issueDate) || issueDate === QUEUE_DATE) return { ok: false, error: "발행 날짜를 골라 주세요." };
  if (issueDate < kstDate()) return { ok: false, error: "지난 날짜에는 올릴 수 없어요." };
  const parts = (Array.isArray(texts) ? texts : []).flatMap((t) => splitSummaries(typeof t === "string" ? t : ""));
  if (parts.length === 0) return { ok: false, error: "요약 글을 붙여넣어 주세요." };

  const issue = await ensureIssue(supabase, issueDate, userId);
  if (!issue) return { ok: false, error: "발행 묶음을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요." };
  if (isIssueVisible(issue)) return { ok: false, error: `${formatIssueDate(issueDate)}은 이미 발행됐어요. 다른 날짜를 골라 주세요.` };

  const { data: existing } = await supabase.from("briefing_papers").select("display_order").eq("issue_id", issue.id).order("display_order", { ascending: false });
  const count = existing?.length ?? 0;
  if (count + parts.length > MAX_PER_DAY) {
    return { ok: false, error: `하루에 ${MAX_PER_DAY}건까지 발행할 수 있어요. ${formatIssueDate(issueDate)}에는 이미 ${count}건이 있어서 ${Math.max(0, MAX_PER_DAY - count)}건만 더 넣을 수 있어요.` };
  }
  const base = (existing?.[0]?.display_order as number | undefined) ?? 0;

  const { data, error } = await supabase
    .from("briefing_papers")
    .insert(parts.map((raw, i) => ({ issue_id: issue.id, display_order: base + i + 1, raw_summary_text: raw, raw_text_hash: hashOf(raw), created_by: userId })))
    .select(PAPER_COLS);
  if (error || !data) return { ok: false, error: "논문을 저장하지 못했어요. 붙여넣은 글은 그대로 있어요. 잠시 뒤 다시 눌러 주세요." };

  // 검수 전 논문이 들어왔으니 그날의 예약은 풀린다
  await syncPlan(supabase);
  const papers = (data as BriefingPaper[]).sort((a, b) => a.display_order - b.display_order);
  logActivity({ userId, userName, category: "briefing", action: "upload_papers", description: `${issueDate} 브리핑에 논문 ${papers.length}건 올림` });
  touch();
  revalidatePath(`/briefing/admin/${issueDate}`);
  return { ok: true, data: { papers, issueDate } };
}

/** 검수 전 논문 중 "원문과 다를 수 있는 곳"이 하나도 없는 카드를 한 번에 검수 완료한다. 경고가 있는 카드는 건드리지 않는다. */
export async function reviewCleanPapers(): Promise<PlannerResult<{ reviewed: number; left: number }>> {
  const { supabase, userId, userName } = await requireAdmin();
  if (!(await loadPlanConfig(supabase)).ready) return { ok: false, error: NOT_READY };
  const now = new Date();
  const { data: issueRows } = await supabase.from("briefing_issues").select("id, status, scheduled_at").neq("status", "published");
  const openIds = ((issueRows as Pick<BriefingIssue, "id" | "status" | "scheduled_at">[] | null) ?? []).filter((i) => !isIssueVisible(i, now)).map((i) => i.id);
  if (openIds.length === 0) return { ok: true, data: { reviewed: 0, left: 0 } };
  const { data: rows } = await supabase.from("briefing_papers").select("id, raw_summary_text, card_content, source_url, doi").in("issue_id", openIds).eq("review_status", "draft");
  const list = (rows as { id: string; raw_summary_text: string; card_content: PaperCardContent | null; source_url: string | null; doi: string | null }[] | null) ?? [];
  const clean = list.filter((p) => p.card_content && checkFidelity(p.raw_summary_text, p.card_content, [p.source_url ?? "", p.doi ?? ""]).length === 0).map((p) => p.id);
  if (clean.length === 0) return { ok: true, data: { reviewed: 0, left: list.length } };

  const { error } = await supabase
    .from("briefing_papers")
    .update({ review_status: "reviewed", reviewed_by: userId, reviewed_at: now.toISOString() })
    .in("id", clean)
    .eq("review_status", "draft");
  if (error) return { ok: false, error: "검수 상태를 바꾸지 못했어요." };
  await syncPlan(supabase);
  logActivity({ userId, userName, category: "briefing", action: "review_clean", description: `경고 없는 논문 ${clean.length}건 한 번에 검수 완료` });
  touch();
  return { ok: true, data: { reviewed: clean.length, left: list.length - clean.length } };
}

/**
 * 논문 옮기기 — 다른 날짜로(그날의 맨 뒤, 또는 index 자리), 같은 날짜 안에서 자리 바꾸기, 날짜 미정으로 빼기(issueDate = QUEUE_DATE).
 * 원래 날은 건수가 줄고 옮긴 날은 늘어난다. 다른 논문은 움직이지 않는다.
 */
export async function movePaper(paperId: string, issueDate: string, index?: number): Promise<PlannerResult<{ id: string; issueDate: string }>> {
  const { supabase } = await requireAdmin();
  if (!(await loadPlanConfig(supabase)).ready) return { ok: false, error: NOT_READY };
  if (!isRealDate(issueDate)) return { ok: false, error: "날짜가 올바르지 않아요." };
  const toQueue = issueDate === QUEUE_DATE;
  if (!toQueue && issueDate < kstDate()) return { ok: false, error: "지난 날짜로는 옮길 수 없어요." };

  const { data: paper } = await supabase.from("briefing_papers").select("id, issue_id").eq("id", paperId).maybeSingle();
  if (!paper) return { ok: false, error: "논문을 찾지 못했어요." };
  const { data: from } = await supabase.from("briefing_issues").select("id, status, scheduled_at, issue_date").eq("id", paper.issue_id).maybeSingle();
  if (!from) return { ok: false, error: "논문을 찾지 못했어요." };
  if (isIssueVisible({ status: from.status as IssueStatus, scheduled_at: from.scheduled_at as string | null })) return { ok: false, error: "이미 발행된 논문은 옮길 수 없어요." };

  if (from.issue_date !== issueDate) {
    const { data: to } = await supabase.from("briefing_issues").select("id, status, scheduled_at").eq("issue_date", issueDate).maybeSingle();
    if (to) {
      if (isIssueVisible({ status: to.status as IssueStatus, scheduled_at: to.scheduled_at as string | null })) return { ok: false, error: `${formatIssueDate(issueDate)}은 이미 발행됐어요. 다른 날짜를 골라 주세요.` };
      if (!toQueue) {
        const { count } = await supabase.from("briefing_papers").select("id", { count: "exact", head: true }).eq("issue_id", to.id);
        if ((count ?? 0) >= MAX_PER_DAY) return { ok: false, error: `${formatIssueDate(issueDate)}에는 이미 ${MAX_PER_DAY}건이 있어요. 하루 ${MAX_PER_DAY}건까지예요.` };
      }
    }
  }

  const res = await syncPlan(supabase, { moves: [{ id: paperId, date: issueDate, index: typeof index === "number" && Number.isFinite(index) ? index : undefined }] });
  if (!res.ready) return { ok: false, error: NOT_READY };
  if (res.error === "locked") return { ok: false, error: "그사이 발행된 날짜가 있어요. 화면을 새로 고쳐 주세요." };
  if (res.error) return { ok: false, error: "옮기지 못했어요. 잠시 뒤 다시 해 주세요." };
  touch();
  revalidatePath(`/briefing/admin/${from.issue_date}`);
  revalidatePath(`/briefing/admin/${issueDate}`);
  return { ok: true, data: { id: paperId, issueDate } };
}

/** 올리기 화면에 처음 열어 두는 논문 칸 수 (기본 3). 그날 몇 건이 나갈지는 올린 논문 수가 정한다. */
export async function savePlanSettings(input: { perDay: number }): Promise<PlannerResult<PlanSettings>> {
  const { supabase, userId, userName } = await requireAdmin();
  const perDay = Math.floor(Number(input?.perDay));
  if (!Number.isFinite(perDay) || perDay < PER_DAY_RANGE.min || perDay > PER_DAY_RANGE.max) return { ok: false, error: `${PER_DAY_RANGE.min}~${PER_DAY_RANGE.max}건 사이로 정해 주세요.` };
  if (!(await loadPlanConfig(supabase)).ready) return { ok: false, error: NOT_READY };

  // min_papers 는 쓰지 않는 칸이다. 표의 제약(min <= per_day)에 걸리지 않게 1로 둔다
  const { data, error } = await supabase
    .from("briefing_settings")
    .update({ papers_per_day: perDay, min_papers: 1, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("papers_per_day")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "설정을 저장하지 못했어요." };
  logActivity({ userId, userName, category: "briefing", action: "plan_settings", description: `논문 브리핑 기본 칸 수를 ${perDay}건으로 변경` });
  touch();
  revalidatePath("/briefing/admin/settings");
  return { ok: true, data: { perDay } };
}
