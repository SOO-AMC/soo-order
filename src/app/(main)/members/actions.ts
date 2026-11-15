"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nameToEmail, validatePassword, padPassword } from "@/lib/utils/auth";
import { logActivity } from "@/lib/utils/activity-log";
import { randomBytes } from "node:crypto";
import { normalizeNwEmail, setLoginEmail } from "@/lib/naverworks/links";

const NW_ERROR: Record<string, string> = {
  taken: "이 네이버웍스 계정은 이미 다른 직원에게 등록돼 있어요.",
  setup: "네이버웍스 연결 정보를 저장할 곳이 아직 없어요. supabase/migrate-naverworks-login.sql 을 먼저 실행해 주세요.",
};

export type StaffActionState = {
  error?: string;
  success?: boolean;
};

export async function createStaff(
  _prevState: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  const { userId: adminId, userName: adminName } = await requireAdmin();

  const name = (formData.get("name") as string)?.trim();
  const password = formData.get("password") as string;
  const role = (formData.get("role") as string) || "user";
  const position = (formData.get("position") as string) || null;
  const nwEmail = normalizeNwEmail(formData.get("naverworksEmail"));
  if (nwEmail === undefined) return { error: "네이버웍스 계정은 이메일 모양으로 적어 주세요. (예: hong@회사도메인)" };

  // 네이버웍스 계정을 적으면 비밀번호는 비워도 된다 — 그 직원은 네이버웍스로만 들어온다(아무도 모르는 긴 비밀번호를 대신 넣는다)
  if (!name || (!password && !nwEmail)) {
    return { error: nwEmail === null ? "이름과 비밀번호를 입력해주세요. (네이버웍스 계정을 적으면 비밀번호는 비워도 돼요)" : "이름을 입력해주세요." };
  }

  if (password) {
    const validationError = validatePassword(password, role);
    if (validationError) {
      return { error: validationError };
    }
  }

  const adminClient = createAdminClient();

  // 이름 중복 확인
  const { data: existing } = await adminClient
    .from("profiles")
    .select("id")
    .eq("full_name", name)
    .single();

  if (existing) {
    return { error: "이미 존재하는 이름입니다." };
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: nameToEmail(name),
    password: password ? padPassword(password) : randomBytes(24).toString("base64url"),
    email_confirm: true,
    user_metadata: { full_name: name },
  });

  if (error) {
    return { error: `계정 생성 실패: ${error.message}` };
  }

  // profile 업데이트 (role, position)
  const roleToSet = role === "admin" || role === "team_manager" || role === "display" ? role : null;
  if (data.user && (roleToSet || position)) {
    await adminClient
      .from("profiles")
      .update({
        ...(roleToSet ? { role: roleToSet } : {}),
        ...(position ? { position } : {}),
      })
      .eq("id", data.user.id);
  }

  if (data.user && nwEmail) {
    const linked = await setLoginEmail(adminClient, data.user.id, nwEmail);
    if (!linked.ok) {
      revalidatePath("/members");
      return { error: `직원은 추가했지만 네이버웍스 계정은 등록하지 못했어요. ${NW_ERROR[linked.error] ?? "정보 수정에서 다시 적어 주세요."}` };
    }
  }

  await logActivity({ userId: adminId, userName: adminName, category: "account", action: "create_member", description: `${name} 직원 추가${nwEmail ? " (네이버웍스 계정 등록)" : ""}` });
  revalidatePath("/members");
  return { success: true };
}

export async function updateStaff(
  _prevState: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  const { userId: adminId, userName: adminName } = await requireAdmin();

  const userId = formData.get("userId") as string;
  const newName = (formData.get("name") as string)?.trim();
  const newRole = formData.get("role") as string;
  const newPosition = (formData.get("position") as string) || null;
  const nwEmail = normalizeNwEmail(formData.get("naverworksEmail"));
  if (nwEmail === undefined) return { error: "네이버웍스 계정은 이메일 모양으로 적어 주세요. (예: hong@회사도메인)" };

  if (!userId || !newName) {
    return { error: "필수 항목을 입력해주세요." };
  }

  const adminClient = createAdminClient();

  // 이름 중복 확인 (자기 자신 제외)
  const { data: existing } = await adminClient
    .from("profiles")
    .select("id")
    .eq("full_name", newName)
    .neq("id", userId)
    .single();

  if (existing) {
    return { error: "이미 존재하는 이름입니다." };
  }

  // profiles 업데이트
  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ full_name: newName, role: newRole, position: newPosition })
    .eq("id", userId);

  if (profileError) {
    return { error: "정보 수정에 실패했습니다." };
  }

  // auth user 메타데이터 + 이메일 업데이트
  await adminClient.auth.admin.updateUserById(userId, {
    email: nameToEmail(newName),
    user_metadata: { full_name: newName },
  });

  // 네이버웍스 계정: 칸이 폼에 있을 때만 바꾼다 (비우면 연결 해제)
  if (formData.has("naverworksEmail")) {
    const linked = await setLoginEmail(adminClient, userId, nwEmail);
    if (!linked.ok) return { error: NW_ERROR[linked.error] ?? "네이버웍스 계정을 저장하지 못했어요." };
  }

  await logActivity({ userId: adminId, userName: adminName, category: "account", action: "update_member", description: `${newName} 직원 정보 수정` });
  revalidatePath("/members");
  return { success: true };
}

export async function resetStaffPassword(
  _prevState: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  const { userId: adminId, userName: adminName } = await requireAdmin();

  const userId = formData.get("userId") as string;
  const newPassword = formData.get("newPassword") as string;

  if (!userId || !newPassword) {
    return { error: "비밀번호를 입력해주세요." };
  }

  const adminClient = createAdminClient();

  // 세미나실 화면 계정은 1자리 비밀번호를 쓸 수 있다 → 대상의 권한을 보고 규칙을 정한다
  const { data: target } = await adminClient.from("profiles").select("role").eq("id", userId).single();
  const validationError = validatePassword(newPassword, target?.role as string | undefined);
  if (validationError) {
    return { error: validationError };
  }

  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password: padPassword(newPassword),
  });

  if (error) {
    return { error: "비밀번호 초기화에 실패했습니다." };
  }

  // Get target user name for logging
  const { data: targetProfile } = await adminClient.from("profiles").select("full_name").eq("id", userId).single();
  await logActivity({ userId: adminId, userName: adminName, category: "account", action: "reset_password", description: `${targetProfile?.full_name ?? userId} 비밀번호 초기화` });
  revalidatePath("/members");
  return { success: true };
}

export async function deleteStaff(targetUserId: string): Promise<StaffActionState> {
  const { userId: adminId, userName: adminName } = await requireAdmin();

  const adminClient = createAdminClient();

  // Get target user name for logging
  const { data: targetProfile } = await adminClient.from("profiles").select("full_name").eq("id", targetUserId).single();

  // 소프트 삭제: 프로필 비활성화 + 로그인 차단 (주문 데이터 보존)
  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ is_active: false })
    .eq("id", targetUserId);

  if (profileError) {
    return { error: "계정 비활성화에 실패했습니다." };
  }

  // auth user 로그인 차단
  const { error: banError } = await adminClient.auth.admin.updateUserById(
    targetUserId,
    { ban_duration: "876600h" } // 100년
  );

  if (banError) {
    return { error: "로그인 차단에 실패했습니다." };
  }

  await logActivity({ userId: adminId, userName: adminName, category: "account", action: "delete_member", description: `${targetProfile?.full_name ?? targetUserId} 직원 삭제` });
  revalidatePath("/members");
  return { success: true };
}
