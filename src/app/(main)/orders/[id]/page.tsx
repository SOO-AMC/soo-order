export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { OrderDetailActions } from "@/components/orders/order-detail-actions";
import { OrderAdminAction } from "@/components/orders/order-admin-action";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { formatDateTime } from "@/lib/utils/format";
import type { OrderType, OrderStatus } from "@/lib/types/order";
import { ORDER_TYPE_LABEL } from "@/lib/types/order";

export default async function OrderDetailPage({
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
      .select("*, requester:profiles!requester_id(full_name), updater:profiles!updated_by(full_name)")
      .eq("id", id)
      .single(),
    userId
      ? supabase.from("profiles").select("role").eq("id", userId).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!order) notFound();

  const isAdmin = profile?.role === "admin";
  const canEdit = isAdmin || order.requester_id === userId;

  const wasUpdated = order.updated_at !== order.created_at;

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/orders">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">주문 상세</h1>
      </header>

      <div className="space-y-6 p-4">
        <div className="flex items-center gap-2">
          <OrderStatusBadge status={order.status as OrderStatus} />
          {order.is_urgent && <Badge variant="destructive">긴급</Badge>}
        </div>

        <Separator />

        <dl className="space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-4 md:space-y-0">
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
            <dt className="text-sm text-muted-foreground">요청일시</dt>
            <dd className="mt-0.5 font-medium">
              {formatDateTime(order.created_at)}
            </dd>
          </div>
          {wasUpdated && (
            <>
              {order.updater && (
                <div>
                  <dt className="text-sm text-muted-foreground">수정자</dt>
                  <dd className="mt-0.5 font-medium">
                    {order.updater.full_name ?? "알 수 없음"}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-muted-foreground">수정일시</dt>
                <dd className="mt-0.5 font-medium">
                  {formatDateTime(order.updated_at)}
                </dd>
              </div>
            </>
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

        {isAdmin && order.status === "pending" && (
          <>
            <Separator />
            <OrderAdminAction orderId={order.id} />
          </>
        )}

        {canEdit && (
          <>
            <Separator />
            <OrderDetailActions orderId={order.id} />
          </>
        )}
      </div>
    </div>
  );
}
