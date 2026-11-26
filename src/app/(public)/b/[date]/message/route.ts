import { fetchPublicIssue } from "@/lib/briefing/public-reader";
import { buildShareMessage, publicAppUrl } from "@/lib/briefing/public-meta";

export const dynamic = "force-dynamic";

/**
 * 공개: 그날 브리핑을 단체방에 붙여넣을 글 (순수 텍스트).
 * 네이버웍스 발송 루틴(Aside)이 이 글을 그대로 복사해 보낸다 — 문구·모양은 buildShareMessage 한 곳에서만 정한다.
 * 발행된(직원에게 보이는) 날짜만 내려준다. 카드 제목·분야뿐이라 공개 페이지에 이미 보이는 것 이상은 없다.
 */
export async function GET(req: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const issue = await fetchPublicIssue(date).catch(() => null);
  const headers = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!issue) return new Response("아직 발행되지 않은 날짜예요.", { status: 404, headers });
  const base = publicAppUrl() ?? new URL(req.url).origin;
  const papers = issue.papers.map((p) => ({ headline: p.headline, category: p.category, priority: p.card.flags.includes("priority") }));
  return new Response(buildShareMessage(issue.date, papers, base), { headers });
}
