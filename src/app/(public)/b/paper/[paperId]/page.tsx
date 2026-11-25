import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PaperCard } from "@/components/briefing/paper-card";
import { PaperDetail } from "@/components/briefing/paper-detail";
import { CopyLinkButton } from "@/components/briefing/copy-link-button";
import { fetchPublicPaper } from "@/lib/briefing/public-reader";
import { formatIssueDate } from "@/lib/briefing/kst";
import { progressLabel } from "@/lib/briefing/publish-rules";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ paperId: string }> }): Promise<Metadata> {
  const { paperId } = await params;
  const found = await fetchPublicPaper(paperId).catch(() => null);
  if (!found) return {};
  const summary = found.paper.card.blocks.find((b) => b.kind === "keyPoint");
  return { title: found.paper.headline, description: summary && "text" in summary ? summary.text.slice(0, 120) : undefined };
}

/** 공개: 논문 1건 — 카드 + 해설(긴 해설·임상적 의미·출처·원제·근거 수준·교신저자) */
export default async function PublicPaperPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const found = await fetchPublicPaper(paperId);
  if (!found) notFound();
  const { paper, date, index, total, prev, next } = found;
  const label = formatIssueDate(date);
  return (
    <div>
      <Link href={`/b/${date}`} className="inline-flex items-center gap-1 text-[14px] font-semibold text-[var(--bf-slate-500)] hover:text-[var(--bf-ink)]">
        <ChevronLeft className="size-4" aria-hidden="true" /> {label} 브리핑
      </Link>
      <div className="mt-3">
        <PaperCard card={paper.card} variant="mobile" dateLabel={label} progress={progressLabel(index, total)} className="lg:hidden" />
        <PaperCard card={paper.card} variant="desktop" dateLabel={label} progress={progressLabel(index, total)} className="hidden lg:block" />
      </div>
      <PaperDetail card={paper.card} id="detail" className="mt-4" />
      <div className="mt-4 flex flex-wrap gap-2">
        <CopyLinkButton
          path={`/b/paper/${paper.id}`}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-white px-4 text-[14px] font-semibold ring-1 ring-[var(--bf-line)] hover:bg-[var(--bf-ivory-50)]"
        />
      </div>
      {(prev || next) && (
        <nav className="mt-4 grid grid-cols-2 gap-2" aria-label="같은 날 다른 논문">
          {[prev, next].map((p, i) =>
            p ? (
              <Link
                key={p.id}
                href={`/b/paper/${p.id}`}
                className={`flex min-h-[60px] min-w-0 items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 ring-1 ring-[var(--bf-line)] hover:bg-[var(--bf-ivory-50)] ${i === 1 ? "flex-row-reverse text-right" : ""}`}
              >
                {i === 1 ? <ChevronRight className="size-5 shrink-0 text-[var(--bf-slate-500)]" /> : <ChevronLeft className="size-5 shrink-0 text-[var(--bf-slate-500)]" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-[var(--bf-slate-500)]">{i === 1 ? "다음 논문" : "이전 논문"}</span>
                  <span className="block truncate text-sm font-semibold">{p.headline}</span>
                </span>
              </Link>
            ) : (
              <span key={i} />
            )
          )}
        </nav>
      )}
    </div>
  );
}
