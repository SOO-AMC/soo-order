"use server";

import { requireAdmin } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkStatusByUser } from "@/lib/naverworks/links";
import type { Position } from "@/lib/types/member";

export interface MemberData {
  id: string;
  full_name: string;
  role: string;
  position: Position | null;
  created_at: string;
  /** 네이버웍스 계정 (관리자가 적어 둔 이메일). linked = 그 사람이 네이버웍스로 한 번이라도 들어와 계정이 확인됨 */
  naverworks: { email: string | null; linked: boolean } | null;
}

export async function fetchMembers(): Promise<MemberData[]> {
  const { supabase, userId } = await requireAdmin();
  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, role, position, created_at")
    .neq("id", userId)
    .eq("is_active", true)
    .order("role", { ascending: true })
    .order("full_name", { ascending: true });

  // 연결 표는 서버(service_role)로만 읽는다 (관리자 확인은 위에서 끝남). 표가 아직 없으면 전부 null
  const links = await linkStatusByUser(createAdminClient());
  return ((members ?? []) as Omit<MemberData, "naverworks">[]).map((m) => ({ ...m, naverworks: links.get(m.id) ?? null })).sort((a, b) => {
    if (a.role !== b.role) return a.role < b.role ? -1 : 1;
    const pinA = a.full_name === "정윤혁" ? 0 : 1;
    const pinB = b.full_name === "정윤혁" ? 0 : 1;
    if (pinA !== pinB) return pinA - pinB;
    return a.full_name.localeCompare(b.full_name, "ko");
  });
}
