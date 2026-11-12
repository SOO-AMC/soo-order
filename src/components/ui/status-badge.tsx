import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * 상태 톤. 색만으로 구분하지 않도록 톤마다 아이콘 모양이 다르다.
 * - todo: 아직 손대지 않음 (점선 원)       예) 주문신청
 * - doing: 진행 중 (반쯤 찬 원)            예) 검수대기, 반품대기
 * - ask: 확인·요청 필요 (과녁)             예) 반품신청, 혈액 확인대기
 * - late: 막힘·문제 (X 원)                 예) 품절
 * - done: 완료 (체크 원)                   예) 검수완료, 혈액 확인완료
 * - muted: 끝나서 더 볼 일 없음 (체크, 회색) 예) 반품완료
 */
export type StatusTone = "todo" | "doing" | "ask" | "late" | "done" | "muted";

const TONE_CLASS: Record<StatusTone, string> = {
  todo: "bg-status-todo-bg text-status-todo",
  doing: "bg-status-doing-bg text-status-doing",
  ask: "bg-status-ask-bg text-status-ask",
  late: "bg-status-late-bg text-status-late",
  done: "bg-status-done-bg text-status-done",
  muted: "bg-status-muted-bg text-status-muted",
};

/** 아이콘만 쓸 때(범례 등)의 글자색. 동적 클래스 조합은 Tailwind가 못 잡으므로 고정 맵. */
export const STATUS_TONE_TEXT: Record<StatusTone, string> = {
  todo: "text-status-todo",
  doing: "text-status-doing",
  ask: "text-status-ask",
  late: "text-status-late",
  done: "text-status-done",
  muted: "text-status-muted",
};

export function StatusIcon({ tone, className }: { tone: StatusTone; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: cn("size-3.5 shrink-0", className),
  };

  switch (tone) {
    case "todo":
      return (
        <svg {...common}>
          <path d="M10.1 2.182a10 10 0 0 1 3.8 0" />
          <path d="M13.9 21.818a10 10 0 0 1-3.8 0" />
          <path d="M17.609 3.721a10 10 0 0 1 2.69 2.7" />
          <path d="M2.182 13.9a10 10 0 0 1 0-3.8" />
          <path d="M20.279 17.609a10 10 0 0 1-2.7 2.69" />
          <path d="M21.818 10.1a10 10 0 0 1 0 3.8" />
          <path d="M3.721 6.391a10 10 0 0 1 2.7-2.69" />
          <path d="M6.391 20.279a10 10 0 0 1-2.69-2.7" />
        </svg>
      );
    case "doing":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" />
        </svg>
      );
    case "ask":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      );
    case "late":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="m15 9-6 6M9 9l6 6" />
        </svg>
      );
    case "done":
    case "muted":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
  }
}

/** 상태 뱃지: 아이콘 모양 + 색 + 글자. */
export function StatusBadge({
  tone,
  showIcon = true,
  className,
  children,
  ...props
}: ComponentProps<"span"> & { tone: StatusTone; showIcon?: boolean }) {
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(
        "inline-flex h-[22px] w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full text-xs font-semibold",
        showIcon ? "pl-1.5 pr-2" : "px-2",
        TONE_CLASS[tone],
        className
      )}
      {...props}
    >
      {showIcon && <StatusIcon tone={tone} />}
      {children}
    </span>
  );
}
