"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { OrderForm } from "@/components/orders/order-form";
import type { OrderFormResult } from "@/components/orders/order-form";
import type { Order } from "@/lib/types/order";
import { enqueueEditOrderPhotos } from "@/lib/utils/upload-queue";

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchOrder = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();

      if (!data) {
        router.replace("/orders");
        return;
      }
      setOrder(data as Order);
      setIsLoading(false);
    };
    fetchOrder();
  }, [id, router, supabase]);

  const handleSubmit = async (data: OrderFormResult) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const existingPaths = order?.photo_urls ?? [];

    // Determine kept existing paths
    const keptPaths = data.photos
      .filter((p) => p.type === "existing")
      .map((p) => p.path);

    // Paths to delete from storage
    const deletedPaths = existingPaths.filter((p) => !keptPaths.includes(p));

    // New photos to upload
    const newFiles = data.photos
      .filter((p) => p.type === "new")
      .map((p) => p.file);

    // 1. Update order text data immediately
    const { error } = await supabase
      .from("orders")
      .update({
        type: "order",
        item_name: data.item_name,
        quantity: data.quantity,
        unit: data.unit,
        is_urgent: data.is_urgent,
        updated_by: user?.id,
        photo_urls: keptPaths, // set kept paths now, new ones added after upload
      })
      .eq("id", id);

    if (error) throw error;

    // 2. Navigate immediately
    router.push(`/orders/${id}`);

    // 3. Upload new photos & delete old ones in background
    enqueueEditOrderPhotos(supabase, id, keptPaths, newFiles, deletedPaths);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md md:max-w-xl lg:max-w-3xl">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/orders/${id}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">주문 수정</h1>
      </header>
      <div className="p-4">
        {order && (
          <OrderForm
            defaultValues={{
              item_name: order.item_name,
              quantity: order.quantity,
              unit: order.unit,
              is_urgent: order.is_urgent,
            }}
            existingPhotoUrls={order.photo_urls}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
