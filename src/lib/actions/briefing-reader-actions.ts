"use server";

import { requireUser } from "@/lib/supabase/server";
import { kstDate } from "@/lib/briefing/kst";
import { CATEGORY_KEYS, type PaperCardContent } from "@/lib/briefing/schema";
import type { BriefingIssue } from "@/lib/briefing/types";

/**
 * 논문 브리핑 열람 액션 (전 직원).
 *
 * 보이는 것은 "발행된 것"뿐이다:
 *  - 묶음: 발행 완료이거나, 예약 상태이면서 예약 시각(08:30 KST)이 지난 것
 *  - 논문: 검수 완료
 * RLS가 일반 직원에게 이미 같은 규칙을 강제하지만, 관리자는 RLS상 초안도 읽을 수 있으므로
 * 여기서도 같은 조건을 다시 걸어 열람 화면에는 누구에게나 발행된 것만 나오게 한다.
 *
 * 조회할 때 AI를 다시 부르지 않는다 — 저장된 카드를 읽기만 한다.
 */

/** 열람용 논문 (관리자 메모·이전 카드는 내려보내지 않는다) */
export interface ReaderPaper {
  id: string;
  issue_id: string;
  issue_date: string;
  display_order: number;
  headline: string;
  category: string | null;
  card: PaperCardContent;
  raw_summary_text: string;
  read: boolean;
  bookmarked: boolean;
}

export interface ReaderIssue {
  id: string;
  issue_date: string;
  published_at: string | null;
  papers: ReaderPaper[];
}

const PAPER_COLS = "id, issue_id, display_order, headline, category, card_content, raw_summary_text";
type Sb = Awaited<ReturnType<typeof requireUser>>["supabase"];
type PaperRow = { id: string; issue_id: string; display_order: number; headline: string | null; category: string | null; card_content: PaperCardContent | null; raw_summary_text: string };

/** 조회 실패를 "없음"으로 넘기지 않는다 — 화면이 "불러오지 못했어요"를 보여 주도록 던진다 */
function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) {
    console.error(`[briefing] ${what} 조회 실패:`, res.error.message);
    throw new Error(`${what}을(를) 불러오지 못했어요.`);
  }
  return res.data;
}

/** 지금 보여도 되는 묶음 조건 (PostgREST or 문법) */
const visibleFilter = () => `status.eq.published,and(status.eq.scheduled,scheduled_at.lte."${new Date().toISOString()}")`;

async function attachUserState(supabase: Sb, userId: string, rows: PaperRow[], dateOf: Map<string, string>): Promise<ReaderPaper[]> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const [reads, marks] = await Promise.all([
    supabase.from("briefing_read_states").select("paper_id").eq("user_id", userId).in("paper_id", ids),
    supabase.from("briefing_bookmarks").select("paper_id").eq("user_id", userId).in("paper_id", ids),
  ]);
  const readSet = new Set((reads.data ?? []).map((r) => r.paper_id as string));
  const markSet = new Set((marks.data ?? []).map((r) => r.paper_id as string));
  return rows
    .filter((r) => r.card_content)
    .map((r) => ({
      id: r.id,
      issue_id: r.issue_id,
      issue_date: dateOf.get(r.issue_id) ?? "",
      display_order: r.display_order,
      headline: r.headline ?? r.card_content!.headline,
      category: r.category ?? r.card_content!.category,
      card: r.card_content!,
      raw_summary_text: r.raw_summary_text,
      read: readSet.has(r.id),
      bookmarked: markSet.has(r.id),
    }));
}

async function loadIssue(supabase: Sb, userId: string, issue: Pick<BriefingIssue, "id" | "issue_date" | "published_at">): Promise<ReaderIssue> {
  const data = must(await supabase.from("briefing_papers").select(PAPER_COLS).eq("issue_id", issue.id).eq("review_status", "reviewed").order("display_order"), "논문");
  const papers = await attachUserState(supabase, userId, (data as PaperRow[] | null) ?? [], new Map([[issue.id, issue.issue_date]]));
  return { id: issue.id, issue_date: issue.issue_date, published_at: issue.published_at, papers };
}

/**
 * 오늘(한국시간) 발행된 브리핑. 아직 발행 전이면 null.
 * 전날 것을 오늘 것처럼 돌려주지 않는다.
 */
export async function fetchTodayBriefing(): Promise<{ today: string; issue: ReaderIssue | null }> {
  const { supabase, userId } = await requireUser();
  const today = kstDate();
  const issue = must(await supabase.from("briefing_issues").select("id, issue_date, published_at").eq("issue_date", today).or(visibleFilter()).maybeSingle(), "오늘 브리핑");
  if (!issue) return { today, issue: null };
  return { today, issue: await loadIssue(supabase, userId, issue as BriefingIssue) };
}

/** 특정 날짜의 발행 브리핑 (지난 브리핑에서 날짜를 눌렀을 때) */
export async function fetchBriefingByDate(issueDate: string): Promise<ReaderIssue | null> {
  const { supabase, userId } = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) return null;
  const issue = must(await supabase.from("briefing_issues").select("id, issue_date, published_at").eq("issue_date", issueDate).or(visibleFilter()).maybeSingle(), "브리핑");
  if (!issue) return null;
  return loadIssue(supabase, userId, issue as BriefingIssue);
}

/** 논문 1건 + 같은 날 발행된 다른 논문들(이전·다음 이동용). 발행 전이면 null. */
export async function fetchPaperForReading(paperId: string): Promise<{ issue: ReaderIssue; index: number } | null> {
  const { supabase, userId } = await requireUser();
  const row = must(await supabase.from("briefing_papers").select("id, issue_id, review_status").eq("id", paperId).maybeSingle(), "논문");
  if (!row || row.review_status !== "reviewed") return null;
  const issue = must(await supabase.from("briefing_issues").select("id, issue_date, published_at").eq("id", row.issue_id).or(visibleFilter()).maybeSingle(), "브리핑");
  if (!issue) return null;
  const loaded = await loadIssue(supabase, userId, issue as BriefingIssue);
  const index = loaded.papers.findIndex((p) => p.id === paperId);
  if (index < 0) return null;
  return { issue: loaded, index };
}

export type ArchiveQuery = { q?: string; category?: string | null; from?: string | null; to?: string | null };

/**
 * 지난 브리핑 · 검색.
 * 질환명·약물명·제목·저널·저자·PMID·DOI — 붙여넣은 요약 글과 카드 제목·DOI·링크에서 찾는다.
 */
export async function searchBriefing(query: ArchiveQuery = {}): Promise<ReaderIssue[]> {
  const { supabase, userId } = await requireUser();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;

  let iq = supabase.from("briefing_issues").select("id, issue_date, published_at").or(visibleFilter()).order("issue_date", { ascending: false }).limit(120);
  if (query.from && dateRe.test(query.from)) iq = iq.gte("issue_date", query.from);
  if (query.to && dateRe.test(query.to)) iq = iq.lte("issue_date", query.to);
  const issues = must(await iq, "지난 브리핑");
  const list = (issues as BriefingIssue[] | null) ?? [];
  if (list.length === 0) return [];
  const dateOf = new Map(list.map((i) => [i.id, i.issue_date]));

  let pq = supabase.from("briefing_papers").select(PAPER_COLS).in("issue_id", list.map((i) => i.id)).eq("review_status", "reviewed").order("display_order");
  if (query.category && (CATEGORY_KEYS as readonly string[]).includes(query.category)) pq = pq.eq("category", query.category);
  // or() 문법을 깨는 글자는 뺀다 (쉼표·괄호·따옴표·백분율 기호)
  const term = (query.q ?? "").replace(/[,()"\\%]/g, " ").trim().slice(0, 80);
  if (term) {
    const like = `"%${term}%"`;
    pq = pq.or(`raw_summary_text.ilike.${like},headline.ilike.${like},doi.ilike.${like},source_url.ilike.${like}`);
  }
  const rows = must(await pq.limit(400), "논문");
  const papers = await attachUserState(supabase, userId, (rows as PaperRow[] | null) ?? [], dateOf);

  const by = new Map<string, ReaderPaper[]>();
  for (const p of papers) {
    const arr = by.get(p.issue_id) ?? [];
    arr.push(p);
    by.set(p.issue_id, arr);
  }
  return list.filter((i) => by.has(i.id)).map((i) => ({ id: i.id, issue_date: i.issue_date, published_at: i.published_at, papers: by.get(i.id)! }));
}

/** 내가 북마크한 논문 (최근 것부터). 발행이 취소된 논문은 빠진다. */
export async function fetchBookmarkedPapers(): Promise<ReaderPaper[]> {
  const { supabase, userId } = await requireUser();
  const marks = must(await supabase.from("briefing_bookmarks").select("paper_id, saved_at").eq("user_id", userId).order("saved_at", { ascending: false }).limit(200), "북마크");
  const ids = (marks ?? []).map((m) => m.paper_id as string);
  if (ids.length === 0) return [];
  const rows = must(await supabase.from("briefing_papers").select(PAPER_COLS).in("id", ids).eq("review_status", "reviewed"), "논문");
  const paperRows = (rows as PaperRow[] | null) ?? [];
  if (paperRows.length === 0) return [];
  const issues = must(await supabase.from("briefing_issues").select("id, issue_date").in("id", [...new Set(paperRows.map((r) => r.issue_id))]).or(visibleFilter()), "브리핑");
  const dateOf = new Map((issues ?? []).map((i) => [i.id as string, i.issue_date as string]));
  const visible = paperRows.filter((r) => dateOf.has(r.issue_id));
  const papers = await attachUserState(supabase, userId, visible, dateOf);
  const order = new Map(ids.map((id, i) => [id, i]));
  return papers.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** 북마크 켜기/끄기 → 새 상태 */
export async function toggleBookmark(paperId: string): Promise<{ ok: boolean; bookmarked: boolean }> {
  const { supabase, userId } = await requireUser();
  const { data: existing } = await supabase.from("briefing_bookmarks").select("paper_id").eq("user_id", userId).eq("paper_id", paperId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("briefing_bookmarks").delete().eq("user_id", userId).eq("paper_id", paperId);
    return { ok: !error, bookmarked: !!error };
  }
  const { error } = await supabase.from("briefing_bookmarks").insert({ user_id: userId, paper_id: paperId });
  return { ok: !error, bookmarked: !error };
}

/** 읽음 표시 (이미 읽었으면 그대로) */
export async function markPaperRead(paperId: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  await supabase.from("briefing_read_states").upsert({ user_id: userId, paper_id: paperId }, { onConflict: "user_id,paper_id", ignoreDuplicates: true });
}

/** 내 현황 카드용: 오늘 발행된 논문 수와 안 읽은 수 (발행 전이면 count 0) */
export async function fetchTodayBriefingSummary(): Promise<{ count: number; unread: number; headlines: string[] }> {
  const { issue } = await fetchTodayBriefing();
  if (!issue) return { count: 0, unread: 0, headlines: [] };
  return { count: issue.papers.length, unread: issue.papers.filter((p) => !p.read).length, headlines: issue.papers.map((p) => p.headline) };
}
