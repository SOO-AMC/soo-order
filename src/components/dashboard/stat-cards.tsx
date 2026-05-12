"use client";

import { Package, ClipboardCheck, Undo2, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SummaryData, SpendData } from "@/lib/types/dashboard";

const won = (n: number) => `₩${n.toLocaleString()}`;

function CountDelta({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) return <span className="text-xs text-muted-foreground">어제와 동일</span>;
  const up = diff > 0;
  return (
    <span className={cn("text-xs font-medium", up ? "text-red-500" : "text-emerald-600")}>
      {up ? "▲" : "▼"} {Math.abs(diff)} <span className="font-normal text-muted-foreground">어제 대비</span>
    </span>
  );
}

function MoneyDelta({ spend }: { spend: SpendData }) {
  if (spend.lastMonthAmount <= 0) return <span className="text-xs text-muted-foreground">지난달 데이터 없음</span>;
  const diff = spend.thisMonthAmount - spend.lastMonthAmount;
  if (diff === 0) return <span className="text-xs text-muted-foreground">지난달과 동일</span>;
  const up = diff > 0;
  return (
    <span className={cn("text-xs font-medium", up ? "text-red-500" : "text-emerald-600")}>
      {up ? "▲" : "▼"} {won(Math.abs(diff))} <span className="font-normal text-muted-foreground">지난달 대비</span>
    </span>
  );
}

interface StatItem {
  label: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  delta: React.ReactNode;
}

export function StatCards({ summary, spend }: { summary: SummaryData; spend?: SpendData }) {
  const items: StatItem[] = [
    { label: "주문신청", value: `${summary.pending}`, unit: "건", icon: Package, delta: <CountDelta current={summary.pending} previous={summary.pendingYesterday} /> },
    { label: "검수대기", value: `${summary.ordered}`, unit: "건", icon: ClipboardCheck, delta: <CountDelta current={summary.ordered} previous={summary.orderedYesterday} /> },
    { label: "반품신청", value: `${summary.returnRequested}`, unit: "건", icon: Undo2, delta: <CountDelta current={summary.returnRequested} previous={summary.returnRequestedYesterday} /> },
    spend
      ? { label: "이번 달 추정 지출", value: won(spend.thisMonthAmount), unit: "", icon: Wallet, delta: <MoneyDelta spend={spend} /> }
      : { label: "검수완료", value: `${summary.inspecting}`, unit: "건", icon: ClipboardCheck, delta: <CountDelta current={summary.inspecting} previous={summary.inspectingYesterday} /> },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card key={it.label}>
            <CardContent className="flex items-start justify-between gap-2 p-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{it.label}</p>
                <p className="mt-1 text-2xl font-bold leading-tight">
                  {it.value}
                  {it.unit && <span className="ml-0.5 text-sm font-medium text-muted-foreground">{it.unit}</span>}
                </p>
                <div className="mt-1">{it.delta}</div>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
