import Link from "next/link";
import type { Order } from "@/lib/types/order";
import { formatDate } from "@/lib/utils/format";
import { ListSection } from "@/components/list-parts";
import { StatusIcon } from "@/components/ui/status-badge";

/** 최근 검수완료 — 끝난 일이라 한 단계 옅게 */
export function RecentCompleted({ orders }: { orders: Order[] }) {
  if (orders.length === 0) return null;

  return (
    <ListSection>
      <div className="flex min-h-12 items-center gap-2 px-4 py-2">
        <StatusIcon tone="done" className="size-4 text-status-done" />
        <h3 className="text-[15px] font-bold">최근 검수완료</h3>
        <span className="text-[13px] tabular-nums text-muted-foreground">{orders.length}건</span>
      </div>
      {orders.map((order) => (
        <Link
          key={order.id}
          href={`/orders/${order.id}?from=dashboard`}
          className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 transition-colors hover:bg-muted/60"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-subtle-foreground">{order.item_name}</p>
            <p className="text-[13px] tabular-nums text-muted-foreground">
              {order.quantity}
              {order.unit ? ` ${order.unit}` : ""}
            </p>
          </div>
          <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
            {formatDate(order.inspected_at ?? order.updated_at)}
          </span>
        </Link>
      ))}
    </ListSection>
  );
}
