export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { ReturnCompleteButton } from "@/components/returns/return-complete-button";
import { formatDateTime } from "@/lib/utils/format";
import type { OrderStatus } from "@/lib/types/order";

export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const { data: order } = await supabase
    .from("orders")
    .select(
      "*, requester:profiles!requester_id(full_name), inspector:profiles!inspected_by(full_name), return_requester:profiles!return_requested_by(full_name)"
    )
    .eq("id", id)
    .single();

  if (!order) notFound();

  if (order.status !== "return_requested") {
    redirect("/returns");
  }

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-6xl">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/returns">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">반품 상세</h1>
      </header>

      <div className="space-y-6 p-4">
        <div className="flex items-center gap-2">
          <OrderStatusBadge status={order.status as OrderStatus} />
          {order.is_urgent && <Badge variant="destructive">긴급</Badge>}
        </div>

        {/* 원본 주문 정보 */}
        <Separator />
        <div>
          <h2 className="font-semibold">원본 주문 정보</h2>
          <dl className="mt-3 space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-4 md:space-y-0">
            <div>
              <dt className="text-sm text-muted-foreground">품목</dt>
              <dd className="mt-0.5 font-medium">{order.item_name}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">주문 수량</dt>
              <dd className="mt-0.5 font-medium">
                {order.quantity > 0
                  ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}`
                  : "(사진 참고)"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">주문 요청자</dt>
              <dd className="mt-0.5 font-medium">
                {order.requester?.full_name ?? "알 수 없음"}
              </dd>
            </div>
            {order.vendor_name && (
              <div>
                <dt className="text-sm text-muted-foreground">업체명</dt>
                <dd className="mt-0.5 font-medium">{order.vendor_name}</dd>
              </div>
            )}
            {order.confirmed_quantity != null && (
              <div>
                <dt className="text-sm text-muted-foreground">확인 수량</dt>
                <dd className="mt-0.5 font-medium">{order.confirmed_quantity}</dd>
              </div>
            )}
            {order.inspector && (
              <div>
                <dt className="text-sm text-muted-foreground">검수자</dt>
                <dd className="mt-0.5 font-medium">
                  {order.inspector.full_name ?? "알 수 없음"}
                </dd>
              </div>
            )}
          </dl>
          {order.photo_urls?.length > 0 && (
            <div className="mt-4">
              <dt className="text-sm text-muted-foreground mb-2">사진</dt>
              <PhotoGallery photoUrls={order.photo_urls} />
            </div>
          )}
        </div>

        {/* 반품 정보 */}
        <Separator />
        <div>
          <h2 className="font-semibold">반품 정보</h2>
          <dl className="mt-3 space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-4 md:space-y-0">
            <div>
              <dt className="text-sm text-muted-foreground">반품 수량</dt>
              <dd className="mt-0.5 font-medium">
                {order.return_quantity ?? order.quantity}
                {order.unit ? ` ${order.unit}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">반품 사유</dt>
              <dd className="mt-0.5 font-medium">
                {order.return_reason || "-"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">반품 신청자</dt>
              <dd className="mt-0.5 font-medium">
                {order.return_requester?.full_name ?? "알 수 없음"}
              </dd>
            </div>
            {order.return_requested_at && (
              <div>
                <dt className="text-sm text-muted-foreground">신청일시</dt>
                <dd className="mt-0.5 font-medium">
                  {formatDateTime(order.return_requested_at)}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <Separator />
        <ReturnCompleteButton orderId={order.id} />
      </div>
    </div>
  );
}
