"use client";

import { useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { Camera, ChevronRight, ClipboardCopy, Check, ExternalLink, ShoppingCart, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { FloatingActionBar, Tag } from "@/components/list-parts";
import { SavedViews } from "@/components/workspace/saved-views";
import { FilterBar, SearchField, FilterChip, ClearFilters, Segmented } from "@/components/workspace/filter-bar";
import { DetailPanel, WorkspaceSplit, DetailFields, Timeline } from "@/components/workspace/detail-panel";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  VendorPricePopover,
  VENDOR_COLORS,
  initPriceCache,
  usePriceData,
  matchItemPrices,
  type VendorColor,
  type PriceData,
} from "./vendor-price-popover";
import { OrderStatusBadge } from "./order-status-badge";
import { PhotoGallery } from "./photo-gallery";
import { toKSTDateString } from "@/lib/utils/format";
import { QuantityText, formatShort, groupByDay, type OrderGroup } from "./list-format";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import { applyRealtimeChange, pruneSet, pruneMap } from "@/lib/utils/realtime-list";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { copyText } from "@/lib/utils/clipboard";
import { logClientAction } from "@/app/(main)/log-action";
import type { OrderWithRequester } from "@/lib/types/order";
import { bulkDispatchAll, bulkDispatchIndividual } from "@/lib/actions/order-mutations";

/** 저장된 보기 (디자인 시스템 SavedViews) */
type ViewKey = "all" | "novendor" | "urgent" | "photo" | "mine";
type Period = "today" | "2d" | "7d";
type GroupMode = "day" | "vendor";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "오늘" },
  { value: "2d", label: "최근 2일" },
  { value: "7d", label: "최근 7일" },
];

/** 업체명 뒤 조사: 받침 있으면(ㄹ 제외) "으로", 아니면 "로" */
function withRo(name: string) {
  const c = name.charCodeAt(name.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) {
    const jong = (c - 0xac00) % 28;
    return `${name}${jong === 0 || jong === 8 ? "로" : "으로"}`;
  }
  return `${name}(으)로`;
}

/** KST 날짜 문자열에서 n일 전 (YYYY-MM-DD) */
function shiftDay(dayKST: string, n: number) {
  return toKSTDateString(new Date(new Date(`${dayKST}T12:00:00+09:00`).getTime() - n * 86400000).toISOString());
}

export function OrderList({
  initialPriceData,
  initialOrders,
  initialLastVendors,
  headerAction,
  initialView,
}: {
  initialPriceData?: PriceData;
  initialOrders?: OrderWithRequester[];
  initialLastVendors?: Record<string, string>;
  /** 상단바 오른쪽 버튼 (주문 등록) — 서버 페이지에서 넘긴다 */
  headerAction?: ReactNode;
  /** ?view= 로 들어온 보기 (처리할 일 → 긴급 등) */
  initialView?: string;
}) {
  if (initialPriceData) initPriceCache(initialPriceData);
  const { isAdmin, userId: currentUserId } = useAuth();
  const [orders, setOrders] = useState<OrderWithRequester[]>(initialOrders ?? []);
  const [isLoading, setIsLoading] = useState(!initialOrders);
  const [error, setError] = useState("");
  // 선택·업체 지정은 sessionStorage에 남는다. 서버 렌더와 달라지지 않도록 마운트 뒤에 복원한다.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isOrdering, setIsOrdering] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"all" | "individual">("all");
  const [bulkVendorName, setBulkVendorName] = useState("");
  const [bulkOrderNotes, setBulkOrderNotes] = useState("");
  const [individualVendors, setIndividualVendors] = useState<Map<string, string>>(new Map());
  const [individualNotes, setIndividualNotes] = useState<Map<string, string>>(new Map());
  const [vendorSelections, setVendorSelections] = useState<Map<string, string>>(() => new Map());
  const restoredRef = useRef(false);
  const [copiedVendor, setCopiedVendor] = useState("");
  const [bulkSource, setBulkSource] = useState<"checkbox" | "vendor">("checkbox");
  // 품목명(정규화) → 가장 최근에 발주했던 업체명 (서버 초기값. 세션 중 갱신 안 함 — 힌트 용도)
  const [lastVendorByItem] = useState<Map<string, string>>(
    () => new Map(Object.entries(initialLastVendors ?? {}))
  );
  // 보기·필터·묶음·상세
  const [view, setView] = useState<ViewKey>(() =>
    (["all", "novendor", "urgent", "photo", "mine"] as const).find((v) => v === initialView) ?? "all"
  );
  const [query, setQuery] = useState("");
  const [requester, setRequester] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("day");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState("");
  // 오늘(KST) — 날짜 묶음·기간 필터 기준. 렌더 중 new Date() 금지라 지연 초기화
  const [todayKST] = useState(() => toKSTDateString(new Date().toISOString()));
  const supabase = createClient();

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, requester:profiles!requester_id(full_name)")
      .eq("type", "order")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    const fetched = (data as OrderWithRequester[]) ?? [];
    setOrders(fetched);

    // 목록에 없는 선택 항목은 제거 (다른 사람이 발주했거나 삭제된 경우)
    const validIds = new Set(fetched.map((o) => o.id));
    setSelectedIds((prev) => pruneSet(prev, validIds));
    setVendorSelections((prev) => pruneMap(prev, validIds));

    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ordersRef = useRef(orders);
  useEffect(() => { ordersRef.current = orders; }, [orders]);

  // 마운트 뒤 sessionStorage에서 복원 (이미 발주됐거나 삭제된 항목은 제외)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const valid = new Set(ordersRef.current.map((o) => o.id));
        const savedIds = sessionStorage.getItem("order-selected-ids");
        const ids = savedIds ? (JSON.parse(savedIds) as string[]).filter((id) => valid.has(id)) : [];
        const savedVendors = sessionStorage.getItem("order-vendor-selections");
        const entries = savedVendors ? (JSON.parse(savedVendors) as [string, string][]).filter(([id]) => valid.has(id)) : [];
        if (ids.length) setSelectedIds(new Set(ids));
        if (entries.length) setVendorSelections(new Map(entries));
      } catch {}
      restoredRef.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // selectedIds가 바뀔 때마다 sessionStorage에 동기화 (복원 전에는 덮어쓰지 않음)
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      sessionStorage.setItem("order-selected-ids", JSON.stringify([...selectedIds]));
    } catch {}
  }, [selectedIds]);

  // vendorSelections도 동일하게 sessionStorage 동기화 (상세→뒤로가기·탭이동에도 유지)
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      sessionStorage.setItem("order-vendor-selections", JSON.stringify([...vendorSelections]));
    } catch {}
  }, [vendorSelections]);

  const handleRealtime = useCallback(
    async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const next = await applyRealtimeChange<OrderWithRequester>(ordersRef.current, payload, {
        matchesFilter: (r) => r.type === "order" && r.status === "pending",
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
      setVendorSelections((prev) => pruneMap(prev, validIds));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    fetchOrders();

    let firstSub = true;
    const channel = supabase
      .channel("order-list")
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

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => {
      if (a.is_urgent !== b.is_urgent) return a.is_urgent ? -1 : 1;
      return 0;
    }),
    [orders]
  );

  const handleVendorSelect = (orderId: string, vendorName: string) => {
    setVendorSelections((prev) => {
      const next = new Map(prev);
      if (vendorName) next.set(orderId, vendorName);
      else next.delete(orderId);
      return next;
    });
  };

  const vendorColorMap = useMemo(() => {
    const map = new Map<string, VendorColor>();
    let idx = 0;
    for (const vendor of vendorSelections.values()) {
      if (!vendor || map.has(vendor)) continue;
      map.set(vendor, VENDOR_COLORS[idx % VENDOR_COLORS.length]);
      idx++;
    }
    return map;
  }, [vendorSelections]);

  // ── 보기 → 검색 → 필터 ──
  const viewCounts = useMemo(
    () => ({
      all: sortedOrders.length,
      novendor: sortedOrders.filter((o) => !vendorSelections.get(o.id)).length,
      urgent: sortedOrders.filter((o) => o.is_urgent).length,
      photo: sortedOrders.filter((o) => (o.photo_urls?.length ?? 0) > 0).length,
      mine: sortedOrders.filter((o) => o.requester_id === currentUserId).length,
    }),
    [sortedOrders, vendorSelections, currentUserId]
  );

  const requesterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of sortedOrders) {
      const n = o.requester?.full_name;
      if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "ko"))
      .map(([n, c]) => ({ value: n, label: n, hint: `${c}건` }));
  }, [sortedOrders]);

  const visibleOrders = useMemo(() => {
    let list = sortedOrders;
    if (view === "novendor") list = list.filter((o) => !vendorSelections.get(o.id));
    else if (view === "urgent") list = list.filter((o) => o.is_urgent);
    else if (view === "photo") list = list.filter((o) => (o.photo_urls?.length ?? 0) > 0);
    else if (view === "mine") list = list.filter((o) => o.requester_id === currentUserId);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.item_name.toLowerCase().includes(q) ||
          (o.notes ?? "").toLowerCase().includes(q) ||
          (o.requester?.full_name ?? "").toLowerCase().includes(q)
      );
    }
    if (requester) list = list.filter((o) => o.requester?.full_name === requester);
    if (period) {
      const from = period === "today" ? todayKST : period === "2d" ? shiftDay(todayKST, 1) : shiftDay(todayKST, 6);
      list = list.filter((o) => toKSTDateString(o.created_at) >= from);
    }
    return list;
  }, [sortedOrders, view, vendorSelections, currentUserId, query, requester, period, todayKST]);

  const hasFilters = !!query.trim() || !!requester || !!period;
  const clearFilters = () => {
    setQuery("");
    setRequester(null);
    setPeriod(null);
  };

  // 묶음: 날짜별(긴급 맨 위) 또는 업체별(관리자, 업체 미정은 맨 아래)
  const groups = useMemo<OrderGroup[]>(() => {
    if (groupMode === "day" || !isAdmin) return groupByDay(visibleOrders, todayKST);
    const byVendor = new Map<string, OrderWithRequester[]>();
    for (const o of visibleOrders) {
      const v = vendorSelections.get(o.id) || "";
      byVendor.set(v, [...(byVendor.get(v) ?? []), o]);
    }
    return [...byVendor.entries()]
      .sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0], "ko")))
      .map(([v, list]) => ({ key: `v:${v}`, label: v || "업체 미정", mixedDates: true, orders: list }));
  }, [groupMode, isAdmin, visibleOrders, todayKST, vendorSelections]);

  // 표에 보이는 순서대로 (상세 패널 J/K 이동)
  const flatOrders = useMemo(() => groups.flatMap((g) => g.orders), [groups]);
  const detailOrder = detailId ? orders.find((o) => o.id === detailId) ?? null : null;
  const detailIndex = detailOrder ? flatOrders.findIndex((o) => o.id === detailOrder.id) : -1;
  const openDetail = (id: string) => {
    setDispatchError("");
    setDetailId(id);
  };

  // 전체선택은 지금 보이는 항목 기준
  const pendingOrders = visibleOrders.filter((o) => o.status === "pending");
  const allPendingSelected =
    pendingOrders.length > 0 &&
    pendingOrders.every((o) => selectedIds.has(o.id));
  const somePendingSelected = !allPendingSelected && pendingOrders.some((o) => selectedIds.has(o.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingOrders.map((o) => o.id)));
    }
  };

  const toggleGroup = (g: OrderGroup) => {
    const ids = g.orders.map((o) => o.id);
    const all = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const vendorSelectedIds = useMemo(() => {
    const ids: string[] = [];
    for (const [id, vendor] of vendorSelections) {
      if (vendor) ids.push(id);
    }
    return ids;
  }, [vendorSelections]);

  const openBulkDialog = (source: "checkbox" | "vendor") => {
    setBulkSource(source);
    setCopiedVendor("");

    const targetIds = source === "vendor" ? vendorSelectedIds : [...selectedIds];

    setBulkMode(source === "vendor" ? "individual" : "all");
    setBulkVendorName("");
    setBulkOrderNotes("");
    setIndividualVendors(new Map(
      targetIds.map((id) => [id, vendorSelections.get(id) ?? ""])
    ));
    setIndividualNotes(new Map(
      targetIds.map((id) => [id, ""])
    ));
    setBulkDialogOpen(true);
  };

  const getVendorGroups = () => {
    const targetIds = bulkSource === "vendor"
      ? new Set(vendorSelectedIds)
      : selectedIds;
    const targetOrders = sortedOrders.filter((o) => targetIds.has(o.id));
    const groups = new Map<string, OrderWithRequester[]>();
    for (const order of targetOrders) {
      const vendor = vendorSelections.get(order.id);
      if (!vendor) continue;
      const list = groups.get(vendor) ?? [];
      list.push(order);
      groups.set(vendor, list);
    }
    return groups;
  };

  const generateVendorMessage = (vendorOrders: OrderWithRequester[]) => {
    const lines = vendorOrders.map((o) => {
      const qty = o.quantity > 0
        ? `${o.quantity}${o.unit ? `${o.unit}` : ""}`
        : "";
      return `${o.item_name}  ${qty}`.trimEnd();
    });
    return `안녕하세요\n\n${lines.join("\n")}\n\n주문하겠습니다.`;
  };

  const handleCopyVendorMessage = async (vendorName: string, vendorOrders: OrderWithRequester[]) => {
    const message = generateVendorMessage(vendorOrders);
    const ok = await copyText(message);
    if (!ok) return;
    setCopiedVendor(vendorName);
    setTimeout(() => setCopiedVendor(""), 2000);
  };

  const handleBulkOrder = async () => {
    const targetIds = bulkSource === "vendor" ? vendorSelectedIds : [...selectedIds];
    if (targetIds.length === 0) return;
    setIsOrdering(true);

    try {
      if (bulkMode === "all") {
        await bulkDispatchAll(
          targetIds,
          bulkVendorName,
          bulkOrderNotes,
        );
      } else {
        await bulkDispatchIndividual(
          targetIds.map((id) => ({
            id,
            vendorName: individualVendors.get(id) ?? "",
            orderNotes: individualNotes.get(id) ?? "",
          })),
        );
      }

      logClientAction("dispatch", "dispatch_bulk", `${targetIds.length}건 일괄 발주`);
      setBulkDialogOpen(false);
      if (bulkSource === "vendor") {
        setVendorSelections(new Map());
      } else {
        setSelectedIds(new Set());
        sessionStorage.removeItem("order-selected-ids");
      }
      setIsOrdering(false);
      await fetchOrders();
    } catch {
      setIsOrdering(false);
    }
  };

  /** 상세 패널의 "○○으로 발주" — 한 건만 */
  const dispatchOne = async (order: OrderWithRequester, vendorName: string) => {
    setDispatching(true);
    setDispatchError("");
    try {
      await bulkDispatchIndividual([{ id: order.id, vendorName, orderNotes: "" }]);
      logClientAction("dispatch", "dispatch_order", `${order.item_name} ${vendorName} 발주`);
      setVendorSelections((prev) => {
        const next = new Map(prev);
        next.delete(order.id);
        return next;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
      // 다음 행으로 넘어가 이어서 처리
      const nextOrder = flatOrders[detailIndex + 1] ?? null;
      setDetailId(nextOrder && nextOrder.id !== order.id ? nextOrder.id : null);
      await fetchOrders();
    } catch {
      setDispatchError("발주하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setDispatching(false);
    }
  };

  const header = (
    <PageHeader title="주문" description={`발주 대기 ${sortedOrders.length}건`} action={headerAction} />
  );

  if (error) {
    return (
      <>
        {header}
        <div className="p-4 lg:px-6">
          <EmptyState title="주문을 불러오지 못했어요" description={error} />
        </div>
      </>
    );
  }

  const showActionBar = selectedIds.size > 0 || vendorSelectedIds.length > 0;
  const vendorSummary = (() => {
    const counts = new Map<string, number>();
    for (const id of vendorSelectedIds) {
      const v = vendorSelections.get(id)!;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].map(([v, c]) => `${v} ${c}`).join(" · ");
  })();

  const emptyTitle = hasFilters
    ? "조건에 맞는 주문이 없어요"
    : view === "urgent"
      ? "긴급 주문이 없어요"
      : view === "mine"
        ? "내가 요청한 대기 주문이 없어요"
        : view === "novendor"
          ? "업체를 정하지 않은 주문이 없어요"
          : view === "photo"
            ? "사진이 있는 주문이 없어요"
            : "발주할 주문이 없어요";

  const vendorCell = (order: OrderWithRequester, size: "sm" | "lg") => (
    <VendorPricePopover
      itemName={order.item_name}
      selectedVendor={vendorSelections.get(order.id) ?? ""}
      vendorColor={vendorColorMap.get(vendorSelections.get(order.id) ?? "")}
      lastOrderedVendor={lastVendorByItem.get(normalizeItemName(order.item_name))}
      onSelectVendor={(v) => handleVendorSelect(order.id, v)}
      size={size}
    />
  );

  /** 품목 아래 보조 줄: 수량 · 요청자 · 시각 · 사진 */
  const metaLine = (order: OrderWithRequester, withDate: boolean, showQty: boolean) => (
    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
      {showQty && (
        <>
          <QuantityText order={order} />
          <span aria-hidden="true">·</span>
        </>
      )}
      {showQty && order.requester?.full_name && (
        <>
          <span className="truncate">{order.requester.full_name}</span>
          <span aria-hidden="true">·</span>
        </>
      )}
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

  const groupHeader = (g: OrderGroup) => {
    const allSel = g.orders.every((o) => selectedIds.has(o.id));
    const someSel = !allSel && g.orders.some((o) => selectedIds.has(o.id));
    return (
      <span className="flex items-center gap-2.5">
        {isAdmin && (
          <Checkbox
            className="size-[18px]"
            checked={allSel ? true : someSel ? "indeterminate" : false}
            onCheckedChange={() => toggleGroup(g)}
            aria-label={`${g.label} 묶음 전체 선택`}
          />
        )}
        <span className={cn("text-[13px] font-bold", g.urgent ? "text-status-late" : "text-subtle-foreground")}>{g.label}</span>
        <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
          {g.hint ? `${g.hint} · ` : ""}
          {g.orders.length}건
        </span>
      </span>
    );
  };

  /** 모바일 카드 행: [체크] 품목+보조줄 → 누르면 상세 시트. 관리자는 아래에 업체 칸 */
  const renderMobileRow = (order: OrderWithRequester, withDate: boolean) => {
    const showCheckbox = isAdmin && order.status === "pending";
    const isSelected = selectedIds.has(order.id);
    return (
      <div key={order.id} className={cn("border-t border-border transition-colors", isSelected && "bg-row-selected")}>
        <div className="flex items-start gap-3 px-4 pb-2.5 pt-3">
          {showCheckbox && (
            <Checkbox
              className="mt-0.5 size-[22px] rounded-md"
              checked={isSelected}
              onCheckedChange={() => toggleSelect(order.id)}
              aria-label={`${order.item_name} 선택`}
            />
          )}
          <button type="button" onClick={() => openDetail(order.id)} className="flex min-w-0 flex-1 items-start gap-2 text-left active:opacity-70">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-base font-semibold">{order.item_name}</span>
                {order.is_urgent && <Tag tone="danger">긴급</Tag>}
              </span>
              {metaLine(order, withDate, true)}
              {order.notes && (
                <span className="mt-0.5 block truncate text-[13px] text-subtle-foreground" title={order.notes}>
                  {order.notes}
                </span>
              )}
            </span>
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
        {isAdmin && <div className={cn("pb-3 pr-4", showCheckbox ? "pl-[50px]" : "pl-4")}>{vendorCell(order, "lg")}</div>}
      </div>
    );
  };

  return (
    <>
      {header}
      <div className={cn("space-y-3 p-4 lg:px-6", showActionBar && "pb-28 lg:pb-24")}>
        {/* 보기 + 필터 */}
        <SavedViews<ViewKey>
          value={view}
          onValueChange={setView}
          views={[
            { value: "all", label: isAdmin ? "오늘 발주할 것" : "전체", count: viewCounts.all },
            ...(isAdmin ? [{ value: "novendor" as const, label: "업체 미정", count: viewCounts.novendor }] : []),
            { value: "urgent", label: "긴급", count: viewCounts.urgent },
            { value: "photo", label: "사진 있음", count: viewCounts.photo },
            { value: "mine", label: "내 요청", count: viewCounts.mine },
          ]}
        />
        <FilterBar>
          <SearchField id="order-search" value={query} onChange={setQuery} placeholder="품목·요청자·비고 검색" />
          <FilterChip label="요청일" options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
          <FilterChip label="요청자" options={requesterOptions} value={requester} onChange={setRequester} />
          <ClearFilters show={hasFilters} onClear={clearFilters} />
          {isAdmin && (
            <Segmented<GroupMode>
              className="ml-auto"
              ariaLabel="묶는 방법"
              value={groupMode}
              onValueChange={setGroupMode}
              items={[
                { value: "day", label: "날짜별" },
                { value: "vendor", label: "업체별" },
              ]}
            />
          )}
        </FilterBar>

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
              {isAdmin && (
                <div className="flex min-h-8 items-center justify-between gap-2 px-1 lg:hidden">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-subtle-foreground">
                    <Checkbox
                      className="size-[18px]"
                      checked={allPendingSelected ? true : somePendingSelected ? "indeterminate" : false}
                      onCheckedChange={toggleSelectAll}
                    />
                    전체 선택 ({pendingOrders.length}건)
                  </label>
                </div>
              )}

              {/* PC 표 */}
              <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-border lg:block">
                <table className="w-full border-separate border-spacing-0 text-[13px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-muted-foreground">
                      {isAdmin && (
                        <th className="w-11 border-b border-border bg-muted py-2 pl-4">
                          <Checkbox
                            className="size-[18px]"
                            checked={allPendingSelected ? true : somePendingSelected ? "indeterminate" : false}
                            onCheckedChange={toggleSelectAll}
                            aria-label="보이는 주문 전체 선택"
                          />
                        </th>
                      )}
                      <th className={cn("border-b border-border bg-muted px-3 py-2 font-semibold", !isAdmin && "pl-4")}>품목</th>
                      {isAdmin && <th className="w-60 border-b border-border bg-muted px-3 py-2 font-semibold">업체 · 단가</th>}
                      <th className="w-24 border-b border-border bg-muted px-3 py-2 text-right font-semibold">수량</th>
                      <th className="w-28 border-b border-border bg-muted px-3 py-2 pr-4 font-semibold">요청</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g, gi) => [
                      <tr key={`g-${g.key}`}>
                        <td colSpan={isAdmin ? 5 : 3} className={cn("bg-muted py-2 pl-4 pr-3", gi > 0 && "border-t border-border")}>
                          {groupHeader(g)}
                        </td>
                      </tr>,
                      ...g.orders.map((order) => {
                        const isSelected = selectedIds.has(order.id);
                        const isOpen = detailId === order.id;
                        return (
                          <tr
                            key={order.id}
                            onClick={() => openDetail(order.id)}
                            className={cn(
                              "group cursor-pointer",
                              isSelected || isOpen ? "bg-row-selected" : "hover:bg-muted/60",
                              isOpen && "shadow-[inset_3px_0_0_var(--primary)]"
                            )}
                          >
                            {isAdmin && (
                              <td className="border-t border-border py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                                {order.status === "pending" && (
                                  <Checkbox
                                    className="size-[18px]"
                                    checked={isSelected}
                                    onCheckedChange={() => toggleSelect(order.id)}
                                    aria-label={`${order.item_name} 선택`}
                                  />
                                )}
                              </td>
                            )}
                            <td className={cn("min-w-0 border-t border-border px-3 py-2.5", !isAdmin && "pl-4")}>
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-[15px] font-semibold leading-snug">{order.item_name}</span>
                                {order.is_urgent && <Tag tone="danger">긴급</Tag>}
                              </span>
                              {metaLine(order, !!g.mixedDates || !!g.urgent, false)}
                              {order.notes && (
                                <span className="mt-0.5 block max-w-[48ch] truncate text-[13px] text-subtle-foreground" title={order.notes}>
                                  {order.notes}
                                </span>
                              )}
                            </td>
                            {isAdmin && (
                              <td className="border-t border-border px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                                {vendorCell(order, "sm")}
                              </td>
                            )}
                            <td className="border-t border-border px-3 py-2.5 text-right tabular-nums">
                              {order.quantity > 0 ? (
                                <>
                                  <b className="text-sm font-bold">{order.quantity}</b>
                                  {order.unit ? <span className="text-subtle-foreground"> {order.unit}</span> : null}
                                </>
                              ) : (
                                <span className="text-muted-foreground">사진 참고</span>
                              )}
                            </td>
                            <td className="truncate border-t border-border px-3 py-2.5 pr-4 text-muted-foreground">
                              {order.requester?.full_name ?? "—"}
                            </td>
                          </tr>
                        );
                      }),
                    ])}
                  </tbody>
                </table>
              </div>

              {/* 모바일/태블릿: 묶음 카드 */}
              <div className="space-y-2.5 lg:hidden">
                {groups.map((g) => (
                  <section
                    key={g.key}
                    className={cn("overflow-hidden rounded-2xl bg-card ring-1", g.urgent ? "ring-status-late/40" : "ring-border")}
                  >
                    <div className="flex min-h-11 items-center bg-muted px-4 py-2">{groupHeader(g)}</div>
                    {g.orders.map((o) => renderMobileRow(o, !!g.mixedDates || !!g.urgent))}
                  </section>
                ))}
              </div>
            </div>

            {detailOrder && (
              <OrderDetail
                order={detailOrder}
                isAdmin={isAdmin}
                selectedVendor={vendorSelections.get(detailOrder.id) ?? ""}
                lastVendor={lastVendorByItem.get(normalizeItemName(detailOrder.item_name))}
                onSelectVendor={(v) => handleVendorSelect(detailOrder.id, v)}
                onClose={() => setDetailId(null)}
                onPrev={detailIndex > 0 ? () => setDetailId(flatOrders[detailIndex - 1].id) : undefined}
                onNext={detailIndex >= 0 && detailIndex < flatOrders.length - 1 ? () => setDetailId(flatOrders[detailIndex + 1].id) : undefined}
                onDispatch={(v) => dispatchOne(detailOrder, v)}
                dispatching={dispatching}
                error={dispatchError}
              />
            )}
          </WorkspaceSplit>
        )}

        {showActionBar && (
          <FloatingActionBar
            label={
              <span className="flex min-w-0 flex-col leading-tight">
                <span>
                  {[selectedIds.size > 0 && `${selectedIds.size}건 선택`, vendorSelectedIds.length > 0 && `업체 지정 ${vendorSelectedIds.length}건`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {vendorSummary && <span className="truncate text-xs font-medium opacity-75">{vendorSummary}</span>}
              </span>
            }
          >
            {vendorSelectedIds.length > 0 && (
              <Button size="sm" className="h-9" onClick={() => openBulkDialog("vendor")}>
                업체별로 발주
              </Button>
            )}
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                className={cn("h-9", vendorSelectedIds.length > 0 && "bg-white/15 text-white hover:bg-white/25")}
                onClick={() => openBulkDialog("checkbox")}
              >
                <ShoppingCart className="size-4" />
                선택 주문
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-white/80 hover:bg-white/10 hover:text-white"
              onClick={() => {
                setSelectedIds(new Set());
                setVendorSelections(new Map());
              }}
              aria-label="선택 모두 해제"
              title="선택 모두 해제"
            >
              <X className="size-4" />
            </Button>
          </FloatingActionBar>
        )}

        <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>발주하기</DialogTitle>
              <DialogDescription>
                {bulkSource === "vendor" ? vendorSelectedIds.length : selectedIds.size}건을 발주해요. 업체에 보낼 문구도 여기서 복사할 수 있어요.
              </DialogDescription>
            </DialogHeader>

            <Segmented<"all" | "individual">
              className="w-full [&>button]:flex-1"
              ariaLabel="업체 입력 방식"
              value={bulkMode}
              onValueChange={setBulkMode}
              items={[
                { value: "all", label: "한 업체로" },
                { value: "individual", label: "품목마다" },
              ]}
            />

            {bulkMode === "all" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bulk-vendor">업체명</Label>
                  <Input
                    id="bulk-vendor"
                    placeholder="업체명 입력"
                    value={bulkVendorName}
                    onChange={(e) => setBulkVendorName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bulk-order-notes">비고</Label>
                  <Input
                    id="bulk-order-notes"
                    placeholder="비고 (선택)"
                    value={bulkOrderNotes}
                    onChange={(e) => setBulkOrderNotes(e.target.value)}
                  />
                </div>
                {(() => {
                  const targetIds = bulkSource === "vendor" ? new Set(vendorSelectedIds) : selectedIds;
                  const targetOrders = sortedOrders.filter((o) => targetIds.has(o.id));
                  const isCopied = copiedVendor !== "" && copiedVendor === bulkVendorName;
                  const label = bulkVendorName.trim()
                    ? `${bulkVendorName} (${targetOrders.length}건) 문구 복사`
                    : `주문 요청 문구 복사 (${targetOrders.length}건)`;
                  return (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => handleCopyVendorMessage(bulkVendorName, targetOrders)}
                    >
                      {isCopied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
                      {isCopied ? "복사했어요" : label}
                    </Button>
                  );
                })()}
              </div>
            ) : (
              <div className="max-h-60 space-y-3 overflow-y-auto">
                {(bulkSource === "vendor" ? vendorSelectedIds : [...selectedIds]).map((id) => {
                  const order = orders.find((o) => o.id === id);
                  return (
                    <div key={id} className="space-y-1">
                      <Label className="text-sm font-medium">
                        {order?.item_name ?? id}
                      </Label>
                      <Input
                        placeholder="업체명 입력"
                        aria-label={`${order?.item_name ?? ""} 업체명`}
                        value={individualVendors.get(id) ?? ""}
                        onChange={(e) =>
                          setIndividualVendors((prev) => {
                            const next = new Map(prev);
                            next.set(id, e.target.value);
                            return next;
                          })
                        }
                      />
                      <Input
                        placeholder="비고 (선택)"
                        aria-label={`${order?.item_name ?? ""} 비고`}
                        value={individualNotes.get(id) ?? ""}
                        onChange={(e) =>
                          setIndividualNotes((prev) => {
                            const next = new Map(prev);
                            next.set(id, e.target.value);
                            return next;
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {(() => {
              const vGroups = getVendorGroups();
              if (vGroups.size === 0) return null;
              return (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">업체에 보낼 문구 복사</Label>
                  {[...vGroups.entries()].map(([vendor, vendorOrders]) => {
                    const isCopied = copiedVendor === vendor;
                    const color = vendorColorMap.get(vendor);
                    return (
                      <Button
                        key={vendor}
                        variant="outline"
                        className="w-full justify-start gap-2"
                        onClick={() => handleCopyVendorMessage(vendor, vendorOrders)}
                      >
                        {color && <span aria-hidden="true" className={cn("size-2 rounded-full", color.dot)} />}
                        {isCopied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
                        {isCopied ? "복사했어요" : `${vendor} (${vendorOrders.length}건)`}
                      </Button>
                    );
                  })}
                </div>
              );
            })()}

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">취소</Button>
              </DialogClose>
              <Button onClick={handleBulkOrder} disabled={isOrdering}>
                {isOrdering ? "발주하는 중…" : "발주"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

/** 상세 패널(PC 오른쪽 / 모바일 시트): 핵심 값 → 업체별 단가 → 사진 → 처리 이력 → 발주 */
function OrderDetail({
  order,
  isAdmin,
  selectedVendor,
  lastVendor,
  onSelectVendor,
  onClose,
  onPrev,
  onNext,
  onDispatch,
  dispatching,
  error,
}: {
  order: OrderWithRequester;
  isAdmin: boolean;
  selectedVendor: string;
  lastVendor?: string;
  onSelectVendor: (vendor: string) => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDispatch: (vendor: string) => void;
  dispatching: boolean;
  error: string;
}) {
  const [data] = usePriceData();
  const match = useMemo(() => matchItemPrices(order.item_name, data), [order.item_name, data]);
  // 업체를 직접 고른 뒤에만 발주할 수 있다(최저가로 자동 발주하지 않음)
  const dispatchVendor = selectedVendor;

  const created = new Date(order.created_at).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

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
        <div className="flex w-full flex-col gap-2">
          {error && <p className="text-[13px] font-medium text-status-late">{error}</p>}
          <div className="flex gap-2">
            <Button asChild variant="outline" className="h-10 flex-1 rounded-lg lg:h-9">
              <Link href={`/orders/${order.id}`}>
                <ExternalLink className="size-4" />
                전체 보기
              </Link>
            </Button>
            {isAdmin && (
              <Button
                className="h-10 flex-[1.6] rounded-lg lg:h-9"
                disabled={!dispatchVendor || dispatching}
                onClick={() => onDispatch(dispatchVendor)}
              >
                {dispatching ? "발주하는 중…" : dispatchVendor ? `${withRo(dispatchVendor)} 발주` : "업체를 골라 주세요"}
              </Button>
            )}
          </div>
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
                  </span>
                ) : (
                  "사진 참고"
                ),
            },
            { label: "요청", value: `${order.requester?.full_name ?? "—"} · ${created}` },
            { label: "비고", value: order.notes ? order.notes : <span className="text-muted-foreground">없음</span> },
          ]}
        />

        {isAdmin && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-subtle-foreground">업체별 단가 (할인후)</h3>
            {!data ? (
              <span className="block h-24 animate-pulse rounded-lg bg-muted" />
            ) : match && match.prices.length > 0 ? (
              <div className="overflow-hidden rounded-[10px] text-[13px] ring-1 ring-border">
                {match.prices.map((p, i) => {
                  const isBest = p.price !== null && p.price === match.minPrice;
                  const isSel = selectedVendor === p.vendorName;
                  return (
                    <button
                      key={p.vendorName}
                      type="button"
                      aria-pressed={isSel}
                      onClick={() => onSelectVendor(isSel ? "" : p.vendorName)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2.5 text-left tabular-nums transition-colors",
                        i > 0 && "border-t border-border",
                        isBest ? "bg-status-done-bg text-status-done" : "hover:bg-muted",
                        isSel && "shadow-[inset_3px_0_0_var(--primary)]"
                      )}
                    >
                      <span className={cn("min-w-0 flex-1 truncate", isBest && "font-bold")}>
                        {p.vendorName}
                        {isBest && " · 최저가"}
                        {p.vendorName === lastVendor && <span className="font-normal text-muted-foreground"> · 지난번</span>}
                      </span>
                      <span className={cn(isBest ? "font-bold" : "", p.price === null && "text-muted-foreground")}>
                        {p.price !== null ? p.price.toLocaleString() : "—"}
                      </span>
                      {isSel && <Check className="size-4 shrink-0 text-primary" aria-label="선택됨" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">
                가격비교에 맞는 품목이 없어요. 목록의 업체 칸에서 매칭을 고칠 수 있어요.
              </p>
            )}
          </section>
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
              { key: "created", text: <><b className="font-semibold text-foreground">주문 등록</b> · {order.requester?.full_name ?? "—"}</>, at: created },
              ...(lastVendor ? [{ key: "last", text: <>지난번 이 품목은 <b className="font-semibold text-foreground">{lastVendor}</b>에서 발주</> }] : []),
            ]}
          />
        </section>
      </div>
    </DetailPanel>
  );
}
