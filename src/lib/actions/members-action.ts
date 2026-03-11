"use server";

import { requireAdmin } from "@/lib/supabase/server";
import type { Position } from "@/lib/types/member";

export interface MemberData {
  id: string;
  full_name: string;
  role: string;
  position: Position | null;
  created_at: string;
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

  return ((members ?? []) as MemberData[]).sort((a, b) => {
    if (a.role !== b.role) return a.role < b.role ? -1 : 1;
    const pinA = a.full_name === "정윤혁" ? 0 : 1;
    const pinB = b.full_name === "정윤혁" ? 0 : 1;
    if (pinA !== pinB) return pinA - pinB;
    return a.full_name.localeCompare(b.full_name, "ko");
  });
}
