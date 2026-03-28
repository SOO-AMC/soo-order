"use client";

import { useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { type SearchFilters, type StatusValue, type UrgentValue, type InvoiceValue, defaultFilters } from "@/lib/utils/search-params";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types/order";

interface SearchFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  personNames: string[];
}

export function SearchFilterSheet({
  open,
  onOpenChange,
  filters,
  onApply,
  personNames,
}: SearchFilterSheetProps) {
  const [local, setLocal] = useState<SearchFilters>(filters);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setLocal(filters);
    }
    onOpenChange(nextOpen);
  };

  const handleReset = () => {
    setLocal({ ...defaultFilters, q: filters.q });
  };

  const handleApply = () => {
    onApply(local);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={isDesktop ? "w-96 flex flex-col" : "max-h-[85vh] flex flex-col"}
      >
        <SheetHeader>
          <SheetTitle>필터</SheetTitle>
          <SheetDescription className="sr-only">주문 필터 옵션</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-3 px-4">
          {/* 주문 상태 + 긴급 여부 */}
          <div className="rounded-xl bg-card p-4 shadow-card space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">주문 상태</Label>
              <div className="flex flex-wrap gap-2">
                {(["pending", "ordered", "inspecting", "return_requested", "return_pending", "return_completed"] as const).map((value) => {
                  const label = ORDER_STATUS_LABEL[value as OrderStatus];
                  const isSelected = local.status.includes(value);
                  return (
                    <Badge
                      key={value}
                      variant={isSelected ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setLocal((p) => {
                        const next = isSelected
                          ? p.status.filter((s) => s !== value)
                          : [...p.status, value as StatusValue];
                        return { ...p, status: next.length > 0 ? next : [value as StatusValue] };
                      })}
                    >
                      {label}
                    </Badge>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">긴급 여부</Label>
              <div className="flex flex-wrap gap-2">
                {(["urgent", "normal"] as const).map((value) => {
                  const isSelected = local.urgent.includes(value);
                  return (
                    <Badge
                      key={value}
                      variant={isSelected ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setLocal((p) => {
                        const next = isSelected
                          ? p.urgent.filter((u) => u !== value)
                          : [...p.urgent, value as UrgentValue];
                        return { ...p, urgent: next.length > 0 ? next : [value as UrgentValue] };
                      })}
                    >
                      {value === "urgent" ? "긴급" : "일반"}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 주문 요청자 + 요청 날짜 범위 */}
          <div className="rounded-xl bg-card p-4 shadow-card space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">주문 요청자</Label>
              <Select
                value={local.requester || "all"}
                onValueChange={(v) => setLocal((p) => ({ ...p, requester: v === "all" ? "" : v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {personNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">요청 날짜 범위</Label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={local.dateFrom}
                  onChange={(e) => setLocal((p) => ({ ...p, dateFrom: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                />
                <span className="shrink-0 text-muted-foreground">~</span>
                <input
                  type="date"
                  value={local.dateTo}
                  onChange={(e) => setLocal((p) => ({ ...p, dateTo: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                />
              </div>
            </div>
          </div>

          {/* 발주자 + 발주 날짜 범위 */}
          <div className="rounded-xl bg-card p-4 shadow-card space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">발주자</Label>
              <Select
                value={local.updater || "all"}
                onValueChange={(v) => setLocal((p) => ({ ...p, updater: v === "all" ? "" : v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {personNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">발주 날짜 범위</Label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={local.ordDateFrom}
                  onChange={(e) => setLocal((p) => ({ ...p, ordDateFrom: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                />
                <span className="shrink-0 text-muted-foreground">~</span>
                <input
                  type="date"
                  value={local.ordDateTo}
                  onChange={(e) => setLocal((p) => ({ ...p, ordDateTo: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                />
              </div>
            </div>
          </div>

          {/* 검수자 + 검수 날짜 범위 + 거래명세서 수령 */}
          <div className="rounded-xl bg-card p-4 shadow-card space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">검수자</Label>
              <Select
                value={local.inspector || "all"}
                onValueChange={(v) => setLocal((p) => ({ ...p, inspector: v === "all" ? "" : v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {personNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">검수 날짜 범위</Label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={local.inspDateFrom}
                  onChange={(e) => setLocal((p) => ({ ...p, inspDateFrom: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                />
                <span className="shrink-0 text-muted-foreground">~</span>
                <input
                  type="date"
                  value={local.inspDateTo}
                  onChange={(e) => setLocal((p) => ({ ...p, inspDateTo: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">거래명세서 수령</Label>
              <div className="flex flex-wrap gap-2">
                {(["received", "not_received"] as const).map((value) => {
                  const isSelected = local.invoice.includes(value);
                  return (
                    <Badge
                      key={value}
                      variant={isSelected ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setLocal((p) => {
                        const next = isSelected
                          ? p.invoice.filter((i) => i !== value)
                          : [...p.invoice, value as InvoiceValue];
                        return { ...p, invoice: next.length > 0 ? next : [value as InvoiceValue] };
                      })}
                    >
                      {value === "received" ? "수령" : "미수령"}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 반품 신청자 + 반품 신청 날짜 범위 */}
          <div className="rounded-xl bg-card p-4 shadow-card space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">반품 신청자</Label>
              <Select
                value={local.retRequester || "all"}
                onValueChange={(v) => setLocal((p) => ({ ...p, retRequester: v === "all" ? "" : v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {personNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">반품 신청 날짜 범위</Label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={local.retDateFrom}
                  onChange={(e) => setLocal((p) => ({ ...p, retDateFrom: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                />
                <span className="shrink-0 text-muted-foreground">~</span>
                <input
                  type="date"
                  value={local.retDateTo}
                  onChange={(e) => setLocal((p) => ({ ...p, retDateTo: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                />
              </div>
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row gap-2 border-t pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button variant="outline" className="flex-1" onClick={handleReset}>
            초기화
          </Button>
          <Button className="flex-1" onClick={handleApply}>
            적용
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
