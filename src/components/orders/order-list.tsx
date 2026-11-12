"use client";

import { useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, ChevronRight, ClipboardCopy, Check, ShoppingCart, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FloatingActionBar, ListEmpty, ListSection, Tag, UnderlineTabs } from "@/components/list-parts";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VendorPricePopover, VENDOR_COLORS, initPriceCache, type VendorColor, type PriceData } from "./vendor-price-popover";
import { toKSTDateString } from "@/lib/utils/format";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import { applyRealtimeChange, pruneSet, pruneMap } from "@/lib/utils/realtime-list";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { copyText } from "@/lib/utils/clipboard";
import { Spinner } from "@/components/ui/spinner";
import { logClientAction } from "@/app/(main)/log-action";
import type { OrderWithRequester } from "@/lib/types/order";
import { bulkDispatchAll, bulkDispatchIndividual } from "@/lib/actions/order-mutations";

type OrderTab = "all" | "urgent" | "mine";

const KST = "Asia/Seoul";

/** 목록용 짧은 시각 (KST). 날짜 묶음 안에서는 "14:05", 긴급 묶음(날짜 섞임)에서는 "11. 10. 14:05" */
function formatShort(iso: string, withDate: boolean): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit", hour12: false });
  if (!withDate) return time;
  return `${d.toLocaleDateString("ko-KR", { timeZone: KST, month: "2-digit", day: "2-digit" })} ${time}`;
}

/** 날짜 구분 행 제목: "11월 11일 (화)" (KST) */
function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const md = d.toLocaleDateString("ko-KR", { timeZone: KST, month: "long", day: "numeric" });
  const wd = d.toLocaleDateString("ko-KR", { timeZone: KST, weekday: "short" });
  return `${md} (${wd})`;
}

type OrderGroup = {
  key: string;
  label: string;
  /** 오늘/어제 같은 보조 표시 */
  hint?: string;
  urgent?: boolean;
  orders: OrderWithRequester[];
};

export function OrderList({
  initialPriceData,
  initialOrders,
  initialLastVendors,
  headerAction,
}: {
  initialPriceData?: PriceData;
  initialOrders?: OrderWithRequester[];
  initialLastVendors?: Record<string, string>;
  /** 상단바 오른쪽 버튼 (주문 등록) — 서버 페이지에서 넘긴다 */
  headerAction?: ReactNode;
}) {
  if (initialPriceData) initPriceCache(initialPriceData);
  const { isAdmin, userId: currentUserId } = useAuth();
  const [orders, setOrders] = useState<OrderWithRequester[]>(initialOrders ?? []);
  const [isLoading, setIsLoading] = useState(!initialOrders);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem("order-selected-ids");
      const ids = saved ? new Set(JSON.parse(saved) as string[]) : new Set<string>();
      // 더 이상 목록에 없는(이미 발주됐거나 삭제된) 항목은 제외
      if (initialOrders) {
        const valid = new Set(initialOrders.map((o) => o.id));
        for (const id of [...ids]) if (!valid.has(id)) ids.delete(id);
      }
      return ids;
    } catch {
      return new Set();
    }
  });
  const [isOrdering, setIsOrdering] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"all" | "individual">("all");
  const [bulkVendorName, setBulkVendorName] = useState("");
  const [bulkOrderNotes, setBulkOrderNotes] = useState("");
  const [individualVendors, setIndividualVendors] = useState<Map<string, string>>(new Map());
  const [individualNotes, setIndividualNotes] = useState<Map<string, string>>(new Map());
  const [vendorSelections, setVendorSelections] = useState<Map<string, string>>(() => {
    try {
      const saved = sessionStorage.getItem("order-vendor-selections");
      const entries = saved ? (JSON.parse(saved) as [string, string][]) : [];
      const m = new Map<string, string>(entries);
      // 더 이상 pending에 없는(이미 발주됐거나 삭제된) 항목 정리
      if (initialOrders) {
        const valid = new Set(initialOrders.map((o) => o.id));
        for (const id of [...m.keys()]) if (!valid.has(id)) m.delete(id);
      }
      return m;
    } catch {
      return new Map();
    }
  });
  const [copiedVendor, setCopiedVendor] = useState("");
  const [bulkSource, setBulkSource] = useState<"checkbox" | "vendor">("checkbox");
  // 품목명(정규화) → 가장 최근에 발주했던 업체명 (서버 초기값. 세션 중 갱신 안 함 — 힌트 용도)
  const [lastVendorByItem] = useState<Map<string, string>>(
    () => new Map(Object.entries(initialLastVendors ?? {}))
  );
  const [tab, setTab] = useState<OrderTab>("all");
  // 오늘(KST) — "오늘 요청 / 이전 요청" 묶음 기준. 렌더 중 new Date() 금지라 지연 초기화
  const [todayKST] = useState(() => toKSTDateString(new Date().toISOString()));
  const supabase = createClient();
  const router = useRouter();

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

  // selectedIds가 바뀔 때마다 sessionStorage에 동기화
  useEffect(() => {
    try {
      sessionStorage.setItem("order-selected-ids", JSON.stringify([...selectedIds]));
    } catch {}
  }, [selectedIds]);

  // vendorSelections도 동일하게 sessionStorage 동기화 (상세→뒤로가기·탭이동에도 유지)
  useEffect(() => {
    try {
      sessionStorage.setItem("order-vendor-selections", JSON.stringify([...vendorSelections]));
    } catch {}
  }, [vendorSelections]);

  const ordersRef = useRef(orders);
  useEffect(() => { ordersRef.current = orders; }, [orders]);

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
      next.set(orderId, vendorName);
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

  const urgentCount = sortedOrders.filter((o) => o.is_urgent).length;
  const mineCount = sortedOrders.filter((o) => o.requester_id === currentUserId).length;
  const visibleOrders = useMemo(
    () =>
      tab === "urgent"
        ? sortedOrders.filter((o) => o.is_urgent)
        : tab === "mine"
          ? sortedOrders.filter((o) => o.requester_id === currentUserId)
          : sortedOrders,
    [sortedOrders, tab, currentUserId]
  );
  // 묶음: 긴급(맨 위 고정) → 날짜별(최신순). sortedOrders는 created_at 내림차순이라 순서대로 모으면 된다
  const groups = useMemo<OrderGroup[]>(() => {
    const result: OrderGroup[] = [];
    const urgent = visibleOrders.filter((o) => o.is_urgent);
    if (urgent.length > 0) result.push({ key: "urgent", label: "긴급", urgent: true, orders: urgent });
    const yesterdayKST = toKSTDateString(new Date(new Date(`${todayKST}T12:00:00+09:00`).getTime() - 86400000).toISOString());
    const byDay = new Map<string, OrderGroup>();
    for (const o of visibleOrders) {
      if (o.is_urgent) continue;
      const key = toKSTDateString(o.created_at);
      let g = byDay.get(key);
      if (!g) {
        g = {
          key,
          label: formatDayLabel(o.created_at),
          hint: key === todayKST ? "오늘" : key === yesterdayKST ? "어제" : undefined,
          orders: [],
        };
        byDay.set(key, g);
        result.push(g);
      }
      g.orders.push(o);
    }
    return result;
  }, [visibleOrders, todayKST]);

  /** 업체가 지정된 행은 업체 색 바탕(같은 업체 = 같은 색), 아니면 체크된 행만 옅은 파랑 */
  const rowTint = (orderId: string) => {
    const color = vendorColorMap.get(vendorSelections.get(orderId) ?? "");
    if (color) return color.row;
    return selectedIds.has(orderId) ? "bg-primary/[0.04]" : "";
  };

  // 전체선택은 지금 보이는 탭의 항목 기준
  const pendingOrders = visibleOrders.filter((o) => o.status === "pending");
  const allPendingSelected =
    pendingOrders.length > 0 &&
    pendingOrders.every((o) => selectedIds.has(o.id));

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

  const header = (
    <PageHeader
      title="주문"
      description={`발주 대기 ${sortedOrders.length}건`}
      action={headerAction}
      tabs={
        <UnderlineTabs<OrderTab>
          ariaLabel="주문 보기"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "all", label: "전체", count: sortedOrders.length },
            { value: "urgent", label: "긴급", count: urgentCount },
            { value: "mine", label: "내 요청", count: mineCount },
          ]}
        />
      }
    />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <div className="flex items-center justify-center py-16">
          <Spinner text="불러오는 중..." />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {header}
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-destructive">데이터를 불러올 수 없어요.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </>
    );
  }

  const showActionBar = selectedIds.size > 0 || vendorSelectedIds.length > 0;
  const emptyText =
    tab === "urgent" ? "긴급 주문이 없어요." : tab === "mine" ? "내가 요청한 대기 주문이 없어요." : "발주 대기 중인 주문이 없어요.";

  /** 모바일 한 줄: [체크] 품목명+긴급 / 수량·요청자·시각·사진 / 비고 → 상세. 관리자는 아래에 업체 선택 */
  const renderMobileRow = (order: OrderWithRequester, withDate: boolean) => {
    const showCheckbox = isAdmin && order.status === "pending";
    const isSelected = selectedIds.has(order.id);
    return (
      <div key={order.id} className={cn("border-t border-border transition-colors", rowTint(order.id))}>
        <div className="flex items-center gap-3 px-4 py-3">
          {showCheckbox && (
            <Checkbox
              className="size-[18px]"
              checked={isSelected}
              onCheckedChange={() => toggleSelect(order.id)}
              aria-label={`${order.item_name} 선택`}
            />
          )}
          <Link href={`/orders/${order.id}`} className="flex min-w-0 flex-1 items-center gap-3 active:opacity-70">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold">{order.item_name}</span>
                {order.is_urgent && <Tag tone="danger">긴급</Tag>}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <span>
                  {order.quantity > 0 ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}` : "사진 참고"}
                </span>
                {order.requester?.full_name && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{order.requester.full_name}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="shrink-0 tabular-nums">{formatShort(order.created_at, withDate)}</span>
                {order.photo_urls?.length > 0 && (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <Camera className="h-3 w-3" aria-label="사진" />
                    {order.photo_urls.length}
                  </span>
                )}
              </div>
              {order.notes && (
                <div className="mt-0.5 truncate text-[13px] text-subtle-foreground" title={order.notes}>
                  {order.notes}
                </div>
              )}
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </div>
        {isAdmin && (
          <div className={cn("pb-3 pr-4", showCheckbox ? "pl-[46px]" : "pl-4")}>
            <VendorPricePopover
              itemName={order.item_name}
              selectedVendor={vendorSelections.get(order.id) ?? ""}
              vendorColor={vendorColorMap.get(vendorSelections.get(order.id) ?? "")}
              lastOrderedVendor={lastVendorByItem.get(normalizeItemName(order.item_name))}
              onSelectVendor={(v) => handleVendorSelect(order.id, v)}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {header}
      <div className={cn("space-y-3 p-4 lg:px-6", showActionBar && "pb-28 lg:pb-24")}>
      {isAdmin && pendingOrders.length > 0 && (
        <div className="flex min-h-9 items-center justify-between gap-2 px-1">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-subtle-foreground">
            <Checkbox className="size-[18px]" checked={allPendingSelected} onCheckedChange={toggleSelectAll} />
            전체 선택 ({pendingOrders.length}건)
          </label>
          {vendorSelectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setVendorSelections(new Map())}
              className="rounded-md px-2 py-1 text-[13px] font-medium text-subtle-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              업체 선택 해제 ({vendorSelectedIds.length}건)
            </button>
          )}
        </div>
      )}

      {visibleOrders.length === 0 ? (
        <ListSection>
          <ListEmpty>{emptyText}</ListEmpty>
        </ListSection>
      ) : (
        <>
          {/* PC 표 */}
          <ListSection className="hidden lg:flex">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {isAdmin && <TableHead className="w-10 pl-4" />}
                  {isAdmin && <TableHead className="text-xs font-semibold text-muted-foreground">업체</TableHead>}
                  <TableHead className={cn("text-xs font-semibold text-muted-foreground", !isAdmin && "pl-4")}>품목명</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-muted-foreground">수량</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">요청자</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">시각</TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground">비고</TableHead>
                  <TableHead className="w-12 pr-4 text-xs font-semibold text-muted-foreground">사진</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => [
                  // 날짜(또는 긴급) 구분 행
                  <TableRow key={`g-${g.key}`} className="bg-muted hover:bg-muted">
                    <TableCell colSpan={isAdmin ? 8 : 6} className="py-2 pl-4">
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <span className={g.urgent ? "text-status-late" : "text-subtle-foreground"}>{g.label}</span>
                        <span className="font-medium tabular-nums text-muted-foreground">{g.orders.length}건</span>
                        {g.hint && <Tag className="h-[18px]">{g.hint}</Tag>}
                      </span>
                    </TableCell>
                  </TableRow>,
                  ...g.orders.map((order) => {
                  const showCheckbox = isAdmin && order.status === "pending";
                  const isSelected = selectedIds.has(order.id);
                  return (
                    <TableRow
                      key={order.id}
                      className={cn("cursor-pointer hover:bg-muted/60", rowTint(order.id))}
                      onClick={() => router.push(`/orders/${order.id}`)}
                    >
                      {isAdmin && (
                        <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                          {showCheckbox && (
                            <Checkbox
                              className="size-[18px]"
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(order.id)}
                              aria-label={`${order.item_name} 선택`}
                            />
                          )}
                        </TableCell>
                      )}
                      {isAdmin && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <VendorPricePopover
                            itemName={order.item_name}
                            selectedVendor={vendorSelections.get(order.id) ?? ""}
                            vendorColor={vendorColorMap.get(vendorSelections.get(order.id) ?? "")}
                            lastOrderedVendor={lastVendorByItem.get(normalizeItemName(order.item_name))}
                            onSelectVendor={(v) => handleVendorSelect(order.id, v)}
                          />
                        </TableCell>
                      )}
                      <TableCell className={cn("font-semibold", !isAdmin && "pl-4")}>
                        <span className="flex items-center gap-1.5">
                          {order.item_name}
                          {order.is_urgent && <Tag tone="danger">긴급</Tag>}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {order.quantity > 0
                          ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}`
                          : <span className="text-muted-foreground">사진 참고</span>}
                      </TableCell>
                      <TableCell>{order.requester?.full_name ?? "-"}</TableCell>
                      <TableCell className="tabular-nums text-subtle-foreground">{formatShort(order.created_at, !!g.urgent)}</TableCell>
                      <TableCell>
                        <div className="max-w-[24rem] truncate text-muted-foreground" title={order.notes || undefined}>
                          {order.notes || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="pr-4">
                        {order.photo_urls?.length > 0 && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Camera className="h-3.5 w-3.5" aria-label="사진" />
                            {order.photo_urls.length}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                  }),
                ])}
              </TableBody>
            </Table>
          </ListSection>

          {/* 모바일/태블릿: 오늘 / 이전 묶음 */}
          <div className="space-y-3 lg:hidden">
            {groups.map((g) => (
              <ListSection
                key={g.key}
                title={g.label}
                count={g.orders.length}
                className={g.urgent ? "ring-status-late/40" : undefined}
                actions={g.hint ? <Tag>{g.hint}</Tag> : undefined}
              >
                {g.orders.map((o) => renderMobileRow(o, !!g.urgent))}
              </ListSection>
            ))}
          </div>
        </>
      )}

      {showActionBar && (
        <FloatingActionBar
          label={[
            selectedIds.size > 0 && `${selectedIds.size}건 선택`,
            vendorSelectedIds.length > 0 && `업체 지정 ${vendorSelectedIds.length}건`,
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          {vendorSelectedIds.length > 0 && (
            <Button
              size="sm"
              className="h-9 bg-white/15 text-white hover:bg-white/25"
              onClick={() => openBulkDialog("vendor")}
            >
              업체별 주문
            </Button>
          )}
          {selectedIds.size > 0 && (
            <Button size="sm" className="h-9" onClick={() => openBulkDialog("checkbox")}>
              <ShoppingCart className="h-4 w-4" />
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
            <X className="h-4 w-4" />
          </Button>
        </FloatingActionBar>
      )}

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>주문하기</DialogTitle>
            <DialogDescription>
              선택된 {bulkSource === "vendor" ? vendorSelectedIds.length : selectedIds.size}건의 품목을 주문합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              variant={bulkMode === "all" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setBulkMode("all")}
            >
              일괄 입력
            </Button>
            <Button
              variant={bulkMode === "individual" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setBulkMode("individual")}
            >
              개별 입력
            </Button>
          </div>

          {bulkMode === "all" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="bulk-vendor">업체명</Label>
                <Input
                  id="bulk-vendor"
                  placeholder="업체명 입력"
                  value={bulkVendorName}
                  onChange={(e) => setBulkVendorName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
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
                    {isCopied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                    {isCopied ? "복사됨" : label}
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
            const groups = getVendorGroups();
            if (groups.size === 0) return null;
            return (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">주문 요청 문구 복사</Label>
                {[...groups.entries()].map(([vendor, vendorOrders]) => {
                  const isCopied = copiedVendor === vendor;
                  const color = vendorColorMap.get(vendor);
                  return (
                    <Button
                      key={vendor}
                      variant="outline"
                      className={`w-full justify-start gap-2 ${
                        color ? `${color.bg} ${color.border} ${color.text}` : ""
                      }`}
                      onClick={() => handleCopyVendorMessage(vendor, vendorOrders)}
                    >
                      {isCopied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                      {isCopied ? "복사됨" : `${vendor} (${vendorOrders.length}건)`}
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
              {isOrdering ? "주문 처리 중..." : "주문"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </>
  );
}
