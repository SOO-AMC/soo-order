"use client";

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Camera, CheckCheck, ChevronRight, ExternalLink, Undo2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { FloatingActionBar, Tag } from "@/components/list-parts";
import { SavedViews } from "@/components/workspace/saved-views";
import { FilterBar, SearchField, FilterChip, ClearFilters } from "@/components/workspace/filter-bar";
import { DetailPanel, WorkspaceSplit, DetailFields, Timeline } from "@/components/workspace/detail-panel";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { STATUS_TONE_TEXT, StatusIcon } from "@/components/ui/status-badge";
import { ORDER_STATUS_TONE, OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { formatShort } from "@/components/orders/list-format";
import { logClientAction } from "@/app/(main)/log-action";
import type { OrderStatus, OrderWithRequester } from "@/lib/types/order";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { applyRealtimeChange, pruneSet } from "@/lib/utils/realtime-list";
import { bulkDispatchReturn, bulkCompleteReturn } from "@/lib/actions/order-mutations";

const RETURN_STATUSES = new Set(["return_requested", "return_pending"]);
const SELECT =
  "*, requester:profiles!requester_id(full_name), return_requester:profiles!return_requested_by(full_name)";

type ViewKey = "all" | "requested" | "pending" | "urgent" | "photo";

const urgentFirst = (a: OrderWithRequester, b: OrderWithRequester) =>
  a.is_urgent === b.is_urgent ? 0 : a.is_urgent ? -1 : 1;

const at = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : undefined;

export function ReturnList({
  initialOrders,
  headerAction,
  headerLeading,
}: {
  initialOrders?: OrderWithRequester[];
  headerAction?: ReactNode;
  headerLeading?: ReactNode;
}) {
  const [orders, setOrders] = useState<OrderWithRequester[]>(initialOrders ?? []);
  const [isLoading, setIsLoading] = useState(!initialOrders);
  const [error, setError] = useState("");
  const [selectedRequestedIds, setSelectedRequestedIds] = useState<Set<string>>(new Set());
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [view, setView] = useState<ViewKey>("all");
  const [query, setQuery] = useState("");
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const supabase = createClient();

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(SELECT)
      .in("status", ["return_requested", "return_pending"])
      .order("return_requested_at", { ascending: false });

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
        matchesFilter: (r) => RETURN_STATUSES.has(r.status as string),
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
      // 상태가 바뀐 행은 반대쪽 선택에서도 빠지도록 상태별로 정리
      setSelectedRequestedIds((prev) =>
        pruneSet(prev, new Set(next.filter((o) => o.status === "return_requested").map((o) => o.id)))
      );
      setSelectedPendingIds((prev) =>
        pruneSet(prev, new Set(next.filter((o) => o.status === "return_pending").map((o) => o.id)))
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    fetchOrders();

    let firstSub = true;
    const channel = supabase
      .channel("return-list")
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
      requested: orders.filter((o) => o.status === "return_requested").length,
      pending: orders.filter((o) => o.status === "return_pending").length,
      urgent: orders.filter((o) => o.is_urgent).length,
      photo: orders.filter((o) => (o.return_photo_urls?.length ?? 0) > 0).length,
    }),
    [orders]
  );

  const vendorOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) {
      const v = o.vendor_name?.trim();
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko")).map(([v, c]) => ({ value: v, label: v, hint: `${c}건` }));
  }, [orders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (view === "urgent") list = list.filter((o) => o.is_urgent);
    else if (view === "photo") list = list.filter((o) => (o.return_photo_urls?.length ?? 0) > 0);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.item_name.toLowerCase().includes(q) ||
          (o.vendor_name ?? "").toLowerCase().includes(q) ||
          (o.return_requester?.full_name ?? "").toLowerCase().includes(q) ||
          (o.return_reason ?? "").toLowerCase().includes(q)
      );
    }
    if (vendorFilter) list = list.filter((o) => o.vendor_name?.trim() === vendorFilter);
    return list;
  }, [orders, view, query, vendorFilter]);

  const requested = useMemo(() => filtered.filter((o) => o.status === "return_requested").sort(urgentFirst), [filtered]);
  const pending = useMemo(() => filtered.filter((o) => o.status === "return_pending").sort(urgentFirst), [filtered]);
  const showRequested = view !== "pending";
  const showPending = view !== "requested";
  const flatOrders = useMemo(
    () => [...(showRequested ? requested : []), ...(showPending ? pending : [])],
    [requested, pending, showRequested, showPending]
  );
  const detailOrder = detailId ? orders.find((o) => o.id === detailId) ?? null : null;
  const detailIndex = detailOrder ? flatOrders.findIndex((o) => o.id === detailOrder.id) : -1;

  const hasFilters = !!query.trim() || !!vendorFilter;
  const clearFilters = () => {
    setQuery("");
    setVendorFilter(null);
  };

  const toggleIn = (setter: typeof setSelectedRequestedIds) => (id: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllIn = (setter: typeof setSelectedRequestedIds, list: OrderWithRequester[], all: boolean) => () =>
    setter(all ? new Set() : new Set(list.map((o) => o.id)));

  /** 반품 접수 (반품신청 → 반품대기) */
  const dispatch = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsProcessing(true);
    setActionError("");
    try {
      await bulkDispatchReturn(ids);
      logClientAction("return", "dispatch_return_bulk", `${ids.length}건 반품 접수`);
      setSelectedRequestedIds((prev) => pruneSet(prev, new Set([...prev].filter((id) => !ids.includes(id)))));
      await fetchOrders();
    } catch {
      setActionError("반품 접수를 하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setIsProcessing(false);
    }
  };

  /** 반품 완료 (반품대기 → 반품완료) */
  const complete = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsProcessing(true);
    setActionError("");
    try {
      await bulkCompleteReturn(ids);
      logClientAction("return", "complete_return_bulk", `${ids.length}건 반품 완료`);
      setSelectedPendingIds((prev) => pruneSet(prev, new Set([...prev].filter((id) => !ids.includes(id)))));
      if (detailId && ids.includes(detailId)) setDetailId(null);
      await fetchOrders();
    } catch {
      setActionError("반품 완료로 바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setIsProcessing(false);
    }
  };

  const header = (
    <PageHeader
      title="반품"
      description={`처리 대기 ${orders.length}건`}
      leading={headerLeading}
      action={headerAction}
    />
  );

  if (error) {
    return (
      <>
        {header}
        <div className="p-4 lg:px-6">
          <EmptyState title="반품 목록을 불러오지 못했어요" description={error} />
        </div>
      </>
    );
  }

  const showBar = selectedRequestedIds.size > 0 || selectedPendingIds.size > 0;
  const nothing = (showRequested ? requested.length : 0) + (showPending ? pending.length : 0) === 0;

  return (
    <>
      {header}
      <div className={cn("space-y-3 p-4 lg:px-6", showBar && "pb-28 lg:pb-24")}>
        <SavedViews<ViewKey>
          value={view}
          onValueChange={setView}
          views={[
            { value: "all", label: "전체", count: viewCounts.all },
            { value: "requested", label: "반품신청", count: viewCounts.requested },
            { value: "pending", label: "반품대기", count: viewCounts.pending },
            { value: "urgent", label: "긴급", count: viewCounts.urgent },
            { value: "photo", label: "사진 있음", count: viewCounts.photo },
          ]}
        />
        <FilterBar>
          <SearchField id="return-search" value={query} onChange={setQuery} placeholder="품목·업체·신청자·사유 검색" />
          <FilterChip label="업체" options={vendorOptions} value={vendorFilter} onChange={setVendorFilter} />
          <ClearFilters show={hasFilters} onClear={clearFilters} />
        </FilterBar>

        {actionError && (
          <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
            {actionError}
          </p>
        )}

        {isLoading ? (
          <ListSkeleton rows={6} />
        ) : nothing ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState
              title={hasFilters ? "조건에 맞는 반품이 없어요" : "처리할 반품이 없어요"}
              description={hasFilters ? "검색어나 필터를 바꿔 보세요." : "반품 신청이 들어오면 여기에 모여요."}
              icon={Undo2}
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
              {showRequested && (
                <ReturnSection
                  step={1}
                  status="return_requested"
                  title="반품신청"
                  hint="업체에 반품 접수할 품목"
                  emptyText="새 반품 신청이 없어요."
                  orders={requested}
                  selectedIds={selectedRequestedIds}
                  openId={detailId}
                  onToggle={toggleIn(setSelectedRequestedIds)}
                  onToggleAll={toggleAllIn(
                    setSelectedRequestedIds,
                    requested,
                    requested.length > 0 && requested.every((o) => selectedRequestedIds.has(o.id))
                  )}
                  onRowClick={setDetailId}
                />
              )}
              {showPending && (
                <ReturnSection
                  step={2}
                  status="return_pending"
                  title="반품대기"
                  hint="접수 후 업체 회수를 기다리는 품목"
                  emptyText="회수를 기다리는 품목이 없어요."
                  orders={pending}
                  selectedIds={selectedPendingIds}
                  openId={detailId}
                  onToggle={toggleIn(setSelectedPendingIds)}
                  onToggleAll={toggleAllIn(
                    setSelectedPendingIds,
                    pending,
                    pending.length > 0 && pending.every((o) => selectedPendingIds.has(o.id))
                  )}
                  onRowClick={setDetailId}
                />
              )}
            </div>

            {detailOrder && (
              <ReturnDetail
                order={detailOrder}
                onClose={() => setDetailId(null)}
                onPrev={detailIndex > 0 ? () => setDetailId(flatOrders[detailIndex - 1].id) : undefined}
                onNext={detailIndex >= 0 && detailIndex < flatOrders.length - 1 ? () => setDetailId(flatOrders[detailIndex + 1].id) : undefined}
                onDispatch={() => dispatch([detailOrder.id])}
                onComplete={() => complete([detailOrder.id])}
                processing={isProcessing}
              />
            )}
          </WorkspaceSplit>
        )}
      </div>

      {showBar && (
        <FloatingActionBar
          label={[
            selectedRequestedIds.size > 0 && `신청 ${selectedRequestedIds.size}건`,
            selectedPendingIds.size > 0 && `대기 ${selectedPendingIds.size}건`,
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          {selectedRequestedIds.size > 0 && (
            <Button size="sm" className="h-9" onClick={() => dispatch([...selectedRequestedIds])} disabled={isProcessing}>
              <Undo2 className="size-4" />
              {isProcessing ? "처리하는 중…" : "반품 접수"}
            </Button>
          )}
          {selectedPendingIds.size > 0 && (
            <Button
              size="sm"
              className={cn("h-9", selectedRequestedIds.size > 0 && "bg-white/15 text-white hover:bg-white/25")}
              onClick={() => complete([...selectedPendingIds])}
              disabled={isProcessing}
            >
              <CheckCheck className="size-4" />
              {isProcessing ? "처리하는 중…" : "반품 완료"}
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => {
              setSelectedRequestedIds(new Set());
              setSelectedPendingIds(new Set());
            }}
            aria-label="선택 모두 해제"
            title="선택 모두 해제"
          >
            <X className="size-4" />
          </Button>
        </FloatingActionBar>
      )}
    </>
  );
}

interface SectionProps {
  step: number;
  status: OrderStatus;
  title: string;
  hint: string;
  emptyText: string;
  orders: OrderWithRequester[];
  selectedIds: Set<string>;
  openId: string | null;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onRowClick: (id: string) => void;
}

function ItemTitle({ order }: { order: OrderWithRequester }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-[15px] font-semibold leading-snug">{order.item_name}</span>
      {order.is_urgent && <Tag tone="danger">긴급</Tag>}
      {order.type === "return" && <Tag title="주문 이력 없이 직접 등록한 반품">직접등록</Tag>}
    </span>
  );
}

/** 보조 줄: 업체 · 신청자 · 신청 시각 · 사진 */
function MetaLine({ order, withQty }: { order: OrderWithRequester; withQty: boolean }) {
  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
      {withQty && (
        <>
          <span className="shrink-0 font-semibold tabular-nums text-foreground">
            {order.return_quantity ?? order.quantity}
            {order.unit ? ` ${order.unit}` : ""}
          </span>
          <span aria-hidden="true">·</span>
        </>
      )}
      <span className={cn("truncate", !order.vendor_name && "text-status-ask")}>{order.vendor_name || "업체 미지정"}</span>
      {order.return_requester?.full_name && (
        <>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{order.return_requester.full_name}</span>
        </>
      )}
      {order.return_requested_at && (
        <>
          <span aria-hidden="true">·</span>
          <span className="shrink-0 tabular-nums">{formatShort(order.return_requested_at, true)}</span>
        </>
      )}
      {order.return_photo_urls?.length > 0 && (
        <span className="flex shrink-0 items-center gap-0.5">
          <span aria-hidden="true">·</span>
          <Camera className="size-3.5" aria-label="사진" />
          {order.return_photo_urls.length}
        </span>
      )}
    </span>
  );
}

function ReturnSection({
  step,
  status,
  title,
  hint,
  emptyText,
  orders,
  selectedIds,
  openId,
  onToggle,
  onToggleAll,
  onRowClick,
}: SectionProps) {
  const count = orders.length;
  const allSelected = count > 0 && orders.every((o) => selectedIds.has(o.id));
  const someSelected = !allSelected && orders.some((o) => selectedIds.has(o.id));
  const tone = ORDER_STATUS_TONE[status];

  return (
    <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border lg:rounded-xl">
      {/* 단계 머리글: 전체 선택 + 단계 번호 + 상태 + 건수 + 설명 */}
      <div className="flex min-h-12 items-center gap-2.5 bg-muted px-4 py-2">
        <Checkbox
          className="size-[18px]"
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={onToggleAll}
          disabled={count === 0}
          aria-label={`${title} 전체 선택`}
        />
        <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-card text-xs font-bold tabular-nums text-subtle-foreground ring-1 ring-border">
          {step}
        </span>
        <StatusIcon tone={tone} className={cn("size-4", STATUS_TONE_TEXT[tone])} />
        <h2 className="text-[15px] font-bold">{title}</h2>
        <span className="text-[13px] tabular-nums text-muted-foreground">{count}건</span>
        <span className="hidden truncate text-[13px] text-muted-foreground sm:inline">· {hint}</span>
      </div>

      {count === 0 ? (
        <p className="border-t border-border px-4 py-8 text-center text-[13px] text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          {/* PC 표 */}
          <table className="hidden w-full border-separate border-spacing-0 text-[13px] lg:table">
            <thead>
              <tr className="text-left text-xs font-semibold text-muted-foreground">
                <th className="w-11 border-y border-border py-2 pl-4" />
                <th className="border-y border-border px-3 py-2 font-semibold">품목</th>
                <th className="w-24 border-y border-border px-3 py-2 text-right font-semibold">반품 수량</th>
                <th className="w-[38%] border-y border-border px-3 py-2 pr-4 font-semibold">반품 사유</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, i) => {
                const isSelected = selectedIds.has(order.id);
                const isOpen = openId === order.id;
                return (
                  <tr
                    key={order.id}
                    onClick={() => onRowClick(order.id)}
                    className={cn(
                      "cursor-pointer",
                      isSelected || isOpen ? "bg-row-selected" : "hover:bg-muted/60",
                      isOpen && "shadow-[inset_3px_0_0_var(--primary)]"
                    )}
                  >
                    <td className={cn("py-2.5 pl-4", i > 0 && "border-t border-border")} onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        className="size-[18px]"
                        checked={isSelected}
                        onCheckedChange={() => onToggle(order.id)}
                        aria-label={`${order.item_name} 선택`}
                      />
                    </td>
                    <td className={cn("min-w-0 px-3 py-2.5", i > 0 && "border-t border-border")}>
                      <ItemTitle order={order} />
                      <MetaLine order={order} withQty={false} />
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", i > 0 && "border-t border-border")}>
                      <b className="text-sm">{order.return_quantity ?? order.quantity}</b>
                      {order.unit ? <span className="text-subtle-foreground"> {order.unit}</span> : null}
                    </td>
                    <td className={cn("px-3 py-2.5 pr-4", i > 0 && "border-t border-border")}>
                      {order.return_reason ? (
                        <div className="line-clamp-2 leading-snug text-subtle-foreground" title={order.return_reason}>
                          {order.return_reason}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 모바일/태블릿 */}
          <div className="lg:hidden">
            {orders.map((order) => {
              const isSelected = selectedIds.has(order.id);
              return (
                <div
                  key={order.id}
                  className={cn("flex items-start gap-3 border-t border-border px-4 py-3 transition-colors", isSelected && "bg-row-selected")}
                >
                  <Checkbox
                    className="mt-0.5 size-[22px] rounded-md"
                    checked={isSelected}
                    onCheckedChange={() => onToggle(order.id)}
                    aria-label={`${order.item_name} 선택`}
                  />
                  <button type="button" onClick={() => onRowClick(order.id)} className="flex min-w-0 flex-1 items-start gap-2 text-left active:opacity-70">
                    <span className="min-w-0 flex-1">
                      <ItemTitle order={order} />
                      <MetaLine order={order} withQty />
                      {order.return_reason && (
                        <span className="mt-0.5 block truncate text-[13px] text-subtle-foreground">사유: {order.return_reason}</span>
                      )}
                    </span>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/** 상세 패널(PC 오른쪽 / 모바일 시트) */
function ReturnDetail({
  order,
  onClose,
  onPrev,
  onNext,
  onDispatch,
  onComplete,
  processing,
}: {
  order: OrderWithRequester;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDispatch: () => void;
  onComplete: () => void;
  processing: boolean;
}) {
  const isRequested = order.status === "return_requested";
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
            <Link href={`/returns/${order.id}`}>
              <ExternalLink className="size-4" />
              전체 보기
            </Link>
          </Button>
          {isRequested ? (
            <Button className="h-10 flex-[1.6] rounded-lg lg:h-9" disabled={processing} onClick={onDispatch}>
              <Undo2 className="size-4" />
              {processing ? "처리하는 중…" : "반품 접수"}
            </Button>
          ) : (
            <Button className="h-10 flex-[1.6] rounded-lg lg:h-9" disabled={processing} onClick={onComplete}>
              <CheckCheck className="size-4" />
              {processing ? "처리하는 중…" : "반품 완료"}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <DetailFields
          items={[
            {
              label: "반품 수량",
              value: (
                <span className="tabular-nums">
                  <b>{order.return_quantity ?? order.quantity}</b> {order.unit}
                  {order.return_quantity != null && order.quantity > 0 && order.return_quantity !== order.quantity && (
                    <span className="text-muted-foreground"> (주문 {order.quantity})</span>
                  )}
                </span>
              ),
            },
            { label: "업체", value: order.vendor_name || <span className="text-status-ask">업체 미지정</span> },
            { label: "신청", value: `${order.return_requester?.full_name ?? "—"}${order.return_requested_at ? ` · ${at(order.return_requested_at)}` : ""}` },
            { label: "사유", value: order.return_reason || <span className="text-muted-foreground">없음</span> },
          ]}
        />

        {order.return_photo_urls?.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-subtle-foreground">반품 사진 {order.return_photo_urls.length}</h3>
            <PhotoGallery photoUrls={order.return_photo_urls} />
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold text-subtle-foreground">처리 이력</h3>
          <Timeline
            items={[
              ...(order.return_requested_at
                ? [{ key: "ret", text: <><b className="font-semibold text-foreground">반품 신청</b> · {order.return_requester?.full_name ?? "—"}</>, at: at(order.return_requested_at) }]
                : []),
              ...(order.inspected_at ? [{ key: "insp", text: <><b className="font-semibold text-foreground">검수 완료</b></>, at: at(order.inspected_at) }] : []),
              ...(order.dispatched_at
                ? [{ key: "disp", text: <><b className="font-semibold text-foreground">발주</b> · {order.vendor_name || "업체 미지정"}</>, at: at(order.dispatched_at) }]
                : []),
              ...(order.type === "order"
                ? [{ key: "created", text: <><b className="font-semibold text-foreground">주문 등록</b> · {order.requester?.full_name ?? "—"}</>, at: at(order.created_at) }]
                : [{ key: "direct", text: <>주문 이력 없이 <b className="font-semibold text-foreground">직접 등록</b>한 반품</>, at: at(order.created_at) }]),
            ]}
          />
        </section>
      </div>
    </DetailPanel>
  );
}
