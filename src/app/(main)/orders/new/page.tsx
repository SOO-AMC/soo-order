"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { OrderForm } from "@/components/orders/order-form";
import type { OrderFormResult } from "@/components/orders/order-form";
import { uploadPhoto } from "@/lib/utils/photo";

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
        requester_id: user.id,
      })
      .select("id")
      .single();

    if (error || !inserted) throw error;

    // 2. Upload photos if any
    const newPhotos = data.photos.filter((p) => p.type === "new");
    if (newPhotos.length > 0) {
      const paths = await Promise.all(
        newPhotos.map((p) => uploadPhoto(supabase, inserted.id, p.file))
      );
      await supabase
        .from("orders")
        .update({ photo_urls: paths })
        .eq("id", inserted.id);
    }

    router.push("/orders");
  };

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-none">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/orders">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">새 주문 등록</h1>
      </header>
      <div className="p-4">
        <OrderForm onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
