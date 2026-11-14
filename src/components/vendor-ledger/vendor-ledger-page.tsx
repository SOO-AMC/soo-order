"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookText, Download, ExternalLink, FileText, Loader2, Search } from "lucide-react";
import type ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/client";
import { fetchVendorLedger, fetchInvoiceDocs, getInvoiceFileUrl, mergeInvoicePdfs } from "@/lib/actions/vendor-ledger-action";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { UnderlineTabs } from "@/components/list-parts";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FilterBar, SearchField } from "@/components/workspace/filter-bar";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { PeriodPicker } from "@/components/workspace/period-picker";
import { kstToday, presetRange, rangeText, type DateRange } from "@/lib/utils/period";
import type { LedgerRow, InvoiceDoc } from "@/lib/types/invoice";

const won = (n: number) => `${Math.round(n).toLocaleString()}원`;
const num = (n: number) => Math.round(n).toLocaleString();

/** 월별 합계(첫 화면) · 거래 내역 · 명세서 원본 */
type LedgerView = "monthly" | "lines" | "docs";

/** 거래 내역 표에 한 번에 그리는 줄 수 */
const LINE_STEP = 300;

/**
 * 거래처원장 (관리자). 업체·기간 → 조회 → 요약 숫자 + 거래 내역 표 / 명세서 원본.
 * 엑셀(업체별 시트), 원본 PDF 합치기(한 업체)·업체별 ZIP(여러 업체, form POST 다운로드)은 예전 그대로.
 */
export function VendorLedgerPage() {
  const supabase = createClient();
  const [today] = useState(kstToday);

  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("vendor"),
  );
  const [range, setRange] = useState<DateRange>(() => presetRange("thisMonth", kstToday()));
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [docs, setDocs] = useState<InvoiceDoc[] | null>(null);
  /** 마지막으로 조회한 조건(결과 위에 표시) */
  const [queried, setQueried] = useState<{ vendor: string; range: DateRange } | null>(null);
  const [view, setView] = useState<LedgerView>("monthly");
  const [lineQuery, setLineQuery] = useState("");
  /** 한 번에 그리는 줄 수. 합계는 항상 전체 줄로 계산하고, 표만 나눠 그린다 (수천 줄을 한꺼번에 그리면 느려짐) */
  const [lineLimit, setLineLimit] = useState(LINE_STEP);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("vendors")
      .select("id, name")
      .order("name")
      .then(({ data }) => setVendors((data as { id: string; name: string }[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 처음 열면 이번 달을 바로 보여 준다 (빈 화면에서 조회 버튼을 찾지 않게)
  useEffect(() => {
    let active = true;
    const first = presetRange("thisMonth", kstToday());
    const opts = { vendorId: null, start: first.start || null, end: first.end || null };
    Promise.all([fetchVendorLedger(opts), fetchInvoiceDocs(opts)])
      .then(([lines, docList]) => {
        if (!active) return;
        setRows(lines);
        setDocs(docList);
        setQueried({ vendor: "전체 업체", range: first });
      })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "조회하지 못했어요. 잠시 뒤 다시 눌러 주세요."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const vendorLabel = (id: string | null) => (id ? vendors.find((v) => v.id === id)?.name ?? "업체" : "전체 업체");

  const totals = useMemo(() => {
    if (!rows) return { count: 0, qty: 0, amount: 0, invoices: 0 };
    const inv = new Set(rows.map((r) => r.invoiceId));
    return rows.reduce(
      (acc, r) => ({ ...acc, count: acc.count + 1, qty: acc.qty + r.quantity, amount: acc.amount + r.amount }),
      { count: 0, qty: 0, amount: 0, invoices: inv.size },
    );
  }, [rows]);

  /** 여러 업체일 때 업체별 합계(금액 큰 순) */
  const byVendor = useMemo(() => {
    if (!rows) return [];
    const m = new Map<string, { name: string; amount: number; count: number }>();
    for (const r of rows) {
      const k = r.vendorName || "(미지정)";
      const cur = m.get(k) ?? { name: k, amount: 0, count: 0 };
      cur.amount += r.amount;
      cur.count += 1;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [rows]);

  /** 월별 × 업체별 지급액 (세금계산서·입금 대조용). 업체는 금액 큰 순 */
  const monthly = useMemo(() => {
    const months = new Set<string>();
    const byVendorMonth = new Map<string, Map<string, number>>();
    for (const r of rows ?? []) {
      const m = r.invoiceDate ? r.invoiceDate.slice(0, 7) : "날짜 없음";
      const v = r.vendorName || "(미지정)";
      months.add(m);
      const row = byVendorMonth.get(v) ?? new Map<string, number>();
      row.set(m, (row.get(m) ?? 0) + r.amount);
      byVendorMonth.set(v, row);
    }
    const monthList = [...months].sort();
    const vendorRows = [...byVendorMonth.entries()]
      .map(([vendor, cells]) => ({ vendor, cells, total: [...cells.values()].reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);
    const monthTotals = new Map(monthList.map((m) => [m, vendorRows.reduce((sum, v) => sum + (v.cells.get(m) ?? 0), 0)] as const));
    return { months: monthList, vendors: vendorRows, monthTotals };
  }, [rows]);

  /** 같은 업체·같은 날짜·같은 금액의 명세서가 둘 이상 → 두 번 올렸을 수 있다 */
  const duplicateIds = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const d of docs ?? []) {
      if (!d.invoiceDate || !d.totalAmount) continue;
      const key = `${d.vendorName}|${d.invoiceDate}|${Math.round(d.totalAmount)}`;
      groups.set(key, [...(groups.get(key) ?? []), d.id]);
    }
    return new Set([...groups.values()].filter((ids) => ids.length > 1).flat());
  }, [docs]);

  const shownRows = useMemo(() => {
    if (!rows) return [];
    const q = lineQuery.trim().toLowerCase();
    return q ? rows.filter((r) => r.itemName.toLowerCase().includes(q) || r.vendorName.toLowerCase().includes(q)) : rows;
  }, [rows, lineQuery]);
  const visibleRows = useMemo(() => shownRows.slice(0, lineLimit), [shownRows, lineLimit]);

  /** 조회. vendorOverride 를 주면 그 업체로 바로 조회한다 (월별 합계에서 업체를 눌렀을 때) */
  const handleSearch = async (vendorOverride?: string | null) => {
    const vid = vendorOverride === undefined ? vendorId : vendorOverride;
    setLoading(true);
    setError("");
    try {
      const opts = { vendorId: vid, start: range.start || null, end: range.end || null };
      const [lines, docList] = await Promise.all([fetchVendorLedger(opts), fetchInvoiceDocs(opts)]);
      setRows(lines);
      setDocs(docList);
      setQueried({ vendor: vendorLabel(vid), range });
      setLineQuery("");
      setLineLimit(LINE_STEP);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setLoading(false);
    }
  };

  const openFile = async (path: string) => {
    setOpeningPath(path);
    try {
      const url = await getInvoiceFileUrl(path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setError("원본 파일을 열 수 없어요.");
    } catch {
      setError("원본 파일을 여는 중 문제가 생겼어요.");
    } finally {
      setOpeningPath(null);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    // 일부 브라우저(특히 Firefox)는 anchor가 DOM에 있어야 click을 받음.
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // click 직후 revoke하면 큰 blob의 다운로드가 시작 전에 URL이 사라져 실패한다.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const periodLabel = () => {
    const r = queried?.range ?? range;
    return r.start || r.end ? `${r.start || "처음"}~${r.end || "끝"}` : "전체기간";
  };

  // 거래내역 엑셀 — 업체명별 시트로 나눠 한 파일
  const handleExport = async () => {
    if (!rows || rows.length === 0) return;
    const { default: ExcelJSModule } = await import("exceljs");
    const wb = new ExcelJSModule.Workbook();
    const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F7" } };

    const groups = new Map<string, LedgerRow[]>();
    for (const r of rows) {
      const k = r.vendorName || "(미지정)";
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }

    const used = new Set<string>();
    const safeSheet = (name: string) => {
      const base = (name || "미지정").replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "미지정";
      let n = base;
      let i = 2;
      while (used.has(n)) n = `${base.slice(0, 26)} ${i++}`;
      used.add(n);
      return n;
    };

    for (const [vname, list] of groups) {
      const ws = wb.addWorksheet(safeSheet(vname));
      ws.columns = [
        { header: "거래일자", key: "date", width: 14 },
        { header: "품목", key: "item", width: 32 },
        { header: "수량", key: "qty", width: 8 },
        { header: "단가", key: "unit", width: 12 },
        { header: "금액", key: "amount", width: 14 },
      ];
      ws.getRow(1).eachCell((c) => {
        c.font = { bold: true };
        c.fill = headerFill;
      });
      let qSum = 0;
      let aSum = 0;
      for (const r of list) {
        ws.addRow({ date: r.invoiceDate ?? "", item: r.itemName, qty: r.quantity, unit: r.unitPrice, amount: r.amount });
        qSum += r.quantity;
        aSum += r.amount;
      }
      ws.addRow({});
      ws.addRow({ item: "합계", qty: qSum, amount: aSum }).font = { bold: true };
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    triggerDownload(blob, `거래처원장_${queried?.vendor ?? vendorLabel(vendorId)}_${today}.xlsx`);
  };

  // 명세서 원본 — 업체명별 그룹
  const groupDocsByVendor = (list: InvoiceDoc[]) => {
    const m = new Map<string, InvoiceDoc[]>();
    for (const d of list) {
      const k = d.vendorName || "(미지정)";
      const arr = m.get(k) ?? [];
      arr.push(d);
      m.set(k, arr);
    }
    return m;
  };

  const buildVendorPdf = async (list: InvoiceDoc[]): Promise<Uint8Array | null> => {
    // 날짜 오름차순(오래된 것 → 최신)으로 정렬 후 병합
    const sorted = [...list].sort((a, b) => (a.invoiceDate ?? "").localeCompare(b.invoiceDate ?? ""));
    const paths = sorted.flatMap((d) => d.imagePaths);
    if (paths.length === 0) return null;
    const b64 = await mergeInvoicePdfs(paths);
    if (!b64) return null;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return bytes.length > 0 ? bytes : null;
  };

  // 단일 업체면 합친 PDF 새 탭, 여러 업체면 업체별 PDF를 ZIP로 다운로드
  const handleMergeDocs = async () => {
    if (!docs || docs.length === 0) return;
    setMerging(true);
    setError("");
    try {
      const groups = groupDocsByVendor(docs);
      if (groups.size <= 1) {
        const [, list] = [...groups][0];
        const bytes = await buildVendorPdf(list);
        if (!bytes) {
          setError("합칠 수 있는 원본 파일이 없어요.");
          return;
        }
        const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
        window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
      } else {
        // fetch+blob은 대용량(수백 MB)에서 메모리·연결 끊김이 잦다 → form POST + target=_blank로 브라우저 다운로드
        const docIds = docs.map((d) => d.id);
        const filename = `명세서원본_전체_${periodLabel()}.zip`;
        const form = document.createElement("form");
        form.method = "POST";
        form.action = "/api/vendor-ledger-zip";
        form.target = "_blank";
        form.style.display = "none";
        const idsInput = document.createElement("input");
        idsInput.type = "hidden";
        idsInput.name = "docIds";
        idsInput.value = JSON.stringify(docIds);
        form.appendChild(idsInput);
        const nameInput = document.createElement("input");
        nameInput.type = "hidden";
        nameInput.name = "filename";
        nameInput.value = filename;
        form.appendChild(nameInput);
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
      }
    } catch (e) {
      console.error("[vendor-ledger] 원본 병합/다운로드 오류:", e);
      setError(e instanceof Error ? e.message : "원본을 합치는 중 문제가 생겼어요.");
    } finally {
      setMerging(false);
    }
  };

  const hasResult = !!rows && !!docs;
  const multiVendor = byVendor.length > 1;

  return (
    <>
      <PageHeader
        title="거래처원장"
        description={<span className="hidden sm:inline">업체·기간별 명세서 거래</span>}
        leading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
        tabs={
          hasResult ? (
            <UnderlineTabs<LedgerView>
              ariaLabel="보기"
              value={view}
              onValueChange={setView}
              items={[
                { value: "monthly", label: "월별 합계" },
                { value: "lines", label: "거래 내역", count: rows?.length },
                { value: "docs", label: duplicateIds.size > 0 ? `명세서 원본 · 중복 의심 ${duplicateIds.size}` : "명세서 원본", count: docs?.length },
              ]}
            />
          ) : undefined
        }
      />

      <div className="mx-auto max-w-md space-y-3 p-4 md:max-w-2xl lg:max-w-6xl lg:px-6">
        {/* 조회 조건 */}
        <section className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-border lg:flex-row lg:items-center">
          <div className="lg:w-60 lg:shrink-0">
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
          <div className="min-w-0 flex-1">
            <PeriodPicker value={range} onChange={setRange} today={today} idPrefix="ledger" />
          </div>
          <Button onClick={() => handleSearch()} disabled={loading} className="h-9 shrink-0 rounded-lg px-4">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {loading ? "조회하는 중…" : "조회"}
          </Button>
        </section>

        {error && (
          <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
            {error}
          </p>
        )}

        {loading ? (
          <ListSkeleton rows={8} />
        ) : !hasResult ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState
              icon={BookText}
              title="업체와 기간을 고르고 조회해 주세요"
              description="명세서로 확정된 거래만 나와요. 업체를 비우면 모든 업체를 한 번에 봐요."
            />
          </div>
        ) : (
          <>
            {/* 요약 */}
            <section className="rounded-xl bg-card p-5 ring-1 ring-border">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] text-muted-foreground">
                    {queried?.vendor} · {queried ? rangeText(queried.range) : ""}
                  </p>
                  <p className="mt-1 text-[28px] font-extrabold leading-9 tracking-tight tabular-nums">{won(totals.amount)}</p>
                  <p className="mt-0.5 text-[13px] tabular-nums text-subtle-foreground">
                    명세서 {totals.invoices}장 · 거래 {totals.count}줄 · 수량 {num(totals.qty)}
                  </p>
                </div>
                {view !== "docs" ? (
                  <Button variant="outline" className="h-9 rounded-lg" onClick={handleExport} disabled={!rows || rows.length === 0}>
                    <Download className="size-4" /> 엑셀
                  </Button>
                ) : (
                  <Button variant="outline" className="h-9 rounded-lg" onClick={handleMergeDocs} disabled={merging || !docs || docs.length === 0}>
                    {merging ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                    {merging ? "만드는 중…" : docs && groupDocsByVendor(docs).size <= 1 ? "한 PDF로 보기" : "업체별 PDF · ZIP"}
                  </Button>
                )}
              </div>

              {multiVendor && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">업체별 합계</p>
                  <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {byVendor.slice(0, 9).map((v) => (
                      <li key={v.name} className="flex min-w-0 items-baseline justify-between gap-2 text-[13px]">
                        <span className="min-w-0 truncate">{v.name}</span>
                        <span className="shrink-0 tabular-nums">
                          <b className="font-semibold">{won(v.amount)}</b>
                          <span className="ml-1.5 text-muted-foreground">{v.count}줄</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {byVendor.length > 9 && <p className="mt-1.5 text-xs text-muted-foreground">외 {byVendor.length - 9}곳</p>}
                </div>
              )}
            </section>

            {view === "monthly" ? (
              rows!.length === 0 ? (
                <div className="rounded-xl bg-card ring-1 ring-border">
                  <EmptyState icon={BookText} title="이 조건의 거래가 없어요" description="기간을 넓히거나 업체를 바꿔 보세요." />
                </div>
              ) : (
                <>
                  <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                    <div className="max-h-[calc(100dvh-22rem)] min-h-[14rem] overflow-auto">
                      <table className="w-full border-separate border-spacing-0 text-[13px]">
                        <thead className="sticky top-0 z-10">
                          <tr className="text-xs font-semibold text-muted-foreground">
                            <th className="sticky left-0 z-10 min-w-[10rem] border-b border-border bg-muted py-2 pl-4 pr-3 text-left font-semibold">업체</th>
                            {monthly.months.map((m) => (
                              <th key={m} className="whitespace-nowrap border-b border-border bg-muted px-3 py-2 text-right font-semibold tabular-nums">{m}</th>
                            ))}
                            <th className="whitespace-nowrap border-b border-border bg-muted px-3 py-2 pr-4 text-right font-semibold">합계</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthly.vendors.map((v) => (
                            <tr key={v.vendor} className="hover:bg-muted/60">
                              <td className="sticky left-0 border-b border-border bg-card py-2 pl-4 pr-3 text-sm font-medium">
                                <button
                                  type="button"
                                  title={`${v.vendor}의 거래 내역 보기`}
                                  className="text-left hover:text-primary hover:underline"
                                  onClick={() => {
                                    // 등록된 업체면 그 업체만 다시 조회하고, 아니면 거래 내역에서 그 이름으로 거른다
                                    const found = vendors.find((x) => x.name === v.vendor);
                                    setView("lines");
                                    if (found) {
                                      setVendorId(found.id);
                                      handleSearch(found.id);
                                    } else {
                                      setLineQuery(v.vendor);
                                      setLineLimit(LINE_STEP);
                                    }
                                  }}
                                >
                                  {v.vendor}
                                </button>
                              </td>
                              {monthly.months.map((m) => (
                                <td key={m} className="whitespace-nowrap border-b border-border px-3 py-2 text-right tabular-nums text-subtle-foreground">
                                  {v.cells.has(m) ? num(v.cells.get(m)!) : <span className="text-muted-foreground">—</span>}
                                </td>
                              ))}
                              <td className="whitespace-nowrap border-b border-border px-3 py-2 pr-4 text-right font-semibold tabular-nums">{num(v.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="sticky bottom-0">
                          <tr className="font-bold">
                            <td className="sticky left-0 border-t border-border bg-muted py-2 pl-4 pr-3 text-sm">합계</td>
                            {monthly.months.map((m) => (
                              <td key={m} className="whitespace-nowrap border-t border-border bg-muted px-3 py-2 text-right tabular-nums">{num(monthly.monthTotals.get(m) ?? 0)}</td>
                            ))}
                            <td className="whitespace-nowrap border-t border-border bg-muted px-3 py-2 pr-4 text-right tabular-nums">{num(totals.amount)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </section>
                  <p className="px-1 text-[13px] text-muted-foreground">
                    업체 {num(monthly.vendors.length)}곳 · 업체를 누르면 그 업체의 거래 내역이 나와요 · 명세서 거래일 기준 · 금액은 원, 할인후 기준 · 업체는 명세서에 연결된 업체 이름으로 묶어요
                  </p>
                </>
              )
            ) : view === "lines" ? (
              rows!.length === 0 ? (
                <div className="rounded-xl bg-card ring-1 ring-border">
                  <EmptyState icon={BookText} title="이 조건의 거래가 없어요" description="기간을 넓히거나 업체를 바꿔 보세요." />
                </div>
              ) : (
                <>
                  <FilterBar>
                    <SearchField id="ledger-q" value={lineQuery} onChange={(v) => { setLineQuery(v); setLineLimit(LINE_STEP); }} placeholder="품목·업체 검색" />
                  </FilterBar>

                  {/* PC 표 */}
                  <section className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-border lg:block">
                    <div className="max-h-[calc(100dvh-24rem)] min-h-[16rem] overflow-auto">
                      <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
                        <thead className="sticky top-0 z-10">
                          <tr className="text-left text-xs font-semibold text-muted-foreground">
                            <th className="w-[108px] border-b border-border bg-muted py-2 pl-4 font-semibold">거래일</th>
                            {multiVendor && <th className="w-[20%] border-b border-border bg-muted px-3 py-2 font-semibold">업체</th>}
                            <th className="border-b border-border bg-muted px-3 py-2 font-semibold">품목</th>
                            <th className="w-20 border-b border-border bg-muted px-3 py-2 text-right font-semibold">수량</th>
                            <th className="w-28 border-b border-border bg-muted px-3 py-2 text-right font-semibold">단가</th>
                            <th className="w-32 border-b border-border bg-muted px-3 py-2 pr-4 text-right font-semibold">금액</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRows.map((r, i) => (
                            <tr key={r.invoiceId + i} className="hover:bg-muted/60">
                              <td className="whitespace-nowrap border-b border-border py-2 pl-4 tabular-nums text-subtle-foreground">{r.invoiceDate ?? "—"}</td>
                              {multiVendor && <td className="truncate border-b border-border px-3 py-2 text-subtle-foreground">{r.vendorName}</td>}
                              <td className="truncate border-b border-border px-3 py-2 text-sm font-medium" title={r.itemName}>
                                <Link href={`/items?name=${encodeURIComponent(r.itemName)}`} className="hover:text-primary hover:underline" title={`${r.itemName} — 가격 추이·주문 이력 보기`}>
                                  {r.itemName}
                                </Link>
                              </td>
                              <td className="border-b border-border px-3 py-2 text-right tabular-nums">{num(r.quantity)}</td>
                              <td className="border-b border-border px-3 py-2 text-right tabular-nums text-subtle-foreground">{num(r.unitPrice)}</td>
                              <td className="border-b border-border px-3 py-2 pr-4 text-right font-semibold tabular-nums">{num(r.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* 모바일 */}
                  <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border lg:hidden">
                    {visibleRows.map((r, i) => (
                      <div key={r.invoiceId + i} className={cn("px-4 py-3", i > 0 && "border-t border-border")}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate text-[15px] font-semibold">{r.itemName}</span>
                          <span className="shrink-0 text-[15px] font-bold tabular-nums">{num(r.amount)}</span>
                        </div>
                        <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">
                          {r.invoiceDate ?? "—"}
                          {multiVendor ? ` · ${r.vendorName}` : ""} · {num(r.quantity)} × {num(r.unitPrice)}
                        </p>
                      </div>
                    ))}
                  </section>
                  {shownRows.length > visibleRows.length && (
                    <Button variant="outline" className="w-full" onClick={() => setLineLimit((n) => n + LINE_STEP)}>
                      {num(Math.min(LINE_STEP, shownRows.length - visibleRows.length))}줄 더 보기 · 남은 {num(shownRows.length - visibleRows.length)}줄
                    </Button>
                  )}
                  <p className="px-1 text-[13px] tabular-nums text-muted-foreground">
                    {shownRows.length === rows!.length ? `${num(rows!.length)}줄` : `${num(shownRows.length)} / ${num(rows!.length)}줄`}
                    {shownRows.length > visibleRows.length ? ` 중 ${num(visibleRows.length)}줄 표시` : ""} · 합계는 전체 줄 기준 · 금액은 원, 할인후 기준
                  </p>
                </>
              )
            ) : docs!.length === 0 ? (
              <div className="rounded-xl bg-card ring-1 ring-border">
                <EmptyState icon={FileText} title="이 조건의 명세서가 없어요" description="기간을 넓히거나 업체를 바꿔 보세요." />
              </div>
            ) : (
              <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                {duplicateIds.size > 0 && (
                  <p className="border-b border-border bg-status-ask-bg px-4 py-2.5 text-[13px] font-medium text-status-ask">
                    같은 업체·날짜·금액의 명세서가 {duplicateIds.size}장 있어요. 같은 명세서를 두 번 올렸다면 금액이 두 번 더해져요. 아래 &quot;중복 의심&quot; 표시를 확인해 주세요.
                  </p>
                )}
                {docs!.map((d, i) => (
                  <div key={d.id} className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center", i > 0 && "border-t border-border")}>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-subtle-foreground">
                        <FileText className="size-[18px]" />
                      </span>
                      <span className="min-w-0">
                        <b className="block truncate text-[15px] font-semibold">
                          {d.vendorName || "업체 미지정"}
                          <span className="ml-2 text-[13px] font-normal tabular-nums text-muted-foreground">{d.invoiceDate ?? "날짜 없음"}</span>
                          {duplicateIds.has(d.id) && <span className="ml-2 rounded-full bg-status-ask-bg px-2 py-0.5 text-xs font-semibold text-status-ask">중복 의심</span>}
                        </b>
                        <span className="text-[13px] tabular-nums text-muted-foreground">
                          품목 {d.itemCount}개 · {won(d.totalAmount)}
                        </span>
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5 pl-12 sm:pl-0">
                      {d.imagePaths.length === 0 ? (
                        <span className="text-xs text-muted-foreground">원본 없음</span>
                      ) : (
                        d.imagePaths.map((p, j) => (
                          <Button key={p} variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => openFile(p)} disabled={openingPath === p}>
                            <ExternalLink className="size-3.5" />
                            {openingPath === p ? "여는 중…" : d.imagePaths.length > 1 ? `원본 ${j + 1}` : "원본 열기"}
                          </Button>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
