"use client";

import { memo, useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { Camera, Check, ChevronRight, ClipboardCheck, ExternalLink, PackageX, ScanLine, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { FloatingActionBar, Tag } from "@/components/list-parts";
import { SavedViews } from "@/components/workspace/saved-views";
import { FilterBar, SearchField, FilterChip, ClearFilters, Segmented } from "@/components/workspace/filter-bar";
import { DetailPanel, WorkspaceSplit, DetailFields, Timeline, Kbd, type ShortcutHint } from "@/components/workspace/detail-panel";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { BottomSheet } from "@/components/workspace/bottom-sheet";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OutOfStockReasonInput } from "./out-of-stock-reason";
import { formatShort, groupByDay, type OrderGroup } from "@/components/orders/list-format";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { toKSTDateString } from "@/lib/utils/format";
import { logClientAction } from "@/app/(main)/log-action";
import { useAuth } from "@/hooks/use-auth";
import type { OrderWithRequester } from "@/lib/types/order";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { applyRealtimeChange, pruneSet } from "@/lib/utils/realtime-list";
import {
  bulkInspectOrders,
  bulkMarkOutOfStock,
  recordReceivedQuantity,
  updateInspectionMemo,
} from "@/lib/actions/order-mutations";

type ViewKey = "all" | "late" | "partial" | "urgent" | "photo";
type GroupMode = "vendor" | "day";

const NO_VENDOR = "업체 미지정";
const LATE_DAYS = 7;

const isPartial = (o: OrderWithRequester) => (o.received_quantity ?? 0) > 0;

/** 발주(없으면 등록) 후 지난 날 수 — todayKST 기준 */
function daysSince(o: OrderWithRequester, todayKST: string) {
  const day = toKSTDateString(o.dispatched_at ?? o.created_at);
  return Math.round((Date.parse(`${todayKST}T00:00:00+09:00`) - Date.parse(`${day}T00:00:00+09:00`)) / 86400000);
}

function shortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }).replace(/\.\s?/g, "/").replace(/\/$/, "");
}

/** 업체별 묶음: 업체 이름순, 업체 미지정은 맨 뒤. 묶음 안은 긴급 먼저(그다음 최신순 유지) */
function groupByVendor(orders: OrderWithRequester[]): OrderGroup[] {
  const map = new Map<string, OrderWithRequester[]>();
  for (const o of orders) {
    const key = o.vendor_name?.trim() || "";
    const list = map.get(key);
    if (list) list.push(o);
    else map.set(key, [o]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b, "ko");
    })
    .map(([key, list]) => ({
      key: `v-${key}`,
      label: key || NO_VENDOR,
      mixedDates: true,
      orders: [...list].sort((x, y) => Number(y.is_urgent) - Number(x.is_urgent)),
    }));
}

/** 선택 상자 — 여러 건을 골라 처리할 수 있는 사람(관리자)에게만 그린다 */
function SelectBox({ show, ...props }: { show: boolean } & React.ComponentProps<typeof Checkbox>) {
  return show ? <Checkbox {...props} /> : null;
}

/**
 * 받은 수량 칸 (PC): "1 / 2 박스". 누르면 그 자리에서 숫자 입력 → Enter 저장, Esc 취소.
 * 주문보다 적으면 부분입고로 남고, 다 받으면 검수완료가 된다.
 */
const QtyCell = memo(function QtyCell({
  order,
  onCommit,
  editable,
}: {
  order: OrderWithRequester;
  onCommit: (order: OrderWithRequester, received: number) => Promise<void>;
  /** 받은 수량을 고칠 수 있는가 (관리자) */
  editable: boolean;
}) {
  const received = order.received_quantity ?? 0;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  if (order.quantity <= 0) return <span className="text-muted-foreground">사진 참고</span>;

  if (editing) {
    const commit = async () => {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || value.trim() === "") {
        setEditing(false);
        return;
      }
      setSaving(true);
      try {
        await onCommit(order, n);
      } finally {
        setSaving(false);
        setEditing(false);
      }
    };
    return (
      <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          inputMode="numeric"
          aria-label={`${order.item_name} 받은 수량`}
          value={value}
          disabled={saving}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={() => !saving && setEditing(false)}
          className="h-8 w-14 rounded-md bg-card px-2 text-right text-sm font-bold tabular-nums shadow-[inset_0_0_0_2px_var(--ring)] outline-none"
        />
        <span className="text-muted-foreground">/ {order.quantity}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={!editable}
      onClick={(e) => {
        e.stopPropagation();
        setValue(String(received > 0 ? received : order.quantity));
        setEditing(true);
      }}
      aria-label={`${order.item_name} 받은 수량 고치기`}
      className="inline-flex h-8 items-center gap-1 rounded-md px-2 tabular-nums hover:bg-secondary"
    >
      <b className={cn("text-sm font-bold", received > 0 && "text-status-ask")}>{received > 0 ? received : order.quantity}</b>
      <span className="text-muted-foreground">
        / {order.quantity}
        {order.unit ? ` ${order.unit}` : ""}
      </span>
    </button>
  );
});

export function InspectionList({
  initialOrders,
  initialView,
}: {
  initialOrders?: OrderWithRequester[];
  /** ?view= 로 들어온 보기 (처리할 일 → 7일+ 입고 안 됨 등) */
  initialView?: string;
}) {
  const [orders, setOrders] = useState<OrderWithRequester[]>(initialOrders ?? []);
  const [isLoading, setIsLoading] = useState(!initialOrders);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectionNotes, setInspectionNotes] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState("");
  // 검수·품절 처리는 관리자만 할 수 있다(서버도 막는다). 직원에게는 목록만 보여 주고
  // 누르면 실패만 하는 버튼·선택 상자·관리자끼리 보는 메모는 내보이지 않는다.
  const { isAdmin } = useAuth();
  /** 여러 건 품절 처리 창 */
  const [oosOpen, setOosOpen] = useState(false);
  const [oosReason, setOosReason] = useState("");
  const [view, setView] = useState<ViewKey>(() =>
    (["all", "late", "partial", "urgent", "photo"] as const).find((v) => v === initialView) ?? "all"
  );
  const [groupMode, setGroupMode] = useState<GroupMode>("vendor");
  const [query, setQuery] = useState("");
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [requester, setRequester] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  // 묶음 "모두 검수"는 두 번 눌러야 실행 — 확인 대기 중인 묶음 (5초 뒤 자동 해제)
  const [confirmGroup, setConfirmGroup] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmGroup) return;
    const t = setTimeout(() => setConfirmGroup(null), 5000);
    return () => clearTimeout(t);
  }, [confirmGroup]);
  const [qtySheetId, setQtySheetId] = useState<string | null>(null);
  const [todayKST] = useState(() => toKSTDateString(new Date().toISOString()));
  const [memos, setMemos] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const o of initialOrders ?? []) m[o.id] = o.inspection_memo ?? "";
    return m;
  });
  const dirtyMemos = useRef<Set<string>>(new Set());
  const memoTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const supabase = createClient();

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, requester:profiles!requester_id(full_name)")
      .eq("status", "ordered")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    const fetched = (data as OrderWithRequester[]) ?? [];
    setOrders(fetched);
    setMemos((prev) => {
      const next = { ...prev };
      for (const order of fetched) {
        if (!dirtyMemos.current.has(order.id)) {
          next[order.id] = order.inspection_memo ?? "";
        }
      }
      return next;
    });
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ordersRef = useRef(orders);
  useEffect(() => { ordersRef.current = orders; }, [orders]);

  const handleRealtime = useCallback(
    async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const next = await applyRealtimeChange<OrderWithRequester>(ordersRef.current, payload, {
        matchesFilter: (r) => r.status === "ordered",
        fetchOne: async (id) => {
          const { data } = await supabase
            .from("orders")
            .select("*, requester:profiles!requester_id(full_name)")
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
      setMemos((prev) => {
        let changed = false;
        const nm = { ...prev };
        for (const o of next) {
          if (dirtyMemos.current.has(o.id)) continue;
          const v = o.inspection_memo ?? "";
          if (nm[o.id] !== v) { nm[o.id] = v; changed = true; }
        }
        return changed ? nm : prev;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    fetchOrders();

    let firstSub = true;
    const channel = supabase
      .channel("inspection-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, handleRealtime)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (firstSub) { firstSub = false; return; }
          fetchOrders(); // 재연결 시 전체 동기화 (드리프트 보정)
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchOrders, handleRealtime]);

  // ── 보기 → 검색 → 필터 ──
  const isLate = useCallback((o: OrderWithRequester) => daysSince(o, todayKST) >= LATE_DAYS, [todayKST]);
  const viewCounts = useMemo(
    () => ({
      all: orders.length,
      late: orders.filter(isLate).length,
      partial: orders.filter(isPartial).length,
      urgent: orders.filter((o) => o.is_urgent).length,
      photo: orders.filter((o) => (o.photo_urls?.length ?? 0) > 0).length,
    }),
    [orders, isLate]
  );

  const optionsOf = (pick: (o: OrderWithRequester) => string | null | undefined) => {
    const counts = new Map<string, number>();
    for (const o of orders) {
      const v = pick(o)?.trim();
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "ko"))
      .map(([v, c]) => ({ value: v, label: v, hint: `${c}건` }));
  };
  const vendorOptions = useMemo(() => optionsOf((o) => o.vendor_name), [orders]); // eslint-disable-line react-hooks/exhaustive-deps
  const requesterOptions = useMemo(() => optionsOf((o) => o.requester?.full_name), [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleOrders = useMemo(() => {
    let list = orders;
    if (view === "late") list = list.filter(isLate);
    else if (view === "partial") list = list.filter(isPartial);
    else if (view === "urgent") list = list.filter((o) => o.is_urgent);
    else if (view === "photo") list = list.filter((o) => (o.photo_urls?.length ?? 0) > 0);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.item_name.toLowerCase().includes(q) ||
          (o.vendor_name ?? "").toLowerCase().includes(q) ||
          (o.requester?.full_name ?? "").toLowerCase().includes(q) ||
          (memos[o.id] ?? "").toLowerCase().includes(q)
      );
    }
    if (vendorFilter) list = list.filter((o) => o.vendor_name?.trim() === vendorFilter);
    if (requester) list = list.filter((o) => o.requester?.full_name === requester);
    return list;
  }, [orders, view, isLate, query, memos, vendorFilter, requester]);

  const hasFilters = !!query.trim() || !!vendorFilter || !!requester;
  const clearFilters = () => {
    setQuery("");
    setVendorFilter(null);
    setRequester(null);
  };

  const groups = useMemo<OrderGroup[]>(
    () => (groupMode === "vendor" ? groupByVendor(visibleOrders) : groupByDay(visibleOrders, todayKST)),
    [visibleOrders, groupMode, todayKST]
  );
  const flatOrders = useMemo(() => groups.flatMap((g) => g.orders), [groups]);
  const detailOrder = detailId ? orders.find((o) => o.id === detailId) ?? null : null;
  const detailIndex = detailOrder ? flatOrders.findIndex((o) => o.id === detailOrder.id) : -1;
  const qtyOrder = qtySheetId ? orders.find((o) => o.id === qtySheetId) ?? null : null;

  const allSelected = visibleOrders.length > 0 && visibleOrders.every((o) => selectedIds.has(o.id));
  const someSelected = !allSelected && visibleOrders.some((o) => selectedIds.has(o.id));

  const handleMemoChange = useCallback((orderId: string, value: string) => {
    setMemos((prev) => ({ ...prev, [orderId]: value }));
    dirtyMemos.current.add(orderId);
    if (memoTimers.current[orderId]) clearTimeout(memoTimers.current[orderId]);
    memoTimers.current[orderId] = setTimeout(async () => {
      await updateInspectionMemo(orderId, value);
      dirtyMemos.current.delete(orderId);
    }, 500);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** 묶음 단위 선택 — 업체 하나가 한 번에 들어오는 경우가 많아 묶음째 검수 */
  const toggleGroup = (g: OrderGroup) => {
    const all = g.orders.every((o) => selectedIds.has(o.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const o of g.orders) {
        if (all) next.delete(o.id);
        else next.add(o.id);
      }
      return next;
    });
  };

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

  /** 검수 완료: 주문 수량만큼 받은 것으로 처리 (부분입고였던 것도 다 받은 것으로) */
  const inspectIds = async (ids: string[], label: string) => {
    if (ids.length === 0) return;
    setIsProcessing(true);
    setActionError("");
    try {
      const items = ids.map((id) => {
        const order = orders.find((o) => o.id === id)!;
        return {
          id,
          confirmedQuantity: order.quantity,
          invoiceReceived: true,
          inspectionNotes: inspectionNotes[id] ?? "",
        };
      });
      await bulkInspectOrders(items);
      logClientAction("inspection", "inspect_bulk", `${label} ${ids.length}건 검수`);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setInspectionNotes((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      if (detailId && ids.includes(detailId)) {
        const after = flatOrders.slice(detailIndex + 1).find((o) => !ids.includes(o.id));
        setDetailId(after?.id ?? null);
      }
      await fetchOrders();
    } catch {
      setActionError("검수 완료로 바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setIsProcessing(false);
    }
  };

  /** 받은 수량 기록: 주문보다 적으면 부분입고, 다 받으면 검수완료 */
  const commitReceived = useCallback(
    async (order: OrderWithRequester, received: number) => {
      setActionError("");
      try {
        const res = await recordReceivedQuantity(order.id, received, inspectionNotes[order.id] ?? "");
        logClientAction(
          "inspection",
          res.completed ? "inspect_order" : "partial_receive",
          `${order.item_name} ${res.completed ? "검수 완료" : `부분입고 ${received}/${order.quantity}`}`
        );
        await fetchOrders();
      } catch {
        setActionError("받은 수량을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inspectionNotes]
  );

  // ── 키보드 (PC) ── 패널이 열려 있을 때의 J/K·Esc 는 DetailPanel, Space·M·N 은 InspectionDetail 이 맡는다
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  useShortcuts(
    {
      // 패널이 닫혀 있으면 J 는 첫 품목, K 는 마지막 품목부터 연다
      KeyJ: !detailOrder && flatOrders.length > 0 && (() => setDetailId(flatOrders[0].id)),
      KeyK: !detailOrder && flatOrders.length > 0 && (() => setDetailId(flatOrders[flatOrders.length - 1].id)),
      KeyX: isAdmin && !!detailOrder && (() => toggleSelect(detailOrder.id)),
      "mod+Enter": isAdmin && selectedIds.size > 0 && (() => {
        if (!isProcessing) void inspectIds([...selectedIds], "선택");
      }),
    },
    isDesktop
  );
  // 키보드로 옮겨 간 줄이 화면 밖이면 보이게
  useEffect(() => {
    if (!detailId || !isDesktop) return;
    document.querySelector(`tr[data-row-id="${detailId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [detailId, isDesktop]);

  const handleBulkOutOfStock = async () => {
    const reason = oosReason.trim();
    if (selectedIds.size === 0 || !reason) return;

    setIsProcessing(true);
    try {
      await bulkMarkOutOfStock([...selectedIds], reason);
      logClientAction("inspection", "out_of_stock_bulk", `${selectedIds.size}건 일괄 품절 (사유: ${reason})`);
      setOosOpen(false);
      setOosReason("");
      setSelectedIds(new Set());
      setInspectionNotes({});
      await fetchOrders();
    } catch {
      setActionError("품절로 바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setIsProcessing(false);
    }
  };

  const header = (
    <PageHeader
      title="검수"
      description={`검수 대기 ${orders.length}건${viewCounts.late > 0 ? ` · ${LATE_DAYS}일 넘은 것 ${viewCounts.late}` : ""}`}
      action={
        isAdmin && (
          <Button asChild variant="outline" className="h-10 rounded-lg px-3 text-[13px] lg:h-9">
            <Link href="/invoice-scan">
              <ScanLine className="size-4" />
              <span className="hidden sm:inline">명세서로 검수</span>
              <span className="sm:hidden">명세서</span>
            </Link>
          </Button>
        )
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <div className="p-4 lg:px-6">
          <EmptyState title="검수 목록을 불러오지 못했어요" description={error} />
        </div>
      </>
    );
  }

  const showVendorInRow = groupMode === "day";
  const emptyTitle = hasFilters
    ? "조건에 맞는 품목이 없어요"
    : view === "late"
      ? `${LATE_DAYS}일 넘게 기다리는 품목이 없어요`
      : view === "partial"
        ? "부분입고된 품목이 없어요"
        : view === "urgent"
          ? "긴급 검수 대기 품목이 없어요"
          : view === "photo"
            ? "사진이 있는 품목이 없어요"
            : "검수할 품목이 없어요";

  /** 품목 아래 보조 줄: 업체(날짜별일 때) · 요청자 · 발주일 · 사진 */
  const metaLine = (o: OrderWithRequester, withQty: boolean) => (
    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
      {withQty && o.quantity > 0 && (
        <>
          <b className="shrink-0 font-semibold tabular-nums text-foreground">
            {o.quantity}
            {o.unit ? ` ${o.unit}` : ""}
          </b>
          <span aria-hidden="true">·</span>
        </>
      )}
      {showVendorInRow && (
        <>
          <span className={cn("truncate", !o.vendor_name && "text-status-ask")}>{o.vendor_name || NO_VENDOR}</span>
          <span aria-hidden="true">·</span>
        </>
      )}
      {o.requester?.full_name && (
        <>
          <span className="shrink-0">{o.requester.full_name}</span>
          <span aria-hidden="true">·</span>
        </>
      )}
      <span className={cn("shrink-0 tabular-nums", isLate(o) && "font-semibold text-status-late")}>
        {formatShort(o.dispatched_at ?? o.created_at, true)}
      </span>
      {o.photo_urls?.length > 0 && (
        <span className="flex shrink-0 items-center gap-0.5">
          <span aria-hidden="true">·</span>
          <Camera className="size-3.5" aria-label="사진" />
          {o.photo_urls.length}
        </span>
      )}
    </span>
  );

  const itemTitle = (o: OrderWithRequester) => (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-[15px] font-semibold leading-snug">{o.item_name}</span>
      {o.is_urgent && <Tag tone="danger">긴급</Tag>}
    </span>
  );

  const partialBadge = (o: OrderWithRequester) =>
    isPartial(o) && o.quantity > 0 ? (
      <span className="mt-1 inline-flex h-5 items-center gap-1 rounded-full bg-status-ask-bg px-2 text-xs font-semibold text-status-ask">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
        부분입고 · {o.quantity - (o.received_quantity ?? 0)}개 남음
      </span>
    ) : null;

  const groupHeader = (g: OrderGroup, compact = false) => {
    const groupAll = g.orders.every((o) => selectedIds.has(o.id));
    const groupSome = !groupAll && g.orders.some((o) => selectedIds.has(o.id));
    const lateInGroup = g.orders.some(isLate);
    return (
      <span className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-1">
        <SelectBox show={isAdmin}
          className="size-[18px]"
          checked={groupAll ? true : groupSome ? "indeterminate" : false}
          onCheckedChange={() => toggleGroup(g)}
          aria-label={`${g.label} 묶음 전체 선택`}
        />
        <span
          className={cn(
            groupMode === "vendor" ? "text-[15px] font-bold" : "text-[13px] font-bold",
            g.urgent ? "text-status-late" : g.key === "v-" ? "text-status-ask" : groupMode === "vendor" ? "text-foreground" : "text-subtle-foreground"
          )}
        >
          {g.label}
        </span>
        <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
          {g.hint ? `${g.hint} · ` : ""}
          {g.orders.length}건
        </span>
        {lateInGroup && groupMode === "vendor" && (
          <span className="inline-flex h-5 items-center rounded-full bg-status-late-bg px-2 text-xs font-semibold text-status-late">
            {LATE_DAYS}일 지남
          </span>
        )}
        {isAdmin && groupMode === "vendor" &&
          (confirmGroup === g.key ? (
            // 한 번 더 눌러야 실행 (실수로 묶음 전체가 검수완료되지 않도록)
            <span className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                className={cn("rounded-lg", compact ? "h-9" : "h-8")}
                disabled={isProcessing}
                onClick={() => {
                  setConfirmGroup(null);
                  inspectIds(g.orders.map((o) => o.id), g.label);
                }}
              >
                <Check className="size-4" />
                {g.orders.length}건 검수 완료
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn("rounded-lg px-2", compact ? "h-9" : "h-8")}
                onClick={() => setConfirmGroup(null)}
              >
                취소
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className={cn("ml-auto rounded-lg bg-card", compact ? "h-9" : "h-8")}
              disabled={isProcessing}
              onClick={() => setConfirmGroup(g.key)}
            >
              <Check className="size-4" />
              {compact ? "모두 검수" : `${g.orders.length}건 모두 검수`}
            </Button>
          ))}
      </span>
    );
  };

  return (
    <>
      {header}
      <div className={cn("space-y-3 p-4 lg:px-6", selectedIds.size > 0 && "pb-28 lg:pb-24")}>
        <SavedViews<ViewKey>
          value={view}
          onValueChange={setView}
          views={[
            { value: "all", label: "전체", count: viewCounts.all },
            { value: "late", label: `${LATE_DAYS}일+ 입고 안 됨`, count: viewCounts.late },
            { value: "partial", label: "부분입고", count: viewCounts.partial },
            { value: "urgent", label: "긴급", count: viewCounts.urgent },
            { value: "photo", label: "사진 있음", count: viewCounts.photo },
          ]}
        />
        <FilterBar>
          <SearchField id="inspection-search" value={query} onChange={setQuery} placeholder="품목·업체·요청자·메모 검색" />
          <FilterChip label="업체" options={vendorOptions} value={vendorFilter} onChange={setVendorFilter} />
          <FilterChip label="요청자" options={requesterOptions} value={requester} onChange={setRequester} />
          <ClearFilters show={hasFilters} onClear={clearFilters} />
          <Segmented<GroupMode>
            className="ml-auto"
            ariaLabel="묶는 방법"
            value={groupMode}
            onValueChange={setGroupMode}
            items={[
              { value: "vendor", label: "업체별" },
              { value: "day", label: "날짜별" },
            ]}
          />
        </FilterBar>

        {actionError && (
          <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
            {actionError}
          </p>
        )}

        {isLoading ? (
          <ListSkeleton rows={8} />
        ) : visibleOrders.length === 0 ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState
              title={emptyTitle}
              description={hasFilters ? "검색어나 필터를 바꿔 보세요." : undefined}
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
              <label className="flex min-h-8 cursor-pointer items-center gap-2 px-1 text-[13px] font-medium text-subtle-foreground lg:hidden">
                <SelectBox show={isAdmin}
                  className="size-[18px]"
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAll}
                />
                전체 선택 ({visibleOrders.length}건)
              </label>

              {/* PC 표 */}
              <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-border lg:block">
                <table className="w-full border-separate border-spacing-0 text-[13px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-muted-foreground">
                      <th className="w-11 border-b border-border bg-muted py-2 pl-4">
                        <SelectBox show={isAdmin}
                          className="size-[18px]"
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={toggleSelectAll}
                          aria-label="보이는 품목 전체 선택"
                        />
                      </th>
                      <th className="border-b border-border bg-muted px-3 py-2 font-semibold">품목</th>
                      <th className="w-40 border-b border-border bg-muted px-3 py-2 text-right font-semibold">받은 수량 / 주문</th>
                      <th className="w-[26%] border-b border-border bg-muted px-3 py-2 font-semibold">메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g, gi) => [
                      <tr key={`g-${g.key}`}>
                        <td colSpan={4} className={cn("bg-muted py-2 pl-4 pr-3", gi > 0 && "border-t border-border")}>
                          {groupHeader(g)}
                        </td>
                      </tr>,
                      ...g.orders.map((order) => {
                        const isSelected = selectedIds.has(order.id);
                        const isOpen = detailId === order.id;
                        const memoValue = memos[order.id] ?? "";
                        return (
                          <tr
                            key={order.id}
                            data-row-id={order.id}
                            onClick={() => setDetailId(order.id)}
                            className={cn(
                              "cursor-pointer",
                              isPartial(order) ? "bg-status-ask-bg/40" : "",
                              isSelected || isOpen ? "bg-row-selected" : "hover:bg-muted/60",
                              isOpen && "shadow-[inset_3px_0_0_var(--primary)]"
                            )}
                          >
                            <td className="border-t border-border py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                              <SelectBox show={isAdmin}
                                className="size-[18px]"
                                checked={isSelected}
                                onCheckedChange={() => toggleSelect(order.id)}
                                aria-label={`${order.item_name} 선택`}
                              />
                            </td>
                            <td className="min-w-0 border-t border-border px-3 py-2.5">
                              {itemTitle(order)}
                              {metaLine(order, false)}
                            </td>
                            <td className="border-t border-border px-3 py-2 text-right align-middle">
                              <QtyCell order={order} onCommit={commitReceived} editable={isAdmin} />
                              {partialBadge(order) && <div>{partialBadge(order)}</div>}
                            </td>
                            <td className="border-t border-border px-3 py-2 pr-4" onClick={(e) => e.stopPropagation()}>
                              {/* 메모는 입력 즉시 자동 저장. 비어 있을 땐 상자 없이 옅게 */}
                              <Input
                                type="text"
                                placeholder={isAdmin ? "+ 메모" : ""}
                                disabled={!isAdmin}
                                value={isAdmin ? memoValue : ""}
                                onChange={(e) => handleMemoChange(order.id, e.target.value)}
                                aria-label={`${order.item_name} 메모`}
                                className={cn(
                                  "h-8 text-[13px] shadow-none",
                                  memoValue
                                    ? "border-input bg-card"
                                    : "border-transparent bg-transparent placeholder:text-muted-foreground hover:border-input hover:bg-card focus-visible:bg-card"
                                )}
                              />
                            </td>
                          </tr>
                        );
                      }),
                    ])}
                  </tbody>
                </table>
              </div>
              <p className="hidden px-1 text-xs text-muted-foreground lg:block">
                수량 칸을 누르면 그 자리에서 고칠 수 있어요. 주문보다 적게 받으면 부분입고로 남아요.
                {isAdmin && (
                  <>
                    {" "}키보드: <Kbd>J</Kbd> 첫 품목 열기 → <Kbd>Space</Kbd> 검수 완료하고 다음으로 · <Kbd>?</Kbd> 단축키 전체
                  </>
                )}
              </p>

              {/* 모바일/태블릿: 묶음 카드 */}
              <div className="space-y-2.5 lg:hidden">
                {groups.map((g) => (
                  <section
                    key={g.key}
                    className={cn("overflow-hidden rounded-2xl bg-card ring-1", g.urgent ? "ring-status-late/40" : "ring-border")}
                  >
                    <div className="flex min-h-12 items-center border-b border-border px-4 py-2">{groupHeader(g, true)}</div>
                    {g.orders.map((order, i) => {
                      const isSelected = selectedIds.has(order.id);
                      const received = order.received_quantity ?? 0;
                      return (
                        <div
                          key={order.id}
                          className={cn(
                            "flex items-start gap-3 px-4 py-3",
                            i > 0 && "border-t border-border",
                            isPartial(order) && "bg-status-ask-bg/60",
                            isSelected && "bg-row-selected"
                          )}
                        >
                          <SelectBox show={isAdmin}
                            className="mt-0.5 size-[22px] rounded-md"
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(order.id)}
                            aria-label={`${order.item_name} 선택`}
                          />
                          <button
                            type="button"
                            onClick={() => setDetailId(order.id)}
                            className="flex min-w-0 flex-1 items-start gap-2 text-left active:opacity-70"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-base font-semibold">{order.item_name}</span>
                                {order.is_urgent && <Tag tone="danger">긴급</Tag>}
                              </span>
                              {metaLine(order, true)}
                              {partialBadge(order)}
                              {isAdmin && memos[order.id] && (
                                <span className="mt-0.5 block truncate text-[13px] text-subtle-foreground">메모: {memos[order.id]}</span>
                              )}
                            </span>
                          </button>
                          {order.quantity > 0 ? (
                            <button
                              type="button"
                              disabled={!isAdmin}
                              onClick={() => setQtySheetId(order.id)}
                              aria-label={`${order.item_name} 받은 수량·메모`}
                              className={cn(
                                "h-10 min-w-14 shrink-0 rounded-[10px] px-2 text-sm font-bold tabular-nums",
                                received > 0
                                  ? "bg-card text-status-ask shadow-[inset_0_0_0_1px_var(--status-ask)]"
                                  : "bg-muted text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                              )}
                            >
                              {received > 0 ? received : order.quantity}/{order.quantity}
                            </button>
                          ) : (
                            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          )}
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            </div>

            {detailOrder && (
              <InspectionDetail
                order={detailOrder}
                late={isLate(detailOrder)}
                memo={memos[detailOrder.id] ?? ""}
                onMemoChange={(v) => handleMemoChange(detailOrder.id, v)}
                notes={inspectionNotes[detailOrder.id] ?? ""}
                onNotesChange={(v) => setInspectionNotes((prev) => ({ ...prev, [detailOrder.id]: v }))}
                onClose={() => setDetailId(null)}
                onPrev={detailIndex > 0 ? () => setDetailId(flatOrders[detailIndex - 1].id) : undefined}
                onNext={detailIndex >= 0 && detailIndex < flatOrders.length - 1 ? () => setDetailId(flatOrders[detailIndex + 1].id) : undefined}
                onInspect={() => inspectIds([detailOrder.id], detailOrder.item_name)}
                canAct={isAdmin}
                processing={isProcessing}
              />
            )}
          </WorkspaceSplit>
        )}
      </div>

      {qtyOrder && (
        <ReceivedSheet
          key={qtyOrder.id}
          order={qtyOrder}
          memo={memos[qtyOrder.id] ?? ""}
          onMemoChange={(v) => handleMemoChange(qtyOrder.id, v)}
          onClose={() => setQtySheetId(null)}
          onSave={async (n) => {
            await commitReceived(qtyOrder, n);
            setQtySheetId(null);
          }}
        />
      )}

      {selectedIds.size > 0 && (
        <FloatingActionBar label={`${selectedIds.size}건 선택`}>
          <Button
            size="sm"
            className="h-9 bg-white/15 text-white hover:bg-white/25"
            onClick={() => { setOosReason(""); setOosOpen(true); }}
            disabled={isProcessing}
          >
            <PackageX className="size-4" />
            품절
          </Button>
          <Button size="sm" className="h-9" onClick={() => inspectIds([...selectedIds], "선택")} disabled={isProcessing}>
            <ClipboardCheck className="size-4" />
            {isProcessing ? "처리하는 중…" : "검수 완료"}
            {!isProcessing && <Kbd className="hidden bg-white/20 text-white shadow-none lg:inline-flex">Ctrl Enter</Kbd>}
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

      <Dialog open={oosOpen} onOpenChange={(o) => { if (!isProcessing) setOosOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedIds.size}건 품절 처리</DialogTitle>
            <DialogDescription>고른 주문을 모두 품절로 바꾸고, 주문자마다 사유를 알려요.</DialogDescription>
          </DialogHeader>
          <OutOfStockReasonInput id="bulk-out-of-stock-reason" value={oosReason} onChange={setOosReason} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOosOpen(false)} disabled={isProcessing}>취소</Button>
            <Button variant="destructive" onClick={handleBulkOutOfStock} disabled={isProcessing || !oosReason.trim()}>
              {isProcessing ? "처리하는 중…" : "품절 처리"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const INSPECTION_SHORTCUTS: ShortcutHint[] = [
  { keys: "J K", label: "다음 · 이전 품목" },
  { keys: "Space", label: "검수 완료(다 받음)하고 다음 품목으로" },
  { keys: "X", label: "이 품목 선택 / 해제" },
  { keys: "Ctrl Enter", label: "선택한 품목 한꺼번에 검수 완료" },
  { keys: "M", label: "메모 쓰기" },
  { keys: "N", label: "검수 비고 쓰기" },
  { keys: "Esc", label: "입력 빠져나오기 · 패널 닫기" },
];

/** 상세 패널(PC 오른쪽 / 모바일 시트) */
function InspectionDetail({
  order,
  late,
  memo,
  onMemoChange,
  notes,
  onNotesChange,
  onClose,
  onPrev,
  onNext,
  onInspect,
  processing,
  canAct,
}: {
  order: OrderWithRequester;
  late: boolean;
  memo: string;
  onMemoChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onInspect: () => void;
  processing: boolean;
  /** 검수 완료·메모를 쓸 수 있는가 (관리자) */
  canAct: boolean;
}) {
  const received = order.received_quantity ?? 0;
  const at = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
      : undefined;

  // 키보드 (PC, 관리자): Space 검수 완료 → 다음 품목, M 메모, N 검수 비고
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const focusField = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.focus();
  useShortcuts(
    {
      Space: () => {
        if (!processing) onInspect();
      },
      KeyM: () => focusField(`memo-${order.id}`),
      KeyN: () => focusField(`notes-${order.id}`),
    },
    isDesktop && canAct
  );

  return (
    <DetailPanel
      open
      onClose={onClose}
      onPrev={onPrev}
      onNext={onNext}
      shortcuts={canAct ? INSPECTION_SHORTCUTS : undefined}
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
            <Link href={`/inspection/${order.id}`}>
              <ExternalLink className="size-4" />
              전체 보기
            </Link>
          </Button>
          {canAct && (
            <Button className="h-10 flex-[1.6] rounded-lg lg:h-9" disabled={processing} onClick={onInspect}>
              <ClipboardCheck className="size-4" />
              {processing ? "처리하는 중…" : "검수 완료"}
              {!processing && <Kbd className="hidden bg-white/20 text-white shadow-none lg:inline-flex">Space</Kbd>}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <DetailFields
          items={[
            {
              label: "수량",
              value:
                order.quantity > 0 ? (
                  <span className="tabular-nums">
                    <b>{order.quantity}</b> {order.unit}
                    {received > 0 && (
                      <span className="ml-1.5 font-semibold text-status-ask">
                        · {received}개 받음, {order.quantity - received}개 남음
                      </span>
                    )}
                  </span>
                ) : (
                  "사진 참고"
                ),
            },
            { label: "업체", value: order.vendor_name || <span className="text-status-ask">{NO_VENDOR}</span> },
            { label: "요청", value: order.requester?.full_name ?? "—" },
            { label: "비고", value: order.notes || <span className="text-muted-foreground">없음</span> },
          ]}
        />

        {canAct && (
        <>
        <section className="flex flex-col gap-1.5">
          <label htmlFor={`memo-${order.id}`} className="text-[13px] font-semibold text-subtle-foreground">
            메모 <span className="font-normal text-muted-foreground">· 관리자끼리 보는 메모, 바로 저장돼요</span>
          </label>
          <Input
            id={`memo-${order.id}`}
            value={memo}
            onChange={(e) => onMemoChange(e.target.value)}
            placeholder="예: 1개 파손, 반품 예정"
            className="h-10 text-sm lg:h-9"
          />
        </section>

        <section className="flex flex-col gap-1.5">
          <label htmlFor={`notes-${order.id}`} className="text-[13px] font-semibold text-subtle-foreground">
            검수 비고 <span className="font-normal text-muted-foreground">· 검수 완료 때 요청자에게 알림</span>
          </label>
          <Input
            id={`notes-${order.id}`}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="선택 입력"
            className="h-10 text-sm lg:h-9"
          />
        </section>
        </>
        )}

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
              ...(received > 0
                ? [{ key: "partial", text: <><b className="font-semibold text-foreground">부분입고</b> · {received}/{order.quantity}</> }]
                : []),
              {
                key: "dispatched",
                text: (
                  <>
                    <b className="font-semibold text-foreground">발주</b> · {order.vendor_name || NO_VENDOR}
                    {late && <span className="ml-1 font-semibold text-status-late">· {LATE_DAYS}일 넘게 입고 안 됨</span>}
                  </>
                ),
                at: at(order.dispatched_at),
              },
              { key: "created", text: <><b className="font-semibold text-foreground">주문 등록</b> · {order.requester?.full_name ?? "—"}</>, at: at(order.created_at) },
            ]}
          />
        </section>
      </div>
    </DetailPanel>
  );
}

/** 모바일: 받은 수량·메모 시트 */
function ReceivedSheet({
  order,
  memo,
  onMemoChange,
  onClose,
  onSave,
}: {
  order: OrderWithRequester;
  memo: string;
  onMemoChange: (v: string) => void;
  onClose: () => void;
  onSave: (received: number) => Promise<void>;
}) {
  const start = (order.received_quantity ?? 0) > 0 ? order.received_quantity ?? 0 : order.quantity;
  const [n, setN] = useState(start);
  const [saving, setSaving] = useState(false);
  const remaining = order.quantity - n;

  return (
    <BottomSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="몇 개 받았나요?"
      description={`${order.item_name} · 주문 ${order.quantity}${order.unit ? ` ${order.unit}` : ""}`}
      footer={
        <Button
          className="h-12 w-full rounded-[14px] text-base font-bold"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(n);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "저장하는 중…" : remaining > 0 ? `${n}개 받음 · 부분입고로 저장` : "다 받음 · 검수 완료"}
        </Button>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-center justify-between rounded-2xl bg-muted p-1.5">
          <button
            type="button"
            aria-label="하나 빼기"
            onClick={() => setN((v) => Math.max(0, v - 1))}
            className="size-[52px] rounded-[14px] bg-card text-2xl font-bold shadow-[0_0_0_1px_var(--border)]"
          >
            −
          </button>
          <b className="text-3xl tabular-nums">{n}</b>
          <button
            type="button"
            aria-label="하나 더하기"
            onClick={() => setN((v) => Math.min(order.quantity, v + 1))}
            className="size-[52px] rounded-[14px] bg-card text-2xl font-bold shadow-[0_0_0_1px_var(--border)]"
          >
            +
          </button>
        </div>
        <p className={cn("text-center text-sm font-semibold", remaining > 0 ? "text-status-ask" : "text-status-done")}>
          {remaining > 0 ? `${remaining}개는 부분입고로 남아요` : "주문한 만큼 다 받았어요"}
        </p>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-subtle-foreground">메모 (바로 저장)</span>
          <Input value={memo} onChange={(e) => onMemoChange(e.target.value)} placeholder="예: 1개 파손, 반품 예정" className="h-11 text-base" />
        </label>
        <p className="text-xs text-muted-foreground">발주일 {shortDate(order.dispatched_at)} · {order.vendor_name || NO_VENDOR}</p>
      </div>
    </BottomSheet>
  );
}
