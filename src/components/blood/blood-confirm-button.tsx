"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dialog";
import { logClientAction } from "@/app/(main)/log-action";
import { SETTLEMENT_TYPE_LABEL, type SettlementType } from "@/lib/types/blood";

interface BloodConfirmButtonProps {
  recordId: string;
  hospitalName: string;
}

export function BloodConfirmButton({ recordId, hospitalName }: BloodConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  const [settlementType, setSettlementType] = useState<SettlementType | "">("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleConfirm = async () => {
    if (!settlementType) {
      setError("결제 방식을 선택해주세요.");
      return;
    }

    setError("");
    setIsProcessing(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: updateError } = await supabase
      .from("blood_records")
      .update({
        status: "confirmed",
        settlement_type: settlementType,
        confirmed_by: user?.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", recordId);

    if (updateError) {
      setError("처리에 실패했습니다.");
      setIsProcessing(false);
      return;
    }

    logClientAction("blood", "confirm_blood", `${hospitalName} 혈액 기록 확인 (${SETTLEMENT_TYPE_LABEL[settlementType as SettlementType]})`);
    setOpen(false);
    router.push("/blood");
  };

  return (
    <>
      <Button className="w-full" onClick={() => setOpen(true)}>
        <Check className="h-4 w-4" />
        확인 처리
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>확인 처리</DialogTitle>
            <DialogDescription>
              결제 방식을 선택해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>결제 방식</Label>
              <Select value={settlementType} onValueChange={(v) => setSettlementType(v as SettlementType)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="결제 방식 선택" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SETTLEMENT_TYPE_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                취소
              </Button>
            </DialogClose>
            <Button onClick={handleConfirm} disabled={isProcessing}>
              {isProcessing ? "처리 중..." : "확인 완료"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
