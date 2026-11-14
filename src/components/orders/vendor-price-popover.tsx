"use client";

import { useState, useMemo, useEffect } from "react";
import { ChevronsUpDown, Search, X, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { BottomSheet } from "@/components/workspace/bottom-sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fetchPriceCompareData } from "@/lib/actions/price-compare-action";
import { setItemAlias, removeItemAlias } from "@/lib/actions/item-alias-actions";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import { tokenize, similarity } from "@/lib/utils/item-match";
import { doseConflict } from "@/lib/utils/item-spec";
import { genId } from "@/lib/utils/uid";
import type { Vendor, VendorProduct, UnifiedProduct, ItemNameAlias } from "@/lib/types/price-compare";

interface PriceEntry {
  vendorName: string;
  price: number | null;
  productName: string;
}

interface PriceMatch {
  productName: string;
  remarks: string;
  prices: PriceEntry[];
  minPrice: number | null;
  unifiedProductId: string | null;
  source: "alias" | "fuzzy";
  score: number; // 별칭이면 1, 퍼지면 최고 유사도 점수
}

// 발주 시 자동 학습을 허용하는 퍼지 매칭 최소 신뢰도
const AUTO_LEARN_MIN_SCORE = 0.7;

// Shared price data cache (module-level singleton)
export interface PriceData {
  vendors: Vendor[];
  products: VendorProduct[];
  unified: UnifiedProduct[];
  aliases: ItemNameAlias[];
}

let cachedData: PriceData | null = null;
let cachedAt: number = 0;
let fetchPromise: Promise<PriceData> | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분

function startFetch() {
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetchPriceCompareData().then(({ vendors, vendorProducts, unifiedProducts, itemAliases }) => {
    cachedData = { vendors, products: vendorProducts, unified: unifiedProducts, aliases: itemAliases };
    cachedAt = Date.now();
    fetchPromise = null;
    return cachedData;
  }).catch((e) => { fetchPromise = null; throw e; });
  return fetchPromise;
}

async function getPriceData() {
  const isStale = !cachedData || Date.now() - cachedAt >= CACHE_TTL_MS;
  if (isStale) startFetch(); // 백그라운드 갱신 시작
  if (cachedData) return cachedData; // 스테일이어도 즉시 반환
  return startFetch(); // 데이터 없으면 기다림 (첫 로드)
}

export function initPriceCache(data: PriceData) {
  if (cachedData) return; // 이미 초기화된 경우 덮어쓰지 않음
  cachedData = data;
  cachedAt = Date.now();
}

// 별칭 변경 후 모듈 캐시 갱신 — 이후 새로 열리는 popover 인스턴스가 반영
function setCachedAliases(aliases: ItemNameAlias[]) {
  if (cachedData) cachedData = { ...cachedData, aliases };
}

/**
 * 가격표 미리 받기. 예전엔 모듈을 불러오기만 해도 받았지만(일반 직원 기기에도 가격이 내려감),
 * 이제는 관리자 화면이 직접 부를 때만 받는다. 서버도 관리자만 허용.
 */
export function prefetchPriceData() {
  if (typeof window === "undefined") return;
  if (!cachedData) startFetch();
}

/** 통합제품 1개 → 업체별 가격표 */
function buildUnifiedMatch(
  unifiedId: string,
  vendors: Vendor[],
  vendorProducts: VendorProduct[],
  unifiedProducts: UnifiedProduct[],
): Omit<PriceMatch, "source" | "score"> | null {
  const unified = unifiedProducts.find((u) => u.id === unifiedId);
  if (!unified) return null;
  const byUnified = vendorProducts.filter((p) => p.unified_product_id === unifiedId);
  const prices = vendors.map((v) => {
    const vp = byUnified.find((p) => p.vendor_id === v.id);
    return { vendorName: v.name, price: vp?.unit_price ?? null, productName: vp?.product_name ?? "-" };
  });
  const validPrices = prices.filter((p) => p.price !== null).map((p) => p.price!);
  return {
    productName: byUnified[0]?.product_name ?? unified.name,
    remarks: unified.remarks ?? "",
    prices,
    minPrice: validPrices.length > 0 ? Math.min(...validPrices) : null,
    unifiedProductId: unifiedId,
  };
}

function findFuzzyMatch(
  itemName: string,
  vendors: Vendor[],
  vendorProducts: VendorProduct[],
  unifiedProducts: UnifiedProduct[],
): Omit<PriceMatch, "source"> | null {
  const MIN_THRESHOLD = 0.5;
  const aTokens = tokenize(itemName);
  const aNorm = aTokens.join("");

  let bestScore = 0;
  let bestUnifiedId: string | null = null;
  let bestDirectProduct: VendorProduct | null = null;

  for (const up of unifiedProducts) {
    if (doseConflict(itemName, up.name)) continue; // 용량이 다르면 다른 품목 (추정·자동 학습 금지)
    const bTokens = tokenize(up.name);
    const score = similarity(aTokens, aNorm, bTokens, bTokens.join(""));
    if (score > bestScore) {
      bestScore = score;
      bestUnifiedId = up.id;
      bestDirectProduct = null;
    }
  }

  for (const vp of vendorProducts) {
    if (doseConflict(itemName, vp.product_name)) continue;
    const bTokens = tokenize(vp.product_name);
    const score = similarity(aTokens, aNorm, bTokens, bTokens.join(""));
    if (score > bestScore) {
      bestScore = score;
      if (vp.unified_product_id) {
        bestUnifiedId = vp.unified_product_id;
        bestDirectProduct = null;
      } else {
        bestUnifiedId = null;
        bestDirectProduct = vp;
      }
    }
  }

  if (bestScore < MIN_THRESHOLD) return null;

  if (bestUnifiedId) {
    const m = buildUnifiedMatch(bestUnifiedId, vendors, vendorProducts, unifiedProducts);
    return m ? { ...m, score: bestScore } : null;
  }

  if (bestDirectProduct) {
    const prices = vendors.map((v) => ({
      vendorName: v.name,
      price: v.id === bestDirectProduct!.vendor_id ? bestDirectProduct!.unit_price : null,
      productName: v.id === bestDirectProduct!.vendor_id ? bestDirectProduct!.product_name : "-",
    }));
    const validPrices = prices.filter((p) => p.price !== null).map((p) => p.price!);
    return {
      productName: bestDirectProduct.product_name,
      remarks: "",
      prices,
      minPrice: validPrices.length > 0 ? Math.min(...validPrices) : null,
      unifiedProductId: null,
      score: bestScore,
    };
  }

  return null;
}

/** 별칭 우선 → 없으면 퍼지 매칭 */
function resolveMatch(itemName: string, data: PriceData): PriceMatch | null {
  const key = normalizeItemName(itemName);
  const alias = data.aliases.find((a) => a.item_name === key);
  if (alias) {
    const m = buildUnifiedMatch(alias.unified_product_id, data.vendors, data.products, data.unified);
    if (m) return { ...m, source: "alias", score: 1 };
  }
  const fuzzy = findFuzzyMatch(itemName, data.vendors, data.products, data.unified);
  if (fuzzy) return { ...fuzzy, source: "fuzzy" };
  return null;
}

// 퍼지 매칭은 통합제품+업체제품 전체를 순회해 비싸다. 주문 목록의 행마다(같은 품목도)
// 반복 계산되면 모바일에서 버벅임 → 정규화 품목명 키로 모듈 캐시(인스턴스 간 공유).
// 같은 PriceData ref면 visibleVendors도 결정적으로 동일하므로 data ref로 무효화하면 충분
// (별칭 편집·10분 갱신 시 setData가 새 ref를 만들어 자동 무효화).
let matchCacheData: PriceData | null = null;
const matchCache = new Map<string, PriceMatch | null>();

function resolveMatchCached(itemName: string, data: PriceData, visibleVendors: Vendor[]): PriceMatch | null {
  if (matchCacheData !== data) {
    matchCache.clear();
    matchCacheData = data;
  }
  const key = normalizeItemName(itemName);
  const hit = matchCache.get(key);
  if (hit !== undefined) return hit;
  const result = resolveMatch(itemName, { ...data, vendors: visibleVendors });
  matchCache.set(key, result);
  return result;
}

export const VENDOR_COLORS = [
  // 업체 지정 표시용 점 색(같은 업체 = 같은 색). 행 바탕은 칠하지 않는다(선택 행만 row-selected).
  { dot: "bg-blue-500" },
  { dot: "bg-rose-500" },
  { dot: "bg-amber-500" },
  { dot: "bg-emerald-500" },
  { dot: "bg-violet-500" },
  { dot: "bg-cyan-500" },
  { dot: "bg-orange-500" },
  { dot: "bg-pink-500" },
] as const;

export type VendorColor = (typeof VENDOR_COLORS)[number];

/**
 * 가격비교 데이터(모듈 캐시 공유). 처음 쓰는 컴포넌트가 백그라운드로 불러온다.
 * enabled=false면 아무것도 받지 않는다 — 일반 직원 화면에서는 꼭 false로(가격 비공개, 서버도 관리자만 허용).
 */
export function usePriceData(enabled = true) {
  const [data, setData] = useState<PriceData | null>(enabled ? cachedData : null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    getPriceData()
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [enabled]);
  return [data, setData] as const;
}

/** 품목의 업체별 단가(할인후). 주문 화면 업체 칸·상세 패널이 쓴다. */
export function matchItemPrices(itemName: string, data: PriceData | null) {
  if (!data) return null;
  const visible = data.vendors.filter((v) => v.show_in_compare !== false);
  return resolveMatchCached(itemName, data, visible);
}

export type ItemPriceMatch = NonNullable<ReturnType<typeof matchItemPrices>>;

/** 고른 업체의 단가 (없으면 null) */
export function priceOfVendor(match: ItemPriceMatch | null, vendorName: string) {
  if (!match || !vendorName) return null;
  return match.prices.find((p) => p.vendorName === vendorName)?.price ?? null;
}

/** 최저가 업체 */
export function bestVendor(match: ItemPriceMatch | null) {
  if (!match || match.minPrice === null) return null;
  return match.prices.find((p) => p.price === match.minPrice) ?? null;
}

interface VendorPricePopoverProps {
  itemName: string;
  selectedVendor: string;
  vendorColor?: VendorColor;
  /** 이 품목을 가장 최근에 발주했던 업체명 (있으면 바로가기로 표시) */
  lastOrderedVendor?: string;
  onSelectVendor: (vendorName: string) => void;
  /** 모바일 카드처럼 넓은 칸 */
  size?: "sm" | "lg";
}

/**
 * 업체 고르기 (디자인 시스템 DataTable 업체 칸 + BottomSheet).
 * 칸: 고른 업체 + 그 업체 단가, 안 고르면 점선 "업체 고르기 · 최저 …".
 * PC는 팝오버, 모바일은 아래 시트("어디서 살까요?").
 */
export function VendorPricePopover({ itemName, selectedVendor, vendorColor, lastOrderedVendor, onSelectVendor, size = "sm" }: VendorPricePopoverProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = usePriceData();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const priceMatch = useMemo(() => matchItemPrices(itemName, data), [itemName, data]);
  const selectedPrice = priceOfVendor(priceMatch, selectedVendor);
  const best = bestVendor(priceMatch);

  const select = (v: string) => {
    onSelectVendor(v);
    setOpen(false);
  };

  const trigger = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!isDesktop) setOpen(true);
      }}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors",
        size === "lg" ? "h-10" : "h-8",
        selectedVendor
          ? "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--input)] hover:shadow-[inset_0_0_0_1px_var(--control)]"
          : "border border-dashed border-input text-muted-foreground hover:border-control hover:text-foreground"
      )}
    >
      {selectedVendor ? (
        <>
          {vendorColor && <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", vendorColor.dot)} />}
          <span className="min-w-0 truncate font-medium">{selectedVendor}</span>
          {selectedPrice !== null && (
            <b
              className={cn(
                "ml-auto shrink-0 tabular-nums",
                selectedPrice === priceMatch?.minPrice ? "text-status-done" : "text-foreground"
              )}
            >
              {selectedPrice.toLocaleString()}
            </b>
          )}
        </>
      ) : (
        <span className="min-w-0 truncate">
          업체 고르기
          {best && best.price !== null && (
            <span className="text-muted-foreground">
              {" "}· 최저 {best.vendorName} <span className="tabular-nums">{best.price.toLocaleString()}</span>
            </span>
          )}
        </span>
      )}
      <ChevronsUpDown className={cn("size-3.5 shrink-0 opacity-50", selectedVendor && selectedPrice !== null ? "" : "ml-auto")} />
    </button>
  );

  if (!isDesktop) {
    return (
      <>
        {trigger}
        <BottomSheet
          open={open}
          onOpenChange={setOpen}
          title="어디서 살까요?"
          description={`${itemName} · 할인후 단가`}
        >
          <VendorPicker
            itemName={itemName}
            data={data}
            setData={setData}
            selectedVendor={selectedVendor}
            lastOrderedVendor={lastOrderedVendor}
            onSelect={select}
            variant="sheet"
          />
        </BottomSheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <VendorPicker
          itemName={itemName}
          data={data}
          setData={setData}
          selectedVendor={selectedVendor}
          lastOrderedVendor={lastOrderedVendor}
          onSelect={select}
          variant="popover"
        />
      </PopoverContent>
    </Popover>
  );
}

/** 팝오버·시트 안 내용: 매칭 상태, 이전 업체, 업체별 단가, 매칭 수정 */
function VendorPicker({
  itemName,
  data,
  setData,
  selectedVendor,
  lastOrderedVendor,
  onSelect,
  variant,
}: {
  itemName: string;
  data: PriceData | null;
  setData: (d: PriceData) => void;
  selectedVendor: string;
  lastOrderedVendor?: string;
  onSelect: (vendorName: string) => void;
  variant: "popover" | "sheet";
}) {
  const [editingMatch, setEditingMatch] = useState(false);
  const [matchSearch, setMatchSearch] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);
  const sheet = variant === "sheet";

  // 주문 화면엔 기존 주력 업체(show_in_compare !== false)만 노출 (명세서로 자동등록된 신규 업체 제외)
  const visibleVendors = useMemo(() => (data ? data.vendors.filter((v) => v.show_in_compare !== false) : []), [data]);
  const priceMatch = useMemo(() => (data ? resolveMatchCached(itemName, data, visibleVendors) : null), [itemName, data, visibleVendors]);

  const filteredUnified = useMemo(() => {
    if (!data) return [];
    const q = matchSearch.trim().toLowerCase();
    const list = q ? data.unified.filter((u) => u.name.toLowerCase().includes(q)) : data.unified;
    return list.slice(0, 50);
  }, [data, matchSearch]);

  // 퍼지 매칭으로 뜬 가격 목록에서 업체를 골랐고 신뢰도가 높으면 별칭 자동 학습
  const autoLearnFromSelection = (vendorName: string) => {
    if (
      !vendorName ||
      !data ||
      !priceMatch ||
      priceMatch.source !== "fuzzy" ||
      !priceMatch.unifiedProductId ||
      priceMatch.score < AUTO_LEARN_MIN_SCORE ||
      !priceMatch.prices.some((p) => p.vendorName === vendorName)
    ) {
      return;
    }
    const key = normalizeItemName(itemName);
    if (data.aliases.some((a) => a.item_name === key)) return;
    const unifiedId = priceMatch.unifiedProductId;
    const next: ItemNameAlias[] = [
      ...data.aliases,
      { id: genId(), item_name: key, unified_product_id: unifiedId, created_by: null, created_at: new Date().toISOString() },
    ];
    setCachedAliases(next);
    setData({ ...data, aliases: next });
    setItemAlias(itemName, unifiedId).catch(() => {});
  };

  const handleSelect = (vendorName: string) => {
    // 선택은 항상 먼저 반영 — 학습(부수효과)이 실패해도 선택을 막지 않도록
    onSelect(vendorName);
    try {
      autoLearnFromSelection(vendorName);
    } catch {
      // 학습 실패는 무시
    }
  };

  const applyAlias = async (unifiedId: string) => {
    if (!data || savingAlias) return;
    setSavingAlias(true);
    try {
      await setItemAlias(itemName, unifiedId);
      const key = normalizeItemName(itemName);
      const next: ItemNameAlias[] = [
        ...data.aliases.filter((a) => a.item_name !== key),
        { id: genId(), item_name: key, unified_product_id: unifiedId, created_by: null, created_at: new Date().toISOString() },
      ];
      setCachedAliases(next);
      setData({ ...data, aliases: next });
      setEditingMatch(false);
      setMatchSearch("");
    } catch {
      // silently fail
    } finally {
      setSavingAlias(false);
    }
  };

  const clearAlias = async () => {
    if (!data || savingAlias) return;
    setSavingAlias(true);
    try {
      await removeItemAlias(itemName);
      const key = normalizeItemName(itemName);
      const next = data.aliases.filter((a) => a.item_name !== key);
      setCachedAliases(next);
      setData({ ...data, aliases: next });
      setEditingMatch(false);
      setMatchSearch("");
    } catch {
      // silently fail
    } finally {
      setSavingAlias(false);
    }
  };

  if (!data) {
    return (
      <div className="space-y-2 p-3" role="status" aria-label="가격 불러오는 중">
        {[0, 1, 2].map((i) => (
          <span key={i} className="block h-10 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (editingMatch) {
    return (
      <div className="flex flex-col">
        <div className={cn("flex items-center gap-2 border-b border-border px-3", sheet ? "h-12" : "h-10")}>
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="가격비교 품목 검색"
            aria-label="가격비교 품목 검색"
            value={matchSearch}
            onChange={(e) => setMatchSearch(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              setEditingMatch(false);
              setMatchSearch("");
            }}
            className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="매칭 수정 닫기"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className={cn("overflow-y-auto py-1", sheet ? "max-h-[50dvh]" : "max-h-72")}>
          {filteredUnified.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">맞는 품목이 없어요</p>
          ) : (
            filteredUnified.map((u) => {
              const isCurrent = priceMatch?.unifiedProductId === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={savingAlias}
                  onClick={() => applyAlias(u.id)}
                  className={cn(
                    "flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50",
                    isCurrent && "bg-accent"
                  )}
                >
                  <span className="font-medium">{u.name}</span>
                  {u.notes && <span className="text-xs text-muted-foreground">{u.notes}</span>}
                </button>
              );
            })
          )}
        </div>
        {priceMatch?.source === "alias" && (
          <div className="border-t border-border px-3 py-2">
            <button
              type="button"
              disabled={savingAlias}
              onClick={clearAlias}
              className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
            >
              매칭 해제 (자동 매칭으로 되돌리기)
            </button>
          </div>
        )}
      </div>
    );
  }

  // 선택지: 업체별 단가(가격 있음) → 없으면 업체 목록
  const options: { vendorName: string; price: number | null; hint?: string }[] = priceMatch
    ? priceMatch.prices.map((p) => ({ vendorName: p.vendorName, price: p.price, hint: p.productName }))
    : visibleVendors.map((v) => ({ vendorName: v.name, price: null }));
  const min = priceMatch?.minPrice ?? null;

  return (
    <div className={sheet ? "" : "py-1"}>
      {/* 매칭 상태 + 수정 */}
      <div className={cn("flex items-center gap-2 text-xs", sheet ? "mb-3" : "border-b border-border px-3 py-2")}>
        {priceMatch ? (
          priceMatch.source === "alias" ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 rounded bg-status-doing-bg px-1.5 py-0.5 font-semibold text-status-doing">학습됨</span>
              <span className="truncate text-subtle-foreground">{priceMatch.productName}</span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-muted-foreground">추정: {priceMatch.productName}</span>
          )
        ) : (
          <span className="flex-1 text-muted-foreground">가격비교에 맞는 품목이 없어요</span>
        )}
        <button
          type="button"
          onClick={() => setEditingMatch(true)}
          className="ml-auto flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline"
        >
          <Pencil className="size-3" /> 매칭 수정
        </button>
      </div>

      {priceMatch?.remarks && (
        <p className={cn("rounded-md bg-status-ask-bg px-2.5 py-1.5 text-xs text-status-ask", sheet ? "mb-3" : "mx-3 my-2")}>
          비고: {priceMatch.remarks}
        </p>
      )}

      <div className={sheet ? "grid gap-2" : "px-1 py-1"}>
        {lastOrderedVendor && !options.some((o) => o.vendorName === lastOrderedVendor) && (
          <VendorOption
            sheet={sheet}
            name={lastOrderedVendor}
            hint="지난번 발주 업체"
            price={null}
            selected={selectedVendor === lastOrderedVendor}
            best={false}
            onClick={() => handleSelect(lastOrderedVendor)}
          />
        )}
        {options.map((o) => (
          <VendorOption
            key={o.vendorName}
            sheet={sheet}
            name={o.vendorName}
            hint={[o.vendorName === lastOrderedVendor ? "지난번 발주" : null, o.price !== null && o.price === min ? "최저가" : null, !sheet ? o.hint : null]
              .filter(Boolean)
              .join(" · ") || undefined}
            price={o.price}
            selected={selectedVendor === o.vendorName}
            best={o.price !== null && o.price === min}
            onClick={() => handleSelect(o.vendorName)}
          />
        ))}
        {options.length === 0 && !lastOrderedVendor && (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">등록된 업체가 없어요</p>
        )}
      </div>

      {selectedVendor && (
        <div className={cn(sheet ? "mt-3" : "mt-1 border-t border-border px-1 pt-1")}>
          <button
            type="button"
            onClick={() => handleSelect("")}
            className="flex h-9 w-full items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            업체 지정 해제
          </button>
        </div>
      )}
    </div>
  );
}

function VendorOption({
  sheet,
  name,
  hint,
  price,
  selected,
  best,
  onClick,
}: {
  sheet: boolean;
  name: string;
  hint?: string;
  price: number | null;
  selected: boolean;
  best: boolean;
  onClick: () => void;
}) {
  if (sheet) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={cn(
          "flex w-full items-center gap-3 rounded-[14px] px-4 py-3.5 text-left transition-colors",
          selected || best ? "bg-status-doing-bg" : "bg-muted hover:bg-secondary",
          selected ? "shadow-[inset_0_0_0_2px_var(--primary)]" : best ? "shadow-[inset_0_0_0_1px_var(--primary)]" : ""
        )}
      >
        <span className="min-w-0 flex-1">
          <b className="block text-base font-semibold">{name}</b>
          {hint && <span className="text-[13px] text-subtle-foreground">{hint}</span>}
        </span>
        <span className={cn("shrink-0 text-lg font-extrabold tabular-nums", best ? "text-status-done" : price === null ? "text-muted-foreground" : "")}>
          {price !== null ? price.toLocaleString() : "—"}
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent", selected && "bg-accent")}
    >
      <span className="min-w-0 flex-1 text-left">
        <span className="font-medium">{name}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span className={cn("shrink-0 tabular-nums", best ? "font-bold text-status-done" : price === null ? "text-muted-foreground" : "")}>
        {price !== null ? `${price.toLocaleString()}원` : "—"}
      </span>
    </button>
  );
}
