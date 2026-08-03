"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Lock, Pencil, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/utils/clipboard";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
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
import { TEAM_LABEL, type Team } from "@/lib/utils/team";
import {
  DAY_PORTION_LABEL,
  type DayPortion,
  type LeaveCalendarData,
  type LeavePeriodOption,
  type RequestType,
} from "@/lib/types/leave";
import {
  fetchLeaveCalendar,
  createLeaveEntry,
  updateLeaveEntry,
  deleteLeaveEntry,
  fetchLeavePeriodOptions,
} from "@/lib/actions/leave-actions";
import { LeaveRequestForm } from "@/components/leave/leave-request-form";

type RequestPrefill = { requestType: RequestType; targetEntryId?: string; leaveDate?: string };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const TYPE_PALETTE = [
  { dot: "bg-blue-500", pill: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" },
  { dot: "bg-rose-500", pill: "bg-rose-50 text-rose-700 ring-1 ring-rose-200" },
  { dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  { dot: "bg-violet-500", pill: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" },
  { dot: "bg-cyan-500", pill: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function addMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** 항상 다음 달(=종합 대상 월)을 기본으로 */
function defaultYearMonth(): string {
  const k = new Date(Date.now() + 9 * 3600 * 1000); // KST
  return addMonth(`${k.getUTCFullYear()}-${pad2(k.getUTCMonth() + 1)}`, 1);
}

function portionTag(p: DayPortion): string {
  return p === "full" ? "" : p === "am" ? "오전" : "오후";
}

/** 주기 범위(leave_start~leave_end)를 주 단위로 정렬한 달력 셀. 범위 밖은 inRange=false */
function buildGrid(leaveStart: string, leaveEnd: string): { date: string; inRange: boolean }[] {
  const start = new Date(leaveStart + "T00:00:00");
  const end = new Date(leaveEnd + "T00:00:00");
  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(end);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
  const out: { date: string; inRange: boolean }[] = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    const ds = toDateStr(cur);
    out.push({ date: ds, inRange: ds >= leaveStart && ds <= leaveEnd });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function LeaveCalendar() {
  const [ym, setYm] = useState(defaultYearMonth);
  // 전체검색에서 넘어온 ?team(관리자 초기 팀) / ?person(강조)
  const [team, setTeam] = useState<Team | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const t = new URLSearchParams(window.location.search).get("team");
    return (t as Team) || undefined;
  });
  const [highlightId] = useState(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("person"),
  );
  const [data, setData] = useState<LeaveCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [copied, setCopied] = useState(false);
  const [requestPrefill, setRequestPrefill] = useState<RequestPrefill | null>(null);

  const load = useCallback(async () => {
    const res = await fetchLeaveCalendar(ym, team);
    if (res.error) {
      setError(res.error);
      setData(null);
    } else if (res.data) {
      setError(null);
      setData(res.data);
      if (team === undefined || !res.data.isAdmin) setTeam(res.data.team);
    }
    setLoading(false);
  }, [ym, team]);

  useEffect(() => {
    let active = true;
    fetchLeaveCalendar(ym, team).then((res) => {
      if (!active) return;
      if (res.error) {
        setError(res.error);
        setData(null);
      } else if (res.data) {
        setError(null);
        setData(res.data);
        if (team === undefined || !res.data.isAdmin) setTeam(res.data.team);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [ym, team]);

  const typeColor = useMemo(() => {
    const map = new Map<string, (typeof TYPE_PALETTE)[number]>();
    (data?.leaveTypes ?? []).forEach((t, i) => map.set(t.id, TYPE_PALETTE[i % TYPE_PALETTE.length]));
    return map;
  }, [data?.leaveTypes]);

  const typeName = useMemo(() => {
    const map = new Map<string, string>();
    (data?.leaveTypes ?? []).forEach((t) => map.set(t.id, t.name));
    return map;
  }, [data?.leaveTypes]);

  const memberName = useMemo(() => {
    const map = new Map<string, string>();
    (data?.members ?? []).forEach((mb) => map.set(mb.id, mb.full_name));
    return map;
  }, [data?.members]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, LeaveCalendarData["entries"]>();
    for (const e of data?.entries ?? []) {
      const arr = map.get(e.leave_date) ?? [];
      arr.push(e);
      map.set(e.leave_date, arr);
    }
    return map;
  }, [data?.entries]);

  const [y, m] = ym.split("-").map(Number);
  const [todayKst] = useState(() => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10));

  const cycleStart = data?.cycle.leave_start;
  const cycleEnd = data?.cycle.leave_end;
  const cells = useMemo(
    () => (cycleStart && cycleEnd ? buildGrid(cycleStart, cycleEnd) : []),
    [cycleStart, cycleEnd],
  );

  const openAdd = () => {
    if (!data) return;
    const inToday = todayKst >= data.cycle.leave_start && todayKst <= data.cycle.leave_end;
    setSelectedDate(inToday ? todayKst : data.cycle.leave_start);
  };

  const sortedDates = useMemo(
    () => [...entriesByDate.keys()].sort(),
    [entriesByDate],
  );

  const handleCopy = async () => {
    if (!data) return;
    const header = `${y}년 ${m}월 ${team ? TEAM_LABEL[team] : ""} 연차`.trim();

    // 근무자 기준 그룹 (항목은 서버에서 날짜순 정렬됨)
    const byMember = new Map<string, LeaveCalendarData["entries"]>();
    for (const e of data.entries) {
      const arr = byMember.get(e.user_id) ?? [];
      arr.push(e);
      byMember.set(e.user_id, arr);
    }
    const orderedIds = [
      ...data.members.map((mb) => mb.id).filter((id) => byMember.has(id)),
      ...[...byMember.keys()].filter((id) => !data.members.some((mb) => mb.id === id)),
    ];
    const lines = orderedIds.map((uid) => {
      const parts = (byMember.get(uid) ?? []).map((e) => {
        const dObj = new Date(e.leave_date + "T00:00:00");
        const tn = typeName.get(e.leave_type_id) ?? "";
        const tag = e.day_portion === "full" ? "" : `(${DAY_PORTION_LABEL[e.day_portion]})`;
        return `${Number(e.leave_date.slice(5, 7))}/${dObj.getDate()}(${WEEKDAYS[dObj.getDay()]}) ${tn}${tag}`;
      });
      return `${memberName.get(uid) ?? "?"}: ${parts.join(", ")}`;
    });

    const ok = await copyText([header, ...lines].join("\n"));
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3">
      {/* 관리자 팀 전환 */}
      {data?.isAdmin && data.availableTeams.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {data.availableTeams.map((t) => (
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

      {/* 월 네비 */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setYm(addMonth(ym, -1))} className="rounded-full">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="text-center">
          <p className="text-lg font-bold tracking-tight">
            {y}년 {m}월
          </p>
          {team && <p className="text-xs font-medium text-muted-foreground">{TEAM_LABEL[team]}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setYm(addMonth(ym, 1))} className="rounded-full">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* 신청기간 + 내 잔여 */}
      {data && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium",
              data.canSubmit ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground",
            )}
          >
            {!data.canSubmit && <Lock className="h-3 w-3" />}
            신청 {data.cycle.submit_start.slice(5).replace("-", "/")}~
            {data.cycle.submit_end.slice(5).replace("-", "/")}
            {data.canSubmit ? " · 가능" : " · 마감"}
          </span>
          {data.myBalance && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700 ring-1 ring-blue-100">
              내 잔여 <b className="tabular-nums">{data.myBalance.remaining}</b>일
              <span className="text-blue-400">
                (총 {data.myBalance.total}·사용 {data.myBalance.used})
              </span>
            </span>
          )}
        </div>
      )}

      {/* 뷰 토글 + 추가 */}
      {data && (
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-muted p-0.5">
            {(["calendar", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                  view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {v === "calendar" ? "달력" : "목록"}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            {view === "list" && sortedDates.length > 0 && (
              <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "복사됨" : "복사"}
              </Button>
            )}
            {data.canSubmit && (
              <Button size="sm" className="h-8 rounded-full" onClick={openAdd}>
                <Plus className="h-4 w-4" />
                연차 추가
              </Button>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-card">{error}</div>
      )}

      {!loading && !error && data && view === "calendar" && (
        <div className="space-y-3 rounded-2xl bg-card p-3 shadow-card">
          {/* 요일 헤더 (연중무휴 — 주말 구분 없음) */}
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          {/* 그리드 */}
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map(({ date, inRange }) => {
              const dayNum = Number(date.slice(8));

              if (!inRange) {
                return (
                  <div key={date} className="min-h-[80px] rounded-xl bg-muted/20 p-1.5">
                    <span className="text-xs font-medium text-muted-foreground/40">{dayNum}</span>
                  </div>
                );
              }

              const dayEntries = entriesByDate.get(date) ?? [];
              const isToday = date === todayKst;
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={cn(
                    "flex min-h-[80px] flex-col items-stretch rounded-xl border p-1.5 text-left transition-all hover:shadow-sm",
                    isToday
                      ? "border-primary bg-primary/[0.04]"
                      : "border-border/50 bg-background hover:border-border",
                  )}
                >
                  <span
                    className={cn(
                      "mb-1 inline-flex h-5 w-5 items-center justify-center text-xs font-bold leading-none",
                      isToday ? "rounded-full bg-primary text-primary-foreground" : "text-foreground",
                    )}
                  >
                    {dayNum}
                  </span>
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {dayEntries.slice(0, 3).map((e) => {
                      const c = typeColor.get(e.leave_type_id);
                      const nm = memberName.get(e.user_id) ?? "?";
                      const tag = portionTag(e.day_portion);
                      return (
                        <span
                          key={e.id}
                          className={cn(
                            "truncate rounded-md px-1 py-0.5 text-[10px] font-medium leading-tight",
                            c?.pill,
                            highlightId && e.user_id === highlightId && "ring-2 ring-primary",
                          )}
                        >
                          {nm}
                          {tag && <span className="opacity-60"> {tag}</span>}
                        </span>
                      );
                    })}
                    {dayEntries.length > 3 && (
                      <span className="px-1 text-[10px] font-medium text-muted-foreground">
                        +{dayEntries.length - 3}명
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 범례 */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
            {data.leaveTypes.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1">
                <span className={cn("h-2 w-2 rounded-full", typeColor.get(t.id)?.dot)} />
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 목록 뷰 */}
      {!loading && !error && data && view === "list" && (
        <div className="space-y-2">
          {sortedDates.length === 0 ? (
            <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
              이 달에 등록된 연차가 없습니다.
            </div>
          ) : (
            sortedDates.map((date) => {
              const dObj = new Date(date + "T00:00:00");
              const items = entriesByDate.get(date) ?? [];
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className="flex w-full gap-3 rounded-xl bg-card p-3 text-left shadow-card transition-colors hover:bg-accent/30"
                >
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-lg font-bold leading-none">{dObj.getDate()}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                      {WEEKDAYS[dObj.getDay()]}요일
                    </p>
                  </div>
                  <div className="flex flex-1 flex-wrap gap-1.5">
                    {items.map((e) => {
                      const c = typeColor.get(e.leave_type_id);
                      const tag = portionTag(e.day_portion);
                      return (
                        <span
                          key={e.id}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                            c?.pill,
                            highlightId && e.user_id === highlightId && "ring-2 ring-primary",
                          )}
                        >
                          {memberName.get(e.user_id) ?? "?"}
                          <span className="opacity-70">
                            {typeName.get(e.leave_type_id)}
                            {tag && ` ${tag}`}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* 날짜 상세/등록/수정 시트 */}
      <DaySheet
        key={selectedDate ?? "none"}
        date={selectedDate}
        data={data}
        typeName={typeName}
        typeColor={typeColor}
        memberName={memberName}
        entriesByDate={entriesByDate}
        onClose={() => setSelectedDate(null)}
        onChanged={load}
        onRequest={(p) => {
          setSelectedDate(null);
          setRequestPrefill(p);
        }}
        highlightId={highlightId}
      />

      {/* 수정요청 폼 (마감된 날짜에서 진입) */}
      <LeaveRequestForm
        key={requestPrefill ? `${requestPrefill.requestType}-${requestPrefill.targetEntryId ?? requestPrefill.leaveDate ?? ""}` : "none"}
        open={!!requestPrefill}
        onOpenChange={(o) => !o && setRequestPrefill(null)}
        prefill={requestPrefill ?? undefined}
        onDone={load}
      />
    </div>
  );
}

function DaySheet({
  date,
  data,
  typeName,
  typeColor,
  memberName,
  entriesByDate,
  onClose,
  onChanged,
  onRequest,
  highlightId,
}: {
  date: string | null;
  data: LeaveCalendarData | null;
  typeName: Map<string, string>;
  typeColor: Map<string, (typeof TYPE_PALETTE)[number]>;
  memberName: Map<string, string>;
  entriesByDate: Map<string, LeaveCalendarData["entries"]>;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onRequest: (prefill: RequestPrefill) => void;
  highlightId?: string | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState(() => date ?? "");
  const [typeId, setTypeId] = useState(() => data?.leaveTypes[0]?.id ?? "");
  const [portion, setPortion] = useState<DayPortion>("full");
  const [note, setNote] = useState("");
  const [targetUser, setTargetUser] = useState(() =>
    data ? (data.canManage ? data.members[0]?.id ?? "" : data.currentUserId) : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // 선사용(가불) — 전체관리자가 "어느 주기에서 차감할지"를 바꿀 때만 사용. "" = 날짜 기준 자동
  const [chargeBalanceId, setChargeBalanceId] = useState("");
  const [periods, setPeriods] = useState<LeavePeriodOption[] | null>(null);

  const isAdmin = !!data?.isAdmin;
  useEffect(() => {
    if (!isAdmin || !targetUser) return;
    let active = true;
    fetchLeavePeriodOptions(targetUser)
      .then((res) => {
        if (active) setPeriods(res.periods ?? []);
      })
      .catch(() => {
        if (active) setPeriods([]);
      });
    return () => {
      active = false;
    };
  }, [isAdmin, targetUser]);

  if (!data) return null;

  const dayEntries = date ? entriesByDate.get(date) ?? [] : [];
  const dateObj = date ? new Date(date + "T00:00:00") : null;
  const dateLabel = dateObj
    ? `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 (${WEEKDAYS[dateObj.getDay()]})`
    : "";

  const canEdit = (userId: string) => data.canManage || (userId === data.currentUserId && data.canSubmit);

  const resetForm = () => {
    setEditingId(null);
    setFormDate(date ?? "");
    setTypeId(data.leaveTypes[0]?.id ?? "");
    setPortion("full");
    setNote("");
    setTargetUser(data.canManage ? data.members[0]?.id ?? "" : data.currentUserId);
    setChargeBalanceId("");
    setFormError(null);
  };

  const startEdit = (e: LeaveCalendarData["entries"][number]) => {
    setEditingId(e.id);
    setFormDate(e.leave_date);
    setTypeId(e.leave_type_id);
    setPortion(e.day_portion);
    setNote(e.note ?? "");
    setTargetUser(e.user_id);
    setChargeBalanceId(e.balance_id ?? "");
    setFormError(null);
  };

  const submit = async () => {
    if (!formDate || !typeId) return;
    setSubmitting(true);
    setFormError(null);
    const res = editingId
      ? await updateLeaveEntry({
          id: editingId,
          leaveDate: formDate,
          leaveTypeId: typeId,
          dayPortion: portion,
          note,
          targetUserId: data.canManage ? targetUser : undefined,
          chargeBalanceId: data.isAdmin ? chargeBalanceId || null : undefined,
        })
      : await createLeaveEntry({
          leaveDate: formDate,
          leaveTypeId: typeId,
          dayPortion: portion,
          note,
          targetUserId: data.canManage ? targetUser : undefined,
          chargeBalanceId: data.isAdmin ? chargeBalanceId || null : undefined,
        });
    setSubmitting(false);
    if (res.error) {
      setFormError(res.error);
      return;
    }
    await onChanged();
    if (editingId) resetForm();
    else setNote("");
  };

  const handleDelete = async (id: string) => {
    // 모바일 오터치로 연차가 사라지는 걸 막는다
    const target = dayEntries.find((e) => e.id === id);
    const who = target ? memberName.get(target.user_id) ?? "" : "";
    if (!window.confirm(`${who} ${dateLabel} 연차를 삭제할까요?`)) return;

    setSubmitting(true);
    const res = await deleteLeaveEntry(id);
    setSubmitting(false);
    if (res.error) {
      setFormError(res.error);
      return;
    }
    if (editingId === id) resetForm();
    await onChanged();
  };

  return (
    <Sheet open={!!date} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="px-4 pb-0">
          <SheetTitle>{dateLabel}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {/* 등록된 항목 */}
          {dayEntries.length > 0 ? (
            <div className="space-y-1.5">
              {dayEntries.map((e) => (
                <div
                  key={e.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2.5",
                    editingId === e.id
                      ? "bg-primary/10 ring-1 ring-primary/30"
                      : highlightId && e.user_id === highlightId
                        ? "bg-primary/5 ring-1 ring-primary/40"
                        : "bg-muted/50",
                  )}
                >
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", typeColor.get(e.leave_type_id)?.dot)} />
                  <span className="font-semibold">{memberName.get(e.user_id) ?? "?"}</span>
                  <span className="text-sm text-muted-foreground">{typeName.get(e.leave_type_id)}</span>
                  {e.day_portion !== "full" && (
                    <span className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {DAY_PORTION_LABEL[e.day_portion]}
                    </span>
                  )}
                  {e.note && <span className="truncate text-xs text-muted-foreground">· {e.note}</span>}
                  {canEdit(e.user_id) ? (
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => startEdit(e)}
                        disabled={submitting}
                        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-primary"
                        aria-label="수정"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
                        disabled={submitting}
                        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                        aria-label="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : e.user_id === data.currentUserId ? (
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => onRequest({ requestType: "modify", targetEntryId: e.id, leaveDate: e.leave_date })}
                        className="rounded px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-background hover:text-primary"
                      >
                        변경요청
                      </button>
                      <button
                        onClick={() => onRequest({ requestType: "delete", targetEntryId: e.id })}
                        className="rounded px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-background hover:text-destructive"
                      >
                        취소요청
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">등록된 연차가 없습니다.</p>
          )}

          {/* 등록/수정 폼 */}
          {data.canSubmit ? (
            <div className="space-y-2 rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{editingId ? "연차 수정" : "연차 등록"}</p>
                {editingId && (
                  <button onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground">
                    취소
                  </button>
                )}
              </div>
              {data.canManage && (
                <Select value={targetUser} onValueChange={setTargetUser}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="대상자" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.members.map((mb) => (
                      <SelectItem key={mb.id} value={mb.id}>
                        {mb.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                type="date"
                value={formDate}
                min={data.cycle.leave_start}
                max={data.cycle.leave_end}
                onChange={(e) => setFormDate(e.target.value)}
              />
              <div className="flex gap-2">
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="유형" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.leaveTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={portion} onValueChange={(v) => setPortion(v as DayPortion)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">종일</SelectItem>
                    <SelectItem value="am">오전반차</SelectItem>
                    <SelectItem value="pm">오후반차</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input placeholder="메모 (선택)" value={note} onChange={(e) => setNote(e.target.value)} />

              {/* 선사용(가불) — 지난 주기를 다 쓴 직원에게 다음 주기 것을 당겨쓰게 허가할 때 */}
              {data.isAdmin && periods && periods.length > 0 && (
                <div className="space-y-1">
                  <Select value={chargeBalanceId || "auto"} onValueChange={(v) => setChargeBalanceId(v === "auto" ? "" : v)}>
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">차감 주기: 날짜 기준 (기본)</SelectItem>
                      {periods.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          차감: {p.period_start ?? "…"} ~ {p.period_end ?? "…"} ({p.total_days}일)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {chargeBalanceId && (
                    <p className="text-[11px] text-amber-700">
                      선사용 — 날짜와 무관하게 지정한 주기에서 차감됩니다.
                    </p>
                  )}
                </div>
              )}

              {formError && <p className="text-xs text-destructive">{formError}</p>}
              <Button onClick={submit} disabled={submitting || !typeId || !formDate} className="w-full">
                {editingId ? "수정 저장" : (
                  <>
                    <Plus className="h-4 w-4" />
                    등록
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl bg-muted/50 p-3">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4 shrink-0" />
                신청 기간이 아닙니다. 수정요청으로 관리자에게 요청할 수 있어요.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onRequest({ requestType: "add", leaveDate: date ?? undefined })}
              >
                <Plus className="h-4 w-4" />
                이 날짜 추가 요청
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
