import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchInvoiceLines } from "@/lib/invoices/lines";
import { fetchItemOverview, searchItems } from "@/lib/actions/item-overview-action";
import { fetchPriceAnalysis } from "@/lib/actions/price-analysis-action";
import { buildVendorIndex } from "@/lib/utils/vendor-name";
import { daysWaiting, DELAY_FIRST_DAYS } from "@/lib/orders/arrival-delay";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types/order";

/**
 * "물어보기"(관리자용 질문 답변)의 도구.
 *
 * AI 가 DB 를 직접 조회하지 않는다. 여기 있는 **읽기 전용** 함수만 부를 수 있고, 그 결과로만 답한다.
 * 쓰기(발주·검수·수정·삭제)를 하는 도구는 없다 — 새 도구를 더할 때도 읽기만 하게 둘 것.
 * 각 도구는 답의 근거가 되는 화면 링크(source)를 함께 돌려준다.
 *
 * "use server" 파일이 아니다. assistant-action.ts 가 requireAdmin() 으로 관리자임을 확인한 뒤에만 부른다.
 */

export interface ToolSource {
  label: string;
  href: string;
}
export interface ToolOutput {
  result: unknown;
  source?: ToolSource;
}

const DATE = { type: "string", description: "YYYY-MM-DD" } as const;

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "spend_summary",
    description:
      "확정한 거래명세서 기준 지출 합계. 기간(필수)과 업체(선택)로 총액, 명세서 장수, 업체별 합계, 월별 합계를 돌려준다. '이번 달 얼마 썼어', 'vs팜에 얼마 냈어', '어느 업체에 가장 많이 썼어' 같은 질문에 쓴다. 금액은 할인후 기준 원.",
    input_schema: {
      type: "object",
      properties: { start: DATE, end: DATE, vendor: { type: "string", description: "업체 이름 (선택). 비우면 전체 업체" } },
      required: ["start", "end"],
    },
  },
  {
    name: "item_overview",
    description:
      "약품·품목 하나의 정보: 지금 업체별 가격, 명세서 단가 추이, 주문 횟수·간격, 최근 주문과 그때 단가, 더 싼 업체가 있는지. '메로페넴 얼마야', '마지막으로 언제 얼마에 샀어', '얼마나 자주 주문해' 같은 질문에 쓴다. 이름은 일부만 넣어도 된다.",
    input_schema: { type: "object", properties: { name: { type: "string", description: "품목 이름" } }, required: ["name"] },
  },
  {
    name: "price_changes",
    description:
      "두 기간(A → B) 사이 단가가 오르거나 내린 품목. 체감 인상률, 금액 영향이 큰 오른 품목·내린 품목, 단가가 급변해 확인이 필요한 품목을 돌려준다. '지난달보다 오른 약품', '올해 단가 많이 오른 거' 같은 질문에 쓴다.",
    input_schema: {
      type: "object",
      properties: { a_start: DATE, a_end: DATE, b_start: DATE, b_end: DATE },
      required: ["a_start", "a_end", "b_start", "b_end"],
    },
  },
  {
    name: "delayed_orders",
    description: `발주한 지 ${DELAY_FIRST_DAYS}일이 넘도록 아직 들어오지 않은(검수대기) 주문 목록. '안 들어온 주문', '입고 지연' 질문에 쓴다.`,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_orders",
    description:
      "주문 찾기. 품목 이름·상태·업체·기간으로 최근 주문을 최대 30건 돌려주고, 조건에 맞는 전체 건수도 준다. '물티슈 주문 내역', '지금 발주 대기 몇 건', '쿠팡에 주문한 거' 같은 질문에 쓴다. 가격은 들어 있지 않다(가격은 item_overview).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "품목 이름 일부 (선택)" },
        status: { type: "string", enum: ["pending", "ordered", "inspecting", "out_of_stock"], description: "pending=주문신청(발주 전), ordered=검수대기(발주함), inspecting=검수완료, out_of_stock=품절 (선택)" },
        vendor: { type: "string", description: "업체 이름 일부 (선택)" },
        since: { ...DATE, description: "이 날짜 이후 주문만 (선택, YYYY-MM-DD)" },
      },
    },
  },
];

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const text = (v: unknown, max = 80): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const round = (n: number) => Math.round(n);
/** ilike 검색어의 특수문자를 글자 그대로 찾게 */
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function runAssistantTool(name: string, input: unknown, supabase: SupabaseClient): Promise<ToolOutput> {
  const i = (input ?? {}) as Record<string, unknown>;

  if (name === "spend_summary") {
    if (!isDate(i.start) || !isDate(i.end)) return { result: { error: "start, end 는 YYYY-MM-DD 여야 해요." } };
    const vendorText = text(i.vendor);
    let vendorId: string | null = null;
    let vendorLabel = "전체 업체";
    if (vendorText) {
      const [{ data: vendors }, { data: aliases }] = await Promise.all([
        supabase.from("vendors").select("id, name"),
        supabase.from("vendor_aliases").select("vendor_id, alias"),
      ]);
      const list = (vendors ?? []) as { id: string; name: string }[];
      const index = buildVendorIndex(list, ((aliases ?? []) as { vendor_id: string; alias: string }[]).map((a) => ({ vendorId: a.vendor_id, alias: a.alias })));
      const found = index.resolve(vendorText) ?? list.find((v) => v.name.toLowerCase().includes(vendorText.toLowerCase())) ?? null;
      if (!found) return { result: { error: `'${vendorText}'에 해당하는 업체를 찾지 못했어요.`, vendors: list.map((v) => v.name).slice(0, 80) } };
      vendorId = found.id;
      vendorLabel = found.name;
    }
    const lines = await fetchInvoiceLines(supabase, { vendorId, start: i.start, end: i.end });
    const byVendor = new Map<string, { amount: number; lines: number }>();
    const byMonth = new Map<string, number>();
    const invoices = new Set<string>();
    let total = 0;
    for (const l of lines) {
      total += l.amount;
      invoices.add(l.invoiceId);
      const v = byVendor.get(l.vendorName) ?? { amount: 0, lines: 0 };
      v.amount += l.amount;
      v.lines += 1;
      byVendor.set(l.vendorName, v);
      const m = l.invoiceDate ? l.invoiceDate.slice(0, 7) : "날짜 없음";
      byMonth.set(m, (byMonth.get(m) ?? 0) + l.amount);
    }
    return {
      result: {
        vendor: vendorLabel,
        period: `${i.start} ~ ${i.end}`,
        total_won: round(total),
        invoices: invoices.size,
        lines: lines.length,
        by_vendor: [...byVendor.entries()].map(([vendor, v]) => ({ vendor, won: round(v.amount), lines: v.lines })).sort((a, b) => b.won - a.won).slice(0, 15),
        by_month: [...byMonth.entries()].map(([month, won]) => ({ month, won: round(won) })).sort((a, b) => a.month.localeCompare(b.month)),
        note: "확정한 거래명세서의 금액 합계(할인후). 명세서로 처리하지 않은 구매(예: 온라인몰)는 들어 있지 않다.",
      },
      source: { label: `거래처원장 · ${vendorLabel}`, href: "/vendor-ledger" },
    };
  }

  if (name === "item_overview") {
    const q = text(i.name);
    if (!q) return { result: { error: "품목 이름이 필요해요." } };
    // 이름이 정확하지 않을 수 있으므로 표준 품목에서 먼저 찾는다
    const candidates = await searchItems(q);
    const target = candidates[0];
    const o = await fetchItemOverview(target ? { productId: target.id } : { name: q });
    const s = o.stats;
    return {
      result: {
        item: o.title,
        linked_to_standard_product: !!o.product,
        other_matches: candidates.slice(1, 6).map((c) => c.name),
        current_prices_won: o.currentPrices.map((p) => ({ vendor: p.vendor, won: p.price })),
        cheaper_vendor: o.cheaper,
        last_invoice_price_won: s?.lastPrice ?? null,
        price_change_pct_first_to_last: s?.changePct == null ? null : Math.round(s.changePct * 10) / 10,
        invoice_price_history: {
          invoice_count: o.trend.length,
          first_invoice_date: o.trend[0]?.date ?? null,
          last_invoice_date: o.trend[o.trend.length - 1]?.date ?? null,
          min_won: s?.minPrice ?? null,
          max_won: s?.maxPrice ?? null,
          note: "단가 기록(명세서)은 first_invoice_date 부터만 있다. 그 전의 단가는 알 수 없다. 주문 날짜(first_order_date)와는 다른 것이다.",
        },
        outlier_prices_excluded: s?.outlierCount ?? 0,
        order_count: s?.orderCount ?? 0,
        total_quantity: s?.totalQuantity ?? 0,
        average_days_between_orders: s?.avgIntervalDays ?? null,
        first_order_date: s?.firstOrderAt?.slice(0, 10) ?? null,
        last_order_date: s?.lastOrderAt?.slice(0, 10) ?? null,
        recent_invoice_prices: o.trend.slice(-8).map((t) => ({ date: t.date, vendor: t.vendor, won: t.unitPrice, qty: t.quantity, needs_review: t.outlier })),
        recent_orders: o.orders.slice(0, 8).map((r) => ({
          date: r.createdAt.slice(0, 10),
          name: r.itemName,
          qty: r.quantity,
          unit: r.unit,
          vendor: r.vendor,
          status: ORDER_STATUS_LABEL[r.status as OrderStatus] ?? r.status,
          price_won: r.price,
          price_basis: r.priceBasis === "invoice" ? "그 주문을 검수한 명세서 단가" : r.priceBasis === "estimate" ? "가까운 날짜 명세서로 추정" : null,
        })),
        names_written_on_orders: o.names.slice(0, 8),
      },
      source: { label: `약품 한눈에 보기 · ${o.title}`, href: o.product ? `/items?product=${o.product.id}` : `/items?name=${encodeURIComponent(q)}` },
    };
  }

  if (name === "price_changes") {
    if (![i.a_start, i.a_end, i.b_start, i.b_end].every(isDate)) return { result: { error: "네 날짜 모두 YYYY-MM-DD 여야 해요." } };
    const r = await fetchPriceAnalysis({ aStart: i.a_start as string, aEnd: i.a_end as string, bStart: i.b_start as string, bEnd: i.b_end as string, vendorId: null });
    const impact = (x: { deltaAbs: number; bQty: number }) => x.deltaAbs * x.bQty;
    const row = (x: (typeof r.rows)[number]) => ({
      item: x.name,
      a_won: x.aPrice,
      b_won: x.bPrice,
      change_pct: x.deltaPct == null ? null : Math.round(x.deltaPct * 10) / 10,
      extra_paid_in_b_won: impact(x),
    });
    const ok = r.rows.filter((x) => !x.suspect);
    return {
      result: {
        period: `A ${i.a_start}~${i.a_end} → B ${i.b_start}~${i.b_end}`,
        compared_items: r.comparedCount,
        weighted_inflation_pct: r.weightedInflationPct == null ? null : Math.round(r.weightedInflationPct * 10) / 10,
        risers: ok.filter((x) => x.deltaAbs > 0).sort((a, b) => impact(b) - impact(a)).slice(0, 10).map(row),
        fallers: ok.filter((x) => x.deltaAbs < 0).sort((a, b) => impact(a) - impact(b)).slice(0, 10).map(row),
        needs_review: r.rows.filter((x) => x.suspect).slice(0, 10).map(row),
        note: "두 기간 모두 명세서에 나온 품목만 비교한다. needs_review 는 단가가 2배 이상 달라져 입력 오류일 수 있는 품목으로, 인상률 계산에서 빠져 있다.",
      },
      source: { label: "단가 분석", href: "/price-analysis" },
    };
  }

  if (name === "delayed_orders") {
    const { data, error } = await supabase
      .from("orders")
      .select("id, item_name, quantity, unit, vendor_name, dispatched_at, created_at, requester:profiles!requester_id(full_name)")
      .eq("type", "order")
      .eq("status", "ordered")
      .limit(1000);
    if (error) return { result: { error: "주문을 읽지 못했어요." } };
    const now = new Date();
    const rows = ((data ?? []) as unknown as { item_name: string; quantity: number; unit: string | null; vendor_name: string | null; dispatched_at: string | null; created_at: string; requester: { full_name: string | null } | null }[])
      .map((o) => ({ item: o.item_name, qty: o.quantity, unit: o.unit ?? "", vendor: o.vendor_name ?? "", requester: o.requester?.full_name ?? "", days_waiting: daysWaiting(o, now) }))
      .filter((o) => o.days_waiting >= DELAY_FIRST_DAYS)
      .sort((a, b) => b.days_waiting - a.days_waiting);
    return {
      result: { waiting_for_arrival_total: (data ?? []).length, delayed_count: rows.length, delayed: rows.slice(0, 30) },
      source: { label: "검수 · 7일 넘게 입고 안 됨", href: "/inspection" },
    };
  }

  if (name === "search_orders") {
    const q = text(i.query);
    const vendor = text(i.vendor);
    const status = ["pending", "ordered", "inspecting", "out_of_stock"].includes(i.status as string) ? (i.status as string) : null;
    let query = supabase
      .from("orders")
      .select("item_name, quantity, unit, status, vendor_name, created_at, requester:profiles!requester_id(full_name)", { count: "exact" })
      .eq("type", "order");
    if (q) query = query.ilike("item_name", like(q));
    if (vendor) query = query.ilike("vendor_name", like(vendor));
    if (status) query = query.eq("status", status);
    if (isDate(i.since)) query = query.gte("created_at", `${i.since}T00:00:00+09:00`);
    const { data, count, error } = await query.order("created_at", { ascending: false }).limit(30);
    if (error) return { result: { error: "주문을 읽지 못했어요." } };
    const rows = (data ?? []) as unknown as { item_name: string; quantity: number; unit: string | null; status: string; vendor_name: string | null; created_at: string; requester: { full_name: string | null } | null }[];
    return {
      result: {
        total_matching: count ?? rows.length,
        shown: rows.length,
        orders: rows.map((o) => ({
          date: o.created_at.slice(0, 10),
          item: o.item_name,
          qty: o.quantity,
          unit: o.unit ?? "",
          status: ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status,
          vendor: o.vendor_name ?? "",
          requester: o.requester?.full_name ?? "",
        })),
      },
      source: { label: q ? `조회 · ${q}` : "조회", href: q ? `/search?q=${encodeURIComponent(q)}` : "/search" },
    };
  }

  return { result: { error: `알 수 없는 도구: ${name}` } };
}
