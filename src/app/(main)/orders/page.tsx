import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { OrderList } from "@/components/orders/order-list";

export const metadata: Metadata = {
  title: "주문",
};

export default async function OrdersPage() {
  const { userId, isAdmin } = await getSessionProfile();
  if (!userId) redirect("/login");

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-background/95 backdrop-blur-sm px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">주문</h1>
        <Button size="icon" asChild>
          <Link href="/orders/new">
            <Plus />
          </Link>
        </Button>
      </header>
      <div className="p-4">
        <OrderList
          isAdmin={isAdmin}
          currentUserId={userId}
        />
      </div>
    </div>
  );
}
