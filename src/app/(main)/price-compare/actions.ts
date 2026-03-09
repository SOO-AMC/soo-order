"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/server";
import type { VendorProductRow } from "@/lib/types/price-compare";
import { logActivity } from "@/lib/utils/activity-log";

type ActionState = {
  error?: string;
  success?: boolean;
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
  quantity: string = "",
  notes: string = ""
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

  const { error } = await supabase.from("unified_products").insert({
    name: trimmed,
    mg: mg.trim(),
    tab: tab.trim(),
    quantity: quantity.trim(),
    notes: notes.trim(),
    sort_order: nextOrder,
  });

  if (error) return { error: `통합 제품 생성 실패: ${error.message}` };

  await logActivity({ userId, userName, category: "price", action: "create_unified_product", description: `${trimmed} 통합제품 등록` });
  revalidatePath("/price-compare");
  return { success: true };
}

export async function updateUnifiedProduct(
  id: string,
  name: string,
  mg: string,
  tab: string,
  quantity: string = "",
  notes: string = ""
): Promise<ActionState> {
  const { supabase, userId, userName } = await requireAdmin();

  const { error } = await supabase
    .from("unified_products")
    .update({ name: name.trim(), mg: mg.trim(), tab: tab.trim(), quantity: quantity.trim(), notes: notes.trim() })
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
