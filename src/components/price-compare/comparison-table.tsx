"use client";

import { useState, useMemo } from "react";
import { Search, Upload, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExcelUploadDialog } from "./excel-upload-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toKSTDateString } from "@/lib/utils/format";
import type {
  Vendor,
  VendorProduct,
  UnifiedProduct,
} from "@/lib/types/price-compare";

interface ComparisonTableProps {
  vendors: Vendor[];
  vendorProducts: VendorProduct[];
  unifiedProducts: UnifiedProduct[];
  onDataChange: () => void;
}

interface ComparisonRow {
  unified: UnifiedProduct;
  prices: Map<string, { price: number | null; productName: string }>;
  minPrice: number | null;
}

export function ComparisonTable({
  vendors,
  vendorProducts,
  unifiedProducts,
  onDataChange,
}: ComparisonTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);

  // Build index: unified_product_id → VendorProduct[]
  const productsByUnified = useMemo(() => {
    const map = new Map<string, VendorProduct[]>();
    for (const vp of vendorProducts) {
      if (!vp.unified_product_id) continue;
      const list = map.get(vp.unified_product_id);
      if (list) list.push(vp);
      else map.set(vp.unified_product_id, [vp]);
    }
    return map;
  }, [vendorProducts]);

  const rows: ComparisonRow[] = useMemo(() => {
    // 제품명 ㄱㄴㄷ순 정렬
    const sorted = [...unifiedProducts].sort((a, b) =>
      a.name.localeCompare(b.name, "ko")
    );
    return sorted.map((unified) => {
      const mapped = productsByUnified.get(unified.id) ?? [];
      const prices = new Map<string, { price: number | null; productName: string }>();

      for (const vp of mapped) {
        prices.set(vp.vendor_id, {
          price: vp.unit_price,
          productName: vp.product_name,
        });
      }

      const allPrices = mapped
        .map((vp) => vp.unit_price)
        .filter((p): p is number => p != null && p > 0);
      const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : null;

      return { unified, prices, minPrice };
    });
  }, [unifiedProducts, productsByUnified]);

  const categoryCounts = useMemo(() => {
    let 약품 = 0, 약국 = 0;
    for (const r of rows) {
      if (r.unified.notes === "약품") 약품++;
      else if (r.unified.notes === "약국") 약국++;
    }
    return { 약품, 약국 };
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (categoryFilter !== "all") {
      result = result.filter((r) => r.unified.notes === categoryFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.unified.name.toLowerCase().includes(q) ||
          r.unified.mg.toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, searchQuery, categoryFilter]);

  const handleTemplateDownload = async (includeData: boolean) => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("가격비교");

    // --- 색상 팔레트 ---
    const colors = {
      headerBg: "FF2563EB",
      headerFont: "FFFFFFFF",
      categoryBg: "FFF1F5F9",
      minPriceBg: "FFDCFCE7",
      minPriceFont: "FF166534",
      borderLight: "FFE2E8F0",
      borderHeader: "FF1D4ED8",
      altRowBg: "FFF8FAFC",
    };

    const thinBorder = {
      top: { style: "thin" as const, color: { argb: colors.borderLight } },
      bottom: { style: "thin" as const, color: { argb: colors.borderLight } },
      left: { style: "thin" as const, color: { argb: colors.borderLight } },
      right: { style: "thin" as const, color: { argb: colors.borderLight } },
    };

    const vendorHeaders = includeData && vendors.length > 0
      ? vendors.map((v) => v.name)
      : ["업체1", "업체2", "업체3"];
    const headers = ["구분", "제품명", "수량", "비고", ...vendorHeaders];

    // --- 타이틀 행 ---
    if (includeData) {
      const yymmdd = toKSTDateString(new Date().toISOString()).slice(2).replace(/-/g, "");
      const titleRow = sheet.addRow([`단가 비교표 (${yymmdd})`]);
      sheet.mergeCells(1, 1, 1, headers.length);
      titleRow.height = 32;
      const titleCell = titleRow.getCell(1);
      titleCell.font = { bold: true, size: 14, color: { argb: colors.headerBg } };
      titleCell.alignment = { vertical: "middle" };
    }

    // --- 헤더 행 ---
    const headerRow = sheet.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 10, color: { argb: colors.headerFont } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.headerBg } };
      cell.alignment = { vertical: "middle", horizontal: colNumber >= 5 ? "right" : "center" };
      cell.border = {
        top: { style: "thin" as const, color: { argb: colors.borderHeader } },
        bottom: { style: "medium" as const, color: { argb: colors.borderHeader } },
        left: { style: "thin" as const, color: { argb: colors.borderHeader } },
        right: { style: "thin" as const, color: { argb: colors.borderHeader } },
      };
    });

    // --- 데이터 행 ---
    if (includeData) {
      const vendorStartCol = 5; // E열부터 업체 가격

      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const values: (string | number | null)[] = [
          row.unified.notes || "",
          row.unified.name,
          row.unified.quantity || "",
          row.unified.remarks || "",
        ];
        for (const vendor of vendors) {
          const entry = row.prices.get(vendor.id);
          values.push(entry?.price ?? null);
        }

        const dataRow = sheet.addRow(values);
        dataRow.height = 22;
        const isAlt = ri % 2 === 1;

        dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = thinBorder;
          cell.font = { size: 10 };
          cell.alignment = { vertical: "middle" };

          // 구분 열 스타일
          if (colNumber === 1) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.categoryBg } };
            cell.alignment = { vertical: "middle", horizontal: "center" };
            cell.font = { size: 9, color: { argb: "FF64748B" } };
          }
          // 제품명 열
          else if (colNumber === 2) {
            cell.font = { size: 10, bold: true };
            if (isAlt) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.altRowBg } };
          }
          // 업체 가격 열
          else if (colNumber >= vendorStartCol) {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            if (cell.value != null && typeof cell.value === "number") {
              cell.numFmt = "#,##0";
            }
            if (isAlt) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.altRowBg } };
          }
          // 나머지 열
          else {
            cell.alignment = { vertical: "middle", horizontal: "center" };
            if (isAlt) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.altRowBg } };
          }
        });

        // 최저가 하이라이트
        if (row.minPrice != null) {
          for (let vi = 0; vi < vendors.length; vi++) {
            const entry = row.prices.get(vendors[vi].id);
            if (entry?.price === row.minPrice) {
              const cell = dataRow.getCell(vendorStartCol + vi);
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.minPriceBg } };
              cell.font = { size: 10, bold: true, color: { argb: colors.minPriceFont } };
            }
          }
        }
      }
    }

    // --- 열 너비 자동 조정 ---
    sheet.columns.forEach((col, idx) => {
      let maxLen = 0;
      col.eachCell?.({ includeEmpty: true }, (cell, rowNumber) => {
        // 타이틀 행(merged) 제외
        if (includeData && rowNumber === 1) return;
        const val = cell.value != null ? String(cell.value) : "";
        let len = 0;
        for (const ch of val) len += ch.charCodeAt(0) > 127 ? 2.2 : 1;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.max(idx === 1 ? 16 : 10, maxLen + 4);
    });

    // --- 시트 설정 ---
    sheet.views = [{ state: "frozen", ySplit: includeData ? 2 : 1, xSplit: 2 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const yymmdd = toKSTDateString(new Date().toISOString()).slice(2).replace(/-/g, "");
    a.download = includeData ? `단가비교_${yymmdd}.xlsx` : `단가비교_양식.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="제품명 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
        <Button variant="outline" size="sm" className="bg-card" onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4 mr-1" />
          업로드
        </Button>
        <Button variant="outline" size="sm" className="bg-card" onClick={() => handleTemplateDownload(rows.length > 0)}>
          <FileDown className="h-4 w-4 mr-1" />
          {rows.length > 0 ? "내보내기" : "양식"}
        </Button>
      </div>

      <ExcelUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={onDataChange}
      />

      <Tabs value={categoryFilter} onValueChange={setCategoryFilter}>
        <TabsList>
          <TabsTrigger value="all">
            전체 ({rows.length})
          </TabsTrigger>
          <TabsTrigger value="약품">
            약품 ({categoryCounts.약품})
          </TabsTrigger>
          <TabsTrigger value="약국">
            약국 ({categoryCounts.약국})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {vendors.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          업체를 먼저 등록해주세요.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {rows.length === 0
            ? "통합 제품을 등록하고 매핑해주세요."
            : "검색 결과가 없습니다."}
        </p>
      ) : (
        <>
          {/* 모바일 카드 뷰 */}
          <div className="space-y-3 lg:hidden">
            {filtered.map((row) => (
              <div key={row.unified.id} className="rounded-xl bg-card p-4 shadow-card space-y-2">
                <div className="flex items-center gap-2">
                  {categoryFilter === "all" && row.unified.notes && (
                    <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      row.unified.notes === "약품"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {row.unified.notes}
                    </span>
                  )}
                  <span className="font-medium">{row.unified.name}</span>
                  {row.unified.quantity && (
                    <span className="text-xs text-muted-foreground">{row.unified.quantity}</span>
                  )}
                  {row.unified.remarks && (
                    <span className="text-xs text-muted-foreground">({row.unified.remarks})</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {vendors.map((vendor) => {
                    const entry = row.prices.get(vendor.id);
                    const isMin =
                      row.minPrice != null && entry?.price === row.minPrice;
                    return (
                      <div
                        key={vendor.id}
                        className={`flex items-center justify-between text-sm px-2 py-1 rounded ${
                          isMin ? "bg-green-50 dark:bg-green-950/30" : ""
                        }`}
                      >
                        <span className="text-muted-foreground text-xs">
                          {vendor.name}
                        </span>
                        <span className={isMin ? "font-bold text-green-600" : ""}>
                          {entry?.price != null
                            ? `${entry.price.toLocaleString()}원`
                            : "-"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* PC 테이블 뷰 */}
          <div className="hidden lg:block rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {categoryFilter === "all" && (
                    <TableHead className="w-[60px]">구분</TableHead>
                  )}
                  <TableHead className="w-[200px]">제품명</TableHead>
                  <TableHead className="w-[80px]">수량</TableHead>
                  {vendors.map((vendor) => (
                    <TableHead key={vendor.id} className="w-[120px] text-right">
                      {vendor.name}
                    </TableHead>
                  ))}
                  <TableHead className="w-[120px]">비고</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.unified.id}>
                    {categoryFilter === "all" && (
                      <TableCell>
                        {row.unified.notes && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            row.unified.notes === "약품"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}>
                            {row.unified.notes}
                          </span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      {row.unified.name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.unified.quantity || ""}
                    </TableCell>
                    {vendors.map((vendor) => {
                      const entry = row.prices.get(vendor.id);
                      const isMin =
                        row.minPrice != null && entry?.price === row.minPrice;
                      return (
                        <TableCell
                          key={vendor.id}
                          className={`text-right ${
                            isMin
                              ? "bg-green-50 dark:bg-green-950/30 font-bold text-green-600"
                              : ""
                          }`}
                          title={entry?.productName}
                        >
                          {entry?.price != null
                            ? entry.price.toLocaleString()
                            : "-"}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-sm text-muted-foreground">
                      {row.unified.remarks || ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
