import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PriceComparePage } from "@/components/price-compare/price-compare-page";

export const metadata: Metadata = {
  title: "가격 비교",
};

export default async function PriceComparePageRoute() {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/orders");
  }

  const [vendorsResult, vendorProductsResult, unifiedProductsResult] =
    await Promise.all([
      supabase
        .from("vendors")
        .select("*")
        .order("name"),
      supabase
        .from("vendor_products")
        .select("*")
        .order("product_name"),
      supabase
        .from("unified_products")
        .select("*")
        .order("sort_order"),
    ]);

  // Build count map in single pass O(M) instead of O(N*M)
  const vendorProductData = vendorProductsResult.data ?? [];
  const countByVendor = new Map<string, number>();
  for (const p of vendorProductData) {
    countByVendor.set(p.vendor_id, (countByVendor.get(p.vendor_id) ?? 0) + 1);
  }

  const VENDOR_ORDER = ["우리엔팜", "VS팜", "화영", "라라엠케어"];
  const vendors = (vendorsResult.data ?? [])
    .map((v) => ({
      ...v,
      product_count: countByVendor.get(v.id) ?? 0,
    }))
    .sort((a, b) => {
      const ai = VENDOR_ORDER.indexOf(a.name);
      const bi = VENDOR_ORDER.indexOf(b.name);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

  return (
    <PriceComparePage
      vendors={vendors}
      vendorProducts={vendorProductData}
      unifiedProducts={unifiedProductsResult.data ?? []}
    />
  );
}
