"use client";

import { Fragment, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Camera, ChevronRight, CircleAlert, ClipboardCheck, PackageX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils/format";
import { OrderStatusBadge, StatusLegend } from "@/components/orders/order-status-badge";
import { Spinner } from "@/components/ui/spinner";
import { logClientAction } from "@/app/(main)/log-action";
import type { OrderWithRequester } from "@/lib/types/order";
import { bulkInspectOrders, bulkMarkOutOfStock, updateInspectionMemo } from "@/lib/actions/order-mutations";

interface InspectionData {
  inspection_notes: string;
}

export function InspectionList() {
  const { isAdmin, userId: currentUserId } = useAuth();
  const [orders, setOrders] = useState<OrderWithRequester[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectionData, setInspectionData] = useState<
    Record<string, InspectionData>
  >({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [sortByVendor, setSortByVendor] = useState(false);
  const [memos, setMemos] = useState<Record<string, string>>({});
  const dirtyMemos = useRef<Set<string>>(new Set());
  const memoTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const supabase = createClient();
  const router = useRouter();

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

  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("inspection-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
          realtimeTimer.current = setTimeout(fetchOrders, 200);
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
      if (sortByVendor) {
        const va = (a.vendor_name ?? "").toLowerCase();
        const vb = (b.vendor_name ?? "").toLowerCase();
        if (va !== vb) return va.localeCompare(vb);
      }
      return 0;
    }),
    [orders, sortByVendor]
  );

  const allSelected =
    sortedOrders.length > 0 && sortedOrders.every((o) => selectedIds.has(o.id));

  const handleMemoChange = (orderId: string, value: string) => {
    setMemos((prev) => ({ ...prev, [orderId]: value }));
    dirtyMemos.current.add(orderId);
    if (memoTimers.current[orderId]) clearTimeout(memoTimers.current[orderId]);
    memoTimers.current[orderId] = setTimeout(async () => {
      await updateInspectionMemo(orderId, value);
      dirtyMemos.current.delete(orderId);
    }, 500);
  };

  const getInspectionData = (order: OrderWithRequester): InspectionData => {
    return inspectionData[order.id] ?? { inspection_notes: "" };
  };

  const updateInspectionData = (id: string, value: string) => {
    setInspectionData((prev) => {
      const existing = prev[id] ?? { inspection_notes: "" };
      return { ...prev, [id]: { ...existing, inspection_notes: value } };
    });
  };

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
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedOrders.map((o) => o.id)));
    }
  };

  const handleBulkInspect = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);

    try {
      const items = [...selectedIds].map((id) => {
        const order = orders.find((o) => o.id === id)!;
        const data = getInspectionData(order);
        return {
          id,
          confirmedQuantity: order.quantity,
          invoiceReceived: true,
          inspectionNotes: data.inspection_notes,
        };
      });

      await bulkInspectOrders(items);
      logClientAction("inspection", "inspect_bulk", `${selectedIds.size}건 일괄 검수`);
      setSelectedIds(new Set());
      setInspectionData({});
      setIsProcessing(false);
      await fetchOrders();
    } catch {
      setIsProcessing(false);
    }
  };

  const handleBulkOutOfStock = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}건을 품절 처리하시겠습니까?`)) return;

    setIsProcessing(true);

    try {
      await bulkMarkOutOfStock([...selectedIds]);
      logClientAction("inspection", "out_of_stock_bulk", `${selectedIds.size}건 일괄 품절`);
      setSelectedIds(new Set());
      setInspectionData({});
      setIsProcessing(false);
      await fetchOrders();
    } catch {
      setIsProcessing(false);
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
        <p className="text-muted-foreground">검수 대기 품목이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 py-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox
            className="h-5 w-5"
            checked={allSelected}
            onCheckedChange={toggleSelectAll}
          />
          전체 선택 ({sortedOrders.length}건)
        </label>
        <StatusLegend />
      </div>

      {/* PC 테이블 뷰 */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>상태</TableHead>
              <TableHead>품목명</TableHead>
              <TableHead className="w-44">메모</TableHead>
              <TableHead>수량</TableHead>
              <TableHead>
                <button
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  onClick={() => setSortByVendor((v) => !v)}
                >
                  업체
                  <ArrowUpDown className={`h-3.5 w-3.5 ${sortByVendor ? "text-primary" : "text-muted-foreground/50"}`} />
                </button>
              </TableHead>
              <TableHead>요청자</TableHead>
              <TableHead>요청일</TableHead>
              <TableHead className="w-12">사진</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedOrders.map((order) => {
              const isSelected = selectedIds.has(order.id);
              const data = getInspectionData(order);
              const colCount = 9;

              return (
                <Fragment key={order.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => router.push(`/inspection/${order.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        className="h-5 w-5"
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(order.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {order.is_urgent && <CircleAlert className="h-4 w-4 text-red-500 shrink-0" />}
                        {order.item_name}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Input
                        type="text"
                        placeholder="메모"
                        value={memos[order.id] ?? ""}
                        onChange={(e) => handleMemoChange(order.id, e.target.value)}
                        className="h-7 w-44 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      {order.quantity > 0
                        ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}`
                        : <span className="text-muted-foreground">(사진 참고)</span>}
                    </TableCell>
                    <TableCell>{order.vendor_name || <span className="text-muted-foreground">-</span>}</TableCell>
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
                  {isSelected && (
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={colCount}>
                        <div className="flex items-end gap-3 py-1 pl-6">
                          <div>
                            <label className="block text-xs text-muted-foreground">비고</label>
                            <Input
                              type="text"
                              placeholder="비고"
                              value={data.inspection_notes}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateInspectionData(order.id, e.target.value)}
                              className="mt-1 h-8 w-40"
                            />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 모바일/태블릿 카드 뷰 */}
      <div className="lg:hidden space-y-2">
        {sortedOrders.map((order) => {
          const isSelected = selectedIds.has(order.id);
          const data = getInspectionData(order);

          return (
            <div
              key={order.id}
              className="rounded-xl bg-card p-4 shadow-card transition-colors"
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  className="h-5 w-5"
                  checked={isSelected}
                  onCheckedChange={() => toggleSelect(order.id)}
                />
                <Link
                  href={`/inspection/${order.id}`}
                  className="flex flex-1 items-center gap-3 min-w-0 active:opacity-70"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <OrderStatusBadge status={order.status} />
                      {order.is_urgent && <CircleAlert className="h-4 w-4 text-red-500 shrink-0" />}
                      <span className="truncate font-medium">
                        {order.item_name}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <span>
                        {order.quantity > 0
                          ? `수량: ${order.quantity}${order.unit ? ` ${order.unit}` : ""}`
                          : "(사진 참고)"}
                      </span>
                      {order.vendor_name && (
                        <>
                          <span>·</span>
                          <span>{order.vendor_name}</span>
                        </>
                      )}
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

              {isSelected && (
                <div className="mt-3 pl-8">
                  <label className="text-xs text-muted-foreground">비고</label>
                  <Input
                    type="text"
                    placeholder="비고 (선택)"
                    value={data.inspection_notes}
                    onChange={(e) => updateInspectionData(order.id, e.target.value)}
                    className="mt-0.5 h-8"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4 lg:left-60 lg:bottom-4">
          <div className="flex w-full max-w-md md:max-w-2xl lg:max-w-full gap-2">
            <Button
              className="flex-1 shadow-lg"
              onClick={handleBulkInspect}
              disabled={isProcessing}
            >
              <ClipboardCheck className="h-4 w-4" />
              {isProcessing
                ? "처리 중..."
                : `일괄 검수 (${selectedIds.size}건)`}
            </Button>
            <Button
              variant="outline"
              className="shadow-lg bg-card text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={handleBulkOutOfStock}
              disabled={isProcessing}
            >
              <PackageX className="h-4 w-4" />
              품절
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
