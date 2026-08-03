"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { fetchLeaveLogs } from "@/lib/actions/leave-actions";
import type { LeaveLogView } from "@/lib/types/leave";

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LeaveLogs() {
  const [rows, setRows] = useState<LeaveLogView[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchLeaveLogs().then((r) => {
      if (active) setRows(r.rows);
    });
    return () => {
      active = false;
    };
  }, []);

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
        활동 기록이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-card">
      {rows.map((r) => (
        <div key={r.id} className="flex gap-3 border-b border-border/40 px-3 py-2.5 last:border-0">
          <span className="w-20 shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {fmtDateTime(r.created_at)}
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-sm">{r.description}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">· {r.user_name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
