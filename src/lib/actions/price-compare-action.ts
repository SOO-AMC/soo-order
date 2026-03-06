"use server";

import { createClient } from "@/lib/supabase/server";
import type { Vendor, VendorProduct, UnifiedProduct } from "@/lib/types/price-compare";

const VENDOR_ORDER = ["우리엔팜", "VS팜", "화영", "라라엠케어"];

export async function fetchPriceCompareData() {
  const supabase = await createClient();

  const [vendorsResult, vendorProductsResult, unifiedProductsResult] =
    await Promise.all([
      supabase.from("vendors").select("*").order("name"),
      supabase.from("vendor_products").select("*").order("product_name"),
      supabase.from("unified_products").select("*").order("sort_order"),
    ]);

  const vendorProductData = (vendorProductsResult.data ?? []) as VendorProduct[];
  const countByVendor = new Map<string, number>();
  for (const p of vendorProductData) {
    countByVendor.set(p.vendor_id, (countByVendor.get(p.vendor_id) ?? 0) + 1);
  }

  const vendors = ((vendorsResult.data ?? []) as Vendor[])
    .map((v) => ({
      ...v,
      product_count: countByVendor.get(v.id) ?? 0,
    }))
    .sort((a, b) => {
      const ai = VENDOR_ORDER.indexOf(a.name);
      const bi = VENDOR_ORDER.indexOf(b.name);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

  return {
    vendors,
    vendorProducts: vendorProductData,
    unifiedProducts: (unifiedProductsResult.data ?? []) as UnifiedProduct[],
  };
}
