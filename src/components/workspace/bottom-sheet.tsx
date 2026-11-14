"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/**
 * 아래에서 올라오는 시트 (디자인 시스템 BottomSheet, 토스 방식).
 * 모바일 고르기·확인·상세에 쓴다. 제목은 문장형 질문("어디서 살까요?").
 * footer는 아래에 붙는 주 버튼 자리.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  tall = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** 상세처럼 내용이 긴 시트: 화면 위 64px까지 */
  tall?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          "gap-0 rounded-t-[20px] border-0 bg-card p-0 shadow-[0_-12px_32px_-8px_rgb(20_33_61/0.22)] data-[state=open]:duration-300",
          tall ? "top-16 max-h-none" : "max-h-[88dvh]",
          className
        )}
      >
        <div aria-hidden="true" className="mx-auto mb-3.5 mt-2.5 h-1 w-9 shrink-0 rounded-full bg-input" />
        <div className="shrink-0 px-5">
          <SheetTitle className="text-xl font-extrabold tracking-tight">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="mt-1 text-sm text-muted-foreground">{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{typeof title === "string" ? title : "시트"}</SheetDescription>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-border px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">{footer}</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** 시트 안 선택지 카드. best면 파란 테두리(추천·최저가). */
export function SheetOption({
  title,
  hint,
  trailing,
  best = false,
  selected = false,
  onClick,
}: {
  title: ReactNode;
  hint?: ReactNode;
  trailing?: ReactNode;
  best?: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-[14px] px-4 py-3.5 text-left transition-colors",
        best || selected
          ? "bg-status-doing-bg shadow-[inset_0_0_0_2px_var(--primary)]"
          : "bg-muted hover:bg-secondary"
      )}
    >
      <span className="min-w-0 flex-1">
        <b className="block text-base font-semibold">{title}</b>
        {hint && <span className="text-[13px] text-subtle-foreground">{hint}</span>}
      </span>
      {trailing && <span className="shrink-0 text-lg font-extrabold tabular-nums">{trailing}</span>}
    </button>
  );
}
