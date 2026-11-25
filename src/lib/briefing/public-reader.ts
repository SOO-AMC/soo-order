import { createAdminClient } from "@/lib/supabase/admin";
import { isIssueVisible } from "./publish-rules";
import { parseCard, type PaperCardContent } from "./schema";
import { QUEUE_DATE, type IssueStatus } from "./types";

/**
 * 공개 열람 (로그인 없이 /b 주소) — 서버 컴포넌트에서만 부른다.
 *
 * 수오더 계정이 없는 사람도 링크로 카드와 해설을 볼 수 있게 한다. 그래서 service_role 로 읽되,
 * 여기서 직접 "보여도 되는 것"만 고른다:
 *  - 묶음: 발행 완료이거나, 예약 상태이면서 예약 시각(08:30 KST)이 지난 것 (직원 화면과 같은 조건)
 *  - 논문: 검수 완료 + 카드가 있는 것
 *  - 내려보내는 칸: 카드(근거 인용·내부 표시 제거)·제목·분야·날짜·순서뿐.
 *    붙여넣은 원문/초록 전체(raw_summary_text), 관리자 메모, 검수자, 생성 정보, 직원 읽음·북마크는 절대 읽지 않는다.
 */

export type PublicPaper = { id: string; headline: string; category: string | null; card: PaperCardContent };
export type PublicIssue = { date: string; papers: PublicPaper[] };
export type PublicPaperPage = { date: string; index: number; total: number; paper: PublicPaper; prev: { id: string; headline: string } | null; next: { id: string; headline: string } | null };

type IssueRow = { id: string; issue_date: string; status: IssueStatus; scheduled_at: string | null };
type PaperRow = { id: string; issue_id: string; display_order: number; headline: string | null; category: string | null; card_content: unknown };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 공개용 카드에 남기는 표시 (나머지 flags 는 내부용) */
const PUBLIC_FLAGS = new Set(["priority"]);

/** 카드에서 공개하지 않을 것을 뺀다: 원문 인용(attribution)·내부 표시 */
export function toPublicCard(card: PaperCardContent): PaperCardContent {
  return { ...card, attribution: [], flags: card.flags.filter((f) => PUBLIC_FLAGS.has(f)) };
}

function toPublicPaper(row: PaperRow): PublicPaper | null {
  const parsed = parseCard(row.card_content);
  if (!parsed.ok) return null;
  const card = toPublicCard(parsed.card);
  return { id: row.id, headline: row.headline ?? card.headline, category: row.category ?? card.category, card };
}

async function visibleIssues(sb: ReturnType<typeof createAdminClient>, opts: { date?: string; ids?: string[]; limit?: number }): Promise<IssueRow[]> {
  let q = sb.from("briefing_issues").select("id, issue_date, status, scheduled_at").in("status", ["published", "scheduled"]).neq("issue_date", QUEUE_DATE);
  if (opts.date) q = q.eq("issue_date", opts.date);
  if (opts.ids) q = q.in("id", opts.ids);
  const { data, error } = await q.order("issue_date", { ascending: false }).limit(opts.limit ?? 120);
  if (error) throw new Error("public-briefing: issues");
  const now = new Date();
  return ((data as IssueRow[] | null) ?? []).filter((i) => isIssueVisible(i, now));
}

async function papersOf(sb: ReturnType<typeof createAdminClient>, issueIds: string[]): Promise<PaperRow[]> {
  if (issueIds.length === 0) return [];
  const { data, error } = await sb
    .from("briefing_papers")
    .select("id, issue_id, display_order, headline, category, card_content")
    .in("issue_id", issueIds)
    .eq("review_status", "reviewed")
    .not("card_content", "is", null)
    .order("display_order");
  if (error) throw new Error("public-briefing: papers");
  return (data as PaperRow[] | null) ?? [];
}

/** 지난 브리핑 목록 (최근 순). 카드 전체가 아니라 제목·분야만 */
export async function fetchPublicArchive(limit = 90): Promise<{ date: string; papers: { id: string; headline: string; category: string | null; priority: boolean }[] }[]> {
  const sb = createAdminClient();
  const issues = await visibleIssues(sb, { limit });
  const rows = await papersOf(sb, issues.map((i) => i.id));
  return issues
    .map((i) => ({
      date: i.issue_date,
      papers: rows
        .filter((r) => r.issue_id === i.id)
        .map(toPublicPaper)
        .filter((p): p is PublicPaper => !!p)
        .map((p) => ({ id: p.id, headline: p.headline, category: p.category, priority: p.card.flags.includes("priority") })),
    }))
    .filter((i) => i.papers.length > 0);
}

/** 그날의 브리핑 (카드 전체). 발행 전·없는 날이면 null */
export async function fetchPublicIssue(date: string): Promise<PublicIssue | null> {
  if (!DATE_RE.test(date)) return null;
  const sb = createAdminClient();
  const [issue] = await visibleIssues(sb, { date, limit: 1 });
  if (!issue) return null;
  const papers = (await papersOf(sb, [issue.id])).map(toPublicPaper).filter((p): p is PublicPaper => !!p);
  return papers.length > 0 ? { date: issue.issue_date, papers } : null;
}

/** 논문 1건 + 같은 날의 앞뒤 논문. 발행 전이면 null */
export async function fetchPublicPaper(paperId: string): Promise<PublicPaperPage | null> {
  if (!UUID_RE.test(paperId)) return null;
  const sb = createAdminClient();
  const { data: row } = await sb.from("briefing_papers").select("issue_id").eq("id", paperId).maybeSingle();
  if (!row) return null;
  const [issue] = await visibleIssues(sb, { ids: [row.issue_id as string], limit: 1 });
  if (!issue) return null;
  const papers = (await papersOf(sb, [issue.id])).map(toPublicPaper).filter((p): p is PublicPaper => !!p);
  const index = papers.findIndex((p) => p.id === paperId);
  if (index < 0) return null;
  const brief = (p: PublicPaper | undefined) => (p ? { id: p.id, headline: p.headline } : null);
  return { date: issue.issue_date, index, total: papers.length, paper: papers[index], prev: brief(papers[index - 1]), next: brief(papers[index + 1]) };
}
