"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ItemNameAutocomplete } from "./item-name-autocomplete";
import type { OrderType } from "@/lib/types/order";

interface OrderFormData {
  type: OrderType;
  item_name: string;
  quantity: number;
  unit: string;
}

interface OrderFormProps {
  defaultValues?: OrderFormData;
  onSubmit: (data: OrderFormData) => Promise<void>;
}

export function OrderForm({ defaultValues, onSubmit }: OrderFormProps) {
  const [type, setType] = useState<OrderType>(
    defaultValues?.type ?? "order"
  );
  const [itemName, setItemName] = useState(defaultValues?.item_name ?? "");
  const [quantity, setQuantity] = useState(
    defaultValues?.quantity?.toString() ?? ""
  );
  const [unit, setUnit] = useState(defaultValues?.unit ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!defaultValues;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const qty = parseInt(quantity, 10);
    if (!itemName.trim()) {
      setError("품목명을 입력해주세요.");
      return;
    }
    if (!qty || qty < 1) {
      setError("수량은 1 이상이어야 합니다.");
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({ type, item_name: itemName.trim(), quantity: qty, unit: unit.trim() });
    } catch {
      setError("요청 처리 중 오류가 발생했습니다.");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>유형</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={type === "order" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setType("order")}
          >
            주문
          </Button>
          <Button
            type="button"
            variant={type === "return" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setType("return")}
          >
            반품
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="item_name">품목</Label>
        <ItemNameAutocomplete value={itemName} onChange={setItemName} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="quantity">수량</Label>
        <div className="flex gap-2">
          <Input
            id="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="수량"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="flex-1"
            required
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "처리 중..." : isEdit ? "수정" : "등록"}
      </Button>
    </form>
  );
}
