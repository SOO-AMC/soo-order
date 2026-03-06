"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Pencil, Trash2 } from "lucide-react";
import { deletePhotos } from "@/lib/utils/photo";
import { logClientAction } from "@/app/(main)/log-action";

interface OrderDetailActionsProps {
  orderId: string;
  itemName?: string;
}

export function OrderDetailActions({ orderId, itemName }: OrderDetailActionsProps) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleDelete = async () => {
    setIsDeleting(true);

    // Fetch photo_urls before deleting
    const { data: order } = await supabase
      .from("orders")
      .select("photo_urls")
      .eq("id", orderId)
      .single();

    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId);

    if (error) {
      setIsDeleting(false);
      setOpen(false);
      return;
    }

    // Clean up photos from storage
    if (order?.photo_urls?.length > 0) {
      await deletePhotos(supabase, order!.photo_urls).catch(() => {});
    }

    logClientAction("order", "delete_order", `${itemName ?? "품목"} 주문 삭제`);
    router.push("/orders");
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" className="flex-1" asChild>
        <Link href={`/orders/${orderId}/edit`}>
          <Pencil className="h-4 w-4" />
          수정
        </Link>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" className="flex-1">
            <Trash2 className="h-4 w-4" />
            삭제
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>요청 삭제</DialogTitle>
            <DialogDescription>
              이 주문 요청을 삭제하시겠습니까? 이 작업은 되돌릴 수
              없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isDeleting}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
