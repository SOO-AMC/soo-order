"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { OrderForm } from "@/components/orders/order-form";

export default function NewOrderPage() {
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (data: {
    type: string;
    item_name: string;
    quantity: number;
    unit: string;
  }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("orders").insert({
      type: data.type,
      item_name: data.item_name,
      quantity: data.quantity,
      unit: data.unit,
      requester_id: user.id,
    });

    if (error) throw error;
    router.push("/orders");
  };

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/orders">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">새 주문/반품 등록</h1>
      </header>
      <div className="p-4">
        <OrderForm onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
