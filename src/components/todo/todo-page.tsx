"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Droplets,
  Flame,
  Package,
  PackageX,
  Plus,
  Scale,
  ScanLine,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Skeleton } from "@/components/workspace/feedback";
import { useTabCounts } from "@/hooks/use-tab-counts";
import { fetchTodoAlerts } from "@/lib/actions/todo-action";
import type { AlertItem, AlertSection, AlertsData } from "@/lib/types/dashboard";

type Tone = "late" | "ask" | "doing";

const TONE: Record<Tone, { icon: string; text: string }> = {
  late: { icon: "bg-status-late-bg text-status-late", text: "text-status-late" },
  ask: { icon: "bg-status-ask-bg text-status-ask", text: "text-status-ask" },
  doing: { icon: "bg-status-doing-bg text-status-doing", text: "text-status-doing" },
};

/**
 * 처리할 일 (관리자 모바일 첫 탭, 디자인 시스템 "모바일 · 관리자").
 * 숫자 4칸 → "확인이 필요해요"(밀린 것) → 바로 가기. 누르면 해당 화면의 그 보기로 간다.
 */
export function TodoPage({ initialAlerts }: { initialAlerts?: AlertsData }) {
  const counts = useTabCounts();
  const [alerts, setAlerts] = useState<AlertsData | null>(initialAlerts ?? null);
  const [failed, setFailed] = useState(false);
  const [today] = useState(() =>
    new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" })
  );

  // 건수가 바뀌면(실시간) 밀린 목록도 다시 계산
  const countKey = `${counts.orders.count}-${counts.inspection.count}-${counts.returns.count}`;
  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      fetchTodoAlerts()
        .then((a) => {
          if (!active) return;
          setAlerts(a);
          setFailed(false);
        })
        .catch(() => active && setFailed(true));
    }, 400);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [countKey]);

  const sections: {
    key: string;
    title: string;
    hint: string;
    href: string;
    tone: Tone;
    icon: ComponentType<{ className?: string }>;
    section: AlertSection;
  }[] = alerts
    ? [
        { key: "urgent", title: "긴급인데 아직 처리 안 됨", hint: "발주나 검수를 먼저 해 주세요", href: "/orders?view=urgent", tone: "late", icon: Flame, section: alerts.urgentUnhandled },
        { key: "ordered", title: `${alerts.thresholds.orderedDays}일 넘게 입고 안 됨`, hint: "업체에 확인해 보세요", href: "/inspection?view=late", tone: "late", icon: AlertTriangle, section: alerts.agingOrdered },
        { key: "pending", title: `${alerts.thresholds.pendingDays}일 넘게 발주 안 됨`, hint: "업체를 골라 발주해 주세요", href: "/orders", tone: "ask", icon: Clock, section: alerts.agingPending },
        { key: "returns", title: `${alerts.thresholds.returnDays}일 넘게 반품 처리 안 됨`, hint: "반품을 처리해 주세요", href: "/returns", tone: "ask", icon: Undo2, section: alerts.agingReturns },
      ].filter((s) => s.section.count > 0) as typeof sections
    : [];
  const delayedTotal = sections.reduce((s, x) => s + x.section.count, 0);

  const tiles = [
    { label: "발주 대기", href: "/orders", icon: Package, info: counts.orders },
    { label: "검수 대기", href: "/inspection", icon: ClipboardCheck, info: counts.inspection },
    { label: "반품", href: "/returns", icon: Undo2, info: counts.returns },
    { label: "혈액 미확인", href: "/blood", icon: Droplets, info: counts.blood },
  ];

  return (
    <div className="mx-auto max-w-md md:max-w-2xl">
      <PageHeader title="처리할 일" description={today} />

      <div className="space-y-3 p-4 lg:px-6">
        {/* 한 줄 요약 */}
        <div className="px-1 pb-1 pt-2">
          {alerts ? (
            <>
              <p className="text-[22px] font-extrabold leading-[30px] tracking-tight">
                {delayedTotal > 0 ? (
                  <>
                    밀린 일 <span className="tabular-nums text-status-late">{delayedTotal}건</span>이 있어요
                  </>
                ) : (
                  "밀린 일이 없어요"
                )}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                발주 대기 <b className="tabular-nums text-foreground">{counts.orders.count}</b> · 검수 대기{" "}
                <b className="tabular-nums text-foreground">{counts.inspection.count}</b>
              </p>
            </>
          ) : (
            <div className="space-y-2" aria-label="불러오는 중">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
        </div>

        {/* 숫자 4칸 */}
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {tiles.map(({ label, href, icon: Icon, info }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-[84px] flex-col justify-between rounded-2xl bg-card p-3.5 ring-1 ring-border transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center justify-between text-[13px] font-semibold text-subtle-foreground">
                {label}
                <Icon className="size-4 text-muted-foreground" />
              </span>
              <span className="flex items-baseline gap-1.5">
                <b className="text-[26px] font-extrabold leading-8 tracking-tight tabular-nums">{info.count}</b>
                {info.hasUrgent && (
                  <span className="rounded-full bg-status-late-bg px-1.5 text-xs font-semibold text-status-late">긴급 포함</span>
                )}
              </span>
            </Link>
          ))}
        </div>

        {/* 확인이 필요해요 */}
        {failed && !alerts && (
          <div className="rounded-2xl bg-card ring-1 ring-border">
            <EmptyState title="밀린 일을 불러오지 못했어요" description="잠시 뒤 다시 열어 주세요." />
          </div>
        )}
        {alerts && sections.length === 0 && (
          <div className="rounded-2xl bg-card ring-1 ring-border">
            <EmptyState title="지금 밀린 일이 없어요" description="오래된 주문·검수·반품이 생기면 여기에 모여요." icon={ClipboardCheck} />
          </div>
        )}
        {!alerts && !failed && (
          <div className="space-y-2.5">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        )}
        {sections.length > 0 && <h2 className="px-1 pt-2 text-[13px] font-semibold text-subtle-foreground">확인이 필요해요</h2>}
        {sections.map(({ key, title, hint, href, tone, icon: Icon, section }) => (
          <section key={key} className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
            <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50">
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", TONE[tone].icon)}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-base font-semibold">
                  {title} <span className={cn("tabular-nums", TONE[tone].text)}>{section.count}</span>
                </b>
                <span className="text-[13px] text-muted-foreground">{hint}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
            <ul className="border-t border-border">
              {section.items.slice(0, 3).map((it) => (
                <AlertRow key={it.id} item={it} href={href} />
              ))}
            </ul>
            {section.count > 3 && (
              <Link href={href} className="block border-t border-border px-4 py-2.5 text-center text-[13px] font-semibold text-primary hover:bg-muted/50">
                {section.count - 3}건 더 보기
              </Link>
            )}
          </section>
        ))}

        {/* 바로 가기 */}
        <h2 className="px-1 pt-2 text-[13px] font-semibold text-subtle-foreground">바로 가기</h2>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {[
            { label: "명세서 스캔", href: "/invoice-scan", icon: ScanLine },
            { label: "가격 비교", href: "/price-compare", icon: Scale },
            { label: "품절", href: "/out-of-stock", icon: PackageX },
            { label: "주문 등록", href: "/orders/new", icon: Plus },
          ].map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex h-14 items-center gap-2.5 rounded-2xl bg-card px-3.5 text-[15px] font-semibold ring-1 ring-border transition-colors hover:bg-muted/50"
            >
              <Icon className="size-5 text-subtle-foreground" />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function AlertRow({ item, href }: { item: AlertItem; href: string }) {
  const qty = item.quantity > 0 ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : null;
  return (
    <li className="border-t border-border first:border-t-0">
      <Link href={href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-medium">{item.itemName}</span>
            {item.isUrgent && (
              <span className="shrink-0 rounded-md bg-status-late-bg px-1.5 text-xs font-bold text-status-late">긴급</span>
            )}
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {[qty, item.vendor || null, item.requester].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-subtle-foreground">{item.days}일</span>
      </Link>
    </li>
  );
}
