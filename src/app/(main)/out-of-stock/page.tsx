import type { Metadata } from "next";
import { OutOfStockList } from "@/components/out-of-stock/out-of-stock-list";
import { AdminOutOfStockCreateDialog } from "@/components/out-of-stock/admin-out-of-stock-create-dialog";
import { createClient } from "@/lib/supabase/server";
import type { OrderWithRequester } from "@/lib/types/order";

export const metadata: Metadata = {
  title: "품절",
};

export default async function OutOfStockPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("*, requester:profiles!requester_id(full_name)")
    .eq("status", "out_of_stock")
    .order("created_at", { ascending: false });
  const initialOrders = (data as OrderWithRequester[] | null) ?? [];

  // 상단바(PageHeader)는 탭 건수가 필요해 OutOfStockList 안에서 그린다
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <OutOfStockList initialOrders={initialOrders} headerAction={<AdminOutOfStockCreateDialog />} />
    </div>
  );
}
