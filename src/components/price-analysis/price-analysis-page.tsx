"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Search, ChevronDown, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchPriceAnalysis, fetchItemPriceTrend, fetchTrendProducts } from "@/lib/actions/price-analysis-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { PriceAnalysisResult, PriceAnalysisRow, ItemTrendPoint } from "@/lib/types/invoice";

const won = (n: number) => `${Math.round(n).toLocaleString()}원`;
const pct = (n: number | null) => (n == null ? "-" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);
const deltaColor = (n: number | null) =>
  n == null ? "text-muted-foreground" : n > 0 ? "text-red-600" : n < 0 ? "text-blue-600" : "text-muted-foreground";

export function PriceAnalysisPage() {
  const supabase = createClient();

  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [aStart, setAStart] = useState("");
  const [aEnd, setAEnd] = useState("");
  const [bStart, setBStart] = useState("");
  const [bEnd, setBEnd] = useState("");

  const [result, setResult] = useState<PriceAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [expanded, setExpanded] = useState<string | null>(null);
  const [trends, setTrends] = useState<Record<string, ItemTrendPoint[] | "loading">>({});

  // 품목 추이 전용 검색 모드
  const [mode, setMode] = useState<"compare" | "trend">("compare");
  const [trendProducts, setTrendProducts] = useState<{ key: string; name: string; unifiedProductId: string | null }[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [trendKey, setTrendKey] = useState<string | null>(null);
  const [trendData, setTrendData] = useState<ItemTrendPoint[] | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  const switchMode = (m: "compare" | "trend") => {
    setMode(m);
    setError("");
    if (m === "trend" && !productsLoaded) {
      fetchTrendProducts()
        .then((list) => setTrendProducts(list))
        .catch(() => {})
        .finally(() => setProductsLoaded(true));
    }
  };

  const selectTrendProduct = async (key: string | null) => {
    setTrendKey(key);
    setTrendData(null);
    if (!key) return;
    const p = trendProducts.find((x) => x.key === key);
    if (!p) return;
    setTrendLoading(true);
    try {
      setTrendData(await fetchItemPriceTrend({ unifiedProductId: p.unifiedProductId, itemName: p.name, vendorId }));
    } catch {
      setTrendData([]);
    } finally {
      setTrendLoading(false);
    }
  };

  useEffect(() => {
    supabase
      .from("vendors")
      .select("id, name")
      .order("name")
      .then(({ data }) => setVendors((data as { id: string; name: string }[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyze = async () => {
    if (!aStart || !aEnd || !bStart || !bEnd) {
      setError("기준 기간과 비교 기간의 시작·종료일을 모두 입력하세요.");
      return;
    }
    setLoading(true);
    setError("");
    setExpanded(null);
    setTrends({});
    try {
      setResult(await fetchPriceAnalysis({ aStart, aEnd, bStart, bEnd, vendorId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = async (row: PriceAnalysisRow) => {
    if (expanded === row.key) {
      setExpanded(null);
      return;
    }
    setExpanded(row.key);
    if (!trends[row.key]) {
      setTrends((p) => ({ ...p, [row.key]: "loading" }));
      try {
        const t = await fetchItemPriceTrend({
          unifiedProductId: row.unifiedProductId,
          itemName: row.name,
          vendorId,
        });
        setTrends((p) => ({ ...p, [row.key]: t }));
      } catch {
        setTrends((p) => ({ ...p, [row.key]: [] }));
      }
    }
  };

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-5xl">
      <header className="sticky top-[var(--page-top)] z-40 flex items-center gap-2 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">단가 분석</h1>
      </header>

      <div className="space-y-4 p-4">
        {/* 모드 토글 */}
        <div className="inline-flex rounded-md border bg-card p-0.5 text-sm">
          {(["compare", "trend"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {m === "compare" ? "기간 비교" : "품목 추이"}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {mode === "compare" && (
        <div className="space-y-4">
        {/* 필터 */}
        <div className="space-y-3 rounded-2xl bg-card p-4 shadow-card">
          <div className="space-y-1.5">
            <Label>업체</Label>
            <SearchableSelect
              value={vendorId}
              onChange={setVendorId}
              options={vendors.map((v) => ({ value: v.id, label: v.name, keywords: v.name }))}
              placeholder="전체 업체"
              allowClear
              clearLabel="전체 업체"
              className="h-9 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">기준 기간 (A)</p>
              <div className="flex items-center gap-1.5">
                <Input type="date" value={aStart} onChange={(e) => setAStart(e.target.value)} className="h-8" />
                <span className="text-xs text-muted-foreground">~</span>
                <Input type="date" value={aEnd} onChange={(e) => setAEnd(e.target.value)} className="h-8" />
              </div>
            </div>
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">비교 기간 (B)</p>
              <div className="flex items-center gap-1.5">
                <Input type="date" value={bStart} onChange={(e) => setBStart(e.target.value)} className="h-8" />
                <span className="text-xs text-muted-foreground">~</span>
                <Input type="date" value={bEnd} onChange={(e) => setBEnd(e.target.value)} className="h-8" />
              </div>
            </div>
          </div>
          <Button onClick={analyze} disabled={loading} className="w-full">
            <Search className="h-4 w-4" /> {loading ? "분석 중…" : "분석"}
          </Button>
          <p className="text-xs text-muted-foreground">
            인상률은 <b>과거(A) 구매량 가중</b> 기준 — 많이 사는 약품일수록 더 크게 반영된 체감 인상률입니다.
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <Spinner text="분석 중…" />
          </div>
        )}

        {result && !loading && (
          <div className="space-y-4">
            {/* 헤드라인 */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl bg-card p-4 shadow-card">
                <p className="text-xs text-muted-foreground">체감 인상률 (수량가중)</p>
                <p className={`mt-1 text-2xl font-bold ${deltaColor(result.weightedInflationPct)}`}>
                  {pct(result.weightedInflationPct)}
                </p>
              </div>
              <div className="rounded-2xl bg-card p-4 shadow-card">
                <p className="text-xs text-muted-foreground">단순 평균 (참고)</p>
                <p className={`mt-1 text-2xl font-bold ${deltaColor(result.simpleAvgPct)}`}>{pct(result.simpleAvgPct)}</p>
              </div>
              <div className="rounded-2xl bg-card p-4 shadow-card">
                <p className="text-xs text-muted-foreground">비교 품목</p>
                <p className="mt-1 text-2xl font-bold">{result.comparedCount}건</p>
              </div>
              <div className="rounded-2xl bg-card p-4 shadow-card">
                <p className="text-xs text-muted-foreground">동일 바스켓 지출</p>
                <p className="mt-1 text-sm font-semibold">
                  {won(result.basketBase)} → {won(result.basketNow)}
                </p>
              </div>
            </div>

            {/* 품목 비교표 */}
            {result.rows.length === 0 ? (
              <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
                두 기간에 공통으로 들어온 품목이 없습니다.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-card shadow-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">품목</th>
                      <th className="px-3 py-2 text-right font-medium whitespace-nowrap">A 단가</th>
                      <th className="px-3 py-2 text-right font-medium whitespace-nowrap">B 단가</th>
                      <th className="px-3 py-2 text-right font-medium whitespace-nowrap">변화</th>
                      <th className="px-3 py-2 text-right font-medium whitespace-nowrap">A·B 수량</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => {
                      const open = expanded === row.key;
                      const trend = trends[row.key];
                      return (
                        <FragmentRow key={row.key}>
                          <tr className="cursor-pointer border-t border-border/50 hover:bg-muted/30" onClick={() => toggleRow(row)}>
                            <td className="px-3 py-2">{row.name}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{won(row.aPrice)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{won(row.bPrice)}</td>
                            <td className={`px-3 py-2 text-right tabular-nums font-semibold ${deltaColor(row.deltaAbs)}`}>
                              {pct(row.deltaPct)}
                              <span className="ml-1 text-[11px] font-normal opacity-70">
                                ({row.deltaAbs >= 0 ? "+" : ""}{row.deltaAbs.toLocaleString()})
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                              {row.aQty} · {row.bQty}
                            </td>
                            <td className="px-2 text-muted-foreground">
                              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </td>
                          </tr>
                          {open && (
                            <tr className="border-t border-border/40 bg-muted/20">
                              <td colSpan={6} className="px-3 py-2">
                                <p className="mb-1 text-xs font-medium text-muted-foreground">단가 추이 (명세서 날짜별)</p>
                                {trend === "loading" || trend === undefined ? (
                                  <p className="py-2 text-xs text-muted-foreground">불러오는 중…</p>
                                ) : trend.length === 0 ? (
                                  <p className="py-2 text-xs text-muted-foreground">이력 없음</p>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {trend.map((t, i) => (
                                      <span key={i} className="rounded border border-border/60 bg-card px-2 py-1 text-xs tabular-nums">
                                        <span className="text-muted-foreground">{t.date ?? "-"}</span>{" "}
                                        <span className="font-medium">{won(t.unitPrice)}</span>
                                        <span className="text-muted-foreground"> ·{t.vendorName}·{t.quantity}개</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </FragmentRow>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 신규 / 단종 */}
            {(result.newItems.length > 0 || result.droppedItems.length > 0) && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {result.newItems.length > 0 && (
                  <div className="rounded-2xl bg-card p-4 shadow-card">
                    <p className="mb-2 text-sm font-semibold text-blue-700">신규 (B 기간에만) · {result.newItems.length}</p>
                    <ul className="space-y-1 text-xs">
                      {result.newItems.map((it, i) => (
                        <li key={i} className="flex justify-between">
                          <span className="truncate">{it.name}</span>
                          <span className="tabular-nums text-muted-foreground">{won(it.bPrice)} · {it.bQty}개</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.droppedItems.length > 0 && (
                  <div className="rounded-2xl bg-card p-4 shadow-card">
                    <p className="mb-2 text-sm font-semibold text-muted-foreground">단종 (A 기간에만) · {result.droppedItems.length}</p>
                    <ul className="space-y-1 text-xs">
                      {result.droppedItems.map((it, i) => (
                        <li key={i} className="flex justify-between">
                          <span className="truncate">{it.name}</span>
                          <span className="tabular-nums text-muted-foreground">{won(it.aPrice)} · {it.aQty}개</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        </div>
        )}

        {mode === "trend" && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl bg-card p-4 shadow-card">
              <div className="space-y-1.5">
                <Label>업체 (선택)</Label>
                <SearchableSelect
                  value={vendorId}
                  onChange={setVendorId}
                  options={vendors.map((v) => ({ value: v.id, label: v.name, keywords: v.name }))}
                  placeholder="전체 업체"
                  allowClear
                  clearLabel="전체 업체"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>품목 검색</Label>
                <SearchableSelect
                  value={trendKey}
                  onChange={selectTrendProduct}
                  options={trendProducts.map((p) => ({ value: p.key, label: p.name, keywords: p.name }))}
                  placeholder={productsLoaded ? "품목을 검색·선택하세요" : "품목 불러오는 중…"}
                  emptyText={productsLoaded ? "명세서에 등장한 품목이 없습니다" : "불러오는 중…"}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {trendLoading && (
              <div className="flex justify-center py-8">
                <Spinner text="불러오는 중…" />
              </div>
            )}

            {trendData && !trendLoading && (
              trendData.length === 0 ? (
                <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
                  명세서 단가 이력이 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const prices = trendData.map((t) => t.unitPrice);
                    const min = Math.min(...prices);
                    const max = Math.max(...prices);
                    const first = trendData[0].unitPrice;
                    const last = trendData[trendData.length - 1].unitPrice;
                    const chg = first > 0 ? ((last - first) / first) * 100 : null;
                    return (
                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <div className="rounded-2xl bg-card p-4 shadow-card">
                          <p className="text-xs text-muted-foreground">최저</p>
                          <p className="mt-1 text-lg font-bold tabular-nums">{won(min)}</p>
                        </div>
                        <div className="rounded-2xl bg-card p-4 shadow-card">
                          <p className="text-xs text-muted-foreground">최고</p>
                          <p className="mt-1 text-lg font-bold tabular-nums">{won(max)}</p>
                        </div>
                        <div className="rounded-2xl bg-card p-4 shadow-card">
                          <p className="text-xs text-muted-foreground">최근</p>
                          <p className="mt-1 text-lg font-bold tabular-nums">{won(last)}</p>
                        </div>
                        <div className="rounded-2xl bg-card p-4 shadow-card">
                          <p className="text-xs text-muted-foreground">처음→최근</p>
                          <p className={`mt-1 text-lg font-bold ${deltaColor(chg)}`}>{pct(chg)}</p>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="overflow-hidden rounded-2xl bg-card shadow-card">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">날짜</th>
                          <th className="px-3 py-2 font-medium">업체</th>
                          <th className="px-3 py-2 text-right font-medium">단가</th>
                          <th className="px-3 py-2 text-right font-medium">수량</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trendData.map((t, i) => (
                          <tr key={i} className="border-t border-border/50">
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{t.date ?? "-"}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{t.vendorName}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">{won(t.unitPrice)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{t.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// tbody 안에서 두 <tr>(행 + 펼침)을 묶기 위한 Fragment
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
