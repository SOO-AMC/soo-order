"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Loader2, Search, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchPriceAnalysis, fetchItemPriceTrend, fetchTrendProducts } from "@/lib/actions/price-analysis-action";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { UnderlineTabs } from "@/components/list-parts";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SavedViews } from "@/components/workspace/saved-views";
import { FilterBar, SearchField, Segmented } from "@/components/workspace/filter-bar";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { PeriodChip, DateRangeInputs } from "@/components/workspace/period-picker";
import { COMPARE_LABEL, compareRanges, kstToday, rangeText, type ComparePreset, type DateRange } from "@/lib/utils/period";
import type { PriceAnalysisResult, PriceAnalysisRow, ItemTrendPoint } from "@/lib/types/invoice";

const won = (n: number) => `${Math.round(n).toLocaleString()}원`;
const pct = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
/** 오름 = 빨강(비싸짐), 내림 = 파랑(싸짐) */
const deltaColor = (n: number | null) =>
  n == null || n === 0 ? "text-muted-foreground" : n > 0 ? "text-status-late" : "text-status-doing";

const PRESETS: ComparePreset[] = ["mom", "yoyMonth", "ytd", "q"];
type RowView = "all" | "up" | "down" | "same";

/** 숫자 카드 하나 */
function Kpi({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-card p-4 ring-1 ring-border", className)}>
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="mt-1 text-[22px] font-extrabold leading-7 tracking-tight tabular-nums">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** 그 품목의 가격 추이·주문 이력 화면으로 */
function ItemLink({ row }: { row: { name: string; unifiedProductId: string | null; suspect: boolean } }) {
  const href = row.unifiedProductId ? `/items?product=${row.unifiedProductId}` : `/items?name=${encodeURIComponent(row.name)}`;
  return (
    <p className="mt-2 text-[13px]">
      {row.suspect && <span className="mr-2 text-status-ask">단가가 2배 넘게 달라졌어요. 명세서의 자릿수나 묶음 단위를 확인해 보세요.</span>}
      <Link href={href} className="font-semibold text-primary hover:underline">
        가격 추이·주문 이력 보기 →
      </Link>
    </p>
  );
}

/** 명세서 날짜별 단가 칩들 */
function TrendChips({ trend }: { trend: ItemTrendPoint[] | "loading" | undefined }) {
  if (trend === "loading" || trend === undefined) return <p className="py-1 text-xs text-muted-foreground">불러오는 중…</p>;
  if (trend.length === 0) return <p className="py-1 text-xs text-muted-foreground">이력이 없어요</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {trend.map((t, i) => (
        <span key={i} className="rounded-md bg-card px-2 py-1 text-xs tabular-nums ring-1 ring-border">
          <span className="text-muted-foreground">{t.date ?? "—"}</span> <b className="font-semibold">{won(t.unitPrice)}</b>
          <span className="text-muted-foreground">
            {" "}
            · {t.vendorName} · {t.quantity}개
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * 단가 분석 (관리자). 기간 비교 = 같은 품목의 A→B 단가 변화 + 수량가중(라스파이레스) 체감 인상률.
 * 품목 추이 = 한 품목의 명세서 날짜별 단가.
 */
export function PriceAnalysisPage() {
  const supabase = createClient();
  const [today] = useState(kstToday);

  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [preset, setPreset] = useState<ComparePreset | null>("mom");
  const [a, setA] = useState<DateRange>(() => compareRanges("mom", kstToday()).a);
  const [b, setB] = useState<DateRange>(() => compareRanges("mom", kstToday()).b);

  const [result, setResult] = useState<PriceAnalysisResult | null>(null);
  const [resultLabel, setResultLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rowView, setRowView] = useState<RowView>("all");
  /** 줄 순서: impact = 이번 기간에 가격 변화로 더 낸(덜 낸) 금액이 큰 순, pct = 변화율 순 */
  const [sortBy, setSortBy] = useState<"impact" | "pct">("impact");
  const [rowQuery, setRowQuery] = useState("");

  const [expanded, setExpanded] = useState<string | null>(null);
  const [trends, setTrends] = useState<Record<string, ItemTrendPoint[] | "loading">>({});

  // 품목 추이
  const [mode, setMode] = useState<"compare" | "trend">("compare");
  const [trendProducts, setTrendProducts] = useState<{ key: string; name: string; unifiedProductId: string | null }[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [trendKey, setTrendKey] = useState<string | null>(null);
  const [trendData, setTrendData] = useState<ItemTrendPoint[] | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("vendors")
      .select("id, name")
      .order("name")
      .then(({ data }) => setVendors((data as { id: string; name: string }[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 처음 열면 "지난달 → 이번 달"을 바로 보여 준다 (빈 화면에서 분석 버튼을 찾지 않게)
  useEffect(() => {
    let active = true;
    const r = compareRanges("mom", today);
    fetchPriceAnalysis({ aStart: r.a.start, aEnd: r.a.end, bStart: r.b.start, bEnd: r.b.end, vendorId: null })
      .then((res) => {
        if (!active) return;
        setResult(res);
        setResultLabel(`전체 업체 · A ${rangeText(r.a)}  →  B ${rangeText(r.b)}`);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [today]);

  const vendorOptions = vendors.map((v) => ({ value: v.id, label: v.name, keywords: v.name }));
  const vendorName = vendorId ? vendors.find((v) => v.id === vendorId)?.name ?? "업체" : "전체 업체";

  const switchMode = (m: "compare" | "trend") => {
    setMode(m);
    setError("");
    if (m === "trend" && !productsLoaded) {
      fetchTrendProducts()
        .then((list) => setTrendProducts(list))
        .catch(() => setError("품목 목록을 불러오지 못했어요."))
        .finally(() => setProductsLoaded(true));
    }
  };

  const pickPreset = (p: ComparePreset) => {
    const r = compareRanges(p, today);
    setPreset(p);
    setA(r.a);
    setB(r.b);
  };

  const loadTrend = async (key: string | null, vId: string | null) => {
    setTrendKey(key);
    setTrendData(null);
    if (!key) return;
    const p = trendProducts.find((x) => x.key === key);
    if (!p) return;
    setTrendLoading(true);
    try {
      setTrendData(await fetchItemPriceTrend({ unifiedProductId: p.unifiedProductId, itemName: p.name, vendorId: vId }));
    } catch {
      setTrendData([]);
    } finally {
      setTrendLoading(false);
    }
  };

  const analyze = async () => {
    if (!a.start || !a.end || !b.start || !b.end) {
      setError("A·B 두 기간의 시작일과 종료일을 모두 정해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setExpanded(null);
    setTrends({});
    try {
      setResult(await fetchPriceAnalysis({ aStart: a.start, aEnd: a.end, bStart: b.start, bEnd: b.end, vendorId }));
      setResultLabel(`${vendorName} · A ${rangeText(a)}  →  B ${rangeText(b)}`);
      setRowView("all");
      setRowQuery("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
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
        const t = await fetchItemPriceTrend({ unifiedProductId: row.unifiedProductId, itemName: row.name, vendorId });
        setTrends((p) => ({ ...p, [row.key]: t }));
      } catch {
        setTrends((p) => ({ ...p, [row.key]: [] }));
      }
    }
  };

  const viewCounts = useMemo(() => {
    const rows = result?.rows ?? [];
    return {
      all: rows.length,
      up: rows.filter((r) => r.deltaAbs > 0).length,
      down: rows.filter((r) => r.deltaAbs < 0).length,
      same: rows.filter((r) => r.deltaAbs === 0).length,
    };
  }, [result]);

  const shownRows = useMemo(() => {
    let rows = result?.rows ?? [];
    if (rowView === "up") rows = rows.filter((r) => r.deltaAbs > 0);
    else if (rowView === "down") rows = rows.filter((r) => r.deltaAbs < 0);
    else if (rowView === "same") rows = rows.filter((r) => r.deltaAbs === 0);
    const q = rowQuery.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    // 금액 영향: 단가 변화 × 이번 기간에 산 수량 = 가격이 바뀌어서 더 낸(덜 낸) 돈
    // 급변(확인 필요)한 줄은 금액을 믿을 수 없으므로 맨 아래로 보낸다
    if (sortBy === "impact") rows = [...rows].sort((x, y) => Number(x.suspect) - Number(y.suspect) || y.deltaAbs * y.bQty - x.deltaAbs * x.bQty);
    return rows;
  }, [result, rowView, rowQuery, sortBy]);

  const trendStats = useMemo(() => {
    if (!trendData || trendData.length === 0) return null;
    const prices = trendData.map((t) => t.unitPrice);
    const first = trendData[0].unitPrice;
    const last = trendData[trendData.length - 1].unitPrice;
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      last,
      chg: first > 0 ? ((last - first) / first) * 100 : null,
    };
  }, [trendData]);

  return (
    <>
      <PageHeader
        title="단가 분석"
        leading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
        tabs={
          <UnderlineTabs<"compare" | "trend">
            ariaLabel="분석 방식"
            value={mode}
            onValueChange={switchMode}
            items={[
              { value: "compare", label: "기간 비교" },
              { value: "trend", label: "품목 추이" },
            ]}
          />
        }
      />

      <div className="mx-auto max-w-md space-y-3 p-4 md:max-w-2xl lg:max-w-6xl lg:px-6">
        {error && (
          <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
            {error}
          </p>
        )}

        {mode === "compare" ? (
          <>
            {/* 조건 */}
            <section className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-border">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="lg:w-60 lg:shrink-0">
                  <SearchableSelect
                    value={vendorId}
                    onChange={setVendorId}
                    options={vendorOptions}
                    placeholder="전체 업체"
                    allowClear
                    clearLabel="전체 업체"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="비교 기간">
                  {PRESETS.map((p) => (
                    <PeriodChip key={p} on={preset === p} onClick={() => pickPreset(p)}>
                      {COMPARE_LABEL[p]}
                    </PeriodChip>
                  ))}
                  <PeriodChip on={preset === null} onClick={() => setPreset(null)}>
                    직접
                  </PeriodChip>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-end">
                <div className="grid gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">기준 기간 A</span>
                  <DateRangeInputs
                    idPrefix="a"
                    value={a}
                    onChange={(r) => {
                      setA(r);
                      setPreset(null);
                    }}
                  />
                </div>
                <span className="hidden pb-2 text-muted-foreground md:block" aria-hidden="true">
                  →
                </span>
                <div className="grid gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">비교 기간 B</span>
                  <DateRangeInputs
                    idPrefix="b"
                    value={b}
                    onChange={(r) => {
                      setB(r);
                      setPreset(null);
                    }}
                  />
                </div>
                <Button onClick={analyze} disabled={loading} className="h-9 rounded-lg px-4">
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                  {loading ? "분석하는 중…" : "분석"}
                </Button>
              </div>
            </section>

            {loading ? (
              <ListSkeleton rows={8} />
            ) : !result ? (
              <div className="rounded-xl bg-card ring-1 ring-border">
                <EmptyState
                  icon={TrendingUp}
                  title="두 기간을 고르고 분석해 주세요"
                  description="두 기간에 모두 들어온 품목만 비교해요. 단가는 명세서 할인후 기준이에요."
                />
              </div>
            ) : (
              <>
                <p className="px-1 text-[13px] text-muted-foreground">{resultLabel}</p>

                {/* 숫자 */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Kpi
                    className="col-span-2 lg:col-span-1"
                    label="체감 인상률"
                    value={<span className={deltaColor(result.weightedInflationPct)}>{pct(result.weightedInflationPct)}</span>}
                    hint={result.suspectCount > 0 ? `급변한 ${result.suspectCount}개(확인 필요)는 빼고 계산` : "A 기간에 많이 산 품목일수록 크게 반영"}
                  />
                  <Kpi label="단순 평균" value={<span className={deltaColor(result.simpleAvgPct)}>{pct(result.simpleAvgPct)}</span>} hint="품목마다 똑같이 계산(참고)" />
                  <Kpi label="비교한 품목" value={`${result.comparedCount}개`} hint={`오름 ${viewCounts.up} · 내림 ${viewCounts.down}`} />
                  <Kpi
                    className="col-span-2 lg:col-span-1"
                    label="같은 양을 샀다면"
                    value={<span className="text-[17px] leading-7">{won(result.basketBase)} → {won(result.basketNow)}</span>}
                    hint={
                      <span className={deltaColor(result.basketNow - result.basketBase)}>
                        {result.basketNow - result.basketBase >= 0 ? "+" : ""}
                        {won(result.basketNow - result.basketBase)}
                      </span>
                    }
                  />
                </div>

                {result.rows.length === 0 ? (
                  <div className="rounded-xl bg-card ring-1 ring-border">
                    <EmptyState icon={TrendingUp} title="두 기간에 함께 들어온 품목이 없어요" description="기간을 넓히거나 업체를 바꿔 보세요." />
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <SavedViews<RowView>
                        className="min-w-0 flex-1"
                        value={rowView}
                        onValueChange={setRowView}
                        views={[
                          { value: "all", label: "전체", count: viewCounts.all },
                          { value: "up", label: "오른 품목", count: viewCounts.up },
                          { value: "down", label: "내린 품목", count: viewCounts.down },
                          { value: "same", label: "그대로", count: viewCounts.same },
                        ]}
                      />
                      <Segmented<"impact" | "pct">
                        ariaLabel="줄 순서"
                        value={sortBy}
                        onValueChange={setSortBy}
                        items={[
                          { value: "impact", label: "금액 영향 큰 순" },
                          { value: "pct", label: "변화율 순" },
                        ]}
                      />
                      <FilterBar>
                        <SearchField id="pa-q" value={rowQuery} onChange={setRowQuery} placeholder="품목 검색" className="lg:w-64" />
                      </FilterBar>
                    </div>

                    {/* PC 표 */}
                    <section className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-border lg:block">
                      <div className="max-h-[calc(100dvh-26rem)] min-h-[16rem] overflow-auto">
                        <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
                          <thead className="sticky top-0 z-10">
                            <tr className="text-left text-xs font-semibold text-muted-foreground">
                              <th className="border-b border-border bg-muted py-2 pl-4 font-semibold">품목</th>
                              <th className="w-28 border-b border-border bg-muted px-3 py-2 text-right font-semibold">A 단가</th>
                              <th className="w-28 border-b border-border bg-muted px-3 py-2 text-right font-semibold">B 단가</th>
                              <th className="w-40 border-b border-border bg-muted px-3 py-2 text-right font-semibold">변화</th>
                              <th className="w-24 border-b border-border bg-muted px-3 py-2 text-right font-semibold">수량 A·B</th>
                              <th className="w-10 border-b border-border bg-muted" />
                            </tr>
                          </thead>
                          <tbody>
                            {shownRows.map((row) => {
                              const open = expanded === row.key;
                              return (
                                <Fragment key={row.key}>
                                  <tr
                                    onClick={() => toggleRow(row)}
                                    className={cn("cursor-pointer", open ? "bg-row-selected" : "hover:bg-muted/60")}
                                  >
                                    <td className="truncate border-b border-border py-2.5 pl-4 text-sm font-medium" title={row.name}>
                                      {row.suspect && <span className="mr-1.5 rounded-full bg-status-ask-bg px-1.5 py-0.5 text-xs font-semibold text-status-ask">확인 필요</span>}
                                      {row.name}
                                    </td>
                                    <td className="border-b border-border px-3 py-2.5 text-right tabular-nums text-subtle-foreground">{won(row.aPrice)}</td>
                                    <td className="border-b border-border px-3 py-2.5 text-right tabular-nums">{won(row.bPrice)}</td>
                                    <td className={cn("whitespace-nowrap border-b border-border px-3 py-2.5 text-right font-bold tabular-nums", deltaColor(row.deltaAbs))}>
                                      {pct(row.deltaPct)}
                                      <span className="ml-1.5 text-xs font-medium opacity-75">
                                        {row.deltaAbs > 0 ? "+" : ""}
                                        {row.deltaAbs.toLocaleString()}
                                      </span>
                                      {row.deltaAbs * row.bQty !== 0 && (
                                        <span className="block text-xs font-normal text-muted-foreground" title="단가 변화 × 이번 기간에 산 수량">
                                          이번 기간 {row.deltaAbs * row.bQty > 0 ? "+" : ""}
                                          {(row.deltaAbs * row.bQty).toLocaleString()}원
                                        </span>
                                      )}
                                    </td>
                                    <td className="border-b border-border px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                      {row.aQty} · {row.bQty}
                                    </td>
                                    <td className="border-b border-border px-2 text-muted-foreground">
                                      {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                                    </td>
                                  </tr>
                                  {open && (
                                    <tr>
                                      <td colSpan={6} className="border-b border-border bg-muted/60 px-4 py-3">
                                        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">명세서 날짜별 단가</p>
                                        <TrendChips trend={trends[row.key]} />
                                        <ItemLink row={row} />
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    {/* 모바일 */}
                    <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border lg:hidden">
                      {shownRows.map((row, i) => {
                        const open = expanded === row.key;
                        return (
                          <div key={row.key} className={cn(i > 0 && "border-t border-border")}>
                            <button type="button" onClick={() => toggleRow(row)} className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-muted">
                              <span className="min-w-0 flex-1">
                                <b className="block truncate text-[15px] font-semibold">
                                  {row.suspect && <span className="mr-1.5 rounded-full bg-status-ask-bg px-1.5 py-0.5 text-xs font-semibold text-status-ask">확인 필요</span>}
                                  {row.name}
                                </b>
                                <span className="mt-0.5 block text-[13px] tabular-nums text-muted-foreground">
                                  {won(row.aPrice)} → {won(row.bPrice)} · 수량 {row.aQty}·{row.bQty}
                                </span>
                              </span>
                              <span className={cn("shrink-0 text-[15px] font-bold tabular-nums", deltaColor(row.deltaAbs))}>{pct(row.deltaPct)}</span>
                            </button>
                            {open && (
                              <div className="bg-muted/60 px-4 py-3">
                                <TrendChips trend={trends[row.key]} />
                                <ItemLink row={row} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </section>
                    <p className="px-1 text-[13px] text-muted-foreground">
                      {shownRows.length}개 · 품목을 누르면 명세서 날짜별 단가가 펼쳐져요 · 빨강 = 비싸짐, 파랑 = 싸짐
                    </p>
                  </>
                )}

                {/* 새로 / 안 산 품목 */}
                {(result.newItems.length > 0 || result.droppedItems.length > 0) && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {result.newItems.length > 0 && (
                      <section className="rounded-xl bg-card p-4 ring-1 ring-border">
                        <h3 className="mb-2 text-[13px] font-semibold text-subtle-foreground">
                          B에만 있는 품목 <span className="tabular-nums text-muted-foreground">{result.newItems.length}</span>
                        </h3>
                        <ul className="max-h-64 space-y-1.5 overflow-y-auto text-[13px]">
                          {result.newItems.map((it, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span className="truncate">{it.name}</span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {won(it.bPrice)} · {it.bQty}개
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                    {result.droppedItems.length > 0 && (
                      <section className="rounded-xl bg-card p-4 ring-1 ring-border">
                        <h3 className="mb-2 text-[13px] font-semibold text-subtle-foreground">
                          A에만 있는 품목 <span className="tabular-nums text-muted-foreground">{result.droppedItems.length}</span>
                        </h3>
                        <ul className="max-h-64 space-y-1.5 overflow-y-auto text-[13px]">
                          {result.droppedItems.map((it, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span className="truncate">{it.name}</span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {won(it.aPrice)} · {it.aQty}개
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* 품목 추이 */}
            <section className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-border lg:flex-row lg:items-center">
              <div className="lg:w-60 lg:shrink-0">
                <SearchableSelect
                  value={vendorId}
                  onChange={(v) => {
                    setVendorId(v);
                    if (trendKey) loadTrend(trendKey, v);
                  }}
                  options={vendorOptions}
                  placeholder="전체 업체"
                  allowClear
                  clearLabel="전체 업체"
                  className="h-9 text-sm"
                />
              </div>
              <div className="min-w-0 flex-1">
                <SearchableSelect
                  value={trendKey}
                  onChange={(k) => loadTrend(k, vendorId)}
                  options={trendProducts.map((p) => ({ value: p.key, label: p.name, keywords: p.name }))}
                  placeholder={productsLoaded ? "품목을 찾아 고르세요" : "품목 불러오는 중…"}
                  emptyText={productsLoaded ? "명세서에 나온 품목이 없어요" : "불러오는 중…"}
                  className="h-9 text-sm"
                />
              </div>
            </section>

            {trendLoading ? (
              <ListSkeleton rows={6} />
            ) : !trendData ? (
              <div className="rounded-xl bg-card ring-1 ring-border">
                <EmptyState icon={TrendingUp} title="품목을 고르면 단가 변화를 보여 드려요" description="명세서에 적힌 날짜별 할인후 단가예요." />
              </div>
            ) : trendData.length === 0 || !trendStats ? (
              <div className="rounded-xl bg-card ring-1 ring-border">
                <EmptyState icon={TrendingUp} title="이 품목의 명세서 단가 이력이 없어요" description="업체를 비우면 모든 업체에서 찾아요." />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Kpi label="최근" value={won(trendStats.last)} />
                  <Kpi label="처음 → 최근" value={<span className={deltaColor(trendStats.chg)}>{pct(trendStats.chg)}</span>} />
                  <Kpi label="가장 쌀 때" value={won(trendStats.min)} />
                  <Kpi label="가장 비쌀 때" value={won(trendStats.max)} />
                </div>
                <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                  <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-muted-foreground">
                        <th className="w-28 border-b border-border bg-muted py-2 pl-4 font-semibold">날짜</th>
                        <th className="border-b border-border bg-muted px-3 py-2 font-semibold">업체</th>
                        <th className="w-28 border-b border-border bg-muted px-3 py-2 text-right font-semibold">단가</th>
                        <th className="w-20 border-b border-border bg-muted px-3 py-2 pr-4 text-right font-semibold">수량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trendData.map((t, i) => {
                        const prev = i > 0 ? trendData[i - 1].unitPrice : null;
                        const diff = prev != null ? t.unitPrice - prev : 0;
                        return (
                          <tr key={i}>
                            <td className="whitespace-nowrap border-b border-border py-2.5 pl-4 tabular-nums text-subtle-foreground">{t.date ?? "—"}</td>
                            <td className="truncate border-b border-border px-3 py-2.5">{t.vendorName}</td>
                            <td className="whitespace-nowrap border-b border-border px-3 py-2.5 text-right font-semibold tabular-nums">
                              {won(t.unitPrice)}
                              {diff !== 0 && <span className={cn("ml-1 text-xs", deltaColor(diff))}>{diff > 0 ? "▲" : "▼"}</span>}
                            </td>
                            <td className="border-b border-border px-3 py-2.5 pr-4 text-right tabular-nums text-muted-foreground">{t.quantity}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
                <p className="px-1 text-[13px] text-muted-foreground">▲▼ = 바로 앞 명세서보다 오름·내림</p>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
