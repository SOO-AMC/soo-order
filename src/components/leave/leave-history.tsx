"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  HISTORY_ACTION_LABEL,
  type HistoryAction,
  type LeaveHistoryView,
  type LeaveSnapshot,
} from "@/lib/types/leave";
import { fetchLeaveEntryHistory, restoreLeaveHistory } from "@/lib/actions/leave-actions";

const ACTION_STYLE: Record<HistoryAction, string> = {
  create: "bg-blue-100 text-blue-700",
  update: "bg-amber-100 text-amber-700",
  delete: "bg-rose-100 text-rose-700",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function snapText(s: LeaveSnapshot): string {
  const [, m, d] = s.leave_date.split("-");
  const tag = s.day_portion === "full" ? "" : ` ${s.day_portion === "am" ? "오전반차" : "오후반차"}`;
  return `${s.member_name} ${Number(m)}/${Number(d)} ${s.type_name}${tag}`;
}

export function LeaveHistory() {
  const [rows, setRows] = useState<LeaveHistoryView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetchLeaveEntryHistory();
    setRows(r.rows);
  }, []);

  useEffect(() => {
    let active = true;
    fetchLeaveEntryHistory().then((r) => {
      if (active) setRows(r.rows);
    });
    return () => {
      active = false;
    };
  }, []);

  const restore = async (h: LeaveHistoryView) => {
    const label = h.action === "delete" ? "되살리시겠습니까?" : "이 수정을 되돌리시겠습니까?";
    if (!window.confirm(label)) return;
    setBusy(h.id);
    setError(null);
    const res = await restoreLeaveHistory(h.id);
    setBusy(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    await load();
  };

  if (rows === null) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
        변경 이력이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {rows.map((h) => (
        <div key={h.id} className="rounded-xl bg-card p-3 shadow-card">
          <div className="flex items-start gap-2">
            <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold", ACTION_STYLE[h.action])}>
              {HISTORY_ACTION_LABEL[h.action]}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              {h.action === "update" && h.before && h.after ? (
                <span>
                  {snapText(h.before)} <span className="text-muted-foreground">→</span> {snapText(h.after)}
                </span>
              ) : (
                <span>{snapText(h.after ?? h.before ?? ({} as LeaveSnapshot)) || "—"}</span>
              )}
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {fmtDateTime(h.created_at)} · {h.actor_name}
              </p>
            </div>
            {h.canRestore && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0"
                onClick={() => restore(h)}
                disabled={busy === h.id}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {h.action === "delete" ? "되살리기" : "되돌리기"}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
