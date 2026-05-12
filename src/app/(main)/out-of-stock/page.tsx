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

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md">
        <div>
          <h1 className="text-lg font-bold leading-tight">품절</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">품절 처리된 품목 목록</p>
        </div>
        <AdminOutOfStockCreateDialog />
      </header>
      <div className="p-4">
        <OutOfStockList initialOrders={initialOrders} />
      </div>
    </div>
  );
}
