import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderList } from "@/components/orders/order-list";
import { createClient } from "@/lib/supabase/server";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import type { OrderWithRequester } from "@/lib/types/order";

export const metadata: Metadata = {
  title: "주문",
};

export default async function OrdersPage() {
  const supabase = await createClient();
  // 가격비교 데이터는 무겁고 팝업 열 때만 필요하므로 페이지 렌더를 막지 않음
  // (vendor-price-popover 모듈이 클라이언트 마운트 시 백그라운드로 프리페치함)
  const [ordersRes, historyRes] = await Promise.all([
    supabase
      .from("orders")
      .select("*, requester:profiles!requester_id(full_name)")
      .eq("type", "order")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("item_name, vendor_name, created_at")
      .eq("type", "order")
      .neq("vendor_name", "")
      .order("created_at", { ascending: false })
      .limit(1500),
  ]);

  const initialOrders = (ordersRes.data as OrderWithRequester[] | null) ?? [];
  const initialLastVendors: Record<string, string> = {};
  for (const row of (historyRes.data as { item_name: string; vendor_name: string }[] | null) ?? []) {
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
        <OrderList initialOrders={initialOrders} initialLastVendors={initialLastVendors} />
      </div>
    </div>
  );
}
