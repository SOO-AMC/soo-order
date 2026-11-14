import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Order, OrderStatus } from "@/lib/types/order";
import { ORDER_STATUS_LABEL } from "@/lib/types/order";
import { cn } from "@/lib/utils";
import { ListSection, Tag } from "@/components/list-parts";
import { STATUS_TONE_TEXT, StatusIcon } from "@/components/ui/status-badge";
import { ORDER_STATUS_TONE } from "@/components/orders/order-status-badge";
import { formatTimeAgo } from "./time-ago";

/** 진행 순서대로. 반품대기(return_pending)도 포함 — 예전엔 빠져서 목록에 안 보였다 */
const STATUS_GROUP_ORDER: OrderStatus[] = ["pending", "ordered", "out_of_stock", "return_requested", "return_pending"];

/** 단계마다 직원이 알아야 할 한 줄 */
const STATUS_HINT: Partial<Record<OrderStatus, string>> = {
  pending: "관리자 발주 전",
  ordered: "발주 완료 · 입고되면 검수",
  out_of_stock: "업체 품절 — 대체품 확인 필요",
  return_requested: "반품 접수 전",
  return_pending: "업체 회수 대기",
};

const isReturn = (s: OrderStatus) => s === "return_requested" || s === "return_pending";

export function ActiveOrderList({ orders }: { orders: Order[] }) {
  const grouped = STATUS_GROUP_ORDER
    .map((status) => ({
      status,
      orders: orders
        .filter((o) => o.status === status)
        .sort((a, b) => {
          if (a.is_urgent !== b.is_urgent) return a.is_urgent ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }),
    }))
    .filter((g) => g.orders.length > 0);

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      {grouped.map(({ status, orders: items }) => {
        const tone = ORDER_STATUS_TONE[status];
        return (
          <ListSection key={status}>
            <div className="flex min-h-12 items-center gap-2 px-4 py-2">
              <StatusIcon tone={tone} className={cn("size-4", STATUS_TONE_TEXT[tone])} />
              <h3 className="shrink-0 text-[15px] font-bold">{ORDER_STATUS_LABEL[status]}</h3>
              <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{items.length}건</span>
              {STATUS_HINT[status] && (
                <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{STATUS_HINT[status]}</span>
              )}
            </div>
            {items.map((order) => {
              const qty = isReturn(status) ? order.return_quantity ?? order.quantity : order.quantity;
              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}?from=dashboard`}
                  className="flex items-center gap-3 border-t border-border px-4 py-3 transition-colors hover:bg-muted/60 active:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[15px] font-semibold leading-snug">{order.item_name}</span>
                      {order.is_urgent && <Tag tone="danger">긴급</Tag>}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                      {qty > 0 ? (
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          {qty}
                          {order.unit ? ` ${order.unit}` : ""}
                        </span>
                      ) : (
                        <span className="shrink-0">사진 참고</span>
                      )}
                      {order.vendor_name && status !== "pending" && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{order.vendor_name}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">{formatTimeAgo(order.created_at)}</span>
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </ListSection>
        );
      })}
    </div>
  );
}
