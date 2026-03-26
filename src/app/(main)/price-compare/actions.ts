"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/server";
import type { VendorProductRow } from "@/lib/types/price-compare";
import { logActivity } from "@/lib/utils/activity-log";

type ActionState = {
  error?: string;
  success?: boolean;
  id?: string;
};

// --- Vendors ---

export async function createVendor(name: string): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();

  const trimmed = name.trim();
  if (!trimmed) return { error: "업체명을 입력해주세요." };

  const { error } = await supabase.from("vendors").insert({ name: trimmed });

  if (error) {
    if (error.code === "23505") return { error: "이미 존재하는 업체명입니다." };
    return { error: `업체 생성 실패: ${error.message}` };
  }

  await logActivity({ userId, userName, category: "price", action: "create_vendor", description: `${trimmed} 업체 등록` });
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
  const { data: existingVendors } = await supabase.from("vendors").select("id, name");
  const vendorMap = new Map<string, string>();
  for (const v of existingVendors ?? []) {
    vendorMap.set(v.name, v.id);
  }

  for (const name of vendorNames) {
    if (!vendorMap.has(name)) {
      const { data: newVendor, error } = await supabase
        .from("vendors")
        .insert({ name })
        .select("id")
        .single();
      if (error) return { error: `업체 생성 실패 (${name}): ${error.message}` };
      vendorMap.set(name, newVendor.id);
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
): Promise<ActionState> {
  const { supabase } = await requireAdmin();

  const { data: existing } = await supabase
    .from("vendor_products")
    .select("id")
    .eq("vendor_id", vendorId)
    .eq("unified_product_id", unifiedProductId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("vendor_products")
      .update({ unit_price: price })
      .eq("id", existing.id);
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
