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

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md">
        <div className="lg:hidden">
          <BackButton fallbackHref="/more" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight">반품</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">반품 신청·접수 처리 대기</p>
        </div>
        <div className="ml-auto">
          <AdminReturnCreateDialog />
        </div>
      </header>
      <div className="p-4">
        <ReturnList initialOrders={initialOrders} />
      </div>
    </div>
  );
}
