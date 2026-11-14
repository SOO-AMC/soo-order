"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, EyeOff, FileText, Link2, Loader2, PackagePlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FilterBar, SearchField, Segmented } from "@/components/workspace/filter-bar";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { cn } from "@/lib/utils";
import { toKSTDateString } from "@/lib/utils/format";
import { bestMatchSameSpec } from "@/lib/utils/item-spec";
import {
  createStandardFromVendorProduct,
  createStandardProductForName,
  fetchHiddenItemNames,
  fetchItemCleanup,
  hideItemName,
  linkItemNames,
  unhideItemName,
  linkVendorProductToStandard,
} from "@/lib/actions/product-link-actions";
import type { HiddenItemName, ItemCleanup as ItemCleanupData, ProductLinkResult, UnlinkedItemName } from "@/lib/types/product-link";
import type { UnifiedProduct, Vendor, VendorProduct } from "@/lib/types/price-compare";

interface ItemCleanupProps {
  vendors: Vendor[];
  vendorProducts: VendorProduct[];
  unifiedProducts: UnifiedProduct[];
  /** 가격표를 다시 읽는다 (업체 품목을 연결했을 때) */
  onChange: () => void;
}

type View = "names" | "vendorProducts";
type Target = { kind: "name"; item: UnlinkedItemName } | { kind: "vp"; vp: VendorProduct };
type Conflict = { vpId: string; productId: string; productName: string; existingPrice: number | null; newPrice: number | null };

const num = (n: number) => n.toLocaleString();
const won = (n: number | null) => (n == null ? "가격 없음" : `${Math.round(n).toLocaleString()}원`);
const CATEGORIES = ["", "약품", "약국"];
/** 업체 품목 목록에 한 번에 그리는 줄 수 */
const VP_STEP = 60;

/**
 * 정리함 (관리자).
 * - 주문에 적힌 이름: 표준 품목과 연결되지 않은 이름을 많이 쓰인 순으로 보고 연결한다.
 *   연결은 "품목 매칭"에 한 줄 더하는 것이고, 같은 이름의 과거·미래 주문이 모두 묶인다. 주문은 고치지 않는다.
 * - 비교표에 없는 업체 품목: 명세서로 새로 들어와 가격 비교표에 안 보이는 품목을 표준 품목에 연결한다.
 */
export function ItemCleanup({ vendors, vendorProducts, unifiedProducts, onChange }: ItemCleanupProps) {
  const [view, setView] = useState<View>("names");
  const [data, setData] = useState<ItemCleanupData | null>(null);
  const [query, setQuery] = useState("");
  const [vpQuery, setVpQuery] = useState("");
  const [vpLimit, setVpLimit] = useState(VP_STEP);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  /** 다시 읽기 신호 */
  const [tick, setTick] = useState(0);
  /** 숨긴 이름 목록 (펼쳤을 때만 읽는다) */
  const [hidden, setHidden] = useState<HiddenItemName[] | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);

  // 대화상자 입력값
  const [pickId, setPickId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");

  // 주문 이름 목록: 처음 + 검색어가 바뀔 때(잠깐 기다렸다가) + 연결한 뒤
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      fetchItemCleanup(query)
        .then((d) => { if (active) setData(d); })
        .catch((e) => { if (active) setError(e instanceof Error ? e.message : "불러오지 못했어요."); });
    }, query ? 350 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [query, tick]);

  const productOptions = useMemo(
    () => unifiedProducts.map((p) => ({ value: p.id, label: p.notes ? `${p.name} · ${p.notes}` : p.name, keywords: p.name.replace(/\s+/g, "") })),
    [unifiedProducts],
  );
  const vendorName = useMemo(() => new Map(vendors.map((v) => [v.id, v.name] as const)), [vendors]);

  const unlinkedVps = useMemo(() => vendorProducts.filter((p) => !p.unified_product_id), [vendorProducts]);
  const shownVps = useMemo(() => {
    const q = vpQuery.trim().toLowerCase();
    const list = q ? unlinkedVps.filter((p) => p.product_name.toLowerCase().includes(q) || (vendorName.get(p.vendor_id) ?? "").toLowerCase().includes(q)) : unlinkedVps;
    return [...list].sort((a, b) => a.product_name.localeCompare(b.product_name, "ko"));
  }, [unlinkedVps, vpQuery, vendorName]);
  /** 화면에 그리는 줄에만 제안을 계산한다 (용량·포장이 다른 품목은 제안하지 않는다) */
  const visibleVps = useMemo(
    () => shownVps.slice(0, vpLimit).map((vp) => ({ vp, proposal: bestMatchSameSpec(vp.product_name, unifiedProducts, (p) => p.name, 0.6, { pack: true })?.item ?? null })),
    [shownVps, vpLimit, unifiedProducts],
  );

  const strongItems = useMemo(() => (data?.items ?? []).filter((i) => i.strong && i.proposal), [data]);

  async function run<T>(key: string, fn: () => Promise<ProductLinkResult<T>>, done: (data: T) => string | null): Promise<T | null> {
    if (busy) return null;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        return null;
      }
      const msg = done(res.data);
      if (msg) setNotice(msg);
      return res.data as T;
    } catch {
      setError("처리하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const linkName = async (item: UnlinkedItemName, productId: string, productName: string, key: string) => {
    const r = await run(key, () => linkItemNames([{ name: item.name, productId }]), () => `"${item.name}" 주문 ${num(item.count)}건을 ${productName}(으)로 묶었어요.`);
    if (r != null) {
      setTick((t) => t + 1);
      onChange();
    }
    return r != null;
  };

  const linkVp = async (vp: VendorProduct, productId: string, productName: string, key: string, mode?: "replace" | "keep") => {
    const r = await run(key, () => linkVendorProductToStandard(vp.id, productId, mode), (d) => (d.status === "linked" ? `${vp.product_name}을(를) ${productName}에 연결했어요.${d.invoiceLines ? ` 명세서 줄 ${num(d.invoiceLines)}개도 함께 연결했어요.` : ""}` : null));
    if (!r) return false;
    if (r.status === "conflict") {
      setConflict({ vpId: vp.id, productId, productName, existingPrice: r.existingPrice, newPrice: r.newPrice });
      return true;
    }
    setConflict(null);
    onChange();
    return true;
  };

  const loadHidden = () => fetchHiddenItemNames().then(setHidden).catch(() => setHidden([]));

  const hide = async (item: UnlinkedItemName) => {
    const r = await run(`h:${item.key}`, () => hideItemName(item.name), () => `"${item.name}"을(를) 정리함에서 숨겼어요. 아래 "숨긴 이름"에서 다시 보이게 할 수 있어요.`);
    if (r === null) return;
    setTick((t) => t + 1);
    if (hiddenOpen) loadHidden();
  };

  const unhide = async (h: HiddenItemName) => {
    const r = await run(`u:${h.key}`, () => unhideItemName(h.key), () => `"${h.name}"을(를) 다시 정리함에 보이게 했어요.`);
    if (r === null) return;
    setTick((t) => t + 1);
    loadHidden();
  };

  const openTarget = (t: Target) => {
    setTarget(t);
    setError("");
    setPickId(null);
    setNewName(t.kind === "name" ? t.item.name : t.vp.product_name);
    setNewCategory("");
  };

  const submitPick = async () => {
    if (!target || !pickId) return;
    const product = unifiedProducts.find((p) => p.id === pickId);
    if (!product) return;
    const done = target.kind === "name" ? await linkName(target.item, product.id, product.name, "dialog") : await linkVp(target.vp, product.id, product.name, "dialog");
    if (done) setTarget(null);
  };

  const submitCreate = async () => {
    if (!target || !newName.trim()) return;
    if (target.kind === "name") {
      const r = await run("create", () => createStandardProductForName(target.item.name, newName, newCategory), (p) => `${p.name}을(를) 표준 품목으로 등록하고 "${target.item.name}" 주문 ${num(target.item.count)}건을 묶었어요.`);
      if (r) {
        setTarget(null);
        setTick((t) => t + 1);
        onChange();
      }
    } else {
      const r = await run("create", () => createStandardFromVendorProduct(target.vp.id, newName, newCategory), () => `${newName.trim()}을(를) 표준 품목으로 등록하고 연결했어요. 가격 비교표에 나와요.`);
      if (r) {
        setTarget(null);
        onChange();
      }
    }
  };

  const pct = data && data.totalOrders > 0 ? Math.round((data.linkedOrders / data.totalOrders) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<View>
          ariaLabel="정리할 대상"
          value={view}
          onValueChange={(v) => { setView(v); setError(""); setNotice(""); setConflict(null); }}
          items={[
            { value: "names", label: `주문에 적힌 이름${data?.ready ? ` ${num(data.unlinkedNames)}` : ""}` },
            { value: "vendorProducts", label: `비교표에 없는 업체 품목 ${num(unlinkedVps.length)}` },
          ]}
        />
      </div>

      {error && !target && <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">{error}</p>}
      {notice && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-status-done-bg px-3 py-2.5 text-sm font-medium text-status-done">
          <Check className="mt-0.5 size-4 shrink-0" /> {notice}
        </p>
      )}

      {view === "names" ? (
        !data ? (
          <ListSkeleton rows={8} />
        ) : !data.ready ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState
              icon={Link2}
              title="약품 정리 기능을 켜려면 SQL 실행이 필요해요"
              description="Supabase SQL Editor 에서 supabase/migrate-product-link.sql 을 실행한 뒤 이 화면을 새로 고쳐 주세요."
            />
          </div>
        ) : (
          <>
            <p className="flex items-start gap-2 rounded-xl bg-status-doing-bg px-4 py-3 text-[13px] leading-5 text-status-doing">
              <Link2 className="mt-0.5 size-4 shrink-0" />
              <span>
                주문에 적힌 이름 {num(data.totalNames)}가지 중 <b className="font-semibold">{num(data.linkedNames)}가지</b>가 표준 품목과 묶여 있어요 (주문 {num(data.totalOrders)}건 중 {num(data.linkedOrders)}건, {pct}%). 이름을 표준 품목에 연결하면 같은 이름으로 적힌 지난 주문과 앞으로의 주문이 모두 그 품목으로 묶여요. 주문에 적힌 글자는 바뀌지 않아요.
              </span>
            </p>

            {strongItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-border">
                <Sparkles className="size-5 shrink-0 text-primary" />
                <p className="min-w-0 flex-1 text-sm">
                  <b className="font-semibold">명세서로 확인된 이름 {num(strongItems.length)}개</b>
                  <span className="text-muted-foreground"> · 주문 {num(strongItems.reduce((s, i) => s + i.count, 0))}건 · 아래 목록에서 &quot;명세서로 확인&quot; 표시가 있는 것</span>
                </p>
                <Button
                  size="sm"
                  className="h-9"
                  disabled={!!busy}
                  onClick={async () => {
                    const r = await run("bulk", () => linkItemNames(strongItems.map((i) => ({ name: i.name, productId: i.proposal!.id }))), (n) => `이름 ${num(n)}개를 표준 품목에 연결했어요.`);
                    if (r != null) {
                      setTick((t) => t + 1);
                      onChange();
                    }
                  }}
                >
                  {busy === "bulk" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} 한 번에 연결
                </Button>
              </div>
            )}

            <FilterBar>
              <SearchField id="item-cleanup-q" value={query} onChange={setQuery} placeholder="주문에 적힌 이름 검색" />
            </FilterBar>

            {data.items.length === 0 ? (
              <div className="rounded-xl bg-card ring-1 ring-border">
                <EmptyState icon={Check} title={query ? "조건에 맞는 이름이 없어요" : "정리할 이름이 없어요"} description={query ? "검색어를 바꿔 보세요." : "주문에 적힌 이름이 모두 표준 품목과 묶여 있어요."} />
              </div>
            ) : (
              <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                {data.items.map((item, i) => (
                  <div key={item.key} className={cn("grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center", i > 0 && "border-t border-border")}>
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="break-all text-[15px] font-semibold">{item.name}</span>
                        <span className="text-[13px] tabular-nums text-muted-foreground">
                          주문 {num(item.count)}건{item.lastAt ? ` · 마지막 ${toKSTDateString(item.lastAt)}` : ""}
                        </span>
                      </p>
                      {item.proposal ? (
                        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-subtle-foreground">
                          <ArrowRight className="size-3.5 shrink-0" />
                          <span className="min-w-0 break-all">{item.proposal.name}</span>
                          {item.basis === "invoice" ? (
                            <span className="flex items-center gap-1 rounded-full bg-status-done-bg px-2 py-0.5 text-xs font-semibold text-status-done">
                              <FileText className="size-3" /> 명세서로 확인 {num(item.invoiceCount)}건
                            </span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">이름이 비슷함</span>
                          )}
                        </p>
                      ) : (
                        <p className="text-[13px] text-muted-foreground">비슷한 표준 품목을 찾지 못했어요</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.proposal && (
                        <Button size="sm" className="h-8" disabled={!!busy} onClick={() => linkName(item, item.proposal!.id, item.proposal!.name, `n:${item.key}`)}>
                          {busy === `n:${item.key}` && <Loader2 className="size-4 animate-spin" />} 연결
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8" disabled={!!busy} onClick={() => openTarget({ kind: "name", item })}>
                        {item.proposal ? "다른 품목" : "품목 고르기"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-muted-foreground"
                        disabled={!!busy}
                        title="물티슈·휴지처럼 표준 품목으로 만들 필요가 없는 이름을 이 목록에서 숨겨요"
                        onClick={() => hide(item)}
                      >
                        {busy === `h:${item.key}` ? <Loader2 className="size-4 animate-spin" /> : <EyeOff className="size-4" />} 약품 아님
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            )}
            <p className="px-1 text-[13px] tabular-nums text-muted-foreground">
              {query ? `검색 결과 ${num(data.unlinkedNames)}개` : `정리할 이름 ${num(data.unlinkedNames)}개 · 주문 ${num(data.unlinkedOrders)}건`}
              {data.unlinkedNames > data.items.length ? ` · 많이 쓰인 ${num(data.items.length)}개만 보여요. 나머지는 검색해서 찾아요` : ""}
            </p>

            {data.hiddenNames > 0 && (
              <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                <button
                  type="button"
                  aria-expanded={hiddenOpen}
                  onClick={() => {
                    const next = !hiddenOpen;
                    setHiddenOpen(next);
                    if (next) loadHidden();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm"
                >
                  <EyeOff className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <b className="font-semibold">숨긴 이름 {num(data.hiddenNames)}개</b>
                    <span className="text-muted-foreground"> · 주문 {num(data.hiddenOrders)}건 · 약품이 아니라서 정리하지 않는 이름</span>
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", hiddenOpen && "rotate-180")} />
                </button>
                {hiddenOpen &&
                  (hidden == null ? (
                    <p className="border-t border-border px-4 py-3 text-[13px] text-muted-foreground">불러오는 중…</p>
                  ) : (
                    hidden.map((h) => (
                      <div key={h.key} className="flex items-center gap-2 border-t border-border px-4 py-2">
                        <span className="min-w-0 flex-1 break-all text-sm">{h.name}</span>
                        <Button size="sm" variant="ghost" className="h-8" disabled={!!busy} onClick={() => unhide(h)}>
                          {busy === `u:${h.key}` && <Loader2 className="size-4 animate-spin" />} 다시 보이기
                        </Button>
                      </div>
                    ))
                  ))}
              </section>
            )}
          </>
        )
      ) : (
        <>
          <p className="flex items-start gap-2 rounded-xl bg-status-doing-bg px-4 py-3 text-[13px] leading-5 text-status-doing">
            <PackagePlus className="mt-0.5 size-4 shrink-0" />
            <span>
              명세서로 새로 들어왔지만 표준 품목과 연결되지 않아 가격 비교표에 안 보이는 업체 품목이에요. 표준 품목에 연결하면 비교표에 그 업체 가격으로 나오고, 같은 이름의 명세서 줄도 함께 연결돼 단가 추이가 이어져요.
            </span>
          </p>
          <FilterBar>
            <SearchField id="vp-cleanup-q" value={vpQuery} onChange={(v) => { setVpQuery(v); setVpLimit(VP_STEP); }} placeholder="품목·업체 검색" />
          </FilterBar>
          {visibleVps.length === 0 ? (
            <div className="rounded-xl bg-card ring-1 ring-border">
              <EmptyState icon={Check} title={vpQuery ? "조건에 맞는 품목이 없어요" : "연결할 업체 품목이 없어요"} description={vpQuery ? "검색어를 바꿔 보세요." : "모든 업체 품목이 표준 품목과 연결돼 있어요."} />
            </div>
          ) : (
            <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
              {visibleVps.map(({ vp, proposal }, i) => (
                <div key={vp.id} className={cn("grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center", i > 0 && "border-t border-border")}>
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="break-all text-[15px] font-semibold">{vp.product_name}</span>
                      <span className="text-[13px] tabular-nums text-muted-foreground">
                        {vendorName.get(vp.vendor_id) ?? "업체 미상"} · {won(vp.unit_price)}
                      </span>
                    </p>
                    {proposal ? (
                      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-subtle-foreground">
                        <ArrowRight className="size-3.5 shrink-0" />
                        <span className="min-w-0 break-all">{proposal.name}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">이름이 비슷함</span>
                      </p>
                    ) : (
                      <p className="text-[13px] text-muted-foreground">용량·포장까지 같은 표준 품목을 찾지 못했어요</p>
                    )}
                    {conflict?.vpId === vp.id && (
                      <div className="mt-1 space-y-2 rounded-lg bg-status-ask-bg px-3 py-2.5 text-[13px]">
                        <p className="font-semibold text-status-ask">
                          이 업체는 {conflict.productName}의 가격을 이미 갖고 있어요 — 지금 {won(conflict.existingPrice)}, 이 줄은 {won(conflict.newPrice)}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" className="h-8" disabled={!!busy} onClick={() => linkVp(vp, conflict.productId, conflict.productName, `v:${vp.id}`, "replace")}>
                            {won(conflict.newPrice)}으로 바꾸기
                          </Button>
                          <Button size="sm" variant="outline" className="h-8" disabled={!!busy} onClick={() => linkVp(vp, conflict.productId, conflict.productName, `v:${vp.id}`, "keep")}>
                            {won(conflict.existingPrice)} 유지
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setConflict(null)}>취소</Button>
                        </div>
                        <p className="text-muted-foreground">어느 쪽이든 이 줄은 표준 품목의 가격 하나로 합쳐져요.</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {proposal && (
                      <Button size="sm" className="h-8" disabled={!!busy} onClick={() => linkVp(vp, proposal.id, proposal.name, `v:${vp.id}`)}>
                        {busy === `v:${vp.id}` && <Loader2 className="size-4 animate-spin" />} 연결
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8" disabled={!!busy} onClick={() => openTarget({ kind: "vp", vp })}>
                      {proposal ? "다른 품목" : "품목 고르기"}
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          )}
          {shownVps.length > visibleVps.length && (
            <Button variant="outline" className="w-full" onClick={() => setVpLimit((n) => n + VP_STEP)}>
              {num(Math.min(VP_STEP, shownVps.length - visibleVps.length))}개 더 보기 · 남은 {num(shownVps.length - visibleVps.length)}개
            </Button>
          )}
          <p className="px-1 text-[13px] tabular-nums text-muted-foreground">업체 품목 {num(shownVps.length)}개</p>
        </>
      )}

      <Dialog open={!!target} onOpenChange={(o) => { if (!o && !busy) setTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>어느 품목인가요?</DialogTitle>
            <DialogDescription>
              {target?.kind === "name"
                ? `"${target.item.name}"(으)로 적힌 주문 ${num(target.item.count)}건을 고른 표준 품목으로 묶어요.`
                : target
                  ? `${vendorName.get(target.vp.vendor_id) ?? "업체"}의 "${target.vp.product_name}"을(를) 고른 표준 품목의 가격으로 연결해요.`
                  : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <SearchableSelect value={pickId} onChange={setPickId} options={productOptions} placeholder="표준 품목 고르기" className="h-10 text-sm" />
            <Button className="w-full" onClick={submitPick} disabled={!pickId || !!busy}>
              {busy === "dialog" && <Loader2 className="size-4 animate-spin" />} 이 품목으로 연결
            </Button>
          </div>
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-[13px] font-semibold text-subtle-foreground">목록에 없으면 새 표준 품목으로 등록</p>
            <div className="flex gap-2">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="새 표준 품목 이름" className="h-10 min-w-0 flex-1" />
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                aria-label="구분"
                className="h-10 shrink-0 rounded-lg border border-input bg-card px-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c || "구분 없음"}</option>
                ))}
              </select>
            </div>
            <Button variant="outline" className="w-full" onClick={submitCreate} disabled={!newName.trim() || !!busy}>
              {busy === "create" ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />} 새 표준 품목으로 등록
            </Button>
          </div>
          {error && target && <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={!!busy}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
