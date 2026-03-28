import Link from "next/link";
import { AlertCircle } from "lucide-react";
import type { Order, OrderStatus } from "@/lib/types/order";
import { ORDER_STATUS_LABEL } from "@/lib/types/order";
import { formatTimeAgo } from "./time-ago";

const STATUS_GROUP_ORDER: OrderStatus[] = ["pending", "ordered", "out_of_stock", "return_requested"];

const STATUS_DOT_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-500",
  ordered: "bg-green-500",
  inspecting: "bg-blue-500",
  return_requested: "bg-orange-500",
  return_pending: "bg-purple-500",
  return_completed: "bg-gray-400",
  out_of_stock: "bg-red-500",
};

interface ActiveOrderListProps {
  orders: Order[];
}

export function ActiveOrderList({ orders }: ActiveOrderListProps) {
  if (orders.length === 0) {
    return (
      <div className="rounded-xl bg-card p-8 text-center shadow-card">
        <p className="text-sm text-muted-foreground">진행중인 주문이 없습니다</p>
      </div>
    );
  }

  // 상태별 그룹핑
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
    <div className="grid grid-cols-2 gap-3">
      {grouped.map(({ status, orders: items }) => (
        <div key={status} className="rounded-xl bg-card shadow-card overflow-hidden">
          {/* 섹션 헤더 */}
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT_COLORS[status]}`} />
            <span className="text-sm font-semibold">{ORDER_STATUS_LABEL[status]}</span>
            <span className="text-xs text-muted-foreground">{items.length}건</span>
          </div>
          {/* 아이템 리스트 */}
          <div className="divide-y">
            {items.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}?from=dashboard`} className="block">
                <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{order.item_name}</p>
                      {order.is_urgent && (
                        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {order.quantity}{order.unit} · {formatTimeAgo(order.created_at)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
