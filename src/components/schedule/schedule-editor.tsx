"use client";

import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { positionToTeam, TEAMS, TEAM_LABEL, type Team } from "@/lib/utils/team";
import type { Position } from "@/lib/types/member";
import { SCHEDULE_STATUS_LABEL, type ScheduleStatus, type ScheduleMonthData } from "@/lib/types/schedule";
import { setScheduleEntry, copyDaySchedule } from "@/lib/actions/schedule-actions";

interface RowState {
  status: ScheduleStatus;
  shiftId: string | null;
  surgery: boolean;
  pathology: boolean;
}

const STATUSES: ScheduleStatus[] = ["work", "off", "extra", "off_change"];

function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ScheduleEditor({
  open,
  onOpenChange,
  date,
  data,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  date: string;
  data: ScheduleMonthData;
  onChanged: () => void;
}) {
  const entryByUser = useMemo(
    () => new Map(data.entries.filter((e) => e.work_date === date).map((e) => [e.user_id, e])),
    [data.entries, date],
  );
  // 종일 휴가자 (편집 잠금)
  const fullLeave = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of data.leaves) {
      if (l.leave_date === date && l.day_portion === "full") map.set(l.user_id, l.type_name);
    }
    return map;
  }, [data.leaves, date]);

  const [local, setLocal] = useState<Map<string, RowState>>(() => {
    const map = new Map<string, RowState>();
    for (const m of data.members) {
      const e = entryByUser.get(m.id);
      map.set(m.id, {
        status: e?.status ?? "off",
        shiftId: e?.shift_id ?? data.shifts[0]?.id ?? null,
        surgery: e?.surgery_assist ?? false,
        pathology: e?.pathology ?? false,
      });
    }
    return map;
  });
  const [busy, setBusy] = useState(false);

  const teamGroups = useMemo(() => {
    const groups: { team: Team | null; members: ScheduleMonthData["members"] }[] = [];
    for (const t of TEAMS) {
      const ms = data.members.filter((m) => positionToTeam(m.position as Position | null) === t);
      if (ms.length) groups.push({ team: t, members: ms });
    }
    const none = data.members.filter((m) => !positionToTeam(m.position as Position | null));
    if (none.length) groups.push({ team: null, members: none });
    return groups;
  }, [data.members]);

  const update = (uid: string, patch: Partial<RowState>) => {
    const cur = local.get(uid) ?? { status: "off", shiftId: data.shifts[0]?.id ?? null, surgery: false, pathology: false };
    const next = { ...cur, ...patch };
    setLocal(new Map(local).set(uid, next));
    setScheduleEntry({
      workDate: date,
      userId: uid,
      shiftId: next.shiftId,
      status: next.status,
      surgeryAssist: next.surgery,
      pathology: next.pathology,
    });
  };

  const copyFrom = async (deltaDays: number) => {
    setBusy(true);
    const res = await copyDaySchedule(shiftDate(date, deltaDays), date);
    setBusy(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    onChanged();
    onOpenChange(false);
  };

  const dObj = new Date(date + "T00:00:00");
  const works = (s: ScheduleStatus) => s === "work" || s === "extra";

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onChanged();
        onOpenChange(o);
      }}
    >
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="px-4 pb-0">
          <SheetTitle>
            근무 편집 — {dObj.getMonth() + 1}월 {dObj.getDate()}일
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-8">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => copyFrom(-1)}>
              <Copy className="h-4 w-4" />
              전날 복사
            </Button>
            <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => copyFrom(-7)}>
              <Copy className="h-4 w-4" />
              지난주 복사
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            복사는 이 날짜의 기존 배정을 덮어씁니다. 종일 연차자는 연차 탭에서 관리되어 잠겨 있습니다.
          </p>

          {teamGroups.map((g) => (
            <div key={g.team ?? "none"} className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">{g.team ? TEAM_LABEL[g.team] : "기타"}</p>
              {g.members.map((m) => {
                const leave = fullLeave.get(m.id);
                const r = local.get(m.id)!;
                if (leave) {
                  return (
                    <div key={m.id} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                      <span className="flex-1 text-sm font-medium">{m.full_name}</span>
                      <span className="text-xs text-muted-foreground">{leave} (잠금)</span>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border px-3 py-2">
                    <span className="w-14 shrink-0 text-sm font-medium">{m.full_name}</span>
                    <Select value={r.status} onValueChange={(v) => update(m.id, { status: v as ScheduleStatus })}>
                      <SelectTrigger className="h-8 w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {SCHEDULE_STATUS_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {works(r.status) && (
                      <>
                        <Select value={r.shiftId ?? ""} onValueChange={(v) => update(m.id, { shiftId: v })}>
                          <SelectTrigger className="h-8 w-28">
                            <SelectValue placeholder="시프트" />
                          </SelectTrigger>
                          <SelectContent>
                            {data.shifts.map((sh) => (
                              <SelectItem key={sh.id} value={sh.id}>
                                {sh.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => update(m.id, { surgery: !r.surgery })}
                          className={cn(
                            "rounded px-1.5 py-1 text-[11px] font-medium",
                            r.surgery ? "bg-yellow-200 text-yellow-900" : "bg-muted text-muted-foreground",
                          )}
                        >
                          술방
                        </button>
                        <button
                          onClick={() => update(m.id, { pathology: !r.pathology })}
                          className={cn(
                            "rounded px-1.5 py-1 text-[11px] font-medium",
                            r.pathology ? "bg-pink-200 text-pink-900" : "bg-muted text-muted-foreground",
                          )}
                        >
                          병리
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <Button className="w-full" onClick={() => onOpenChange(false)}>
            완료
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
