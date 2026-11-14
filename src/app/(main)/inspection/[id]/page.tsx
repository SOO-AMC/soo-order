export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { Tag } from "@/components/list-parts";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { InspectionActions } from "@/components/inspection/inspection-actions";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { DetailPage, DetailHero, DetailCard, InfoGrid, DetailActions } from "@/components/workspace/detail-page";
import { Timeline } from "@/components/workspace/detail-panel";
import { formatDateTime } from "@/lib/utils/format";
import type { OrderStatus } from "@/lib/types/order";

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
  const qty = order.quantity > 0 ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}` : "수량은 사진 참고";
  const received = order.received_quantity ?? 0;

  return (
    <DetailPage
      title="검수 상세"
      backHref="/inspection"
      aside={
        <>
          <DetailActions hint="물건이 들어오면 받은 수량을 확인하고 검수를 마쳐 주세요.">
            <InspectionActions
              orderId={order.id}
              itemName={order.item_name}
              defaultQuantity={order.quantity}
              canCancel={canCancel}
              isAdmin={isAdmin}
            />
          </DetailActions>
          <DetailCard title="처리 이력">
            <Timeline
              items={[
                ...(order.dispatched_at
                  ? [{ key: "disp", text: <><b className="font-semibold text-foreground">발주</b> · {order.vendor_name || "업체 미지정"}</>, at: formatDateTime(order.dispatched_at) }]
                  : []),
                { key: "created", text: <><b className="font-semibold text-foreground">주문 등록</b> · {order.requester?.full_name ?? "—"}</>, at: formatDateTime(order.created_at) },
              ]}
            />
          </DetailCard>
        </>
      }
    >
      <DetailHero
        badges={
          <>
            <OrderStatusBadge status={order.status as OrderStatus} />
            {order.is_urgent && <Tag tone="danger">긴급</Tag>}
            {received > 0 && received < order.quantity && <Tag>부분입고 {received}/{order.quantity}</Tag>}
          </>
        }
        title={order.item_name}
        summary={
          <>
            <b className="font-semibold text-foreground tabular-nums">{qty}</b>
            {order.vendor_name ? ` · ${order.vendor_name}` : ""}
          </>
        }
      />

      <DetailCard title="주문 정보">
        <InfoGrid
          items={[
            { label: "요청 수량", value: order.quantity > 0 ? qty : <span className="text-muted-foreground">사진 참고</span> },
            received > 0 && { label: "지금까지 받음", value: `${received}${order.unit ? ` ${order.unit}` : ""}` },
            { label: "업체", value: order.vendor_name || <span className="text-muted-foreground">없음</span> },
            { label: "요청자", value: order.requester?.full_name ?? "알 수 없음" },
            { label: "주문 일시", value: formatDateTime(order.created_at) },
            order.dispatched_at && { label: "발주 일시", value: formatDateTime(order.dispatched_at) },
            order.notes && { label: "요청 비고", value: order.notes, wide: true },
            order.order_notes && { label: "발주 비고", value: order.order_notes, wide: true },
          ]}
        />
      </DetailCard>

      {order.photo_urls?.length > 0 && (
        <DetailCard title={`사진 ${order.photo_urls.length}`}>
          <PhotoGallery photoUrls={order.photo_urls} />
        </DetailCard>
      )}
    </DetailPage>
  );
}
