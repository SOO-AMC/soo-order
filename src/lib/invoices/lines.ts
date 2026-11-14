import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/paginate";

/**
 * 명세서 품목 줄 + 그 줄이 속한 명세서(업체·날짜).
 * 거래처원장 · 단가 분석 · 대시보드 지출이 모두 이 조회를 쓴다 → 같은 기간이면 같은 숫자.
 *
 * "use server" 파일이 아니다. 호출하는 액션이 먼저 requireAdmin()으로 권한을 확인한 뒤 부른다.
 */
export interface InvoiceLine {
  id: string;
  invoiceId: string;
  unifiedProductId: string | null;
  itemName: string;
  quantity: number;
  unitPrice: number;
  listPrice: number;
  amount: number;
  vendorId: string | null;
  vendorName: string;
  invoiceDate: string | null;
}

interface RawLine {
  id: string;
  invoice_id: string;
  unified_product_id: string | null;
  item_name: string;
  quantity: number | string;
  unit_price: number | string;
  list_price: number | string | null;
  amount: number | string;
  invoices: { vendor_id: string | null; vendor_name: string | null; invoice_date: string | null } | null;
}

export interface InvoiceLineFilter {
  vendorId?: string | null;
  /** 거래일 시작·끝 (YYYY-MM-DD, 포함). 비우면 제한 없음 */
  start?: string | null;
  end?: string | null;
  /** 한 품목만 (표준 품목 id 또는 명세서에 적힌 이름 그대로) */
  unifiedProductId?: string | null;
  itemName?: string | null;
}

const SELECT =
  "id, invoice_id, unified_product_id, item_name, quantity, unit_price, list_price, amount, invoices!inner(vendor_id, vendor_name, invoice_date)";

const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v) || 0);

/**
 * 조건에 맞는 명세서 품목 줄을 **끝까지** 읽는다.
 * 명세서 id 목록을 `.in()`에 넣지 않고 명세서와 묶어(inner join) 날짜·업체로 거르므로,
 * 명세서가 수백 장이어도 요청이 실패하지 않고 1,000줄에서 잘리지도 않는다.
 */
export async function fetchInvoiceLines(supabase: SupabaseClient, filter: InvoiceLineFilter = {}): Promise<InvoiceLine[]> {
  const raw = await fetchAllPages<RawLine>(
    (from, to) => {
      let q = supabase.from("invoice_items").select(SELECT);
      if (filter.vendorId) q = q.eq("invoices.vendor_id", filter.vendorId);
      if (filter.start) q = q.gte("invoices.invoice_date", filter.start);
      if (filter.end) q = q.lte("invoices.invoice_date", filter.end);
      if (filter.unifiedProductId) q = q.eq("unified_product_id", filter.unifiedProductId);
      else if (filter.itemName) q = q.eq("item_name", filter.itemName);
      return q.order("id").range(from, to);
    },
    { label: "명세서 거래 내역" },
  );

  return raw.map((r) => ({
    id: r.id,
    invoiceId: r.invoice_id,
    unifiedProductId: r.unified_product_id,
    itemName: r.item_name,
    quantity: num(r.quantity),
    unitPrice: num(r.unit_price),
    listPrice: num(r.list_price),
    amount: num(r.amount),
    vendorId: r.invoices?.vendor_id ?? null,
    vendorName: r.invoices?.vendor_name ?? "",
    invoiceDate: r.invoices?.invoice_date ?? null,
  }));
}
