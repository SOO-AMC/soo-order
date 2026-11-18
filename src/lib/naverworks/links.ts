import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 수오더 계정 ↔ 네이버웍스 계정 연결 표(naverworks_links) 다루기. 서버(service_role) 클라이언트로만 부른다.
 * "use server" 파일이 아니다 — 라우트 핸들러와 관리자 액션이 같이 쓴다. 부르는 쪽이 권한을 먼저 확인한다.
 */

export const LINK_TABLE = "naverworks_links";
export type LinkRow = { user_id: string; nw_login_email: string | null; nw_sub: string | null; nw_email: string | null; nw_name: string | null; linked_at: string; last_login_at: string | null };
const COLS = "user_id, nw_login_email, nw_sub, nw_email, nw_name, linked_at, last_login_at";

/** 이메일 모양 정리 (빈 값은 null). 네이버웍스 계정은 "보통 이메일 모양"이라 @ 만 확인한다 */
export function normalizeNwEmail(v: unknown): string | null | undefined {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (!t) return null;
  return /^[^\s@]+@[^\s@]+$/.test(t) && t.length <= 254 ? t : undefined; // undefined = 형식 오류
}

export const isMissingTable = (msg: string | undefined) => /does not exist|schema cache|PGRST205|42P01/i.test(msg ?? "");

/** 이 사람의 네이버웍스 로그인 아이디 (관리자가 적어 둔 것 → 네이버웍스가 알려 준 것 순). 없거나 읽기 실패면 null */
export async function loginIdForUser(sb: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await sb.from(LINK_TABLE).select("nw_login_email, nw_email").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return normalizeNwEmail(data.nw_login_email) || normalizeNwEmail(data.nw_email) || null;
}

/**
 * 로그인 화면에 적은 이름으로 네이버웍스 아이디 찾기 (네이버웍스 로그인 화면에 미리 채우는 용도).
 * 재직 중이고 이름이 정확히 한 명과 같을 때만. 동명이인·퇴사·연결 없음이면 null(아이디 입력 화면이 그대로 나온다).
 */
export async function loginIdForName(sb: SupabaseClient, name: string): Promise<string | null> {
  const n = name.trim();
  if (!n || n.length > 40) return null;
  const { data, error } = await sb.from("profiles").select("id, is_active").eq("full_name", n).limit(2);
  if (error || !data || data.length !== 1 || data[0].is_active === false) return null;
  return loginIdForUser(sb, data[0].id as string);
}

/**
 * 네이버웍스 로그인으로 들어온 사람의 수오더 계정 찾기.
 *  1) 구성원 ID(sub)가 이미 붙어 있는 연결
 *  2) 없으면: 관리자가 적어 둔 이메일이 네이버웍스가 확인해 준 이메일과 같고, 아직 sub 가 비어 있는 연결 → 이 sub 를 붙인다
 * 돌려주는 값: user_id, 못 찾으면 null
 */
export async function resolveLogin(sb: SupabaseClient, nw: { sub: string; email: string | null }): Promise<{ userId: string | null; error?: string }> {
  const bySub = await sb.from(LINK_TABLE).select("user_id").eq("nw_sub", nw.sub).maybeSingle();
  if (bySub.error) return { userId: null, error: bySub.error.message };
  if (bySub.data) return { userId: bySub.data.user_id as string };

  const email = normalizeNwEmail(nw.email);
  if (!email) return { userId: null };
  // 첫 로그인: 조건부로 붙인다 (동시에 두 번 와도 한쪽만)
  const claim = await sb.from(LINK_TABLE).update({ nw_sub: nw.sub }).eq("nw_login_email", email).is("nw_sub", null).select("user_id");
  if (claim.error) return { userId: null, error: claim.error.message };
  if (claim.data && claim.data.length === 1) return { userId: claim.data[0].user_id as string };
  return { userId: null };
}

/** 관리자가 직원의 네이버웍스 계정을 적거나 지우기. 이메일이 바뀌면 붙어 있던 sub 를 떼서 새 계정으로 다시 확인받게 한다 */
export async function setLoginEmail(sb: SupabaseClient, userId: string, email: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: cur, error: readErr } = await sb.from(LINK_TABLE).select(COLS).eq("user_id", userId).maybeSingle();
  if (readErr) return { ok: false, error: isMissingTable(readErr.message) ? "setup" : readErr.message };
  const row = cur as LinkRow | null;

  if (!email) {
    if (!row) return { ok: true };
    const { error } = await sb.from(LINK_TABLE).delete().eq("user_id", userId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  if (row?.nw_login_email === email) return { ok: true };

  const { data: other } = await sb.from(LINK_TABLE).select("user_id").ilike("nw_login_email", email).neq("user_id", userId).maybeSingle();
  if (other) return { ok: false, error: "taken" };

  const { error } = await sb.from(LINK_TABLE).upsert({ user_id: userId, nw_login_email: email, nw_sub: null, nw_email: null, nw_name: null, linked_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? "taken" : error.message };
  return { ok: true };
}

/** 직원 목록에 보여 줄 연결 상태 (user_id → 상태) */
export async function linkStatusByUser(sb: SupabaseClient): Promise<Map<string, { email: string | null; linked: boolean }>> {
  const { data, error } = await sb.from(LINK_TABLE).select("user_id, nw_login_email, nw_email, nw_sub");
  const out = new Map<string, { email: string | null; linked: boolean }>();
  if (error) return out;
  for (const r of (data ?? []) as Pick<LinkRow, "user_id" | "nw_login_email" | "nw_email" | "nw_sub">[]) out.set(r.user_id, { email: r.nw_login_email ?? r.nw_email, linked: !!r.nw_sub });
  return out;
}
