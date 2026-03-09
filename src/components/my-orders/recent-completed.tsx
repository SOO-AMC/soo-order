import Link from "next/link";
import type { Order } from "@/lib/types/order";
import { formatDate } from "@/lib/utils/format";

interface RecentCompletedProps {
  orders: Order[];
}

export function RecentCompleted({ orders }: RecentCompletedProps) {
  if (orders.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">최근 검수완료 ({orders.length}건)</h2>
      <div className="rounded-xl bg-card shadow-card divide-y">
        {orders.map((order) => (
          <Link key={order.id} href={`/orders/${order.id}?from=dashboard`}>
            <div className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-accent/50">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-muted-foreground">{order.item_name}</p>
                <p className="text-xs text-muted-foreground/70">
                  {order.quantity}{order.unit}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground/70">
                {order.inspected_at ? formatDate(order.inspected_at) : formatDate(order.updated_at)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
