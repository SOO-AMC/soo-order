"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/server";
import type { Vendor, VendorProductRow } from "@/lib/types/price-compare";
import { logActivity } from "@/lib/utils/activity-log";
import { buildVendorIndex, vendorKey, type VendorIndex } from "@/lib/utils/vendor-name";

type ActionState = {
  error?: string;
  success?: boolean;
  id?: string;
};

// --- Vendors ---

type AdminClient = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

/**
 * 등록된 업체 찾기 — (주)·띄어쓰기만 다른 이름, "다른 이름"으로 적힌 것도 같은 업체로 본다.
 * 새 업체를 넣기 전에 반드시 거친다. 안 그러면 "(주)지상아이엔씨"와 "지상아이엔씨"처럼 같은 업체가 둘이 된다.
 */
async function loadVendorIndex(supabase: AdminClient): Promise<VendorIndex> {
  const [v, a] = await Promise.all([
    supabase.from("vendors").select("id, name"),
    supabase.from("vendor_aliases").select("vendor_id, alias"), // 표가 없으면 error → 빈 목록
  ]);
  return buildVendorIndex(
    (v.data ?? []) as { id: string; name: string }[],
    ((a.data ?? []) as { vendor_id: string; alias: string }[]).map((x) => ({ vendorId: x.vendor_id, alias: x.alias })),
  );
}

export async function createVendor(name: string): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();

  const trimmed = name.trim();
  if (!trimmed) return { error: "업체명을 입력해주세요." };

  const same = (await loadVendorIndex(supabase)).resolve(trimmed);
  if (same) return { error: `이미 있는 업체예요: ${same.name}` };

  const { error } = await supabase.from("vendors").insert({ name: trimmed });

  if (error) {
    if (error.code === "23505") return { error: "이미 존재하는 업체명입니다." };
    return { error: `업체 생성 실패: ${error.message}` };
  }

  await logActivity({ userId, userName, category: "price", action: "create_vendor", description: `${trimmed} 업체 등록` });
  revalidatePath("/price-compare");
  return { success: true };
}

/**
 * 명세서 스캔에서 신규 업체 등록 — 할인율 지정, 가격비교엔 숨김(show_in_compare=false).
 * 동일 업체명이 이미 있으면 그 업체를 반환한다. 생성된 업체 행을 돌려준다.
 */
export async function createScanVendor(
  name: string,
  discountRate: number,
): Promise<{ error?: string; vendor?: Vendor }> {
  const { supabase, userId, userName } = await requireAdmin();

  const trimmed = name.trim();
  if (!trimmed) return { error: "업체명을 입력해주세요." };
  const clamped = Math.max(0, Math.min(100, discountRate || 0));

  const same = (await loadVendorIndex(supabase)).resolve(trimmed);
  if (same) {
    const { data: existing } = await supabase.from("vendors").select("*").eq("id", same.id).maybeSingle();
    if (existing) return { vendor: existing as Vendor };
  }

  const { data, error } = await supabase
    .from("vendors")
    .insert({ name: trimmed, discount_rate: clamped, show_in_compare: false })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: again } = await supabase.from("vendors").select("*").eq("name", trimmed).maybeSingle();
      if (again) return { vendor: again as Vendor };
    }
    return { error: `업체 등록 실패: ${error.message}` };
  }

  await logActivity({
    userId, userName, category: "price", action: "create_vendor",
    description: `${trimmed} 업체 등록 (명세서 스캔, 할인 ${clamped}%)`,
  });
  revalidatePath("/price-compare");
  return { vendor: data as Vendor };
}

export async function updateVendorDiscountRate(vendorId: string, rate: number): Promise<ActionState> {
  const { supabase } = await requireAdmin();

  const clamped = Math.max(0, Math.min(100, rate));
  const { error } = await supabase
    .from("vendors")
    .update({ discount_rate: clamped })
    .eq("id", vendorId);

  if (error) return { error: `할인율 업데이트 실패: ${error.message}` };

  revalidatePath("/price-compare");
  return { success: true };
}

export async function deleteVendor(vendorId: string, vendorName?: string): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();

  const { error } = await supabase
    .from("vendors")
    .delete()
    .eq("id", vendorId);

  if (error) return { error: `업체 삭제 실패: ${error.message}` };

  await logActivity({ userId, userName, category: "price", action: "delete_vendor", description: `${vendorName ?? vendorId} 업체 삭제` });
  revalidatePath("/price-compare");
  return { success: true };
}

// --- Vendor Products (Excel Upload) ---

export async function uploadVendorProducts(
  vendorId: string,
  products: VendorProductRow[],
  vendorName?: string
): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();

  if (products.length === 0) return { error: "업로드할 제품이 없습니다." };

  // 기존 매핑 보존: product_name → unified_product_id 맵 저장
  const { data: existing } = await supabase
    .from("vendor_products")
    .select("product_name, unified_product_id")
    .eq("vendor_id", vendorId)
    .not("unified_product_id", "is", null);

  const mappingMap = new Map<string, string>();
  if (existing) {
    for (const row of existing) {
      mappingMap.set(row.product_name, row.unified_product_id!);
    }
  }

  // 기존 제품 삭제
  const { error: deleteError } = await supabase
    .from("vendor_products")
    .delete()
    .eq("vendor_id", vendorId);

  if (deleteError) return { error: `기존 제품 삭제 실패: ${deleteError.message}` };

  // 새 제품 삽입 (매핑 복원)
  const rows = products.map((p) => ({
    vendor_id: vendorId,
    product_name: p.product_name,
    manufacturer: p.manufacturer || "",
    spec: p.spec || "",
    unit_price: p.unit_price,
    ingredient: p.ingredient || "",
    category: p.category || "",
    unified_product_id: mappingMap.get(p.product_name) || null,
  }));

  // Supabase 1000 row limit per insert — batch and run in parallel
  const BATCH_SIZE = 500;
  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map((batch) => supabase.from("vendor_products").insert(batch))
  );

  const insertError = results.find((r) => r.error)?.error;
  if (insertError) return { error: `제품 저장 실패: ${insertError.message}` };

  await logActivity({ userId, userName, category: "price", action: "upload_vendor_products", description: `${vendorName ?? vendorId} 업체 제품 업로드 (${products.length}건)` });
  revalidatePath("/price-compare");
  return { success: true };
}

// --- Unified Products ---

export async function createUnifiedProduct(
  name: string,
  mg: string,
  tab: string,
  notes: string = "",
  remarks: string = ""
): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();

  const trimmed = name.trim();
  if (!trimmed) return { error: "제품명을 입력해주세요." };

  // sort_order: 기존 최대값 + 1
  const { data: maxRow } = await supabase
    .from("unified_products")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("unified_products")
    .insert({
      name: trimmed,
      mg: mg.trim(),
      tab: tab.trim(),
      notes: notes.trim(),
      remarks: remarks.trim(),
      sort_order: nextOrder,
    })
    .select("id")
    .single();

  if (error) return { error: `통합 제품 생성 실패: ${error.message}` };

  await logActivity({ userId, userName, category: "price", action: "create_unified_product", description: `${trimmed} 통합제품 등록` });
  revalidatePath("/price-compare");
  return { success: true, id: data.id };
}

export async function updateUnifiedProduct(
  id: string,
  name: string,
  mg: string,
  tab: string,
  notes: string = "",
  remarks: string = ""
): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();

  const { error } = await supabase
    .from("unified_products")
    .update({ name: name.trim(), mg: mg.trim(), tab: tab.trim(), notes: notes.trim(), remarks: remarks.trim() })
    .eq("id", id);

  if (error) return { error: `수정 실패: ${error.message}` };

  await logActivity({ userId, userName, category: "price", action: "update_unified_product", description: `${name.trim()} 통합제품 수정` });
  revalidatePath("/price-compare");
  return { success: true };
}

export async function deleteUnifiedProduct(id: string, productName?: string): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();

  const { error } = await supabase
    .from("unified_products")
    .delete()
    .eq("id", id);

  if (error) return { error: `삭제 실패: ${error.message}` };

  await logActivity({ userId, userName, category: "price", action: "delete_unified_product", description: `${productName ?? id} 통합제품 삭제` });
  revalidatePath("/price-compare");
  return { success: true };
}

// --- 통합 엑셀 업로드 ---

interface PriceUploadProduct {
  category: string;
  name: string;
  remarks: string;
  vendorPrices: Record<string, number | null>;
}

export async function uploadPriceExcel(
  products: PriceUploadProduct[],
  vendorNames: string[],
  mode: "overwrite" | "merge"
): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();

  if (products.length === 0) return { error: "업로드할 제품이 없습니다." };

  // 1. vendors: 기존 조회 + 새 업체 생성
  //    (주)·띄어쓰기만 다른 이름은 새로 만들지 않고 기존 업체에 붙인다
  const vendorIndex = await loadVendorIndex(supabase);
  const vendorMap = new Map<string, string>();
  const createdByKey = new Map<string, string>(); // 이번 엑셀 안에서 표기만 다른 새 업체가 둘 나오는 경우

  for (const name of vendorNames) {
    const same = vendorIndex.resolve(name);
    if (same) vendorMap.set(name, same.id);
    else if (createdByKey.has(vendorKey(name))) vendorMap.set(name, createdByKey.get(vendorKey(name))!);
    if (!vendorMap.has(name)) {
      const { data: newVendor, error } = await supabase
        .from("vendors")
        .insert({ name })
        .select("id")
        .single();
      if (error) return { error: `업체 생성 실패 (${name}): ${error.message}` };
      vendorMap.set(name, newVendor.id);
      createdByKey.set(vendorKey(name), newVendor.id);
    }
  }

  // 2. 덮어쓰기 모드: 기존 데이터 삭제
  if (mode === "overwrite") {
    await supabase.from("vendor_products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("unified_products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }

  // 3. 병합 모드: 기존 unified_products name → id 맵
  const existingUnifiedMap = new Map<string, string>();
  if (mode === "merge") {
    const { data: existing } = await supabase.from("unified_products").select("id, name");
    for (const u of existing ?? []) {
      existingUnifiedMap.set(u.name, u.id);
    }
  }

  // 4. unified_products 생성/업데이트 — 제품명 기준 deduplicate (마지막 항목 우선)
  const { data: maxRow } = await supabase
    .from("unified_products")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  let nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const deduped = new Map<string, typeof products[number]>();
  for (const p of products) {
    deduped.set(p.name, p);
  }

  const BATCH_SIZE = 500;
  const unifiedIds = new Map<string, string>();

  // 기존 항목 업데이트
  const updateRows = [...deduped.values()]
    .filter((p) => existingUnifiedMap.has(p.name))
    .map((p) => ({
      id: existingUnifiedMap.get(p.name)!,
      name: p.name,
      mg: "",
      tab: "",
      notes: p.category,
      remarks: p.remarks,
      sort_order: nextOrder++,
    }));

  for (let i = 0; i < updateRows.length; i += BATCH_SIZE) {
    const batch = updateRows.slice(i, i + BATCH_SIZE);
    const { data: upserted, error } = await supabase
      .from("unified_products")
      .upsert(batch, { onConflict: "id" })
      .select("id, name");
    if (error) return { error: `통합제품 업데이트 실패: ${error.message}` };
    for (const u of upserted ?? []) {
      unifiedIds.set(u.name, u.id);
    }
  }

  // 신규 항목 삽입
  const insertRows = [...deduped.values()]
    .filter((p) => !existingUnifiedMap.has(p.name))
    .map((p) => ({
      name: p.name,
      mg: "",
      tab: "",
      notes: p.category,
      remarks: p.remarks,
      sort_order: nextOrder++,
    }));

  for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
    const batch = insertRows.slice(i, i + BATCH_SIZE);
    const { data: inserted, error } = await supabase
      .from("unified_products")
      .insert(batch)
      .select("id, name");
    if (error) return { error: `통합제품 신규 저장 실패: ${error.message}` };
    for (const u of inserted ?? []) {
      unifiedIds.set(u.name, u.id);
    }
  }

  // 기존 항목 중 upsert 응답에 누락된 ID 보충
  for (const [name, id] of existingUnifiedMap) {
    if (!unifiedIds.has(name)) {
      unifiedIds.set(name, id);
    }
  }

  // 5. vendor_products 생성
  // 병합 모드: 해당 업체의 기존 제품 중 이번 업로드 unified에 매핑된 것 삭제
  if (mode === "merge") {
    const uploadedUnifiedIds = [...unifiedIds.values()];
    for (const vendorName of vendorNames) {
      const vendorId = vendorMap.get(vendorName);
      if (!vendorId) continue;
      await supabase
        .from("vendor_products")
        .delete()
        .eq("vendor_id", vendorId)
        .in("unified_product_id", uploadedUnifiedIds);
    }
  }

  const vendorProductRows: {
    vendor_id: string;
    product_name: string;
    manufacturer: string;
    spec: string;
    unit_price: number | null;
    ingredient: string;
    category: string;
    unified_product_id: string | null;
  }[] = [];

  for (const p of products) {
    const unifiedId = unifiedIds.get(p.name) ?? null;
    for (const vendorName of vendorNames) {
      const vendorId = vendorMap.get(vendorName);
      if (!vendorId) continue;
      const price = p.vendorPrices[vendorName] ?? null;
      vendorProductRows.push({
        vendor_id: vendorId,
        product_name: p.name,
        manufacturer: "",
        spec: "",
        unit_price: price,
        ingredient: "",
        category: p.category,
        unified_product_id: unifiedId,
      });
    }
  }

  for (let i = 0; i < vendorProductRows.length; i += BATCH_SIZE) {
    const batch = vendorProductRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("vendor_products").insert(batch);
    if (error) return { error: `업체 제품 저장 실패: ${error.message}` };
  }

  await logActivity({
    userId, userName, category: "price", action: "upload_price_excel",
    description: `통합 엑셀 업로드 (${mode === "overwrite" ? "덮어쓰기" : "병합"}, ${products.length}개 제품, ${vendorNames.length}개 업체)`,
  });
  revalidatePath("/price-compare");
  return { success: true };
}

// --- 인라인 가격 편집 ---

export async function upsertVendorPrice(
  unifiedProductId: string,
  vendorId: string,
  price: number | null,
  productName: string,
  /** 고치기 전에 화면에 보이던 저장값(할인후). 같은 값의 중복 줄만 함께 고치는 데 쓴다 */
  previousPrice?: number | null,
): Promise<ActionState> {
  const { supabase } = await requireAdmin();

  // 같은 업체·같은 표준 품목의 줄이 여러 개 있을 수 있다(예전 저장 방식 때문에 중복이 쌓였다).
  // 한 줄만 찾으려 하면(maybeSingle) 여러 줄일 때 "없음"으로 보고 **또 한 줄을 더해** 중복이 늘고,
  // 화면에는 고치기 전 줄이 보여 "바꿨는데 안 바뀐" 것처럼 된다.
  const { data: existing, error: findError } = await supabase
    .from("vendor_products")
    .select("id, unit_price")
    .eq("vendor_id", vendorId)
    .eq("unified_product_id", unifiedProductId);
  if (findError) return { error: `가격 조회 실패: ${findError.message}` };

  if (existing && existing.length > 0) {
    // 고칠 줄: 화면에 보이던 값과 같은 줄(진짜 중복)만. 값이 다른 줄은 포장이 다른 품목이
    // 한 표준 품목에 묶인 것일 수 있어 건드리지 않는다. 같은 값의 줄이 없으면 전부 고친다.
    const same = previousPrice === undefined ? [] : existing.filter((r) => (r.unit_price == null ? null : Number(r.unit_price)) === previousPrice);
    const ids = (same.length > 0 ? same : existing).map((r) => r.id);
    const { error } = await supabase.from("vendor_products").update({ unit_price: price }).in("id", ids);
    if (error) return { error: `가격 수정 실패: ${error.message}` };
  } else {
    const { error } = await supabase.from("vendor_products").insert({
      vendor_id: vendorId,
      unified_product_id: unifiedProductId,
      product_name: productName,
      unit_price: price,
      manufacturer: "",
      spec: "",
      ingredient: "",
      category: "",
    });
    if (error) return { error: `가격 저장 실패: ${error.message}` };
  }

  revalidatePath("/price-compare");
  return { success: true };
}

// --- Mapping ---

export async function mapProduct(
  vendorProductId: string,
  unifiedProductId: string
): Promise<ActionState> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("vendor_products")
    .update({ unified_product_id: unifiedProductId })
    .eq("id", vendorProductId);

  if (error) return { error: `매핑 실패: ${error.message}` };

  revalidatePath("/price-compare");
  return { success: true };
}

export async function unmapProduct(
  vendorProductId: string
): Promise<ActionState> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("vendor_products")
    .update({ unified_product_id: null })
    .eq("id", vendorProductId);

  if (error) return { error: `매핑 해제 실패: ${error.message}` };

  revalidatePath("/price-compare");
  return { success: true };
}
