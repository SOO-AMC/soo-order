"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
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
import { logClientAction } from "@/app/(main)/log-action";

interface DeleteBloodButtonProps {
  recordId: string;
  hospitalName: string;
}

export function DeleteBloodButton({ recordId, hospitalName }: DeleteBloodButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleDelete = async () => {
    setIsProcessing(true);

    const { error } = await supabase
      .from("blood_records")
      .delete()
      .eq("id", recordId);

    if (error) {
      setIsProcessing(false);
      return;
    }

    logClientAction("blood", "delete_blood", `${hospitalName} 혈액 기록 삭제`);
    router.push("/blood");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" className="w-full">
          <Trash2 className="h-4 w-4" />
          삭제
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>혈액 기록 삭제</DialogTitle>
          <DialogDescription>
            이 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              취소
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={isProcessing}>
            {isProcessing ? "삭제 중..." : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
