"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, ChevronRight, CircleAlert, ClipboardCopy, Check, ShoppingCart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
import { OrderStatusBadge, StatusLegend } from "./order-status-badge";
import { VendorPricePopover, VENDOR_COLORS, type VendorColor } from "./vendor-price-popover";
import { formatDate } from "@/lib/utils/format";
import { Spinner } from "@/components/ui/spinner";
import { logClientAction } from "@/app/(main)/log-action";
import type { OrderWithRequester } from "@/lib/types/order";
import { bulkDispatchAll, bulkDispatchIndividual } from "@/lib/actions/order-mutations";

export function OrderList() {
  const { isAdmin, userId: currentUserId } = useAuth();
  const [orders, setOrders] = useState<OrderWithRequester[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem("order-selected-ids");
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
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
  const [vendorSelections, setVendorSelections] = useState<Map<string, string>>(new Map());
  const [copiedVendor, setCopiedVendor] = useState("");
  const [bulkSource, setBulkSource] = useState<"checkbox" | "vendor">("checkbox");
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

    setOrders((data as OrderWithRequester[]) ?? []);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // selectedIds가 바뀔 때마다 sessionStorage에 동기화
  useEffect(() => {
    try {
      sessionStorage.setItem("order-selected-ids", JSON.stringify([...selectedIds]));
    } catch {}
  }, [selectedIds]);

  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("order-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
          realtimeTimer.current = setTimeout(fetchOrders, 500);
        }
      )
      .subscribe();

    return () => {
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchOrders]);

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

  const pendingOrders = sortedOrders.filter((o) => o.status === "pending");
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
    await navigator.clipboard.writeText(message);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner text="불러오는 중..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-destructive">데이터를 불러올 수 없습니다.</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (sortedOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">
          등록된 주문이 없습니다.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          새 주문을 등록하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 py-2">
        {isAdmin && pendingOrders.length > 0 ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox
              className="h-5 w-5"
              checked={allPendingSelected}
              onCheckedChange={toggleSelectAll}
            />
            전체선택 ({pendingOrders.length}건)
          </label>
        ) : (
          <div />
        )}
        <StatusLegend />
      </div>

      {/* PC 테이블 뷰 */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && <TableHead className="w-10" />}
              <TableHead>상태</TableHead>
              {isAdmin && <TableHead>업체</TableHead>}
              <TableHead>품목명</TableHead>
              <TableHead>수량</TableHead>
              <TableHead>요청자</TableHead>
              <TableHead>요청일</TableHead>
              <TableHead className="w-12">사진</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedOrders.map((order) => {
              const isPending = order.status === "pending";
              const showCheckbox = isAdmin && isPending;
              const isSelected = selectedIds.has(order.id);

              return (
                <TableRow
                  key={order.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/orders/${order.id}`)}
                >
                  {isAdmin && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {showCheckbox && (
                        <Checkbox
                          className="h-5 w-5"
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(order.id)}
                        />
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  {isAdmin && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <VendorPricePopover
                        itemName={order.item_name}
                        selectedVendor={vendorSelections.get(order.id) ?? ""}
                        vendorColor={vendorColorMap.get(vendorSelections.get(order.id) ?? "")}
                        onSelectVendor={(v) => handleVendorSelect(order.id, v)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      {order.is_urgent && <CircleAlert className="h-4 w-4 text-red-500 shrink-0" />}
                      {order.item_name}
                    </span>
                  </TableCell>
                  <TableCell>
                    {order.quantity > 0
                      ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}`
                      : <span className="text-muted-foreground">(사진 참고)</span>}
                  </TableCell>
                  <TableCell>{order.requester?.full_name ?? "-"}</TableCell>
                  <TableCell>{formatDate(order.created_at)}</TableCell>
                  <TableCell>
                    {order.photo_urls?.length > 0 && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Camera className="h-3.5 w-3.5" />
                        {order.photo_urls.length}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 모바일/태블릿 카드 뷰 */}
      <div className="lg:hidden space-y-2">
        {sortedOrders.map((order) => {
          const isPending = order.status === "pending";
          const showCheckbox = isAdmin && isPending;
          const isSelected = selectedIds.has(order.id);

          return (
            <div
              key={order.id}
              className="rounded-xl bg-card shadow-card overflow-hidden"
            >
              <div className="flex items-center gap-3 p-4 transition-colors">
                {showCheckbox && (
                  <Checkbox
                    className="h-5 w-5"
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(order.id)}
                  />
                )}
                <Link
                  href={`/orders/${order.id}`}
                  className="flex flex-1 items-center gap-3 min-w-0 active:opacity-70"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <OrderStatusBadge status={order.status} />
                      {order.is_urgent && <CircleAlert className="h-4 w-4 text-red-500 shrink-0" />}
                      <span className="truncate font-medium">{order.item_name}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <span>
                        {order.quantity > 0
                          ? `수량: ${order.quantity}${order.unit ? ` ${order.unit}` : ""}`
                          : <span className="text-muted-foreground">(사진 참고)</span>}
                      </span>
                      <span>·</span>
                      <span>{formatDate(order.created_at)}</span>
                      {order.photo_urls?.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <Camera className="h-3 w-3" />
                            {order.photo_urls.length}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </div>
              {isAdmin && (
                <div className="border-t border-border px-4 py-2">
                  <VendorPricePopover
                    itemName={order.item_name}
                    selectedVendor={vendorSelections.get(order.id) ?? ""}
                    onSelectVendor={(v) => handleVendorSelect(order.id, v)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(selectedIds.size > 0 || vendorSelectedIds.length > 0) && (
        <div className="fixed bottom-20 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 lg:left-60 lg:bottom-4">
          {vendorSelectedIds.length > 0 && (
            <Button
              className="flex-1 max-w-md shadow-lg"
              onClick={() => openBulkDialog("vendor")}
            >
              <ShoppingCart className="h-4 w-4" />
              {`업체 선택 주문 (${vendorSelectedIds.length}건)`}
            </Button>
          )}
          {selectedIds.size > 0 && (
            <Button
              variant="default"
              className="flex-1 max-w-md shadow-lg"
              onClick={() => openBulkDialog("checkbox")}
            >
              <ShoppingCart className="h-4 w-4" />
              {`선택 항목 주문 (${selectedIds.size}건)`}
            </Button>
          )}
        </div>
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
  );
}
