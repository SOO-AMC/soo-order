"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { savePlanSettings } from "@/lib/actions/briefing-planner-actions";
import { PER_DAY_RANGE, type PlanSettings } from "@/lib/briefing/types";

/**
 * 올리기 설정 (관리자): 올리기 화면에 처음 열어 두는 논문 칸 수.
 * 그날 몇 건이 나갈지는 그날 올린 논문 수가 정한다 — 이 값은 기본 칸 수일 뿐이고, 올릴 때 칸을 더하거나 뺄 수 있다.
 */
export function PlanSettingsForm({ initial }: { initial: PlanSettings }) {
  const [saved, setSaved] = useState(initial);
  const [perDay, setPerDay] = useState(initial.perDay);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const counts = Array.from({ length: PER_DAY_RANGE.max - PER_DAY_RANGE.min + 1 }, (_, i) => PER_DAY_RANGE.min + i);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await savePlanSettings({ perDay });
      if (!res.ok) return setMessage({ ok: false, text: res.error });
      setSaved(res.data);
      setMessage({ ok: true, text: `올리기 화면에 논문 칸 ${res.data.perDay}개가 먼저 열려요.` });
    } catch {
      setMessage({ ok: false, text: "저장하지 못했어요. 잠시 뒤 다시 눌러 주세요." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-subtle-foreground">기본 논문 칸 수</span>
          <select className="h-10 rounded-lg border border-input bg-background px-3 text-[15px] font-semibold tabular-nums" value={perDay} disabled={busy} onChange={(e) => setPerDay(Number(e.target.value))}>
            {counts.map((n) => (
              <option key={n} value={n}>
                {n}건
              </option>
            ))}
          </select>
        </label>
        <Button className="h-10 rounded-lg px-4" disabled={busy || perDay === saved.perDay} onClick={save}>
          {busy && <Loader2 className="size-4 animate-spin" />} 저장
        </Button>
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">
        올리기 화면에 논문 칸이 {perDay}개 먼저 열려요. 올릴 때 칸을 더하거나 뺄 수 있고, 그날 올린 논문 수만큼 발행돼요(하루 {PER_DAY_RANGE.max}건까지). 논문 1건 = 카드 1장이에요.
      </p>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "mt-2 text-[13px] font-medium text-status-done" : "mt-2 text-[13px] font-medium text-status-late"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
