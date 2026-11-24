"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { deleteOrdersWithReason } from "@/lib/actions/order-delete-action";

/** 자주 쓰는 삭제 사유 (칩). 그 밖은 직접 적는다 */
export const DELETE_REASONS = ["중복 주문", "잘못 등록한 주문", "다른 품목으로 대체", "필요 없어짐", "재고 있음"];

/**
 * 삭제 사유 입력 — 칩으로 고르거나 직접 적는다. 주문자에게 알림으로 간다.
 * 한 건 삭제·여러 건 삭제 창이 같이 쓴다.
 */
export function DeleteReasonInput({ value, onChange, id = "delete-reason" }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-semibold">
        삭제 사유 <span className="font-normal text-muted-foreground">· 주문한 사람에게 주문 내용과 함께 알려요</span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {DELETE_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            aria-pressed={value === r}
            className={cn("rounded-full px-3 py-1.5 text-[13px] font-semibold", value === r ? "bg-primary text-primary-foreground" : "bg-muted text-subtle-foreground")}
          >
            {r}
          </button>
        ))}
      </div>
      <Input id={id} placeholder="예: 같은 주문이 두 번 들어왔어요" value={value} onChange={(e) => onChange(e.target.value)} maxLength={300} />
    </div>
  );
}

/**
 * 주문 삭제 버튼 + 확인 창.
 * 다른 사람의 주문이면 사유를 꼭 받는다(needsReason) — 주문자에게 사유와 주문 내용이 알림으로 간다.
 */
export function DeleteOrderButton({
  orderId,
  itemName,
  needsReason,
  redirectTo,
  label = "삭제",
  icon = "trash",
  className,
}: {
  orderId: string;
  itemName?: string;
  /** 다른 사람의 주문 (관리자가 지울 때) */
  needsReason: boolean;
  /** 지운 뒤 갈 곳 */
  redirectTo: string;
  label?: string;
  icon?: "trash" | "x";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const canSubmit = !busy && (!needsReason || reason.trim().length >= 2);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const res = await deleteOrdersWithReason([orderId], reason);
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      setOpen(false);
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("삭제하지 못했어요. 잠시 뒤 다시 해 주세요.");
      setBusy(false);
    }
  };

  const Icon = icon === "x" ? X : Trash2;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        if (!o) {
          setReason("");
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" className={cn("flex-1", className)}>
          <Icon className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>주문 삭제</DialogTitle>
          <DialogDescription>
            {itemName ? `"${itemName}" 주문을` : "이 주문을"} 삭제해요. 되돌릴 수 없어요.
            {needsReason && " 주문한 사람에게 사유와 주문 내용을 알려요."}
          </DialogDescription>
        </DialogHeader>
        {needsReason && <DeleteReasonInput value={reason} onChange={setReason} id={`delete-reason-${orderId}`} />}
        {error && <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">{error}</p>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            취소
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!canSubmit}>
            {busy ? "삭제 중..." : needsReason && reason.trim().length < 2 ? "사유를 적어 주세요" : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
