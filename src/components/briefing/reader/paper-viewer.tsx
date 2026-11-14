"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, ExternalLink, FileText, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { PaperCard, sourceHref } from "@/components/briefing/paper-card";
import { BookmarkButton } from "@/components/briefing/reader/reader-parts";
import { markPaperRead, type ReaderIssue } from "@/lib/actions/briefing-reader-actions";
import { formatIssueDate } from "@/lib/briefing/kst";
import { progressLabel } from "@/lib/briefing/publish-rules";
import { copyText } from "@/lib/utils/clipboard";

/**
 * 논문 1건 읽기 화면 — 카드 1장이 중심.
 *
 * 이전/다음(버튼·좌우 밀기·← → 키)은 같은 날의 "다른 논문"으로 넘어간다.
 * 한 논문 안에서 넘길 장은 없다. 길면 그 한 장 안에서 세로로 읽는다.
 */
export function PaperViewer({ issue, initialIndex }: { issue: ReaderIssue; initialIndex: number }) {
  const router = useRouter();
  const papers = issue.papers;
  const total = papers.length;
  const [index, setIndex] = useState(initialIndex);
  const [bookmarks, setBookmarks] = useState<Record<string, boolean>>(() => Object.fromEntries(papers.map((p) => [p.id, p.bookmarked])));
  const [copied, setCopied] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const paper = papers[index];
  const dateLabel = formatIssueDate(issue.issue_date);
  const href = sourceHref(paper.card);

  // 읽음 표시: 화면에 띄운 논문마다 한 번
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (seen.current.has(paper.id)) return;
    seen.current.add(paper.id);
    if (!paper.read) void markPaperRead(paper.id).catch(() => {});
  }, [paper.id, paper.read]);

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= total) return;
      setIndex(to);
      setRawOpen(false);
      setCopied(false);
      // 주소만 바꾼다(서버를 다시 부르지 않음) — 공유·새로고침 때 같은 논문이 열리게
      window.history.replaceState(null, "", `/briefing/paper/${papers[to].id}`);
      window.scrollTo({ top: 0 });
      document.querySelector("main")?.scrollTo?.({ top: 0 });
    },
    [papers, total]
  );

  // ← → 키로 이전/다음 논문
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  // 좌우 밀기 = 다른 논문. 세로 읽기와 겹치지 않게, 가로로 충분히 민 경우만 넘긴다
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    go(dx < 0 ? index + 1 : index - 1);
  };

  const handleShare = async () => {
    // 로그인해야 열리는 앱 안 주소만 복사한다 (토큰 없음)
    const ok = await copyText(`${window.location.origin}/briefing/paper/${paper.id}`);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/briefing");
  };

  return (
    <>
      <PageHeader
        title="논문 브리핑"
        description={<span className="tabular-nums">{dateLabel}</span>}
        leading={
          <Button variant="ghost" size="icon" onClick={handleBack} aria-label="뒤로">
            <ChevronLeft />
          </Button>
        }
        action={
          <>
            <span className="text-sm font-bold tabular-nums" aria-label={`오늘 논문 ${total}건 중 ${index + 1}번째`}>
              {progressLabel(index, total)}
            </span>
            <BookmarkButton
              key={paper.id}
              paperId={paper.id}
              initial={bookmarks[paper.id] ?? false}
              onChange={(on) => setBookmarks((b) => ({ ...b, [paper.id]: on }))}
              className="-mr-2"
            />
          </>
        }
      />

      <div className="mx-auto max-w-md p-4 md:max-w-2xl lg:max-w-4xl lg:px-6">
        {/* 진행 표시: 칸 하나가 논문 1건 */}
        <div className="mb-3 flex gap-1.5" role="tablist" aria-label="오늘 논문">
          {papers.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`논문 ${i + 1}: ${p.headline}`}
              onClick={() => go(i)}
              className="group flex h-6 flex-1 items-center"
            >
              <span className={cn("h-1.5 w-full rounded-full transition-colors", i === index ? "bg-primary" : i < index ? "bg-primary/40" : "bg-border group-hover:bg-control")} />
            </button>
          ))}
        </div>

        {/* 카드 1장 */}
        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="touch-pan-y">
          <PaperCard key={`m-${paper.id}`} card={paper.card} variant="mobile" dateLabel={dateLabel} progress={progressLabel(index, total)} className="bf-fade lg:hidden" />
          <PaperCard key={`d-${paper.id}`} card={paper.card} variant="desktop" dateLabel={dateLabel} progress={progressLabel(index, total)} className="bf-fade hidden lg:block" />
        </div>

        {/* 이 논문으로 할 수 있는 것 */}
        <div className="mt-4 flex flex-wrap gap-2">
          {href && (
            <Button asChild className="h-11 flex-1 rounded-xl text-[15px] font-bold sm:flex-none sm:px-5">
              <a href={href} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" /> 원문 보기
              </a>
            </Button>
          )}
          <Button variant="outline" className="h-11 flex-1 rounded-xl sm:flex-none" onClick={handleShare}>
            {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
            {copied ? "주소를 복사했어요" : "링크 복사"}
          </Button>
          <Button variant="outline" className="h-11 flex-1 rounded-xl sm:flex-none" onClick={() => setRawOpen((v) => !v)} aria-expanded={rawOpen}>
            <FileText className="size-4" /> {rawOpen ? "요약문 접기" : "요약문 전체 보기"}
          </Button>
        </div>

        {rawOpen && (
          <section className="mt-3 rounded-2xl bg-card p-5 ring-1 ring-border">
            <h2 className="text-[13px] font-semibold text-subtle-foreground">등록된 요약문 (원본 그대로)</h2>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-[1.75] [overflow-wrap:anywhere]">{paper.raw_summary_text}</p>
          </section>
        )}

        {/* 이전 / 다음 논문 */}
        {total > 1 && (
          <nav className="mt-4 grid grid-cols-2 gap-2" aria-label="다른 논문">
            <NavButton dir="prev" disabled={index === 0} title={papers[index - 1]?.headline} onClick={() => go(index - 1)} />
            <NavButton dir="next" disabled={index === total - 1} title={papers[index + 1]?.headline} onClick={() => go(index + 1)} />
          </nav>
        )}
      </div>
    </>
  );
}

function NavButton({ dir, disabled, title, onClick }: { dir: "prev" | "next"; disabled: boolean; title?: string; onClick: () => void }) {
  const next = dir === "next";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-[60px] min-w-0 items-center gap-2 rounded-2xl bg-card px-3.5 py-2.5 text-left ring-1 ring-border transition-colors hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-40",
        next && "flex-row-reverse text-right"
      )}
    >
      {next ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" /> : <ChevronLeft className="size-5 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-muted-foreground">{next ? "다음 논문" : "이전 논문"}</span>
        <span className="block truncate text-sm font-semibold">{disabled ? (next ? "마지막 논문이에요" : "첫 논문이에요") : title}</span>
      </span>
    </button>
  );
}
