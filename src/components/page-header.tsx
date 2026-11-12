import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 페이지 상단바 (수링크 패턴).
 * - 흰 바탕 + 아래 1px 선, 높이 56px: 제목 + 짧은 보조 정보 + 오른쪽 동작
 * - tabs가 있으면 둘째 줄에 밑줄 탭 (밑줄이 상단바 아래 선에 닿는다)
 * - 전체검색 상단바 아래에 붙도록 top은 var(--page-top)
 */
export function PageHeader({
  title,
  description,
  tabs,
  action,
  className,
}: {
  title: string;
  /** 제목 옆 짧은 보조 정보(예: "발주 대기 5건"). 긴 문장은 넣지 않는다. */
  description?: ReactNode;
  tabs?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-[var(--page-top)] z-40 border-b border-border bg-card px-4 lg:px-6",
        className
      )}
    >
      <div className="flex min-h-14 items-center gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-[17px] font-bold leading-tight">{title}</h1>
          {description && (
            <p className="truncate text-[13px] text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      {tabs && <div className="-mx-4 overflow-x-auto px-4 lg:-mx-6 lg:px-6">{tabs}</div>}
    </header>
  );
}
