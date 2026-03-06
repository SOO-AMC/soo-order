import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StaffManagement } from "@/components/account/staff-management";

export const metadata: Metadata = {
  title: "직원 관리",
};

export default async function MembersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/orders");
  }

  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .neq("id", user.id)
    .eq("is_active", true)
    .order("role", { ascending: true })
    .order("full_name", { ascending: true });

  const sorted = (members ?? []).sort((a, b) => {
    if (a.role !== b.role) return a.role < b.role ? -1 : 1;
    const pinA = a.full_name === "정윤혁" ? 0 : 1;
    const pinB = b.full_name === "정윤혁" ? 0 : 1;
    if (pinA !== pinB) return pinA - pinB;
    return a.full_name.localeCompare(b.full_name, "ko");
  });

  return <StaffManagement members={sorted} />;
}
