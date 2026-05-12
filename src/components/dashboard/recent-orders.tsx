"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { formatDate } from "@/lib/utils/format";
import type { RecentOrderRow } from "@/lib/types/dashboard";
import type { OrderStatus } from "@/lib/types/order";

export function RecentOrders({ data }: { data: RecentOrderRow[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">최근 주문</CardTitle>
        <Link href="/search" className="text-xs text-primary hover:underline">전체 보기</Link>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">최근 주문이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="flex items-center gap-2.5 rounded-md px-1 py-2.5 transition-colors hover:bg-accent/50"
                >
                  <OrderStatusBadge status={o.status as OrderStatus} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.itemName}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {o.quantity > 0 ? `${o.quantity}${o.unit ? ` ${o.unit}` : ""}` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{o.requester || "-"}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDate(o.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
