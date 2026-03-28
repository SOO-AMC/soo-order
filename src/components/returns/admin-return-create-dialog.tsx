"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useIsAdmin } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PhotoPicker, type PhotoItem } from "@/components/orders/photo-picker";
import { uploadPhoto } from "@/lib/utils/photo";
import { logClientAction } from "@/app/(main)/log-action";
import { adminCreateDirectReturn } from "@/lib/actions/order-mutations";

const EMPTY_FORM = { itemName: "", quantity: 1, unit: "", reason: "" };

export function AdminReturnCreateDialog() {
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = createClient();

  const handleSubmit = async () => {
    if (!form.itemName.trim()) return;
    setIsSubmitting(true);

    try {
      const newId = crypto.randomUUID();

      const uploadedPaths: string[] = [];
      for (const photo of photos) {
        if (photo.type === "new") {
          const path = await uploadPhoto(supabase, newId, photo.file);
          uploadedPaths.push(path);
        }
      }

      await adminCreateDirectReturn(
        newId,
        form.itemName,
        form.quantity,
        form.unit,
        form.reason,
        uploadedPaths,
      );

      logClientAction("return", "request_return", `${form.itemName} 반품 직접 등록`);
      setOpen(false);
    } catch {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setForm(EMPTY_FORM);
      setPhotos([]);
      setIsSubmitting(false);
    }
    setOpen(value);
  };

  if (!isAdmin) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon">
          <Plus className="h-5 w-5" />
          <span className="sr-only">반품 직접 등록</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>반품 직접 등록</DialogTitle>
          <DialogDescription>
            앱 이전 반품 등 기존 주문 이력이 없는 품목을 직접 등록합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="item-name">품목명</Label>
            <Input
              id="item-name"
              placeholder="품목명을 입력하세요"
              value={form.itemName}
              onChange={(e) => setForm({ ...form, itemName: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quantity">수량</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">단위 (선택)</Label>
              <Input
                id="unit"
                placeholder="박스, 개, 병..."
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">반품 사유 (선택)</Label>
            <Input
              id="reason"
              placeholder="사유를 입력하세요"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>사진 (선택)</Label>
            <PhotoPicker photos={photos} onChange={setPhotos} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            취소
          </Button>
          <Button
            className="bg-orange-500 text-white hover:bg-orange-600"
            onClick={handleSubmit}
            disabled={isSubmitting || !form.itemName.trim() || form.quantity < 1}
          >
            {isSubmitting ? "처리 중..." : "반품 등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
