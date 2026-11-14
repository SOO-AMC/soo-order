import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";
import { ReturnList } from "@/components/returns/return-list";
import { AdminReturnCreateDialog } from "@/components/returns/admin-return-create-dialog";
import { createClient } from "@/lib/supabase/server";
import type { OrderWithRequester } from "@/lib/types/order";

export const metadata: Metadata = {
  title: "반품",
};

export default async function ReturnsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "*, requester:profiles!requester_id(full_name), return_requester:profiles!return_requested_by(full_name)"
    )
    .in("status", ["return_requested", "return_pending"])
    .order("return_requested_at", { ascending: false });
  const initialOrders = (data as OrderWithRequester[] | null) ?? [];

  // 상단바(PageHeader)는 탭 건수가 필요해 ReturnList 안에서 그린다
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <ReturnList
        initialOrders={initialOrders}
        headerLeading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
        headerAction={<AdminReturnCreateDialog />}
      />
    </div>
  );
}
