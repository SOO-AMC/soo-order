"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, Check, FileText, Link2, Loader2, Merge, Pencil, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { UnderlineTabs } from "@/components/list-parts";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FilterBar, SearchField } from "@/components/workspace/filter-bar";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { cn } from "@/lib/utils";
import { toKSTDateString } from "@/lib/utils/format";
import { vendorKey } from "@/lib/utils/vendor-name";
import {
  addVendorAlias,
  autoLinkVendorNames,
  clearVendorName,
  fetchVendorDirectory,
  linkVendorName,
  linkVendorNameByInvoice,
  mergeVendors,
  registerVendor,
  removeVendorAlias,
  renameVendor,
} from "@/lib/actions/vendor-actions";
import type { UnlinkedName, VendorActionResult, VendorDirectory, VendorEntry } from "@/lib/types/vendor";

type Tab = "cleanup" | "vendors";
type DialogState =
  | { kind: "link"; item: UnlinkedName }
  | { kind: "rename"; vendor: VendorEntry }
  | { kind: "alias"; vendor: VendorEntry }
  | { kind: "merge"; vendor: VendorEntry }
  | null;

const num = (n: number) => n.toLocaleString();

/** 앞뒤 공백까지 보이게 이름을 그린다 (" vs팜" 같은 이름을 구분하려고) */
function RawName({ name }: { name: string }) {
  return <span className="whitespace-pre-wrap break-all rounded bg-muted px-1.5 py-0.5 text-[15px] font-semibold">{name}</span>;
}

/**
 * 업체 관리 (관리자).
 * - 정리할 이름: 주문에 적혀 있지만 등록된 업체 이름이 아닌 글자를 업체에 연결한다.
 * - 업체 목록: 업체의 다른 이름·이름 바꾸기·합치기.
 */
export function VendorAdminPage() {
  const [dir, setDir] = useState<VendorDirectory | null>(null);
  const [tab, setTab] = useState<Tab>("cleanup");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  /** "업체 아님"은 두 번 눌러야 실행 */
  const [confirmClear, setConfirmClear] = useState<string | null>(null);

  // 대화상자 입력값
  const [pickId, setPickId] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [text, setText] = useState("");

  useEffect(() => {
    let active = true;
    fetchVendorDirectory()
      .then((d) => { if (active) setDir(d); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "불러오지 못했어요."); });
    return () => { active = false; };
  }, []);

  const reload = async () => {
    try {
      setDir(await fetchVendorDirectory());
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요.");
    }
  };

  /** 버튼 하나 실행: 처리 → 결과 문구 → 목록 다시 읽기 */
  async function run<T>(key: string, fn: () => Promise<VendorActionResult<T>>, done: (data: T) => string): Promise<boolean> {
    if (busy) return false;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      setNotice(done(res.data));
      await reload();
      return true;
    } catch {
      setError("처리하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const vendors = useMemo(() => dir?.vendors ?? [], [dir]);
  const unlinked = useMemo(() => dir?.unlinked ?? [], [dir]);
  const vendorOptions = useMemo(
    () => vendors.map((v) => ({ value: v.id, label: v.name, keywords: v.aliases.map((a) => a.alias).join(" ") })),
    [vendors],
  );
  const autoItems = useMemo(() => unlinked.filter((u) => u.autoTarget), [unlinked]);
  const autoOrders = autoItems.reduce((s, u) => s + u.count, 0);

  const q = query.trim().toLowerCase();
  const shownUnlinked = useMemo(() => (q ? unlinked.filter((u) => u.name.toLowerCase().includes(q)) : unlinked), [unlinked, q]);
  const shownVendors = useMemo(
    () => (q ? vendors.filter((v) => v.name.toLowerCase().includes(q) || v.aliases.some((a) => a.alias.toLowerCase().includes(q))) : vendors),
    [vendors, q],
  );

  const openDialog = (d: DialogState) => {
    setDialog(d);
    setError("");
    if (d?.kind === "link") {
      setPickId(d.item.invoiceVendor?.id ?? d.item.suggestions[0]?.id ?? null);
      setRemember(!d.item.ownHospital);
    } else {
      setPickId(null);
    }
    setText(d?.kind === "rename" ? d.vendor.name : "");
  };

  const submitDialog = async () => {
    if (!dialog) return;
    let done = false;
    if (dialog.kind === "link") {
      if (!pickId) return;
      const target = vendors.find((v) => v.id === pickId);
      done = await run("dialog", () => linkVendorName(dialog.item.name, pickId, remember), (n) => `주문 ${num(n)}건을 ${target?.name ?? "고른 업체"}(으)로 정리했어요.`);
    } else if (dialog.kind === "rename") {
      done = await run("dialog", () => renameVendor(dialog.vendor.id, text), (n) => `이름을 바꿨어요. 주문 ${num(n)}건도 함께 바뀌었어요.`);
    } else if (dialog.kind === "alias") {
      done = await run("dialog", () => addVendorAlias(dialog.vendor.id, text), () => `"${text.trim()}"(이)라고 적혀도 ${dialog.vendor.name}(으)로 맞춰요.`);
    } else if (dialog.kind === "merge") {
      if (!pickId) return;
      const target = vendors.find((v) => v.id === pickId);
      done = await run("dialog", () => mergeVendors(dialog.vendor.id, pickId), (r) => `${dialog.vendor.name}을(를) ${target?.name ?? ""}에 합쳤어요. 주문 ${num(r.orders)}건 · 명세서 ${num(r.invoices)}장을 옮겼어요.`);
    }
    if (done) setDialog(null);
  };

  const header = (
    <PageHeader
      title="업체 관리"
      description={<span className="hidden sm:inline">업체 이름을 하나로 맞춰요</span>}
      leading={
        <div className="lg:hidden">
          <BackButton fallbackHref="/more" />
        </div>
      }
      tabs={
        dir?.ready ? (
          <UnderlineTabs<Tab>
            ariaLabel="보기"
            value={tab}
            onValueChange={(t) => { setTab(t); setQuery(""); setConfirmClear(null); }}
            items={[
              { value: "cleanup", label: "정리할 이름", count: unlinked.length },
              { value: "vendors", label: "업체 목록", count: vendors.length },
            ]}
          />
        ) : undefined
      }
    />
  );

  if (!dir) {
    return (
      <>
        {header}
        <div className="mx-auto max-w-md p-4 md:max-w-2xl lg:max-w-5xl lg:px-6">
          {error ? <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">{error}</p> : <ListSkeleton rows={8} />}
        </div>
      </>
    );
  }

  if (!dir.ready) {
    return (
      <>
        {header}
        <div className="mx-auto max-w-md p-4 md:max-w-2xl lg:max-w-5xl lg:px-6">
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState
              icon={Building2}
              title="업체 정리 기능을 켜려면 SQL 실행이 필요해요"
              description="Supabase SQL Editor 에서 supabase/migrate-vendor-unify.sql 을 실행한 뒤 이 화면을 새로 고쳐 주세요."
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="mx-auto max-w-md space-y-3 p-4 md:max-w-2xl lg:max-w-5xl lg:px-6">
        {error && <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">{error}</p>}
        {notice && (
          <p role="status" className="flex items-start gap-2 rounded-lg bg-status-done-bg px-3 py-2.5 text-sm font-medium text-status-done">
            <Check className="mt-0.5 size-4 shrink-0" /> {notice}
          </p>
        )}

        {tab === "cleanup" ? (
          <>
            <p className="flex items-start gap-2 rounded-xl bg-status-doing-bg px-4 py-3 text-[13px] leading-5 text-status-doing">
              <Link2 className="mt-0.5 size-4 shrink-0" />
              <span>
                주문에 적혀 있지만 등록된 업체 이름과 다른 글자예요. 업체에 연결하면 그 이름의 주문이 모두 업체의 표준 이름으로 바뀌어요. 원래 적혀 있던 글자는 따로 보관하고, 주문의 수정 날짜는 바뀌지 않아요.
              </span>
            </p>

            {autoItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-border">
                <Sparkles className="size-5 shrink-0 text-primary" />
                <p className="min-w-0 flex-1 text-sm">
                  <b className="font-semibold">(주)·띄어쓰기만 다른 이름 {num(autoItems.length)}개</b>
                  <span className="text-muted-foreground"> · 주문 {num(autoOrders)}건</span>
                </p>
                <Button
                  size="sm"
                  className="h-9"
                  disabled={!!busy}
                  onClick={() => run("auto", autoLinkVendorNames, (r) => `이름 ${num(r.names)}개, 주문 ${num(r.orders)}건을 정리했어요.`)}
                >
                  {busy === "auto" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} 한 번에 정리
                </Button>
              </div>
            )}

            <FilterBar>
              <SearchField id="vendor-cleanup-q" value={query} onChange={setQuery} placeholder="적힌 이름 검색" />
            </FilterBar>

            {shownUnlinked.length === 0 ? (
              <div className="rounded-xl bg-card ring-1 ring-border">
                <EmptyState
                  icon={Check}
                  title={unlinked.length === 0 ? "정리할 이름이 없어요" : "조건에 맞는 이름이 없어요"}
                  description={unlinked.length === 0 ? "주문에 적힌 업체 이름이 모두 등록된 업체와 같아요." : "검색어를 바꿔 보세요."}
                />
              </div>
            ) : (
              <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                {shownUnlinked.map((u, i) => {
                  const canRegister = !u.ownHospital && !u.autoTarget && vendorKey(u.name).length >= 2;
                  return (
                    <div key={u.name} className={cn("grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center", i > 0 && "border-t border-border")}>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <RawName name={u.name} />
                          {u.autoTarget && (
                            <span className="flex items-center gap-1 text-[13px] text-subtle-foreground">
                              <ArrowRight className="size-3.5" /> {u.autoTarget.name} <span className="text-muted-foreground">(표기만 다름)</span>
                            </span>
                          )}
                          {u.ownHospital && <span className="rounded-full bg-status-ask-bg px-2 py-0.5 text-xs font-semibold text-status-ask">우리 병원 이름으로 보여요</span>}
                        </div>
                        <p className="text-[13px] tabular-nums text-muted-foreground">
                          주문 {num(u.count)}건{u.lastAt ? ` · 마지막 ${toKSTDateString(u.lastAt)}` : ""}
                          {u.invoiceCount > 0 && u.invoiceVendor ? ` · 명세서로 확인된 업체 ${u.invoiceVendor.name} (${num(u.invoiceCount)}건)` : ""}
                          {!u.autoTarget && u.suggestions.length > 0 ? ` · 비슷한 업체 ${u.suggestions.map((s) => s.name).join(", ")}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {u.autoTarget ? (
                          <Button
                            size="sm"
                            className="h-8"
                            disabled={!!busy}
                            onClick={() => run(`a:${u.name}`, () => linkVendorName(u.name, u.autoTarget!.id, false), (n) => `주문 ${num(n)}건을 ${u.autoTarget!.name}(으)로 정리했어요.`)}
                          >
                            {busy === `a:${u.name}` && <Loader2 className="size-4 animate-spin" />} 정리
                          </Button>
                        ) : (
                          <>
                            {u.invoiceCount > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={!!busy}
                                title="명세서로 만들어지거나 검수된 주문은 그 명세서의 업체로 고쳐요"
                                onClick={() => run(`i:${u.name}`, () => linkVendorNameByInvoice(u.name), (n) => `명세서와 연결된 주문 ${num(n)}건을 명세서의 업체로 정리했어요.`)}
                              >
                                {busy === `i:${u.name}` ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} 명세서 기준 {num(u.invoiceCount)}건
                              </Button>
                            )}
                            <Button size="sm" className="h-8" disabled={!!busy} onClick={() => openDialog({ kind: "link", item: u })}>
                              업체 고르기
                            </Button>
                            {canRegister && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={!!busy}
                                onClick={() => run(`r:${u.name}`, () => registerVendor(u.name), (v) => (v.existed ? `이미 있는 업체 ${v.name}(으)로 연결했어요.` : `${v.name}을(를) 새 업체로 등록했어요.`))}
                              >
                                {busy === `r:${u.name}` ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} 새 업체로
                              </Button>
                            )}
                          </>
                        )}
                        {confirmClear === u.name ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-status-late text-status-late"
                              disabled={!!busy}
                              onClick={async () => {
                                await run(`c:${u.name}`, () => clearVendorName(u.name), (n) => `주문 ${num(n)}건을 "업체 없음"으로 정리했어요.`);
                                setConfirmClear(null);
                              }}
                            >
                              {num(u.count)}건 업체 없음으로
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => setConfirmClear(null)}>취소</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" disabled={!!busy} onClick={() => setConfirmClear(u.name)}>
                            업체 아님
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
            {shownUnlinked.length > 0 && (
              <p className="px-1 text-[13px] tabular-nums text-muted-foreground">
                이름 {num(shownUnlinked.length)}개 · 주문 {num(shownUnlinked.reduce((s, u) => s + u.count, 0))}건
              </p>
            )}
          </>
        ) : (
          <>
            <FilterBar>
              <SearchField id="vendor-q" value={query} onChange={setQuery} placeholder="업체 이름·다른 이름 검색" />
            </FilterBar>
            <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
              {shownVendors.length === 0 ? (
                <EmptyState icon={Building2} title="조건에 맞는 업체가 없어요" description="검색어를 바꿔 보세요." />
              ) : (
                shownVendors.map((v, i) => (
                  <div key={v.id} className={cn("grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center", i > 0 && "border-t border-border")}>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold">{v.name}</span>
                        {v.showInCompare && <span className="rounded-full bg-status-doing-bg px-2 py-0.5 text-xs font-semibold text-status-doing">가격 비교표</span>}
                        <span className="text-[13px] tabular-nums text-muted-foreground">
                          주문 {num(v.orderCount)}건 · 명세서 {num(v.invoiceCount)}장
                        </span>
                      </div>
                      {v.aliases.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">다른 이름</span>
                          {v.aliases.map((a) => (
                            <span key={a.id} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-[13px]">
                              {a.alias}
                              <button
                                type="button"
                                aria-label={`${a.alias} 지우기`}
                                disabled={!!busy}
                                onClick={() => run(`x:${a.id}`, () => removeVendorAlias(a.id), () => `"${a.alias}"을(를) 다른 이름에서 지웠어요.`)}
                                className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-status-late"
                              >
                                <X className="size-3.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-8" disabled={!!busy} onClick={() => openDialog({ kind: "alias", vendor: v })}>
                        <Plus className="size-4" /> 다른 이름
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" disabled={!!busy} onClick={() => openDialog({ kind: "rename", vendor: v })}>
                        <Pencil className="size-4" /> 이름 바꾸기
                      </Button>
                      {!v.showInCompare && (
                        <Button size="sm" variant="ghost" className="h-8" disabled={!!busy} onClick={() => openDialog({ kind: "merge", vendor: v })}>
                          <Merge className="size-4" /> 합치기
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </section>
            <p className="px-1 text-[13px] text-muted-foreground">
              가격 비교표에 나오는 업체는 다른 업체를 이쪽으로 합칠 수만 있어요. 새 업체는 발주할 때나 &quot;정리할 이름&quot;에서 등록해요.
            </p>
          </>
        )}
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o && busy !== "dialog") setDialog(null); }}>
        <DialogContent className="max-w-md">
          {dialog?.kind === "link" && (
            <>
              <DialogHeader>
                <DialogTitle>어느 업체인가요?</DialogTitle>
                <DialogDescription>
                  <RawName name={dialog.item.name} /> (으)로 적힌 주문 {num(dialog.item.count)}건을 고른 업체의 이름으로 바꿔요.
                </DialogDescription>
              </DialogHeader>
              <SearchableSelect value={pickId} onChange={setPickId} options={vendorOptions} placeholder="업체 고르기" className="h-10 text-sm" />
              {dialog.item.suggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <span className="text-muted-foreground">비슷한 업체</span>
                  {dialog.item.suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setPickId(s.id)}
                      className={cn("rounded-full px-2.5 py-1 font-semibold", pickId === s.id ? "bg-primary text-primary-foreground" : "bg-muted text-subtle-foreground")}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              <label className="flex items-start gap-2.5 rounded-lg bg-muted px-3 py-2.5 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>
                  앞으로도 이 이름은 자동으로 이 업체로 맞추기
                  {dialog.item.ownHospital && (
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">우리 병원 이름으로 보여서 꺼 두었어요. 여러 업체의 명세서에서 나올 수 있는 글자예요.</span>
                  )}
                </span>
              </label>
            </>
          )}
          {dialog?.kind === "rename" && (
            <>
              <DialogHeader>
                <DialogTitle>업체 이름 바꾸기</DialogTitle>
                <DialogDescription>
                  이 이름으로 적힌 주문 {num(dialog.vendor.orderCount)}건도 함께 바뀌어요. 옛 이름으로 적어도 새 이름으로 맞춰 줘요.
                </DialogDescription>
              </DialogHeader>
              <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitDialog(); }} className="h-10" />
            </>
          )}
          {dialog?.kind === "alias" && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.vendor.name}의 다른 이름</DialogTitle>
                <DialogDescription>명세서나 주문에 이 이름으로 적혀도 {dialog.vendor.name}(으)로 맞춰요. (주)·띄어쓰기 차이는 이미 자동으로 같은 업체로 봐요.</DialogDescription>
              </DialogHeader>
              <Input autoFocus placeholder="예: 브이에스팜" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitDialog(); }} className="h-10" />
            </>
          )}
          {dialog?.kind === "merge" && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.vendor.name} 합치기</DialogTitle>
                <DialogDescription>
                  {dialog.vendor.name}의 주문 {num(dialog.vendor.orderCount)}건 · 명세서 {num(dialog.vendor.invoiceCount)}장을 고른 업체로 옮기고, {dialog.vendor.name}은(는) 목록에서 없어져요. 되돌릴 수 없어요.
                </DialogDescription>
              </DialogHeader>
              <SearchableSelect
                value={pickId}
                onChange={setPickId}
                options={vendorOptions.filter((o) => o.value !== dialog.vendor.id)}
                placeholder="남길 업체 고르기"
                className="h-10 text-sm"
              />
            </>
          )}
          {error && dialog && <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy === "dialog"}>취소</Button>
            <Button
              onClick={submitDialog}
              disabled={busy === "dialog" || ((dialog?.kind === "link" || dialog?.kind === "merge") && !pickId) || ((dialog?.kind === "rename" || dialog?.kind === "alias") && !text.trim())}
            >
              {busy === "dialog" && <Loader2 className="size-4 animate-spin" />}
              {dialog?.kind === "merge" ? "합치기" : dialog?.kind === "link" ? "이 업체로 정리" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
