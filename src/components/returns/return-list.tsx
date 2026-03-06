"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, CircleAlert, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
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

interface ReturnListProps {
  isAdmin?: boolean;
  currentUserId: string;
  initialData?: OrderWithRequester[];
}

export function ReturnList({ currentUserId, initialData }: ReturnListProps) {
  const [orders, setOrders] = useState<OrderWithRequester[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "*, requester:profiles!requester_id(full_name), return_requester:profiles!return_requested_by(full_name)"
      )
      .eq("status", "return_requested")
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

  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!initialData) {
      fetchOrders();
    }

    const channel = supabase
      .channel("return-list")
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
  }, [fetchOrders, initialData]);

  const sortedOrders = [...orders].sort((a, b) => {
    if (a.is_urgent !== b.is_urgent) return a.is_urgent ? -1 : 1;
    return 0;
  });

  const allSelected =
    sortedOrders.length > 0 && sortedOrders.every((o) => selectedIds.has(o.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  const handleBulkComplete = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);

    const updates = [...selectedIds].map((id) =>
      supabase
        .from("orders")
        .update({ status: "return_completed", updated_by: currentUserId })
        .eq("id", id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);

    if (failed) {
      setIsProcessing(false);
      return;
    }

    logClientAction("return", "complete_return_bulk", `${selectedIds.size}건 일괄 반품 완료`);
    setSelectedIds(new Set());
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
        <p className="text-muted-foreground">반품 신청 품목이 없습니다.</p>
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
              <TableHead>반품수량</TableHead>
              <TableHead>반품사유</TableHead>
              <TableHead>신청자</TableHead>
              <TableHead>신청일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedOrders.map((order) => (
              <Fragment key={order.id}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => router.push(`/returns/${order.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(order.id)}
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
                    {order.return_quantity ?? order.quantity}
                    {order.unit ? ` ${order.unit}` : ""}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {order.return_reason || "-"}
                  </TableCell>
                  <TableCell>{order.return_requester?.full_name ?? "-"}</TableCell>
                  <TableCell>{order.return_requested_at ? formatDate(order.return_requested_at) : "-"}</TableCell>
                </TableRow>
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 모바일/태블릿 카드 뷰 */}
      <div className="lg:hidden space-y-2">
        {sortedOrders.map((order) => (
          <div
            key={order.id}
            className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-card transition-colors"
          >
            <Checkbox
              checked={selectedIds.has(order.id)}
              onCheckedChange={() => toggleSelect(order.id)}
            />
            <Link
              href={`/returns/${order.id}`}
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
                    반품: {order.return_quantity ?? order.quantity}
                    {order.unit ? ` ${order.unit}` : ""}
                  </span>
                  <span>·</span>
                  <span>{order.return_requested_at ? formatDate(order.return_requested_at) : "-"}</span>
                </div>
                {order.return_reason && (
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">
                    사유: {order.return_reason}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </div>
        ))}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4 lg:left-60 lg:bottom-4">
          <Button
            className="w-full max-w-md md:max-w-2xl lg:max-w-full shadow-lg"
            onClick={handleBulkComplete}
            disabled={isProcessing}
          >
            <Undo2 className="h-4 w-4" />
            {isProcessing
              ? "반품 처리 중..."
              : `일괄 반품 완료 (${selectedIds.size}건)`}
          </Button>
        </div>
      )}
    </div>
  );
}
