import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nameToEmail } from "@/lib/utils/auth";
import { logActivity } from "@/lib/utils/activity-log";
import { getDirectoryUser, type DirectoryConfig } from "./directory";
import { canAutoCreate, decidePosition, isActiveMember, type DirUser } from "./directory-rules";
import { LINK_TABLE, normalizeNwEmail } from "./links";

/**
 * 네이버웍스로 들어온 사람의 수오더 계정 맞추기 (서버 전용, service_role 클라이언트로).
 *  - 직원 정보 읽기: 실패해도 이미 연결된 사람의 로그인은 막지 않는다 (직책만 못 맞춘다)
 *  - 연결이 없는 사람: 대응표에 있는 부서면 일반 사용자 계정을 자동으로 만든다.
 *    같은 이름의 수오더 계정이 이미 있으면 만들지 않는다 — 관리자가 직원 관리에서 연결해야 한다(이름으로 짐작해 붙이지 않는다).
 *  - 들어올 때마다 직책을 대응표대로 맞춘다 (관리직·인턴수의사 규칙은 directory-rules.ts).
 */

export async function readDirectoryUser(cfg: DirectoryConfig | null, nw: { sub: string; email: string | null }): Promise<DirUser | null> {
  if (!cfg) return null;
  try {
    return (await getDirectoryUser(cfg, nw.email || nw.sub)) ?? (nw.email ? await getDirectoryUser(cfg, nw.sub) : null);
  } catch (e) {
    console.error("[naverworks] 직원 정보 읽기 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

export type AutoCreateResult = { ok: true; userId: string } | { ok: false; code: "unlinked" | "name-taken" | "inactive" | "failed" };

/** 연결이 없는 사람의 계정을 자동으로 만든다 */
export async function autoCreateAccount(admin: SupabaseClient, cfg: DirectoryConfig, dir: DirUser, nw: { sub: string; email: string | null; name: string | null }): Promise<AutoCreateResult> {
  const can = canAutoCreate(dir, cfg.domainId);
  if (!can.ok) return { ok: false, code: can.reason === "inactive" ? "inactive" : "unlinked" };

  const { data: same } = await admin.from("profiles").select("id").eq("full_name", can.name).maybeSingle();
  if (same) return { ok: false, code: "name-taken" };

  const { data, error } = await admin.auth.admin.createUser({
    email: nameToEmail(can.name),
    // 아무도 모르는 비밀번호 — 이 사람은 네이버웍스로만 들어온다 (관리자가 비밀번호 초기화로 따로 줄 수는 있다)
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
    user_metadata: { full_name: can.name },
  });
  if (error || !data.user) {
    console.error("[naverworks] 계정 자동 만들기 실패:", error?.message);
    return { ok: false, code: "failed" };
  }
  const userId = data.user.id;
  await admin.from("profiles").update({ position: can.position }).eq("id", userId);
  const { error: linkErr } = await admin.from(LINK_TABLE).insert({
    user_id: userId,
    nw_sub: nw.sub,
    nw_login_email: normalizeNwEmail(nw.email ?? dir.email) || null,
    nw_email: nw.email,
    nw_name: nw.name,
  });
  if (linkErr) {
    console.error("[naverworks] 자동 계정 연결 저장 실패:", linkErr.message);
    return { ok: false, code: "failed" };
  }
  void logActivity({ userId, userName: can.name, category: "account", action: "naverworks_auto_create", description: `${can.name} 네이버웍스로 첫 로그인 — 계정 자동 생성 (${can.position})` });
  return { ok: true, userId };
}

/** 들어올 때마다: 네이버웍스 부서에 맞춰 직책을 바꾼다. 바꿨으면 새 직책을 돌려준다 */
export async function syncPosition(admin: SupabaseClient, userId: string, current: string | null, dir: DirUser, domainId: number): Promise<string | null> {
  if (!isActiveMember(dir, domainId)) return null;
  const d = decidePosition(dir, current);
  if (d.kind !== "set" || d.position === current) return null;
  const { error } = await admin.from("profiles").update({ position: d.position }).eq("id", userId);
  if (error) {
    console.error("[naverworks] 직책 맞추기 실패:", error.message);
    return null;
  }
  return d.position;
}
