"use client";

import { Fragment, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, ChevronRight, CircleAlert, ClipboardCopy, Check, ShoppingCart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusBadge, StatusLegend } from "./order-status-badge";
import { formatDate } from "@/lib/utils/format";
import { Spinner } from "@/components/ui/spinner";
import { logClientAction } from "@/app/(main)/log-action";
import type { OrderWithRequester } from "@/lib/types/order";
import { fetchPriceCompareData } from "@/lib/actions/price-compare-action";
import type { Vendor, VendorProduct, UnifiedProduct } from "@/lib/types/price-compare";

interface PriceMatch {
  productName: string;
  remarks: string;
  prices: { vendorName: string; price: number | null; productName: string }[];
  minPrice: number | null;
}

/** Tokenize: strip manufacturer prefix, split into meaningful tokens */
function tokenize(s: string): string[] {
  const stripped = s
    .replace(/^[^()\s]{1,10}\)/, "") // "후지)헤파린튜브" → "헤파린튜브" (no parens in prefix)
    .toLowerCase();
  // Split on whitespace, punctuation, and between Korean/number/unit boundaries
  const tokens = stripped
    .replace(/([가-힣])(\d)/g, "$1 $2")  // 헤파린500 → 헤파린 500
    .replace(/(\d)([가-힣])/g, "$1 $2")  // 500밀리 → 500 밀리
    .replace(/([a-z])(\d)/g, "$1 $2")    // ns500 → ns 500
    .replace(/(\d)([a-z])/g, "$1 $2")    // 500ml → 500 ml (before unit split)
    .replace(/(\d)(mg|ml|g|l|mcg|iu|%|정|캡슐|앰플|바이알|프리필드|시린지|팩|매)/gi, "$1 $2")
    .split(/[\s/·,_\-()[\]{}]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return tokens;
}

/** Token-based similarity with containment bonus */
function similarity(aTokens: string[], aNorm: string, bTokens: string[], bNorm: string): number {
  if (aNorm.length === 0 || bNorm.length === 0) return 0;

  // Exact match after normalization
  if (aNorm === bNorm) return 1;

  // Containment checks
  if (bNorm.includes(aNorm)) return 0.95;
  if (aNorm.includes(bNorm)) return 0.9;

  if (aTokens.length === 0 || bTokens.length === 0) return 0;

  // Count matching tokens (exact or product token contains search token)
  let matchCount = 0;
  const usedB = new Set<number>();
  for (const at of aTokens) {
    for (let i = 0; i < bTokens.length; i++) {
      if (usedB.has(i)) continue;
      const bt = bTokens[i];
      if (at === bt || (at.length >= 2 && bt.includes(at))) {
        matchCount++;
        usedB.add(i);
        break;
      }
    }
  }

  const unionSize = new Set([...aTokens, ...bTokens]).size;
  const jaccard = matchCount / unionSize;

  // Coverage: how many of the search tokens are matched
  const coverage = matchCount / aTokens.length;

  // Weighted: prioritize coverage (what the user typed) over union
  return coverage * 0.7 + jaccard * 0.3;
}

function findBestPriceMatch(
  itemName: string,
  vendors: Vendor[],
  vendorProducts: VendorProduct[],
  unifiedProducts: UnifiedProduct[],
  byUnified: Map<string, VendorProduct[]>,
  unifiedMap: Map<string, UnifiedProduct>,
): PriceMatch | null {
  const MIN_THRESHOLD = 0.3;

  // Pre-tokenize search term once
  const aTokens = tokenize(itemName);
  const aNorm = aTokens.join("");

  let bestScore = 0;
  let bestUnifiedId: string | null = null;
  let bestDirectProduct: VendorProduct | null = null;

  // 1) Match against unified product names
  for (const up of unifiedProducts) {
    const bTokens = tokenize(up.name);
    const score = similarity(aTokens, aNorm, bTokens, bTokens.join(""));
    if (score > bestScore) {
      bestScore = score;
      bestUnifiedId = up.id;
      bestDirectProduct = null;
    }
  }

  // 2) Match against individual vendor product names
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
    const products = byUnified.get(bestUnifiedId) ?? [];
    const unified = unifiedMap.get(bestUnifiedId);
    const prices = vendors.map((v) => {
      const vp = products.find((p) => p.vendor_id === v.id);
      return {
        vendorName: v.name,
        price: vp?.unit_price ?? null,
        productName: vp?.product_name ?? "-",
      };
    });
    const validPrices = prices.filter((p) => p.price !== null).map((p) => p.price!);
    return {
      productName: products[0]?.product_name ?? "",
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

export function OrderList() {
  const { isAdmin, userId: currentUserId } = useAuth();
  const [orders, setOrders] = useState<OrderWithRequester[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isOrdering, setIsOrdering] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"all" | "individual">("all");
  const [bulkVendorName, setBulkVendorName] = useState("");
  const [bulkOrderNotes, setBulkOrderNotes] = useState("");
  const [individualVendors, setIndividualVendors] = useState<Map<string, string>>(new Map());
  const [individualNotes, setIndividualNotes] = useState<Map<string, string>>(new Map());
  const [copied, setCopied] = useState(false);
  const [priceVendors, setPriceVendors] = useState<Vendor[]>([]);
  const [priceProducts, setPriceProducts] = useState<VendorProduct[]>([]);
  const [priceUnified, setPriceUnified] = useState<UnifiedProduct[]>([]);
  const [priceFetched, setPriceFetched] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, requester:profiles!requester_id(full_name)")
      .eq("type", "order")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    setOrders((data as OrderWithRequester[]) ?? []);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("order-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
          realtimeTimer.current = setTimeout(fetchOrders, 500);
        }
      )
      .subscribe();

    return () => {
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchOrders]);

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => {
      if (a.is_urgent !== b.is_urgent) return a.is_urgent ? -1 : 1;
      return 0;
    }),
    [orders]
  );

  // Lazy-fetch price data when first item is selected
  useEffect(() => {
    if (!isAdmin || priceFetched || selectedIds.size === 0) return;
    setPriceFetched(true);
    fetchPriceCompareData().then(({ vendors, vendorProducts, unifiedProducts }) => {
      setPriceVendors(vendors);
      setPriceProducts(vendorProducts);
      setPriceUnified(unifiedProducts);
    }).catch(() => {
      // silently fail - price comparison just won't show
    });
  }, [isAdmin, priceFetched, selectedIds.size]);

  const priceDataLoaded = priceVendors.length > 0;

  const priceMatchMap = useMemo(() => {
    if (priceVendors.length === 0) return new Map<string, PriceMatch>();

    // Build lookup maps once for all orders
    const byUnified = new Map<string, VendorProduct[]>();
    for (const vp of priceProducts) {
      if (!vp.unified_product_id) continue;
      const arr = byUnified.get(vp.unified_product_id) ?? [];
      arr.push(vp);
      byUnified.set(vp.unified_product_id, arr);
    }
    const unifiedMap = new Map(priceUnified.map((u) => [u.id, u]));

    const map = new Map<string, PriceMatch>();
    for (const order of orders) {
      if (!selectedIds.has(order.id)) continue;
      const match = findBestPriceMatch(order.item_name, priceVendors, priceProducts, priceUnified, byUnified, unifiedMap);
      if (match) map.set(order.id, match);
    }
    return map;
  }, [orders, selectedIds, priceVendors, priceProducts, priceUnified]);

  const pendingOrders = sortedOrders.filter((o) => o.status === "pending");
  const allPendingSelected =
    pendingOrders.length > 0 &&
    pendingOrders.every((o) => selectedIds.has(o.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingOrders.map((o) => o.id)));
    }
  };

  const openBulkDialog = () => {
    setBulkMode("all");
    setBulkVendorName("");
    setBulkOrderNotes("");
    setCopied(false);
    setIndividualVendors(new Map(
      [...selectedIds].map((id) => [id, ""])
    ));
    setIndividualNotes(new Map(
      [...selectedIds].map((id) => [id, ""])
    ));
    setBulkDialogOpen(true);
  };

  const generateOrderMessage = () => {
    const selectedOrders = sortedOrders.filter((o) => selectedIds.has(o.id));
    const lines = selectedOrders.map((o) => {
      const qty = o.quantity > 0
        ? `${o.quantity}${o.unit ? `${o.unit}` : ""}`
        : "";
      return `${o.item_name}  ${qty}`.trimEnd();
    });
    return `안녕하세요\n\n${lines.join("\n")}\n\n주문하겠습니다.`;
  };

  const handleCopyMessage = async () => {
    const message = generateOrderMessage();
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBulkOrder = async () => {
    if (selectedIds.size === 0) return;
    setIsOrdering(true);

    const userId = currentUserId ?? (await supabase.auth.getSession()).data.session?.user.id;

    if (bulkMode === "all") {
      const { error } = await supabase
        .from("orders")
        .update({ status: "ordered", vendor_name: bulkVendorName.trim(), order_notes: bulkOrderNotes.trim(), updated_by: userId })
        .in("id", [...selectedIds]);

      if (error) {
        setIsOrdering(false);
        return;
      }
    } else {
      const results = await Promise.all(
        [...selectedIds].map((id) =>
          supabase
            .from("orders")
            .update({
              status: "ordered",
              vendor_name: (individualVendors.get(id) ?? "").trim(),
              order_notes: (individualNotes.get(id) ?? "").trim(),
              updated_by: userId,
            })
            .eq("id", id)
        )
      );

      if (results.some((r) => r.error)) {
        setIsOrdering(false);
        return;
      }
    }

    logClientAction("dispatch", "dispatch_bulk", `${selectedIds.size}건 일괄 발주`);
    setBulkDialogOpen(false);
    setSelectedIds(new Set());
    setIsOrdering(false);
    await fetchOrders();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner text="불러오는 중..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-destructive">데이터를 불러올 수 없습니다.</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (sortedOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">
          등록된 주문이 없습니다.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          새 주문을 등록하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 py-2">
        {isAdmin && pendingOrders.length > 0 ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox
              checked={allPendingSelected}
              onCheckedChange={toggleSelectAll}
            />
            전체선택 ({pendingOrders.length}건)
          </label>
        ) : (
          <div />
        )}
        <StatusLegend />
      </div>

      {/* PC 테이블 뷰 */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && <TableHead className="w-10" />}
              <TableHead>상태</TableHead>
              <TableHead>품목명</TableHead>
              <TableHead>수량</TableHead>
              <TableHead>요청자</TableHead>
              <TableHead>요청일</TableHead>
              <TableHead className="w-12">사진</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedOrders.map((order) => {
              const isPending = order.status === "pending";
              const showCheckbox = isAdmin && isPending;
              const isSelected = selectedIds.has(order.id);
              const priceMatch = isSelected ? priceMatchMap.get(order.id) : null;
              const colCount = isAdmin ? 7 : 6;

              return (
                <Fragment key={order.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => router.push(`/orders/${order.id}`)}
                  >
                    {isAdmin && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {showCheckbox && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(order.id)}
                          />
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {order.is_urgent && <CircleAlert className="h-4 w-4 text-red-500 shrink-0" />}
                        {order.item_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      {order.quantity > 0
                        ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}`
                        : <span className="text-muted-foreground">(사진 참고)</span>}
                    </TableCell>
                    <TableCell>{order.requester?.full_name ?? "-"}</TableCell>
                    <TableCell>{formatDate(order.created_at)}</TableCell>
                    <TableCell>
                      {order.photo_urls?.length > 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Camera className="h-3.5 w-3.5" />
                          {order.photo_urls.length}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                  {isSelected && priceFetched && (
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={colCount} className="py-2 px-4">
                        {!priceDataLoaded ? (
                          <span className="text-xs text-muted-foreground">가격 데이터 로딩 중...</span>
                        ) : priceMatch ? (
                          <div className="flex items-center gap-3 text-xs">
                            <span className="shrink-0 font-medium text-muted-foreground">
                              추천 가격비교
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              ({priceMatch.productName})
                            </span>
                            <div className="flex flex-wrap items-center gap-3">
                              {priceMatch.prices.map((p) => (
                                <span
                                  key={p.vendorName}
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${
                                    p.price !== null && p.price === priceMatch.minPrice
                                      ? "bg-green-100 text-green-800 font-semibold"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  <span>{p.vendorName}</span>
                                  <span>
                                    {p.price !== null
                                      ? `${p.price.toLocaleString()}원`
                                      : "-"}
                                  </span>
                                </span>
                              ))}
                            </div>
                            {priceMatch.remarks && (
                              <span className="shrink-0 rounded-md bg-yellow-50 px-2 py-0.5 text-yellow-700">
                                비고: {priceMatch.remarks}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">일치하는 가격 데이터 없음</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 모바일/태블릿 카드 뷰 */}
      <div className="lg:hidden space-y-2">
        {sortedOrders.map((order) => {
          const isPending = order.status === "pending";
          const showCheckbox = isAdmin && isPending;
          const isSelected = selectedIds.has(order.id);
          const priceMatch = isSelected ? priceMatchMap.get(order.id) : null;

          return (
            <div
              key={order.id}
              className="rounded-xl bg-card shadow-card overflow-hidden"
            >
              <div className="flex items-center gap-3 p-4 transition-colors">
                {showCheckbox && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(order.id)}
                  />
                )}
                <Link
                  href={`/orders/${order.id}`}
                  className="flex flex-1 items-center gap-3 min-w-0 active:opacity-70"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <OrderStatusBadge status={order.status} />
                      {order.is_urgent && <CircleAlert className="h-4 w-4 text-red-500 shrink-0" />}
                      <span className="truncate font-medium">{order.item_name}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <span>
                        {order.quantity > 0
                          ? `수량: ${order.quantity}${order.unit ? ` ${order.unit}` : ""}`
                          : <span className="text-muted-foreground">(사진 참고)</span>}
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
              </div>
              {isSelected && priceFetched && (
                <div className="border-t border-border bg-muted/50 px-4 py-2">
                  {!priceDataLoaded ? (
                    <span className="text-xs text-muted-foreground">가격 데이터 로딩 중...</span>
                  ) : priceMatch ? (
                    <>
                      <p className="text-[11px] font-medium text-muted-foreground mb-1">
                        추천 가격비교 — {priceMatch.productName}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {priceMatch.prices.map((p) => (
                          <span
                            key={p.vendorName}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
                              p.price !== null && p.price === priceMatch.minPrice
                                ? "bg-green-100 text-green-800 font-semibold"
                                : "text-muted-foreground"
                            }`}
                          >
                            <span>{p.vendorName}</span>
                            <span>
                              {p.price !== null ? `${p.price.toLocaleString()}원` : "-"}
                            </span>
                          </span>
                        ))}
                      </div>
                      {priceMatch.remarks && (
                        <p className="mt-1 text-[11px] text-yellow-700">
                          비고: {priceMatch.remarks}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">일치하는 가격 데이터 없음</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4 lg:left-60 lg:bottom-4">
          <Button
            className="w-full max-w-md md:max-w-2xl lg:max-w-full shadow-lg"
            onClick={openBulkDialog}
          >
            <ShoppingCart className="h-4 w-4" />
            {`선택 항목 일괄 주문 (${selectedIds.size}건)`}
          </Button>
        </div>
      )}

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>주문하기</DialogTitle>
            <DialogDescription>
              선택된 {selectedIds.size}건의 품목을 주문합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              variant={bulkMode === "all" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setBulkMode("all")}
            >
              일괄 입력
            </Button>
            <Button
              variant={bulkMode === "individual" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setBulkMode("individual")}
            >
              개별 입력
            </Button>
          </div>

          {bulkMode === "all" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="bulk-vendor">업체명</Label>
                <Input
                  id="bulk-vendor"
                  placeholder="업체명 입력"
                  value={bulkVendorName}
                  onChange={(e) => setBulkVendorName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-order-notes">비고</Label>
                <Input
                  id="bulk-order-notes"
                  placeholder="비고 (선택)"
                  value={bulkOrderNotes}
                  onChange={(e) => setBulkOrderNotes(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="max-h-60 space-y-3 overflow-y-auto">
              {[...selectedIds].map((id) => {
                const order = orders.find((o) => o.id === id);
                return (
                  <div key={id} className="space-y-1">
                    <Label className="text-sm font-medium">
                      {order?.item_name ?? id}
                    </Label>
                    <Input
                      placeholder="업체명 입력"
                      value={individualVendors.get(id) ?? ""}
                      onChange={(e) =>
                        setIndividualVendors((prev) => {
                          const next = new Map(prev);
                          next.set(id, e.target.value);
                          return next;
                        })
                      }
                    />
                    <Input
                      placeholder="비고 (선택)"
                      value={individualNotes.get(id) ?? ""}
                      onChange={(e) =>
                        setIndividualNotes((prev) => {
                          const next = new Map(prev);
                          next.set(id, e.target.value);
                          return next;
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={handleCopyMessage}
          >
            {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
            {copied ? "복사됨" : "주문 요청 문구 복사"}
          </Button>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">취소</Button>
            </DialogClose>
            <Button onClick={handleBulkOrder} disabled={isOrdering}>
              {isOrdering ? "주문 처리 중..." : "주문"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
