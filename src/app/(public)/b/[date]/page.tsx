import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PaperCard } from "@/components/briefing/paper-card";
import { fetchPublicIssue } from "@/lib/briefing/public-reader";
import { formatIssueDate } from "@/lib/briefing/kst";
import { progressLabel } from "@/lib/briefing/publish-rules";

export const dynamic = "force-dynamic";

/** 공개: 그날의 카드 전부 (논문 1건 = 카드 1장). 해설이 있는 카드는 "해설 보기"로 해설 페이지에 간다 */
export default async function PublicBriefingDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const issue = await fetchPublicIssue(date);
  if (!issue) notFound();
  const label = formatIssueDate(issue.date);
  const total = issue.papers.length;
  return (
    <div>
      <Link href="/b" className="inline-flex items-center gap-1 text-[14px] font-semibold text-[var(--bf-slate-500)] hover:text-[var(--bf-ink)]">
        <ChevronLeft className="size-4" aria-hidden="true" /> 지난 브리핑
      </Link>
      <h1 className="mt-2 text-[22px] font-extrabold tabular-nums tracking-tight">{label}</h1>
      <p className="mt-1 text-[14px] text-[var(--bf-slate-500)]">논문 {total}건</p>
      <div className="mt-5 grid gap-6">
        {issue.papers.map((p, i) => (
          <div key={p.id}>
            <PaperCard card={p.card} variant="mobile" dateLabel={label} progress={progressLabel(i, total)} detailHref={`/b/paper/${p.id}`} className="lg:hidden" />
            <PaperCard card={p.card} variant="desktop" dateLabel={label} progress={progressLabel(i, total)} detailHref={`/b/paper/${p.id}`} className="hidden lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
