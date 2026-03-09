import type { Metadata } from "next";
import { StaffManagement } from "@/components/account/staff-management";

export const metadata: Metadata = {
  title: "직원 관리",
};

export default function MembersPage() {
  return <StaffManagement />;
}
