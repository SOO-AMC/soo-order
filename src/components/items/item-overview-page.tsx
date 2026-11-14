"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, PackageSearch, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { cn } from "@/lib/utils";
import { toKSTDateString } from "@/lib/utils/format";
import { fetchItemOverview, searchItems } from "@/lib/actions/item-overview-action";
import type { OrderStatus } from "@/lib/types/order";
import type { ItemOverview, ItemPricePoint } from "@/lib/types/item-overview";

const won = (n: number | null) => (n == null ? "—" : `${Math.round(n).toLocaleString()}원`);
const num = (n: number) => n.toLocaleString();
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
/** 오르면 빨강, 내리면 초록 (지출 관점) */
const deltaColor = (n: number) => (n > 0 ? "text-status-late" : n < 0 ? "text-status-done" : "text-muted-foreground");

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-border">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="mt-1 text-[22px] font-extrabold leading-7 tracking-tight tabular-nums">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** 단가 추이 선 그래프. 이상값은 선에서 빼고 빈 동그라미로만 표시한다. 정확한 값은 아래 표에 있다. */
function TrendLine({ points }: { points: ItemPricePoint[] }) {
  const W = 640, H = 150, PX = 10, PY = 14;
  const good = points.filter((p) => !p.outlier && p.unitPrice > 0);
  if (good.length < 2) return null;
  const min = Math.min(...good.map((p) => p.unitPrice));
  const max = Math.max(...good.map((p) => p.unitPrice));
  const span = max - min || 1;
  const x = (i: number) => PX + (i / (points.length - 1 || 1)) * (W - PX * 2);
  const y = (v: number) => PY + (1 - (Math.min(Math.max(v, min), max) - min) / span) * (H - PY * 2);
  const path = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.outlier && p.unitPrice > 0)
    .map(({ p, i }, n) => `${n === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.unitPrice).toFixed(1)}`)
    .join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" role="img" aria-label={`단가 추이: ${won(good[0].unitPrice)}에서 ${won(good[good.length - 1].unitPrice)}`}>
        <line x1={PX} x2={W - PX} y1={y(min)} y2={y(min)} stroke="var(--border)" strokeWidth="1" />
        <line x1={PX} x2={W - PX} y1={y(max)} y2={y(max)} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) =>
          p.outlier ? (
            <circle key={i} cx={x(i)} cy={H - PY} r="4" fill="var(--card)" stroke="var(--status-ask)" strokeWidth="2">
              <title>{`${p.date ?? ""} ${won(p.unitPrice)} · 확인 필요`}</title>
            </circle>
          ) : (
            <circle key={i} cx={x(i)} cy={y(p.unitPrice)} r="4" fill="var(--primary)" stroke="var(--card)" strokeWidth="2">
              <title>{`${p.date ?? ""} ${p.vendor} ${won(p.unitPrice)}`}</title>
            </circle>
          ),
        )}
      </svg>
      <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{points[0].date ?? ""}</span>
        <span>
          {won(min)} ~ {won(max)}
        </span>
        <span>{points[points.length - 1].date ?? ""}</span>
      </div>
    </div>
  );
}

/**
 * 약품 한눈에 보기 (관리자).
 * 한 품목의 지금 가격 · 단가 추이 · 주문 이력(그때 단가)을 한 화면에 모은다.
 */
export function ItemOverviewPage({ productId, name }: { productId: string | null; name: string | null }) {
  const router = useRouter();
  const [data, setData] = useState<ItemOverview | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; notes: string }[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const hasTarget = !!(productId || name);

  useEffect(() => {
    if (!hasTarget) return;
    let active = true;
    fetchItemOverview({ productId, name })
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "불러오지 못했어요."); });
    return () => { active = false; };
  }, [productId, name, hasTarget]);

  // 품목 찾기 (입력을 잠깐 멈추면 검색)
  useEffect(() => {
    const text = q.trim();
    let active = true;
    const timer = setTimeout(() => {
      if (!text) return setResults([]);
      searchItems(text).then((r) => { if (active) setResults(r); }).catch(() => {});
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const goTo = (target: { id?: string; name?: string }) => {
    setOpen(false);
    setQ("");
    router.push(target.id ? `/items?product=${target.id}` : `/items?name=${encodeURIComponent(target.name ?? "")}`);
  };

  const stats = data?.stats ?? null;
  const minCurrent = useMemo(() => (data?.currentPrices.length ? Math.min(...data.currentPrices.map((p) => p.price)) : null), [data]);
  const trendDesc = useMemo(() => (data ? [...data.trend].reverse() : []), [data]);

  return (
    <>
      <PageHeader
        title="약품 한눈에 보기"
        description={<span className="hidden sm:inline">가격 추이와 주문 이력</span>}
        leading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
      />
      <div className="mx-auto max-w-md space-y-3 p-4 md:max-w-2xl lg:max-w-5xl lg:px-6">
        {/* 품목 찾기 */}
        <div ref={boxRef} className="relative">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) goTo(results.length === 1 ? { id: results[0].id } : { name: q.trim() });
            }}
            className="flex items-center gap-2 rounded-xl bg-card px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-primary"
          >
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="약품 이름으로 찾기 (예: 메로페넴)"
              aria-label="약품 이름으로 찾기"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
          </form>
          {open && q.trim() && (
            <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => goTo({ id: r.id })} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[15px] hover:bg-accent">
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    {r.notes && <span className="shrink-0 text-xs text-muted-foreground">{r.notes}</span>}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => goTo({ name: q.trim() })} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-primary hover:bg-accent">
                  &quot;{q.trim()}&quot;(으)로 적힌 주문 보기
                </button>
              </li>
            </ul>
          )}
        </div>

        {!hasTarget ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState icon={PackageSearch} title="약품을 찾아 보세요" description="가격이 어떻게 변했는지, 언제 얼마에 샀는지 한 화면에서 볼 수 있어요." />
          </div>
        ) : error ? (
          <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">{error}</p>
        ) : !data || !stats ? (
          <ListSkeleton rows={8} />
        ) : (
          <>
            <section className="rounded-xl bg-card p-4 ring-1 ring-border">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-all text-xl font-extrabold tracking-tight">{data.title}</h2>
                {data.product?.notes && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-subtle-foreground">{data.product.notes}</span>}
                {!data.product && <span className="rounded-full bg-status-ask-bg px-2 py-0.5 text-xs font-semibold text-status-ask">표준 품목과 연결 안 됨</span>}
              </div>
              {!data.product && (
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  이 이름과 띄어쓰기만 다른 주문만 모았어요. 가격 비교 &gt; 정리함에서 표준 품목에 연결하면 다른 이름으로 적힌 주문과 가격이 함께 보여요.
                </p>
              )}
              {data.names.length > 1 && (
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
                  <span>주문에 적힌 이름</span>
                  {data.names.slice(0, 8).map((n) => (
                    <span key={n.name} className="rounded-full bg-muted px-2 py-0.5 text-subtle-foreground">
                      {n.name} <span className="tabular-nums text-muted-foreground">{num(n.n)}</span>
                    </span>
                  ))}
                  {data.names.length > 8 && <span>외 {num(data.names.length - 8)}가지</span>}
                </p>
              )}
            </section>

            {!data.ready && (
              <p className="flex items-start gap-2 rounded-xl bg-status-ask-bg px-4 py-3 text-[13px] text-status-ask">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                주문 이력을 보려면 SQL 실행이 필요해요. Supabase SQL Editor 에서 supabase/migrate-item-history.sql 을 실행해 주세요.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="최근 단가" value={won(stats.lastPrice)} hint="명세서 기준 · 할인후" />
              <Kpi
                label="처음 → 최근"
                value={stats.changePct == null ? "—" : <span className={deltaColor(stats.changePct)}>{pct(stats.changePct)}</span>}
                hint={stats.minPrice != null ? `${won(stats.minPrice)} ~ ${won(stats.maxPrice)}` : undefined}
              />
              <Kpi label="주문" value={`${num(stats.orderCount)}번`} hint={stats.totalQuantity > 0 ? `수량 합계 ${num(stats.totalQuantity)}` : undefined} />
              <Kpi
                label="주문 간격"
                value={stats.avgIntervalDays == null ? "—" : `${stats.avgIntervalDays}일마다`}
                hint={stats.lastOrderAt ? `마지막 주문 ${toKSTDateString(stats.lastOrderAt)}` : undefined}
              />
            </div>

            {data.currentPrices.length > 0 && (
              <section className="rounded-xl bg-card p-4 ring-1 ring-border">
                <h3 className="text-[13px] font-semibold text-subtle-foreground">지금 업체별 가격 (할인후)</h3>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                  {data.currentPrices.map((p) => (
                    <li key={`${p.vendor}:${p.price}`} className={cn("flex items-baseline justify-between gap-2 rounded-lg px-3 py-2", p.price === minCurrent ? "bg-status-done-bg" : "bg-muted")}>
                      <span className="min-w-0 truncate text-sm">{p.vendor}</span>
                      <span className={cn("shrink-0 text-[15px] font-bold tabular-nums", p.price === minCurrent && "text-status-done")}>{won(p.price)}</span>
                    </li>
                  ))}
                </ul>
                {new Set(data.currentPrices.map((p) => p.vendor)).size < data.currentPrices.length && (
                  <p className="mt-2 flex items-start gap-1.5 text-[13px] text-status-ask">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    한 업체에 가격이 둘 이상 있어요. 포장이 다른 품목(예: 30T와 500T)이 한 표준 품목에 묶였을 수 있어요. 가격 비교에서 확인해 주세요.
                  </p>
                )}
              </section>
            )}

            <section className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-border">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-subtle-foreground">단가 추이 · 명세서 {num(data.trend.length)}건</h3>
                {stats.outlierCount > 0 && (
                  <span className="flex items-center gap-1 text-[13px] text-status-ask">
                    <AlertTriangle className="size-3.5" /> 확인 필요 {num(stats.outlierCount)}건은 통계에서 뺐어요
                  </span>
                )}
              </div>
              {data.trend.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">이 품목으로 확정한 명세서가 아직 없어요.</p>
              ) : (
                <>
                  <TrendLine points={data.trend} />
                  <div className="max-h-80 overflow-auto rounded-lg ring-1 ring-border">
                    <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
                      <thead className="sticky top-0">
                        <tr className="text-left text-xs font-semibold text-muted-foreground">
                          <th className="w-28 border-b border-border bg-muted py-2 pl-3 font-semibold">날짜</th>
                          <th className="border-b border-border bg-muted px-3 py-2 font-semibold">업체</th>
                          <th className="w-36 border-b border-border bg-muted px-3 py-2 text-right font-semibold">단가</th>
                          <th className="w-16 border-b border-border bg-muted px-3 py-2 text-right font-semibold">수량</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trendDesc.map((t, i) => (
                          <tr key={i} className={cn(t.outlier && "bg-status-ask-bg")}>
                            <td className="whitespace-nowrap border-b border-border py-2 pl-3 tabular-nums text-subtle-foreground">{t.date ?? "—"}</td>
                            <td className="truncate border-b border-border px-3 py-2">{t.vendor}</td>
                            <td className="whitespace-nowrap border-b border-border px-3 py-2 text-right font-semibold tabular-nums">
                              {t.outlier && <span className="mr-1.5 text-xs font-semibold text-status-ask">확인 필요</span>}
                              {won(t.unitPrice)}
                            </td>
                            <td className="border-b border-border px-3 py-2 text-right tabular-nums text-muted-foreground">{num(t.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <section className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-border">
              <h3 className="text-[13px] font-semibold text-subtle-foreground">
                주문 이력 · {num(stats.orderCount)}건{stats.orderCount > data.orders.length ? ` (최근 ${num(data.orders.length)}건만 표시)` : ""}
              </h3>
              {data.orders.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">이 품목으로 묶이는 주문이 없어요.</p>
              ) : (
                <div className="max-h-[28rem] overflow-auto rounded-lg ring-1 ring-border">
                  {data.orders.map((o, i) => (
                    <Link key={o.id} href={`/search/${o.id}`} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2.5 hover:bg-muted/60", i > 0 && "border-t border-border")}>
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13px] tabular-nums text-subtle-foreground">{toKSTDateString(o.createdAt)}</span>
                        <span className="min-w-0 truncate text-sm font-semibold">{o.itemName}</span>
                        <OrderStatusBadge status={o.status as OrderStatus} />
                      </span>
                      <span className="row-span-2 text-right">
                        <b className="block text-[15px] font-bold tabular-nums">{won(o.price)}</b>
                        {o.priceBasis && (
                          <span className={cn("text-xs", o.priceBasis === "invoice" ? "text-status-done" : "text-muted-foreground")}>
                            {o.priceBasis === "invoice" ? "명세서 단가" : `추정 · ${o.priceDate ?? ""} 명세서`}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-[13px] text-muted-foreground">
                        {o.quantity > 0 ? `${num(o.quantity)}${o.unit ? ` ${o.unit}` : ""}` : "수량 없음"}
                        {o.vendor ? ` · ${o.vendor}` : ""}
                        {o.requester ? ` · ${o.requester}` : ""}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                그때 단가: 그 주문을 검수한 명세서에 찍힌 단가예요. 명세서로 검수하지 않은 주문은 가장 가까운 날짜의 명세서 단가로 추정해요.
              </p>
            </section>
          </>
        )}
      </div>
    </>
  );
}
