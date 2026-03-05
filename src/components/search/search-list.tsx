"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  Loader2,
  Search,
  SlidersHorizontal,
} from "lucide-react";
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
import { OrderStatusBadge, StatusLegend } from "@/components/orders/order-status-badge";
import { formatDate, toKSTDateString } from "@/lib/utils/format";
import { SearchFilterSheet } from "@/components/search/search-filter-sheet";
import type { OrderWithRequester } from "@/lib/types/order";
import { ORDER_TYPE_LABEL, ORDER_STATUS_LABEL } from "@/lib/types/order";
import {
  type SearchFilters,
  defaultFilters,
  filtersToSearchString,
  countActiveFilters,
} from "@/lib/utils/search-params";
import { PAGE_SIZE } from "@/lib/queries/search-orders";
import { exportFilteredOrders } from "@/lib/actions/export-orders";
import type ExcelJS from "exceljs";

interface SearchListProps {
  isAdmin?: boolean;
  currentUserId: string;
  initialData: OrderWithRequester[];
  totalCount: number;
  filters: SearchFilters;
  personNames: string[];
}

export function SearchList({
  isAdmin = false,
  currentUserId,
  initialData,
  totalCount,
  filters,
  personNames,
}: SearchListProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.q);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportOverlay, setShowExportOverlay] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 검색어 변경 시 searchInput을 필터와 동기화
  useEffect(() => {
    setSearchInput(filters.q);
  }, [filters.q]);

  const navigate = useCallback(
    (newFilters: SearchFilters) => {
      const url = `/search${filtersToSearchString(newFilters)}`;
      router.push(url);
    },
    [router]
  );

  // 검색어 디바운스
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        navigate({ ...filters, q: value, page: 1 });
      }, 400);
    },
    [filters, navigate]
  );

  // 필터 적용
  const handleFilterApply = useCallback(
    (newFilters: SearchFilters) => {
      navigate({ ...newFilters, page: 1 });
    },
    [navigate]
  );

  // 페이지 변경
  const handlePageChange = useCallback(
    (page: number) => {
      navigate({ ...filters, page });
    },
    [filters, navigate]
  );

  const activeFilterCount = countActiveFilters(filters);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // 엑셀 다운로드
  const handleExcelDownload = useCallback(async () => {
    setIsExporting(true);
    setShowExportOverlay(true);
    try {
      const { orders: allOrders, error } = await exportFilteredOrders(filters);
      if (error) {
        alert(error);
        return;
      }

      const { default: ExcelJSModule } = await import("exceljs");
      const wb = new ExcelJSModule.Workbook();
      const ws = wb.addWorksheet("주문조회");

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

      const headerRow = ws.getRow(1);
      headerRow.height = 24;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2563EB" },
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FF1D4ED8" } },
          bottom: { style: "thin", color: { argb: "FF1D4ED8" } },
          left: { style: "thin", color: { argb: "FF1D4ED8" } },
          right: { style: "thin", color: { argb: "FF1D4ED8" } },
        };
      });

      const thinBorder: Partial<ExcelJS.Borders> = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
      const evenFill: ExcelJS.Fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3F4F6" },
      };

      allOrders.forEach((order, i) => {
        const wasUpdated = order.updated_at !== order.created_at;
        const row = ws.addRow({
          is_urgent: order.is_urgent ? "Y" : "",
          type: ORDER_TYPE_LABEL[order.type],
          item_name: order.item_name,
          quantity: order.quantity > 0 ? order.quantity : "(사진 참고)",
          unit: order.unit,
          status: ORDER_STATUS_LABEL[order.status],
          requester: order.requester?.full_name ?? "",
          created_at: order.created_at
            ? toKSTDateString(order.created_at)
            : "",
          updater: wasUpdated ? (order.updater?.full_name ?? "") : "",
          updated_at: wasUpdated ? toKSTDateString(order.updated_at) : "",
          vendor_name: order.vendor_name,
          confirmed_quantity: order.confirmed_quantity ?? "",
          invoice:
            order.invoice_received === true
              ? "수령"
              : order.invoice_received === false
                ? "미수령"
                : "",
          inspector: order.inspector?.full_name ?? "",
          inspected_at: order.inspected_at
            ? toKSTDateString(order.inspected_at)
            : "",
          return_quantity: order.return_quantity ?? "",
          return_reason: order.return_reason ?? "",
        });

        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = thinBorder;
          cell.alignment = { vertical: "middle" };
          if (i % 2 === 1) cell.fill = evenFill;
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `주문조회_${toKSTDateString(new Date().toISOString())}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, [filters]);

  const header = (
    <header className="sticky top-0 z-40 border-b bg-background px-4 py-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">조회</h1>
        {isAdmin && (
          <Button
            variant="outline"
            size="icon"
            className="hidden md:flex"
            onClick={handleExcelDownload}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <StatusLegend />
      </div>
    </header>
  );

  return (
    <>
      {header}
      {/* 엑셀 다운로드 로딩 오버레이 */}
      {showExportOverlay && (
        <ExportOverlay
          totalCount={totalCount}
          isDone={!isExporting}
          onClose={() => setShowExportOverlay(false)}
        />
      )}
      <div className="space-y-4 p-4">
        {/* 검색창 + 필터 버튼 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="품목명 / 업체명 검색"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
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
        <p className="text-sm text-muted-foreground">
          {totalCount}건
          {totalPages > 1 && (
            <span className="ml-1">
              (페이지 {filters.page}/{totalPages})
            </span>
          )}
        </p>

        {/* 리스트 */}
        {initialData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground">
              조건에 맞는 항목이 없습니다.
            </p>
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
                  {initialData.map((order) => (
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
                          {order.is_urgent && (
                            <CircleAlert className="h-4 w-4 text-red-500 shrink-0" />
                          )}
                          {order.item_name}
                        </span>
                      </TableCell>
                      <TableCell>
                        {order.quantity > 0 ? (
                          `${order.quantity}${order.unit ? ` ${order.unit}` : ""}`
                        ) : (
                          <span className="text-muted-foreground">
                            (사진 참고)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {order.requester?.full_name ?? "-"}
                      </TableCell>
                      <TableCell>{formatDate(order.created_at)}</TableCell>
                      <TableCell>{order.vendor_name || "-"}</TableCell>
                      <TableCell>
                        {order.inspector?.full_name ?? "-"}
                      </TableCell>
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
              {initialData.map((order) => (
                <Link
                  key={order.id}
                  href={`/search/${order.id}`}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors active:opacity-70"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <OrderTypeBadge type={order.type} />
                      <OrderStatusBadge status={order.status} />
                      {order.is_urgent && (
                        <CircleAlert className="h-4 w-4 text-red-500 shrink-0" />
                      )}
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
              ))}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() => handlePageChange(filters.page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  이전
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {filters.page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page >= totalPages}
                  onClick={() => handlePageChange(filters.page + 1)}
                >
                  다음
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}

        {/* 필터 Sheet */}
        <SearchFilterSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          filters={filters}
          onApply={handleFilterApply}
          personNames={personNames}
        />
      </div>
    </>
  );
}

function ExportOverlay({
  totalCount,
  isDone,
  onClose,
}: {
  totalCount: number;
  isDone: boolean;
  onClose: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);

  // 경과 시간 카운터 (진행 중일 때만)
  useEffect(() => {
    if (isDone) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isDone]);

  // 감속 곡선 프로그레스: 빠르게 시작 → 점점 느려짐 → 90%에서 거의 멈춤
  useEffect(() => {
    if (isDone) return;
    const id = setInterval(() => {
      setProgress((prev) => {
        const remaining = 90 - prev;
        // 남은 거리의 8%씩 전진 → 자연스러운 감속
        return prev + remaining * 0.08;
      });
    }, 200);
    return () => clearInterval(id);
  }, [isDone]);

  // 완료 시 → 100%로 채우고 잠시 후 닫기
  useEffect(() => {
    if (!isDone) return;
    setProgress(100);
    const timer = setTimeout(onClose, 800);
    return () => clearTimeout(timer);
  }, [isDone, onClose]);

  const formatElapsed = (s: number) => {
    if (s < 60) return `${s}초`;
    return `${Math.floor(s / 60)}분 ${s % 60}초`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
      {isDone ? (
        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
          <svg className="h-5 w-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ) : (
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      )}
      <p className="text-sm font-medium">
        {isDone ? "다운로드 완료!" : "엑셀 파일 생성 중..."}
      </p>
      <div className="w-56 space-y-2">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        {!isDone && (
          <p className="text-xs text-muted-foreground text-center">
            {totalCount.toLocaleString()}건 처리 중 — {formatElapsed(elapsed)} 경과
          </p>
        )}
      </div>
    </div>
  );
}
