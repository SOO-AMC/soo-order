"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ItemNameAutocomplete } from "./item-name-autocomplete";
import { PhotoPicker, photoItemsFromPaths } from "./photo-picker";
import type { PhotoItem } from "./photo-picker";
import { itemNamesLooselyMatch } from "@/lib/utils/normalize-item-name";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types/order";

interface OrderFormData {
  item_name: string;
  quantity: number;
  unit: string;
  is_urgent: boolean;
  notes: string;
  vendor_name?: string;
}

export interface OrderFormResult extends Omit<OrderFormData, "vendor_name"> {
  vendor_name: string;
  photos: PhotoItem[];
}

/** 진행 중(주문신청/검수대기) 주문 — 중복 주문 경고용 */
export interface ActiveOrderRef {
  id: string;
  item_name: string;
  quantity: number;
  unit: string;
  status: OrderStatus;
  requester: { full_name: string | null } | null;
}

interface OrderFormProps {
  defaultValues?: OrderFormData;
  existingPhotoUrls?: string[];
  showVendorField?: boolean;
  /** 제공되면 입력 중인 품목명과 겹치는 진행 중 주문을 경고로 표시 */
  activeOrders?: ActiveOrderRef[];
  onSubmit: (data: OrderFormResult) => Promise<void>;
}

export function OrderForm({ defaultValues, existingPhotoUrls, showVendorField, activeOrders, onSubmit }: OrderFormProps) {
  const [itemName, setItemName] = useState(defaultValues?.item_name ?? "");
  const [quantity, setQuantity] = useState(
    defaultValues?.quantity?.toString() ?? ""
  );
  const [unit, setUnit] = useState(defaultValues?.unit ?? "");
  const [isUrgent, setIsUrgent] = useState(defaultValues?.is_urgent ?? false);
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [vendorName, setVendorName] = useState(defaultValues?.vendor_name ?? "");
  const [photos, setPhotos] = useState<PhotoItem[]>(
    existingPhotoUrls ? photoItemsFromPaths(existingPhotoUrls) : []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!defaultValues;

  const duplicateMatches = useMemo(() => {
    const name = itemName.trim();
    if (!activeOrders || name.length < 2) return [];
    return activeOrders.filter((o) => itemNamesLooselyMatch(o.item_name, name));
  }, [activeOrders, itemName]);

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
        vendor_name: vendorName.trim(),
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
        {duplicateMatches.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p className="font-medium">⚠️ 이미 진행 중인 주문이 있어요</p>
            <ul className="mt-1 space-y-0.5">
              {duplicateMatches.slice(0, 5).map((o) => (
                <li key={o.id}>
                  {o.item_name}
                  {o.quantity > 0 ? ` ${o.quantity}${o.unit ? ` ${o.unit}` : ""}` : ""} — {o.requester?.full_name ?? "?"} ({ORDER_STATUS_LABEL[o.status]})
                </li>
              ))}
            </ul>
            <p className="mt-1 text-amber-700">이미 충분하면 중복으로 넣지 마세요. 추가가 필요하면 등록 시 &quot;기존 주문에 합치기&quot;를 쓰면 됩니다.</p>
          </div>
        )}
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

      {showVendorField && (
        <div className="space-y-2">
          <Label htmlFor="vendor_name">업체명</Label>
          <Input
            id="vendor_name"
            type="text"
            placeholder="업체명"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
          />
        </div>
      )}

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
