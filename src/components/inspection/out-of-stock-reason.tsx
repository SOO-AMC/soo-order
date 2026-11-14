"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** 자주 쓰는 품절 사유 (칩). 그 밖은 직접 적는다 */
export const OUT_OF_STOCK_REASONS = ["업체 재고 없음", "제조사 품절", "생산 중단", "수입 지연", "단종"];

/**
 * 품절 사유 입력 — 칩으로 고르거나 직접 적는다.
 * 사유는 주문자에게 알림으로 가고 품절 화면에 남는다. 한 건·여러 건 품절 처리 창이 같이 쓴다.
 */
export function OutOfStockReasonInput({ value, onChange, id = "out-of-stock-reason" }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-semibold">
        품절 사유 <span className="font-normal text-muted-foreground">· 주문자에게 알림으로 가요</span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {OUT_OF_STOCK_REASONS.map((r) => (
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
      <Input id={id} placeholder="예: 12월 초 재입고 예정" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
