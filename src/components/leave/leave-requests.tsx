"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TEAMS, TEAM_LABEL, type Team } from "@/lib/utils/team";
import {
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  type LeaveRequestView,
  type RequestStatus,
} from "@/lib/types/leave";
import {
  fetchLeaveRequests,
  cancelLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
} from "@/lib/actions/leave-actions";
import { LeaveRequestForm } from "@/components/leave/leave-request-form";

const STATUS_STYLE: Record<RequestStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

const TYPE_STYLE: Record<string, string> = {
  add: "bg-blue-100 text-blue-700",
  modify: "bg-violet-100 text-violet-700",
  delete: "bg-rose-100 text-rose-700",
};

function fmtMD(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

function describe(r: LeaveRequestView): string {
  const tag = r.day_portion && r.day_portion !== "full" ? `(${r.day_portion === "am" ? "오전반차" : "오후반차"})` : "";
  const desired = r.leave_date ? `${fmtMD(r.leave_date)} ${r.type_name ?? ""}${tag}` : "";
  if (r.request_type === "add") return desired;
  if (r.request_type === "delete") return r.target_label ?? "";
  return `${r.target_label ?? ""} → ${desired}`;
}

export function LeaveRequests({ onChanged }: { onChanged?: () => void }) {
  const { isAdmin, isManager } = useAuth();
  const [filter, setFilter] = useState<"pending" | "all">(isManager ? "pending" : "all");
  const [team, setTeam] = useState<Team>("vet");
  const [rows, setRows] = useState<LeaveRequestView[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchLeaveRequests(filter, isAdmin ? team : undefined);
    setRows(res.rows ?? []);
  }, [filter, team, isAdmin]);

  useEffect(() => {
    let active = true;
    fetchLeaveRequests(filter, isAdmin ? team : undefined).then((res) => {
      if (active) setRows(res.rows ?? []);
    });
    return () => {
      active = false;
    };
  }, [filter, team, isAdmin]);

  const afterChange = async () => {
    await load();
    onChanged?.();
  };

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {TEAMS.map((t) => (
            <button
              key={t}
              onClick={() => setTeam(t)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                team === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {TEAM_LABEL[t]}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        {isManager && (
          <div className="flex rounded-lg bg-muted p-0.5">
            {(["pending", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                  filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {f === "pending" ? "대기" : "전체"}
              </button>
            ))}
          </div>
        )}
        <Button size="sm" className="ml-auto h-8 rounded-full" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          수정요청
        </Button>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
          {isManager && filter === "pending" ? "대기 중인 요청이 없습니다." : "수정요청이 없습니다."}
        </div>
      ) : (
        rows.map((r) =>
          isManager ? (
            <AdminRequestCard key={r.id} r={r} onChanged={afterChange} />
          ) : (
            <StaffRequestCard key={r.id} r={r} onChanged={afterChange} />
          ),
        )
      )}

      <LeaveRequestForm
        key={formOpen ? "open" : "closed"}
        open={formOpen}
        onOpenChange={setFormOpen}
        onDone={afterChange}
      />
    </div>
  );
}

function RequestBody({ r }: { r: LeaveRequestView }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", TYPE_STYLE[r.request_type])}>
          {REQUEST_TYPE_LABEL[r.request_type]}
        </span>
        <span className="text-sm font-medium">{describe(r)}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{r.reason}</p>
      {r.admin_note && <p className="mt-0.5 text-xs text-rose-600">반려 사유: {r.admin_note}</p>}
    </>
  );
}

function StaffRequestCard({ r, onChanged }: { r: LeaveRequestView; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await cancelLeaveRequest(r.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      await onChanged();
    } catch (e) {
      setError(`취소 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-card p-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <RequestBody r={r} />
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[r.status])}>
          {REQUEST_STATUS_LABEL[r.status]}
        </span>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      {r.status === "pending" && (
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={cancel} disabled={busy}>
            요청 취소
          </Button>
        </div>
      )}
    </div>
  );
}

function AdminRequestCard({ r, onChanged }: { r: LeaveRequestView; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    setBusy(true);
    setError(null);
    const res = await approveLeaveRequest(r.id);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await onChanged();
  };

  const reject = async () => {
    setBusy(true);
    setError(null);
    const res = await rejectLeaveRequest(r.id, note);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await onChanged();
  };

  return (
    <div className="rounded-xl bg-card p-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {r.requester_name} · {TEAM_LABEL[r.team]}
          </p>
          <div className="mt-0.5">
            <RequestBody r={r} />
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[r.status])}>
          {REQUEST_STATUS_LABEL[r.status]}
        </span>
      </div>

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      {r.status === "pending" && (
        <div className="mt-2.5 space-y-2">
          {rejecting ? (
            <div className="space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="반려 사유 (선택)"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setRejecting(false)} disabled={busy}>
                  취소
                </Button>
                <Button size="sm" variant="destructive" className="flex-1" onClick={reject} disabled={busy}>
                  반려 확정
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setRejecting(true)} disabled={busy}>
                <X className="h-4 w-4" />
                반려
              </Button>
              <Button size="sm" className="flex-1" onClick={approve} disabled={busy}>
                <Check className="h-4 w-4" />
                승인
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
