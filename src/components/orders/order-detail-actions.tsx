"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteOrderButton } from "@/components/orders/delete-order-button";

interface OrderDetailActionsProps {
  orderId: string;
  itemName?: string;
  /** 다른 사람의 주문을 관리자가 지우는 경우 — 사유를 받고 주문자에게 알린다 */
  deleteNeedsReason: boolean;
}

export function OrderDetailActions({ orderId, itemName, deleteNeedsReason }: OrderDetailActionsProps) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" className="flex-1" asChild>
        <Link href={`/orders/${orderId}/edit`}>
          <Pencil className="h-4 w-4" />
          수정
        </Link>
      </Button>
      <DeleteOrderButton orderId={orderId} itemName={itemName} needsReason={deleteNeedsReason} redirectTo="/orders" />
    </div>
  );
}
