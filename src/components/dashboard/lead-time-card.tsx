"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatHours } from "@/lib/utils/format";
import type { LeadTimeData, SlowItem } from "@/lib/types/dashboard";

function SlowList({ title, items }: { title: string; items: SlowItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="font-medium text-muted-foreground">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((i) => (
          <li key={i.name} className="flex justify-between gap-2">
            <span className="truncate">{i.name}</span>
            <span className="shrink-0 tabular-nums">{formatHours(i.hours)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LeadTimeCard({ data }: { data: LeadTimeData }) {
  const hasData = data.stages.some((s) => s.count > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">처리 시간 (최근 {data.windowDays}일)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasData ? (
          <p className="text-sm text-muted-foreground">아직 표본이 부족합니다. 발주·검수가 쌓이면 단계별 평균 소요시간이 표시됩니다.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.stages.map((s) => {
              const diff = s.count > 0 && s.avgHoursPrev > 0 ? s.avgHours - s.avgHoursPrev : 0;
              const worse = diff > 0;
              return (
                <div key={s.key} className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="mt-0.5 text-lg font-bold">{s.count ? formatHours(s.avgHours) : "-"}</p>
                  {s.count > 0 && s.avgHoursPrev > 0 && Math.abs(diff) >= 0.1 && (
                    <p className={worse ? "text-xs text-red-600" : "text-xs text-green-700"}>
                      {worse ? "▲" : "▼"} 직전 {data.windowDays}일 대비 {formatHours(Math.abs(diff))} {worse ? "느려짐" : "빨라짐"}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">표본 {s.count}건</p>
                </div>
              );
            })}
          </div>
        )}

        {(data.slowestToDispatch.length > 0 || data.slowestToInspect.length > 0) && (
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <SlowList title="발주가 느렸던 품목" items={data.slowestToDispatch} />
            <SlowList title="검수까지 느렸던 품목" items={data.slowestToInspect} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
