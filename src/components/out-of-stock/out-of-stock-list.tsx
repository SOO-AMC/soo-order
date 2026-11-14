"use client";

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Camera, ChevronRight, CircleX, ExternalLink, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { FloatingActionBar, Tag } from "@/components/list-parts";
import { SavedViews } from "@/components/workspace/saved-views";
import { FilterBar, SearchField, FilterChip, ClearFilters } from "@/components/workspace/filter-bar";
import { DetailPanel, WorkspaceSplit, DetailFields, Timeline } from "@/components/workspace/detail-panel";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { QuantityText, formatShort, groupByDay, type OrderGroup } from "@/components/orders/list-format";
import { toKSTDateString } from "@/lib/utils/format";
import { logClientAction } from "@/app/(main)/log-action";
import type { OrderWithRequester } from "@/lib/types/order";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { applyRealtimeChange, pruneSet } from "@/lib/utils/realtime-list";

type ViewKey = "all" | "mine" | "urgent" | "photo";
const SELECT = "*, requester:profiles!requester_id(full_name)";

const at = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : undefined;

function ItemTitle({ order }: { order: OrderWithRequester }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-[15px] font-semibold leading-snug">{order.item_name}</span>
      {order.is_urgent && <Tag tone="danger">긴급</Tag>}
    </span>
  );
}

/** 보조 줄: (수량) · 업체 · 요청자 · 요청 시각 · 사진 */
function MetaLine({ order, withDate, withQty }: { order: OrderWithRequester; withDate: boolean; withQty: boolean }) {
  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
      {withQty && (
        <>
          <QuantityText order={order} />
          <span aria-hidden="true">·</span>
        </>
      )}
      <span className="truncate">{order.vendor_name || "업체 미지정"}</span>
      {order.requester?.full_name && (
        <>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{order.requester.full_name}</span>
        </>
      )}
      <span aria-hidden="true">·</span>
      <span className="shrink-0 tabular-nums">{formatShort(order.created_at, withDate)}</span>
      {order.photo_urls?.length > 0 && (
        <span className="flex shrink-0 items-center gap-0.5">
          <span aria-hidden="true">·</span>
          <Camera className="size-3.5" aria-label="사진" />
          {order.photo_urls.length}
        </span>
      )}
    </span>
  );
}

export function OutOfStockList({
  initialOrders,
  headerAction,
}: {
  initialOrders?: OrderWithRequester[];
  headerAction?: ReactNode;
}) {
  const { isAdmin, userId: currentUserId } = useAuth();
  const [orders, setOrders] = useState<OrderWithRequester[]>(initialOrders ?? []);
  const [isLoading, setIsLoading] = useState(!initialOrders);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState("");
  /** 삭제 확인창에 올릴 대상 (선택 묶음 또는 상세 1건) */
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [view, setView] = useState<ViewKey>("all");
  const [query, setQuery] = useState("");
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [todayKST] = useState(() => toKSTDateString(new Date().toISOString()));
  const supabase = createClient();

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(SELECT)
      .eq("status", "out_of_stock")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    setOrders((data as OrderWithRequester[]) ?? []);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ordersRef = useRef(orders);
  useEffect(() => { ordersRef.current = orders; }, [orders]);

  const handleRealtime = useCallback(
    async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const next = await applyRealtimeChange<OrderWithRequester>(ordersRef.current, payload, {
        matchesFilter: (r) => r.status === "out_of_stock",
        fetchOne: async (id) => {
          const { data } = await supabase
            .from("orders")
            .select(SELECT)
            .eq("id", id)
            .maybeSingle();
          return (data as OrderWithRequester) ?? null;
        },
      });
      if (next === ordersRef.current) return;
      ordersRef.current = next;
      setOrders(next);
      const validIds = new Set(next.map((o) => o.id));
      setSelectedIds((prev) => pruneSet(prev, validIds));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    fetchOrders();

    let firstSub = true;
    const channel = supabase
      .channel("out-of-stock-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, handleRealtime)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (firstSub) { firstSub = false; return; }
          fetchOrders();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchOrders, handleRealtime]);

  // ── 보기 → 검색 → 필터 ──
  const viewCounts = useMemo(
    () => ({
      all: orders.length,
      mine: orders.filter((o) => o.requester_id === currentUserId).length,
      urgent: orders.filter((o) => o.is_urgent).length,
      photo: orders.filter((o) => (o.photo_urls?.length ?? 0) > 0).length,
    }),
    [orders, currentUserId]
  );

  const vendorOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) {
      const v = o.vendor_name?.trim();
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko")).map(([v, c]) => ({ value: v, label: v, hint: `${c}건` }));
  }, [orders]);

  const visibleOrders = useMemo(() => {
    let list = orders;
    if (view === "mine") list = list.filter((o) => o.requester_id === currentUserId);
    else if (view === "urgent") list = list.filter((o) => o.is_urgent);
    else if (view === "photo") list = list.filter((o) => (o.photo_urls?.length ?? 0) > 0);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.item_name.toLowerCase().includes(q) ||
          (o.vendor_name ?? "").toLowerCase().includes(q) ||
          (o.requester?.full_name ?? "").toLowerCase().includes(q) ||
          (o.order_notes ?? "").toLowerCase().includes(q)
      );
    }
    if (vendorFilter) list = list.filter((o) => o.vendor_name?.trim() === vendorFilter);
    return list;
  }, [orders, view, query, vendorFilter, currentUserId]);

  const groups = useMemo<OrderGroup[]>(() => groupByDay(visibleOrders, todayKST), [visibleOrders, todayKST]);
  const flatOrders = useMemo(() => groups.flatMap((g) => g.orders), [groups]);
  const detailOrder = detailId ? orders.find((o) => o.id === detailId) ?? null : null;
  const detailIndex = detailOrder ? flatOrders.findIndex((o) => o.id === detailOrder.id) : -1;

  const hasFilters = !!query.trim() || !!vendorFilter;
  const clearFilters = () => {
    setQuery("");
    setVendorFilter(null);
  };

  const allSelected = visibleOrders.length > 0 && visibleOrders.every((o) => selectedIds.has(o.id));
  const someSelected = !allSelected && visibleOrders.some((o) => selectedIds.has(o.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 전체 선택은 지금 보이는 목록 기준
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const o of visibleOrders) {
        if (allSelected) next.delete(o.id);
        else next.add(o.id);
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteIds || deleteIds.length === 0) return;
    setIsProcessing(true);
    setActionError("");

    const { error } = await supabase.from("orders").delete().in("id", deleteIds);

    if (error) {
      setIsProcessing(false);
      setDeleteIds(null);
      setActionError("삭제하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
      return;
    }

    logClientAction("order", "delete_out_of_stock", `${deleteIds.length}건 품절 삭제`);
    setSelectedIds((prev) => new Set([...prev].filter((id) => !deleteIds.includes(id))));
    if (detailId && deleteIds.includes(detailId)) setDetailId(null);
    setIsProcessing(false);
    setDeleteIds(null);
    await fetchOrders();
  };

  const header = <PageHeader title="품절" description={`품절 ${orders.length}건`} action={headerAction} />;

  if (error) {
    return (
      <>
        {header}
        <div className="p-4 lg:px-6">
          <EmptyState title="품절 목록을 불러오지 못했어요" description={error} />
        </div>
      </>
    );
  }

  const showBar = isAdmin && selectedIds.size > 0;
  const deleteTarget = deleteIds?.length === 1 ? orders.find((o) => o.id === deleteIds[0]) : undefined;

  return (
    <>
      {header}
      <div className={cn("space-y-3 p-4 lg:px-6", showBar && "pb-28 lg:pb-24")}>
        <SavedViews<ViewKey>
          value={view}
          onValueChange={setView}
          views={[
            { value: "all", label: "전체", count: viewCounts.all },
            { value: "mine", label: "내 요청", count: viewCounts.mine },
            { value: "urgent", label: "긴급", count: viewCounts.urgent },
            { value: "photo", label: "사진 있음", count: viewCounts.photo },
          ]}
        />
        <FilterBar>
          <SearchField id="oos-search" value={query} onChange={setQuery} placeholder="품목·업체·요청자·비고 검색" />
          <FilterChip label="업체" options={vendorOptions} value={vendorFilter} onChange={setVendorFilter} />
          <ClearFilters show={hasFilters} onClear={clearFilters} />
          {isAdmin && visibleOrders.length > 0 && (
            <label className="ml-auto hidden cursor-pointer items-center gap-2 text-[13px] font-medium text-subtle-foreground lg:flex">
              <Checkbox
                className="size-[18px]"
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleSelectAll}
              />
              전체 선택 {visibleOrders.length}건
            </label>
          )}
        </FilterBar>

        {actionError && (
          <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
            {actionError}
          </p>
        )}

        {isLoading ? (
          <ListSkeleton rows={6} />
        ) : visibleOrders.length === 0 ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState
              title={hasFilters ? "조건에 맞는 품절 품목이 없어요" : view === "mine" ? "내 요청 중 품절된 것이 없어요" : "품절 품목이 없어요"}
              description={hasFilters ? "검색어나 필터를 바꿔 보세요." : "업체에서 품절로 돌아온 주문이 여기에 모여요."}
              icon={CircleX}
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    필터 지우기
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <WorkspaceSplit>
            <div className="min-w-0 flex-1 space-y-3">
              {/* 모바일: 전체 선택 */}
              {isAdmin && (
                <label className="flex min-h-9 cursor-pointer items-center gap-2.5 px-1 text-[13px] font-medium text-subtle-foreground lg:hidden">
                  <Checkbox
                    className="size-[22px] rounded-md"
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleSelectAll}
                  />
                  전체 선택 {visibleOrders.length}건
                </label>
              )}

              {/* PC 표: 날짜 묶음 행 */}
              <section className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-border lg:block">
                <table className="w-full border-separate border-spacing-0 text-[13px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-muted-foreground">
                      {isAdmin && <th className="w-11 border-b border-border py-2 pl-4" />}
                      <th className={cn("border-b border-border px-3 py-2 font-semibold", !isAdmin && "pl-4")}>품목</th>
                      <th className="w-24 border-b border-border px-3 py-2 text-right font-semibold">수량</th>
                      <th className="w-[36%] border-b border-border px-3 py-2 pr-4 font-semibold">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => [
                      <tr key={`g-${g.key}`}>
                        <td colSpan={isAdmin ? 4 : 3} className="border-b border-border bg-muted px-4 py-2">
                          <GroupLabel group={g} />
                        </td>
                      </tr>,
                      ...g.orders.map((order) => {
                        const isSelected = selectedIds.has(order.id);
                        const isOpen = detailId === order.id;
                        return (
                          <tr
                            key={order.id}
                            onClick={() => setDetailId(order.id)}
                            className={cn(
                              "cursor-pointer",
                              isSelected || isOpen ? "bg-row-selected" : "hover:bg-muted/60",
                              isOpen && "shadow-[inset_3px_0_0_var(--primary)]"
                            )}
                          >
                            {isAdmin && (
                              <td className="border-b border-border py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  className="size-[18px]"
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelect(order.id)}
                                  aria-label={`${order.item_name} 선택`}
                                />
                              </td>
                            )}
                            <td className={cn("min-w-0 border-b border-border px-3 py-2.5", !isAdmin && "pl-4")}>
                              <ItemTitle order={order} />
                              <MetaLine order={order} withDate={!!g.mixedDates} withQty={false} />
                            </td>
                            <td className="border-b border-border px-3 py-2.5 text-right tabular-nums">
                              {order.quantity > 0 ? (
                                <>
                                  <b className="text-sm">{order.quantity}</b>
                                  {order.unit ? <span className="text-subtle-foreground"> {order.unit}</span> : null}
                                </>
                              ) : (
                                <span className="text-muted-foreground">사진 참고</span>
                              )}
                            </td>
                            <td className="border-b border-border px-3 py-2.5 pr-4">
                              {order.order_notes ? (
                                <div className="line-clamp-2 leading-snug text-subtle-foreground" title={order.order_notes}>
                                  {order.order_notes}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      }),
                    ])}
                  </tbody>
                </table>
              </section>

              {/* 모바일/태블릿: 날짜 묶음마다 한 덩어리 */}
              <div className="space-y-3 lg:hidden">
                {groups.map((g) => (
                  <section key={g.key} className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                    <div className="flex min-h-11 items-center bg-muted px-4">
                      <GroupLabel group={g} />
                    </div>
                    {g.orders.map((order) => {
                      const isSelected = selectedIds.has(order.id);
                      return (
                        <div
                          key={order.id}
                          className={cn("flex items-start gap-3 border-t border-border px-4 py-3 transition-colors", isSelected && "bg-row-selected")}
                        >
                          {isAdmin && (
                            <Checkbox
                              className="mt-0.5 size-[22px] rounded-md"
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(order.id)}
                              aria-label={`${order.item_name} 선택`}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => setDetailId(order.id)}
                            className="flex min-w-0 flex-1 items-start gap-2 text-left active:opacity-70"
                          >
                            <span className="min-w-0 flex-1">
                              <ItemTitle order={order} />
                              <MetaLine order={order} withDate={!!g.mixedDates} withQty />
                              {order.order_notes && (
                                <span className="mt-0.5 block truncate text-[13px] text-subtle-foreground">{order.order_notes}</span>
                              )}
                            </span>
                            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            </div>

            {detailOrder && (
              <OutOfStockDetail
                order={detailOrder}
                isAdmin={isAdmin}
                onClose={() => setDetailId(null)}
                onPrev={detailIndex > 0 ? () => setDetailId(flatOrders[detailIndex - 1].id) : undefined}
                onNext={detailIndex >= 0 && detailIndex < flatOrders.length - 1 ? () => setDetailId(flatOrders[detailIndex + 1].id) : undefined}
                onDelete={() => setDeleteIds([detailOrder.id])}
              />
            )}
          </WorkspaceSplit>
        )}
      </div>

      {showBar && (
        <FloatingActionBar label={`${selectedIds.size}건 선택`}>
          <Button size="sm" variant="destructive" className="h-9" onClick={() => setDeleteIds([...selectedIds])} disabled={isProcessing}>
            <Trash2 className="size-4" />
            삭제
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => setSelectedIds(new Set())}
            aria-label="선택 해제"
            title="선택 해제"
          >
            <X className="size-4" />
          </Button>
        </FloatingActionBar>
      )}

      <Dialog open={!!deleteIds} onOpenChange={(o) => { if (!o) setDeleteIds(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>품절 품목을 지울까요?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `"${deleteTarget.item_name}"` : `선택한 ${deleteIds?.length ?? 0}건`}을 목록에서 지워요. 지우면 되돌릴 수 없어요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                취소
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={isProcessing}>
              {isProcessing ? "지우는 중…" : "지우기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GroupLabel({ group: g }: { group: OrderGroup }) {
  return (
    <span className="flex items-center gap-2 text-xs font-semibold">
      <span className={g.urgent ? "text-status-late" : "text-subtle-foreground"}>{g.label}</span>
      <span className="font-medium tabular-nums text-muted-foreground">{g.orders.length}건</span>
      {g.hint && <Tag className="h-[18px]">{g.hint}</Tag>}
    </span>
  );
}

/** 상세 패널(PC 오른쪽 / 모바일 시트) */
function OutOfStockDetail({
  order,
  isAdmin,
  onClose,
  onPrev,
  onNext,
  onDelete,
}: {
  order: OrderWithRequester;
  isAdmin: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDelete: () => void;
}) {
  return (
    <DetailPanel
      open
      onClose={onClose}
      onPrev={onPrev}
      onNext={onNext}
      title={
        <span className="flex items-center gap-2">
          {order.item_name}
          {order.is_urgent && <Tag tone="danger">긴급</Tag>}
        </span>
      }
      badge={<OrderStatusBadge status={order.status} />}
      footer={
        <div className="flex w-full gap-2">
          <Button asChild variant="outline" className="h-10 flex-1 rounded-lg lg:h-9">
            <Link href={`/out-of-stock/${order.id}`}>
              <ExternalLink className="size-4" />
              전체 보기
            </Link>
          </Button>
          {isAdmin && (
            <Button variant="outline" className="h-10 rounded-lg text-status-late hover:text-status-late lg:h-9" onClick={onDelete}>
              <Trash2 className="size-4" />
              지우기
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="rounded-xl bg-status-late-bg px-3.5 py-3 text-[13px] text-status-late">
          업체에서 품절로 알려 왔어요. 대체품이 필요하면 새로 주문해 주세요.
        </p>
        <DetailFields
          items={[
            {
              label: "수량",
              value: order.quantity > 0 ? <span className="tabular-nums"><b>{order.quantity}</b> {order.unit}</span> : "사진 참고",
            },
            { label: "업체", value: order.vendor_name || <span className="text-muted-foreground">업체 미지정</span> },
            { label: "요청", value: `${order.requester?.full_name ?? "—"} · ${at(order.created_at)}` },
            { label: "비고", value: order.order_notes || <span className="text-muted-foreground">없음</span> },
          ]}
        />

        {order.photo_urls?.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-subtle-foreground">사진 {order.photo_urls.length}</h3>
            <PhotoGallery photoUrls={order.photo_urls} />
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold text-subtle-foreground">처리 이력</h3>
          <Timeline
            items={[
              { key: "oos", text: <><b className="font-semibold text-foreground">품절</b> · {order.vendor_name || "업체 미지정"}</>, at: at(order.updated_at) },
              ...(order.dispatched_at
                ? [{ key: "disp", text: <><b className="font-semibold text-foreground">발주</b></>, at: at(order.dispatched_at) }]
                : []),
              { key: "created", text: <><b className="font-semibold text-foreground">주문 등록</b> · {order.requester?.full_name ?? "—"}</>, at: at(order.created_at) },
            ]}
          />
        </section>
      </div>
    </DetailPanel>
  );
}
