import type { ComponentType, ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/** 불러오는 동안 실제 모양대로 보여주는 회색 막대 (디자인 시스템 Skeleton). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)} />;
}

/** 표·목록 로딩 틀: 행 N줄 (체크 · 품목 2줄 · 오른쪽 숫자). 스피너 대신 쓴다. */
export function ListSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="불러오는 중" className={cn("overflow-hidden rounded-xl bg-card ring-1 ring-border", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("flex items-center gap-3.5 px-4 py-3", i > 0 && "border-t border-border")}>
          <Skeleton className="size-[18px] rounded-[5px]" />
          <span className="flex flex-1 flex-col gap-1.5">
            <Skeleton className={cn("h-3.5", i % 3 === 0 ? "w-2/5" : i % 3 === 1 ? "w-1/2" : "w-1/3")} />
            <Skeleton className="h-3 w-1/4" />
          </span>
          <Skeleton className="h-3.5 w-14" />
        </div>
      ))}
    </div>
  );
}

/** 비었을 때: 무엇이 비었는지 + 다음 할 일 (디자인 시스템 EmptyState). */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid justify-items-center gap-1.5 px-4 py-10 text-center", className)}>
      <span className="mb-1 grid size-10 place-items-center rounded-xl bg-secondary text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="text-[15px] font-semibold">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
