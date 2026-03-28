"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, ChevronRight, CircleAlert, PackagePlus, Undo2 } from "lucide-react";
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
import {
  bulkDispatchReturn,
  bulkCompleteReturn,
} from "@/lib/actions/order-mutations";

export function ReturnList() {
  const [orders, setOrders] = useState<OrderWithRequester[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRequestedIds, setSelectedRequestedIds] = useState<Set<string>>(new Set());
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "*, requester:profiles!requester_id(full_name), return_requester:profiles!return_requested_by(full_name)"
      )
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

  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("return-list")
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

  const requested = [...orders]
    .filter((o) => o.status === "return_requested")
    .sort((a, b) => (a.is_urgent === b.is_urgent ? 0 : a.is_urgent ? -1 : 1));

  const pending = [...orders]
    .filter((o) => o.status === "return_pending")
    .sort((a, b) => (a.is_urgent === b.is_urgent ? 0 : a.is_urgent ? -1 : 1));

  const allRequestedSelected =
    requested.length > 0 && requested.every((o) => selectedRequestedIds.has(o.id));
  const allPendingSelected =
    pending.length > 0 && pending.every((o) => selectedPendingIds.has(o.id));

  const toggleRequested = (id: string) =>
    setSelectedRequestedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const togglePending = (id: string) =>
    setSelectedPendingIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelectAllRequested = () =>
    setSelectedRequestedIds(
      allRequestedSelected ? new Set() : new Set(requested.map((o) => o.id))
    );

  const toggleSelectAllPending = () =>
    setSelectedPendingIds(
      allPendingSelected ? new Set() : new Set(pending.map((o) => o.id))
    );

  const handleBulkDispatch = async () => {
    if (selectedRequestedIds.size === 0) return;
    setIsProcessing(true);
    try {
      await bulkDispatchReturn([...selectedRequestedIds]);
      logClientAction("return", "dispatch_return_bulk", `${selectedRequestedIds.size}건 반품 접수`);
      setSelectedRequestedIds(new Set());
      await fetchOrders();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkComplete = async () => {
    if (selectedPendingIds.size === 0) return;
    setIsProcessing(true);
    try {
      await bulkCompleteReturn([...selectedPendingIds]);
      logClientAction("return", "complete_return_bulk", `${selectedPendingIds.size}건 일괄 반품 완료`);
      setSelectedPendingIds(new Set());
      await fetchOrders();
    } finally {
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

  if (requested.length === 0 && pending.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">반품 신청 품목이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 반품신청 섹션 */}
      <Section
        title="반품신청"
        count={requested.length}
        orders={requested}
        selectedIds={selectedRequestedIds}
        allSelected={allRequestedSelected}
        onToggle={toggleRequested}
        onToggleAll={toggleSelectAllRequested}
        onRowClick={(id) => router.push(`/returns/${id}`)}
      />

      {/* 반품대기 섹션 */}
      <Section
        title="반품대기"
        count={pending.length}
        orders={pending}
        selectedIds={selectedPendingIds}
        allSelected={allPendingSelected}
        onToggle={togglePending}
        onToggleAll={toggleSelectAllPending}
        onRowClick={(id) => router.push(`/returns/${id}`)}
      />

      {/* 반품신청 일괄 접수 버튼 */}
      {selectedRequestedIds.size > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4 lg:left-60 lg:bottom-4">
          <Button
            className="w-full max-w-md md:max-w-2xl lg:max-w-full shadow-lg"
            onClick={handleBulkDispatch}
            disabled={isProcessing}
          >
            <Undo2 className="h-4 w-4" />
            {isProcessing ? "처리 중..." : `일괄 반품 접수 (${selectedRequestedIds.size}건)`}
          </Button>
        </div>
      )}

      {/* 반품대기 일괄 완료 버튼 */}
      {selectedPendingIds.size > 0 && selectedRequestedIds.size === 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4 lg:left-60 lg:bottom-4">
          <Button
            className="w-full max-w-md md:max-w-2xl lg:max-w-full shadow-lg"
            onClick={handleBulkComplete}
            disabled={isProcessing}
          >
            <Undo2 className="h-4 w-4" />
            {isProcessing ? "처리 중..." : `일괄 반품 완료 (${selectedPendingIds.size}건)`}
          </Button>
        </div>
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  count: number;
  orders: OrderWithRequester[];
  selectedIds: Set<string>;
  allSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onRowClick: (id: string) => void;
}

function Section({
  title,
  count,
  orders,
  selectedIds,
  allSelected,
  onToggle,
  onToggleAll,
  onRowClick,
}: SectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 py-2">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox
              className="h-5 w-5"
              checked={allSelected}
              onCheckedChange={onToggleAll}
              disabled={count === 0}
            />
            <span className="font-medium text-foreground">{title}</span>
            <span className="text-muted-foreground">({count}건)</span>
          </label>
        </div>
        <StatusLegend />
      </div>

      {count === 0 ? (
        <p className="px-1 py-4 text-sm text-muted-foreground">항목이 없습니다.</p>
      ) : (
        <>
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
                  <TableHead className="w-12">사진</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <Fragment key={order.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => onRowClick(order.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          className="h-5 w-5"
                          checked={selectedIds.has(order.id)}
                          onCheckedChange={() => onToggle(order.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {order.is_urgent && <CircleAlert className="h-4 w-4 text-red-500 shrink-0" />}
                          {order.item_name}
                          {order.type === "return" && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                              <PackagePlus className="h-2.5 w-2.5" />
                              직접등록
                            </span>
                          )}
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
                      <TableCell>
                        {order.return_requested_at ? formatDate(order.return_requested_at) : "-"}
                      </TableCell>
                      <TableCell>
                        {order.return_photo_urls?.length > 0 && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Camera className="h-3.5 w-3.5" />
                            {order.return_photo_urls.length}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 모바일/태블릿 카드 뷰 */}
          <div className="lg:hidden space-y-2">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-card transition-colors"
              >
                <Checkbox
                  className="h-5 w-5"
                  checked={selectedIds.has(order.id)}
                  onCheckedChange={() => onToggle(order.id)}
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
                      {order.type === "return" && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                          <PackagePlus className="h-2.5 w-2.5" />
                          직접등록
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <span>
                        반품: {order.return_quantity ?? order.quantity}
                        {order.unit ? ` ${order.unit}` : ""}
                      </span>
                      <span>·</span>
                      <span>
                        {order.return_requested_at ? formatDate(order.return_requested_at) : "-"}
                      </span>
                      {order.return_photo_urls?.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <Camera className="h-3 w-3" />
                            {order.return_photo_urls.length}
                          </span>
                        </>
                      )}
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
        </>
      )}
    </div>
  );
}
