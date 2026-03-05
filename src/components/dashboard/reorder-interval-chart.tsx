"use client";

import { useState } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { ReorderIntervalData } from "@/lib/types/dashboard";

const chartConfig = {
  avgDays: {
    label: "평균 주기(일)",
    color: "#15BDF0",
  },
} satisfies ChartConfig;

interface Props {
  data: ReorderIntervalData[];
}

export function ReorderIntervalChart({ data }: Props) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filtered = data.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );
  const displayed = showAll ? filtered : filtered.slice(0, 15);
  const chartData = displayed.slice(0, 15);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">품목 주문 주기 분석</CardTitle>
        <p className="text-xs text-muted-foreground">
          평균 주문 간격 및 재주문 필요 품목 (3회 이상 주문)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="품목명 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8"
        />

        {chartData.length > 0 && (
          <ChartContainer
            id="reorder-interval"
            config={chartConfig}
            className="aspect-auto w-full"
            style={{ height: `${chartData.length * 40 + 30}px` }}
          >
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 20, bottom: 0, left: 0 }}
            >
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                unit="일"
              />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                width={160}
                fontSize={11}
                tickFormatter={(v: string) =>
                  v.length > 14 ? v.slice(0, 14) + "…" : v
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name, item) => (
                      <span>
                        {value}일 (총 {item.payload.orderCount}회 주문)
                      </span>
                    )}
                  />
                }
              />
              <Bar dataKey="avgDays" fill="#15BDF0" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        )}

        <div className="max-h-[300px] space-y-1 overflow-y-auto">
          {displayed.map((item) => {
            const overdue = item.daysSinceLastOrder > item.avgDays * 1.2;
            return (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-medium">{item.name}</span>
                  {overdue && (
                    <Badge variant="destructive" className="shrink-0 text-[10px] px-1.5 py-0">
                      재주문 필요
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                  <span>주기 {item.avgDays}일</span>
                  <span>{item.orderCount}회</span>
                  <span>{item.daysSinceLastOrder}일 경과</span>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length > 15 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            +{filtered.length - 15}개 더 보기
          </button>
        )}
      </CardContent>
    </Card>
  );
}
