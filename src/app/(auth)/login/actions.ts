"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { padPassword } from "@/lib/utils/auth";
import { logActivity } from "@/lib/utils/activity-log";
import { cookies, headers } from "next/headers";
import { cleanLoginHint, NW_ID_COOKIE, nwIdCookieOptions, safeNext } from "@/lib/naverworks/oidc";
import { loginIdForUser } from "@/lib/naverworks/links";

export type LoginState = {
  error?: string;
};

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const name = (formData.get("name") as string)?.trim();
  const password = formData.get("password") as string;

  if (!name || !password) {
    return { error: "이름과 비밀번호를 입력해주세요." };
  }

  const adminClient = createAdminClient();

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, email, role")
    .eq("full_name", name)
    .single();

  if (!profile) {
    return { error: "존재하지 않는 사용자입니다." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: padPassword(password),
  });

  if (error) {
    return { error: "비밀번호가 올바르지 않습니다." };
  }

  await logActivity({
    userId: profile.id,
    userName: name,
    category: "auth",
    action: "login",
    description: "로그인",
  });

  // 네이버웍스와 연결된 사람이면 이 기기에 네이버웍스 아이디를 기억해 둔다
  // → 나중에 네이버웍스로 로그인(알림 링크 포함)할 때 아이디를 다시 묻지 않는다
  try {
    const nwId = cleanLoginHint(await loginIdForUser(adminClient, profile.id));
    if (nwId) {
      const secure = (await headers()).get("x-forwarded-proto") === "https" || process.env.NODE_ENV === "production";
      (await cookies()).set(NW_ID_COOKIE, nwId, nwIdCookieOptions(secure));
    }
  } catch {
    // 기억 못 해도 로그인은 그대로
  }

  // 세미나실 화면 계정은 곧장 라운딩 화면으로 — 주문 화면(/orders)을 거치면 그 화면의 무거운 서버 조회가
  // 다 돌고 나서야 (main) 레이아웃이 라운딩으로 돌려보내 로그인 뒤 한참 멈춘 것처럼 보였다
  if (profile.role === "display") redirect("/briefing/rounding");

  // 로그인 화면으로 오기 전에 가려던 곳(예: 네이버웍스 알림의 링크)이 있으면 그리로
  redirect(safeNext(formData.get("next"), "/orders"));
}
