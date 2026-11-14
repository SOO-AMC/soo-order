export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { Tag } from "@/components/list-parts";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { ReturnCompleteButton } from "@/components/returns/return-complete-button";
import { ReturnDispatchButton } from "@/components/returns/return-dispatch-button";
import { DetailPage, DetailHero, DetailCard, InfoGrid, DetailActions, DetailNotice } from "@/components/workspace/detail-page";
import { Timeline } from "@/components/workspace/detail-panel";
import { formatDateTime } from "@/lib/utils/format";
import type { OrderStatus } from "@/lib/types/order";

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await getSessionProfile();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "*, requester:profiles!requester_id(full_name), inspector:profiles!inspected_by(full_name), return_requester:profiles!return_requested_by(full_name)"
    )
    .eq("id", id)
    .single();

  if (!order) notFound();

  if (order.status !== "return_requested" && order.status !== "return_pending") {
    redirect("/returns");
  }

  const isRequested = order.status === "return_requested";
  const returnQty = `${order.return_quantity ?? order.quantity}${order.unit ? ` ${order.unit}` : ""}`;

  return (
    <DetailPage
      title="반품 상세"
      backHref="/returns"
      aside={
        <>
          <DetailActions hint={isRequested ? "업체에 반품을 접수하면 회수 대기로 넘어가요." : "업체가 회수해 가면 반품 완료로 바꿔 주세요."}>
            {isRequested ? (
              <ReturnDispatchButton orderId={order.id} itemName={order.item_name} />
            ) : (
              <ReturnCompleteButton orderId={order.id} itemName={order.item_name} />
            )}
          </DetailActions>
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
                order.type === "return"
                  ? { key: "direct", text: <><b className="font-semibold text-foreground">직접 등록</b></>, at: formatDateTime(order.created_at) }
                  : { key: "created", text: <><b className="font-semibold text-foreground">주문 등록</b> · {order.requester?.full_name ?? "—"}</>, at: formatDateTime(order.created_at) },
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
            <b className="font-semibold text-foreground tabular-nums">{returnQty}</b> 반품
            {order.vendor_name ? ` · ${order.vendor_name}` : ""}
          </>
        }
      />

      <DetailCard title="반품 정보">
        <InfoGrid
          items={[
            { label: "반품 수량", value: returnQty },
            { label: "신청자", value: order.return_requester?.full_name ?? "알 수 없음" },
            order.return_requested_at && { label: "신청 일시", value: formatDateTime(order.return_requested_at) },
            { label: "반품 사유", value: order.return_reason || "—", wide: true },
          ]}
        />
        {order.return_photo_urls?.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-muted-foreground">반품 사진 {order.return_photo_urls.length}</p>
            <PhotoGallery photoUrls={order.return_photo_urls} />
          </div>
        )}
      </DetailCard>

      {order.type === "return" ? (
        <DetailNotice icon={<PackagePlus />}>직접 등록한 반품이에요. 원래 주문 기록은 없어요.</DetailNotice>
      ) : (
        <DetailCard title="원래 주문">
          <InfoGrid
            items={[
              { label: "주문 수량", value: order.quantity > 0 ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}` : "사진 참고" },
              { label: "요청자", value: order.requester?.full_name ?? "알 수 없음" },
              order.vendor_name && { label: "업체", value: order.vendor_name },
              order.confirmed_quantity != null && { label: "확인 수량", value: order.confirmed_quantity },
              order.inspector && { label: "검수자", value: order.inspector.full_name ?? "알 수 없음" },
              order.notes && { label: "요청 비고", value: order.notes, wide: true },
              order.order_notes && { label: "발주 비고", value: order.order_notes, wide: true },
              order.inspection_notes && { label: "검수 비고", value: order.inspection_notes, wide: true },
            ]}
          />
          {order.photo_urls?.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted-foreground">주문 사진 {order.photo_urls.length}</p>
              <PhotoGallery photoUrls={order.photo_urls} />
            </div>
          )}
        </DetailCard>
      )}
    </DetailPage>
  );
}
