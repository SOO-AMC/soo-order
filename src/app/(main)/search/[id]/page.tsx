export const dynamic = "force-dynamic";

import { OrderComments } from "@/components/orders/order-comments";
import { notFound } from "next/navigation";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { Tag } from "@/components/list-parts";
import { OrderTypeBadge } from "@/components/orders/order-type-badge";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { CancelInspectionButton } from "@/components/search/cancel-inspection-button";
import { ReturnRequestButton } from "@/components/search/return-request-button";
import { DeleteOrderButton } from "@/components/orders/delete-order-button";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { DetailPage, DetailHero, DetailCard, InfoGrid, DetailActions } from "@/components/workspace/detail-page";
import { Timeline } from "@/components/workspace/detail-panel";
import { formatDateTime } from "@/lib/utils/format";
import type { OrderType, OrderStatus } from "@/lib/types/order";
import { ORDER_TYPE_LABEL } from "@/lib/types/order";

export default async function SearchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, isAdmin } = await getSessionProfile();

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "*, requester:profiles!requester_id(full_name), updater:profiles!updated_by(full_name), inspector:profiles!inspected_by(full_name), return_requester:profiles!return_requested_by(full_name)"
    )
    .eq("id", id)
    .single();

  if (!order) notFound();

  const status = order.status as OrderStatus;
  const canCancelInspection = status === "inspecting" && (order.inspected_by === userId || isAdmin);
  const canReturn = status === "inspecting";
  const wasUpdated = order.updated_at !== order.created_at;
  const showOrdered = ["ordered", "inspecting", "return_requested", "return_pending", "return_completed"].includes(status);
  const showInspected = ["inspecting", "return_requested", "return_pending", "return_completed"].includes(status);
  const showReturn = ["return_requested", "return_pending", "return_completed"].includes(status);
  const qty = order.quantity > 0 ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}` : "수량은 사진 참고";

  return (
    <DetailPage
      title="조회 상세"
      backHref="/search"
      aside={
        <>
          {(canCancelInspection || canReturn || isAdmin) && (
            <DetailActions>
              {canReturn && (
                <ReturnRequestButton
                  orderId={order.id}
                  itemName={order.item_name}
                  defaultQuantity={order.confirmed_quantity ?? order.quantity}
                  unit={order.unit}
                />
              )}
              {canCancelInspection && <CancelInspectionButton orderId={order.id} itemName={order.item_name} />}
              {isAdmin && <DeleteOrderButton orderId={order.id} itemName={order.item_name} needsReason={order.requester_id !== userId} redirectTo="/search" className="w-full flex-none" />}
            </DetailActions>
          )}
          <DetailCard title="처리 이력">
            <Timeline
              items={[
                ...(order.return_requested_at
                  ? [{ key: "ret", text: <><b className="font-semibold text-foreground">반품 신청</b> · {order.return_requester?.full_name ?? "—"}</>, at: formatDateTime(order.return_requested_at) }]
                  : []),
                ...(order.inspected_at
                  ? [{ key: "insp", text: <><b className="font-semibold text-foreground">검수 완료</b> · {order.inspector?.full_name ?? "—"}</>, at: formatDateTime(order.inspected_at) }]
                  : []),
                ...(order.dispatched_at
                  ? [{ key: "disp", text: <><b className="font-semibold text-foreground">발주</b> · {order.vendor_name || "업체 미지정"}</>, at: formatDateTime(order.dispatched_at) }]
                  : []),
                { key: "created", text: <><b className="font-semibold text-foreground">등록</b> · {order.requester?.full_name ?? "—"}</>, at: formatDateTime(order.created_at) },
              ]}
            />
          </DetailCard>
        </>
      }
    >
      <DetailHero
        badges={
          <>
            <OrderTypeBadge type={order.type as OrderType} />
            <OrderStatusBadge status={status} />
            {order.is_urgent && <Tag tone="danger">긴급</Tag>}
          </>
        }
        title={order.item_name}
        summary={
          <>
            <b className="font-semibold text-foreground tabular-nums">{qty}</b>
            {order.vendor_name ? ` · ${order.vendor_name}` : ""} · {order.requester?.full_name ?? "알 수 없음"} 요청
          </>
        }
      />

      <DetailCard title="요청 정보">
        <InfoGrid
          items={[
            { label: "유형", value: ORDER_TYPE_LABEL[order.type as OrderType] },
            { label: "요청 수량", value: order.quantity > 0 ? qty : <span className="text-muted-foreground">사진 참고</span> },
            { label: "요청자", value: order.requester?.full_name ?? "알 수 없음" },
            { label: "요청 일시", value: formatDateTime(order.created_at) },
            wasUpdated && order.updater && { label: "마지막 수정", value: `${order.updater.full_name ?? "—"} · ${formatDateTime(order.updated_at)}` },
            order.notes && { label: "비고", value: order.notes, wide: true },
          ]}
        />
      </DetailCard>

      {showOrdered && (
        <DetailCard title="발주 정보">
          <InfoGrid
            items={[
              { label: "업체", value: order.vendor_name || <span className="text-muted-foreground">없음</span> },
              order.dispatched_at && { label: "발주 일시", value: formatDateTime(order.dispatched_at) },
              order.order_notes && { label: "발주 비고", value: order.order_notes, wide: true },
            ]}
          />
        </DetailCard>
      )}

      {showInspected && (
        <DetailCard title="검수 정보">
          <InfoGrid
            items={[
              { label: "확인 수량", value: order.confirmed_quantity ?? "—" },
              {
                label: "거래명세서",
                value:
                  order.invoice_received === true ? "수령" : order.invoice_received === false ? <span className="text-status-ask">미수령</span> : "—",
              },
              { label: "검수자", value: order.inspector?.full_name ?? "알 수 없음" },
              order.inspected_at && { label: "검수 일시", value: formatDateTime(order.inspected_at) },
              order.inspection_notes && { label: "검수 비고", value: order.inspection_notes, wide: true },
            ]}
          />
        </DetailCard>
      )}

      {showReturn && (
        <DetailCard title="반품 정보">
          <InfoGrid
            items={[
              { label: "반품 수량", value: `${order.return_quantity ?? order.quantity}${order.unit ? ` ${order.unit}` : ""}` },
              { label: "신청자", value: order.return_requester?.full_name ?? "알 수 없음" },
              order.return_requested_at && { label: "신청 일시", value: formatDateTime(order.return_requested_at) },
              { label: "반품 사유", value: order.return_reason || "—", wide: true },
            ]}
          />
          {order.return_photo_urls?.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted-foreground">반품 사진</p>
              <PhotoGallery photoUrls={order.return_photo_urls} />
            </div>
          )}
        </DetailCard>
      )}

      <OrderComments
        orderId={order.id}
        requesterId={order.requester_id}
        viewerId={userId ?? ""}
        isAdmin={isAdmin}
        className="rounded-xl bg-card p-5 ring-1 ring-border"
      />

      {order.photo_urls?.length > 0 && (
        <DetailCard title={`사진 ${order.photo_urls.length}`}>
          <PhotoGallery photoUrls={order.photo_urls} />
        </DetailCard>
      )}
    </DetailPage>
  );
}
