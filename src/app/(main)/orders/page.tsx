import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderList } from "@/components/orders/order-list";
import { fetchPriceCompareData } from "@/lib/actions/price-compare-action";
import { createClient } from "@/lib/supabase/server";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import type { OrderWithRequester } from "@/lib/types/order";

export const metadata: Metadata = {
  title: "주문",
};

export default async function OrdersPage() {
  const supabase = await createClient();
  const [{ vendors, vendorProducts, unifiedProducts, itemAliases }, ordersRes, lastVendorRes] =
    await Promise.all([
      fetchPriceCompareData(),
      supabase
        .from("orders")
        .select("*, requester:profiles!requester_id(full_name)")
        .eq("type", "order")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase.rpc("get_last_vendor_by_item"),
    ]);

  const initialOrders = (ordersRes.data as OrderWithRequester[] | null) ?? [];
  const initialLastVendors: Record<string, string> = {};
  for (const row of (lastVendorRes.data as { item_name: string; vendor_name: string }[] | null) ?? []) {
    const key = normalizeItemName(row.item_name);
    if (key && !(key in initialLastVendors)) initialLastVendors[key] = row.vendor_name;
  }

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-card px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">주문</h1>
        <Button size="icon" asChild>
          <Link href="/orders/new">
            <Plus />
          </Link>
        </Button>
      </header>
      <div className="p-4">
        <OrderList
          initialPriceData={{ vendors, products: vendorProducts, unified: unifiedProducts, aliases: itemAliases }}
          initialOrders={initialOrders}
          initialLastVendors={initialLastVendors}
        />
      </div>
    </div>
  );
}
