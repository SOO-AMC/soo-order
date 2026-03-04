"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { OrderForm } from "@/components/orders/order-form";
import type { Order, OrderType } from "@/lib/types/order";

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

  const handleSubmit = async (data: {
    type: OrderType;
    item_name: string;
    quantity: number;
    unit: string;
  }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("orders")
      .update({
        type: data.type,
        item_name: data.item_name,
        quantity: data.quantity,
        unit: data.unit,
        updated_by: user?.id,
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
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/orders/${id}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">주문/반품 수정</h1>
      </header>
      <div className="p-4">
        {order && (
          <OrderForm
            defaultValues={{
              type: order.type,
              item_name: order.item_name,
              quantity: order.quantity,
              unit: order.unit,
            }}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
