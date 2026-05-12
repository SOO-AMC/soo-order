"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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
import type { OrderFormResult, ActiveOrderRef } from "@/components/orders/order-form";
import { enqueueNewOrderPhotos, enqueueEditOrderPhotos } from "@/lib/utils/upload-queue";
import { logClientAction } from "@/app/(main)/log-action";
import { itemNamesLooselyMatch } from "@/lib/utils/normalize-item-name";
import { ORDER_STATUS_LABEL } from "@/lib/types/order";

export default function NewOrderPage() {
  const router = useRouter();
  const supabase = createClient();
  const { userName } = useAuth();
  const [activeOrders, setActiveOrders] = useState<ActiveOrderRef[]>([]);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<ActiveOrderRef[]>([]);
  const [pendingData, setPendingData] = useState<OrderFormResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchActiveOrders = async () => {
    const { data } = await supabase
      .from("orders")
      .select("id, item_name, quantity, unit, status, requester:profiles!requester_id(full_name)")
      .eq("type", "order")
      .in("status", ["pending", "ordered"])
      .order("created_at", { ascending: true });
    return (data as ActiveOrderRef[] | null) ?? [];
  };

  useEffect(() => {
    fetchActiveOrders().then(setActiveOrders).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingMatch = duplicateMatches.find((o) => o.status === "pending") ?? null;

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

    const newFiles = data.photos.filter((p) => p.type === "new").map((p) => p.file);
    enqueueNewOrderPhotos(supabase, inserted.id, newFiles);
  };

  const overwriteOrder = async (existingId: string, data: OrderFormResult) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

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

    const newFiles = data.photos.filter((p) => p.type === "new").map((p) => p.file);
    enqueueEditOrderPhotos(supabase, existingId, [], newFiles, existingPaths);
  };

  const mergeIntoOrder = async (target: ActiveOrderRef, data: OrderFormResult) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from("orders")
      .select("quantity, notes, photo_urls, is_urgent")
      .eq("id", target.id)
      .single();
    const prevQty = existing?.quantity ?? target.quantity;
    const prevNotes = (existing?.notes ?? "").trim();
    const existingPaths = existing?.photo_urls ?? [];
    const prevUrgent = existing?.is_urgent ?? false;

    const addLabel = `${userName || "추가"} ${data.quantity}${data.unit ? ` ${data.unit}` : ""} 추가${data.notes ? ` (${data.notes})` : ""}`;
    const mergedNotes = [prevNotes, addLabel].filter(Boolean).join(" / ");

    const { error } = await supabase
      .from("orders")
      .update({
        quantity: prevQty + data.quantity,
        notes: mergedNotes,
        is_urgent: prevUrgent || data.is_urgent,
        updated_by: user.id,
        photo_urls: existingPaths,
      })
      .eq("id", target.id);

    if (error) throw error;

    logClientAction("order", "merge_order", `${data.item_name} 기존 주문에 합침 (+${data.quantity}${data.unit ?? ""})`);
    router.push("/orders");

    const newFiles = data.photos.filter((p) => p.type === "new").map((p) => p.file);
    enqueueEditOrderPhotos(supabase, target.id, existingPaths, newFiles, []);
  };

  const handleSubmit = async (data: OrderFormResult) => {
    const active = await fetchActiveOrders();
    setActiveOrders(active);
    const matches = active.filter((o) => itemNamesLooselyMatch(o.item_name, data.item_name));

    if (matches.length > 0) {
      setDuplicateMatches(matches);
      setPendingData(data);
      setDuplicateOpen(true);
      return;
    }

    await createNewOrder(data);
  };

  const runAndHandle = async (fn: () => Promise<void>) => {
    setIsProcessing(true);
    try {
      await fn();
    } catch {
      setIsProcessing(false);
    }
  };

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-none">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/orders">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">새 주문 등록</h1>
      </header>
      <div className="p-4">
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <OrderForm onSubmit={handleSubmit} activeOrders={activeOrders} />
        </div>
      </div>

      <Dialog open={duplicateOpen} onOpenChange={(o) => { if (!o) setDuplicateOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이미 진행 중인 주문이 있어요</DialogTitle>
            <DialogDescription>
              &quot;{pendingData?.item_name}&quot; 와(과) 겹치는 주문:
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
            {duplicateMatches.slice(0, 8).map((o) => (
              <li key={o.id}>
                {o.item_name}
                {o.quantity > 0 ? ` ${o.quantity}${o.unit ? ` ${o.unit}` : ""}` : ""} — {o.requester?.full_name ?? "?"} ({ORDER_STATUS_LABEL[o.status]})
              </li>
            ))}
          </ul>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {pendingMatch && pendingData && (
              <Button
                className="w-full"
                disabled={isProcessing}
                onClick={() => runAndHandle(() => mergeIntoOrder(pendingMatch, pendingData))}
              >
                기존 주문에 합치기 ({pendingMatch.quantity} → {pendingMatch.quantity + pendingData.quantity})
              </Button>
            )}
            {pendingMatch && pendingData && (
              <Button
                variant="outline"
                className="w-full"
                disabled={isProcessing}
                onClick={() => runAndHandle(() => overwriteOrder(pendingMatch.id, pendingData))}
              >
                기존 주문 덮어쓰기
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              disabled={isProcessing}
              onClick={() => pendingData && runAndHandle(() => createNewOrder(pendingData))}
            >
              {pendingMatch ? "별개로 추가" : "그래도 주문"}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              disabled={isProcessing}
              onClick={() => setDuplicateOpen(false)}
            >
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
