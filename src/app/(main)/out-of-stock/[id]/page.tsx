export const dynamic = "force-dynamic";

import { OrderComments } from "@/components/orders/order-comments";
import { notFound, redirect } from "next/navigation";
import { CircleX } from "lucide-react";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { Tag } from "@/components/list-parts";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { OutOfStockActions } from "@/components/out-of-stock/out-of-stock-actions";
import { DetailPage, DetailHero, DetailCard, InfoGrid, DetailActions, DetailNotice } from "@/components/workspace/detail-page";
import { Timeline } from "@/components/workspace/detail-panel";
import { formatDateTime } from "@/lib/utils/format";
import type { OrderStatus } from "@/lib/types/order";

export default async function OutOfStockDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const qty = order.quantity > 0 ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}` : "수량은 사진 참고";

  return (
    <DetailPage
      title="품절 상세"
      backHref="/out-of-stock"
      aside={
        <>
          {isAdmin && (
            <DetailActions hint="더 이상 볼 필요가 없으면 목록에서 지울 수 있어요.">
              <OutOfStockActions orderId={order.id} itemName={order.item_name} />
            </DetailActions>
          )}
          <DetailCard title="처리 이력">
            <Timeline
              items={[
                { key: "oos", text: <><b className="font-semibold text-foreground">품절</b> · {order.vendor_name || "업체 미지정"}</>, at: formatDateTime(order.updated_at) },
                ...(order.dispatched_at
                  ? [{ key: "disp", text: <><b className="font-semibold text-foreground">발주</b></>, at: formatDateTime(order.dispatched_at) }]
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

      <DetailNotice tone="danger" icon={<CircleX />}>
        업체에서 품절로 알려 왔어요. 대체품이 필요하면 새로 주문해 주세요.
      </DetailNotice>

      <DetailCard title="주문 정보">
        <InfoGrid
          items={[
            { label: "요청 수량", value: order.quantity > 0 ? qty : <span className="text-muted-foreground">사진 참고</span> },
            { label: "업체", value: order.vendor_name || <span className="text-muted-foreground">없음</span> },
            { label: "요청자", value: order.requester?.full_name ?? "알 수 없음" },
            { label: "주문 일시", value: formatDateTime(order.created_at) },
            // 품절 사유: 예전에 품절 처리한 주문은 사유가 발주 비고 칸에 들어 있다
            (order.out_of_stock_reason || order.order_notes) && { label: "품절 사유", value: order.out_of_stock_reason || order.order_notes, wide: true },
            order.notes && { label: "요청 비고", value: order.notes, wide: true },
            // 새 방식으로 품절 처리한 주문만 발주 비고가 따로 남아 있다
            order.out_of_stock_reason && order.order_notes && { label: "발주 비고", value: order.order_notes, wide: true },
          ]}
        />
      </DetailCard>

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
