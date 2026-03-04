export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OrderTypeBadge } from "@/components/orders/order-type-badge";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { OrderDetailActions } from "@/components/orders/order-detail-actions";
import { OrderAdminAction } from "@/components/orders/order-admin-action";
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

  const { data: order } = await supabase
    .from("orders")
    .select("*, requester:profiles!requester_id(full_name), updater:profiles!updated_by(full_name)")
    .eq("id", id)
    .single();

  if (!order) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  const isAdmin = profile?.role === "admin";
  const canEdit = isAdmin || order.requester_id === user!.id;

  const wasUpdated = order.updated_at !== order.created_at;

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/orders">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">주문/반품 상세</h1>
      </header>

      <div className="space-y-6 p-4">
        <div className="flex items-center gap-2">
          <OrderStatusBadge status={order.status as OrderStatus} />
          <OrderTypeBadge type={order.type as OrderType} />
        </div>

        <Separator />

        <dl className="space-y-4">
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
              {order.quantity}{order.unit ? ` ${order.unit}` : ""}
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
