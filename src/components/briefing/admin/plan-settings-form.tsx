"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { savePlanSettings } from "@/lib/actions/briefing-planner-actions";
import { PER_DAY_RANGE, type PlanSettings } from "@/lib/briefing/types";

/**
 * 하루 발행 건수 설정 (관리자).
 * 하루 건수를 바꾸면 발행 예정 날짜를 그 건수로 다시 채운다. 최소 건수를 낮추면 논문이 모자란 날도 있는 만큼 발행한다.
 */
export function PlanSettingsForm({ initial }: { initial: PlanSettings }) {
  const [saved, setSaved] = useState(initial);
  const [perDay, setPerDay] = useState(initial.perDay);
  const [min, setMin] = useState(initial.min);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = perDay !== saved.perDay || min !== saved.min;
  const counts = Array.from({ length: PER_DAY_RANGE.max - PER_DAY_RANGE.min + 1 }, (_, i) => PER_DAY_RANGE.min + i);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await savePlanSettings({ perDay, min });
      if (!res.ok) return setMessage({ ok: false, text: res.error });
      setSaved(res.data);
      setMessage({ ok: true, text: `하루 ${res.data.perDay}건으로 저장했어요. 발행 예정 날짜를 다시 채웠어요.` });
    } catch {
      setMessage({ ok: false, text: "저장하지 못했어요. 잠시 뒤 다시 눌러 주세요." });
    } finally {
      setBusy(false);
    }
  };

  const select = "h-10 rounded-lg border border-input bg-background px-3 text-[15px] font-semibold tabular-nums";
  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-subtle-foreground">하루 발행 건수</span>
          <select
            className={select}
            value={perDay}
            disabled={busy}
            onChange={(e) => {
              const v = Number(e.target.value);
              // 최소 건수가 하루 건수와 같았으면 같이 따라가고, 아니면 하루 건수를 넘지 않게만 한다
              setMin((m) => (m === perDay ? v : Math.min(m, v)));
              setPerDay(v);
            }}
          >
            {counts.map((n) => (
              <option key={n} value={n}>
                {n}건
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-subtle-foreground">이보다 적으면 그날은 발행 안 함</span>
          <select className={select} value={min} disabled={busy} onChange={(e) => setMin(Number(e.target.value))}>
            {counts
              .filter((n) => n <= perDay)
              .map((n) => (
                <option key={n} value={n}>
                  최소 {n}건
                </option>
              ))}
          </select>
        </label>
        <Button className="h-10 rounded-lg px-4" disabled={busy || !dirty} onClick={save}>
          {busy && <Loader2 className="size-4 animate-spin" />} 저장
        </Button>
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">
        검수한 논문을 하루 {perDay}건씩 날짜에 채워요. {min < perDay ? `논문이 모자란 날도 ${min}건 이상이면 발행해요.` : `${perDay}건이 다 차야 그날 발행해요.`} 논문 1건 = 카드 1장이에요.
      </p>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "mt-2 text-[13px] font-medium text-status-done" : "mt-2 text-[13px] font-medium text-status-late"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
