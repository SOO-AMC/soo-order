"use client";

import { Fragment, useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ChevronRight, CircleAlert, ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface InspectionListProps {
  isAdmin: boolean;
  currentUserId: string;
  initialData?: OrderWithRequester[];
}

interface InspectionData {
  confirmed_quantity: number;
  invoice_received: boolean | null;
  inspection_notes: string;
}

export function InspectionList({ isAdmin, currentUserId, initialData }: InspectionListProps) {
  const [orders, setOrders] = useState<OrderWithRequester[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState(!initialData || initialData.length === 0);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectionData, setInspectionData] = useState<
    Record<string, InspectionData>
  >({});
  const [isProcessing, setIsProcessing] = useState(false);
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

    setOrders((data as OrderWithRequester[]) ?? []);
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

  const allSelected =
    sortedOrders.length > 0 && sortedOrders.every((o) => selectedIds.has(o.id));

  const getInspectionData = (order: OrderWithRequester): InspectionData => {
    return (
      inspectionData[order.id] ?? {
        confirmed_quantity: order.quantity,
        invoice_received: null,
        inspection_notes: "",
      }
    );
  };

  const updateInspectionData = (
    id: string,
    field: keyof InspectionData,
    value: number | boolean | null | string
  ) => {
    setInspectionData((prev) => {
      const existing = prev[id] ?? {
        confirmed_quantity:
          orders.find((o) => o.id === id)?.quantity ?? 0,
        invoice_received: null,
        inspection_notes: "",
      };
      return { ...prev, [id]: { ...existing, [field]: value } };
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

    const invalidItems = [...selectedIds].filter((id) => {
      const data = getInspectionData(
        orders.find((o) => o.id === id)!
      );
      return data.invoice_received === null;
    });

    if (invalidItems.length > 0) {
      alert("거래명세서 수령 여부를 모두 선택해주세요.");
      return;
    }

    setIsProcessing(true);

    const now = new Date().toISOString();

    const updates = [...selectedIds].map((id) => {
      const order = orders.find((o) => o.id === id)!;
      const data = getInspectionData(order);

      return supabase
        .from("orders")
        .update({
          status: "inspecting",
          confirmed_quantity: data.confirmed_quantity,
          invoice_received: data.invoice_received,
          inspection_notes: data.inspection_notes.trim(),
          inspected_by: currentUserId,
          inspected_at: now,
        })
        .eq("id", id);
    });

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);

    if (failed) {
      setIsProcessing(false);
      return;
    }

    logClientAction("inspection", "inspect_bulk", `${selectedIds.size}건 일괄 검수`);
    setSelectedIds(new Set());
    setInspectionData({});
    setIsProcessing(false);
    await fetchOrders();
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
              <TableHead>수량</TableHead>
              <TableHead>요청자</TableHead>
              <TableHead>요청일</TableHead>
              <TableHead className="w-12">사진</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedOrders.map((order) => {
              const isSelected = selectedIds.has(order.id);
              const data = getInspectionData(order);
              const colCount = 7;

              return (
                <Fragment key={order.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => router.push(`/inspection/${order.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
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
                  {isSelected && (
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={colCount}>
                        <div className="flex items-end gap-3 py-1 pl-6">
                          <div>
                            <label className="block text-xs text-muted-foreground">확인 수량</label>
                            <Input
                              type="number"
                              min={1}
                              value={data.confirmed_quantity}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                updateInspectionData(
                                  order.id,
                                  "confirmed_quantity",
                                  Number(e.target.value)
                                )
                              }
                              className="mt-1 h-8 w-32"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-muted-foreground">거래명세서</label>
                            <Select
                              value={
                                data.invoice_received === null
                                  ? ""
                                  : data.invoice_received
                                    ? "received"
                                    : "not_received"
                              }
                              onValueChange={(v) =>
                                updateInspectionData(
                                  order.id,
                                  "invoice_received",
                                  v === "received"
                                )
                              }
                            >
                              <SelectTrigger className="mt-1 h-8 w-32" onClick={(e) => e.stopPropagation()}>
                                <SelectValue placeholder="선택" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="received">수령</SelectItem>
                                <SelectItem value="not_received">미수령</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="block text-xs text-muted-foreground">비고</label>
                            <Input
                              type="text"
                              placeholder="비고"
                              value={data.inspection_notes}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                updateInspectionData(
                                  order.id,
                                  "inspection_notes",
                                  e.target.value
                                )
                              }
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
                <div className="mt-3 space-y-2 pl-8">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">
                        확인 수량
                      </label>
                      <Input
                        type="number"
                        min={1}
                        value={data.confirmed_quantity}
                        onChange={(e) =>
                          updateInspectionData(
                            order.id,
                            "confirmed_quantity",
                            Number(e.target.value)
                          )
                        }
                        className="mt-0.5 h-8"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">
                        거래명세서
                      </label>
                      <Select
                        value={
                          data.invoice_received === null
                            ? ""
                            : data.invoice_received
                              ? "received"
                              : "not_received"
                        }
                        onValueChange={(v) =>
                          updateInspectionData(
                            order.id,
                            "invoice_received",
                            v === "received"
                          )
                        }
                      >
                        <SelectTrigger className="mt-0.5 h-8">
                          <SelectValue placeholder="선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="received">수령</SelectItem>
                          <SelectItem value="not_received">미수령</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">비고</label>
                    <Input
                      type="text"
                      placeholder="비고 (선택)"
                      value={data.inspection_notes}
                      onChange={(e) =>
                        updateInspectionData(
                          order.id,
                          "inspection_notes",
                          e.target.value
                        )
                      }
                      className="mt-0.5 h-8"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4 lg:left-60 lg:bottom-4">
          <Button
            className="w-full max-w-md md:max-w-2xl lg:max-w-full shadow-lg"
            onClick={handleBulkInspect}
            disabled={isProcessing}
          >
            <ClipboardCheck className="h-4 w-4" />
            {isProcessing
              ? "검수 처리 중..."
              : `일괄 검수 완료 (${selectedIds.size}건)`}
          </Button>
        </div>
      )}
    </div>
  );
}
