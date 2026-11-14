"use client";

import type { OrderStatus } from "@/lib/types/order";
import { cn } from "@/lib/utils";
import { STATUS_TONE_TEXT, StatusIcon, type StatusTone } from "@/components/ui/status-badge";

/** 요약 타일 = 진행 단계. 누르면 아래 목록을 그 단계만 보이게 거른다(다시 누르면 해제). */
export type SummaryKey = "pending" | "ordered" | "out_of_stock" | "return";

export const SUMMARY_TILES: { key: SummaryKey; label: string; tone: StatusTone; statuses: OrderStatus[] }[] = [
  { key: "pending", label: "주문신청", tone: "todo", statuses: ["pending"] },
  { key: "ordered", label: "검수대기", tone: "doing", statuses: ["ordered"] },
  { key: "out_of_stock", label: "품절", tone: "late", statuses: ["out_of_stock"] },
  { key: "return", label: "반품", tone: "ask", statuses: ["return_requested", "return_pending"] },
];

export function StatusSummary({
  counts,
  selected,
  onSelect,
}: {
  counts: Partial<Record<OrderStatus, number>>;
  selected: SummaryKey | null;
  onSelect: (key: SummaryKey | null) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 lg:gap-3" role="group" aria-label="단계별 건수 (누르면 거르기)">
      {SUMMARY_TILES.map((t) => {
        const n = t.statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
        const active = selected === t.key;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? null : t.key)}
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-xl bg-card px-3 py-3 text-left transition-colors lg:px-4 lg:py-3.5",
              active ? "ring-2 ring-primary" : "ring-1 ring-border hover:bg-muted/60",
              n === 0 && !active && "opacity-60"
            )}
          >
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-subtle-foreground">
              <StatusIcon tone={t.tone} className={cn("size-3.5", STATUS_TONE_TEXT[t.tone])} />
              {t.label}
            </span>
            <span className="text-[22px] font-bold leading-none tabular-nums lg:text-[26px]">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
