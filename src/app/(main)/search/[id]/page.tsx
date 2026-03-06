export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OrderTypeBadge } from "@/components/orders/order-type-badge";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { CancelInspectionButton } from "@/components/search/cancel-inspection-button";
import { ReturnRequestButton } from "@/components/search/return-request-button";
import { PhotoGallery } from "@/components/orders/photo-gallery";
import { formatDateTime } from "@/lib/utils/format";
import type { OrderType, OrderStatus } from "@/lib/types/order";
import { ORDER_TYPE_LABEL } from "@/lib/types/order";

export default async function SearchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const isInspector = order.inspected_by === userId;
  const canCancelInspection =
    order.status === "inspecting" && (isInspector || isAdmin);

  const wasUpdated = order.updated_at !== order.created_at;

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-background/95 backdrop-blur-sm px-4 py-3 shadow-header">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/search">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">조회 상세</h1>
      </header>

      <div className="p-4"><div className="space-y-6 rounded-2xl bg-card p-5 shadow-card">
        {/* 상태 뱃지 */}
        <div className="flex items-center gap-2">
          <OrderTypeBadge type={order.type as OrderType} />
          <OrderStatusBadge status={order.status as OrderStatus} />
          {order.is_urgent && <Badge variant="destructive">긴급</Badge>}
        </div>

        {/* 섹션 1: 주문/반품 요청 정보 */}
        <Separator />
        <div>
          <h2 className="font-semibold">요청 정보</h2>
          <dl className="mt-3 space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-4 md:space-y-0">
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
            {order.notes && (
              <div>
                <dt className="text-sm text-muted-foreground">비고</dt>
                <dd className="mt-0.5 font-medium">{order.notes}</dd>
              </div>
            )}
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
            <div className="mt-4">
              <dt className="text-sm text-muted-foreground mb-2">사진</dt>
              <PhotoGallery photoUrls={order.photo_urls} />
            </div>
          )}
        </div>

        {/* 섹션 2: 주문 정보 (ordered 이상) */}
        {(order.status === "ordered" || order.status === "inspecting" || order.status === "return_requested" || order.status === "return_completed") && (
          <>
            <Separator />
            <div>
              <h2 className="font-semibold">주문 정보</h2>
              <dl className="mt-3 space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-4 md:space-y-0">
                <div>
                  <dt className="text-sm text-muted-foreground">업체명</dt>
                  <dd className="mt-0.5 font-medium">
                    {order.vendor_name || "-"}
                  </dd>
                </div>
                {order.order_notes && (
                  <div>
                    <dt className="text-sm text-muted-foreground">비고</dt>
                    <dd className="mt-0.5 font-medium">{order.order_notes}</dd>
                  </div>
                )}
              </dl>
            </div>
          </>
        )}

        {/* 섹션 3: 검수 정보 (inspecting 이상) */}
        {(order.status === "inspecting" || order.status === "return_requested" || order.status === "return_completed") && (
          <>
            <Separator />
            <div>
              <h2 className="font-semibold">검수 정보</h2>
              <dl className="mt-3 space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-4 md:space-y-0">
                <div>
                  <dt className="text-sm text-muted-foreground">확인 수량</dt>
                  <dd className="mt-0.5 font-medium">
                    {order.confirmed_quantity ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">
                    거래명세서 수령
                  </dt>
                  <dd className="mt-0.5 font-medium">
                    {order.invoice_received === true
                      ? "수령"
                      : order.invoice_received === false
                        ? "미수령"
                        : "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">검수자</dt>
                  <dd className="mt-0.5 font-medium">
                    {order.inspector?.full_name ?? "알 수 없음"}
                  </dd>
                </div>
                {order.inspected_at && (
                  <div>
                    <dt className="text-sm text-muted-foreground">검수일시</dt>
                    <dd className="mt-0.5 font-medium">
                      {formatDateTime(order.inspected_at)}
                    </dd>
                  </div>
                )}
                {order.inspection_notes && (
                  <div>
                    <dt className="text-sm text-muted-foreground">비고</dt>
                    <dd className="mt-0.5 font-medium">{order.inspection_notes}</dd>
                  </div>
                )}
              </dl>
            </div>
          </>
        )}

        {/* 섹션 4: 반품 정보 (반품 상태일 때) */}
        {(order.status === "return_requested" || order.status === "return_completed") && (
          <>
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
                    <dt className="text-sm text-muted-foreground">반품 신청일시</dt>
                    <dd className="mt-0.5 font-medium">
                      {formatDateTime(order.return_requested_at)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </>
        )}

        {/* 검수 취소 버튼 */}
        {canCancelInspection && (
          <>
            <Separator />
            <CancelInspectionButton orderId={order.id} itemName={order.item_name} />
          </>
        )}

        {/* 반품 신청 버튼 (검수완료 상태일 때) */}
        {order.status === "inspecting" && (
          <>
            <Separator />
            <ReturnRequestButton
              orderId={order.id}
              itemName={order.item_name}
              defaultQuantity={order.confirmed_quantity ?? order.quantity}
              unit={order.unit}
            />
          </>
        )}
      </div></div>
    </div>
  );
}
