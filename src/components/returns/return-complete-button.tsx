"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function ReturnCompleteButton({ orderId }: { orderId: string }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleComplete = async () => {
    setIsProcessing(true);

    const userId = (await supabase.auth.getSession()).data.session?.user.id;

    const { error } = await supabase
      .from("orders")
      .update({ status: "return_completed", updated_by: userId })
      .eq("id", orderId);

    if (error) {
      setIsProcessing(false);
      return;
    }

    router.push("/returns");
    router.refresh();
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
