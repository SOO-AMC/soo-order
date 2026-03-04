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
import { uploadPhoto, deletePhotos } from "@/lib/utils/photo";

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
    const newPhotos = data.photos.filter((p) => p.type === "new");

    // Upload new photos
    const newPaths = await Promise.all(
      newPhotos.map((p) => uploadPhoto(supabase, id, p.file))
    );

    // Delete removed photos from storage
    if (deletedPaths.length > 0) {
      await deletePhotos(supabase, deletedPaths).catch(() => {});
    }

    const finalPaths = [...keptPaths, ...newPaths];

    const { error } = await supabase
      .from("orders")
      .update({
        type: "order",
        item_name: data.item_name,
        quantity: data.quantity,
        unit: data.unit,
        updated_by: user?.id,
        photo_urls: finalPaths,
      })
      .eq("id", id);

    if (error) throw error;
    router.push(`/orders/${id}`);
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
            }}
            existingPhotoUrls={order.photo_urls}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
