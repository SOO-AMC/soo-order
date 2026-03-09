export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { InspectionActions } from "@/components/inspection/inspection-actions";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { formatDateTime } from "@/lib/utils/format";

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, isAdmin } = await getSessionProfile();

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("*, requester:profiles!requester_id(full_name)")
    .eq("id", id)
    .single();

  if (!order) notFound();

  if (order.status !== "ordered") {
    redirect("/inspection");
  }

  const canCancel = isAdmin || order.requester_id === userId;

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inspection">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">검수 상세</h1>
      </header>

      <div className="p-4"><div className="space-y-6 rounded-2xl bg-card p-5 shadow-card">
        {order.is_urgent && (
          <div className="flex items-center gap-2">
            <Badge variant="destructive">긴급</Badge>
          </div>
        )}

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

        <Separator />

        <InspectionActions
          orderId={order.id}
          itemName={order.item_name}
          defaultQuantity={order.quantity}
          canCancel={canCancel}
          isAdmin={isAdmin}
        />
      </div></div>
    </div>
  );
}
