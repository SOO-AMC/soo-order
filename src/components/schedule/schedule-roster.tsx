"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { fetchScheduleRoster, setScheduleExclude } from "@/lib/actions/schedule-actions";
import type { ScheduleRosterMember } from "@/lib/types/schedule";

const CAT_ORDER: { label: string; pos: string | null }[] = [
  { label: "수의사", pos: "veterinarian" },
  { label: "인턴수의사", pos: "intern_vet" },
  { label: "간호", pos: "technician" },
  { label: "방사선사", pos: "radiologist" },
  { label: "매니저", pos: "manager" },
  { label: "행정", pos: "admin_staff" },
  { label: "기타", pos: null },
];

function catOf(position: string | null): string | null {
  if (["veterinarian", "intern_vet", "technician", "radiologist", "manager", "admin_staff"].includes(position ?? "")) {
    return position;
  }
  return null;
}

export function ScheduleRoster({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}) {
  const [members, setMembers] = useState<ScheduleRosterMember[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetchScheduleRoster().then((r) => {
      if (active) setMembers(r.members);
    });
    return () => {
      active = false;
    };
  }, [open]);

  const toggle = async (m: ScheduleRosterMember) => {
    const nextExcluded = !m.schedule_exclude;
    setBusy(m.id);
    setMembers((prev) => prev?.map((x) => (x.id === m.id ? { ...x, schedule_exclude: nextExcluded } : x)) ?? null);
    const res = await setScheduleExclude(m.id, nextExcluded);
    setBusy(null);
    if (res.error) {
      // 롤백
      setMembers((prev) => prev?.map((x) => (x.id === m.id ? { ...x, schedule_exclude: m.schedule_exclude } : x)) ?? null);
      alert(res.error);
      return;
    }
    onChanged();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="px-4 pb-0">
          <SheetTitle>근무표 명단</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-8">
          <p className="text-[11px] text-muted-foreground">
            체크된 인원만 근무표에 나옵니다. 해제하면 모든 날짜에서 통으로 빠집니다.
          </p>
          {members === null ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            CAT_ORDER.map((cat) => {
              const ms = members.filter((m) => catOf(m.position) === cat.pos);
              if (ms.length === 0) return null;
              return (
                <div key={cat.label} className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">{cat.label}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ms.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                      >
                        <Checkbox
                          checked={!m.schedule_exclude}
                          disabled={busy === m.id}
                          onCheckedChange={() => toggle(m)}
                        />
                        <span className={m.schedule_exclude ? "text-muted-foreground line-through" : ""}>
                          {m.full_name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
