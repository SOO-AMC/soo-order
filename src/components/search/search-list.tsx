"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Camera, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, SearchX, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/list-parts";
import { SavedViews } from "@/components/workspace/saved-views";
import { FilterBar, SearchField, FilterChip, ClearFilters } from "@/components/workspace/filter-bar";
import { DetailPanel, WorkspaceSplit, DetailFields, Timeline } from "@/components/workspace/detail-panel";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { formatDate, toKSTDateString } from "@/lib/utils/format";
import { SearchFilterSheet } from "@/components/search/search-filter-sheet";
import type { OrderWithRequester } from "@/lib/types/order";
import { ORDER_TYPE_LABEL, ORDER_STATUS_LABEL } from "@/lib/types/order";
import {
  type SearchFilters,
  type StatusValue,
  defaultFilters,
  filtersToSearchString,
  countActiveFilters,
  parseSearchParams,
} from "@/lib/utils/search-params";
import { PAGE_SIZE } from "@/lib/queries/search-orders";
import { searchOrders, fetchPersonNames } from "@/lib/actions/search-action";
import { exportFilteredOrders } from "@/lib/actions/export-orders";
import { shareInflight } from "@/lib/utils/inflight";

/** 직원 이름 목록 — 거의 안 바뀌므로 브라우저가 10분 기억한다 */
let personNamesCache: { at: number; names: string[] } | null = null;
const PERSON_NAMES_TTL_MS = 10 * 60 * 1000;
import type ExcelJS from "exceljs";

/** 상태 묶음 보기 — filters.status와 정확히 같을 때만 그 보기가 켜진다 */
type ViewKey = "all" | "progress" | "done" | "returns" | "oos" | "custom";
const VIEW_STATUSES: Record<Exclude<ViewKey, "custom">, StatusValue[]> = {
  all: defaultFilters.status,
  progress: ["pending", "ordered"],
  done: ["inspecting"],
  returns: ["return_requested", "return_pending", "return_completed"],
  oos: ["out_of_stock"],
};
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((v) => b.includes(v));

/** 요청일 빠른 기간 (오늘 포함 N일) */
type PeriodKey = "7" | "30" | "90" | "365";
const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "7", label: "최근 7일" },
  { value: "30", label: "최근 30일" },
  { value: "90", label: "최근 3개월" },
  { value: "365", label: "최근 1년" },
];
const daysAgoKST = (today: string, n: number) => {
  const d = new Date(`${today}T00:00:00+09:00`);
  d.setDate(d.getDate() - (n - 1));
  return toKSTDateString(d.toISOString());
};

const at = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : undefined;

export function SearchList() {
  const { isAdmin } = useAuth();
  const [personNames, setPersonNames] = useState<string[]>(() => personNamesCache?.names ?? []);
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportOverlay, setShowExportOverlay] = useState(false);
  const [actionError, setActionError] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [today] = useState(() => toKSTDateString(new Date().toISOString()));
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);
  const [searchInput, setSearchInput] = useState("");
  const [orders, setOrders] = useState<OrderWithRequester[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // 데이터 fetch
  const fetchData = useCallback(async (f: SearchFilters) => {
    setIsLoading(true);
    try {
      const result = await searchOrders(f);
      setOrders(result.orders);
      setTotalCount(result.totalCount);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 필터 변경 → fetch + URL 동기화
  const applyFilters = useCallback(
    (newFilters: SearchFilters) => {
      setFilters(newFilters);
      filtersRef.current = newFilters;
      const url = `/search${filtersToSearchString(newFilters)}`;
      window.history.replaceState(null, "", url);
      fetchData(newFilters);
    },
    [fetchData]
  );

  // URL(searchParams) 변화마다 필터 재적용 — 같은 /search 안에서 다른 사람/검색으로 다시 진입해도 반영됨
  const spString = searchParams.toString();
  useEffect(() => {
    const obj: Record<string, string> = {};
    new URLSearchParams(spString).forEach((v, k) => { obj[k] = v; });
    const next = parseSearchParams(obj);
    setFilters(next);
    setSearchInput(next.q);
    fetchData(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spString]);

  // 인원 이름 목록 (1회)
  useEffect(() => {
    if (personNamesCache && Date.now() - personNamesCache.at < PERSON_NAMES_TTL_MS) return;
    shareInflight("person-names", fetchPersonNames)
      .then((names) => {
        personNamesCache = { at: Date.now(), names };
        setPersonNames(names);
      })
      .catch(() => {});
  }, []);

  // 검색어 디바운스
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        applyFilters({ ...filtersRef.current, q: value, page: 1 });
      }, 400);
    },
    [applyFilters]
  );

  const patch = useCallback(
    (p: Partial<SearchFilters>) => applyFilters({ ...filtersRef.current, ...p, page: 1 }),
    [applyFilters]
  );

  // 필터 시트 적용
  const handleFilterApply = useCallback(
    (newFilters: SearchFilters) => {
      setSearchInput(newFilters.q);
      applyFilters({ ...newFilters, page: 1 });
    },
    [applyFilters]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      applyFilters({ ...filtersRef.current, page });
    },
    [applyFilters]
  );

  const activeFilterCount = countActiveFilters(filters);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const view: ViewKey = useMemo(() => {
    for (const [k, v] of Object.entries(VIEW_STATUSES)) if (sameSet(filters.status, v)) return k as ViewKey;
    return "custom";
  }, [filters.status]);

  const period: PeriodKey | null = useMemo(() => {
    if (filters.dateTo) return null;
    return PERIODS.find((p) => filters.dateFrom === daysAgoKST(today, Number(p.value)))?.value ?? null;
  }, [filters.dateFrom, filters.dateTo, today]);

  const personOptions = useMemo(() => personNames.map((n) => ({ value: n, label: n })), [personNames]);

  const clearAll = () => {
    setSearchInput("");
    applyFilters({ ...defaultFilters });
  };

  const detailOrder = detailId ? orders.find((o) => o.id === detailId) ?? null : null;
  const detailIndex = detailOrder ? orders.findIndex((o) => o.id === detailOrder.id) : -1;

  // 엑셀 다운로드
  const handleExcelDownload = useCallback(async () => {
    setIsExporting(true);
    setActionError("");
    setShowExportOverlay(true);
    try {
      const { orders: allOrders, error } = await exportFilteredOrders(filters);
      if (error) {
        setActionError(error);
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
        { header: "비고(요청)", key: "notes", width: 16 },
        { header: "비고(발주)", key: "order_notes", width: 16 },
        { header: "비고(검수)", key: "inspection_notes", width: 16 },
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
          fgColor: { argb: "FF1166A7" },
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
          notes: order.notes ?? "",
          order_notes: order.order_notes ?? "",
          inspection_notes: order.inspection_notes ?? "",
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

  const excelButton = isAdmin ? (
    <Button variant="outline" className="h-9 rounded-lg px-3 text-[13px]" onClick={handleExcelDownload} disabled={isExporting}>
      {isExporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      <span className="hidden sm:inline">엑셀</span>
    </Button>
  ) : undefined;

  const rangeStart = (filters.page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(filters.page * PAGE_SIZE, totalCount);

  return (
    <>
      <PageHeader
        title="조회"
        description={isLoading ? undefined : `${totalCount.toLocaleString()}건`}
        leading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
        action={excelButton}
      />
      {/* 엑셀 다운로드 로딩 오버레이 */}
      {showExportOverlay && (
        <ExportOverlay totalCount={totalCount} isDone={!isExporting} onClose={() => setShowExportOverlay(false)} />
      )}

      <div className="space-y-3 p-4 lg:px-6">
        <SavedViews<ViewKey>
          value={view}
          onValueChange={(v) => {
            if (v !== "custom") patch({ status: [...VIEW_STATUSES[v]] });
          }}
          views={[
            { value: "all", label: "전체" },
            { value: "progress", label: "진행 중" },
            { value: "done", label: "검수완료" },
            { value: "returns", label: "반품" },
            { value: "oos", label: "품절" },
          ]}
        />

        <FilterBar>
          <SearchField id="search-q" value={searchInput} onChange={handleSearchChange} placeholder="품목명·업체명 검색" />
          <FilterChip<PeriodKey>
            label="요청일"
            options={PERIODS}
            value={period}
            onChange={(v) => patch({ dateFrom: v ? daysAgoKST(today, Number(v)) : "", dateTo: "" })}
          />
          <FilterChip
            label="요청자"
            options={personOptions}
            value={filters.requester || null}
            onChange={(v) => patch({ requester: v ?? "" })}
          />
          <FilterChip
            label="긴급"
            options={[
              { value: "urgent", label: "긴급만" },
              { value: "normal", label: "일반만" },
            ]}
            value={filters.urgent.length === 1 ? filters.urgent[0] : null}
            onChange={(v) => patch({ urgent: v ? [v] : [...defaultFilters.urgent] })}
          />
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] transition-colors",
              activeFilterCount > 0
                ? "bg-foreground font-semibold text-background"
                : "border border-input bg-card text-subtle-foreground hover:text-foreground"
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            상세 필터
            {activeFilterCount > 0 && <span className="tabular-nums">{activeFilterCount}</span>}
          </button>
          <ClearFilters show={activeFilterCount > 0 || !!filters.q} onClear={clearAll} />
        </FilterBar>

        {actionError && (
          <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
            {actionError}
          </p>
        )}

        {isLoading ? (
          <ListSkeleton rows={8} />
        ) : orders.length === 0 ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState
              icon={SearchX}
              title="조건에 맞는 주문이 없어요"
              description="검색어나 필터를 바꿔 보세요."
              action={
                activeFilterCount > 0 || filters.q ? (
                  <Button variant="outline" size="sm" onClick={clearAll}>
                    필터 지우기
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <WorkspaceSplit>
            <div className="min-w-0 flex-1 space-y-3">
              {/* PC 표 */}
              <section className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-border lg:block">
                <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-muted-foreground">
                      <th className="w-[108px] border-b border-border py-2 pl-4 font-semibold">상태</th>
                      <th className="border-b border-border px-3 py-2 font-semibold">품목</th>
                      <th className="w-24 border-b border-border px-3 py-2 text-right font-semibold">수량</th>
                      <th className="w-[18%] border-b border-border px-3 py-2 font-semibold">업체</th>
                      <th className="w-[96px] border-b border-border px-3 py-2 font-semibold">요청</th>
                      <th className="w-[96px] border-b border-border px-3 py-2 pr-4 font-semibold">검수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const isOpen = detailId === order.id;
                      return (
                        <tr
                          key={order.id}
                          onClick={() => setDetailId(order.id)}
                          className={cn(
                            "cursor-pointer",
                            isOpen ? "bg-row-selected shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-muted/60"
                          )}
                        >
                          <td className="border-b border-border py-2.5 pl-4">
                            <OrderStatusBadge status={order.status} />
                          </td>
                          <td className="min-w-0 border-b border-border px-3 py-2.5">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-sm font-semibold">{order.item_name}</span>
                              {order.is_urgent && <Tag tone="danger">긴급</Tag>}
                              {order.type === "return" && <Tag>직접 반품</Tag>}
                              {order.photo_urls?.length > 0 && (
                                <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                                  <Camera className="size-3.5" aria-label="사진" />
                                  {order.photo_urls.length}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="whitespace-nowrap border-b border-border px-3 py-2.5 text-right tabular-nums">
                            {order.quantity > 0 ? (
                              <>
                                <b className="text-sm">{order.quantity}</b>
                                {order.unit ? <span className="text-subtle-foreground"> {order.unit}</span> : null}
                              </>
                            ) : (
                              <span className="text-muted-foreground">사진 참고</span>
                            )}
                          </td>
                          <td className="truncate border-b border-border px-3 py-2.5 text-subtle-foreground">{order.vendor_name || "—"}</td>
                          <td className="whitespace-nowrap border-b border-border px-3 py-2.5">
                            <span className="block truncate">{order.requester?.full_name ?? "—"}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{formatDate(order.created_at)}</span>
                          </td>
                          <td className="whitespace-nowrap border-b border-border px-3 py-2.5 pr-4">
                            {order.inspected_at ? (
                              <>
                                <span className="block truncate">{order.inspector?.full_name ?? "—"}</span>
                                <span className="text-xs tabular-nums text-muted-foreground">{formatDate(order.inspected_at)}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              {/* 모바일/태블릿 */}
              <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border lg:hidden">
                {orders.map((order, i) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setDetailId(order.id)}
                    className={cn("flex w-full items-start gap-3 px-4 py-3 text-left active:bg-muted", i > 0 && "border-t border-border")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[15px] font-semibold leading-snug">{order.item_name}</span>
                        {order.is_urgent && <Tag tone="danger">긴급</Tag>}
                      </span>
                      <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                        <OrderStatusBadge status={order.status} />
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          {order.quantity > 0 ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}` : "사진 참고"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{order.requester?.full_name ?? "—"}</span>
                        <span aria-hidden="true">·</span>
                        <span className="shrink-0 tabular-nums">{formatDate(order.created_at)}</span>
                      </span>
                    </span>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                ))}
              </section>

              {/* 페이지 */}
              <div className="flex items-center justify-between gap-2 px-1 pt-1">
                <span className="text-[13px] tabular-nums text-muted-foreground">
                  {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} / {totalCount.toLocaleString()}건
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg bg-card"
                      disabled={filters.page <= 1}
                      onClick={() => handlePageChange(filters.page - 1)}
                    >
                      <ChevronLeft className="size-4" />
                      이전
                    </Button>
                    <span className="px-2 text-[13px] tabular-nums text-subtle-foreground">
                      {filters.page} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg bg-card"
                      disabled={filters.page >= totalPages}
                      onClick={() => handlePageChange(filters.page + 1)}
                    >
                      다음
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {detailOrder && (
              <SearchDetail
                order={detailOrder}
                onClose={() => setDetailId(null)}
                onPrev={detailIndex > 0 ? () => setDetailId(orders[detailIndex - 1].id) : undefined}
                onNext={detailIndex >= 0 && detailIndex < orders.length - 1 ? () => setDetailId(orders[detailIndex + 1].id) : undefined}
              />
            )}
          </WorkspaceSplit>
        )}

        {/* 상세 필터 시트 */}
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

/** 상세 패널(읽기 전용) — 검수 취소·반품 신청·삭제는 "전체 보기"에서 */
function SearchDetail({
  order,
  onClose,
  onPrev,
  onNext,
}: {
  order: OrderWithRequester;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const isReturnish = order.status.startsWith("return");
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
        <Button asChild className="h-10 w-full rounded-lg lg:h-9">
          <Link href={`/search/${order.id}`}>
            <ExternalLink className="size-4" />
            전체 보기 · 처리
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <DetailFields
          items={[
            { label: "유형", value: ORDER_TYPE_LABEL[order.type] },
            {
              label: "수량",
              value:
                order.quantity > 0 ? (
                  <span className="tabular-nums">
                    <b>{order.quantity}</b> {order.unit}
                    {order.confirmed_quantity != null && order.confirmed_quantity !== order.quantity && (
                      <span className="text-muted-foreground"> (확인 {order.confirmed_quantity})</span>
                    )}
                  </span>
                ) : (
                  "사진 참고"
                ),
            },
            { label: "업체", value: order.vendor_name || <span className="text-muted-foreground">없음</span> },
            ...(order.status === "inspecting" || order.invoice_received != null
              ? [{ label: "명세서", value: order.invoice_received ? "수령" : <span className="text-status-ask">미수령</span> }]
              : []),
            ...(order.notes ? [{ label: "요청 비고", value: order.notes }] : []),
            ...(order.order_notes ? [{ label: "발주 비고", value: order.order_notes }] : []),
            ...(order.inspection_notes ? [{ label: "검수 비고", value: order.inspection_notes }] : []),
            ...(isReturnish
              ? [
                  { label: "반품 수량", value: `${order.return_quantity ?? order.quantity} ${order.unit ?? ""}` },
                  { label: "반품 사유", value: order.return_reason || <span className="text-muted-foreground">없음</span> },
                ]
              : []),
          ]}
        />

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
              ...(order.return_requested_at
                ? [{ key: "ret", text: <><b className="font-semibold text-foreground">반품 신청</b> · {order.return_requester?.full_name ?? "—"}</>, at: at(order.return_requested_at) }]
                : []),
              ...(order.inspected_at
                ? [{ key: "insp", text: <><b className="font-semibold text-foreground">검수 완료</b> · {order.inspector?.full_name ?? "—"}</>, at: at(order.inspected_at) }]
                : []),
              ...(order.dispatched_at
                ? [{ key: "disp", text: <><b className="font-semibold text-foreground">발주</b> · {order.vendor_name || "업체 미지정"}</>, at: at(order.dispatched_at) }]
                : []),
              { key: "created", text: <><b className="font-semibold text-foreground">주문 등록</b> · {order.requester?.full_name ?? "—"}</>, at: at(order.created_at) },
            ]}
          />
        </section>
      </div>
    </DetailPanel>
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
    const raf = requestAnimationFrame(() => setProgress(100));
    const timer = setTimeout(onClose, 800);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
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
