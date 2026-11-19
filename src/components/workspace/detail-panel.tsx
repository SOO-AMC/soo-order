"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Keyboard, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { isTypingTarget, overlayOpen } from "@/hooks/use-shortcuts";
import { BottomSheet } from "@/components/workspace/bottom-sheet";

/** 단축키 안내 한 줄. keys 는 띄어쓰기로 나눈 키 이름들 (예: "J K") */
export type ShortcutHint = { keys: string; label: string };

/** 키 모양 표시 */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex min-w-5 items-center justify-center rounded bg-secondary px-1.5 py-px font-mono text-[11px] font-semibold leading-4 text-subtle-foreground shadow-[inset_0_-1px_0_var(--border)]", className)}>
      {children}
    </kbd>
  );
}

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
  shortcuts,
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
  /** 이 화면의 단축키 안내 (PC 머리의 "단축키" 버튼 · ? 키) */
  shortcuts?: ShortcutHint[];
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const asideRef = useRef<HTMLElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // PC: Esc 닫기, J/K 이동, ? 단축키 안내. 입력 중에는 무시하되, 패널 안 입력칸에서 Esc 는 입력을 빠져나온다(다시 단축키가 먹게).
  // 키는 e.code 기준 — 한글 입력 상태에서도 J/K 가 먹는다.
  useEffect(() => {
    if (!open || !isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTypingTarget(e.target)) {
        if (e.code === "Escape" && asideRef.current?.contains(e.target as Node)) (e.target as HTMLElement).blur();
        return;
      }
      if (overlayOpen()) return;
      if (e.code === "Escape") {
        if (helpOpen) setHelpOpen(false);
        else onClose();
      } else if (e.code === "KeyJ" && !e.shiftKey && onNext) onNext();
      else if (e.code === "KeyK" && !e.shiftKey && onPrev) onPrev();
      else if (e.code === "Slash" && e.shiftKey && shortcuts?.length) setHelpOpen((v) => !v);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isDesktop, onClose, onNext, onPrev, helpOpen, shortcuts?.length]);

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
      ref={asideRef}
      aria-label="상세"
      className="sticky top-[calc(var(--page-top)+0.5rem)] flex max-h-[calc(100dvh-var(--page-top)-2rem)] w-[380px] shrink-0 flex-col overflow-hidden rounded-xl bg-card shadow-[0_0_0_1px_var(--border)]"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        {badge}
        {shortcuts?.length ? (
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            aria-expanded={helpOpen}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Keyboard className="size-3.5" aria-hidden="true" />
            단축키 <Kbd>?</Kbd>
          </button>
        ) : (
          (onPrev || onNext) && <span className="text-xs text-muted-foreground">J / K 로 이동</span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="상세 닫기"
          className="ml-auto grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      {helpOpen && shortcuts?.length ? (
        <dl className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 border-b border-border bg-muted/60 px-4 py-3 text-[13px]">
          {shortcuts.map((s) => (
            <div key={s.keys} className="contents">
              <dt className="flex justify-end gap-1">
                {s.keys.split(" ").map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dt>
              <dd className="m-0 text-subtle-foreground">{s.label}</dd>
            </div>
          ))}
        </dl>
      ) : null}
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
