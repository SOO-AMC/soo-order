"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OrderForm } from "@/components/orders/order-form";
import type { OrderFormResult } from "@/components/orders/order-form";
import { enqueueNewOrderPhotos, enqueueEditOrderPhotos } from "@/lib/utils/upload-queue";
import { logClientAction } from "@/app/(main)/log-action";

interface DuplicateInfo {
  id: string;
  quantity: number;
  unit: string;
}

export default function NewOrderPage() {
  const router = useRouter();
  const supabase = createClient();
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null);
  const [pendingData, setPendingData] = useState<OrderFormResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const createNewOrder = async (data: OrderFormResult) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: inserted, error } = await supabase
      .from("orders")
      .insert({
        type: "order",
        item_name: data.item_name,
        quantity: data.quantity,
        unit: data.unit,
        is_urgent: data.is_urgent,
        notes: data.notes,
        requester_id: user.id,
      })
      .select("id")
      .single();

    if (error || !inserted) throw error;

    logClientAction("order", "create_order", `${data.item_name} 주문 등록`);
    router.push("/orders");

    const newFiles = data.photos
      .filter((p) => p.type === "new")
      .map((p) => p.file);
    enqueueNewOrderPhotos(supabase, inserted.id, newFiles);
  };

  const overwriteOrder = async (existingId: string, data: OrderFormResult) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Get existing photo_urls to clean up
    const { data: existing } = await supabase
      .from("orders")
      .select("photo_urls")
      .eq("id", existingId)
      .single();

    const existingPaths = existing?.photo_urls ?? [];

    const { error } = await supabase
      .from("orders")
      .update({
        quantity: data.quantity,
        unit: data.unit,
        is_urgent: data.is_urgent,
        notes: data.notes,
        updated_by: user.id,
        photo_urls: [],
      })
      .eq("id", existingId);

    if (error) throw error;

    logClientAction("order", "update_order", `${data.item_name} 주문 덮어쓰기`);
    router.push("/orders");

    const newFiles = data.photos
      .filter((p) => p.type === "new")
      .map((p) => p.file);
    enqueueEditOrderPhotos(supabase, existingId, [], newFiles, existingPaths);
  };

  const handleSubmit = async (data: OrderFormResult) => {
    // Check for duplicate item name in pending orders
    const { data: duplicates } = await supabase
      .from("orders")
      .select("id, quantity, unit")
      .eq("type", "order")
      .eq("status", "pending")
      .ilike("item_name", data.item_name.trim());

    if (duplicates && duplicates.length > 0) {
      setDuplicateInfo({
        id: duplicates[0].id,
        quantity: duplicates[0].quantity,
        unit: duplicates[0].unit,
      });
      setPendingData(data);
      setDuplicateOpen(true);
      return;
    }

    await createNewOrder(data);
  };

  const handleOverwrite = async () => {
    if (!duplicateInfo || !pendingData) return;
    setIsProcessing(true);
    try {
      await overwriteOrder(duplicateInfo.id, pendingData);
    } catch {
      setIsProcessing(false);
    }
  };

  const handleCreateNew = async () => {
    if (!pendingData) return;
    setIsProcessing(true);
    try {
      await createNewOrder(pendingData);
    } catch {
      setIsProcessing(false);
    }
  };

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-none">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/orders">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">새 주문 등록</h1>
      </header>
      <div className="p-4">
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <OrderForm onSubmit={handleSubmit} />
        </div>
      </div>

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>동일 품목 존재</DialogTitle>
            <DialogDescription>
              &quot;{pendingData?.item_name}&quot; 품목이 이미 주문 목록에 있습니다.
              (수량: {duplicateInfo?.quantity ?? 0}{duplicateInfo?.unit ? ` ${duplicateInfo.unit}` : ""})
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full"
              onClick={handleOverwrite}
              disabled={isProcessing}
            >
              기존 주문 덮어쓰기
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCreateNew}
              disabled={isProcessing}
            >
              새 주문 추가
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setDuplicateOpen(false)}
              disabled={isProcessing}
            >
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
