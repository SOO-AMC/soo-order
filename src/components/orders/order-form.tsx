"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ItemNameAutocomplete } from "./item-name-autocomplete";
import { PhotoPicker, photoItemsFromPaths } from "./photo-picker";
import type { PhotoItem } from "./photo-picker";

interface OrderFormData {
  item_name: string;
  quantity: number;
  unit: string;
  is_urgent: boolean;
  notes: string;
}

export interface OrderFormResult extends OrderFormData {
  photos: PhotoItem[];
}

interface OrderFormProps {
  defaultValues?: OrderFormData;
  existingPhotoUrls?: string[];
  onSubmit: (data: OrderFormResult) => Promise<void>;
}

export function OrderForm({ defaultValues, existingPhotoUrls, onSubmit }: OrderFormProps) {
  const [itemName, setItemName] = useState(defaultValues?.item_name ?? "");
  const [quantity, setQuantity] = useState(
    defaultValues?.quantity?.toString() ?? ""
  );
  const [unit, setUnit] = useState(defaultValues?.unit ?? "");
  const [isUrgent, setIsUrgent] = useState(defaultValues?.is_urgent ?? false);
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [photos, setPhotos] = useState<PhotoItem[]>(
    existingPhotoUrls ? photoItemsFromPaths(existingPhotoUrls) : []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!defaultValues;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const qty = parseInt(quantity, 10) || 0;
    const hasPhotos = photos.length > 0;
    if (!itemName.trim()) {
      setError("품목명을 입력해주세요.");
      return;
    }
    if (!hasPhotos && qty < 1) {
      setError("수량을 입력하거나 사진을 첨부해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({
        item_name: itemName.trim(),
        quantity: qty,
        unit: unit.trim(),
        is_urgent: isUrgent,
        notes: notes.trim(),
        photos,
      });
    } catch {
      setError("요청 처리 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>사진</Label>
        <PhotoPicker photos={photos} onChange={setPhotos} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="item_name">품목</Label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={isUrgent}
              onCheckedChange={(checked) => setIsUrgent(checked === true)}
            />
            <span className="text-sm font-medium text-red-500">긴급</span>
          </label>
        </div>
        <ItemNameAutocomplete value={itemName} onChange={setItemName} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="quantity">수량</Label>
        <div className="flex gap-2">
          <Input
            id="quantity"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="수량"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="flex-1"
          />
          <Input
            id="unit"
            type="text"
            placeholder="단위 (예: 개, 박스)"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-28"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">비고</Label>
        <Input
          id="notes"
          type="text"
          placeholder="비고 (선택)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "처리 중..." : isEdit ? "수정" : "등록"}
      </Button>
    </form>
  );
}
