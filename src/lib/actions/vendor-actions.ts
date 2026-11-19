"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { chunk, fetchAllPages } from "@/lib/supabase/paginate";
import { logActivity } from "@/lib/utils/activity-log";
import { buildVendorIndex, looksLikeOwnHospital, suggestVendors, vendorKey } from "@/lib/utils/vendor-name";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import type { UnlinkedName, VendorActionResult, VendorDirectory, VendorEntry, VendorNameEvidence, VendorOption } from "@/lib/types/vendor";

/**
 * 업체 관리 (관리자 전용).
 * 주문의 업체 이름은 글자로 저장된다. "표준 이름" = vendors.name 이고,
 * 다른 모양으로 적힌 이름은 vendor_aliases(다른 이름)로 연결한다.
 * 기존 주문의 이름을 고치는 일은 전부 DB 함수(migrate-vendor-unify.sql)가 한다 —
 * 한 번에 처리되고(중간에 끊겨도 반쯤 고쳐진 상태가 남지 않음) 주문의 수정 시각을 건드리지 않는다.
 */

type Admin = Awaited<ReturnType<typeof requireAdmin>>;

interface VendorRow {
  id: string;
  name: string;
  discount_rate: number | null;
  show_in_compare: boolean | null;
}
interface AliasRow {
  id: string;
  vendor_id: string;
  alias: string;
}
interface UsageRow {
  name: string;
  n: number;
  last_at: string | null;
  inv_n: number;
  inv_vendor_id: string | null;
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const ok = <T>(data: T): { ok: true; data: T } => ({ ok: true, data });

/** DB 함수·표가 아직 없는 경우(마이그레이션 미실행) */
const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST202" || e.code === "PGRST205" || e.code === "42883" || e.code === "42P01" || /could not find|does not exist/i.test(e.message ?? ""));

const NOT_READY = "업체 정리 기능이 아직 준비되지 않았어요. supabase/migrate-vendor-unify.sql 을 먼저 실행해 주세요.";

async function loadVendors(supabase: Admin["supabase"]): Promise<VendorRow[]> {
  const { data, error } = await supabase.from("vendors").select("id, name, discount_rate, show_in_compare").order("name");
  if (error) throw new Error(`업체 목록을 불러오지 못했어요: ${error.message}`);
  return (data ?? []) as VendorRow[];
}

/** 다른 이름 목록. 표가 아직 없으면 null */
async function loadAliases(supabase: Admin["supabase"]): Promise<AliasRow[] | null> {
  const { data, error } = await supabase.from("vendor_aliases").select("id, vendor_id, alias").order("alias");
  if (error) {
    if (isMissing(error)) return null;
    throw new Error(`업체의 다른 이름을 불러오지 못했어요: ${error.message}`);
  }
  return (data ?? []) as AliasRow[];
}

/** 업체 고르기용 목록 (발주 창·명세서 스캔). 마이그레이션 전에도 업체 이름만으로 동작한다. */
export async function fetchVendorOptions(): Promise<VendorOption[]> {
  const { supabase } = await requireAdmin();
  const [vendors, aliases] = await Promise.all([loadVendors(supabase), loadAliases(supabase)]);
  const byVendor = new Map<string, string[]>();
  for (const a of aliases ?? []) byVendor.set(a.vendor_id, [...(byVendor.get(a.vendor_id) ?? []), a.alias]);
  return vendors.map((v) => ({ id: v.id, name: v.name, aliases: byVendor.get(v.id) ?? [] }));
}

/** 업체 목록 + 정리할 이름 */
export async function fetchVendorDirectory(): Promise<VendorDirectory> {
  const { supabase } = await requireAdmin();
  const [vendors, aliases] = await Promise.all([loadVendors(supabase), loadAliases(supabase)]);
  if (aliases == null) return { ready: false, vendors: [], unlinked: [] };

  const usageRes = await supabase.rpc("order_vendor_usage");
  if (usageRes.error) {
    if (isMissing(usageRes.error)) return { ready: false, vendors: [], unlinked: [] };
    throw new Error(`주문의 업체 이름을 불러오지 못했어요: ${usageRes.error.message}`);
  }
  const usage = (usageRes.data ?? []) as UsageRow[];

  const invoices = await fetchAllPages<{ vendor_id: string | null }>(
    (from, to) => supabase.from("invoices").select("vendor_id").order("id").range(from, to),
    { label: "명세서 목록" },
  );
  const invoiceCount = new Map<string, number>();
  for (const i of invoices) if (i.vendor_id) invoiceCount.set(i.vendor_id, (invoiceCount.get(i.vendor_id) ?? 0) + 1);

  const lite = vendors.map((v) => ({ id: v.id, name: v.name }));
  const aliasLite = aliases.map((a) => ({ vendorId: a.vendor_id, alias: a.alias }));
  const index = buildVendorIndex(lite, aliasLite);
  const byId = new Map(lite.map((v) => [v.id, v] as const));
  const exactNames = new Set(vendors.map((v) => v.name));
  const orderCount = new Map(usage.map((u) => [u.name, u.n] as const));

  const entries: VendorEntry[] = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    discountRate: Number(v.discount_rate) || 0,
    showInCompare: v.show_in_compare !== false,
    aliases: aliases.filter((a) => a.vendor_id === v.id).map((a) => ({ id: a.id, alias: a.alias })),
    orderCount: orderCount.get(v.name) ?? 0,
    invoiceCount: invoiceCount.get(v.id) ?? 0,
  }));

  const unlinked: UnlinkedName[] = usage
    .filter((u) => !exactNames.has(u.name))
    .map((u) => {
      const auto = index.resolve(u.name);
      const own = looksLikeOwnHospital(u.name);
      return {
        name: u.name,
        count: u.n,
        lastAt: u.last_at,
        autoTarget: auto,
        suggestions: auto || own ? [] : suggestVendors(u.name, lite, aliasLite),
        invoiceCount: u.inv_n ?? 0,
        invoiceVendor: (u.inv_vendor_id && byId.get(u.inv_vendor_id)) || null,
        ownHospital: own,
      };
    });

  return { ready: true, vendors: entries, unlinked };
}

/**
 * "정리할 이름"의 근거. 업체 칸에 업체 이름이 아닌 글자(품목명·메모·우리 병원 이름 등)가 적힌 경우가 많아서,
 * 이름만 보고는 어느 업체인지 고르기 어렵다 → 그 이름이 적힌 주문(품목·메모·누가), 연결된 명세서(어느 업체 명세서였나),
 * 그 품목들을 가격표에 가진 업체를 함께 보여 준다. 읽기만 한다.
 */
export async function fetchVendorNameEvidence(name: string): Promise<VendorNameEvidence> {
  const { supabase } = await requireAdmin();
  const SHOW = 8;
  const SAMPLE = 40;

  const { data: rows, error, count } = await supabase
    .from("orders")
    .select(
      "id, item_name, quantity, unit, status, created_at, dispatched_at, notes, order_notes, inspection_notes, inspection_memo, requester:profiles!requester_id(full_name), updater:profiles!updated_by(full_name)",
      { count: "exact" },
    )
    .eq("vendor_name", name)
    .order("created_at", { ascending: false })
    .limit(SAMPLE);
  if (error) throw new Error(`주문을 불러오지 못했어요: ${error.message}`);

  type Row = {
    id: string; item_name: string; quantity: number; unit: string; status: string; created_at: string; dispatched_at: string | null;
    notes: string | null; order_notes: string | null; inspection_notes: string | null; inspection_memo: string | null;
    requester: { full_name: string | null } | { full_name: string | null }[] | null;
    updater: { full_name: string | null } | { full_name: string | null }[] | null;
  };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const list = (rows ?? []) as unknown as Row[];

  const orders = list.slice(0, SHOW).map((o) => ({
    id: o.id,
    itemName: o.item_name,
    quantity: o.quantity,
    unit: o.unit,
    status: o.status,
    createdAt: o.created_at,
    dispatchedAt: o.dispatched_at,
    requester: one(o.requester)?.full_name ?? null,
    updater: one(o.updater)?.full_name ?? null,
    notes: [o.notes, o.order_notes, o.inspection_notes, o.inspection_memo].map((t) => (t ?? "").trim()).filter((t, i, a) => t && a.indexOf(t) === i),
  }));

  // 연결된 명세서 (명세서 확정 때 이 주문과 맞춰진 줄)
  const ids = list.map((o) => o.id);
  const { data: lineRows } = ids.length
    ? await supabase
        .from("invoice_items")
        .select("name, quantity, matched_order_id, invoices(id, vendor_id, vendor_name, invoice_date, total_amount, image_urls, vendors(name))")
        .in("matched_order_id", ids)
    : { data: [] };
  type LineRow = {
    name: string | null; quantity: number | null;
    invoices: { id: string; vendor_id: string | null; vendor_name: string | null; invoice_date: string | null; total_amount: number | null; image_urls: string[] | null; vendors: { name: string } | { name: string }[] | null } | null;
  };
  const invMap = new Map<string, VendorNameEvidence["invoices"][number]>();
  for (const l of (lineRows ?? []) as unknown as LineRow[]) {
    const inv = Array.isArray(l.invoices) ? l.invoices[0] : l.invoices;
    if (!inv) continue;
    const cur: VendorNameEvidence["invoices"][number] = invMap.get(inv.id) ?? {
      id: inv.id,
      date: inv.invoice_date,
      readName: inv.vendor_name,
      vendorId: inv.vendor_id,
      vendorName: one(inv.vendors)?.name ?? null,
      totalAmount: inv.total_amount,
      lines: [] as string[],
      filePath: inv.image_urls?.[0] ?? null,
    };
    if (l.name && cur.lines.length < 6) cur.lines.push(`${l.name}${l.quantity ? ` × ${l.quantity}` : ""}`);
    invMap.set(inv.id, cur);
  }
  const invoices = [...invMap.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 5);

  // 품목 → 표준 품목(item_name_aliases) → 그 품목을 가격표에 가진 업체
  const keys = [...new Set(list.map((o) => normalizeItemName(o.item_name)).filter(Boolean))];
  const carriers: VendorNameEvidence["carriers"] = [];
  let linkedItems = 0;
  if (keys.length) {
    const { data: links } = await supabase.from("item_name_aliases").select("item_name, unified_product_id").in("item_name", keys);
    const upIds = [...new Set((links ?? []).map((l) => l.unified_product_id as string))];
    linkedItems = upIds.length;
    if (upIds.length) {
      const vp: { vendor_id: string; unified_product_id: string }[] = [];
      for (const part of chunk(upIds, 100)) {
        const { data } = await supabase.from("vendor_products").select("vendor_id, unified_product_id").in("unified_product_id", part);
        vp.push(...((data ?? []) as { vendor_id: string; unified_product_id: string }[]));
      }
      const per = new Map<string, Set<string>>();
      for (const r of vp) per.set(r.vendor_id, (per.get(r.vendor_id) ?? new Set()).add(r.unified_product_id));
      const vendorIds = [...per.keys()];
      if (vendorIds.length) {
        const { data: vs } = await supabase.from("vendors").select("id, name").in("id", vendorIds.slice(0, 100));
        for (const v of (vs ?? []) as { id: string; name: string }[]) carriers.push({ id: v.id, name: v.name, items: per.get(v.id)?.size ?? 0 });
        carriers.sort((a, b) => b.items - a.items || a.name.localeCompare(b.name, "ko"));
      }
    }
  }

  return { orders, total: count ?? list.length, invoices, carriers: carriers.slice(0, 6), linkedItems };
}

async function rewrite(supabase: Admin["supabase"], from: string, to: string): Promise<VendorActionResult<number>> {
  const { data, error } = await supabase.rpc("rewrite_order_vendor_name", { p_from: from, p_to: to });
  if (error) return fail(isMissing(error) ? NOT_READY : `주문의 업체 이름을 고치지 못했어요: ${error.message}`);
  return ok(Number(data) || 0);
}

/**
 * 주문에 적힌 이름(name)을 업체(vendorId)의 표준 이름으로 고친다.
 * remember 가 true 면 "다른 이름"으로도 기억해서, 앞으로 같은 글자가 들어오면 자동으로 맞춘다.
 */
export async function linkVendorName(name: string, vendorId: string, remember: boolean): Promise<VendorActionResult<number>> {
  const admin = await requireAdmin();
  const { supabase } = admin;
  const { data: vendor } = await supabase.from("vendors").select("id, name").eq("id", vendorId).maybeSingle();
  if (!vendor) return fail("업체를 찾을 수 없어요.");

  // (주)·띄어쓰기만 다른 이름은 이미 자동으로 맞춰지므로 따로 기억할 필요가 없다
  if (remember && vendorKey(name) && vendorKey(name) !== vendorKey(vendor.name)) {
    const { error } = await supabase.from("vendor_aliases").insert({ vendor_id: vendorId, alias: name.trim() });
    if (error && error.code !== "23505") return fail(isMissing(error) ? NOT_READY : `다른 이름으로 기억하지 못했어요: ${error.message}`);
    if (error?.code === "23505") {
      // 이미 등록된 다른 이름 — 같은 업체면 문제없고, 다른 업체면 알려 준다
      const aliases = (await loadAliases(supabase)) ?? [];
      const owner = aliases.find((a) => vendorKey(a.alias) === vendorKey(name));
      if (owner && owner.vendor_id !== vendorId) return fail(`"${name.trim()}"은(는) 이미 다른 업체의 다른 이름으로 등록돼 있어요. 업체 목록에서 먼저 지워 주세요.`);
    }
  }

  const res = await rewrite(supabase, name, vendor.name);
  if (res.ok) {
    void logActivity({
      userId: admin.userId, userName: admin.userName, category: "price", action: "vendor_link",
      description: `업체 이름 정리: "${name}" → ${vendor.name} (${res.data}건${remember ? ", 다음부터 자동" : ""})`,
      metadata: { from: name, to: vendor.name, count: res.data, remember },
    });
  }
  return res;
}

/** (주)·띄어쓰기만 달라서 바로 정리할 수 있는 이름을 한 번에 고친다 */
export async function autoLinkVendorNames(): Promise<VendorActionResult<{ names: number; orders: number }>> {
  const admin = await requireAdmin();
  const dir = await fetchVendorDirectory();
  if (!dir.ready) return fail(NOT_READY);
  let names = 0;
  let orders = 0;
  for (const u of dir.unlinked) {
    if (!u.autoTarget) continue;
    const res = await rewrite(admin.supabase, u.name, u.autoTarget.name);
    if (!res.ok) return fail(`${names}개 이름까지 정리하고 멈췄어요. ${res.error}`);
    names += 1;
    orders += res.data;
  }
  if (names > 0) {
    void logActivity({
      userId: admin.userId, userName: admin.userName, category: "price", action: "vendor_auto_link",
      description: `업체 이름 자동 정리: 이름 ${names}개, 주문 ${orders}건`,
      metadata: { names, orders },
    });
  }
  return ok({ names, orders });
}

/** 이 이름의 주문 중 명세서와 연결된 것을, 그 명세서의 업체로 고친다 */
export async function linkVendorNameByInvoice(name: string): Promise<VendorActionResult<number>> {
  const admin = await requireAdmin();
  const { data, error } = await admin.supabase.rpc("link_orders_by_invoice", { p_name: name });
  if (error) return fail(isMissing(error) ? NOT_READY : `명세서 기준으로 고치지 못했어요: ${error.message}`);
  const n = Number(data) || 0;
  void logActivity({
    userId: admin.userId, userName: admin.userName, category: "price", action: "vendor_link_by_invoice",
    description: `업체 이름 정리(명세서 기준): "${name}" ${n}건`,
    metadata: { from: name, count: n },
  });
  return ok(n);
}

/** 업체가 아닌 글자("1", "?" 등)를 "업체 없음"으로 정리한다. 원래 글자는 보관된다. */
export async function clearVendorName(name: string): Promise<VendorActionResult<number>> {
  const admin = await requireAdmin();
  const res = await rewrite(admin.supabase, name, "");
  if (res.ok) {
    void logActivity({
      userId: admin.userId, userName: admin.userName, category: "price", action: "vendor_clear",
      description: `업체 이름 정리: "${name}" → 업체 없음 (${res.data}건)`,
      metadata: { from: name, count: res.data },
    });
  }
  return res;
}

/**
 * 새 업체 등록. 이미 같은 업체(표기만 다른 이름·다른 이름 포함)가 있으면 그 업체를 돌려준다.
 * 가격 비교표에는 나오지 않게 등록한다(주력 업체는 가격 비교에서 따로 켠다).
 */
export async function registerVendor(name: string): Promise<VendorActionResult<VendorOption & { existed: boolean }>> {
  const admin = await requireAdmin();
  const { supabase } = admin;
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!vendorKey(trimmed)) return fail("업체 이름을 적어 주세요.");
  if (looksLikeOwnHospital(trimmed)) return fail("우리 병원 이름으로 보여요. 업체 이름을 적어 주세요.");

  const [vendors, aliases] = await Promise.all([loadVendors(supabase), loadAliases(supabase)]);
  const index = buildVendorIndex(
    vendors.map((v) => ({ id: v.id, name: v.name })),
    (aliases ?? []).map((a) => ({ vendorId: a.vendor_id, alias: a.alias })),
  );
  const existing = index.resolve(trimmed);
  if (existing) return ok({ id: existing.id, name: existing.name, aliases: index.aliasesOf(existing.id), existed: true });

  const { data, error } = await supabase
    .from("vendors")
    .insert({ name: trimmed, discount_rate: 0, show_in_compare: false })
    .select("id, name")
    .single();
  if (error || !data) return fail(error?.code === "23505" ? "같은 이름의 업체가 이미 있어요." : `업체를 등록하지 못했어요: ${error?.message ?? ""}`);

  // 주문에 앞뒤 공백 등이 섞여 적힌 같은 이름이 있으면 함께 맞춘다
  if (name !== trimmed) await rewrite(supabase, name, trimmed);

  void logActivity({
    userId: admin.userId, userName: admin.userName, category: "price", action: "create_vendor",
    description: `업체 등록: ${trimmed}`,
    metadata: { vendorId: data.id, name: trimmed },
  });
  return ok({ id: data.id, name: data.name, aliases: [], existed: false });
}

/** 업체에 "다른 이름"을 더한다 */
export async function addVendorAlias(vendorId: string, alias: string): Promise<VendorActionResult> {
  const { supabase } = await requireAdmin();
  const trimmed = alias.trim();
  if (!vendorKey(trimmed)) return fail("다른 이름을 적어 주세요.");
  const { data: vendor } = await supabase.from("vendors").select("name").eq("id", vendorId).maybeSingle();
  if (!vendor) return fail("업체를 찾을 수 없어요.");
  if (vendorKey(trimmed) === vendorKey(vendor.name)) return fail("표기만 다른 이름은 이미 자동으로 같은 업체로 봐요.");
  const { error } = await supabase.from("vendor_aliases").insert({ vendor_id: vendorId, alias: trimmed });
  if (error) {
    if (error.code === "23505") return fail("이미 등록된 이름이에요. (다른 업체에 걸려 있을 수 있어요)");
    return fail(isMissing(error) ? NOT_READY : `더하지 못했어요: ${error.message}`);
  }
  return ok(undefined);
}

export async function removeVendorAlias(aliasId: string): Promise<VendorActionResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("vendor_aliases").delete().eq("id", aliasId);
  if (error) return fail(`지우지 못했어요: ${error.message}`);
  return ok(undefined);
}

/** 업체 이름 바꾸기 — 그 이름으로 적힌 주문도 함께 바뀌고, 옛 이름은 다른 이름으로 남는다 */
export async function renameVendor(vendorId: string, name: string): Promise<VendorActionResult<number>> {
  const admin = await requireAdmin();
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!vendorKey(trimmed)) return fail("업체 이름을 적어 주세요.");
  const { data, error } = await admin.supabase.rpc("rename_vendor", { p_id: vendorId, p_name: trimmed });
  if (error) return fail(isMissing(error) ? NOT_READY : error.message);
  void logActivity({
    userId: admin.userId, userName: admin.userName, category: "price", action: "vendor_rename",
    description: `업체 이름 변경: ${trimmed} (주문 ${Number(data) || 0}건 함께 변경)`,
    metadata: { vendorId, name: trimmed, orders: Number(data) || 0 },
  });
  return ok(Number(data) || 0);
}

/** 업체 합치기 — fromId 를 intoId 에 합치고 fromId 는 지운다. 되돌릴 수 없다. */
export async function mergeVendors(fromId: string, intoId: string): Promise<VendorActionResult<{ orders: number; invoices: number; products: number }>> {
  const admin = await requireAdmin();
  const { supabase } = admin;
  if (fromId === intoId) return fail("같은 업체끼리는 합칠 수 없어요.");
  const { data: from } = await supabase.from("vendors").select("name, show_in_compare").eq("id", fromId).maybeSingle();
  if (!from) return fail("합칠 업체를 찾을 수 없어요.");
  // 가격 비교표의 열(주력 업체)이 통째로 사라지는 것은 막는다
  if (from.show_in_compare !== false) return fail(`${from.name}은(는) 가격 비교표에 나오는 업체라 없앨 수 없어요. 반대 방향으로 합쳐 주세요.`);

  const { data, error } = await supabase.rpc("merge_vendors", { p_from: fromId, p_into: intoId });
  if (error) return fail(isMissing(error) ? NOT_READY : `합치지 못했어요: ${error.message}`);
  const r = (data ?? {}) as { orders?: number; invoices?: number; products?: number; from?: string; into?: string };
  void logActivity({
    userId: admin.userId, userName: admin.userName, category: "price", action: "vendor_merge",
    description: `업체 합치기: ${r.from ?? from.name} → ${r.into ?? ""} (주문 ${r.orders ?? 0}건, 명세서 ${r.invoices ?? 0}장)`,
    metadata: { fromId, intoId, ...r },
  });
  return ok({ orders: r.orders ?? 0, invoices: r.invoices ?? 0, products: r.products ?? 0 });
}

/**
 * 업체별 품목 이름 기억: "이 업체의 명세서에 이 이름으로 찍힌 품목 = 가격표의 이 줄".
 * 명세서를 확정할 때 쌓이고(DB 함수 confirm_invoice), 다음 명세서부터 이름을 추측하지 않고 그대로 연결한다.
 * 표가 아직 없으면(supabase/migrate-invoice-confirm.sql 미실행) 빈 목록.
 */
export async function fetchVendorItemMemory(): Promise<{ vendorId: string; nameKey: string; vendorProductId: string }[]> {
  const { supabase } = await requireAdmin();
  try {
    const rows = await fetchAllPages<{ vendor_id: string; name_key: string; vendor_product_id: string }>(
      (from, to) => supabase.from("vendor_item_memory").select("vendor_id, name_key, vendor_product_id").order("vendor_id").order("name_key").range(from, to),
      { label: "품목 이름 기억" },
    );
    return rows.map((r) => ({ vendorId: r.vendor_id, nameKey: r.name_key, vendorProductId: r.vendor_product_id }));
  } catch {
    return [];
  }
}
