"use client";

import { useState, useMemo, useEffect } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { fetchPriceCompareData } from "@/lib/actions/price-compare-action";
import type { Vendor, VendorProduct, UnifiedProduct } from "@/lib/types/price-compare";

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
}

// Shared price data cache (module-level singleton)
interface PriceData {
  vendors: Vendor[];
  products: VendorProduct[];
  unified: UnifiedProduct[];
}

let cachedData: PriceData | null = null;
let fetchPromise: Promise<PriceData> | null = null;

async function getPriceData() {
  if (cachedData) return cachedData;
  if (!fetchPromise) {
    fetchPromise = fetchPriceCompareData().then(({ vendors, vendorProducts, unifiedProducts }) => {
      cachedData = { vendors, products: vendorProducts, unified: unifiedProducts };
      return cachedData;
    });
  }
  return fetchPromise;
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

function findBestPriceMatch(
  itemName: string,
  vendors: Vendor[],
  vendorProducts: VendorProduct[],
  unifiedProducts: UnifiedProduct[],
): PriceMatch | null {
  const MIN_THRESHOLD = 0.3;
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
    const byUnified = vendorProducts.filter((p) => p.unified_product_id === bestUnifiedId);
    const unified = unifiedProducts.find((u) => u.id === bestUnifiedId);
    const prices = vendors.map((v) => {
      const vp = byUnified.find((p) => p.vendor_id === v.id);
      return { vendorName: v.name, price: vp?.unit_price ?? null, productName: vp?.product_name ?? "-" };
    });
    const validPrices = prices.filter((p) => p.price !== null).map((p) => p.price!);
    return {
      productName: byUnified[0]?.product_name ?? "",
      remarks: unified?.remarks ?? "",
      prices,
      minPrice: validPrices.length > 0 ? Math.min(...validPrices) : null,
    };
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
    };
  }

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
  onSelectVendor: (vendorName: string) => void;
}

export function VendorPricePopover({ itemName, selectedVendor, vendorColor, onSelectVendor }: VendorPricePopoverProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    vendors: Vendor[];
    products: VendorProduct[];
    unified: UnifiedProduct[];
  } | null>(null);

  // 마운트 시 백그라운드 프리페치 — 첫 번째 인스턴스가 fetch를 시작하고
  // 나머지는 동일한 Promise를 공유하므로 실제 요청은 한 번만 발생
  useEffect(() => {
    getPriceData().then((result) => setData(result)).catch(() => {});
  }, []);

  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !data) {
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
    return findBestPriceMatch(itemName, data.vendors, data.products, data.unified);
  }, [itemName, data]);

  const handleSelect = (vendorName: string) => {
    onSelectVendor(vendorName);
    setOpen(false);
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
        ) : !priceMatch ? (
          data?.vendors && data.vendors.length > 0 ? (
            <div className="py-1">
              <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground">가격 데이터 없음</div>
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
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              일치하는 가격 데이터 없음
            </div>
          )
        ) : (
          <div className="py-1">
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
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
