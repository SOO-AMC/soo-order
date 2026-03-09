import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { StaffManagement } from "@/components/account/staff-management";

export const metadata: Metadata = {
  title: "직원 관리",
};

export default async function MembersPage() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  return <StaffManagement />;
}
