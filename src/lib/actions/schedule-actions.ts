"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireAdmin } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/utils/activity-log";
import type {
  ScheduleStatus,
  WorkShift,
  ScheduleEntry,
  ScheduleMember,
  ScheduleLeave,
  ScheduleMonthData,
  ScheduleRosterMember,
} from "@/lib/types/schedule";

type ActionState = { error?: string; success?: boolean };

function monthRange(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
}

async function getActor() {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase.from("profiles").select("role, full_name, position").eq("id", userId).single();
  const role = (data?.role as string) ?? "user";
  return {
    supabase,
    userId,
    userName: (data?.full_name as string) ?? "?",
    role,
    position: (data?.position as string) ?? null,
    isAdmin: role === "admin",
    isTeamManager: role === "team_manager",
  };
}

type Actor = Awaited<ReturnType<typeof getActor>>;

/** 팀관리자는 본인과 같은 직책(position) 인원만 관리 */
function canManagePosition(actor: Actor, targetPos: string | null): boolean {
  return actor.isAdmin || (actor.isTeamManager && !!targetPos && targetPos === actor.position);
}

async function getPosition(supabase: Actor["supabase"], uid: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("position").eq("id", uid).maybeSingle();
  return (data?.position as string | null) ?? null;
}

/** 팀관리자 활동을 전체관리자에게 알림 */
async function notifyScheduleAdmins(supabase: Actor["supabase"], actor: Actor, description: string) {
  if (!actor.isTeamManager) return;
  const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin").eq("is_active", true);
  const rows = (admins ?? []).map((a) => ({
    user_id: a.id as string,
    type: "team_manager_action",
    title: "팀관리자 활동",
    body: `${actor.userName}: ${description}`,
    link: "/schedule",
  }));
  if (rows.length > 0) await supabase.from("notifications").insert(rows);
}

export async function fetchSchedule(yearMonth: string): Promise<{ error?: string; data?: ScheduleMonthData }> {
  const { supabase, userId } = await requireUser();

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  const isAdmin = profile?.role === "admin";

  const { start, end } = monthRange(yearMonth);

  const [shiftsRes, membersRes, entriesRes] = await Promise.all([
    supabase.from("work_shifts").select("*").eq("is_active", true).order("sort_order"),
    supabase
      .from("profiles")
      .select("id, full_name, position")
      .eq("is_active", true)
      .eq("schedule_exclude", false)
      .order("full_name"),
    supabase.from("schedule_entries").select("*").gte("work_date", start).lte("work_date", end),
  ]);

  // 연차 오버레이는 팀 RLS를 우회해 전체를 봐야 하므로 admin 클라이언트로 조회
  const admin = createAdminClient();
  const { data: leaveRows } = await admin
    .from("leave_entries")
    .select("user_id, leave_date, day_portion, leave_types(name)")
    .gte("leave_date", start)
    .lte("leave_date", end);

  const leaves: ScheduleLeave[] = (leaveRows ?? []).map((r) => ({
    user_id: r.user_id as string,
    leave_date: r.leave_date as string,
    day_portion: r.day_portion as ScheduleLeave["day_portion"],
    type_name: (r.leave_types as unknown as { name: string } | null)?.name ?? "연차",
  }));

  return {
    data: {
      yearMonth,
      shifts: (shiftsRes.data ?? []) as WorkShift[],
      members: (membersRes.data ?? []) as ScheduleMember[],
      entries: (entriesRes.data ?? []) as ScheduleEntry[],
      leaves,
      isAdmin,
    },
  };
}

export async function setScheduleEntry(input: {
  workDate: string;
  userId: string;
  shiftId: string | null;
  status: ScheduleStatus;
  surgeryAssist?: boolean;
  pathology?: boolean;
  note?: string | null;
}): Promise<ActionState> {
  const actor = await getActor();
  const tgtPos = await getPosition(actor.supabase, input.userId);
  if (!canManagePosition(actor, tgtPos)) return { error: "권한이 없습니다." };
  const { error } = await actor.supabase.from("schedule_entries").upsert(
    {
      work_date: input.workDate,
      user_id: input.userId,
      shift_id: input.status === "off" || input.status === "off_change" ? null : input.shiftId,
      status: input.status,
      surgery_assist: input.surgeryAssist ?? false,
      pathology: input.pathology ?? false,
      note: input.note ?? null,
      updated_by: actor.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "work_date,user_id" },
  );
  if (error) return { error: `저장 실패: ${error.message}` };
  revalidatePath("/schedule");
  return { success: true };
}

export async function clearScheduleEntry(workDate: string, targetUserId: string): Promise<ActionState> {
  const actor = await getActor();
  const tgtPos = await getPosition(actor.supabase, targetUserId);
  if (!canManagePosition(actor, tgtPos)) return { error: "권한이 없습니다." };
  const { error } = await actor.supabase
    .from("schedule_entries")
    .delete()
    .eq("work_date", workDate)
    .eq("user_id", targetUserId);
  if (error) return { error: `삭제 실패: ${error.message}` };
  revalidatePath("/schedule");
  return { success: true };
}

/** 여러 직원을 한 시프트로 일괄 배정 */
export async function bulkSetShift(input: {
  workDate: string;
  userIds: string[];
  shiftId: string;
}): Promise<ActionState> {
  const actor = await getActor();
  if (!actor.isAdmin && !actor.isTeamManager) return { error: "권한이 없습니다." };
  if (input.userIds.length === 0) return { success: true };
  const rows = input.userIds.map((uid) => ({
    work_date: input.workDate,
    user_id: uid,
    shift_id: input.shiftId,
    status: "work" as const,
    updated_by: actor.userId,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await actor.supabase.from("schedule_entries").upsert(rows, { onConflict: "work_date,user_id" });
  if (error) return { error: `일괄 배정 실패: ${error.message}` };
  revalidatePath("/schedule");
  return { success: true };
}

/** 한 날짜의 배정을 다른 날짜로 복사 (덮어쓰기). 팀관리자는 본인 직책만 */
export async function copyDaySchedule(srcDate: string, destDate: string): Promise<ActionState> {
  const actor = await getActor();
  if (!actor.isAdmin && !actor.isTeamManager) return { error: "권한이 없습니다." };

  // 팀관리자: 본인 직책 인원으로 범위 제한
  let scopeIds: string[] | null = null;
  if (actor.isTeamManager && !actor.isAdmin) {
    if (!actor.position) return { error: "직책이 없어 근무표를 편집할 수 없습니다." };
    const { data: mem } = await actor.supabase.from("profiles").select("id").eq("position", actor.position);
    scopeIds = (mem ?? []).map((r) => r.id as string);
    if (scopeIds.length === 0) return { error: "관리할 팀원이 없습니다." };
  }

  let srcQ = actor.supabase
    .from("schedule_entries")
    .select("user_id, shift_id, status, surgery_assist, pathology, note")
    .eq("work_date", srcDate);
  if (scopeIds) srcQ = srcQ.in("user_id", scopeIds);
  const { data: src } = await srcQ;
  if (!src || src.length === 0) return { error: "복사할 원본 날짜에 배정이 없습니다." };

  let delQ = actor.supabase.from("schedule_entries").delete().eq("work_date", destDate);
  if (scopeIds) delQ = delQ.in("user_id", scopeIds);
  await delQ;

  const rows = src.map((r) => ({
    work_date: destDate,
    user_id: r.user_id,
    shift_id: r.shift_id,
    status: r.status,
    surgery_assist: r.surgery_assist,
    pathology: r.pathology,
    note: r.note,
    updated_by: actor.userId,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await actor.supabase.from("schedule_entries").insert(rows);
  if (error) return { error: `복사 실패: ${error.message}` };

  await logActivity({
    userId: actor.userId,
    userName: actor.userName,
    category: "leave",
    action: "copy_schedule",
    description: `근무표 복사 ${srcDate}→${destDate}`,
  });
  await notifyScheduleAdmins(actor.supabase, actor, `근무표 복사 ${srcDate}→${destDate}`);
  revalidatePath("/schedule");
  return { success: true };
}

// --- 명단 관리 (근무표 포함/제외) ---

export async function fetchScheduleRoster(): Promise<{ members: ScheduleRosterMember[] }> {
  const actor = await getActor();
  if (!actor.isAdmin && !actor.isTeamManager) return { members: [] };
  let q = actor.supabase
    .from("profiles")
    .select("id, full_name, position, schedule_exclude")
    .eq("is_active", true)
    .order("full_name");
  if (actor.isTeamManager && !actor.isAdmin && actor.position) q = q.eq("position", actor.position);
  const { data } = await q;
  return { members: (data ?? []) as ScheduleRosterMember[] };
}

export async function setScheduleExclude(targetUserId: string, excluded: boolean): Promise<ActionState> {
  const actor = await getActor();
  const tgtPos = await getPosition(actor.supabase, targetUserId);
  if (!canManagePosition(actor, tgtPos)) return { error: "권한이 없습니다." };
  // profiles 업데이트는 service_role로 (RLS 우회, 권한은 위에서 검증)
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ schedule_exclude: excluded }).eq("id", targetUserId);
  if (error) return { error: `명단 변경 실패: ${error.message}` };
  await notifyScheduleAdmins(actor.supabase, actor, `근무표 명단 ${excluded ? "제외" : "포함"}`);
  revalidatePath("/schedule");
  return { success: true };
}

// --- 시프트 관리 (관리자) ---

export async function fetchWorkShiftsAll(): Promise<{ shifts: WorkShift[] }> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("work_shifts").select("*").order("sort_order");
  return { shifts: (data ?? []) as WorkShift[] };
}

export async function upsertWorkShift(input: {
  id?: string;
  name: string;
  startTime: string;
  isActive: boolean;
}): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const name = input.name.trim();
  if (!name) return { error: "시프트명을 입력해주세요." };

  if (input.id) {
    const { error } = await supabase
      .from("work_shifts")
      .update({ name, start_time: input.startTime, is_active: input.isActive })
      .eq("id", input.id);
    if (error) return { error: `시프트 수정 실패: ${error.message}` };
  } else {
    const { data: maxRow } = await supabase
      .from("work_shifts")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxRow?.sort_order ?? 0) + 1;
    const { error } = await supabase
      .from("work_shifts")
      .insert({ name, start_time: input.startTime, sort_order: nextOrder, is_active: input.isActive });
    if (error) return { error: `시프트 추가 실패: ${error.message}` };
  }
  revalidatePath("/schedule");
  return { success: true };
}
