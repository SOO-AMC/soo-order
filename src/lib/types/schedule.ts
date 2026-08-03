export type ScheduleStatus = "work" | "off" | "extra" | "off_change";

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  work: "근무",
  off: "휴무",
  extra: "특근",
  off_change: "휴무변경",
};

/** 상태별 짧은 태그 (근무표 셀 표기) — work는 태그 없음 */
export const STATUS_TAG: Partial<Record<ScheduleStatus, string>> = {
  extra: "특",
  off_change: "휴변",
};

export interface WorkShift {
  id: string;
  name: string;
  start_time: string; // 'HH:MM'
  sort_order: number;
  is_active: boolean;
}

export interface ScheduleEntry {
  id: string;
  work_date: string;
  user_id: string;
  shift_id: string | null;
  status: ScheduleStatus;
  surgery_assist: boolean;
  pathology: boolean;
  note: string | null;
}

export interface ScheduleMember {
  id: string;
  full_name: string;
  position: string | null;
}

export interface ScheduleLeave {
  user_id: string;
  leave_date: string;
  day_portion: "full" | "am" | "pm";
  type_name: string;
}

export interface ScheduleMonthData {
  yearMonth: string;
  shifts: WorkShift[];
  members: ScheduleMember[];
  entries: ScheduleEntry[];
  leaves: ScheduleLeave[];
  isAdmin: boolean;
}

export interface ScheduleRosterMember {
  id: string;
  full_name: string;
  position: string | null;
  schedule_exclude: boolean;
}
