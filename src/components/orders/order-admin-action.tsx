"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { ShoppingCart } from "lucide-react";
import { logClientAction } from "@/app/(main)/log-action";

interface OrderAdminActionProps {
  orderId: string;
  itemName?: string;
}

export function OrderAdminAction({ orderId, itemName }: OrderAdminActionProps) {
  const [open, setOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleOrder = async () => {
    setIsLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("orders")
      .update({
        status: "ordered",
        updated_by: user?.id,
        vendor_name: vendorName,
        order_notes: orderNotes.trim(),
      })
      .eq("id", orderId);

    if (error) {
      setIsLoading(false);
      return;
    }

    logClientAction("dispatch", "dispatch_single", `${itemName ?? "품목"} 발주 (업체: ${vendorName || "미입력"})`);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button className="w-full" onClick={() => setOpen(true)}>
        <ShoppingCart className="h-4 w-4" />
        주문하기
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>주문하기</DialogTitle>
            <DialogDescription>업체명을 입력하고 주문을 진행합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="vendor-name">업체명</Label>
              <Input
                id="vendor-name"
                placeholder="업체명을 입력하세요"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-notes">비고</Label>
              <Input
                id="order-notes"
                placeholder="비고 (선택)"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                취소
              </Button>
            </DialogClose>
            <Button onClick={handleOrder} disabled={isLoading}>
              {isLoading ? "처리 중..." : "주문"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
