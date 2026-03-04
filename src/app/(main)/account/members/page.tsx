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
    redirect("/account");
  }

  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .neq("id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  return <StaffManagement members={members ?? []} />;
}
