"use client";

import { useState } from "react";
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

export interface SearchFilters {
  type: "all" | "order" | "return";
  status: "all" | "pending" | "ordered" | "inspecting";
  requesterName: string;
  updaterName: string;
  inspectorName: string;
  dateFrom: string;
  dateTo: string;
  inspectedDateFrom: string;
  inspectedDateTo: string;
  invoiceReceived: "all" | "received" | "not_received";
}

export const defaultFilters: SearchFilters = {
  type: "all",
  status: "all",
  requesterName: "all",
  updaterName: "all",
  inspectorName: "all",
  dateFrom: "",
  dateTo: "",
  inspectedDateFrom: "",
  inspectedDateTo: "",
  invoiceReceived: "all",
};

interface SearchFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  requesterNames: string[];
  updaterNames: string[];
  inspectorNames: string[];
}

export function SearchFilterSheet({
  open,
  onOpenChange,
  filters,
  onApply,
  requesterNames,
  updaterNames,
  inspectorNames,
}: SearchFilterSheetProps) {
  const [local, setLocal] = useState<SearchFilters>(filters);

  // Sheet 열릴 때 부모 필터 상태를 로컬에 복사
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setLocal(filters);
    }
    onOpenChange(nextOpen);
  };

  const handleReset = () => {
    setLocal(defaultFilters);
  };

  const handleApply = () => {
    onApply(local);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] flex flex-col" showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>필터</SheetTitle>
          <SheetDescription className="sr-only">주문 필터 옵션</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-5 px-4">
          {/* 주문 유형 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">주문 유형</Label>
            <div className="flex flex-wrap gap-2">
              {(["all", "order", "return"] as const).map((value) => (
                <Badge
                  key={value}
                  variant={local.type === value ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setLocal((p) => ({ ...p, type: value }))}
                >
                  {value === "all" ? "전체" : value === "order" ? "주문" : "반품"}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* 주문 상태 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">주문 상태</Label>
            <div className="flex flex-wrap gap-2">
              {(["all", "pending", "ordered", "inspecting"] as const).map((value) => (
                <Badge
                  key={value}
                  variant={local.status === value ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setLocal((p) => ({ ...p, status: value }))}
                >
                  {value === "all"
                    ? "전체"
                    : value === "pending"
                      ? "요청중"
                      : value === "ordered"
                        ? "발주완료"
                        : "검수완료"}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* 요청자 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">주문 요청자</Label>
            <Select
              value={local.requesterName}
              onValueChange={(v) => setLocal((p) => ({ ...p, requesterName: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {requesterNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* 요청 날짜 범위 */}
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

          <Separator />

          {/* 발주자 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">발주자</Label>
            <Select
              value={local.updaterName}
              onValueChange={(v) => setLocal((p) => ({ ...p, updaterName: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {updaterNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* 검수자 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">검수자</Label>
            <Select
              value={local.inspectorName}
              onValueChange={(v) => setLocal((p) => ({ ...p, inspectorName: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {inspectorNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* 검수 날짜 범위 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">검수 날짜 범위</Label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={local.inspectedDateFrom}
                onChange={(e) => setLocal((p) => ({ ...p, inspectedDateFrom: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              />
              <span className="shrink-0 text-muted-foreground">~</span>
              <input
                type="date"
                value={local.inspectedDateTo}
                onChange={(e) => setLocal((p) => ({ ...p, inspectedDateTo: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              />
            </div>
          </div>

          <Separator />

          {/* 거래명세서 수령 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">거래명세서 수령</Label>
            <div className="flex flex-wrap gap-2">
              {(["all", "received", "not_received"] as const).map((value) => (
                <Badge
                  key={value}
                  variant={local.invoiceReceived === value ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setLocal((p) => ({ ...p, invoiceReceived: value }))}
                >
                  {value === "all" ? "전체" : value === "received" ? "수령" : "미수령"}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
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
