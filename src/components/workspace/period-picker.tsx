"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { PERIOD_LABEL, matchPreset, presetRange, type DateRange, type PeriodPreset } from "@/lib/utils/period";

/** 칩 하나 (기간·비교 프리셋 공용) */
export function PeriodChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold transition-colors",
        on ? "bg-foreground text-background" : "bg-muted text-subtle-foreground ring-1 ring-border hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/** 시작~끝 날짜 칸 두 개 */
export function DateRangeInputs({
  value,
  onChange,
  idPrefix,
  className,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  idPrefix: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <Input
        id={`${idPrefix}-start`}
        aria-label="시작일"
        type="date"
        value={value.start}
        onChange={(e) => onChange({ ...value, start: e.target.value })}
        className="h-9 w-full min-w-0 flex-1 px-2 text-sm tabular-nums lg:w-[150px] lg:flex-none lg:px-3"
      />
      <span className="shrink-0 text-muted-foreground">~</span>
      <Input
        id={`${idPrefix}-end`}
        aria-label="종료일"
        type="date"
        value={value.end}
        onChange={(e) => onChange({ ...value, end: e.target.value })}
        className="h-9 w-full min-w-0 flex-1 px-2 text-sm tabular-nums lg:w-[150px] lg:flex-none lg:px-3"
      />
    </div>
  );
}

/**
 * 기간 고르기: 빠른 칩(이번 달·지난달…) + "직접"(날짜 두 칸).
 * 지금 값이 어느 칩과도 같지 않으면 자동으로 "직접"이 켜진다.
 */
export function PeriodPicker({
  value,
  onChange,
  today,
  presets = ["thisMonth", "lastMonth", "last3", "thisYear", "all"],
  idPrefix = "period",
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  today: string;
  presets?: PeriodPreset[];
  idPrefix?: string;
}) {
  const matched = matchPreset(value, today, presets);
  const [customOpen, setCustomOpen] = useState(false);
  const custom = customOpen || matched === null;

  return (
    <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="기간">
        {presets.map((p) => (
          <PeriodChip
            key={p}
            on={!custom && matched === p}
            onClick={() => {
              setCustomOpen(false);
              onChange(presetRange(p, today));
            }}
          >
            {PERIOD_LABEL[p]}
          </PeriodChip>
        ))}
        <PeriodChip on={custom} onClick={() => setCustomOpen(true)}>
          직접
        </PeriodChip>
      </div>
      {custom && <DateRangeInputs value={value} onChange={onChange} idPrefix={idPrefix} />}
    </div>
  );
}
