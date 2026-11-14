"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleX, Plus } from "lucide-react";
import { fetchMyOrdersStatus, type MyOrdersData } from "@/lib/actions/my-orders-action";
import { useAuth } from "@/hooks/use-auth";
import { NotificationBell } from "@/components/notification-bell";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ListSkeleton, Skeleton } from "@/components/workspace/feedback";
import { Button } from "@/components/ui/button";
import { StatusSummary, SUMMARY_TILES, type SummaryKey } from "./status-summary";
import { ActiveOrderList } from "./active-order-list";
import { RecentCompleted } from "./recent-completed";
import { formatTimeAgo } from "./time-ago";

/**
 * 내 현황 (일반 직원 모바일 첫 탭, 디자인 시스템 "모바일 · 일반 직원").
 * 한 줄 요약 → 확인이 필요해요(품절 대체품) → 단계별 건수 → 진행 중 → 최근 완료. 모바일은 아래에 큰 "주문하기".
 */
export function MyOrdersPage({ initialData }: { initialData?: MyOrdersData }) {
  const { userName } = useAuth();
  const [data, setData] = useState<MyOrdersData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [filter, setFilter] = useState<SummaryKey | null>(null);

  useEffect(() => {
    fetchMyOrdersStatus()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const needAttention = useMemo(() => (data ? data.activeOrders.filter((o) => o.status === "out_of_stock") : []), [data]);

  const visibleActive = useMemo(() => {
    if (!data) return [];
    if (!filter) return data.activeOrders.filter((o) => o.status !== "out_of_stock");
    const statuses = SUMMARY_TILES.find((t) => t.key === filter)?.statuses ?? [];
    return data.activeOrders.filter((o) => statuses.includes(o.status));
  }, [data, filter]);

  const firstName = (userName || "").trim();

  return (
    <div className="mx-auto max-w-md pb-20 md:max-w-2xl lg:max-w-5xl lg:pb-0">
      <PageHeader
        title="내 현황"
        action={
          <>
            <Button asChild className="hidden h-9 rounded-lg px-3 text-[13px] lg:inline-flex">
              <Link href="/orders/new">
                <Plus className="size-4" /> 주문 등록
              </Link>
            </Button>
            {/* PC는 사이드바에 종 아이콘이 있으므로 모바일/태블릿에서만 노출 */}
            <div className="lg:hidden">
              <NotificationBell />
            </div>
          </>
        }
      />

      <div className="space-y-3 p-4 lg:px-6">
        {/* 한 줄 요약 */}
        <div className="px-1 pb-1 pt-2">
          {loading ? (
            <div className="space-y-2" aria-label="불러오는 중">
              <Skeleton className="h-7 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ) : data ? (
            <>
              <p className="text-[22px] font-extrabold leading-[30px] tracking-tight">
                {data.activeOrders.length > 0 ? (
                  <>
                    {firstName ? `${firstName}님 주문 ` : "주문 "}
                    <span className="tabular-nums text-primary">{data.activeOrders.length}건</span>이 진행 중이에요
                  </>
                ) : (
                  "진행 중인 주문이 없어요"
                )}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {needAttention.length > 0 ? `확인이 필요한 것 ${needAttention.length}건` : "확인할 것이 없어요"}
              </p>
            </>
          ) : null}
        </div>

        {loading ? (
          <ListSkeleton rows={5} />
        ) : !data ? (
          <div className="rounded-2xl bg-card ring-1 ring-border">
            <EmptyState title="주문 현황을 불러오지 못했어요" description="잠시 뒤 다시 열어 주세요." />
          </div>
        ) : (
          <>
            {/* 확인이 필요해요: 품절 → 대체품 */}
            {needAttention.length > 0 && !filter && (
              <section className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
                <h2 className="px-4 pb-1.5 pt-3.5 text-[13px] font-semibold text-subtle-foreground">확인이 필요해요</h2>
                {needAttention.map((o) => (
                  <Link
                    key={o.id}
                    href={`/orders/${o.id}?from=dashboard`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-status-late-bg text-status-late">
                      <CircleX className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-base font-semibold">{o.item_name} 품절</b>
                      <span className="text-[13px] text-muted-foreground">대체품을 골라 주세요 · {formatTimeAgo(o.created_at)} 요청</span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ))}
                <div className="h-1.5" />
              </section>
            )}

            <StatusSummary counts={data.counts} selected={filter} onSelect={setFilter} />

            <section className="space-y-2">
              <div className="flex min-h-8 items-center justify-between px-1">
                <h2 className="text-[13px] font-semibold text-subtle-foreground">
                  {filter ? `${SUMMARY_TILES.find((t) => t.key === filter)?.label} 주문` : "진행 중"}
                </h2>
                {filter && (
                  <button
                    type="button"
                    onClick={() => setFilter(null)}
                    className="rounded-md px-2 py-1 text-[13px] font-semibold text-primary hover:bg-accent"
                  >
                    전체 보기
                  </button>
                )}
              </div>
              {visibleActive.length === 0 ? (
                <div className="rounded-2xl bg-card ring-1 ring-border">
                  <EmptyState
                    title={filter ? "이 단계에 있는 주문이 없어요" : "진행 중인 주문이 없어요"}
                    description={filter ? undefined : "필요한 약품이 있으면 주문해 주세요."}
                  />
                </div>
              ) : (
                <ActiveOrderList orders={visibleActive} />
              )}
            </section>

            {!filter && <RecentCompleted orders={data.recentCompleted} />}
          </>
        )}
      </div>

      {/* 모바일: 엄지 닿는 곳에 큰 주문 버튼 (하단 탭 위) */}
      <div className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md md:max-w-xl lg:hidden">
        <Link
          href="/orders/new"
          className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-primary text-base font-bold text-primary-foreground shadow-[0_8px_20px_rgb(17_102_167/0.3)]"
        >
          <Plus className="size-5" strokeWidth={2.6} />
          주문하기
        </Link>
      </div>
    </div>
  );
}
