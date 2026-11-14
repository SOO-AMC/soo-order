export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { Tag } from "@/components/list-parts";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { OrderDetailActions } from "@/components/orders/order-detail-actions";
import { OrderAdminAction } from "@/components/orders/order-admin-action";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { DetailPage, DetailHero, DetailCard, InfoGrid, DetailActions } from "@/components/workspace/detail-page";
import { Timeline } from "@/components/workspace/detail-panel";
import { formatDateTime } from "@/lib/utils/format";
import type { OrderType, OrderStatus } from "@/lib/types/order";
import { ORDER_TYPE_LABEL } from "@/lib/types/order";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, isAdmin } = await getSessionProfile();

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("*, requester:profiles!requester_id(full_name), updater:profiles!updated_by(full_name)")
    .eq("id", id)
    .single();

  if (!order) notFound();

  const canEdit = isAdmin || order.requester_id === userId;
  const canDispatch = isAdmin && order.status === "pending";
  const wasUpdated = order.updated_at !== order.created_at;
  const qty = order.quantity > 0 ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}` : "수량은 사진 참고";

  return (
    <DetailPage
      title="주문 상세"
      backHref="/orders"
      aside={
        <>
          {(canDispatch || canEdit) && (
            <DetailActions hint={canDispatch ? "업체를 정해 발주하면 검수 대기로 넘어가요." : undefined}>
              {canDispatch && <OrderAdminAction orderId={order.id} itemName={order.item_name} quantity={order.quantity} unit={order.unit} />}
              {canEdit && <OrderDetailActions orderId={order.id} itemName={order.item_name} />}
            </DetailActions>
          )}
          <DetailCard title="처리 이력">
            <Timeline
              items={[
                ...(order.dispatched_at
                  ? [{ key: "disp", text: <><b className="font-semibold text-foreground">발주</b> · {order.vendor_name || "업체 미지정"}</>, at: formatDateTime(order.dispatched_at) }]
                  : []),
                ...(wasUpdated && order.updater
                  ? [{ key: "upd", text: <><b className="font-semibold text-foreground">수정</b> · {order.updater.full_name ?? "—"}</>, at: formatDateTime(order.updated_at) }]
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
          </>
        }
        title={order.item_name}
        summary={
          <>
            <b className="font-semibold text-foreground tabular-nums">{qty}</b> · {order.requester?.full_name ?? "알 수 없음"} 요청
          </>
        }
      />

      <DetailCard title="주문 정보">
        <InfoGrid
          items={[
            { label: "유형", value: ORDER_TYPE_LABEL[order.type as OrderType] },
            { label: "요청 수량", value: order.quantity > 0 ? qty : <span className="text-muted-foreground">사진 참고</span> },
            { label: "업체", value: order.vendor_name || <span className="text-muted-foreground">아직 안 정함</span> },
            { label: "요청자", value: order.requester?.full_name ?? "알 수 없음" },
            { label: "요청 일시", value: formatDateTime(order.created_at) },
            wasUpdated && order.updater && { label: "마지막 수정", value: `${order.updater.full_name ?? "—"} · ${formatDateTime(order.updated_at)}` },
            order.notes && { label: "비고", value: order.notes, wide: true },
            order.status === "out_of_stock" && (order.out_of_stock_reason || order.order_notes) && { label: "품절 사유", value: order.out_of_stock_reason || order.order_notes, wide: true },
            order.admin_change_reason && {
              label: "관리자가 바꾼 내용",
              value: `${order.admin_change_summary ? `${order.admin_change_summary} · ` : ""}사유: ${order.admin_change_reason}`,
              wide: true,
            },
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
