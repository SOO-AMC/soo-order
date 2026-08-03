"use server";

import { requireAdmin } from "@/lib/supabase/server";
import type { LedgerRow, InvoiceDoc } from "@/lib/types/invoice";

interface InvoiceRow {
  id: string;
  vendor_name: string;
  invoice_date: string | null;
}
interface ItemRow {
  invoice_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

/**
 * 거래처원장 조회. 업체(없으면 전체) + 기간(없으면 전체)으로
 * invoice_items 를 invoices 와 조인해 거래 내역을 반환한다. 관리자 전용.
 */
export async function fetchVendorLedger(opts: {
  vendorId?: string | null;
  start?: string | null;
  end?: string | null;
}): Promise<LedgerRow[]> {
  const { supabase } = await requireAdmin();

  let q = supabase.from("invoices").select("id, vendor_name, invoice_date");
  if (opts.vendorId) q = q.eq("vendor_id", opts.vendorId);
  if (opts.start) q = q.gte("invoice_date", opts.start);
  if (opts.end) q = q.lte("invoice_date", opts.end);

  const { data: invoices, error } = await q;
  if (error || !invoices || invoices.length === 0) return [];

  const invMap = new Map<string, InvoiceRow>((invoices as InvoiceRow[]).map((i) => [i.id, i]));
  const ids = (invoices as InvoiceRow[]).map((i) => i.id);

  const { data: items } = await supabase
    .from("invoice_items")
    .select("invoice_id, item_name, quantity, unit_price, amount")
    .in("invoice_id", ids);

  const rows: LedgerRow[] = ((items as ItemRow[]) ?? []).map((it) => {
    const inv = invMap.get(it.invoice_id);
    return {
      invoiceId: it.invoice_id,
      invoiceDate: inv?.invoice_date ?? null,
      vendorName: inv?.vendor_name ?? "",
      itemName: it.item_name,
      quantity: it.quantity,
      unitPrice: it.unit_price,
      amount: it.amount,
    };
  });

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
  image_urls: string[];
}

/** 거래처원장 — 업체+기간별 명세서 원본 문서 목록. 관리자 전용. */
export async function fetchInvoiceDocs(opts: {
  vendorId?: string | null;
  start?: string | null;
  end?: string | null;
}): Promise<InvoiceDoc[]> {
  const { supabase } = await requireAdmin();

  let q = supabase
    .from("invoices")
    .select("id, vendor_name, invoice_date, total_amount, image_urls")
    .order("invoice_date", { ascending: false });
  if (opts.vendorId) q = q.eq("vendor_id", opts.vendorId);
  if (opts.start) q = q.gte("invoice_date", opts.start);
  if (opts.end) q = q.lte("invoice_date", opts.end);

  const { data, error } = await q;
  if (error || !data || data.length === 0) return [];
  const invList = data as InvoiceDocRow[];

  const { data: items } = await supabase
    .from("invoice_items")
    .select("invoice_id")
    .in("invoice_id", invList.map((i) => i.id));
  const countById = new Map<string, number>();
  for (const it of (items as { invoice_id: string }[]) ?? []) {
    countById.set(it.invoice_id, (countById.get(it.invoice_id) ?? 0) + 1);
  }

  return invList.map((i) => ({
    id: i.id,
    vendorName: i.vendor_name,
    invoiceDate: i.invoice_date,
    totalAmount: i.total_amount,
    itemCount: countById.get(i.id) ?? 0,
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
