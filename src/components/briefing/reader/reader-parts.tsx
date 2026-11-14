"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Bookmark, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleBookmark, type ReaderPaper } from "@/lib/actions/briefing-reader-actions";
import { sourceLine } from "@/components/briefing/paper-card";
import { categoryInfo } from "@/components/briefing/reader/category";

/** 브리핑 화면 공통 탭: 오늘 / 지난 브리핑 / 북마크 */
export function BriefingTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/briefing", label: "오늘", active: pathname === "/briefing" },
    { href: "/briefing/archive", label: "지난 브리핑", active: pathname.startsWith("/briefing/archive") },
    { href: "/briefing/bookmarks", label: "북마크", active: pathname.startsWith("/briefing/bookmarks") },
  ];
  return (
    <nav aria-label="논문 브리핑" className="flex h-11 gap-5">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex items-center border-b-2 text-sm transition-colors",
            t.active ? "border-primary font-semibold text-primary" : "border-transparent font-medium text-subtle-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** 북마크 버튼 (누르면 바로 바뀌고, 실패하면 되돌린다) */
export function BookmarkButton({ paperId, initial, className, onChange }: { paperId: string; initial: boolean; className?: string; onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "북마크 빼기" : "북마크에 넣기"}
      title={on ? "북마크 빼기" : "북마크에 넣기"}
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !on;
        setOn(next);
        start(async () => {
          const res = await toggleBookmark(paperId);
          if (!res.ok) setOn(!next);
          else {
            setOn(res.bookmarked);
            onChange?.(res.bookmarked);
          }
        });
      }}
      className={cn("grid size-10 shrink-0 place-items-center rounded-xl transition-colors", on ? "text-primary" : "text-muted-foreground hover:text-foreground", className)}
    >
      <Bookmark className={cn("size-5", on && "fill-current")} />
    </button>
  );
}

/** 목록 한 줄 (모바일 오늘 목록 · 지난 브리핑 · 북마크) — 한 줄이 논문 1건 */
export function PaperRow({ paper, showDate }: { paper: ReaderPaper; showDate?: string }) {
  const { label, Icon } = categoryInfo(paper.category);
  return (
    <Link href={`/briefing/paper/${paper.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/60 active:bg-muted">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-subtle-foreground">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-subtle-foreground">
          <span className="rounded-md bg-secondary px-1.5 py-0.5">{label}</span>
          {showDate && <span className="tabular-nums text-muted-foreground">{showDate}</span>}
          {!paper.read && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-bold text-primary">새 글</span>}
        </span>
        <b className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug">{paper.headline}</b>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/** PC 격자용 요약 카드 — 카드 하나가 논문 1건 */
export function PaperTile({ paper, index, total }: { paper: ReaderPaper; index: number; total: number }) {
  const { label, Icon } = categoryInfo(paper.category);
  return (
    <Link
      href={`/briefing/paper/${paper.id}`}
      className="group flex min-h-[260px] flex-col rounded-2xl bg-card p-5 ring-1 ring-border transition-shadow hover:shadow-[0_14px_30px_-18px_rgb(8_35_68/0.4)]"
    >
      <span className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-subtle-foreground">
          <Icon className="size-3.5" /> {label}
        </span>
        {!paper.read && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">새 글</span>}
        <span className="ml-auto text-xs font-semibold tabular-nums text-muted-foreground">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </span>
      <b className="mt-3 line-clamp-3 text-[19px] font-extrabold leading-[1.35] tracking-tight group-hover:text-primary">{paper.headline}</b>
      {paper.card.lead && <span className="mt-2 line-clamp-3 text-sm leading-[1.6] text-subtle-foreground">{paper.card.lead}</span>}
      <span className="mt-auto flex items-center gap-1.5 border-t border-border pt-3 text-[13px] text-muted-foreground">
        <BookOpen className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{sourceLine(paper.card)}</span>
        <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
      </span>
    </Link>
  );
}
