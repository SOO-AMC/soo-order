"use client";

import { PageHeader } from "@/components/page-header";
import { useEffect, useMemo, useState } from "react";
import { Download, Search, FileText, ExternalLink } from "lucide-react";
import type ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/client";
import { fetchVendorLedger, fetchInvoiceDocs, getInvoiceFileUrl, mergeInvoicePdfs } from "@/lib/actions/vendor-ledger-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { LedgerRow, InvoiceDoc } from "@/lib/types/invoice";

const won = (n: number) => `${Math.round(n).toLocaleString()}원`;

export function VendorLedgerPage() {
  const supabase = createClient();

  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("vendor"),
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [docs, setDocs] = useState<InvoiceDoc[] | null>(null);
  const [view, setView] = useState<"lines" | "docs">("lines");
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("vendors")
      .select("id, name")
      .order("name")
      .then(({ data }) => setVendors((data as { id: string; name: string }[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    if (!rows) return { count: 0, qty: 0, amount: 0 };
    return rows.reduce(
      (acc, r) => ({ count: acc.count + 1, qty: acc.qty + r.quantity, amount: acc.amount + r.amount }),
      { count: 0, qty: 0, amount: 0 },
    );
  }, [rows]);

  const handleSearch = async () => {
    setLoading(true);
    setError("");
    try {
      const opts = { vendorId, start: start || null, end: end || null };
      const [lines, docList] = await Promise.all([fetchVendorLedger(opts), fetchInvoiceDocs(opts)]);
      setRows(lines);
      setDocs(docList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const openFile = async (path: string) => {
    setOpeningPath(path);
    try {
      const url = await getInvoiceFileUrl(path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setError("원본 파일을 열 수 없습니다.");
    } catch {
      setError("원본 파일을 여는 중 오류가 발생했습니다.");
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
    // revoke는 메모리 정리용이라 지연해도 안전.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const periodLabel = () => (start || end ? `${start || "처음"}~${end || "끝"}` : "전체기간");
  const vendorLabel = () => (vendorId ? vendors.find((v) => v.id === vendorId)?.name ?? "업체" : "전체");

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
    triggerDownload(blob, `거래처원장_${vendorLabel()}_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
          setError("합칠 수 있는 원본 파일이 없습니다.");
          return;
        }
        const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
        window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
      } else {
        // fetch+blob 방식은 대용량(수백 MB) 응답에서 브라우저 메모리/연결 끊김 문제가 잦다.
        // → form POST + target=_blank로 브라우저 네이티브 다운로드 사용:
        //   응답이 디스크로 바로 스트리밍 저장돼 JS 메모리·fetch 타임아웃 영향 없음.
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
      setError(e instanceof Error ? e.message : "원본 병합 중 오류가 발생했습니다.");
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-6xl">
      <PageHeader title="거래처원장" description={<span className="hidden sm:inline">업체·기간별 명세서 거래 내역</span>} />

      <div className="space-y-4 p-4 lg:px-6">
        {/* 필터 */}
        <div className="rounded-2xl bg-card p-4 shadow-card space-y-3">
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
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="start">시작일</Label>
              <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">종료일</Label>
              <Input id="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-40" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setStart(""); setEnd(""); }}>
              전체 기간
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">기간을 비우면 전체 기간으로 조회됩니다.</p>
          <Button onClick={handleSearch} disabled={loading} className="w-full">
            <Search className="h-4 w-4" /> {loading ? "조회 중…" : "조회"}
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-8">
            <Spinner text="조회 중…" />
          </div>
        )}

        {(rows || docs) && !loading && (
          <div className="space-y-3">
            <div className="inline-flex rounded-lg bg-muted p-0.5 ring-1 ring-border">
              {(["lines", "docs"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1 text-[13px] font-semibold transition-colors ${
                    view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v === "lines" ? "거래 내역" : "명세서 원본"}
                </button>
              ))}
            </div>

            {view === "lines" && rows && (
            <>
            <div className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-card">
              <div className="text-sm">
                <span className="text-muted-foreground">거래 </span>
                <span className="font-semibold">{totals.count}건</span>
                <span className="mx-2 text-muted-foreground">·</span>
                <span className="text-muted-foreground">수량 </span>
                <span className="font-semibold">{totals.qty}</span>
                <span className="mx-2 text-muted-foreground">·</span>
                <span className="text-muted-foreground">합계 </span>
                <span className="font-semibold text-primary">{won(totals.amount)}</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
                <Download className="h-4 w-4" /> 엑셀
              </Button>
            </div>

            {rows.length === 0 ? (
              <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
                해당 조건의 거래 내역이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl bg-card shadow-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">거래일자</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">업체</th>
                      <th className="px-3 py-2 font-medium">품목</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">수량</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">단가</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.invoiceId + i} className="border-t border-border/50">
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.invoiceDate ?? "-"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.vendorName}</td>
                        <td className="px-3 py-2">{r.itemName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{won(r.unitPrice)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{won(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </>
            )}

            {view === "docs" && docs && (
              docs.length === 0 ? (
                <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
                  해당 조건의 명세서가 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-2xl bg-card p-3 shadow-card">
                    <span className="text-sm text-muted-foreground">명세서 {docs.length}건</span>
                    <Button variant="outline" size="sm" onClick={handleMergeDocs} disabled={merging}>
                      <Download className="h-4 w-4" />
                      {merging
                        ? "처리 중…"
                        : groupDocsByVendor(docs).size <= 1
                          ? "한 PDF로 보기"
                          : "업체별 PDF · ZIP"}
                    </Button>
                  </div>
                  {docs.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl bg-card p-3 shadow-card">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{d.invoiceDate ?? "날짜 미상"} · {d.vendorName || "업체?"}</p>
                          <p className="text-xs text-muted-foreground">품목 {d.itemCount}건 · 합계 {won(d.totalAmount)}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        {d.imagePaths.length === 0 ? (
                          <span className="text-xs text-muted-foreground">원본 없음</span>
                        ) : (
                          d.imagePaths.map((p, i) => (
                            <Button key={p} variant="outline" size="sm" onClick={() => openFile(p)} disabled={openingPath === p}>
                              <ExternalLink className="h-3.5 w-3.5" />
                              {openingPath === p ? "여는 중…" : d.imagePaths.length > 1 ? `원본 ${i + 1}` : "원본 열기"}
                            </Button>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
