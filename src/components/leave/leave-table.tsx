"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
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
import { TEAM_LABEL, TEAMS, type Team } from "@/lib/utils/team";
import {
  DAY_PORTION_LABEL,
  type LeaveBalanceView,
  type LeaveDetail,
} from "@/lib/types/leave";
import {
  fetchLeaveBalances,
  fetchLeaveDetail,
  setLeaveBalance,
} from "@/lib/actions/leave-actions";

function fmtDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

function DetailList({ detail }: { detail: LeaveDetail }) {
  const grantDays = detail.grants.reduce((s, g) => s + g.days, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-around rounded-xl bg-muted/50 p-3 text-center">
        <div>
          <p className="text-[11px] text-muted-foreground">총</p>
          <p className="text-lg font-bold">{detail.total}</p>
          {grantDays !== 0 && (
            <p className="text-[10px] font-medium text-emerald-600 tabular-nums">
              특별 {grantDays > 0 ? "+" : ""}
              {grantDays}
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">사용</p>
          <p className="text-lg font-bold text-amber-600">{detail.used}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">잔여</p>
          <p className="text-lg font-bold text-blue-600">{detail.remaining}</p>
        </div>
      </div>
      {(detail.period_start || detail.period_end) && (
        <p className="text-center text-[11px] text-muted-foreground">
          기준기간 {detail.period_start ?? "…"} ~ {detail.period_end ?? "…"}
        </p>
      )}
      {/* 특별연차 부여 내역 — 왜 총 연차가 늘었는지 본인도 확인 가능하게 */}
      {detail.grants.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">특별연차</p>
          {detail.grants.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm"
            >
              <span className="shrink-0 font-semibold tabular-nums text-emerald-700">
                {g.days > 0 ? "+" : ""}
                {g.days}일
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{g.reason}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {fmtDate(g.granted_date)}
              </span>
            </div>
          ))}
        </div>
      )}

      {detail.entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">사용 내역이 없습니다.</p>
      ) : (
        <div className="space-y-1.5">
          {detail.entries.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="font-medium tabular-nums">{fmtDate(e.leave_date)}</span>
              <span className="text-muted-foreground">{e.type_name}</span>
              {e.day_portion !== "full" && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {DAY_PORTION_LABEL[e.day_portion]}
                </span>
              )}
              {!e.deducts && (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-600">미차감</span>
              )}
              {e.note && <span className="truncate text-xs text-muted-foreground">· {e.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LeaveTable() {
  const { isAdmin } = useAuth();
  const [myDetail, setMyDetail] = useState<LeaveDetail | null>(null);
  const [loadingMine, setLoadingMine] = useState(true);

  const [team, setTeam] = useState<Team>("vet");
  const [rows, setRows] = useState<LeaveBalanceView[] | null>(null);
  const [memberDetail, setMemberDetail] = useState<LeaveDetail | null>(null);
  const [editing, setEditing] = useState<LeaveBalanceView | null>(null);

  // 내 상세 (모두)
  useEffect(() => {
    fetchLeaveDetail().then((res) => {
      setMyDetail(res.detail ?? null);
      setLoadingMine(false);
    });
  }, []);

  // 관리자: 팀별 잔여 현황
  const loadBalances = useCallback(async () => {
    if (!isAdmin) return;
    const res = await fetchLeaveBalances(team);
    setRows(res.rows ?? []);
  }, [isAdmin, team]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    fetchLeaveBalances(team).then((res) => {
      if (active) setRows(res.rows ?? []);
    });
    return () => {
      active = false;
    };
  }, [isAdmin, team]);

  return (
    <div className="space-y-5">
      {/* 내 연차 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">내 연차</h2>
        {loadingMine ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : myDetail ? (
          <DetailList detail={myDetail} />
        ) : (
          <p className="text-sm text-muted-foreground">연차 정보가 없습니다.</p>
        )}
      </section>

      {/* 관리자: 팀별 잔여 현황 */}
      {isAdmin && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">팀별 잔여 현황</h2>
          <div className="flex gap-1.5">
            {TEAMS.map((t) => (
              <button
                key={t}
                onClick={() => setTeam(t)}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors",
                  team === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {TEAM_LABEL[t]}
              </button>
            ))}
          </div>

          {rows === null ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">팀원이 없습니다.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 bg-muted/50 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                <span>이름</span>
                <span className="w-9 text-right">총</span>
                <span className="w-9 text-right">사용</span>
                <span className="w-9 text-right">잔여</span>
                <span className="w-12 text-right">설정</span>
              </div>
              {rows.map((r) => (
                <div
                  key={r.userId}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 border-t px-3 py-2.5 text-sm"
                >
                  <button
                    onClick={async () => {
                      const res = await fetchLeaveDetail(r.userId);
                      if (res.detail) setMemberDetail(res.detail);
                    }}
                    className="flex items-center gap-1 text-left font-medium hover:text-primary"
                  >
                    {r.full_name}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <span className="w-9 text-right tabular-nums">{r.total}</span>
                  <span className="w-9 text-right tabular-nums text-amber-600">{r.used}</span>
                  <span className="w-9 text-right tabular-nums font-semibold text-blue-600">{r.remaining}</span>
                  <button
                    onClick={() => setEditing(r)}
                    className="flex w-12 justify-end text-muted-foreground hover:text-primary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 팀원 상세 시트 */}
      <Sheet open={!!memberDetail} onOpenChange={(o) => !o && setMemberDetail(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="px-4 pb-0">
            <SheetTitle>{memberDetail?.full_name} 연차 내역</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">{memberDetail && <DetailList detail={memberDetail} />}</div>
        </SheetContent>
      </Sheet>

      {/* 잔여 설정 시트 (관리자) */}
      <BalanceEditSheet
        key={editing?.userId ?? "none"}
        row={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await loadBalances();
          const mine = await fetchLeaveDetail();
          setMyDetail(mine.detail ?? null);
        }}
      />
    </div>
  );
}

function BalanceEditSheet({
  row,
  onClose,
  onSaved,
}: {
  row: LeaveBalanceView | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [total, setTotal] = useState(() => String(row?.total ?? 0));
  const [start, setStart] = useState(() => row?.period_start ?? "");
  const [end, setEnd] = useState(() => row?.period_end ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!row) return;
    setSaving(true);
    setError(null);
    const res = await setLeaveBalance({
      targetUserId: row.userId,
      totalDays: Number(total) || 0,
      periodStart: start || null,
      periodEnd: end || null,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await onSaved();
  };

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="px-4 pb-0">
          <SheetTitle>{row?.full_name} 연차 설정</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          <div className="space-y-1.5">
            <Label>총 연차 (일)</Label>
            <Input
              type="number"
              step="0.5"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>기준 시작일</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>기준 종료일</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            기준기간을 비우면 전체 기간의 차감 연차를 합산합니다.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button onClick={save} disabled={saving} className="w-full">
            저장
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
