"use client";

import { Fragment, useState, useMemo, useCallback, useEffect } from "react";
import { Search, Upload, FileDown, ChevronDown, ChevronUp, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useAuth } from "@/hooks/use-auth";
import { createUnifiedProduct, updateUnifiedProduct, upsertVendorPrice, updateVendorDiscountRate } from "@/app/(main)/price-compare/actions";
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

interface EditForm {
  name: string;
  notes: string;
  remarks: string;
  prices: Record<string, string>; // vendorId → price string
}

function applyDiscount(price: number | null, rate: number): number | null {
  if (price == null) return null;
  if (!rate) return price;
  return Math.round(price * (1 - rate / 100));
}

function reverseDiscount(price: number | null, rate: number): number | null {
  if (price == null) return null;
  if (!rate) return price;
  return Math.round(price / (1 - rate / 100));
}

export function ComparisonTable({
  vendors,
  vendorProducts,
  unifiedProducts,
  onDataChange,
}: ComparisonTableProps) {
  const { isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newForm, setNewForm] = useState<EditForm | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [discountRates, setDiscountRates] = useState<Record<string, string>>({});

  useEffect(() => {
    const rates: Record<string, string> = {};
    for (const v of vendors) {
      rates[v.id] = String(v.discount_rate ?? 0);
    }
    setDiscountRates(rates);
  }, [vendors]);

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

  const openEdit = useCallback((row: ComparisonRow) => {
    const prices: Record<string, string> = {};
    for (const vendor of vendors) {
      const entry = row.prices.get(vendor.id);
      prices[vendor.id] = entry?.price != null ? String(entry.price) : "";
    }
    setEditForm({
      name: row.unified.name,
      notes: row.unified.notes || "",
      remarks: row.unified.remarks || "",
      prices,
    });
    setExpandedId(row.unified.id);
  }, [vendors]);

  const closeEdit = useCallback(() => {
    setExpandedId(null);
    setEditForm(null);
  }, []);

  const handleToggle = useCallback((row: ComparisonRow) => {
    if (!isAdmin) return;
    if (expandedId === row.unified.id) {
      closeEdit();
    } else {
      openEdit(row);
    }
  }, [isAdmin, expandedId, openEdit, closeEdit]);

  const handleSave = async (unified: UnifiedProduct) => {
    if (!editForm) return;
    setIsSaving(true);

    try {
      const priceUpdates = vendors.map((vendor) => {
        const raw = editForm.prices[vendor.id]?.trim();
        const price = raw ? parseInt(raw.replace(/[^0-9]/g, ""), 10) : null;
        const rawPrice = price != null && !isNaN(price) ? price : null;
        const validPrice = applyDiscount(rawPrice, vendor.discount_rate ?? 0);
        return upsertVendorPrice(unified.id, vendor.id, validPrice, editForm.name);
      });

      await Promise.all([
        updateUnifiedProduct(unified.id, editForm.name, unified.mg, unified.tab, editForm.notes, editForm.remarks),
        ...priceUpdates,
      ]);

      closeEdit();
      onDataChange();
    } finally {
      setIsSaving(false);
    }
  };

  const openAdd = useCallback(() => {
    const prices: Record<string, string> = {};
    for (const vendor of vendors) {
      prices[vendor.id] = "";
    }
    setNewForm({ name: "", notes: "", remarks: "", prices });
    setIsAdding(true);
    setExpandedId(null);
    setEditForm(null);
  }, [vendors]);

  const closeAdd = useCallback(() => {
    setIsAdding(false);
    setNewForm(null);
  }, []);

  const handleCreate = async () => {
    if (!newForm) return;
    if (!newForm.name.trim()) return;
    setIsSaving(true);

    try {
      const createResult = await createUnifiedProduct(newForm.name, "", "", newForm.notes, newForm.remarks);
      if (createResult.error) {
        alert(createResult.error);
        return;
      }
      const newId = createResult.id!;

      const priceUpdates = vendors.map((vendor) => {
        const raw = newForm.prices[vendor.id]?.trim();
        const price = raw ? parseInt(raw.replace(/[^0-9]/g, ""), 10) : null;
        const rawPrice = price != null && !isNaN(price) ? price : null;
        const validPrice = applyDiscount(rawPrice, vendor.discount_rate ?? 0);
        return upsertVendorPrice(newId, vendor.id, validPrice, newForm.name);
      });

      await Promise.all(priceUpdates);
      closeAdd();
      onDataChange();
    } finally {
      setIsSaving(false);
    }
  };

  // PC: 기존 테이블 행과 동일한 레이아웃으로 인라인 입력
  const renderAddRowPc = () => (
    <TableRow className="bg-blue-50/40 hover:bg-blue-50/40">
      {categoryFilter === "all" && (
        <TableCell>
          <Select
            value={newForm?.notes ?? ""}
            onValueChange={(v) => setNewForm((f) => f ? { ...f, notes: v === "없음" ? "" : v } : f)}
          >
            <SelectTrigger className="h-7 text-xs w-[68px]">
              <SelectValue placeholder="구분" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="없음">없음</SelectItem>
              <SelectItem value="약품">약품</SelectItem>
              <SelectItem value="약국">약국</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
      )}
      <TableCell>
        <Input
          autoFocus
          placeholder="제품명 *"
          value={newForm?.name ?? ""}
          onChange={(e) => setNewForm((f) => f ? { ...f, name: e.target.value } : f)}
          className="h-7 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") closeAdd(); }}
        />
      </TableCell>
      {vendors.map((vendor) => {
        const rate = vendor.discount_rate ?? 0;
        const raw = newForm?.prices[vendor.id] ?? "";
        const parsed = raw ? parseInt(raw.replace(/[^0-9]/g, ""), 10) : null;
        const discounted = parsed != null && !isNaN(parsed) ? applyDiscount(parsed, rate) : null;
        return (
          <TableCell key={vendor.id}>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="-"
              value={raw}
              onChange={(e) =>
                setNewForm((f) =>
                  f ? { ...f, prices: { ...f.prices, [vendor.id]: e.target.value } } : f
                )
              }
              className="h-7 text-sm text-right"
            />
            {rate > 0 && discounted != null && (
              <p className="text-[10px] text-right text-green-600 mt-0.5">→ {discounted.toLocaleString()}</p>
            )}
          </TableCell>
        );
      })}
      <TableCell>
        <Input
          placeholder="비고"
          value={newForm?.remarks ?? ""}
          onChange={(e) => setNewForm((f) => f ? { ...f, remarks: e.target.value } : f)}
          className="h-7 text-sm"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={closeAdd} disabled={isSaving}>
            취소
          </Button>
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleCreate} disabled={isSaving || !newForm?.name.trim()}>
            {isSaving ? "..." : "저장"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  // 모바일: 카드 형태
  const renderAddCardMobile = () => (
    <div className="rounded-xl bg-card p-4 shadow-card border-2 border-primary/20 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-muted-foreground">제품명 *</label>
          <Input
            autoFocus
            placeholder="제품명 입력"
            value={newForm?.name ?? ""}
            onChange={(e) => setNewForm((f) => f ? { ...f, name: e.target.value } : f)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">카테고리</label>
          <Select
            value={newForm?.notes ?? ""}
            onValueChange={(v) => setNewForm((f) => f ? { ...f, notes: v === "없음" ? "" : v } : f)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="없음">없음</SelectItem>
              <SelectItem value="약품">약품</SelectItem>
              <SelectItem value="약국">약국</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">비고</label>
          <Input
            placeholder="비고 (선택)"
            value={newForm?.remarks ?? ""}
            onChange={(e) => setNewForm((f) => f ? { ...f, remarks: e.target.value } : f)}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-2 block">업체별 단가</label>
        <div className="grid grid-cols-2 gap-2">
          {vendors.map((vendor) => {
            const rate = vendor.discount_rate ?? 0;
            const raw = newForm?.prices[vendor.id] ?? "";
            const parsed = raw ? parseInt(raw.replace(/[^0-9]/g, ""), 10) : null;
            const discounted = parsed != null && !isNaN(parsed) ? applyDiscount(parsed, rate) : null;
            return (
              <div key={vendor.id} className="space-y-1">
                <label className="text-xs font-medium">
                  {vendor.name}{rate > 0 ? ` (${rate}%)` : ""}
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="미입력"
                  value={raw}
                  onChange={(e) =>
                    setNewForm((f) =>
                      f ? { ...f, prices: { ...f.prices, [vendor.id]: e.target.value } } : f
                    )
                  }
                  className="h-8 text-sm"
                />
                {rate > 0 && discounted != null && (
                  <p className="text-[10px] text-green-600">→ {discounted.toLocaleString()}원</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={closeAdd} disabled={isSaving}>취소</Button>
        <Button size="sm" onClick={handleCreate} disabled={isSaving || !newForm?.name.trim()}>
          {isSaving ? "저장 중..." : "추가"}
        </Button>
      </div>
    </div>
  );

  // PC: 기존 행과 동일한 레이아웃으로 인라인 편집
  const renderEditRowPc = (row: ComparisonRow) => (
    <TableRow className="bg-amber-50/40 hover:bg-amber-50/40">
      {categoryFilter === "all" && (
        <TableCell>
          <Select
            value={editForm?.notes ?? ""}
            onValueChange={(v) => setEditForm((f) => f ? { ...f, notes: v === "없음" ? "" : v } : f)}
          >
            <SelectTrigger className="h-7 text-xs w-[68px]">
              <SelectValue placeholder="구분" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="없음">없음</SelectItem>
              <SelectItem value="약품">약품</SelectItem>
              <SelectItem value="약국">약국</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
      )}
      <TableCell>
        <Input
          autoFocus
          value={editForm?.name ?? ""}
          onChange={(e) => setEditForm((f) => f ? { ...f, name: e.target.value } : f)}
          className="h-7 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(row.unified); if (e.key === "Escape") closeEdit(); }}
        />
      </TableCell>
      {vendors.map((vendor) => {
        const rate = vendor.discount_rate ?? 0;
        const raw = editForm?.prices[vendor.id] ?? "";
        const parsed = raw ? parseInt(raw.replace(/[^0-9]/g, ""), 10) : null;
        const discounted = parsed != null && !isNaN(parsed) ? applyDiscount(parsed, rate) : null;
        return (
          <TableCell key={vendor.id}>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="-"
              value={raw}
              onChange={(e) =>
                setEditForm((f) =>
                  f ? { ...f, prices: { ...f.prices, [vendor.id]: e.target.value } } : f
                )
              }
              className="h-7 text-sm text-right"
            />
            {rate > 0 && discounted != null && (
              <p className="text-[10px] text-right text-green-600 mt-0.5">→ {discounted.toLocaleString()}</p>
            )}
          </TableCell>
        );
      })}
      <TableCell>
        <Input
          placeholder="비고"
          value={editForm?.remarks ?? ""}
          onChange={(e) => setEditForm((f) => f ? { ...f, remarks: e.target.value } : f)}
          className="h-7 text-sm"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={closeEdit} disabled={isSaving}>
            취소
          </Button>
          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleSave(row.unified)} disabled={isSaving}>
            {isSaving ? "..." : "저장"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  // 모바일: 카드 내 인라인 편집 패널
  const renderMobileEditPanel = (row: ComparisonRow) => (
    <div className="mt-3 pt-3 border-t space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-muted-foreground">제품명</label>
          <Input
            value={editForm?.name ?? ""}
            onChange={(e) => setEditForm((f) => f ? { ...f, name: e.target.value } : f)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">카테고리</label>
          <Select
            value={editForm?.notes ?? ""}
            onValueChange={(v) => setEditForm((f) => f ? { ...f, notes: v === "없음" ? "" : v } : f)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="없음">없음</SelectItem>
              <SelectItem value="약품">약품</SelectItem>
              <SelectItem value="약국">약국</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">비고</label>
          <Input
            value={editForm?.remarks ?? ""}
            onChange={(e) => setEditForm((f) => f ? { ...f, remarks: e.target.value } : f)}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-2 block">업체별 단가</label>
        <div className="grid grid-cols-2 gap-2">
          {vendors.map((vendor) => {
            const rate = vendor.discount_rate ?? 0;
            const raw = editForm?.prices[vendor.id] ?? "";
            const parsed = raw ? parseInt(raw.replace(/[^0-9]/g, ""), 10) : null;
            const discounted = parsed != null && !isNaN(parsed) ? applyDiscount(parsed, rate) : null;
            return (
              <div key={vendor.id} className="space-y-1">
                <label className="text-xs font-medium">
                  {vendor.name}{rate > 0 ? ` (${rate}%)` : ""}
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="미입력"
                  value={raw}
                  onChange={(e) =>
                    setEditForm((f) =>
                      f ? { ...f, prices: { ...f.prices, [vendor.id]: e.target.value } } : f
                    )
                  }
                  className="h-8 text-sm"
                />
                {rate > 0 && discounted != null && (
                  <p className="text-[10px] text-green-600">→ {discounted.toLocaleString()}원</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={closeEdit} disabled={isSaving}>취소</Button>
        <Button size="sm" onClick={() => handleSave(row.unified)} disabled={isSaving}>
          {isSaving ? "저장 중..." : "저장"}
        </Button>
      </div>
    </div>
  );

  const handleTemplateDownload = async (includeData: boolean) => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();

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
      : ["우리엔팜", "화영", "VS팜", "서수약품"];

    const buildSheet = (sheetName: string, getPriceForRow: (row: ComparisonRow, vendorIdx: number) => number | null) => {
      const sheet = workbook.addWorksheet(sheetName);
      const headers = ["구분", "제품명", "비고", ...vendorHeaders];

      if (includeData) {
        const yymmdd = toKSTDateString(new Date().toISOString()).slice(2).replace(/-/g, "");
        const titleRow = sheet.addRow([`단가 비교표 (${yymmdd}) - ${sheetName}`]);
        sheet.mergeCells(1, 1, 1, headers.length);
        titleRow.height = 32;
        const titleCell = titleRow.getCell(1);
        titleCell.font = { bold: true, size: 14, color: { argb: colors.headerBg } };
        titleCell.alignment = { vertical: "middle" };
      }

      const headerRow = sheet.addRow(headers);
      headerRow.height = 28;
      headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, size: 10, color: { argb: colors.headerFont } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.headerBg } };
        cell.alignment = { vertical: "middle", horizontal: colNumber >= 4 ? "right" : "center" };
        cell.border = {
          top: { style: "thin" as const, color: { argb: colors.borderHeader } },
          bottom: { style: "medium" as const, color: { argb: colors.borderHeader } },
          left: { style: "thin" as const, color: { argb: colors.borderHeader } },
          right: { style: "thin" as const, color: { argb: colors.borderHeader } },
        };
      });

      if (includeData) {
        const vendorStartCol = 4;
        for (let ri = 0; ri < rows.length; ri++) {
          const row = rows[ri];
          const values: (string | number | null)[] = [
            row.unified.notes || "",
            row.unified.name,
            row.unified.remarks || "",
          ];
          for (let vi = 0; vi < vendors.length; vi++) {
            values.push(getPriceForRow(row, vi));
          }

          const dataRow = sheet.addRow(values);
          dataRow.height = 22;
          const isAlt = ri % 2 === 1;

          dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.border = thinBorder;
            cell.font = { size: 10 };
            cell.alignment = { vertical: "middle" };
            if (colNumber === 1) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.categoryBg } };
              cell.alignment = { vertical: "middle", horizontal: "center" };
              cell.font = { size: 9, color: { argb: "FF64748B" } };
            } else if (colNumber === 2) {
              cell.font = { size: 10, bold: true };
              if (isAlt) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.altRowBg } };
            } else if (colNumber >= vendorStartCol) {
              cell.alignment = { vertical: "middle", horizontal: "right" };
              if (cell.value != null && typeof cell.value === "number") cell.numFmt = "#,##0";
              if (isAlt) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.altRowBg } };
            } else {
              cell.alignment = { vertical: "middle", horizontal: "center" };
              if (isAlt) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.altRowBg } };
            }
          });

          // 최저가 하이라이트
          const sheetPrices = vendors.map((_, vi) => getPriceForRow(row, vi)).filter((p): p is number => p != null && p > 0);
          const sheetMin = sheetPrices.length > 0 ? Math.min(...sheetPrices) : null;
          if (sheetMin != null) {
            for (let vi = 0; vi < vendors.length; vi++) {
              if (getPriceForRow(row, vi) === sheetMin) {
                const cell = dataRow.getCell(vendorStartCol + vi);
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.minPriceBg } };
                cell.font = { size: 10, bold: true, color: { argb: colors.minPriceFont } };
              }
            }
          }
        }
      }

      sheet.columns.forEach((col, idx) => {
        let maxLen = 0;
        col.eachCell?.({ includeEmpty: true }, (cell, rowNumber) => {
          if (includeData && rowNumber === 1) return;
          const val = cell.value != null ? String(cell.value) : "";
          let len = 0;
          for (const ch of val) len += ch.charCodeAt(0) > 127 ? 2.2 : 1;
          if (len > maxLen) maxLen = len;
        });
        col.width = Math.max(idx === 1 ? 16 : 10, maxLen + 4);
      });
      sheet.views = [{ state: "frozen", ySplit: includeData ? 2 : 1, xSplit: 2 }];
    };

    if (includeData) {
      // 시트1: 할인전 가격 (역산)
      buildSheet("할인전", (row, vi) => {
        const entry = row.prices.get(vendors[vi].id);
        return reverseDiscount(entry?.price ?? null, vendors[vi].discount_rate ?? 0);
      });
      // 시트2: 할인후 가격 (저장된 값)
      buildSheet("할인후", (row, vi) => {
        const entry = row.prices.get(vendors[vi].id);
        return entry?.price ?? null;
      });
    } else {
      buildSheet("가격비교", () => null);
    }

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
        {isAdmin && (
          <Button variant="outline" size="sm" className="bg-card" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" />
            추가
          </Button>
        )}
        <Button variant="outline" size="sm" className="bg-card" onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4 mr-1" />
          업로드
        </Button>
        <Button variant="outline" size="sm" className="bg-card" onClick={() => handleTemplateDownload(rows.length > 0)}>
          <FileDown className="h-4 w-4 mr-1" />
          {rows.length > 0 ? "내보내기" : "양식"}
        </Button>
        {isAdmin && (
          <Button
            variant={showSettings ? "default" : "outline"}
            size="sm"
            className={showSettings ? "" : "bg-card"}
            onClick={() => setShowSettings((v) => !v)}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {showSettings && isAdmin && (
        <div className="rounded-xl bg-card p-4 shadow-card space-y-3">
          <p className="text-sm font-medium">업체별 할인율 설정</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {vendors.map((vendor) => (
              <div key={vendor.id} className="space-y-1">
                <label className="text-xs text-muted-foreground">{vendor.name}</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={discountRates[vendor.id] ?? "0"}
                    onChange={(e) =>
                      setDiscountRates((prev) => ({ ...prev, [vendor.id]: e.target.value }))
                    }
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={async () => {
                await Promise.all(
                  vendors.map((vendor) => {
                    const rate = parseFloat(discountRates[vendor.id] ?? "0") || 0;
                    return updateVendorDiscountRate(vendor.id, rate);
                  })
                );
                onDataChange();
              }}
            >
              저장
            </Button>
          </div>
        </div>
      )}

      <ExcelUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={onDataChange}
      />

      <Tabs value={categoryFilter} onValueChange={setCategoryFilter}>
        <TabsList>
          <TabsTrigger value="all">전체 ({rows.length})</TabsTrigger>
          <TabsTrigger value="약품">약품 ({categoryCounts.약품})</TabsTrigger>
          <TabsTrigger value="약국">약국 ({categoryCounts.약국})</TabsTrigger>
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
            {isAdding && newForm && renderAddCardMobile()}
            {filtered.map((row) => {
              const isExpanded = expandedId === row.unified.id;
              return (
                <div key={row.unified.id} className="rounded-xl bg-card p-4 shadow-card space-y-2">
                  <div
                    className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : ""}`}
                    onClick={() => handleToggle(row)}
                  >
                    <div className="flex-1 flex items-center gap-2 flex-wrap">
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
                      {row.unified.remarks && (
                        <span className="text-xs text-muted-foreground">({row.unified.remarks})</span>
                      )}
                    </div>
                    {isAdmin && (
                      isExpanded
                        ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {vendors.map((vendor) => {
                      const entry = row.prices.get(vendor.id);
                      const isMin = row.minPrice != null && entry?.price === row.minPrice;
                      return (
                        <div
                          key={vendor.id}
                          className={`flex items-center justify-between text-sm px-2 py-1 rounded ${
                            isMin ? "bg-green-50 dark:bg-green-950/30" : ""
                          }`}
                        >
                          <span className="text-muted-foreground text-xs">{vendor.name}</span>
                          <span className={isMin ? "font-bold text-green-600" : ""}>
                            {entry?.price != null ? `${entry.price.toLocaleString()}원` : "-"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {isExpanded && editForm && renderMobileEditPanel(row)}
                </div>
              );
            })}
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
                  {vendors.map((vendor) => (
                    <TableHead key={vendor.id} className="w-[120px] text-right">
                      {vendor.name}
                    </TableHead>
                  ))}
                  <TableHead className="w-[120px]">비고</TableHead>
                  {isAdmin && <TableHead className="w-[40px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAdding && newForm && renderAddRowPc()}
                {filtered.map((row) => {
                  const isExpanded = expandedId === row.unified.id;

                  return (
                    <Fragment key={row.unified.id}>
                      {isExpanded && editForm ? renderEditRowPc(row) : (
                        <TableRow
                          className={isAdmin ? "cursor-pointer" : ""}
                          onClick={() => handleToggle(row)}
                        >
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
                          <TableCell className="font-medium">{row.unified.name}</TableCell>
                          {vendors.map((vendor) => {
                            const entry = row.prices.get(vendor.id);
                            const isMin = row.minPrice != null && entry?.price === row.minPrice;
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
                                {entry?.price != null ? entry.price.toLocaleString() : "-"}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-sm text-muted-foreground">
                            {row.unified.remarks || ""}
                          </TableCell>
                          {isAdmin && (
                            <TableCell className="text-muted-foreground">
                              <ChevronDown className="h-4 w-4" />
                            </TableCell>
                          )}
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
