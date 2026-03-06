"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { OrderForm } from "@/components/orders/order-form";
import type { OrderFormResult } from "@/components/orders/order-form";
import { enqueueNewOrderPhotos } from "@/lib/utils/upload-queue";
import { logClientAction } from "@/app/(main)/log-action";

export default function NewOrderPage() {
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (data: OrderFormResult) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Insert order
    const { data: inserted, error } = await supabase
      .from("orders")
      .insert({
        type: "order",
        item_name: data.item_name,
        quantity: data.quantity,
        unit: data.unit,
        is_urgent: data.is_urgent,
        notes: data.notes,
        requester_id: user.id,
      })
      .select("id")
      .single();

    if (error || !inserted) throw error;

    // 2. Navigate immediately
    logClientAction("order", "create_order", `${data.item_name} 주문 등록`);
    router.push("/orders");

    // 3. Upload photos in background
    const newFiles = data.photos
      .filter((p) => p.type === "new")
      .map((p) => p.file);
    enqueueNewOrderPhotos(supabase, inserted.id, newFiles);
  };

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-none">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-background/95 backdrop-blur-sm px-4 py-3 shadow-header">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/orders">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">새 주문 등록</h1>
      </header>
      <div className="p-4">
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <OrderForm onSubmit={handleSubmit} />
        </div>
      </div>
    </div>
  );
}
