"use client";

import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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
  defaultCycleRange,
  SUBMIT_MODE_LABEL,
  type LeaveType,
  type SubmitMode,
} from "@/lib/types/leave";
import {
  fetchLeaveTypesAll,
  createLeaveType,
  updateLeaveType,
  fetchLeaveCycle,
  upsertLeaveCycle,
  resetLeaveCycle,
  fetchLeaveLocks,
  setLeaveLock,
} from "@/lib/actions/leave-actions";

const SUBMIT_MODES: SubmitMode[] = ["auto", "open", "locked"];

function curYearMonth(): string {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function LeaveSettings({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** 주기·잠금 등 저장 성공 시 (부모가 달력 갱신) */
  onChanged?: () => void;
}) {
  const { isAdmin, isTeamManager, team } = useAuth();
  const restrictTeam = isTeamManager && !isAdmin ? team : null;
  const notify = onChanged ?? (() => {});

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="px-4 pb-0">
          <SheetTitle>연차 설정</SheetTitle>
        </SheetHeader>
        {open && (
          <div className="space-y-6 px-4 pb-8">
            <LockSection restrictTeam={restrictTeam} onChanged={notify} />
            {isAdmin && (
              <>
                <Separator />
                <TypesSection />
              </>
            )}
            <Separator />
            <CycleSection restrictTeam={restrictTeam} onChanged={notify} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function LockSection({
  restrictTeam,
  onChanged,
}: {
  restrictTeam: Team | null;
  onChanged: () => void;
}) {
  const [modes, setModes] = useState<Record<string, SubmitMode> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaveLocks()
      .then((r) => setModes(r.modes ?? {}))
      .catch(() => setModes({}));
  }, []);

  const set = async (team: Team, mode: SubmitMode) => {
    setBusy(team);
    try {
      const res = await setLeaveLock(team, mode);
      if (res.error) {
        alert(res.error);
        return;
      }
      setModes((prev) => ({ ...(prev ?? {}), [team]: mode }));
      onChanged();
    } catch (e) {
      alert(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">신청 잠금/해제 (팀별)</h3>
      <p className="text-[11px] text-muted-foreground">
        자동=신청기간 날짜 규칙 따름 · 상시 열림=언제나 신청 가능 · 잠금=신청 차단
      </p>
      {modes === null ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-2">
          {(restrictTeam ? [restrictTeam] : TEAMS).map((t) => {
            const cur = modes[t] ?? "auto";
            return (
              <div key={t} className="flex items-center gap-2">
                <span className="flex-1 text-sm font-medium">{TEAM_LABEL[t]}</span>
                <div className="flex rounded-lg bg-muted p-0.5">
                  {SUBMIT_MODES.map((m) => (
                    <button
                      key={m}
                      onClick={() => set(t, m)}
                      disabled={busy === t}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
                        cur === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                      )}
                    >
                      {SUBMIT_MODE_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TypesSection() {
  const [types, setTypes] = useState<LeaveType[] | null>(null);
  const [newName, setNewName] = useState("");
  const [newDeducts, setNewDeducts] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetchLeaveTypesAll();
    setTypes(res.types ?? []);
  };

  useEffect(() => {
    fetchLeaveTypesAll().then((res) => setTypes(res.types ?? []));
  }, []);

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const res = await createLeaveType({ name: newName, deductsBalance: newDeducts });
    setBusy(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    setNewName("");
    setNewDeducts(false);
    await load();
  };

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">휴가 유형</h3>
      {types === null ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-2">
          {types.map((t) => (
            <TypeRow key={t.id} type={t} onSaved={load} />
          ))}
        </div>
      )}

      <div className="space-y-2 rounded-xl border p-3">
        <p className="text-sm font-medium">새 유형 추가</p>
        <Input placeholder="유형명 (예: 공가)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={newDeducts} onCheckedChange={(v) => setNewDeducts(v === true)} />
          잔여 연차에서 차감
        </label>
        <Button onClick={add} disabled={busy || !newName.trim()} className="w-full" variant="outline">
          <Plus className="h-4 w-4" />
          추가
        </Button>
      </div>
    </section>
  );
}

function TypeRow({ type, onSaved }: { type: LeaveType; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(type.name);
  const [deducts, setDeducts] = useState(type.deducts_balance);
  const [active, setActive] = useState(type.is_active);
  const [busy, setBusy] = useState(false);

  const dirty = name !== type.name || deducts !== type.deducts_balance || active !== type.is_active;

  const save = async () => {
    setBusy(true);
    const res = await updateLeaveType({ id: type.id, name, deductsBalance: deducts, isActive: active });
    setBusy(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    await onSaved();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-28" />
      <label className="flex items-center gap-1.5 text-xs">
        <Checkbox checked={deducts} onCheckedChange={(v) => setDeducts(v === true)} />
        차감
      </label>
      <label className="flex items-center gap-1.5 text-xs">
        <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
        활성
      </label>
      <Button size="sm" variant="ghost" onClick={save} disabled={busy || !dirty} className="ml-auto h-8">
        저장
      </Button>
    </div>
  );
}

function CycleSection({
  restrictTeam,
  onChanged,
}: {
  restrictTeam: Team | null;
  onChanged: () => void;
}) {
  const [ym, setYm] = useState(curYearMonth);
  const [team, setTeam] = useState<Team>(restrictTeam ?? "vet");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [submitStart, setSubmitStart] = useState("");
  const [submitEnd, setSubmitEnd] = useState("");
  const [isOverride, setIsOverride] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // 월/팀 변경 시 적용 중인 값 프리필
  useEffect(() => {
    let active = true;
    fetchLeaveCycle(ym, team)
      .then((res) => {
        if (!active) return;
        if (res.cycle) {
          setLeaveStart(res.cycle.leave_start);
          setLeaveEnd(res.cycle.leave_end);
          setSubmitStart(res.cycle.submit_start);
          setSubmitEnd(res.cycle.submit_end);
          setIsOverride(res.cycle.is_override);
        } else if (res.error) {
          alert(res.error);
        }
        setLoading(false); // 실패해도 스피너에 갇히지 않게
      })
      .catch((e) => {
        if (!active) return;
        alert(`불러오기 실패: ${e instanceof Error ? e.message : String(e)}`);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ym, team]);

  const save = async () => {
    setBusy(true);
    setSaved(null);
    try {
      const res = await upsertLeaveCycle({
        yearMonth: ym,
        team,
        leaveStart,
        leaveEnd,
        submitStart,
        submitEnd,
      });
      if (res.error) {
        alert(res.error);
        return;
      }
      setIsOverride(true);
      setSaved(`${ym} ${TEAM_LABEL[team]} 신청 주기를 저장했습니다.`);
      onChanged();
    } catch (e) {
      alert(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setSaved(null);
    try {
      const res = await resetLeaveCycle(ym, team);
      if (res.error) {
        alert(res.error);
        return;
      }
      const def = defaultCycleRange(ym);
      setLeaveStart(def.leave_start);
      setLeaveEnd(def.leave_end);
      setSubmitStart(def.submit_start);
      setSubmitEnd(def.submit_end);
      setIsOverride(false);
      setSaved(`${ym} ${TEAM_LABEL[team]} 신청 주기를 기본값으로 되돌렸습니다.`);
      onChanged();
    } catch (e) {
      alert(`초기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">신청 주기 설정 (팀별)</h3>
      <p className="text-[11px] text-muted-foreground">
        기본값: 연차기간=해당 월 전체, 신청기간=전달 1~10일. 팀·월별로 조정할 수 있습니다.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label>팀</Label>
          {restrictTeam ? (
            <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
              {TEAM_LABEL[restrictTeam]}
            </div>
          ) : (
            <Select
              value={team}
              onValueChange={(v) => {
                setSaved(null);
                setTeam(v as Team);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAMS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TEAM_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>대상 월</Label>
          <Input
            type="month"
            value={ym}
            onChange={(e) => {
              setSaved(null);
              setYm(e.target.value);
            }}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {isOverride ? "이 팀·달은 사용자 지정값이 적용 중입니다." : "이 팀·달은 기본 규칙이 적용 중입니다."}
      </p>

      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>연차 시작일</Label>
              <Input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>연차 종료일</Label>
              <Input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>신청 시작일</Label>
              <Input type="date" value={submitStart} onChange={(e) => setSubmitStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>신청 종료일</Label>
              <Input type="date" value={submitEnd} onChange={(e) => setSubmitEnd(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy} className="flex-1">
              {busy ? "저장 중…" : "저장"}
            </Button>
            <Button onClick={reset} disabled={busy || !isOverride} variant="outline">
              기본값으로
            </Button>
          </div>
          {saved && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Check className="h-3.5 w-3.5" />
              {saved}
            </p>
          )}
        </>
      )}
    </section>
  );
}
