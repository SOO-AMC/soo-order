"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/utils/activity-log";
import { naverWorksLoginEnabled } from "@/lib/naverworks/oidc";

/**
 * 내 계정의 네이버웍스 연결 상태 보기·끊기 (본인만).
 * 연결 정보 표(naverworks_links)는 접근 규칙이 없어 서버(service_role)로만 읽고 쓴다 — 여기서는 로그인한 본인의 줄만 다룬다.
 */

export type NaverWorksLinkStatus = {
  /** 서버에 네이버웍스 앱 값이 설정돼 있는가 */
  enabled: boolean;
  /** 연결 정보 표가 있는가 (supabase/migrate-naverworks-login.sql) */
  ready: boolean;
  linked: { name: string | null; email: string | null; linkedAt: string; lastLoginAt: string | null } | null;
};

export async function fetchNaverWorksLink(): Promise<NaverWorksLinkStatus> {
  const { userId } = await requireUser();
  const enabled = naverWorksLoginEnabled();
  const { data, error } = await createAdminClient().from("naverworks_links").select("nw_name, nw_email, linked_at, last_login_at").eq("user_id", userId).maybeSingle();
  if (error) return { enabled, ready: false, linked: null };
  return {
    enabled,
    ready: true,
    linked: data ? { name: data.nw_name as string | null, email: data.nw_email as string | null, linkedAt: data.linked_at as string, lastLoginAt: data.last_login_at as string | null } : null,
  };
}

export async function unlinkNaverWorks(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, userId } = await requireUser();
  const { error } = await createAdminClient().from("naverworks_links").delete().eq("user_id", userId);
  if (error) return { ok: false, error: "연결을 끊지 못했어요. 잠시 뒤 다시 눌러 주세요." };
  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  void logActivity({ userId, userName: (me?.full_name as string | undefined) ?? "", category: "auth", action: "naverworks_unlink", description: "네이버웍스 계정 연결 해제" });
  revalidatePath("/account");
  return { ok: true };
}
