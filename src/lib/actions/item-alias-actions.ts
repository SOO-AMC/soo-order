"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";

/** 품목명 ↔ 통합제품 매핑 저장 (없으면 추가, 있으면 갱신) */
export async function setItemAlias(rawItemName: string, unifiedProductId: string) {
  const { supabase, userId } = await requireAdmin();
  const itemName = normalizeItemName(rawItemName);
  if (!itemName || !unifiedProductId) throw new Error("잘못된 입력입니다.");

  const { error } = await supabase
    .from("item_name_aliases")
    .upsert(
      { item_name: itemName, unified_product_id: unifiedProductId, created_by: userId },
      { onConflict: "item_name" },
    );

  if (error) throw new Error("품목 매칭 저장에 실패했습니다.");
}

/** 품목명 매핑 해제 (자동 매칭으로 되돌림) */
export async function removeItemAlias(rawItemName: string) {
  const { supabase } = await requireAdmin();
  const itemName = normalizeItemName(rawItemName);
  if (!itemName) return;

  const { error } = await supabase
    .from("item_name_aliases")
    .delete()
    .eq("item_name", itemName);

  if (error) throw new Error("품목 매칭 해제에 실패했습니다.");
}
