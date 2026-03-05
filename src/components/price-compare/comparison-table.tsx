"use client";

import { useState, useMemo } from "react";
import { Search, Download } from "lucide-react";
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

  const filtered = useMemo(() => {
    if (!searchQuery) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(
      (r) =>
        r.unified.name.toLowerCase().includes(q) ||
        r.unified.mg.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  const handleExcelDownload = async () => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("가격비교");

    // 헤더
    const headers = ["제품명", "mg", "T", ...vendors.map((v) => v.name), "비고"];
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
        row.unified.name,
        row.unified.mg,
        row.unified.tab,
      ];
      for (const vendor of vendors) {
        const entry = row.prices.get(vendor.id);
        values.push(entry?.price ?? null);
      }
      values.push(row.unified.notes || null);
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

    // 컬럼 너비
    sheet.columns.forEach((col, i) => {
      col.width = i === 0 ? 25 : i <= 2 ? 12 : 15;
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
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleExcelDownload}>
          <Download className="h-4 w-4 mr-1" />
          엑셀
        </Button>
      </div>

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
              <div key={row.unified.id} className="rounded-lg border p-3 space-y-2">
                <div className="font-medium">
                  {row.unified.name}
                  {row.unified.mg && (
                    <span className="text-muted-foreground text-sm ml-1">{row.unified.mg}</span>
                  )}
                  {row.unified.tab && (
                    <span className="text-muted-foreground text-sm ml-1">{row.unified.tab}</span>
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
                {row.unified.notes && (
                  <p className="text-xs text-muted-foreground">
                    비고: {row.unified.notes}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* PC 테이블 뷰 */}
          <div className="hidden lg:block rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">제품명</TableHead>
                  <TableHead className="w-[80px]">mg</TableHead>
                  <TableHead className="w-[80px]">T</TableHead>
                  {vendors.map((vendor) => (
                    <TableHead key={vendor.id} className="w-[120px] text-right">
                      {vendor.name}
                    </TableHead>
                  ))}
                  <TableHead className="w-[150px]">비고</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.unified.id}>
                    <TableCell className="font-medium">
                      {row.unified.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.unified.mg}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.unified.tab}
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
                      {row.unified.notes || ""}
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
