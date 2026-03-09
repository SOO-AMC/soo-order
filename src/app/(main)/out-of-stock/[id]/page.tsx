export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { OutOfStockActions } from "@/components/out-of-stock/out-of-stock-actions";
import { formatDateTime } from "@/lib/utils/format";

export default async function OutOfStockDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, isAdmin } = await getSessionProfile();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("*, requester:profiles!requester_id(full_name)")
    .eq("id", id)
    .single();

  if (!order) notFound();

  if (order.status !== "out_of_stock") {
    redirect("/out-of-stock");
  }

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/out-of-stock">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">품절 상세</h1>
      </header>

      <div className="p-4"><div className="space-y-6 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center gap-2">
          <OrderStatusBadge status={order.status} />
          {order.is_urgent && <Badge variant="destructive">긴급</Badge>}
        </div>

        <Separator />

        <dl className="space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-4 md:space-y-0">
          <div>
            <dt className="text-sm text-muted-foreground">품목</dt>
            <dd className="mt-0.5 font-medium">{order.item_name}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">요청 수량</dt>
            <dd className="mt-0.5 font-medium">
              {order.quantity > 0
                ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}`
                : <span className="text-muted-foreground">(사진 참고)</span>}
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
          {order.notes && (
            <div>
              <dt className="text-sm text-muted-foreground">요청 비고</dt>
              <dd className="mt-0.5 font-medium">{order.notes}</dd>
            </div>
          )}
          {order.order_notes && (
            <div>
              <dt className="text-sm text-muted-foreground">발주 비고</dt>
              <dd className="mt-0.5 font-medium">{order.order_notes}</dd>
            </div>
          )}
        </dl>

        {order.photo_urls?.length > 0 && (
          <>
            <Separator />
            <div>
              <dt className="text-sm text-muted-foreground mb-2">사진</dt>
              <PhotoGallery photoUrls={order.photo_urls} />
            </div>
          </>
        )}

        {isAdmin && (
          <>
            <Separator />
            <OutOfStockActions orderId={order.id} itemName={order.item_name} />
          </>
        )}
      </div></div>
    </div>
  );
}
