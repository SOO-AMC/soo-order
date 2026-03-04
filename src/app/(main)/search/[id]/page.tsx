export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OrderTypeBadge } from "@/components/orders/order-type-badge";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { CancelInspectionButton } from "@/components/search/cancel-inspection-button";
import { formatDateTime } from "@/lib/utils/format";
import type { OrderType, OrderStatus } from "@/lib/types/order";
import { ORDER_TYPE_LABEL } from "@/lib/types/order";

export default async function SearchDetailPage({
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
      .select(
        "*, requester:profiles!requester_id(full_name), updater:profiles!updated_by(full_name), inspector:profiles!inspected_by(full_name)"
      )
      .eq("id", id)
      .single(),
    userId
      ? supabase.from("profiles").select("role").eq("id", userId).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!order) notFound();

  const isAdmin = profile?.role === "admin";
  const isInspector = order.inspected_by === userId;
  const canCancelInspection =
    order.status === "inspecting" && (isInspector || isAdmin);

  const wasUpdated = order.updated_at !== order.created_at;

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/search">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">조회 상세</h1>
      </header>

      <div className="space-y-6 p-4">
        {/* 상태 뱃지 */}
        <div className="flex items-center gap-2">
          <OrderTypeBadge type={order.type as OrderType} />
          <OrderStatusBadge status={order.status as OrderStatus} />
        </div>

        {/* 섹션 1: 주문/반품 요청 정보 */}
        <Separator />
        <div>
          <h2 className="font-semibold">요청 정보</h2>
          <dl className="mt-3 space-y-4">
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
                {order.quantity}
                {order.unit ? ` ${order.unit}` : ""}
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
        </div>

        {/* 섹션 2: 주문 정보 (ordered 이상) */}
        {(order.status === "ordered" || order.status === "inspecting") && (
          <>
            <Separator />
            <div>
              <h2 className="font-semibold">주문 정보</h2>
              <dl className="mt-3 space-y-4">
                <div>
                  <dt className="text-sm text-muted-foreground">업체명</dt>
                  <dd className="mt-0.5 font-medium">
                    {order.vendor_name || "-"}
                  </dd>
                </div>
              </dl>
            </div>
          </>
        )}

        {/* 섹션 3: 검수 정보 (inspecting일 때) */}
        {order.status === "inspecting" && (
          <>
            <Separator />
            <div>
              <h2 className="font-semibold">검수 정보</h2>
              <dl className="mt-3 space-y-4">
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
              </dl>
            </div>
          </>
        )}

        {/* 검수 취소 버튼 */}
        {canCancelInspection && (
          <>
            <Separator />
            <CancelInspectionButton orderId={order.id} />
          </>
        )}
      </div>
    </div>
  );
}
