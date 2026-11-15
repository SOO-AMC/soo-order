"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/server";
import { logActivity } from "@/lib/utils/activity-log";
import { publishIssueNow, type PublishActionResult, type PublishNowData } from "@/lib/actions/briefing-publish-actions";
import { checkFidelity } from "@/lib/briefing/fidelity";
import { addDays, defaultIssueDate, formatIssueDate, isPastPublishTime, kstDate } from "@/lib/briefing/kst";
import { loadPlanConfig, syncPlan } from "@/lib/briefing/plan-sync";
import { extractDois, findDuplicate, splitSummaries, type DupHit, type DupItem, type PlanDay } from "@/lib/briefing/planner";
import { isIssueVisible } from "@/lib/briefing/publish-rules";
import type { PaperCardContent } from "@/lib/briefing/schema";
import { PER_DAY_RANGE, QUEUE_DATE, type BriefingIssue, type BriefingPaper, type IssueStatus, type PlanSettings } from "@/lib/briefing/types";

/**
 * 논문 브리핑 대기함·배치 액션 (관리자 전용).
 *
 * 흐름: 여러 건을 한 번에 올린다(uploadPapers) → 카드를 만든다(기존 generatePaperCard) → 넘기면서 검수한다
 *       → 검수한 논문을 앱이 다음 발행일부터 하루 N건씩 채우고 예약한다(syncPlan).
 * 날짜는 사람이 고르지 않는다. 순서를 바꾸면(applyPlanOrder) 날짜가 따라 바뀐다.
 *
 * supabase/migrate-briefing-planner.sql 을 실행해야 동작한다 — 실행 전에는 fetchPlanner 가 ready=false 를 돌려주고
 * 관리 화면은 예전 목록을 보여 준다.
 */

export type PlannerResult<T> = { ok: true; data: T } | { ok: false; error: string };

const PAPER_COLS =
  "id, issue_id, display_order, raw_summary_text, raw_text_hash, headline, card_content, previous_card_content, layout_variant, category, source_url, doi, admin_memo, generation_status, ai_provider_info, review_status, reviewed_by, reviewed_at, created_by, created_at, updated_at";
const ISSUE_COLS = "id, issue_date, status, scheduled_at, published_at, created_by, created_at, updated_at";
/** 한 번에 올릴 수 있는 논문 수 */
const MAX_UPLOAD = 30;
const NOT_READY = "아직 준비되지 않았어요. supabase/migrate-briefing-planner.sql 을 먼저 실행해 주세요.";

type Sb = Awaited<ReturnType<typeof requireAdmin>>["supabase"];
const hashOf = (text: string) => createHash("sha256").update(text).digest("hex");

function touch() {
  revalidatePath("/briefing/admin");
  revalidatePath("/briefing");
}

/** 대기함 묶음 id (없으면 만든다) */
async function ensureQueue(supabase: Sb, userId: string): Promise<string | null> {
  const found = await supabase.from("briefing_issues").select("id").eq("issue_date", QUEUE_DATE).maybeSingle();
  if (found.data) return found.data.id as string;
  const created = await supabase.from("briefing_issues").insert({ issue_date: QUEUE_DATE, created_by: userId }).select("id").maybeSingle();
  if (created.data) return created.data.id as string;
  // 동시에 다른 창에서 만들었을 수 있다(날짜 유니크) → 다시 읽기
  const again = await supabase.from("briefing_issues").select("id").eq("issue_date", QUEUE_DATE).maybeSingle();
  return (again.data?.id as string | undefined) ?? null;
}

export type PlannerDayPaper = { id: string; headline: string | null; reviewed: boolean; hasCard: boolean; category: string | null };
export type PlannerDay = {
  date: string;
  status: IssueStatus;
  /** 예약되지 않은 이유 (예약됐으면 null) */
  blocked: PlanDay["blocked"];
  papers: PlannerDayPaper[];
};
export type PlannerPublished = { date: string; paperCount: number; headlines: string[] };

export type PlannerData = {
  /** false = SQL 미실행. 나머지 값은 비어 있다 */
  ready: boolean;
  settings: PlanSettings;
  today: string;
  /** 다음 발행일 (오늘 08:30 전이면 오늘, 지났으면 내일) */
  nextDate: string;
  /** 오늘 발행분이 직원에게 보이는가 */
  todayLive: boolean;
  /** 오늘 08:30이 지났는가 */
  todayPast: boolean;
  /** 대기함: 올렸지만 아직 검수 전인 논문 (순서대로, 전체 내용) */
  queue: BriefingPaper[];
  /** 발행 예정: 날짜별 */
  days: PlannerDay[];
  /** 발행 예정 논문의 한 줄 순서 (옮기기에 쓴다) */
  order: string[];
  /** 예약된 날 수 = 앞으로 며칠치가 준비됐나 */
  stock: number;
  /** 최근 발행 완료 */
  published: PlannerPublished[];
  /** 대기함 논문 중 이미 올린 것과 같아 보이는 것 (논문 id → 무엇과 같은지) */
  duplicates: Record<string, DupHit>;
  /** 화면을 열 때 배치를 맞추다 생긴 문제 */
  syncError: "locked" | "failed" | null;
};

type LiteRow = { id: string; issue_id: string; display_order: number; headline: string | null; review_status: string; category: string | null; raw_text_hash: string | null; doi: string | null; has: unknown; sdoi: string | null };

/** 관리 첫 화면에 필요한 것 전부. 열 때마다 날짜 배치를 먼저 맞춘다(날이 바뀌어 밀린 논문을 당긴다). */
export async function fetchPlanner(): Promise<PlannerData> {
  const { supabase } = await requireAdmin();
  const now = new Date();
  const today = kstDate(now);
  const config = await loadPlanConfig(supabase);
  const base: PlannerData = {
    ready: config.ready,
    settings: config.settings,
    today,
    nextDate: defaultIssueDate(now),
    todayLive: false,
    todayPast: isPastPublishTime(today, now),
    queue: [],
    days: [],
    order: [],
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
  const queueIssue = issues.find((i) => i.issue_date === QUEUE_DATE) ?? null;

  // 논문: 목록·중복 비교용 가벼운 값(전체 논문) + 대기함 논문의 전체 내용
  const [liteRes, queueRes] = await Promise.all([
    supabase
      .from("briefing_papers")
      .select("id, issue_id, display_order, headline, review_status, category, raw_text_hash, doi, has:card_content->schemaVersion, sdoi:card_content->source->>doi")
      .order("created_at", { ascending: false })
      .limit(1000),
    queueIssue ? supabase.from("briefing_papers").select(PAPER_COLS).eq("issue_id", queueIssue.id).order("display_order") : Promise.resolve({ data: [], error: null }),
  ]);
  if (liteRes.error || queueRes.error) throw new Error("briefing-planner: papers");
  const lite = (liteRes.data as unknown as LiteRow[] | null) ?? [];
  const queue = (queueRes.data as BriefingPaper[] | null) ?? [];

  const byIssue = new Map<string, LiteRow[]>();
  for (const p of lite) {
    const arr = byIssue.get(p.issue_id) ?? [];
    arr.push(p);
    byIssue.set(p.issue_id, arr);
  }
  for (const arr of byIssue.values()) arr.sort((a, b) => a.display_order - b.display_order);

  const settings = sync.config.settings;
  const min = Math.min(settings.min, settings.perDay);
  const days: PlannerDay[] = [];
  const published: PlannerPublished[] = [];
  let todayLive = false;
  for (const issue of issues) {
    if (issue.issue_date === QUEUE_DATE) continue;
    const papers = byIssue.get(issue.id) ?? [];
    const live = isIssueVisible(issue, now);
    if (issue.issue_date === today && live) todayLive = true;
    if (live) {
      published.push({ date: issue.issue_date, paperCount: papers.length, headlines: papers.map((p) => p.headline ?? "(제목 없음)") });
      continue;
    }
    if (papers.length === 0) continue; // 빈 묶음은 보여 주지 않는다
    const rows = papers.map((p) => ({ id: p.id, headline: p.headline, reviewed: p.review_status === "reviewed", hasCard: p.has !== null && p.has !== undefined, category: p.category }));
    const allReady = rows.every((p) => p.reviewed && p.hasCard);
    const blocked: PlanDay["blocked"] = !allReady ? "unreviewed" : rows.length < min ? "short" : isPastPublishTime(issue.issue_date, now) ? "past-time" : null;
    days.push({ date: issue.issue_date, status: issue.status, blocked: issue.status === "scheduled" ? null : (blocked ?? "short"), papers: rows });
  }

  // 중복: 대기함 논문을 다른 모든 논문과 비교한다 (대기함 논문은 원문에서 DOI 를 찾는다)
  const whereOf = (issueId: string) => {
    const i = issueById.get(issueId);
    if (!i) return "지난 발행분";
    if (i.issue_date === QUEUE_DATE) return "대기함";
    return `${formatIssueDate(i.issue_date)} ${isIssueVisible(i, now) ? "발행분" : "예정분"}`;
  };
  const queueRaw = new Map(queue.map((p) => [p.id, p.raw_summary_text]));
  const dupItems: DupItem[] = lite.map((p) => ({
    id: p.id,
    hash: p.raw_text_hash,
    dois: [...new Set([...extractDois(p.doi), ...extractDois(p.sdoi), ...extractDois(queueRaw.get(p.id))])],
    headline: p.headline,
    where: whereOf(p.issue_id),
  }));
  const dupById = new Map(dupItems.map((d) => [d.id, d]));
  const duplicates: Record<string, DupHit> = {};
  for (const p of queue) {
    const self = dupById.get(p.id);
    const hit = self ? findDuplicate(self, dupItems) : null;
    if (hit) duplicates[p.id] = hit;
  }

  return {
    ...base,
    settings,
    todayLive,
    queue,
    days,
    order: days.flatMap((d) => d.papers.map((p) => p.id)),
    stock: days.filter((d) => d.status === "scheduled").length,
    published: published.reverse().slice(0, 14),
    duplicates,
    syncError: sync.error ?? null,
  };
}

/**
 * 여러 건 한 번에 올리기. 구분선(---)으로 나눈 요약마다 논문 1건을 대기함에 넣는다.
 * 카드는 여기서 만들지 않는다 — 화면이 논문마다 generatePaperCard 를 차례로 부른다(진행 상황을 보여 줄 수 있고, AI 를 써도 시간 초과가 없다).
 */
export async function uploadPapers(rawText: string): Promise<PlannerResult<{ papers: BriefingPaper[] }>> {
  const { supabase, userId, userName } = await requireAdmin();
  if (!(await loadPlanConfig(supabase)).ready) return { ok: false, error: NOT_READY };
  const parts = splitSummaries(typeof rawText === "string" ? rawText : "");
  if (parts.length === 0) return { ok: false, error: "요약 글을 붙여넣어 주세요." };
  if (parts.length > MAX_UPLOAD) return { ok: false, error: `한 번에 ${MAX_UPLOAD}건까지 올릴 수 있어요. 지금 ${parts.length}건이에요. 나눠서 올려 주세요.` };

  const queueId = await ensureQueue(supabase, userId);
  if (!queueId) return { ok: false, error: "대기함을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요." };
  const { data: last } = await supabase.from("briefing_papers").select("display_order").eq("issue_id", queueId).order("display_order", { ascending: false }).limit(1);
  const base = (last?.[0]?.display_order as number | undefined) ?? 0;

  const { data, error } = await supabase
    .from("briefing_papers")
    .insert(parts.map((raw, i) => ({ issue_id: queueId, display_order: base + i + 1, raw_summary_text: raw, raw_text_hash: hashOf(raw), created_by: userId })))
    .select(PAPER_COLS);
  if (error || !data) return { ok: false, error: "논문을 저장하지 못했어요. 붙여넣은 글은 그대로 있어요. 잠시 뒤 다시 눌러 주세요." };

  const papers = (data as BriefingPaper[]).sort((a, b) => a.display_order - b.display_order);
  logActivity({ userId, userName, category: "briefing", action: "upload_papers", description: `논문 ${papers.length}건을 대기함에 올림` });
  touch();
  return { ok: true, data: { papers } };
}

/** 대기함에서 "원문과 다를 수 있는 곳"이 하나도 없는 카드를 한 번에 검수 완료한다. 경고가 있는 카드는 건드리지 않는다. */
export async function reviewCleanPapers(): Promise<PlannerResult<{ reviewed: number; left: number }>> {
  const { supabase, userId, userName } = await requireAdmin();
  if (!(await loadPlanConfig(supabase)).ready) return { ok: false, error: NOT_READY };
  const queue = await supabase.from("briefing_issues").select("id").eq("issue_date", QUEUE_DATE).maybeSingle();
  if (!queue.data) return { ok: true, data: { reviewed: 0, left: 0 } };
  const { data: rows } = await supabase.from("briefing_papers").select("id, raw_summary_text, card_content, source_url, doi, review_status").eq("issue_id", queue.data.id).eq("review_status", "draft");
  const list = (rows as { id: string; raw_summary_text: string; card_content: PaperCardContent | null; source_url: string | null; doi: string | null }[] | null) ?? [];
  const clean = list.filter((p) => p.card_content && checkFidelity(p.raw_summary_text, p.card_content, [p.source_url ?? "", p.doi ?? ""]).length === 0).map((p) => p.id);
  if (clean.length === 0) return { ok: true, data: { reviewed: 0, left: list.length } };

  const { error } = await supabase
    .from("briefing_papers")
    .update({ review_status: "reviewed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .in("id", clean)
    .eq("review_status", "draft");
  if (error) return { ok: false, error: "검수 상태를 바꾸지 못했어요." };
  await syncPlan(supabase);
  logActivity({ userId, userName, category: "briefing", action: "review_clean", description: `경고 없는 논문 ${clean.length}건 한 번에 검수 완료` });
  touch();
  return { ok: true, data: { reviewed: clean.length, left: list.length - clean.length } };
}

/** 발행 예정 논문의 순서를 정한다 → 날짜가 그 순서대로 다시 정해진다 (위·아래, 끌어서 옮기기, 날짜로 옮기기 공통) */
export async function applyPlanOrder(order: string[]): Promise<PlannerResult<{ changed: boolean }>> {
  const { supabase } = await requireAdmin();
  if (!Array.isArray(order) || order.length > 2000 || order.some((id) => typeof id !== "string")) return { ok: false, error: "순서가 올바르지 않아요." };
  const res = await syncPlan(supabase, { order });
  if (!res.ready) return { ok: false, error: NOT_READY };
  if (res.error === "locked") return { ok: false, error: "그사이 발행된 날짜가 있어요. 화면을 새로 고쳐 주세요." };
  if (res.error) return { ok: false, error: "옮기지 못했어요. 잠시 뒤 다시 해 주세요." };
  touch();
  return { ok: true, data: { changed: res.changed } };
}

/** 발행 예정에서 빼서 대기함으로 돌려보낸다 (검수도 풀린다 — 다시 검수하면 맨 뒤에 붙는다) */
export async function sendToQueue(paperId: string): Promise<PlannerResult<{ id: string }>> {
  const { supabase, userId } = await requireAdmin();
  if (!(await loadPlanConfig(supabase)).ready) return { ok: false, error: NOT_READY };
  const { data: paper } = await supabase.from("briefing_papers").select("id, issue_id").eq("id", paperId).maybeSingle();
  if (!paper) return { ok: false, error: "논문을 찾지 못했어요." };
  const { data: issue } = await supabase.from("briefing_issues").select("status, scheduled_at, issue_date").eq("id", paper.issue_id).maybeSingle();
  if (!issue) return { ok: false, error: "논문을 찾지 못했어요." };
  if (isIssueVisible({ status: issue.status as IssueStatus, scheduled_at: issue.scheduled_at as string | null })) return { ok: false, error: "이미 발행된 논문이에요." };
  if (issue.issue_date === QUEUE_DATE) return { ok: true, data: { id: paperId } };

  const queueId = await ensureQueue(supabase, userId);
  if (!queueId) return { ok: false, error: "대기함을 만들지 못했어요." };
  const { data: last } = await supabase.from("briefing_papers").select("display_order").eq("issue_id", queueId).order("display_order", { ascending: false }).limit(1);
  const { error } = await supabase
    .from("briefing_papers")
    .update({ issue_id: queueId, display_order: ((last?.[0]?.display_order as number | undefined) ?? 0) + 1, review_status: "draft", reviewed_by: null, reviewed_at: null })
    .eq("id", paperId);
  if (error) return { ok: false, error: "대기함으로 보내지 못했어요." };
  await syncPlan(supabase);
  touch();
  return { ok: true, data: { id: paperId } };
}

/** 하루 발행 건수·최소 건수 바꾸기. 바꾸면 발행 예정 날짜를 그 건수로 다시 채운다. */
export async function savePlanSettings(input: { perDay: number; min: number }): Promise<PlannerResult<PlanSettings>> {
  const { supabase, userId, userName } = await requireAdmin();
  const perDay = Math.floor(Number(input?.perDay));
  const min = Math.floor(Number(input?.min));
  if (!Number.isFinite(perDay) || perDay < PER_DAY_RANGE.min || perDay > PER_DAY_RANGE.max) return { ok: false, error: `하루 건수는 ${PER_DAY_RANGE.min}~${PER_DAY_RANGE.max}건 사이로 정해 주세요.` };
  if (!Number.isFinite(min) || min < 1 || min > perDay) return { ok: false, error: "최소 건수는 1건 이상, 하루 건수 이하로 정해 주세요." };
  if (!(await loadPlanConfig(supabase)).ready) return { ok: false, error: NOT_READY };

  const { data, error } = await supabase
    .from("briefing_settings")
    .update({ papers_per_day: perDay, min_papers: min, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("papers_per_day")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "설정을 저장하지 못했어요." };
  await syncPlan(supabase);
  logActivity({ userId, userName, category: "briefing", action: "plan_settings", description: `논문 브리핑 하루 ${perDay}건 (최소 ${min}건)으로 변경` });
  touch();
  revalidatePath("/briefing/admin/settings");
  return { ok: true, data: { perDay, min } };
}

/**
 * 오늘 것 지금 발행: 08:30이 지났어도 발행 예정의 첫 묶음을 오늘 날짜로 당겨 바로 내보낸다.
 * (08:30을 놓친 날, 또는 오늘 발행을 취소했다가 다시 내보낼 때)
 */
export async function publishTodayNow(): Promise<PublishActionResult<PublishNowData>> {
  const { supabase } = await requireAdmin();
  const now = new Date();
  const today = kstDate(now);
  const res = await syncPlan(supabase, { now, startToday: true });
  if (!res.ready) return { ok: false, error: NOT_READY };
  if (res.error) return { ok: false, error: "오늘 날짜로 당기지 못했어요. 화면을 새로 고쳐 주세요." };
  const { data: issue } = await supabase.from("briefing_issues").select("id, status").eq("issue_date", today).maybeSingle();
  if (!issue) return { ok: false, error: "오늘 내보낼 논문이 없어요. 검수한 논문이 있어야 해요." };
  if (issue.status === "published") return { ok: false, error: "오늘 브리핑은 이미 발행됐어요." };
  const out = await publishIssueNow(issue.id as string);
  // 발행하지 못했으면(건수 부족 등) 오늘로 당긴 논문을 다음 발행일로 되돌린다
  if (!out.ok) await syncPlan(supabase);
  touch();
  return out;
}
