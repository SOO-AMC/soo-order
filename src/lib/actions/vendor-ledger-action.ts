"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { fetchInvoiceLines } from "@/lib/invoices/lines";
import { fetchAllPages } from "@/lib/supabase/paginate";
import type { LedgerRow, InvoiceDoc } from "@/lib/types/invoice";

interface LedgerFilter {
  vendorId?: string | null;
  start?: string | null;
  end?: string | null;
}

/**
 * 거래처원장 조회. 업체(없으면 전체) + 기간(없으면 전체)의 명세서 품목 줄을 **전부** 반환한다. 관리자 전용.
 * 줄 수 제한(1,000줄)과 명세서 id 목록 길이 제한에 걸리지 않도록 fetchInvoiceLines 로 끝까지 읽는다.
 * 읽지 못하면 빈 목록 대신 오류를 던진다 — "0원"으로 보이면 그 숫자를 믿게 되기 때문.
 */
export async function fetchVendorLedger(opts: LedgerFilter): Promise<LedgerRow[]> {
  const { supabase } = await requireAdmin();
  const lines = await fetchInvoiceLines(supabase, opts);

  const rows: LedgerRow[] = lines.map((l) => ({
    invoiceId: l.invoiceId,
    invoiceDate: l.invoiceDate,
    vendorName: l.vendorName,
    itemName: l.itemName,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    amount: l.amount,
  }));

  rows.sort((a, b) => {
    const d = (a.invoiceDate ?? "").localeCompare(b.invoiceDate ?? "");
    return d !== 0 ? d : a.itemName.localeCompare(b.itemName);
  });
  return rows;
}

interface InvoiceDocRow {
  id: string;
  vendor_name: string;
  invoice_date: string | null;
  total_amount: number;
  image_urls: string[] | null;
  invoice_items: { count: number }[] | null;
}

/** 거래처원장 — 업체+기간별 명세서 원본 문서 목록(품목 수 포함). 관리자 전용. */
export async function fetchInvoiceDocs(opts: LedgerFilter): Promise<InvoiceDoc[]> {
  const { supabase } = await requireAdmin();

  const invList = await fetchAllPages<InvoiceDocRow>(
    (from, to) => {
      // 품목 수는 명세서마다 DB가 세어 준다 (id 목록을 다시 보내지 않는다)
      let q = supabase.from("invoices").select("id, vendor_name, invoice_date, total_amount, image_urls, invoice_items(count)");
      if (opts.vendorId) q = q.eq("vendor_id", opts.vendorId);
      if (opts.start) q = q.gte("invoice_date", opts.start);
      if (opts.end) q = q.lte("invoice_date", opts.end);
      return q.order("invoice_date", { ascending: false }).order("id").range(from, to);
    },
    { label: "명세서 목록" },
  );

  return invList.map((i) => ({
    id: i.id,
    vendorName: i.vendor_name,
    invoiceDate: i.invoice_date,
    totalAmount: Number(i.total_amount) || 0,
    itemCount: i.invoice_items?.[0]?.count ?? 0,
    imagePaths: i.image_urls ?? [],
  }));
}

/** 명세서 원본 파일 서명 URL (비공개 invoices 버킷). 관리자 전용. */
export async function getInvoiceFileUrl(path: string): Promise<string | null> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.storage.from("invoices").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

/**
 * 명세서 PDF들을 하나로 병합해 base64로 반환 (MuPDF). 관리자 전용.
 * 비표준/암호화 PDF도 견고하게 처리. PDF 외 파일은 병합에서 제외.
 */
export async function mergeInvoicePdfs(paths: string[]): Promise<string> {
  const { supabase } = await requireAdmin();
  const mupdf = await import("mupdf");
  const dst = new mupdf.PDFDocument();

  for (const path of paths) {
    if ((path.toLowerCase().split(".").pop() ?? "") !== "pdf") continue;
    const { data: blob } = await supabase.storage.from("invoices").download(path);
    if (!blob) continue;
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const src = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as InstanceType<typeof mupdf.PDFDocument>;
      const n = src.countPages();
      for (let i = 0; i < n; i++) dst.graftPage(-1, src, i);
    } catch {
      // 개별 파일 실패는 무시하고 계속
    }
  }

  const out = dst.saveToBuffer("compress").asUint8Array();
  return Buffer.from(out).toString("base64");
}
