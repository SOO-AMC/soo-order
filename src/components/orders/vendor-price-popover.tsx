"use client";

import { useState, useMemo, useEffect } from "react";
import { ChevronsUpDown, Search, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { fetchPriceCompareData } from "@/lib/actions/price-compare-action";
import { setItemAlias, removeItemAlias } from "@/lib/actions/item-alias-actions";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
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

// 모듈 로드 시 즉시 프리페치 시작 (캐시 없을 때만)
if (typeof window !== "undefined") {
  startFetch();
}

/** Tokenize: strip manufacturer prefix, split into meaningful tokens */
function tokenize(s: string): string[] {
  const stripped = s
    .replace(/^[^()\s]{1,10}\)/, "")
    .toLowerCase();
  return stripped
    .replace(/([가-힣])(\d)/g, "$1 $2")
    .replace(/(\d)([가-힣])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/(\d)(mg|ml|g|l|mcg|iu|%|정|캡슐|앰플|바이알|프리필드|시린지|팩|매)/gi, "$1 $2")
    .split(/[\s/·,_\-()[\]{}]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Token-based similarity with containment bonus */
function similarity(aTokens: string[], aNorm: string, bTokens: string[], bNorm: string): number {
  if (aNorm.length === 0 || bNorm.length === 0) return 0;
  if (aNorm === bNorm) return 1;
  if (bNorm.includes(aNorm)) return 0.95;
  if (aNorm.includes(bNorm)) return 0.9;
  if (aTokens.length === 0 || bTokens.length === 0) return 0;

  let matchCount = 0;
  const usedB = new Set<number>();
  for (const at of aTokens) {
    for (let i = 0; i < bTokens.length; i++) {
      if (usedB.has(i)) continue;
      if (at === bTokens[i] || (at.length >= 2 && bTokens[i].includes(at))) {
        matchCount++;
        usedB.add(i);
        break;
      }
    }
  }

  const unionSize = new Set([...aTokens, ...bTokens]).size;
  const jaccard = matchCount / unionSize;
  const coverage = matchCount / aTokens.length;
  return coverage * 0.7 + jaccard * 0.3;
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
    const bTokens = tokenize(up.name);
    const score = similarity(aTokens, aNorm, bTokens, bTokens.join(""));
    if (score > bestScore) {
      bestScore = score;
      bestUnifiedId = up.id;
      bestDirectProduct = null;
    }
  }

  for (const vp of vendorProducts) {
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

export const VENDOR_COLORS = [
  { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-700" },
  { bg: "bg-rose-50", border: "border-rose-300", text: "text-rose-700" },
  { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700" },
  { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-700" },
  { bg: "bg-violet-50", border: "border-violet-300", text: "text-violet-700" },
  { bg: "bg-cyan-50", border: "border-cyan-300", text: "text-cyan-700" },
  { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-700" },
  { bg: "bg-pink-50", border: "border-pink-300", text: "text-pink-700" },
] as const;

export type VendorColor = (typeof VENDOR_COLORS)[number];

interface VendorPricePopoverProps {
  itemName: string;
  selectedVendor: string;
  vendorColor?: VendorColor;
  /** 이 품목을 가장 최근에 발주했던 업체명 (있으면 드롭다운에 바로가기로 표시) */
  lastOrderedVendor?: string;
  onSelectVendor: (vendorName: string) => void;
}

export function VendorPricePopover({ itemName, selectedVendor, vendorColor, lastOrderedVendor, onSelectVendor }: VendorPricePopoverProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PriceData | null>(null);
  const [editingMatch, setEditingMatch] = useState(false);
  const [matchSearch, setMatchSearch] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);

  // 마운트 시 백그라운드 프리페치 — 첫 번째 인스턴스가 fetch를 시작하고
  // 나머지는 동일한 Promise를 공유하므로 실제 요청은 한 번만 발생
  useEffect(() => {
    getPriceData().then((result) => setData(result)).catch(() => {});
  }, []);

  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setEditingMatch(false);
      setMatchSearch("");
      return;
    }
    if (!data) {
      setLoading(true);
      try {
        const result = await getPriceData();
        setData(result);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
  };

  const priceMatch = useMemo(() => {
    if (!data) return null;
    return resolveMatch(itemName, data);
  }, [itemName, data]);

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
      { id: crypto.randomUUID(), item_name: key, unified_product_id: unifiedId, created_by: null, created_at: new Date().toISOString() },
    ];
    setCachedAliases(next);
    setData({ ...data, aliases: next });
    setItemAlias(itemName, unifiedId).catch(() => {});
  };

  const handleSelect = (vendorName: string) => {
    autoLearnFromSelection(vendorName);
    onSelectVendor(vendorName);
    setOpen(false);
  };

  const applyAlias = async (unifiedId: string) => {
    if (!data || savingAlias) return;
    setSavingAlias(true);
    try {
      await setItemAlias(itemName, unifiedId);
      const key = normalizeItemName(itemName);
      const next: ItemNameAlias[] = [
        ...data.aliases.filter((a) => a.item_name !== key),
        { id: crypto.randomUUID(), item_name: key, unified_product_id: unifiedId, created_by: null, created_at: new Date().toISOString() },
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

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-7 w-full justify-between gap-1 px-2 text-xs font-normal ${
            vendorColor
              ? `${vendorColor.bg} ${vendorColor.border} ${vendorColor.text} font-medium`
              : ""
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="truncate">
            {selectedVendor || "업체 선택"}
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Spinner text="가격 데이터 로딩 중..." />
          </div>
        ) : editingMatch ? (
          /* ─── 매칭 수정 모드 ─── */
          <div className="flex flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="통합제품 검색…"
                value={matchSearch}
                onChange={(e) => setMatchSearch(e.target.value)}
              />
              <button
                type="button"
                onClick={() => { setEditingMatch(false); setMatchSearch(""); }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="닫기"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {filteredUnified.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">검색 결과 없음</p>
              ) : (
                filteredUnified.map((u) => {
                  const isCurrent = priceMatch?.unifiedProductId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={savingAlias}
                      onClick={() => applyAlias(u.id)}
                      className={`flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50 ${isCurrent ? "bg-accent" : ""}`}
                    >
                      <span className="font-medium">{u.name}</span>
                      {u.notes && <span className="text-xs text-muted-foreground">{u.notes}</span>}
                    </button>
                  );
                })
              )}
            </div>
            {priceMatch?.source === "alias" && (
              <div className="border-t px-3 py-2">
                <button
                  type="button"
                  disabled={savingAlias}
                  onClick={clearAlias}
                  className="text-xs text-destructive hover:underline disabled:opacity-50"
                >
                  매칭 해제 (자동 매칭으로 되돌리기)
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ─── 일반 모드 ─── */
          <div className="py-1">
            {/* 매칭 상태 + 수정 버튼 */}
            <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
              {priceMatch ? (
                priceMatch.source === "alias" ? (
                  <span className="flex min-w-0 items-center gap-1 text-blue-700">
                    <span className="shrink-0 rounded bg-blue-50 px-1 py-0.5 font-medium">학습됨</span>
                    <span className="truncate">{priceMatch.productName}</span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">추정: {priceMatch.productName}</span>
                )
              ) : (
                <span className="flex-1 text-muted-foreground">매칭된 가격 없음</span>
              )}
              <button
                type="button"
                onClick={() => setEditingMatch(true)}
                className="ml-auto flex shrink-0 items-center gap-0.5 text-primary hover:underline"
              >
                <Pencil className="h-3 w-3" /> 매칭 수정
              </button>
            </div>

            {/* 선택없음 */}
            <div className="px-1 pb-1 border-b mb-1">
              <button
                type="button"
                className={`flex w-full items-center rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent ${!selectedVendor ? "bg-accent" : ""}`}
                onClick={() => handleSelect("")}
              >
                <span className="text-muted-foreground">선택없음</span>
              </button>
            </div>

            {/* 이전 주문 업체 바로가기 */}
            {lastOrderedVendor && (
              <div className="px-1 pb-1 border-b mb-1">
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent ${selectedVendor === lastOrderedVendor ? "bg-accent" : ""}`}
                  onClick={() => handleSelect(lastOrderedVendor)}
                >
                  <span className="shrink-0 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700">이전 주문 업체</span>
                  <span className="truncate font-medium">{lastOrderedVendor}</span>
                </button>
              </div>
            )}

            {priceMatch ? (
              <>
                {priceMatch.remarks && (
                  <div className="mx-3 mb-1 mt-2 rounded-md bg-yellow-50 px-2 py-1 text-xs text-yellow-700">
                    비고: {priceMatch.remarks}
                  </div>
                )}
                <div className="px-1 py-1">
                  {priceMatch.prices.map((p) => {
                    const isMin = p.price !== null && p.price === priceMatch.minPrice;
                    const isSelected = selectedVendor === p.vendorName;
                    return (
                      <button
                        key={p.vendorName}
                        type="button"
                        className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent ${
                          isSelected ? "bg-accent" : ""
                        }`}
                        onClick={() => handleSelect(p.vendorName)}
                      >
                        <div className="min-w-0 flex-1 text-left">
                          <span className="font-medium">{p.vendorName}</span>
                          <p className="truncate text-xs text-muted-foreground">{p.productName}</p>
                        </div>
                        <span
                          className={`shrink-0 text-sm tabular-nums ${
                            isMin
                              ? "font-semibold text-green-700"
                              : p.price !== null
                                ? "text-foreground"
                                : "text-muted-foreground"
                          }`}
                        >
                          {p.price !== null ? `${p.price.toLocaleString()}원` : "-"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : data?.vendors && data.vendors.length > 0 ? (
              <>
                <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground">가격 데이터 없음 — 업체 직접 선택</div>
                <div className="px-1 pb-1">
                  {data.vendors.map((v) => {
                    const isSelected = selectedVendor === v.name;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        className={`flex w-full items-center rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent ${isSelected ? "bg-accent" : ""}`}
                        onClick={() => handleSelect(v.name)}
                      >
                        <span className="font-medium">{v.name}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                업체 데이터 없음
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
