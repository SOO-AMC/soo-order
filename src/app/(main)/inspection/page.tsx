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
      <header className="sticky top-0 z-40 flex items-center justify-between bg-card px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">검수</h1>
      </header>
      <div className="p-4">
        <InspectionList initialOrders={initialOrders} />
      </div>
    </div>
  );
}
