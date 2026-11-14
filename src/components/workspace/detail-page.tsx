import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";

/**
 * 상세 페이지 틀 (디자인 시스템 "상세 화면").
 * 상단바(뒤로 + 제목) → 본문 카드들. PC는 오른쪽 320px 열에 처리 버튼·이력을 붙여 둔다(스크롤해도 따라옴).
 * 모바일은 본문 다음에 같은 열이 이어진다. 서버 컴포넌트에서 그대로 쓴다.
 */
export function DetailPage({
  title,
  backHref,
  headerAction,
  children,
  aside,
}: {
  title: string;
  backHref: string;
  headerAction?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  // 상단바는 패널 폭 전체(아래 선이 끝까지), 본문만 가운데 좁게
  return (
    <>
      <PageHeader title={title} leading={<BackButton fallbackHref={backHref} />} action={headerAction} />
      <div className="mx-auto max-w-md p-4 md:max-w-2xl lg:max-w-5xl lg:px-6 lg:py-5">
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-4">
          <div className="flex min-w-0 flex-col gap-3">{children}</div>
          {aside && <aside className="flex flex-col gap-3 lg:sticky lg:top-[calc(var(--page-top)+4.5rem)]">{aside}</aside>}
        </div>
      </div>
    </>
  );
}

/** 맨 위 요약: 배지 줄 + 큰 이름 + 한 줄 요약 */
export function DetailHero({ badges, title, summary }: { badges?: ReactNode; title: ReactNode; summary?: ReactNode }) {
  return (
    <section className="rounded-xl bg-card px-5 py-5 ring-1 ring-border">
      {badges && <div className="mb-2.5 flex flex-wrap items-center gap-1.5">{badges}</div>}
      <h2 className="break-words text-[22px] font-extrabold leading-[30px] tracking-tight">{title}</h2>
      {summary && <p className="mt-1 text-[15px] text-subtle-foreground">{summary}</p>}
    </section>
  );
}

/** 본문 카드 하나 (제목 + 내용) */
export function DetailCard({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl bg-card p-5 ring-1 ring-border", className)}>
      {(title || action) && (
        <div className="mb-3.5 flex items-center justify-between gap-2">
          {title && <h3 className="text-[13px] font-semibold text-subtle-foreground">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export type InfoItem = { label: string; value: ReactNode; wide?: boolean } | null | false | undefined;

/** 라벨 위·값 아래 정보 칸. 모바일 2열, 넓으면 3열. 거짓 값은 건너뛴다. wide=한 줄 전체. */
export function InfoGrid({ items }: { items: InfoItem[] }) {
  const shown = items.filter(Boolean) as { label: string; value: ReactNode; wide?: boolean }[];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-3">
      {shown.map((it) => (
        <div key={it.label} className={cn("min-w-0", it.wide && "col-span-2 md:col-span-3")}>
          <dt className="text-xs text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 break-words text-[15px] font-medium">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 안내 줄 (직접 등록 반품, 품절 안내 등) */
export function DetailNotice({
  tone = "info",
  icon,
  children,
}: {
  tone?: "info" | "warn" | "danger";
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-xl px-4 py-3 text-[13px] leading-5",
        tone === "info" && "bg-status-doing-bg text-status-doing",
        tone === "warn" && "bg-status-ask-bg text-status-ask",
        tone === "danger" && "bg-status-late-bg text-status-late"
      )}
    >
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <span>{children}</span>
    </p>
  );
}

/** 오른쪽 열의 "처리" 카드: 버튼들을 세로로 */
export function DetailActions({ title = "처리", hint, children }: { title?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-border">
      <h3 className="text-[13px] font-semibold text-subtle-foreground">{title}</h3>
      {hint && <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p>}
      <div className="mt-3 flex flex-col gap-2">{children}</div>
    </section>
  );
}

/** loading.tsx용 뼈대 */
export function DetailSkeleton({ title, backHref }: { title: string; backHref: string }) {
  return (
    <DetailPage
      title={title}
      backHref={backHref}
      aside={<div className="h-40 animate-pulse rounded-xl bg-card ring-1 ring-border" />}
    >
      <div className="animate-pulse space-y-3 rounded-xl bg-card p-5 ring-1 ring-border">
        <div className="h-5 w-20 rounded-full bg-muted" />
        <div className="h-7 w-2/3 rounded bg-muted" />
        <div className="h-4 w-1/3 rounded bg-muted" />
      </div>
      <div className="grid animate-pulse grid-cols-2 gap-4 rounded-xl bg-card p-5 ring-1 ring-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="h-3 w-14 rounded bg-muted" />
            <div className="mt-1.5 h-4 w-24 rounded bg-muted" />
          </div>
        ))}
      </div>
    </DetailPage>
  );
}
