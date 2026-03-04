export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OrderTypeBadge } from "@/components/orders/order-type-badge";
import { InspectionActions } from "@/components/inspection/inspection-actions";
import { formatDateTime } from "@/lib/utils/format";
import type { OrderType } from "@/lib/types/order";
import { ORDER_TYPE_LABEL } from "@/lib/types/order";

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user.id;

  const [{ data: order }, { data: profile }] = await Promise.all([
    supabase
      .from("orders")
      .select("*, requester:profiles!requester_id(full_name)")
      .eq("id", id)
      .single(),
    userId
      ? supabase.from("profiles").select("role").eq("id", userId).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!order) notFound();

  if (order.status !== "ordered") {
    redirect("/inspection");
  }

  const isAdmin = profile?.role === "admin";
  const canCancel = isAdmin || order.requester_id === userId;

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inspection">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">검수 상세</h1>
      </header>

      <div className="space-y-6 p-4">
        <div className="flex items-center gap-2">
          <OrderTypeBadge type={order.type as OrderType} />
        </div>

        <Separator />

        <dl className="space-y-4">
          <div>
            <dt className="text-sm text-muted-foreground">유형</dt>
            <dd className="mt-0.5 font-medium">
              {ORDER_TYPE_LABEL[order.type as OrderType]}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">품목</dt>
            <dd className="mt-0.5 font-medium">{order.item_name}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">요청 수량</dt>
            <dd className="mt-0.5 font-medium">
              {order.quantity}
              {order.unit ? ` ${order.unit}` : ""}
            </dd>
          </div>
          {order.vendor_name && (
            <div>
              <dt className="text-sm text-muted-foreground">업체명</dt>
              <dd className="mt-0.5 font-medium">{order.vendor_name}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-muted-foreground">주문요청자</dt>
            <dd className="mt-0.5 font-medium">
              {order.requester?.full_name ?? "알 수 없음"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">주문일시</dt>
            <dd className="mt-0.5 font-medium">
              {formatDateTime(order.created_at)}
            </dd>
          </div>
        </dl>

        <Separator />

        <InspectionActions
          orderId={order.id}
          defaultQuantity={order.quantity}
          canCancel={canCancel}
        />
      </div>
    </div>
  );
}
