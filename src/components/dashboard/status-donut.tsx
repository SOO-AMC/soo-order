"use client";

import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { StatusIcon, type StatusTone } from "@/components/ui/status-badge";
import type { SummaryData } from "@/lib/types/dashboard";

// "검수완료(inspecting)"는 사실상 종료 상태라 제외 — 처리 대기 중인 주문만
// 색은 앱 상태 규칙과 같게: 주문신청=회색(아직), 검수대기=파랑(진행), 반품신청=주황(확인 필요)
const SLICES: { key: string; label: string; color: string; tone: StatusTone }[] = [
  { key: "pending", label: "주문신청", color: "var(--chart-todo)", tone: "todo" },
  { key: "ordered", label: "검수대기", color: "var(--chart-doing)", tone: "doing" },
  { key: "returnRequested", label: "반품신청", color: "var(--chart-ask)", tone: "ask" },
];

export function StatusDonut({ data }: { data: SummaryData }) {
  const counts: Record<string, number> = {
    pending: data.pending,
    ordered: data.ordered,
    returnRequested: data.returnRequested,
  };
  const rows = SLICES.map((s) => ({ ...s, value: counts[s.key] ?? 0 })).filter((r) => r.value > 0);
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const config: ChartConfig = Object.fromEntries(SLICES.map((s) => [s.key, { label: s.label, color: s.color }]));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[15px] font-bold">진행 중인 주문 분포</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">처리할 주문이 없어요</p>
        ) : (
          <div className="flex flex-col items-center">
            <div className="relative">
              <ChartContainer id="status-donut" config={config} className="h-[180px] w-[180px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie data={rows} dataKey="value" nameKey="label" innerRadius={56} outerRadius={82} paddingAngle={2} strokeWidth={2} stroke="var(--card)">
                    {rows.map((r) => (
                      <Cell key={r.key} fill={r.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold leading-none">{total}</span>
                <span className="mt-1 text-xs text-muted-foreground">진행 중인 주문</span>
              </div>
            </div>
            <ul className="mt-4 w-full space-y-2 text-sm">
              {rows.map((r) => (
                <li key={r.key} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <StatusIcon tone={r.tone} className="size-3.5 shrink-0 text-subtle-foreground" />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.label}</span>
                  <span className="font-medium tabular-nums">{Math.round((r.value / total) * 100)}%</span>
                  <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{r.value}건</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
