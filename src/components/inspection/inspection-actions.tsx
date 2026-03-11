"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { ClipboardCheck, PackageX, Pencil, X } from "lucide-react";
import { logClientAction } from "@/app/(main)/log-action";
import {
  inspectOrder,
  markOutOfStock,
  revertOrderToPending,
  deleteOrder,
} from "@/lib/actions/order-mutations";

interface InspectionActionsProps {
  orderId: string;
  itemName?: string;
  defaultQuantity: number;
  canCancel: boolean;
  isAdmin?: boolean;
}

export function InspectionActions({
  orderId,
  itemName,
  defaultQuantity,
  canCancel,
  isAdmin,
}: InspectionActionsProps) {
  const [inspectOpen, setInspectOpen] = useState(false);
  const [confirmedQuantity, setConfirmedQuantity] =
    useState(defaultQuantity);
  const [invoiceReceived, setInvoiceReceived] = useState<string>("");
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState("");

  const [outOfStockOpen, setOutOfStockOpen] = useState(false);
  const [outOfStockReason, setOutOfStockReason] = useState("");
  const [isOutOfStocking, setIsOutOfStocking] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const router = useRouter();

  const handleInspect = async () => {
    if (!invoiceReceived) {
      setInspectError("거래명세서 수령 여부를 선택해주세요.");
      return;
    }

    setInspectError("");
    setIsInspecting(true);

    try {
      await inspectOrder(
        orderId,
        confirmedQuantity,
        invoiceReceived === "received",
        inspectionNotes,
      );
      logClientAction("inspection", "inspect", `${itemName ?? "품목"} 검수 완료`);
      setInspectOpen(false);
      router.push("/inspection");
    } catch {
      setIsInspecting(false);
    }
  };

  const handleOutOfStock = async () => {
    setIsOutOfStocking(true);

    try {
      await markOutOfStock(orderId, outOfStockReason);
      logClientAction("inspection", "out_of_stock", `${itemName ?? "품목"} 품절 처리${outOfStockReason.trim() ? ` (사유: ${outOfStockReason.trim()})` : ""}`);
      setOutOfStockOpen(false);
      router.push("/inspection");
    } catch {
      setIsOutOfStocking(false);
    }
  };

  const handleCancel = async (action: "revert" | "delete") => {
    setIsCanceling(true);

    try {
      if (action === "delete") {
        await deleteOrder(orderId);
        logClientAction("order", "delete_order", `${itemName ?? "품목"} 주문 삭제`);
      } else {
        await revertOrderToPending(orderId);
        logClientAction("dispatch", "cancel_dispatch", `${itemName ?? "품목"} 발주 취소 (주문신청으로 되돌리기)`);
      }
      router.push("/inspection");
    } catch {
      setIsCanceling(false);
      setCancelOpen(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={() => setInspectOpen(true)}>
        <ClipboardCheck className="h-4 w-4" />
        검수 완료
      </Button>

      <Dialog open={inspectOpen} onOpenChange={setInspectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>검수 처리</DialogTitle>
            <DialogDescription>
              확인 수량과 거래명세서 수령 여부를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="confirmed-qty">확인 수량</Label>
              <Input
                id="confirmed-qty"
                type="number"
                min={1}
                value={confirmedQuantity}
                onChange={(e) => setConfirmedQuantity(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>거래명세서</Label>
              <Select value={invoiceReceived} onValueChange={setInvoiceReceived}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="수령 여부 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">수령</SelectItem>
                  <SelectItem value="not_received">미수령</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inspection-notes">비고</Label>
              <Input
                id="inspection-notes"
                placeholder="비고 (선택)"
                value={inspectionNotes}
                onChange={(e) => setInspectionNotes(e.target.value)}
              />
            </div>
            {inspectError && (
              <p className="text-sm text-destructive">{inspectError}</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                취소
              </Button>
            </DialogClose>
            <Button onClick={handleInspect} disabled={isInspecting}>
              {isInspecting ? "처리 중..." : "검수 완료"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={outOfStockOpen} onOpenChange={setOutOfStockOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
            <PackageX className="h-4 w-4" />
            품절
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>품절 처리</DialogTitle>
            <DialogDescription>
              이 품목을 품절로 처리하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="out-of-stock-reason">품절 사유</Label>
            <Input
              id="out-of-stock-reason"
              placeholder="품절 사유 (선택)"
              value={outOfStockReason}
              onChange={(e) => setOutOfStockReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                취소
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleOutOfStock} disabled={isOutOfStocking}>
              {isOutOfStocking ? "처리 중..." : "품절 처리"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(isAdmin || canCancel) && (
        <>
          <Separator />
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" className="flex-1" asChild>
                <Link href={`/inspection/${orderId}/edit`}>
                  <Pencil className="h-4 w-4" />
                  수정
                </Link>
              </Button>
            )}
            {canCancel && (
              <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" className="flex-1">
                    <X className="h-4 w-4" />
                    주문 취소
                  </Button>
                </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>주문 취소</DialogTitle>
                <DialogDescription>
                  이 주문을 어떻게 처리하시겠습니까?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleCancel("revert")}
                  disabled={isCanceling}
                >
                  주문신청으로 되돌리기
                </Button>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => handleCancel("delete")}
                  disabled={isCanceling}
                >
                  완전 삭제
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setCancelOpen(false)}
                  disabled={isCanceling}
                >
                  취소
                </Button>
              </DialogFooter>
            </DialogContent>
              </Dialog>
            )}
          </div>
        </>
      )}
    </div>
  );
}
