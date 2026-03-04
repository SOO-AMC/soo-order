"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, ChevronRight, ShoppingCart } from "lucide-react";
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
import { OrderTypeBadge } from "./order-type-badge";
import { OrderStatusBadge } from "./order-status-badge";
import { formatDate } from "@/lib/utils/format";
import { Spinner } from "@/components/ui/spinner";
import type { OrderWithRequester } from "@/lib/types/order";

interface OrderListProps {
  isAdmin?: boolean;
  currentUserId?: string;
  initialData?: OrderWithRequester[];
}

export function OrderList({ isAdmin = false, currentUserId, initialData }: OrderListProps) {
  const [orders, setOrders] = useState<OrderWithRequester[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isOrdering, setIsOrdering] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, requester:profiles!requester_id(full_name)")
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

  useEffect(() => {
    if (!initialData) {
      fetchOrders();
    }
  }, [fetchOrders, initialData]);

  const pendingOrders = orders.filter((o) => o.status === "pending");
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

  const handleBulkOrder = async () => {
    if (selectedIds.size === 0) return;
    setIsOrdering(true);

    const userId = currentUserId ?? (await supabase.auth.getSession()).data.session?.user.id;

    const { error } = await supabase
      .from("orders")
      .update({ status: "ordered", updated_by: userId })
      .in("id", [...selectedIds]);

    if (error) {
      setIsOrdering(false);
      return;
    }

    setSelectedIds(new Set());
    setIsOrdering(false);
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

  if (orders.length === 0) {
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
      {isAdmin && pendingOrders.length > 0 && (
        <label className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox
            checked={allPendingSelected}
            onCheckedChange={toggleSelectAll}
          />
          요청중 항목 전체 선택 ({pendingOrders.length}건)
        </label>
      )}

      {/* PC 테이블 뷰 */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && <TableHead className="w-10" />}
              <TableHead>유형</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>품목명</TableHead>
              <TableHead>수량</TableHead>
              <TableHead>요청자</TableHead>
              <TableHead>요청일</TableHead>
              <TableHead className="w-12">사진</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => {
              const isPending = order.status === "pending";
              const showCheckbox = isAdmin && isPending;

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
                          checked={selectedIds.has(order.id)}
                          onCheckedChange={() => toggleSelect(order.id)}
                        />
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <OrderTypeBadge type={order.type} />
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="font-medium">{order.item_name}</TableCell>
                  <TableCell>
                    {order.quantity}{order.unit ? ` ${order.unit}` : ""}
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
        {orders.map((order) => {
          const isPending = order.status === "pending";
          const showCheckbox = isAdmin && isPending;

          return (
            <div
              key={order.id}
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors"
            >
              {showCheckbox && (
                <Checkbox
                  checked={selectedIds.has(order.id)}
                  onCheckedChange={() => toggleSelect(order.id)}
                />
              )}
              <Link
                href={`/orders/${order.id}`}
                className="flex flex-1 items-center gap-3 min-w-0 active:opacity-70"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <OrderTypeBadge type={order.type} />
                    <OrderStatusBadge status={order.status} />
                    <span className="truncate font-medium">{order.item_name}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <span>수량: {order.quantity}{order.unit ? ` ${order.unit}` : ""}</span>
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
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4 lg:left-60 lg:bottom-4">
          <Button
            className="w-full max-w-md md:max-w-2xl lg:max-w-full shadow-lg"
            onClick={handleBulkOrder}
            disabled={isOrdering}
          >
            <ShoppingCart className="h-4 w-4" />
            {isOrdering
              ? "발주 처리 중..."
              : `선택 항목 일괄 발주 (${selectedIds.size}건)`}
          </Button>
        </div>
      )}
    </div>
  );
}
