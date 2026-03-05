"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { X } from "lucide-react";

interface CancelInspectionButtonProps {
  orderId: string;
}

export function CancelInspectionButton({ orderId }: CancelInspectionButtonProps) {
  const [open, setOpen] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleCancel = async () => {
    setIsCanceling(true);

    const { error } = await supabase
      .from("orders")
      .update({
        status: "ordered",
        confirmed_quantity: null,
        invoice_received: null,
        inspected_by: null,
        inspected_at: null,
      })
      .eq("id", orderId);

    if (error) {
      setIsCanceling(false);
      setOpen(false);
      return;
    }

    router.refresh();
    setOpen(false);
    setIsCanceling(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="w-full">
          <X className="h-4 w-4" />
          검수 취소
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>검수 취소</DialogTitle>
          <DialogDescription>
            검수를 취소하고 발주완료 상태로 되돌리시겠습니까?
            검수 정보(확인수량, 거래명세서, 검수자)가 초기화됩니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleCancel}
            disabled={isCanceling}
          >
            {isCanceling ? "처리 중..." : "검수 취소"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setOpen(false)}
            disabled={isCanceling}
          >
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
