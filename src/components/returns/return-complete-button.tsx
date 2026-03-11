"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logClientAction } from "@/app/(main)/log-action";
import { completeReturn } from "@/lib/actions/order-mutations";

export function ReturnCompleteButton({ orderId, itemName }: { orderId: string; itemName?: string }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();

  const handleComplete = async () => {
    setIsProcessing(true);

    try {
      await completeReturn(orderId);
      logClientAction("return", "complete_return", `${itemName ?? "품목"} 반품 완료`);
      router.push("/returns");
      router.refresh();
    } catch {
      setIsProcessing(false);
    }
  };

  return (
    <Button
      className="w-full"
      onClick={handleComplete}
      disabled={isProcessing}
    >
      <Undo2 className="h-4 w-4" />
      {isProcessing ? "처리 중..." : "반품 완료"}
    </Button>
  );
}
