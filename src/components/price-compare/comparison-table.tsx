"use client";

import { useState, useMemo } from "react";
import { Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
}: ComparisonTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

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
    // Data arrives pre-sorted by sort_order from server
    return unifiedProducts.map((unified) => {
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

  const handleExcelDownload = async () => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("가격비교");

    // 헤더
    const headers = ["구분", "제품명", "수량", ...vendors.map((v) => v.name), "비고"];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE8F4FD" },
      };
      cell.border = {
        bottom: { style: "thin" },
      };
    });

    // 데이터
    for (const row of rows) {
      const values: (string | number | null)[] = [
        row.unified.notes || "",
        row.unified.name,
        row.unified.quantity || null,
      ];
      for (const vendor of vendors) {
        const entry = row.prices.get(vendor.id);
        values.push(entry?.price ?? null);
      }
      values.push(row.unified.remarks || "");
      const dataRow = sheet.addRow(values);

      // 최저가 하이라이트
      if (row.minPrice != null) {
        for (let i = 0; i < vendors.length; i++) {
          const entry = row.prices.get(vendors[i].id);
          if (entry?.price === row.minPrice) {
            const cell = dataRow.getCell(4 + i);
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFD4EDDA" },
            };
          }
        }
      }
    }

    // 컬럼 너비 자동 조정
    sheet.columns.forEach((col) => {
      let maxLen = 0;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const val = cell.value != null ? String(cell.value) : "";
        let len = 0;
        for (const ch of val) len += ch.charCodeAt(0) > 127 ? 2 : 1;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.max(8, maxLen + 3);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const yymmdd = toKSTDateString(new Date().toISOString()).slice(2).replace(/-/g, "");
    a.download = `단가비교_${yymmdd}.xlsx`;
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
        <Button variant="outline" size="sm" className="bg-card" onClick={handleExcelDownload}>
          <Download className="h-4 w-4 mr-1" />
          엑셀
        </Button>
      </div>

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
