"use client";

import { cn } from "@/lib/utils";

export type SavedView<T extends string> = { value: T; label: string; count?: number };

/**
 * 저장된 보기 (디자인 시스템 SavedViews).
 * 자주 쓰는 필터 묶음을 탭처럼 고른다. 밑줄 탭(데이터 종류)과는 다른 줄에 둔다.
 * onSave를 주면 끝에 "+ 보기 저장"이 나온다(지금 필터가 기본과 다를 때만 넘길 것).
 */
export function SavedViews<T extends string>({
  views,
  value,
  onValueChange,
  onSave,
  ariaLabel = "저장된 보기",
  className,
}: {
  views: SavedView<T>[];
  value: T;
  onValueChange: (value: T) => void;
  onSave?: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {views.map((v) => {
        const active = v.value === value;
        return (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(v.value)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors",
              active
                ? "bg-secondary font-semibold text-foreground"
                : "text-subtle-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            {v.label}
            {v.count !== undefined && (
              <span className="font-medium tabular-nums text-muted-foreground">{v.count}</span>
            )}
          </button>
        );
      })}
      {onSave && (
        <button
          type="button"
          onClick={onSave}
          className="h-8 shrink-0 rounded-lg px-2.5 text-[13px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        >
          + 보기 저장
        </button>
      )}
    </div>
  );
}
