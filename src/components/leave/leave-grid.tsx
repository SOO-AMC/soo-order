"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, History, Save, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TEAMS, TEAM_LABEL, type Team } from "@/lib/utils/team";
import {
  SNAPSHOT_KIND_LABEL,
  type LeaveGridCell,
  type LeaveGridColumn,
  type LeaveSnapshotMeta,
} from "@/lib/types/leave";
import {
  fetchLeaveGrid,
  fetchLeaveSnapshots,
  fetchLeaveSnapshot,
  saveLeaveSnapshot,
  createLeaveGrant,
  confirmLeavePeriod,
} from "@/lib/actions/leave-actions";

/** '2026-03-03' → '26.03.03' (엑셀 표기 그대로) */
function fmt(d: string): string {
  return d.slice(2).replace(/-/g, ".");
}

function Cell({ cell, special }: { cell: LeaveGridCell | null; special: boolean }) {
  const bg = special ? "bg-leave-special" : "bg-leave-cell";
  // 빈 칸 = 부여됐지만 아직 안 쓴 연차
  if (!cell) {
    return <div className={cn("h-7 border-b border-r border-white/70", bg)} />;
  }
  if (!cell.half) {
    return (
      <div
        className={cn(
          "flex h-7 items-center justify-center gap-0.5 border-b border-r border-white/70 text-[11px] tabular-nums",
          bg,
        )}
        title={cell.borrowed ? "선사용 — 다른 주기 날짜를 이 주기에서 차감" : undefined}
      >
        {fmt(cell.top)}
        {cell.borrowed && <span className="text-[9px] font-bold text-rose-700">↩</span>}
      </div>
    );
  }
  // 반차 — 엑셀의 대각선 분할 재현
  return (
    <div className={cn("relative h-7 border-b border-r border-white/70", bg)}>
      <div
        aria-hidden
        className="absolute inset-0 text-foreground/30"
        style={{
          background:
            "linear-gradient(to top right, transparent calc(50% - 0.5px), currentColor calc(50% - 0.5px), currentColor calc(50% + 0.5px), transparent calc(50% + 0.5px))",
        }}
      />
      <span className="absolute left-0.5 top-0 text-[8px] leading-[11px] tabular-nums">
        {fmt(cell.top)}
      </span>
      {cell.bottom && (
        <span className="absolute bottom-0 right-0.5 text-[8px] leading-[11px] tabular-nums">
          {fmt(cell.bottom)}
        </span>
      )}
    </div>
  );
}

function Column({
  col,
  rows,
  readOnly,
  onPick,
}: {
  col: LeaveGridColumn;
  rows: number;
  readOnly: boolean;
  onPick: (c: LeaveGridColumn) => void;
}) {
  return (
    <div className="w-[74px] shrink-0">
      <button
        onClick={() => !readOnly && onPick(col)}
        disabled={readOnly}
        className={cn(
          "flex h-8 w-full items-center justify-center gap-0.5 border-b border-r border-white/70 bg-leave-head text-xs font-bold",
          !readOnly && "hover:bg-leave-head/70",
        )}
        // 과거 버전(읽기 전용)에서도 부여 사유는 확인 가능하게 title 로 노출
        title={
          [
            col.grants.length > 0
              ? `특별연차\n${col.grants.map((g) => `${g.granted_date} ${g.days > 0 ? "+" : ""}${g.days}일 — ${g.reason}`).join("\n")}`
              : "",
            readOnly ? "" : "클릭하면 특별연차 부여",
          ]
            .filter(Boolean)
            .join("\n\n") || undefined
        }
      >
        <span className="truncate">{col.full_name}</span>
        {!col.confirmed && <span className="text-[9px] text-amber-600">●</span>}
      </button>
      {Array.from({ length: rows }, (_, i) =>
        i < col.total ? (
          // baseDays 이후 칸 = 특별연차분
          <Cell key={i} cell={col.cells[i] ?? null} special={i >= col.baseDays} />
        ) : (
          // 부여량 밖 = 빈 여백 (엑셀의 흰 칸)
          <div key={i} className="h-7 border-b border-r border-white/70 bg-card" />
        ),
      )}
      <div className="flex h-7 items-center justify-center border-r border-white/70 bg-muted/60 text-[10px] font-semibold tabular-nums">
        {col.expire ? fmt(col.expire) : "-"}
      </div>
    </div>
  );
}

export function LeaveGrid() {
  const [team, setTeam] = useState<Team>("vet");
  const [cols, setCols] = useState<LeaveGridColumn[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 버전(스냅샷) — "" = 현재
  const [versions, setVersions] = useState<LeaveSnapshotMeta[]>([]);
  const [versionId, setVersionId] = useState("");
  const [viewingMeta, setViewingMeta] = useState<LeaveSnapshotMeta | null>(null);

  const [granting, setGranting] = useState<LeaveGridColumn | null>(null);

  const readOnly = versionId !== "";

  const loadCurrent = useCallback(async () => {
    const res = await fetchLeaveGrid(team);
    setError(res.error ?? null);
    setCols(res.columns ?? []);
    setViewingMeta(null);
  }, [team]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchLeaveGrid(team), fetchLeaveSnapshots(team)])
      .then(([grid, snaps]) => {
        if (!active) return;
        setError(grid.error ?? null);
        setCols(grid.columns ?? []);
        setVersions(snaps.rows ?? []);
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
        setCols([]);
      });
    return () => {
      active = false;
    };
  }, [team]);

  const pickVersion = async (id: string) => {
    setVersionId(id);
    setCols(null);
    if (!id) {
      await loadCurrent();
      return;
    }
    const res = await fetchLeaveSnapshot(id);
    if (res.error || !res.snapshot) {
      setError(res.error ?? "불러오기 실패");
      setCols([]);
      return;
    }
    setError(null);
    setCols(res.snapshot.columns);
    setViewingMeta(res.snapshot);
  };

  const snapshotNow = async () => {
    setBusy(true);
    try {
      const res = await saveLeaveSnapshot(team);
      if (res.error) {
        setError(res.error);
        return;
      }
      const snaps = await fetchLeaveSnapshots(team);
      setVersions(snaps.rows ?? []);
    } finally {
      setBusy(false);
    }
  };

  const rows = Math.max(1, ...(cols ?? []).map((c) => Math.max(c.total, c.cells.length)));
  const unconfirmed = (cols ?? []).filter((c) => !c.confirmed && !readOnly);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {TEAMS.map((t) => (
          <button
            key={t}
            onClick={() => {
              setError(null);
              setCols(null);
              setVersionId("");
              setTeam(t);
            }}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              team === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {TEAM_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <History className="h-4 w-4 text-muted-foreground" />
          <Select value={versionId || "current"} onValueChange={(v) => pickVersion(v === "current" ? "" : v)}>
            <SelectTrigger className="h-8 w-[210px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">현재</SelectItem>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.snapshot_date} · {SNAPSHOT_KIND_LABEL[v.kind]}
                  {v.user_name ? ` · ${v.user_name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={snapshotNow} disabled={busy}>
          <Save className="h-4 w-4" />
          현재 상태 저장
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        칸 1개 = 연차 1일 · 날짜 없는 칸 = 미사용 잔여 · 대각선 칸 = 반차 2건 · 맨 아래 = 만료일
        {!readOnly && " · 이름을 누르면 특별연차 부여"}
      </p>

      {viewingMeta && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
          {viewingMeta.snapshot_date} 시점 저장본입니다 (읽기 전용). 이후 소급 수정이 있으면 현재 값과 다를 수 있습니다.
        </p>
      )}

      {unconfirmed.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
          만료 후 자동 생성된 미확정 주기가 있습니다 — {unconfirmed.map((c) => c.full_name).join(", ")}.
          이름을 눌러 실제 일수를 확인·확정해주세요.
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {cols === null ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : cols.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
          해당 팀에 직원이 없습니다.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl bg-card shadow-card">
            <div className="flex min-w-max border-l border-t border-white/70">
              {/* 좌측 고정 라벨 열 */}
              <div className="w-11 shrink-0">
                <div className="h-8 border-b border-r border-white/70 bg-leave-head" />
                {Array.from({ length: rows }, (_, i) => (
                  <div
                    key={i}
                    className="flex h-7 items-center justify-center border-b border-r border-white/70 bg-muted/40 text-[10px] text-muted-foreground tabular-nums"
                  >
                    {i + 1}
                  </div>
                ))}
                <div className="flex h-7 items-center justify-center border-r border-white/70 bg-muted/60 text-[10px] font-semibold">
                  만료일
                </div>
              </div>
              {cols.map((c) => (
                <Column key={c.userId} col={c} rows={rows} readOnly={readOnly} onPick={setGranting} />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-leave-cell" /> 기본 연차
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-leave-special" /> 특별 연차
            </span>
            <span className="flex items-center gap-1">
              <span className="font-bold text-rose-700">↩</span> 선사용 (다른 주기 날짜)
            </span>
          </div>

          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-2">
              {cols.map((c) => (
                <div
                  key={c.userId}
                  className="w-[74px] shrink-0 rounded-lg bg-card px-1 py-1.5 text-center shadow-card"
                >
                  <p className="truncate text-[11px] font-semibold">{c.full_name}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {c.used}/{c.total}
                    {c.grantDays !== 0 && (
                      <span className="text-violet-600"> (+{c.grantDays})</span>
                    )}
                  </p>
                  <p className="text-[11px] font-bold text-blue-600 tabular-nums">
                    잔여 {c.remaining}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <GrantSheet
        key={granting?.userId ?? "none"}
        col={granting}
        onClose={() => setGranting(null)}
        onSaved={async () => {
          setGranting(null);
          setCols(null);
          await loadCurrent();
        }}
      />
    </div>
  );
}

function GrantSheet({
  col,
  onClose,
  onSaved,
}: {
  col: LeaveGridColumn | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [days, setDays] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseDays, setBaseDays] = useState(() => String(col?.baseDays ?? 0));

  const grant = async () => {
    if (!col) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createLeaveGrant({
        targetUserId: col.userId,
        days: Number(days),
        reason,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmPeriod = async () => {
    if (!col?.balanceId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await confirmLeavePeriod(col.balanceId, Number(baseDays));
      if (res.error) {
        setError(res.error);
        return;
      }
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!col} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="px-4 pb-0">
          <SheetTitle>{col?.full_name} 특별연차</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {col && (
            <p className="text-xs text-muted-foreground">
              기본 {col.baseDays}일 + 특별 {col.grantDays}일 = 총 {col.total}일 · 사용 {col.used}일 · 잔여{" "}
              {col.remaining}일
              {col.expire && ` · 만료 ${col.expire}`}
            </p>
          )}

          {col && !col.confirmed && (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-800">
                만료 후 자동 생성된 미확정 주기입니다. 직전 주기 일수를 그대로 복사했으니 실제 부여
                일수를 확인해주세요.
              </p>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">기본 연차 일수</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={baseDays}
                    onChange={(e) => setBaseDays(e.target.value)}
                    className="h-8"
                  />
                </div>
                <Button size="sm" onClick={confirmPeriod} disabled={busy} className="h-8">
                  확정
                </Button>
              </div>
            </div>
          )}

          {/* 부여 내역 */}
          {col && col.grants.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">부여 내역</p>
              {col.grants.map((g) => (
                <div key={g.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="font-semibold tabular-nums text-violet-600">
                    {g.days > 0 ? "+" : ""}
                    {g.days}일
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{g.reason}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {g.granted_date.slice(2)}
                  </span>
                  {g.days > 0 && (
                    <button
                      // 삭제 대신 음수 부여로 되돌림 → 취소 사실도 내역에 남음
                      onClick={() => {
                        setDays(String(-g.days));
                        setReason(`${g.reason} 취소`);
                      }}
                      disabled={busy}
                      className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-destructive"
                      title="아래 부여 폼에 취소분(음수)을 채웁니다"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      취소
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 새 부여 */}
          <div className="space-y-2 rounded-xl border p-3">
            <p className="text-sm font-medium">특별연차 부여</p>
            <p className="text-[11px] text-muted-foreground">
              부여 내역은 지울 수 없습니다. 잘못 준 건 음수로 부여해 되돌리세요 — 취소한 사실도 기록으로
              남습니다.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">일수 (0.5 단위, 음수는 부여 취소)</Label>
              <Input type="number" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">사유 (필수)</Label>
              <Input
                placeholder="예: 6/14 휴무일 대체근무"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button onClick={grant} disabled={busy || !reason.trim()} className="w-full">
              <Gift className="h-4 w-4" />
              부여
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
