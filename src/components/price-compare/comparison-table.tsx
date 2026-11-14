"use client";

import { Fragment, useState, useMemo, useCallback, useEffect } from "react";
import { Upload, FileDown, ChevronUp, Pencil, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExcelUploadDialog } from "./excel-upload-dialog";
import { SavedViews } from "@/components/workspace/saved-views";
import { FilterBar, SearchField, FilterChip, ClearFilters, Segmented } from "@/components/workspace/filter-bar";
import { BottomSheet } from "@/components/workspace/bottom-sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { TableCell, TableRow } from "@/components/ui/table";
import { toKSTDateString } from "@/lib/utils/format";
import { useAuth } from "@/hooks/use-auth";
import { applyDiscount, parsePriceInput, priceToSave, reverseDiscount } from "@/lib/utils/discount";
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
  /** vendorId → 입력칸 글자. 추가·수정 모두 **할인전(업체 정가)** 기준 */
  prices: Record<string, string>;
  /** 수정을 열 때의 값. 손대지 않은 칸은 저장하지 않으려고 둔다 (추가 폼에는 없음) */
  initialPrices?: Record<string, string>;
}

export function ComparisonTable({
  vendors,
  vendorProducts,
  unifiedProducts,
  onDataChange,
}: ComparisonTableProps) {
  const { isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("q") ?? "",
  );
  /** 보기: 전체 / 약품 / 약국 / 가격 없음 */
  const [categoryFilter, setCategoryFilter] = useState<"all" | "약품" | "약국" | "empty">("all");
  /** 최저가 업체 필터 (저장값=할인후 기준) */
  const [minVendorFilter, setMinVendorFilter] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");
  const [editError, setEditError] = useState("");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newForm, setNewForm] = useState<EditForm | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [discountRates, setDiscountRates] = useState<Record<string, string>>({});
  const [priceView, setPriceView] = useState<"after" | "before">("after");

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
    let 약품 = 0, 약국 = 0, empty = 0;
    for (const r of rows) {
      if (r.unified.notes === "약품") 약품++;
      else if (r.unified.notes === "약국") 약국++;
      if (r.minPrice == null) empty++;
    }
    return { 약품, 약국, empty };
  }, [rows]);

  /** 행마다 최저가(할인후) 업체 id들 */
  const minVendorsOf = useCallback(
    (r: ComparisonRow) =>
      r.minPrice == null ? [] : vendors.filter((v) => r.prices.get(v.id)?.price === r.minPrice).map((v) => v.id),
    [vendors]
  );
  const minVendorOptions = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) for (const id of minVendorsOf(r)) c.set(id, (c.get(id) ?? 0) + 1);
    return vendors.map((v) => ({ value: v.id, label: v.name, hint: `${c.get(v.id) ?? 0}개` }));
  }, [rows, vendors, minVendorsOf]);

  const filtered = useMemo(() => {
    let result = rows;
    if (categoryFilter === "empty") {
      result = result.filter((r) => r.minPrice == null);
    } else if (categoryFilter !== "all") {
      result = result.filter((r) => r.unified.notes === categoryFilter);
    }
    if (minVendorFilter) {
      result = result.filter((r) => minVendorsOf(r).includes(minVendorFilter));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.unified.name.toLowerCase().includes(q) ||
          r.unified.mg.toLowerCase().includes(q) ||
          (r.unified.remarks?.toLowerCase().includes(q) ?? false)
      );
    }
    return result;
  }, [rows, searchQuery, categoryFilter, minVendorFilter, minVendorsOf]);

  const openEdit = useCallback((row: ComparisonRow) => {
    const prices: Record<string, string> = {};
    for (const vendor of vendors) {
      const entry = row.prices.get(vendor.id);
      // 저장값은 할인후 → 입력칸에는 할인전(업체 정가)으로 되돌려 채운다. 추가·엑셀 업로드와 같은 기준.
      const listPrice = reverseDiscount(entry?.price ?? null, vendor.discount_rate ?? 0);
      prices[vendor.id] = listPrice != null ? String(listPrice) : "";
    }
    setEditForm({
      name: row.unified.name,
      notes: row.unified.notes || "",
      remarks: row.unified.remarks || "",
      prices,
      initialPrices: { ...prices },
    });
    setEditError("");
    setExpandedId(row.unified.id);
  }, [vendors]);

  const closeEdit = useCallback(() => {
    setExpandedId(null);
    setEditForm(null);
    setEditError("");
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
    setEditError("");

    try {
      // 손댄 칸만 저장한다. 손대지 않은 칸까지 다시 저장하면 할인율이 또 곱해지거나 값이 흔들린다.
      const priceUpdates: ReturnType<typeof upsertVendorPrice>[] = [];
      for (const vendor of vendors) {
        const plan = priceToSave(editForm.prices[vendor.id], editForm.initialPrices?.[vendor.id], vendor.discount_rate ?? 0);
        if (plan.changed) priceUpdates.push(upsertVendorPrice(unified.id, vendor.id, plan.price, editForm.name));
      }

      const results = await Promise.all([
        updateUnifiedProduct(unified.id, editForm.name, unified.mg, unified.tab, editForm.notes, editForm.remarks),
        ...priceUpdates,
      ]);
      const failed = results.find((r) => r?.error);
      if (failed?.error) {
        // 일부만 저장됐을 수 있으니 표는 새로 읽고, 수정 칸은 열어 둔다
        setEditError(failed.error);
        onDataChange();
        return;
      }

      closeEdit();
      onDataChange();
    } catch {
      setEditError("저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
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
    setCreateError("");
    setIsAdding(true);
    setExpandedId(null);
    setEditForm(null);
  }, [vendors]);

  const closeAdd = useCallback(() => {
    setCreateError("");
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
        setCreateError(createResult.error);
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
    <TableRow className="bg-primary/[0.04] hover:bg-primary/[0.04] [&>td]:border-b [&>td]:border-border [&>td]:py-2">
      <TableCell className="sticky left-0 z-[1] bg-card px-4">
        <div className="flex items-center gap-1.5">
              <Select
                value={newForm?.notes ?? ""}
                onValueChange={(v) => setNewForm((f) => f ? { ...f, notes: v === "없음" ? "" : v } : f)}
              >
                <SelectTrigger className="h-9 w-[72px] shrink-0 text-xs">
                  <SelectValue placeholder="구분" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="없음">없음</SelectItem>
                  <SelectItem value="약품">약품</SelectItem>
                  <SelectItem value="약국">약국</SelectItem>
                </SelectContent>
              </Select>
            <Input
              autoFocus
              placeholder="제품명 *"
              value={newForm?.name ?? ""}
              onChange={(e) => setNewForm((f) => f ? { ...f, name: e.target.value } : f)}
              className="h-9 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") closeAdd(); }}
            />
        </div>
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
              className="h-9 text-sm text-right tabular-nums"
            />
            {rate > 0 && discounted != null && (
              <p className="text-xs text-right text-status-done mt-0.5">→ 할인후 {discounted.toLocaleString()}</p>
            )}
          </TableCell>
        );
      })}
      <TableCell>
        <Input
          placeholder="비고"
          value={newForm?.remarks ?? ""}
          onChange={(e) => setNewForm((f) => f ? { ...f, remarks: e.target.value } : f)}
          className="h-9 text-sm"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-9 px-2.5 text-xs" onClick={closeAdd} disabled={isSaving}>
            취소
          </Button>
          <Button size="sm" className="h-9 px-2.5 text-xs" onClick={handleCreate} disabled={isSaving || !newForm?.name.trim()}>
            {isSaving ? "..." : "저장"}
          </Button>
        </div>
        {createError && <p role="alert" className="mt-1 text-xs font-medium text-status-late">{createError}</p>}
      </TableCell>
    </TableRow>
  );

  // 모바일: 카드 형태
  const renderAddCardMobile = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <label className="text-[13px] font-medium text-subtle-foreground">제품명 *</label>
          <Input
            autoFocus
            placeholder="제품명 입력"
            value={newForm?.name ?? ""}
            onChange={(e) => setNewForm((f) => f ? { ...f, name: e.target.value } : f)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[13px] font-medium text-subtle-foreground">카테고리</label>
          <Select
            value={newForm?.notes ?? ""}
            onValueChange={(v) => setNewForm((f) => f ? { ...f, notes: v === "없음" ? "" : v } : f)}
          >
            <SelectTrigger className="h-9 text-sm">
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
          <label className="text-[13px] font-medium text-subtle-foreground">비고</label>
          <Input
            placeholder="비고 (선택)"
            value={newForm?.remarks ?? ""}
            onChange={(e) => setNewForm((f) => f ? { ...f, remarks: e.target.value } : f)}
            className="h-9 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="mb-2 block text-[13px] font-medium text-subtle-foreground">업체별 단가 · 할인전(업체 정가)으로 입력</label>
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
                  className="h-9 text-sm"
                />
                {rate > 0 && discounted != null && (
                  <p className="text-xs text-status-done">→ 할인후 {discounted.toLocaleString()}원</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {createError && (
        <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">{createError}</p>
      )}
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
    <TableRow className="bg-primary/[0.04] hover:bg-primary/[0.04] [&>td]:border-b [&>td]:border-border [&>td]:py-2">
      <TableCell className="sticky left-0 z-[1] bg-card px-4">
        <div className="flex items-center gap-1.5">
              <Select
                value={editForm?.notes ?? ""}
                onValueChange={(v) => setEditForm((f) => f ? { ...f, notes: v === "없음" ? "" : v } : f)}
              >
                <SelectTrigger className="h-9 w-[72px] shrink-0 text-xs">
                  <SelectValue placeholder="구분" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="없음">없음</SelectItem>
                  <SelectItem value="약품">약품</SelectItem>
                  <SelectItem value="약국">약국</SelectItem>
                </SelectContent>
              </Select>
            <Input
              autoFocus
              value={editForm?.name ?? ""}
              onChange={(e) => setEditForm((f) => f ? { ...f, name: e.target.value } : f)}
              className="h-9 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(row.unified); if (e.key === "Escape") closeEdit(); }}
            />
        </div>
        {editError && <p role="alert" className="mt-1 text-xs font-medium text-status-late">{editError}</p>}
      </TableCell>
      {vendors.map((vendor) => {
        const rate = vendor.discount_rate ?? 0;
        const raw = editForm?.prices[vendor.id] ?? "";
        const afterDiscount = applyDiscount(parsePriceInput(raw), rate);
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
              className="h-9 text-sm text-right tabular-nums"
            />
            {rate > 0 && afterDiscount != null && (
              <p className="text-xs text-right text-status-done mt-0.5">→ 할인후 {afterDiscount.toLocaleString()}</p>
            )}
          </TableCell>
        );
      })}
      <TableCell>
        <Input
          placeholder="비고"
          value={editForm?.remarks ?? ""}
          onChange={(e) => setEditForm((f) => f ? { ...f, remarks: e.target.value } : f)}
          className="h-9 text-sm"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-9 px-2.5 text-xs" onClick={closeEdit} disabled={isSaving}>
            취소
          </Button>
          <Button size="sm" className="h-9 px-2.5 text-xs" onClick={() => handleSave(row.unified)} disabled={isSaving}>
            {isSaving ? "..." : "저장"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  // 모바일: 카드 내 인라인 편집 패널
  const renderMobileEditPanel = (row: ComparisonRow) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <label className="text-[13px] font-medium text-subtle-foreground">제품명</label>
          <Input
            value={editForm?.name ?? ""}
            onChange={(e) => setEditForm((f) => f ? { ...f, name: e.target.value } : f)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[13px] font-medium text-subtle-foreground">카테고리</label>
          <Select
            value={editForm?.notes ?? ""}
            onValueChange={(v) => setEditForm((f) => f ? { ...f, notes: v === "없음" ? "" : v } : f)}
          >
            <SelectTrigger className="h-9 text-sm">
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
          <label className="text-[13px] font-medium text-subtle-foreground">비고</label>
          <Input
            value={editForm?.remarks ?? ""}
            onChange={(e) => setEditForm((f) => f ? { ...f, remarks: e.target.value } : f)}
            className="h-9 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="mb-2 block text-[13px] font-medium text-subtle-foreground">업체별 단가 · 할인전(업체 정가)으로 입력</label>
        <div className="grid grid-cols-2 gap-2">
          {vendors.map((vendor) => {
            const rate = vendor.discount_rate ?? 0;
            const raw = editForm?.prices[vendor.id] ?? "";
            const afterDiscount = applyDiscount(parsePriceInput(raw), rate);
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
                  className="h-9 text-sm"
                />
                {rate > 0 && afterDiscount != null && (
                  <p className="text-xs text-status-done">→ 할인후 {afterDiscount.toLocaleString()}원</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {editError && (
        <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">{editError}</p>
      )}
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
      headerBg: "FF1166A7",
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

  // 표시 단가: 할인후(저장값) 또는 할인전(역산)
  const cellValue = (price: number | null, rate: number) =>
    priceView === "before" ? reverseDiscount(price, rate) : price;

  // 행에서 현재 뷰 기준 최저가 (업체별 할인율이 달라 뷰마다 최저 업체가 다를 수 있음)
  const rowDisplayMin = (row: ComparisonRow) => {
    const vals: number[] = [];
    for (const v of vendors) {
      const val = cellValue(row.prices.get(v.id)?.price ?? null, v.discount_rate ?? 0);
      if (val != null && val > 0) vals.push(val);
    }
    return vals.length ? Math.min(...vals) : null;
  };

  const categoryTag = (notes: string | null | undefined) =>
    notes ? (
      <span
        className={`inline-flex h-[22px] shrink-0 items-center rounded-md px-1.5 text-xs font-bold ${
          notes === "약품" ? "bg-status-doing-bg text-status-doing" : "bg-secondary text-subtle-foreground"
        }`}
      >
        {notes}
      </span>
    ) : null;

  return (
    <div className="space-y-3">
      {/* 보기 + 동작 */}
      <div className="flex flex-wrap items-center gap-2">
        <SavedViews<"all" | "약품" | "약국" | "empty">
          className="order-2 w-full min-w-0 lg:order-1 lg:w-auto lg:flex-1"
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          views={[
            { value: "all", label: "전체", count: rows.length },
            { value: "약품", label: "약품", count: categoryCounts.약품 },
            { value: "약국", label: "약국", count: categoryCounts.약국 },
            ...(categoryCounts.empty > 0 ? [{ value: "empty" as const, label: "가격 없음", count: categoryCounts.empty }] : []),
          ]}
        />
        <div className="order-1 ml-auto flex items-center gap-1.5 lg:order-2">
          {isAdmin && (
            <Button size="sm" className="h-9 rounded-lg" onClick={openAdd}>
              <Plus className="size-4" />
              품목 추가
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => setUploadOpen(true)} aria-label="엑셀 업로드">
            <Upload className="size-4" />
            <span className="hidden sm:inline">업로드</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-lg"
            onClick={() => handleTemplateDownload(rows.length > 0)}
            aria-label={rows.length > 0 ? "엑셀 내보내기" : "엑셀 양식"}
          >
            <FileDown className="size-4" />
            <span className="hidden sm:inline">{rows.length > 0 ? "내보내기" : "양식"}</span>
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className={`h-9 rounded-lg ${showSettings ? "border-primary text-primary" : ""}`}
              onClick={() => setShowSettings((v) => !v)}
              aria-pressed={showSettings}
              aria-label="업체별 할인율"
            >
              <Settings2 className="size-4" />
              <span className="hidden sm:inline">할인율</span>
            </Button>
          )}
        </div>
      </div>

      {showSettings && isAdmin && (
        <section className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-border">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[15px] font-bold">업체별 할인율</h2>
            <p className="text-[13px] text-muted-foreground">입력한 정가에서 이 비율만큼 빼고 저장해요</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {vendors.map((vendor) => (
              <label key={vendor.id} className="space-y-1">
                <span className="block text-[13px] font-medium text-subtle-foreground">{vendor.name}</span>
                <span className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={discountRates[vendor.id] ?? "0"}
                    onChange={(e) => setDiscountRates((prev) => ({ ...prev, [vendor.id]: e.target.value }))}
                    className="h-9 text-right tabular-nums"
                  />
                  <span className="shrink-0 text-sm text-muted-foreground">%</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => setShowSettings(false)}>
              닫기
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-lg"
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
        </section>
      )}

      <ExcelUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onSuccess={onDataChange} />

      {/* 검색 · 최저가 업체 · 할인후/할인전 */}
      <FilterBar>
        <SearchField id="price-search" value={searchQuery} onChange={setSearchQuery} placeholder="제품명·비고 검색" />
        <FilterChip label="최저가 업체" options={minVendorOptions} value={minVendorFilter} onChange={setMinVendorFilter} />
        <ClearFilters
          show={!!searchQuery || !!minVendorFilter}
          onClear={() => {
            setSearchQuery("");
            setMinVendorFilter(null);
          }}
        />
        <Segmented<"after" | "before">
          className="ml-auto"
          ariaLabel="표시 단가"
          value={priceView}
          onValueChange={setPriceView}
          items={[
            { value: "after", label: "할인후" },
            { value: "before", label: "할인전" },
          ]}
        />
      </FilterBar>

      {vendors.length === 0 || (filtered.length === 0 && !isAdding) ? (
        <p className="rounded-xl bg-card px-4 py-10 text-center text-[13px] text-muted-foreground ring-1 ring-border">
          {vendors.length === 0
            ? "가격 비교에 표시할 업체가 없어요."
            : rows.length === 0
              ? "품목을 추가하거나 엑셀로 올려 주세요."
              : "조건에 맞는 품목이 없어요."}
        </p>
      ) : (
        <>
          {/* 모바일 카드 뷰 */}
          <div className="space-y-2.5 lg:hidden">
            {filtered.map((row) => {
              const isExpanded = expandedId === row.unified.id;
              const dmin = rowDisplayMin(row);
              return (
                <div
                  key={row.unified.id}
                  className={`overflow-hidden rounded-xl bg-card ${isExpanded ? "ring-2 ring-primary" : "ring-1 ring-border"}`}
                >
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => handleToggle(row)}
                    aria-expanded={isAdmin ? isExpanded : undefined}
                    className="flex w-full items-start gap-2 px-4 pb-2 pt-3 text-left disabled:cursor-default"
                  >
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      {(categoryFilter === "all" || categoryFilter === "empty") && categoryTag(row.unified.notes)}
                      <span className="text-[15px] font-semibold leading-snug">{row.unified.name}</span>
                      {row.unified.remarks && (
                        <span className="text-[13px] text-muted-foreground">{row.unified.remarks}</span>
                      )}
                    </span>
                    {isAdmin &&
                      (isExpanded ? (
                        <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      ))}
                  </button>
                  <div className="grid grid-cols-2 gap-1 px-3 pb-3">
                    {vendors.map((vendor) => {
                      const shown = cellValue(row.prices.get(vendor.id)?.price ?? null, vendor.discount_rate ?? 0);
                      const isMin = dmin != null && shown === dmin;
                      return (
                        <div
                          key={vendor.id}
                          className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${
                            isMin ? "bg-status-done-bg" : "bg-muted"
                          }`}
                        >
                          <span className="truncate text-xs text-subtle-foreground">{vendor.name}</span>
                          <span
                            className={`shrink-0 text-sm tabular-nums ${
                              isMin ? "font-bold text-status-done" : shown == null ? "text-muted-foreground" : "font-medium"
                            }`}
                          >
                            {shown != null ? shown.toLocaleString() : "-"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 모바일: 추가·수정은 아래 시트 */}
          {!isDesktop && (
            <>
              <BottomSheet open={isAdding && !!newForm} onOpenChange={(o) => { if (!o) closeAdd(); }} title="품목 추가" tall>
                {newForm && renderAddCardMobile()}
              </BottomSheet>
              {(() => {
                const row = expandedId ? rows.find((r) => r.unified.id === expandedId) : undefined;
                return (
                  <BottomSheet
                    open={!!row && !!editForm}
                    onOpenChange={(o) => { if (!o) closeEdit(); }}
                    title={row?.unified.name ?? "품목 수정"}
                    description="단가는 할인전(업체 정가)으로 넣어요. 할인후는 자동으로 계산돼요"
                    tall
                  >
                    {row && editForm && renderMobileEditPanel(row)}
                  </BottomSheet>
                );
              })()}
            </>
          )}

          {/* PC 표: 머리글·제품명 고정, 표 안에서 스크롤 */}
          <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-border lg:block">
            <div className="max-h-[calc(100dvh-18rem)] min-h-[20rem] overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-20">
                  <tr className="text-left text-[13px] font-semibold text-subtle-foreground">
                    <th className="sticky left-0 z-10 min-w-[240px] border-b border-border bg-muted px-4 py-2.5">
                      제품명
                      <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">{filtered.length}</span>
                    </th>
                    {vendors.map((vendor) => {
                      const rate = vendor.discount_rate ?? 0;
                      return (
                        <th key={vendor.id} className="min-w-[110px] border-b border-border bg-muted px-3 py-2.5 text-right">
                          <span className="block leading-tight">{vendor.name}</span>
                          {rate > 0 && (
                            <span className="block text-xs font-normal leading-tight text-muted-foreground">
                              할인 {rate}%
                            </span>
                          )}
                        </th>
                      );
                    })}
                    <th className="min-w-[140px] border-b border-border bg-muted px-3 py-2.5">비고</th>
                    {isAdmin && <th className="w-[44px] border-b border-border bg-muted" />}
                  </tr>
                </thead>
                <tbody>
                  {isAdding && newForm && renderAddRowPc()}
                  {filtered.map((row) => {
                    const isExpanded = expandedId === row.unified.id;
                    const dmin = rowDisplayMin(row);

                    return (
                      <Fragment key={row.unified.id}>
                        {isExpanded && editForm ? (
                          renderEditRowPc(row)
                        ) : (
                          <tr
                            className={`group ${isAdmin ? "cursor-pointer" : ""}`}
                            onClick={() => handleToggle(row)}
                          >
                            <td className="sticky left-0 z-[1] border-b border-border bg-card px-4 py-2.5 group-hover:bg-muted">
                              <span className="flex items-center gap-1.5">
                                {(categoryFilter === "all" || categoryFilter === "empty") && categoryTag(row.unified.notes)}
                                <span className="font-medium">{row.unified.name}</span>
                              </span>
                            </td>
                            {vendors.map((vendor) => {
                              const entry = row.prices.get(vendor.id);
                              const shown = cellValue(entry?.price ?? null, vendor.discount_rate ?? 0);
                              const isMin = dmin != null && shown === dmin;
                              return (
                                <td
                                  key={vendor.id}
                                  title={entry?.productName}
                                  className={`border-b border-border px-3 py-2.5 text-right tabular-nums ${
                                    isMin
                                      ? "bg-status-done-bg font-bold text-status-done"
                                      : shown == null
                                        ? "text-muted-foreground group-hover:bg-muted"
                                        : "group-hover:bg-muted"
                                  }`}
                                >
                                  {shown != null ? shown.toLocaleString() : "-"}
                                </td>
                              );
                            })}
                            <td className="border-b border-border px-3 py-2.5 text-[13px] text-muted-foreground group-hover:bg-muted">
                              {row.unified.remarks || ""}
                            </td>
                            {isAdmin && (
                              <td className="border-b border-border px-2 text-muted-foreground group-hover:bg-muted">
                                <Pencil className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                              </td>
                            )}
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="hidden px-1 text-xs text-muted-foreground lg:block">
            초록 칸 = 그 품목의 최저가 · 업체 칸에 마우스를 올리면 업체 쪽 품목명이 보여요 · 추가·수정 칸에는 할인전(업체 정가)을 넣어요. 할인후는 자동 계산
            {isAdmin ? " · 행을 누르면 바로 수정" : ""}
          </p>
        </>
      )}
    </div>
  );
}
