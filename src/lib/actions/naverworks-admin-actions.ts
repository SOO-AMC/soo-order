"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/utils/activity-log";
import { directoryConfig, listDirectoryUsers } from "@/lib/naverworks/directory";
import { canAutoCreate, decidePosition, dirFullName, isActiveMember, type SooPosition } from "@/lib/naverworks/directory-rules";
import { LINK_TABLE, normalizeNwEmail, setLoginEmail } from "@/lib/naverworks/links";

/**
 * 관리자: 네이버웍스 직원 ↔ 수오더 계정 맞추기.
 * 이름이 같은 사람을 "연결 후보"로 보여 주고, 관리자가 고른 것만 연결한다(자동으로 붙이지 않는다).
 */

export type RosterRow = {
  /** 네이버웍스 */
  nwName: string;
  nwEmail: string | null;
  dept: string | null;
  /** 대응표에 따른 직책 (관리직·대응 없음이면 null) */
  position: SooPosition | null;
  /** 수오더 */
  userId: string | null;
  sooPosition: string | null;
  /**
   * linked = 이미 연결됨 · suggest = 이름이 같은 수오더 계정이 있음(연결 후보) · conflict = 그 수오더 계정은 다른 네이버웍스 계정에 연결돼 있음
   * new = 수오더 계정 없음 → 첫 로그인 때 자동으로 만들어짐 · skip = 자동으로 만들지 않음(대응 부서 아님·공용 계정 등)
   */
  status: "linked" | "suggest" | "conflict" | "new" | "skip";
};

export type RosterResult = { ready: false; reason: "no-directory" | "failed" } | { ready: true; rows: RosterRow[] };

export async function fetchNaverWorksRoster(): Promise<RosterResult> {
  await requireAdmin();
  const cfg = directoryConfig();
  if (!cfg) return { ready: false, reason: "no-directory" };
  const admin = createAdminClient();
  try {
    const [users, profilesRes, linksRes] = await Promise.all([
      listDirectoryUsers(cfg),
      admin.from("profiles").select("id, full_name, position").eq("is_active", true),
      admin.from(LINK_TABLE).select("user_id, nw_login_email, nw_sub"),
    ]);
    const profiles = (profilesRes.data ?? []) as { id: string; full_name: string; position: string | null }[];
    const byName = new Map(profiles.map((p) => [p.full_name.trim(), p]));
    const links = (linksRes.data ?? []) as { user_id: string; nw_login_email: string | null; nw_sub: string | null }[];
    const linkByUser = new Map(links.map((l) => [l.user_id, l]));
    const linkedEmails = new Set(links.map((l) => (l.nw_login_email ?? "").toLowerCase()).filter(Boolean));

    const active = users.filter((u) => isActiveMember(u, cfg.domainId) && dirFullName(u));
    // 네이버웍스에 같은 이름이 둘 이상이면 어느 쪽인지 사람이 골라야 한다 → 후보로 미리 체크하지 않는다
    const nameCount = new Map<string, number>();
    for (const u of active) nameCount.set(dirFullName(u), (nameCount.get(dirFullName(u)) ?? 0) + 1);

    const rows: RosterRow[] = [];
    for (const u of active) {
      const name = dirFullName(u);
      const email = normalizeNwEmail(u.email) || null;
      const p = byName.get(name) ?? null;
      // 지금 수오더 직책을 넘겨야 인턴수의사 유지 규칙이 화면에도 그대로 보인다
      const d = decidePosition(u, p?.position ?? null);
      const dept = d.kind === "set" ? d.dept : ((u.organizations ?? []).flatMap((o) => o.orgUnits ?? []).find((ou) => ou.primary)?.orgUnitName ?? null);
      const l = p ? linkByUser.get(p.id) : undefined;
      let status: RosterRow["status"];
      if (p && l && email && (l.nw_login_email ?? "").toLowerCase() === email) status = "linked";
      else if (p && l) status = "conflict";
      else if (p && (nameCount.get(name) ?? 0) > 1) status = "conflict";
      else if (p) status = email && linkedEmails.has(email) ? "conflict" : "suggest";
      else status = canAutoCreate(u, cfg.domainId).ok ? "new" : "skip";
      rows.push({ nwName: name, nwEmail: email, dept, position: d.kind === "set" ? d.position : null, userId: p?.id ?? null, sooPosition: p?.position ?? null, status });
    }
    const order = { suggest: 0, conflict: 1, new: 2, skip: 3, linked: 4 } as const;
    rows.sort((a, b) => order[a.status] - order[b.status] || a.nwName.localeCompare(b.nwName, "ko"));
    return { ready: true, rows };
  } catch (e) {
    console.error("[naverworks] 직원 목록 읽기 실패:", e instanceof Error ? e.message : e);
    return { ready: false, reason: "failed" };
  }
}

/** 고른 연결 후보를 연결한다 (수오더 계정에 네이버웍스 이메일 등록 → 그 사람의 첫 네이버웍스 로그인 때 확정) */
export async function linkNaverWorksMembers(pairs: { userId: string; email: string }[]): Promise<{ ok: true; linked: number; failed: string[] } | { ok: false; error: string }> {
  const { userId: adminId, userName: adminName } = await requireAdmin();
  if (!Array.isArray(pairs) || pairs.length === 0) return { ok: false, error: "연결할 사람을 골라 주세요." };
  if (pairs.length > 300) return { ok: false, error: "한 번에 300명까지 연결할 수 있어요." };
  const admin = createAdminClient();
  let linked = 0;
  const failed: string[] = [];
  for (const p of pairs) {
    const email = normalizeNwEmail(p?.email);
    if (typeof p?.userId !== "string" || !email) {
      failed.push(String(p?.email ?? "?"));
      continue;
    }
    const r = await setLoginEmail(admin, p.userId, email);
    if (r.ok) linked += 1;
    else failed.push(email);
  }
  void logActivity({ userId: adminId, userName: adminName, category: "account", action: "naverworks_bulk_link", description: `네이버웍스 계정 연결 ${linked}명${failed.length ? ` (실패 ${failed.length}명)` : ""}` });
  revalidatePath("/members");
  return { ok: true, linked, failed };
}
