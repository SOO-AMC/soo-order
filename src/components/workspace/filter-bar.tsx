"use client";

import { useState, type ReactNode } from "react";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * 필터 줄 (디자인 시스템 FilterBar, Stripe 방식).
 * 검색칸 + ⊕ 필터 칩 + 보기 방식을 한 줄에. 세로 조회 폼과 전체 폭 조회 버튼을 대신한다.
 */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-1.5", className)}>{children}</div>;
}

/** 검색칸. 지우기 버튼 포함. */
export function SearchField({
  value,
  onChange,
  placeholder = "검색",
  className,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  return (
    <label
      className={cn(
        "flex h-9 min-w-0 flex-[1_1_220px] items-center gap-2 rounded-md bg-card px-3 text-muted-foreground shadow-[inset_0_0_0_1px_var(--input)] focus-within:shadow-[inset_0_0_0_2px_var(--ring)]",
        className
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="검색어 지우기"
          className="grid size-6 place-items-center rounded hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </label>
  );
}

export type FilterOption<T extends string> = { value: T; label: string; hint?: string };

/**
 * 필터 칩 하나. 값이 없으면 점선 "⊕ 이름", 있으면 파란 바탕 "이름 값 ✕".
 * 누르면 팝오버에서 하나를 고른다. options가 많으면 위에 검색칸이 나온다.
 */
export function FilterChip<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: FilterOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.value === value) ?? null;
  const shown = q.trim() ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <span className="inline-flex">
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 items-center gap-1 whitespace-nowrap text-[13px] transition-colors",
              selected
                ? "rounded-l-full bg-status-doing-bg pl-2.5 pr-1.5 text-foreground"
                : "rounded-full border border-dashed border-input bg-card px-2.5 text-muted-foreground hover:border-control hover:text-foreground"
            )}
          >
            {selected ? (
              <>
                {label} <b className="font-semibold text-status-doing">{selected.label}</b>
              </>
            ) : (
              <>⊕ {label}</>
            )}
          </button>
        </PopoverTrigger>
        {selected && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`${label} 필터 해제`}
            className="inline-flex h-7 items-center rounded-r-full bg-status-doing-bg pl-0.5 pr-2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </span>
      <PopoverContent align="start" className="w-60 p-1">
        {options.length > 8 && (
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`${label} 검색`}
            aria-label={`${label} 검색`}
            className="mb-1 h-8 w-full rounded-md bg-muted px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        )}
        <div className="max-h-72 overflow-y-auto">
          {shown.length === 0 && <p className="px-2.5 py-3 text-center text-[13px] text-muted-foreground">없어요</p>}
          {shown.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
                setQ("");
              }}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-accent"
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.hint && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{o.hint}</span>}
              {o.value === value && <Check className="size-4 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 걸린 필터가 하나라도 있을 때만 보이는 "필터 지우기". */
export function ClearFilters({ show, onClear }: { show: boolean; onClear: () => void }) {
  if (!show) return null;
  return (
    <button type="button" onClick={onClear} className="h-7 px-1 text-[13px] font-semibold text-primary hover:underline">
      필터 지우기
    </button>
  );
}

/** 2~3개 보기 방식 전환 (디자인 시스템 Segmented). */
export function Segmented<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  className,
}: {
  items: { value: T; label: string }[];
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex shrink-0 rounded-md bg-muted p-0.5 shadow-[inset_0_0_0_1px_var(--border)]", className)}
    >
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          aria-pressed={it.value === value}
          onClick={() => onValueChange(it.value)}
          className={cn(
            "rounded-[8px] px-3 py-1 text-[13px] font-semibold transition-colors",
            it.value === value
              ? "bg-card text-foreground shadow-xs ring-1 ring-border"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
