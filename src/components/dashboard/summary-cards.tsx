"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SummaryData } from "@/lib/types/dashboard";

interface SummaryCardsProps {
  data: SummaryData;
}

function DiffBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) return null;
  const isUp = diff > 0;
  return (
    <span className={cn("text-xs font-medium", isUp ? "text-destructive" : "text-green-600")}>
      {isUp ? "↑" : "↓"} {Math.abs(diff)}
    </span>
  );
}

export function SummaryCards({ data }: SummaryCardsProps) {
  const cards = [
    {
      label: "주문 신청",
      value: data.pending,
      yesterday: data.pendingYesterday,
      urgent: data.urgentPending,
      color: "text-orange-600",
    },
    {
      label: "검수 대기",
      value: data.ordered,
      yesterday: data.orderedYesterday,
      urgent: data.urgentOrdered,
      color: "text-blue-600",
    },
    {
      label: "반품신청",
      value: data.returnRequested,
      yesterday: data.returnRequestedYesterday,
      urgent: 0,
      color: "text-red-600",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              {card.urgent > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  긴급 {card.urgent}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={cn("text-2xl font-bold", card.color)}>{card.value}</span>
              <span className="text-sm text-muted-foreground">건</span>
              <DiffBadge current={card.value} previous={card.yesterday} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
