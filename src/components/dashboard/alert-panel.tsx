"use client";

import Link from "next/link";
import { AlertTriangle, Clock, Undo2, Flame, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AlertsData, AlertSection } from "@/lib/types/dashboard";

interface Block {
  title: string;
  sub: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  section: AlertSection;
}

export function AlertPanel({ data }: { data: AlertsData }) {
  const blocks: Block[] = [
    { title: `${data.thresholds.pendingDays}일+ 미발주`, sub: "주문신청 후 발주가 안 된 주문", href: "/orders", icon: Clock, section: data.agingPending },
    { title: `${data.thresholds.orderedDays}일+ 입고 안 됨`, sub: "발주했는데 검수대기에 머무는 항목", href: "/inspection", icon: AlertTriangle, section: data.agingOrdered },
    { title: `${data.thresholds.returnDays}일+ 반품 처리 안 됨`, sub: "반품신청 후 처리가 밀린 항목", href: "/returns", icon: Undo2, section: data.agingReturns },
    { title: "긴급인데 미처리", sub: "긴급으로 표시됐는데 아직 진행 중", href: "/orders", icon: Flame, section: data.urgentUnhandled },
  ];
  const active = blocks.filter((b) => b.section.count > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">⚡ 챙겨야 할 것</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {active.length === 0 && <p className="text-sm text-muted-foreground">지금 밀린 항목이 없습니다 👍</p>}
        {active.map((b) => {
          const Icon = b.icon;
          return (
            <div key={b.title} className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <Link href={b.href} className="flex items-center gap-2 text-sm font-semibold text-amber-900 hover:underline">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{b.title}</span>
                <span className="rounded-full bg-amber-200 px-1.5 text-xs">{b.section.count}건</span>
                <ChevronRight className="ml-auto h-4 w-4 shrink-0" />
              </Link>
              <p className="mt-0.5 text-xs text-amber-700">{b.sub}</p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-amber-900/90">
                {b.section.items.slice(0, 5).map((it) => (
                  <li key={it.id} className="truncate">
                    {it.isUrgent ? "🔴 " : ""}
                    {it.itemName}
                    {it.quantity > 0 ? ` ${it.quantity}${it.unit ? ` ${it.unit}` : ""}` : ""} — {it.requester}
                    {it.vendor ? ` / ${it.vendor}` : ""} ({it.days}일)
                  </li>
                ))}
                {b.section.count > 5 && <li className="text-amber-700">… 외 {b.section.count - 5}건</li>}
              </ul>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
