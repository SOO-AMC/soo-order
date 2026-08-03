import type { ScheduleMonthData, WorkShift } from "@/lib/types/schedule";
import { positionToTeam, TEAMS, type Team } from "@/lib/utils/team";
import type { Position } from "@/lib/types/member";

export interface CellPerson {
  user_id: string;
  name: string;
  tag?: string; // 반/특/휴변/연/유/무/병/경
  surgery: boolean;
  pathology: boolean;
  team: Team | null;
}

/** 팀 순서대로 묶기 (팀 없는 인원은 마지막) */
export function groupByTeam(people: CellPerson[]): { team: Team | null; people: CellPerson[] }[] {
  const out: { team: Team | null; people: CellPerson[] }[] = [];
  for (const t of TEAMS) {
    const ps = people.filter((p) => p.team === t);
    if (ps.length) out.push({ team: t, people: ps });
  }
  const none = people.filter((p) => !p.team);
  if (none.length) out.push({ team: null, people: none });
  return out;
}

export interface DayComposition {
  groups: { shift: WorkShift; people: CellPerson[] }[];
  off: CellPerson[];
}

/** 한 날짜의 근무 배치를 시프트별 그룹 + 휴무로 구성 (연차 오버레이 반영) */
export function composeDay(data: ScheduleMonthData, date: string): DayComposition {
  const entryByUser = new Map(data.entries.filter((e) => e.work_date === date).map((e) => [e.user_id, e]));
  const leaveByUser = new Map(data.leaves.filter((l) => l.leave_date === date).map((l) => [l.user_id, l]));

  const groups = data.shifts.map((shift) => ({ shift, people: [] as CellPerson[] }));
  const groupMap = new Map(groups.map((g) => [g.shift.id, g.people]));
  const off: CellPerson[] = [];

  for (const m of data.members) {
    const en = entryByUser.get(m.id);
    const lv = leaveByUser.get(m.id);
    const team = positionToTeam(m.position as Position | null);
    const base: CellPerson = {
      user_id: m.id,
      name: m.full_name,
      surgery: en?.surgery_assist ?? false,
      pathology: en?.pathology ?? false,
      team,
    };
    const offPerson = (tag?: string): CellPerson => ({
      user_id: m.id,
      name: m.full_name,
      surgery: false,
      pathology: false,
      team,
      tag,
    });

    // 종일 휴가 → 휴무 + 태그(유형 첫 글자: 연/병/경/유/무)
    if (lv && lv.day_portion === "full") {
      off.push(offPerson(lv.type_name.charAt(0)));
      continue;
    }

    const halfTag = lv && (lv.day_portion === "am" || lv.day_portion === "pm") ? "반" : undefined;

    let shiftId: string | null = null;
    let tag: string | undefined = halfTag;
    if (en) {
      if (en.status === "work") shiftId = en.shift_id;
      else if (en.status === "extra") {
        shiftId = en.shift_id;
        tag = "특";
      }
    }

    if (shiftId && groupMap.has(shiftId)) {
      groupMap.get(shiftId)!.push({ ...base, tag });
    } else if (en?.status === "off_change") {
      off.push(offPerson("휴변"));
    } else if (en?.status === "extra") {
      off.push(offPerson("특"));
    } else if (halfTag) {
      off.push(offPerson("반"));
    } else {
      off.push(offPerson());
    }
  }

  return { groups, off };
}
