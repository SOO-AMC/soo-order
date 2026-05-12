import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { InspectionList } from "@/components/inspection/inspection-list";
import type { OrderWithRequester } from "@/lib/types/order";

export const metadata: Metadata = {
  title: "검수",
};

export default async function InspectionPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("*, requester:profiles!requester_id(full_name)")
    .eq("status", "ordered")
    .order("created_at", { ascending: false });
  const initialOrders = (data as OrderWithRequester[] | null) ?? [];

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md">
        <div>
          <h1 className="text-lg font-bold leading-tight">검수</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">입고 후 검수 대기 중인 품목</p>
        </div>
      </header>
      <div className="p-4">
        <InspectionList initialOrders={initialOrders} />
      </div>
    </div>
  );
}
