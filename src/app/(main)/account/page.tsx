import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { AccountPage } from "@/components/account/account-page";

export const metadata: Metadata = {
  title: "계정관리",
};

export default async function AccountRoute() {
  const { userId, isAdmin, userName } = await getSessionProfile();
  if (!userId) redirect("/login");

  return (
    <AccountPage
      profile={{ id: userId, full_name: userName ?? "", role: isAdmin ? "admin" : "user" }}
      isAdmin={isAdmin}
    />
  );
}
