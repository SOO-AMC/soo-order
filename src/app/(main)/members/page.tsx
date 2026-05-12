import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { StaffManagement } from "@/components/account/staff-management";
import { fetchMembers, type MemberData } from "@/lib/actions/members-action";

export const metadata: Metadata = {
  title: "직원 관리",
};

export default async function MembersPage() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  let initialMembers: MemberData[] | undefined;
  try {
    initialMembers = await fetchMembers();
  } catch {
    // 실패 시 클라이언트가 다시 fetch
  }

  return <StaffManagement initialMembers={initialMembers} />;
}
