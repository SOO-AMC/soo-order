"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemNameAutocomplete } from "./item-name-autocomplete";
import { LastOrderHint } from "./last-order-hint";
import { PhotoPicker, photoItemsFromPaths } from "./photo-picker";
import type { PhotoItem } from "./photo-picker";
import { itemNamesLooselyMatch } from "@/lib/utils/normalize-item-name";
import { needsChangeReason } from "@/lib/utils/order-notify";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types/order";

interface OrderFormData {
  item_name: string;
  quantity: number;
  unit: string;
  is_urgent: boolean;
  notes: string;
  vendor_name?: string;
  inspection_notes?: string;
}

export interface OrderFormResult extends Omit<OrderFormData, "vendor_name" | "inspection_notes"> {
  vendor_name: string;
  inspection_notes: string;
  photos: PhotoItem[];
  /** 수량·품목을 바꾼 이유 (changeReasonFor 가 있을 때만 채워진다) */
  change_reason: string;
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
  showInspectionField?: boolean;
  /** 제공되면 입력 중인 품목명과 겹치는 진행 중 주문을 경고로 표시 */
  activeOrders?: ActiveOrderRef[];
  /**
   * 다른 사람의 주문을 고치는 경우 원래 값. 수량·단위·품목이 달라지면 "바꾼 이유"를 꼭 받는다.
   * 이유는 주문자에게 알림과 주문 화면으로 보인다.
   */
  changeReasonFor?: { item_name: string; quantity: number; unit: string };
  /** 새 주문의 품목 이름을 미리 채운다 (품절 알림에서 "다시 주문"으로 넘어온 경우) */
  initialItemName?: string;
  onSubmit: (data: OrderFormResult) => Promise<void>;
}

/** 관리자가 수량·품목을 바꿀 때 자주 쓰는 이유 (칩) */
const CHANGE_REASONS = ["원내 재고가 남아 있어요", "포장 단위에 맞췄어요", "업체 재고가 부족해요", "같은 약의 다른 제품으로 바꿨어요"];

/** 자주 쓰는 단위 (칩). 그 밖은 "직접 입력" */
const COMMON_UNITS = ["개", "박스", "병", "바이알", "통", "봉지"];

/** 질문 한 덩어리: 문장형 제목 + 내용 (토스식, 디자인 시스템 QuestionScreen) */
function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 bg-card px-5 py-5 lg:rounded-xl lg:ring-1 lg:ring-border">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function OrderForm({ defaultValues, existingPhotoUrls, showVendorField, showInspectionField, activeOrders, changeReasonFor, initialItemName, onSubmit }: OrderFormProps) {
  const [itemName, setItemName] = useState(defaultValues?.item_name ?? initialItemName ?? "");
  const [quantity, setQuantity] = useState(defaultValues?.quantity ? defaultValues.quantity.toString() : "");
  // 단위는 고르지 않으면 비워 둔다(예전과 같음)
  const [unit, setUnit] = useState(defaultValues?.unit ?? "");
  const [customUnit, setCustomUnit] = useState(() => !!defaultValues?.unit && !COMMON_UNITS.includes(defaultValues.unit));
  const [isUrgent, setIsUrgent] = useState(defaultValues?.is_urgent ?? false);
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [vendorName, setVendorName] = useState(defaultValues?.vendor_name ?? "");
  const [inspectionNotes, setInspectionNotes] = useState(defaultValues?.inspection_notes ?? "");
  const [changeReason, setChangeReason] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>(existingPhotoUrls ? photoItemsFromPaths(existingPhotoUrls) : []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!defaultValues;
  const qtyNum = parseInt(quantity, 10) || 0;
  /** 남의 주문의 수량·단위·품목을 바꿨는가 → 이유가 필요하다 */
  const reasonNeeded = !!changeReasonFor && needsChangeReason(changeReasonFor, { item_name: itemName, quantity: qtyNum, unit });

  const duplicateMatches = useMemo(() => {
    const name = itemName.trim();
    if (!activeOrders || name.length < 2) return [];
    return activeOrders.filter((o) => itemNamesLooselyMatch(o.item_name, name));
  }, [activeOrders, itemName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const hasPhotos = photos.length > 0;
    if (!itemName.trim()) {
      setError("품목을 입력해 주세요.");
      return;
    }
    if (!hasPhotos && qtyNum < 1) {
      setError("수량을 정하거나 사진을 올려 주세요.");
      return;
    }
    if (reasonNeeded && !changeReason.trim()) {
      setError("수량이나 품목을 바꾼 이유를 적어 주세요. 주문자에게 보여요.");
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({
        item_name: itemName.trim(),
        quantity: qtyNum,
        unit: unit.trim(),
        is_urgent: isUrgent,
        notes: notes.trim(),
        vendor_name: vendorName.trim(),
        inspection_notes: inspectionNotes.trim(),
        photos,
        change_reason: reasonNeeded ? changeReason.trim() : "",
      });
    } catch {
      setError("저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 pb-28 lg:gap-3 lg:pb-0">
      <Question title="무엇이 필요하세요?" hint="품목 이름 일부만 써도 지난 주문에서 찾아요">
        <ItemNameAutocomplete value={itemName} onChange={setItemName} />
        {/* 새 주문일 때만: 지난번 주문 + 최저가 (수정 화면에선 자기 자신이 "지난번"이 되므로 뺌) */}
        {!isEdit && (
          <LastOrderHint
            itemName={itemName}
            onFill={(q, u) => {
              setQuantity(String(q));
              setUnit(u);
              setCustomUnit(!!u && !COMMON_UNITS.includes(u));
            }}
          />
        )}
        {duplicateMatches.length > 0 && (
          <div className="rounded-xl bg-status-ask-bg px-3.5 py-3 text-[13px]">
            <p className="flex items-center gap-1.5 font-semibold text-status-ask">
              <AlertTriangle className="size-4" /> 이미 진행 중인 주문이 있어요
            </p>
            <ul className="mt-1.5 space-y-0.5 text-foreground">
              {duplicateMatches.slice(0, 5).map((o) => (
                <li key={o.id}>
                  {o.item_name}
                  {o.quantity > 0 ? ` ${o.quantity}${o.unit ? ` ${o.unit}` : ""}` : ""} · {o.requester?.full_name ?? "?"} ·{" "}
                  {ORDER_STATUS_LABEL[o.status]}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-subtle-foreground">충분하면 다시 넣지 마세요. 더 필요하면 등록할 때 &quot;기존 주문에 합치기&quot;를 고르면 돼요.</p>
          </div>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={isUrgent}
          onClick={() => setIsUrgent((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-1 text-left"
        >
          <span>
            <b className={cn("block text-base font-semibold", isUrgent && "text-status-late")}>급해요</b>
            <span className="text-[13px] text-muted-foreground">관리자 목록 맨 위에 빨간 표시로 보여요</span>
          </span>
          <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", isUrgent ? "bg-destructive" : "bg-input")}>
            <span
              className={cn(
                "absolute top-[3px] size-[22px] rounded-full bg-card shadow-sm transition-[left]",
                isUrgent ? "left-[23px]" : "left-[3px]"
              )}
            />
          </span>
        </button>
      </Question>

      <Question title="얼마나 필요하세요?" hint="수량을 모르면 사진만 올려도 돼요">
        <div className="flex items-center justify-between rounded-2xl bg-muted p-1.5">
          <button
            type="button"
            aria-label="하나 빼기"
            onClick={() => setQuantity(String(Math.max(0, qtyNum - 1)))}
            className="size-[52px] rounded-[14px] bg-card text-2xl font-bold shadow-[0_0_0_1px_var(--border)] active:scale-95"
          >
            −
          </button>
          <input
            id="quantity"
            inputMode="numeric"
            aria-label="수량"
            value={quantity}
            placeholder="0"
            onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
            className="w-24 bg-transparent text-center text-3xl font-bold tabular-nums outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            aria-label="하나 더하기"
            onClick={() => setQuantity(String(qtyNum + 1))}
            className="size-[52px] rounded-[14px] bg-card text-2xl font-bold shadow-[0_0_0_1px_var(--border)] active:scale-95"
          >
            +
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="단위">
          {COMMON_UNITS.map((u) => {
            const on = !customUnit && unit === u;
            return (
              <button
                key={u}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setCustomUnit(false);
                  setUnit(u);
                }}
                className={cn(
                  "h-[38px] rounded-full px-4 text-[15px] font-semibold transition-colors",
                  on ? "bg-foreground text-background" : "bg-muted text-subtle-foreground ring-1 ring-border hover:text-foreground"
                )}
              >
                {u}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={customUnit}
            onClick={() => {
              setCustomUnit(true);
              if (COMMON_UNITS.includes(unit)) setUnit("");
            }}
            className={cn(
              "h-[38px] rounded-full px-4 text-[15px] transition-colors",
              customUnit ? "bg-foreground font-semibold text-background" : "border border-dashed border-input text-muted-foreground"
            )}
          >
            직접 입력
          </button>
        </div>
        {customUnit && (
          <Input
            id="unit"
            autoFocus
            placeholder="단위 (예: 앰플, 매, 롤)"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="h-11 text-base"
          />
        )}
      </Question>

      <Question title="사진이 있으면 올려 주세요" hint="라벨이나 포장 사진이면 충분해요">
        <PhotoPicker photos={photos} onChange={setPhotos} />
      </Question>

      <Question title="더 알려줄 것이 있나요?" hint="선택">
        <Input
          id="notes"
          placeholder="예: 소포장으로, 링크 참고"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-11 text-base"
        />
        {showVendorField && (
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-subtle-foreground">업체</span>
            <Input id="vendor_name" placeholder="업체명" value={vendorName} onChange={(e) => setVendorName(e.target.value)} className="h-11 text-base" />
          </label>
        )}
        {showInspectionField && (
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-subtle-foreground">검수 비고</span>
            <Input
              id="inspection_notes"
              placeholder="검수 비고 (선택)"
              value={inspectionNotes}
              onChange={(e) => setInspectionNotes(e.target.value)}
              className="h-11 text-base"
            />
          </label>
        )}
      </Question>

      {reasonNeeded && (
        <Question title="왜 바꾸나요?" hint="주문자에게 알림과 주문 화면으로 보여요">
          <div className="flex flex-wrap gap-1.5">
            {CHANGE_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setChangeReason(r)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13px] font-semibold",
                  changeReason === r ? "bg-primary text-primary-foreground" : "bg-muted text-subtle-foreground"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <Input
            id="change_reason"
            aria-label="바꾼 이유"
            placeholder="예: 원내 재고가 남아 있어요"
            value={changeReason}
            onChange={(e) => setChangeReason(e.target.value)}
            className="h-11 text-base"
          />
        </Question>
      )}

      {/* 모바일: 아래 고정 큰 버튼 / PC: 폼 끝 */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
        {error && (
          <p role="alert" className="mb-2 text-sm font-medium text-status-late">
            {error}
          </p>
        )}
        <Button type="submit" className="h-[52px] w-full rounded-[14px] text-base font-bold lg:h-11" disabled={isLoading}>
          {isLoading
            ? "저장하는 중…"
            : isEdit
              ? "수정"
              : itemName.trim()
                ? `${itemName.trim()}${qtyNum > 0 ? ` ${qtyNum}${unit}` : ""} 주문하기`
                : "주문하기"}
        </Button>
      </div>
    </form>
  );
}
