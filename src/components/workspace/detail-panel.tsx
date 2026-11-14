"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { BottomSheet } from "@/components/workspace/bottom-sheet";

/**
 * 상세 패널 (디자인 시스템 DetailPanel).
 * PC(1024px 이상): 목록 오른쪽 380px에 붙어 열린다. 목록을 떠나지 않으니 선택·필터가 그대로.
 * 모바일: 같은 내용을 아래 시트(tall)로 보여준다.
 * 목록 쪽은 PC에서 `<WorkspaceSplit>` 안에 목록과 이 패널을 나란히 둔다.
 */
export function DetailPanel({
  open,
  onClose,
  title,
  badge,
  children,
  footer,
  onPrev,
  onNext,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** 머리의 상태 배지 */
  badge?: ReactNode;
  children: ReactNode;
  /** 아래 고정 버튼 줄(보조 + 주 동작 하나) */
  footer?: ReactNode;
  /** J/K로 이전·다음 행 (PC) */
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // PC: Esc 닫기, J/K 이동. 입력 중에는 무시.
  useEffect(() => {
    if (!open || !isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "Escape") onClose();
      else if ((e.key === "j" || e.key === "J") && onNext) onNext();
      else if ((e.key === "k" || e.key === "K") && onPrev) onPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isDesktop, onClose, onNext, onPrev]);

  if (!isDesktop) {
    return (
      <BottomSheet open={open} onOpenChange={(o) => !o && onClose()} title={title} description={badge} footer={footer} tall>
        {children}
      </BottomSheet>
    );
  }

  if (!open) return null;
  return (
    <aside
      aria-label="상세"
      className="sticky top-[calc(var(--page-top)+0.5rem)] flex max-h-[calc(100dvh-var(--page-top)-2rem)] w-[380px] shrink-0 flex-col overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_var(--border)]"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        {badge}
        {(onPrev || onNext) && <span className="text-xs text-muted-foreground">J / K 로 이동</span>}
        <button
          type="button"
          onClick={onClose}
          aria-label="상세 닫기"
          className="ml-auto grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <h2 className="mb-4 text-[17px] font-bold leading-snug">{title}</h2>
        {children}
      </div>
      {footer && <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">{footer}</div>}
    </aside>
  );
}

/** 목록 + 상세 패널을 나란히. 패널이 없으면 목록이 전체 폭. */
export function WorkspaceSplit({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-start gap-4", className)}>{children}</div>;
}

/** 상세 안 "라벨 · 값" 목록 */
export function DetailFields({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
      {items.map((it) => (
        <div key={it.label} className="contents">
          <dt className="text-muted-foreground">{it.label}</dt>
          <dd className="m-0 min-w-0 break-words">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 처리 이력 타임라인 (위가 최신) */
export function Timeline({ items }: { items: { key: string; text: ReactNode; at?: string }[] }) {
  return (
    <ol className="grid gap-2.5 text-[13px] text-subtle-foreground">
      {items.map((it, i) => (
        <li key={it.key} className="flex gap-2.5">
          <span
            aria-hidden="true"
            className={cn("mt-1.5 size-2 shrink-0 rounded-full", i === 0 ? "bg-primary" : "bg-input")}
          />
          <span className="min-w-0">
            {it.text}
            {it.at && <span className="block text-xs text-muted-foreground tabular-nums">{it.at}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
