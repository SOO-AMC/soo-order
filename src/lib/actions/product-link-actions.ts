"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { logActivity } from "@/lib/utils/activity-log";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import { bestMatchSameSpec, doseConflict } from "@/lib/utils/item-spec";
import type {
  HiddenItemName,
  ItemCleanup,
  LinkVendorProductResult,
  ProductLinkResult,
  StandardProductLite,
  UnlinkedItemName,
} from "@/lib/types/product-link";

/**
 * 약품 정리함 (관리자 전용).
 * 주문의 품목은 글자로 저장된다. 표준 품목(unified_products)과의 연결은 "품목 매칭"(item_name_aliases) 한 줄이고,
 * 같은 이름(열쇠)으로 적힌 과거·미래 주문이 모두 그 품목으로 묶인다. **주문 자체는 고치지 않는다.**
 */

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const ok = <T>(data: T): { ok: true; data: T } => ({ ok: true, data });

const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST202" || e.code === "PGRST205" || e.code === "42883" || e.code === "42P01" || /could not find|does not exist/i.test(e.message ?? ""));

const NOT_READY = "약품 정리 기능이 아직 준비되지 않았어요. supabase/migrate-product-link.sql 을 먼저 실행해 주세요.";

/** 이름이 비슷하다고 제안할 최소 점수 */
const GUESS_MIN_SCORE = 0.6;

interface UsageRow {
  key: string;
  name: string;
  n: number;
  last_at: string | null;
  inv_n: number;
  inv_product_id: string | null;
}
interface UsagePayload {
  total_names: number;
  total_orders: number;
  linked_names: number;
  linked_orders: number;
  unlinked_names: number;
  unlinked_orders: number;
  hidden_names?: number;
  hidden_orders?: number;
  items: UsageRow[];
}

const EMPTY: ItemCleanup = { ready: false, totalNames: 0, totalOrders: 0, linkedNames: 0, linkedOrders: 0, unlinkedNames: 0, unlinkedOrders: 0, hiddenNames: 0, hiddenOrders: 0, items: [] };

/** 연결 안 된 주문 이름(많이 쓰인 순) + 연결 제안 */
export async function fetchItemCleanup(query?: string, limit = 300): Promise<ItemCleanup> {
  const { supabase } = await requireAdmin();

  const [usageRes, productsRes] = await Promise.all([
    supabase.rpc("order_item_usage", { p_limit: limit, p_query: query?.trim() || null }),
    supabase.from("unified_products").select("id, name, notes").order("sort_order"),
  ]);
  if (usageRes.error) {
    if (isMissing(usageRes.error)) return EMPTY;
    throw new Error(`주문에 적힌 이름을 불러오지 못했어요: ${usageRes.error.message}`);
  }
  if (productsRes.error) throw new Error(`표준 품목을 불러오지 못했어요: ${productsRes.error.message}`);

  const usage = usageRes.data as UsagePayload;
  const products: StandardProductLite[] = ((productsRes.data ?? []) as { id: string; name: string; notes: string | null }[]).map((p) => ({
    id: p.id,
    name: p.name,
    notes: p.notes ?? "",
  }));
  const byId = new Map(products.map((p) => [p.id, p] as const));

  const items: UnlinkedItemName[] = (usage.items ?? []).map((u) => {
    const guess = bestMatchSameSpec(u.name, products, (p) => p.name, GUESS_MIN_SCORE)?.item ?? null;
    // 명세서로 확인된 품목 — 단, 용량이 이름과 다르면 근거로 쓰지 않는다(다른 용량이 대신 들어왔을 수 있다)
    const byInvoice = u.inv_product_id ? byId.get(u.inv_product_id) ?? null : null;
    const invoiceOk = byInvoice && !doseConflict(u.name, byInvoice.name) ? byInvoice : null;

    const proposal = invoiceOk ?? guess;
    return {
      key: u.key,
      name: u.name,
      count: u.n,
      lastAt: u.last_at,
      proposal,
      basis: invoiceOk ? "invoice" : guess ? "guess" : null,
      invoiceCount: u.inv_n ?? 0,
      // 한 번에 연결: 명세서 근거가 있고 이름 추측도 같은 품목을 가리킬 때.
      // 이름으로는 못 찾은 경우엔 명세서로 2건 이상 확인됐을 때만 (1건은 잘못 배분된 것일 수 있다)
      strong: !!invoiceOk && (guess ? guess.id === invoiceOk.id : (u.inv_n ?? 0) >= 2),
    };
  });

  return {
    ready: true,
    totalNames: usage.total_names ?? 0,
    totalOrders: usage.total_orders ?? 0,
    linkedNames: usage.linked_names ?? 0,
    linkedOrders: usage.linked_orders ?? 0,
    unlinkedNames: usage.unlinked_names ?? 0,
    unlinkedOrders: usage.unlinked_orders ?? 0,
    hiddenNames: usage.hidden_names ?? 0,
    hiddenOrders: usage.hidden_orders ?? 0,
    items,
  };
}

/** 주문에 적힌 이름들을 표준 품목에 연결한다 (품목 매칭에 추가). 주문은 고치지 않는다. */
export async function linkItemNames(pairs: { name: string; productId: string }[]): Promise<ProductLinkResult<number>> {
  const admin = await requireAdmin();
  const rows = new Map<string, { item_name: string; unified_product_id: string; created_by: string }>();
  for (const p of pairs.slice(0, 500)) {
    const key = normalizeItemName(p.name);
    if (!key || !p.productId) continue;
    rows.set(key, { item_name: key, unified_product_id: p.productId, created_by: admin.userId });
  }
  if (rows.size === 0) return fail("연결할 이름이 없어요.");

  const { error } = await admin.supabase.from("item_name_aliases").upsert([...rows.values()], { onConflict: "item_name" });
  if (error) return fail(`연결하지 못했어요: ${error.message}`);

  void logActivity({
    userId: admin.userId, userName: admin.userName, category: "price", action: "item_link",
    description: rows.size === 1 ? `품목 연결: "${pairs[0].name}"` : `품목 연결: 이름 ${rows.size}개`,
    metadata: { count: rows.size, sample: pairs.slice(0, 5) },
  });
  return ok(rows.size);
}

/** 새 표준 품목을 만들고, 주문에 적힌 이름을 거기에 연결한다 */
export async function createStandardProductForName(orderName: string, productName: string, notes: string): Promise<ProductLinkResult<StandardProductLite>> {
  const admin = await requireAdmin();
  const created = await createStandardProduct(admin, productName, notes);
  if (!created.ok) return created;
  // 이름이 표준 품목 이름과 띄어쓰기만 다르면 매칭 줄이 필요 없다
  if (normalizeItemName(orderName) !== normalizeItemName(created.data.name)) {
    const linked = await linkItemNames([{ name: orderName, productId: created.data.id }]);
    if (!linked.ok) return fail(`품목은 만들었지만 연결하지 못했어요. ${linked.error}`);
  }
  return created;
}

type Admin = Awaited<ReturnType<typeof requireAdmin>>;

async function createStandardProduct(admin: Admin, name: string, notes: string): Promise<ProductLinkResult<StandardProductLite>> {
  const { supabase } = admin;
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!normalizeItemName(trimmed)) return fail("품목 이름을 적어 주세요.");

  // 띄어쓰기만 다른 같은 이름이 이미 있으면 새로 만들지 않는다
  const { data: all, error: listErr } = await supabase.from("unified_products").select("id, name, notes, sort_order").order("sort_order", { ascending: false });
  if (listErr) return fail(`표준 품목을 불러오지 못했어요: ${listErr.message}`);
  const list = (all ?? []) as { id: string; name: string; notes: string | null; sort_order: number | null }[];
  const same = list.find((p) => normalizeItemName(p.name) === normalizeItemName(trimmed));
  if (same) return ok({ id: same.id, name: same.name, notes: same.notes ?? "" });

  const { data, error } = await supabase
    .from("unified_products")
    .insert({ name: trimmed, mg: "", tab: "", notes: notes.trim(), remarks: "", sort_order: (list[0]?.sort_order ?? 0) + 1 })
    .select("id, name, notes")
    .single();
  if (error || !data) return fail(`표준 품목을 만들지 못했어요: ${error?.message ?? ""}`);

  void logActivity({
    userId: admin.userId, userName: admin.userName, category: "price", action: "create_unified_product",
    description: `표준 품목 등록: ${trimmed}`,
    metadata: { id: data.id, from: "cleanup" },
  });
  return ok({ id: data.id, name: data.name, notes: data.notes ?? "" });
}

/**
 * 비교표에 안 보이는 업체 품목을 표준 품목에 연결한다.
 * 같은 업체가 그 품목의 가격을 이미 갖고 있으면 `conflict` 를 돌려준다 → mode 로 다시 부른다
 * ('replace' = 이 품목의 가격으로 바꾸기, 'keep' = 기존 가격 유지).
 */
export async function linkVendorProductToStandard(
  vendorProductId: string,
  productId: string,
  mode?: "replace" | "keep",
): Promise<ProductLinkResult<LinkVendorProductResult>> {
  const admin = await requireAdmin();
  const { data, error } = await admin.supabase.rpc("link_vendor_product", { p_vp_id: vendorProductId, p_unified_id: productId, p_mode: mode ?? null });
  if (error) return fail(isMissing(error) ? NOT_READY : error.message);
  const r = data as { status: string; existing_price?: number | null; new_price?: number | null; invoice_lines?: number };
  if (r.status === "conflict") return ok({ status: "conflict", existingPrice: r.existing_price ?? null, newPrice: r.new_price ?? null });

  void logActivity({
    userId: admin.userId, userName: admin.userName, category: "price", action: "vendor_product_link",
    description: `업체 품목을 표준 품목에 연결${mode ? ` (${mode === "replace" ? "가격 교체" : "기존 가격 유지"})` : ""}`,
    metadata: { vendorProductId, productId, mode: mode ?? null, invoiceLines: r.invoice_lines ?? 0 },
  });
  return ok({ status: "linked", invoiceLines: r.invoice_lines ?? 0 });
}

/** 업체 품목 이름으로 새 표준 품목을 만들고 연결한다 */
export async function createStandardFromVendorProduct(vendorProductId: string, productName: string, notes: string): Promise<ProductLinkResult<LinkVendorProductResult>> {
  const admin = await requireAdmin();
  const created = await createStandardProduct(admin, productName, notes);
  if (!created.ok) return created;
  return linkVendorProductToStandard(vendorProductId, created.data.id);
}

const HIDE_NOT_READY = "숨기기 기능이 아직 준비되지 않았어요. supabase/migrate-product-link.sql 을 한 번 더 실행해 주세요.";

/** 정리함에서 이름을 숨긴다 ("약품 아님" — 물티슈·휴지 같은 소모품). 주문에는 영향이 없고 다시 보이게 할 수 있다. */
export async function hideItemName(name: string): Promise<ProductLinkResult> {
  const admin = await requireAdmin();
  const key = normalizeItemName(name);
  if (!key) return fail("숨길 이름이 없어요.");
  const { error } = await admin.supabase
    .from("item_name_ignores")
    .upsert({ item_key: key, name: name.trim(), created_by: admin.userId }, { onConflict: "item_key" });
  if (error) return fail(isMissing(error) ? HIDE_NOT_READY : `숨기지 못했어요: ${error.message}`);
  return ok(undefined);
}

/** 숨긴 이름을 다시 정리함에 보이게 한다 */
export async function unhideItemName(key: string): Promise<ProductLinkResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("item_name_ignores").delete().eq("item_key", key);
  if (error) return fail(isMissing(error) ? HIDE_NOT_READY : `되돌리지 못했어요: ${error.message}`);
  return ok(undefined);
}

/** 숨긴 이름 목록 (최근에 숨긴 것부터) */
export async function fetchHiddenItemNames(): Promise<HiddenItemName[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("item_name_ignores").select("item_key, name").order("created_at", { ascending: false }).limit(1000);
  if (error) {
    if (isMissing(error)) return [];
    throw new Error(`숨긴 이름을 불러오지 못했어요: ${error.message}`);
  }
  return ((data ?? []) as { item_key: string; name: string }[]).map((r) => ({ key: r.item_key, name: r.name }));
}
