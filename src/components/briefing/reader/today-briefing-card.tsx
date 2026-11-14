"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Newspaper } from "lucide-react";
import { fetchTodayBriefingSummary } from "@/lib/actions/briefing-reader-actions";
import "@/components/briefing/briefing.css";

type Summary = { count: number; unread: number; headlines: string[] };

/**
 * 내 현황의 "오늘의 논문 브리핑" 카드.
 * 오늘 발행분이 있을 때만 보인다(없으면 자리를 차지하지 않는다). 못 불러와도 내 현황은 그대로 동작한다.
 */
export function TodayBriefingCard() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let active = true;
    fetchTodayBriefingSummary()
      .then((s) => active && setSummary(s))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!summary || summary.count === 0) return null;

  return (
    <Link href="/briefing" className="bf bf-text bf-navy-surface flex items-center gap-3 rounded-2xl px-4 py-3.5 text-white transition-opacity hover:opacity-95">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-[var(--bf-gold-300)]">
        <Newspaper className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--bf-gold-300)]">
          오늘의 논문 브리핑
          {summary.unread > 0 && <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-xs font-bold text-white">새 글 {summary.unread}</span>}
        </span>
        <b className="mt-0.5 block truncate text-[15px] font-semibold">
          {summary.headlines[0]}
          {summary.count > 1 ? ` 외 ${summary.count - 1}건` : ""}
        </b>
      </span>
      <ChevronRight className="size-5 shrink-0 text-white/60" aria-hidden="true" />
    </Link>
  );
}
