import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { OrderList } from "@/components/orders/order-list";
import { StatusLegend } from "@/components/orders/order-status-badge";
import type { OrderWithRequester } from "@/lib/types/order";

export const metadata: Metadata = {
  title: "주문",
};

export default async function OrdersPage() {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const userId = session.user.id;

  const [{ data: profile }, { data: orders }] = await Promise.all([
    supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single(),
    supabase
      .from("orders")
      .select("*, requester:profiles!requester_id(full_name)")
      .eq("type", "order")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const isAdmin = profile?.role === "admin";

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">주문</h1>
          <Button size="icon" asChild>
            <Link href="/orders/new">
              <Plus />
            </Link>
          </Button>
        </div>
        <div className="mt-2 flex justify-end">
          <StatusLegend />
        </div>
      </header>
      <div className="p-4">
        <OrderList
          isAdmin={isAdmin}
          currentUserId={userId}
          initialData={(orders as OrderWithRequester[]) ?? []}
        />
      </div>
    </div>
  );
}
