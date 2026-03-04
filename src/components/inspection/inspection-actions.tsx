"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
import { ClipboardCheck, X } from "lucide-react";

interface InspectionActionsProps {
  orderId: string;
  defaultQuantity: number;
  canCancel: boolean;
}

export function InspectionActions({
  orderId,
  defaultQuantity,
  canCancel,
}: InspectionActionsProps) {
  const [inspectOpen, setInspectOpen] = useState(false);
  const [confirmedQuantity, setConfirmedQuantity] =
    useState(defaultQuantity);
  const [invoiceReceived, setInvoiceReceived] = useState<string>("");
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  const handleInspect = async () => {
    if (!invoiceReceived) {
      setInspectError("거래명세서 수령 여부를 선택해주세요.");
      return;
    }

    setInspectError("");
    setIsInspecting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("orders")
      .update({
        status: "inspecting",
        confirmed_quantity: confirmedQuantity,
        invoice_received: invoiceReceived === "received",
        inspected_by: user?.id,
        inspected_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) {
      setIsInspecting(false);
      return;
    }

    setInspectOpen(false);
    router.push("/inspection");
  };

  const handleCancel = async (action: "revert" | "delete") => {
    setIsCanceling(true);

    if (action === "delete") {
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderId);

      if (error) {
        setIsCanceling(false);
        setCancelOpen(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from("orders")
        .update({ status: "pending" })
        .eq("id", orderId);

      if (error) {
        setIsCanceling(false);
        setCancelOpen(false);
        return;
      }
    }

    router.push("/inspection");
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

      {canCancel && (
        <>
          <Separator />
          <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full">
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
                  요청중으로 되돌리기
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
        </>
      )}
    </div>
  );
}
