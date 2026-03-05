"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ItemVendorMapping } from "@/lib/types/dashboard";

interface Props {
  data: ItemVendorMapping[];
}

export function ItemVendorTable({ data }: Props) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = data.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.vendors.some((v) =>
        v.vendor.toLowerCase().includes(search.toLowerCase())
      )
  );

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">품목-업체 매핑</CardTitle>
        <p className="text-xs text-muted-foreground">
          품목별 주문 업체 분포 (복수 업체 품목 우선)
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="품목명 또는 업체명 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8"
        />

        <div className="max-h-[400px] space-y-1 overflow-y-auto">
          {filtered.slice(0, 50).map((item) => {
            const isExpanded = expanded.has(item.name);
            return (
              <div key={item.name} className="rounded-md border">
                <button
                  onClick={() => toggle(item.name)}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate font-medium">{item.name}</span>
                    {item.vendors.length > 1 && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px] px-1.5 py-0"
                      >
                        {item.vendors.length}개 업체
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {item.totalOrders}건
                  </span>
                </button>
                {isExpanded && (
                  <div className="border-t px-3 py-2 space-y-1">
                    {item.vendors.map((v) => (
                      <div
                        key={v.vendor}
                        className="flex justify-between text-xs"
                      >
                        <span className="text-muted-foreground">
                          {v.vendor}
                        </span>
                        <span>
                          {v.count}건 (
                          {Math.round((v.count / item.totalOrders) * 100)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            검색 결과가 없습니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
