"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, ChevronRight, CircleAlert, Download, Search, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderTypeBadge } from "@/components/orders/order-type-badge";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { formatDate } from "@/lib/utils/format";
import {
  SearchFilterSheet,
  defaultFilters,
  type SearchFilters,
} from "@/components/search/search-filter-sheet";
import { Spinner } from "@/components/ui/spinner";
import type { OrderWithRequester } from "@/lib/types/order";
import { ORDER_TYPE_LABEL, ORDER_STATUS_LABEL } from "@/lib/types/order";
import ExcelJS from "exceljs";

interface SearchListProps {
  isAdmin?: boolean;
  currentUserId: string;
  initialData?: OrderWithRequester[];
}

export function SearchList({ isAdmin = false, currentUserId, initialData }: SearchListProps) {
  const [orders, setOrders] = useState<OrderWithRequester[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);
  const [sheetOpen, setSheetOpen] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "*, requester:profiles!requester_id(full_name), updater:profiles!updated_by(full_name), inspector:profiles!inspected_by(full_name), return_requester:profiles!return_requested_by(full_name)"
      )
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

  // 사람 필터 옵션 추출
  const requesterNames = useMemo(
    () => [...new Set(orders.map((o) => o.requester?.full_name).filter(Boolean))] as string[],
    [orders]
  );
  const updaterNames = useMemo(
    () => [...new Set(orders.map((o) => o.updater?.full_name).filter(Boolean))] as string[],
    [orders]
  );
  const inspectorNames = useMemo(
    () => [...new Set(orders.map((o) => o.inspector?.full_name).filter(Boolean))] as string[],
    [orders]
  );
  const returnRequesterNames = useMemo(
    () => [...new Set(orders.map((o) => o.return_requester?.full_name).filter(Boolean))] as string[],
    [orders]
  );

  // 활성 필터 개수
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.type !== "all") count++;
    if (filters.status !== "all") count++;
    if (filters.requesterName !== "all") count++;
    if (filters.updaterName !== "all") count++;
    if (filters.inspectorName !== "all") count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.orderedDateFrom || filters.orderedDateTo) count++;
    if (filters.inspectedDateFrom || filters.inspectedDateTo) count++;
    if (filters.returnRequesterName !== "all") count++;
    if (filters.returnDateFrom || filters.returnDateTo) count++;
    if (filters.invoiceReceived !== "all") count++;
    if (filters.isUrgent !== "all") count++;
    return count;
  }, [filters]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 품목명 / 업체명 검색
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchItem = order.item_name.toLowerCase().includes(q);
        const matchVendor = order.vendor_name?.toLowerCase().includes(q);
        if (!matchItem && !matchVendor) return false;
      }
      // 유형
      if (filters.type !== "all" && order.type !== filters.type) {
        return false;
      }
      // 상태
      if (filters.status !== "all" && order.status !== filters.status) {
        return false;
      }
      // 요청자
      if (filters.requesterName !== "all" && order.requester?.full_name !== filters.requesterName) {
        return false;
      }
      // 발주자
      if (filters.updaterName !== "all" && order.updater?.full_name !== filters.updaterName) {
        return false;
      }
      // 검수자
      if (filters.inspectorName !== "all" && order.inspector?.full_name !== filters.inspectorName) {
        return false;
      }
      // 요청 날짜 범위
      if (filters.dateFrom) {
        const orderDate = order.created_at.slice(0, 10);
        if (orderDate < filters.dateFrom) return false;
      }
      if (filters.dateTo) {
        const orderDate = order.created_at.slice(0, 10);
        if (orderDate > filters.dateTo) return false;
      }
      // 발주 날짜 범위 (updated_at when status >= ordered)
      if (filters.orderedDateFrom) {
        if (!order.updated_at) return false;
        const orderedDate = order.updated_at.slice(0, 10);
        if (orderedDate < filters.orderedDateFrom) return false;
      }
      if (filters.orderedDateTo) {
        if (!order.updated_at) return false;
        const orderedDate = order.updated_at.slice(0, 10);
        if (orderedDate > filters.orderedDateTo) return false;
      }
      // 검수 날짜 범위
      if (filters.inspectedDateFrom) {
        if (!order.inspected_at) return false;
        const inspDate = order.inspected_at.slice(0, 10);
        if (inspDate < filters.inspectedDateFrom) return false;
      }
      if (filters.inspectedDateTo) {
        if (!order.inspected_at) return false;
        const inspDate = order.inspected_at.slice(0, 10);
        if (inspDate > filters.inspectedDateTo) return false;
      }
      // 반품 신청자
      if (filters.returnRequesterName !== "all" && order.return_requester?.full_name !== filters.returnRequesterName) {
        return false;
      }
      // 반품 신청 날짜 범위
      if (filters.returnDateFrom) {
        if (!order.return_requested_at) return false;
        const retDate = order.return_requested_at.slice(0, 10);
        if (retDate < filters.returnDateFrom) return false;
      }
      if (filters.returnDateTo) {
        if (!order.return_requested_at) return false;
        const retDate = order.return_requested_at.slice(0, 10);
        if (retDate > filters.returnDateTo) return false;
      }
      // 거래명세서
      if (filters.invoiceReceived !== "all") {
        if (order.status !== "inspecting" && order.status !== "return_requested" && order.status !== "return_completed") return false;
        if (filters.invoiceReceived === "received" && order.invoice_received !== true) return false;
        if (filters.invoiceReceived === "not_received" && order.invoice_received !== false)
          return false;
      }
      // 긴급
      if (filters.isUrgent !== "all") {
        if (filters.isUrgent === "urgent" && !order.is_urgent) return false;
        if (filters.isUrgent === "normal" && order.is_urgent) return false;
      }
      return true;
    });
  }, [orders, searchQuery, filters]);

  const handleExcelDownload = useCallback(async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("주문조회");

    // 컬럼 정의
    ws.columns = [
      { header: "긴급", key: "is_urgent", width: 6 },
      { header: "유형", key: "type", width: 8 },
      { header: "품목명", key: "item_name", width: 22 },
      { header: "수량", key: "quantity", width: 8 },
      { header: "단위", key: "unit", width: 8 },
      { header: "상태", key: "status", width: 10 },
      { header: "요청자", key: "requester", width: 10 },
      { header: "요청일", key: "created_at", width: 12 },
      { header: "수정자", key: "updater", width: 10 },
      { header: "수정일", key: "updated_at", width: 12 },
      { header: "업체명", key: "vendor_name", width: 14 },
      { header: "확인수량", key: "confirmed_quantity", width: 10 },
      { header: "거래명세서", key: "invoice", width: 12 },
      { header: "검수자", key: "inspector", width: 10 },
      { header: "검수일", key: "inspected_at", width: 12 },
      { header: "반품수량", key: "return_quantity", width: 10 },
      { header: "반품사유", key: "return_reason", width: 18 },
    ];

    // 헤더 스타일
    const headerRow = ws.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FF1D4ED8" } },
        bottom: { style: "thin", color: { argb: "FF1D4ED8" } },
        left: { style: "thin", color: { argb: "FF1D4ED8" } },
        right: { style: "thin", color: { argb: "FF1D4ED8" } },
      };
    });

    // 데이터 행 추가
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
    const evenFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };

    filteredOrders.forEach((order, i) => {
      const wasUpdated = order.updated_at !== order.created_at;
      const row = ws.addRow({
        is_urgent: order.is_urgent ? "Y" : "",
        type: ORDER_TYPE_LABEL[order.type],
        item_name: order.item_name,
        quantity: order.quantity > 0 ? order.quantity : "(사진 참고)",
        unit: order.unit,
        status: ORDER_STATUS_LABEL[order.status],
        requester: order.requester?.full_name ?? "",
        created_at: order.created_at ? order.created_at.slice(0, 10) : "",
        updater: wasUpdated ? (order.updater?.full_name ?? "") : "",
        updated_at: wasUpdated ? order.updated_at.slice(0, 10) : "",
        vendor_name: order.vendor_name,
        confirmed_quantity: order.confirmed_quantity ?? "",
        invoice:
          order.invoice_received === true
            ? "수령"
            : order.invoice_received === false
              ? "미수령"
              : "",
        inspector: order.inspector?.full_name ?? "",
        inspected_at: order.inspected_at ? order.inspected_at.slice(0, 10) : "",
        return_quantity: order.return_quantity ?? "",
        return_reason: order.return_reason ?? "",
      });

      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = thinBorder;
        cell.alignment = { vertical: "middle" };
        if (i % 2 === 1) cell.fill = evenFill;
      });
    });

    // 다운로드
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `주문조회_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredOrders]);

  const header = (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-background px-4 py-3">
      <h1 className="text-lg font-bold">조회</h1>
      {isAdmin && (
        <Button
          variant="outline"
          size="icon"
          className="hidden md:flex"
          onClick={handleExcelDownload}
        >
          <Download className="h-4 w-4" />
        </Button>
      )}
    </header>
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
          <p className="text-destructive">데이터를 불러올 수 없습니다.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="space-y-4 p-4">
      {/* 검색창 + 필터 버튼 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="품목명 / 업체명 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="relative shrink-0"
          onClick={() => setSheetOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* 결과 건수 */}
      <p className="text-sm text-muted-foreground">{filteredOrders.length}건</p>

      {/* 리스트 */}
      {filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">조건에 맞는 항목이 없습니다.</p>
        </div>
      ) : (
        <>
          {/* PC 테이블 뷰 */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>유형</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>품목명</TableHead>
                  <TableHead>수량</TableHead>
                  <TableHead>요청자</TableHead>
                  <TableHead>요청일</TableHead>
                  <TableHead>업체명</TableHead>
                  <TableHead>검수자</TableHead>
                  <TableHead className="w-12">사진</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/search/${order.id}`)}
                  >
                    <TableCell>
                      <OrderTypeBadge type={order.type} />
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
                    <TableCell>{order.vendor_name || "-"}</TableCell>
                    <TableCell>{order.inspector?.full_name ?? "-"}</TableCell>
                    <TableCell>
                      {order.photo_urls?.length > 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Camera className="h-3.5 w-3.5" />
                          {order.photo_urls.length}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 모바일/태블릿 카드 뷰 */}
          <div className="lg:hidden space-y-2">
            {filteredOrders.map((order) => (
              <Link
                key={order.id}
                href={`/search/${order.id}`}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors active:opacity-70"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <OrderTypeBadge type={order.type} />
                    <OrderStatusBadge status={order.status} />
                    {order.is_urgent && <CircleAlert className="h-4 w-4 text-red-500 shrink-0" />}
                    <span className="truncate font-medium">{order.item_name}</span>
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
            ))}
          </div>
        </>
      )}

      {/* 필터 Sheet */}
      <SearchFilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        filters={filters}
        onApply={setFilters}
        requesterNames={requesterNames}
        updaterNames={updaterNames}
        inspectorNames={inspectorNames}
        returnRequesterNames={returnRequesterNames}
      />
      </div>
    </>
  );
}
