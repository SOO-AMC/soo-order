"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 목록 화면 공용 조각 (수링크 패턴).
 * 밑줄 탭 + 건수 / 목록 묶음 카드(머리글 + 행) / 한 줄 빈 상태 / 하단 일괄 처리 바.
 */

export type UnderlineTabItem<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

/** 밑줄 탭: 선택된 탭만 파란 글자 + 2px 밑줄. 라벨 옆에 건수. */
export function UnderlineTabs<T extends string>({
  value,
  onValueChange,
  items,
  ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  items: UnderlineTabItem<T>[];
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex h-11 gap-5">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 text-sm transition-colors",
              active
                ? "border-primary font-semibold text-primary"
                : "border-transparent text-subtle-foreground hover:text-foreground"
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 목록 한 덩어리: 흰 바탕 + 1px 선 + 머리글(제목·건수·오른쪽 동작). 행끼리는 행의 border-t로 나눈다. */
export function ListSection({
  title,
  count,
  actions,
  highlight = false,
  className,
  children,
}: {
  title?: string;
  count?: number;
  actions?: ReactNode;
  /** 먼저 봐야 하는 묶음(긴급 등)은 파란 테두리 */
  highlight?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-card",
        highlight ? "ring-2 ring-primary" : "ring-1 ring-border",
        className
      )}
    >
      {(title || actions) && (
        <div className="flex min-h-12 items-center gap-2 py-1.5 pl-4 pr-2">
          {title && <h2 className="truncate text-[15px] font-bold leading-snug">{title}</h2>}
          {count !== undefined && (
            <span className="text-[13px] tabular-nums text-muted-foreground">{count}건</span>
          )}
          {actions && <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** 목록이 비었을 때 한 줄. */
export function ListEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
      {children}
    </p>
  );
}

/** 작은 분류 태그 (긴급 등). 상태가 아닌 표시용. */
export function Tag({
  tone = "default",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: "default" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-bold",
        tone === "danger" ? "bg-status-late-bg text-status-late" : "bg-secondary text-subtle-foreground",
        className
      )}
      {...props}
    />
  );
}

/**
 * 여러 개를 고르면 화면 아래에 뜨는 진한 바.
 * 모바일은 하단 네비 위, PC는 사이드바(240px) 오른쪽 본문 하단.
 */
export function FloatingActionBar({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-2 rounded-xl bg-bar py-2 pl-4 pr-2 text-on-bar shadow-[0_8px_24px_rgb(20_33_61/0.25)] md:max-w-xl lg:bottom-4 lg:left-[calc(15rem+1rem)] lg:right-4">
      <span className="min-w-0 truncate text-sm font-semibold">{label}</span>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  );
}
