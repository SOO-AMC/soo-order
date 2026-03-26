"use server";

import { requireAdmin } from "@/lib/supabase/server";
import type { Vendor, VendorProduct, UnifiedProduct } from "@/lib/types/price-compare";

const VENDOR_ORDER = ["우리엔팜", "화영", "VS팜", "서수약품"];

async function fetchAll<T>(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  table: string,
  order: string,
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(order)
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export async function fetchPriceCompareData() {
  const { supabase } = await requireAdmin();

  const [vendors, vendorProductData, unifiedProducts] = await Promise.all([
    fetchAll<Vendor>(supabase, "vendors", "name"),
    fetchAll<VendorProduct>(supabase, "vendor_products", "product_name"),
    fetchAll<UnifiedProduct>(supabase, "unified_products", "sort_order"),
  ]);

  const countByVendor = new Map<string, number>();
  for (const p of vendorProductData) {
    countByVendor.set(p.vendor_id, (countByVendor.get(p.vendor_id) ?? 0) + 1);
  }

  const sortedVendors = vendors
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
    vendors: sortedVendors,
    vendorProducts: vendorProductData,
    unifiedProducts,
  };
}
