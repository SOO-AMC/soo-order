"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logClientAction } from "@/app/(main)/log-action";
import { dispatchReturn } from "@/lib/actions/order-mutations";

export function ReturnDispatchButton({ orderId, itemName }: { orderId: string; itemName?: string }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();

  const handleDispatch = async () => {
    setIsProcessing(true);
    try {
      await dispatchReturn(orderId);
      logClientAction("return", "dispatch_return", `${itemName ?? "품목"} 반품 접수`);
      router.push("/returns");
      router.refresh();
    } catch {
      setIsProcessing(false);
    }
  };

  return (
    <Button
      className="w-full"
      variant="outline"
      onClick={handleDispatch}
      disabled={isProcessing}
    >
      <Undo2 className="h-4 w-4" />
      {isProcessing ? "처리 중..." : "반품 접수"}
    </Button>
  );
}
