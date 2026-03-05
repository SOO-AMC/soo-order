"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ReturnRequestButtonProps {
  orderId: string;
  defaultQuantity: number;
  unit: string;
}

export function ReturnRequestButton({
  orderId,
  defaultQuantity,
  unit,
}: ReturnRequestButtonProps) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(defaultQuantity);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async () => {
    setIsSubmitting(true);

    const userId = (await supabase.auth.getSession()).data.session?.user.id;

    const { error } = await supabase
      .from("orders")
      .update({
        status: "return_requested",
        return_quantity: quantity,
        return_reason: reason,
        return_requested_by: userId,
        return_requested_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) {
      setIsSubmitting(false);
      return;
    }

    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Undo2 className="h-4 w-4" />
          반품 신청
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>반품 신청</DialogTitle>
          <DialogDescription>
            반품할 수량과 사유를 입력해주세요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="return-quantity">
              반품 수량{unit ? ` (${unit})` : ""}
            </Label>
            <Input
              id="return-quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="return-reason">반품 사유 (선택)</Label>
            <Input
              id="return-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="사유를 입력하세요"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            취소
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isSubmitting || quantity < 1}
          >
            {isSubmitting ? "처리 중..." : "반품 신청"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
