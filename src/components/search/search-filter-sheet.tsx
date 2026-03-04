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

export interface SearchFilters {
  type: "all" | "order" | "return";
  status: "all" | "pending" | "ordered" | "inspecting" | "return_requested" | "return_completed";
  requesterName: string;
  updaterName: string;
  inspectorName: string;
  dateFrom: string;
  dateTo: string;
  orderedDateFrom: string;
  orderedDateTo: string;
  inspectedDateFrom: string;
  inspectedDateTo: string;
  returnRequesterName: string;
  returnDateFrom: string;
  returnDateTo: string;
  invoiceReceived: "all" | "received" | "not_received";
  isUrgent: "all" | "urgent" | "normal";
}

export const defaultFilters: SearchFilters = {
  type: "all",
  status: "all",
  requesterName: "all",
  updaterName: "all",
  inspectorName: "all",
  dateFrom: "",
  dateTo: "",
  orderedDateFrom: "",
  orderedDateTo: "",
  inspectedDateFrom: "",
  inspectedDateTo: "",
  returnRequesterName: "all",
  returnDateFrom: "",
  returnDateTo: "",
  invoiceReceived: "all",
  isUrgent: "all",
};

interface SearchFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  requesterNames: string[];
  updaterNames: string[];
  inspectorNames: string[];
  returnRequesterNames: string[];
}

export function SearchFilterSheet({
  open,
  onOpenChange,
  filters,
  onApply,
  requesterNames,
  updaterNames,
  inspectorNames,
  returnRequesterNames,
}: SearchFilterSheetProps) {
  const [local, setLocal] = useState<SearchFilters>(filters);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

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
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={isDesktop ? "w-96 flex flex-col" : "max-h-[85vh] flex flex-col"}
        showCloseButton={isDesktop}
      >
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
              {(["all", "pending", "ordered", "inspecting", "return_requested", "return_completed"] as const).map((value) => {
                const label = {
                  all: "전체",
                  pending: "요청중",
                  ordered: "발주완료",
                  inspecting: "검수완료",
                  return_requested: "반품신청",
                  return_completed: "반품완료",
                }[value];
                return (
                  <Badge
                    key={value}
                    variant={local.status === value ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setLocal((p) => ({ ...p, status: value }))}
                  >
                    {label}
                  </Badge>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* 긴급 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">긴급 여부</Label>
            <div className="flex flex-wrap gap-2">
              {(["all", "urgent", "normal"] as const).map((value) => (
                <Badge
                  key={value}
                  variant={local.isUrgent === value ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setLocal((p) => ({ ...p, isUrgent: value }))}
                >
                  {value === "all" ? "전체" : value === "urgent" ? "긴급" : "일반"}
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

          {/* 발주 날짜 범위 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">발주 날짜 범위</Label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={local.orderedDateFrom}
                onChange={(e) => setLocal((p) => ({ ...p, orderedDateFrom: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              />
              <span className="shrink-0 text-muted-foreground">~</span>
              <input
                type="date"
                value={local.orderedDateTo}
                onChange={(e) => setLocal((p) => ({ ...p, orderedDateTo: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              />
            </div>
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

          {/* 반품 신청자 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">반품 신청자</Label>
            <Select
              value={local.returnRequesterName}
              onValueChange={(v) => setLocal((p) => ({ ...p, returnRequesterName: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {returnRequesterNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* 반품 신청 날짜 범위 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">반품 신청 날짜 범위</Label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={local.returnDateFrom}
                onChange={(e) => setLocal((p) => ({ ...p, returnDateFrom: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              />
              <span className="shrink-0 text-muted-foreground">~</span>
              <input
                type="date"
                value={local.returnDateTo}
                onChange={(e) => setLocal((p) => ({ ...p, returnDateTo: e.target.value }))}
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
