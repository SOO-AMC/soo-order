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
import { logClientAction } from "@/app/(main)/log-action";

export default function InspectionEditPage() {
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
        router.replace("/inspection");
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

    const keptPaths = data.photos
      .filter((p) => p.type === "existing")
      .map((p) => p.path);

    const deletedPaths = existingPaths.filter((p) => !keptPaths.includes(p));

    const newFiles = data.photos
      .filter((p) => p.type === "new")
      .map((p) => p.file);

    const { error } = await supabase
      .from("orders")
      .update({
        item_name: data.item_name,
        quantity: data.quantity,
        unit: data.unit,
        is_urgent: data.is_urgent,
        notes: data.notes,
        updated_by: user?.id,
        photo_urls: keptPaths,
      })
      .eq("id", id);

    if (error) throw error;

    logClientAction("inspection", "edit_item", `${data.item_name} 품목 정보 수정`);
    router.push(`/inspection/${id}`);

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
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/inspection/${id}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">품목 수정</h1>
      </header>
      <div className="p-4">
        <div className="rounded-2xl bg-card p-5 shadow-card">
          {order && (
            <OrderForm
              defaultValues={{
                item_name: order.item_name,
                quantity: order.quantity,
                unit: order.unit,
                is_urgent: order.is_urgent,
                notes: order.notes ?? "",
              }}
              existingPhotoUrls={order.photo_urls}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </div>
    </div>
  );
}
