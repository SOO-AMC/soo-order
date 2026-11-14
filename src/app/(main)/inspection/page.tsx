import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { InspectionList } from "@/components/inspection/inspection-list";
import type { OrderWithRequester } from "@/lib/types/order";

export const metadata: Metadata = {
  title: "검수",
};

export default async function InspectionPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("*, requester:profiles!requester_id(full_name)")
    .eq("status", "ordered")
    .order("created_at", { ascending: false });
  const initialOrders = (data as OrderWithRequester[] | null) ?? [];

  // 상단바(PageHeader)는 탭 건수가 필요해 InspectionList 안에서 그린다
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <InspectionList initialOrders={initialOrders} initialView={view} />
    </div>
  );
}
