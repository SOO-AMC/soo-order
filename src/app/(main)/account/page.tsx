import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountPage } from "@/components/account/account-page";

export const metadata: Metadata = {
  title: "계정관리",
};

export default async function AccountRoute() {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", session.user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  return (
    <AccountPage
      profile={profile}
      isAdmin={profile.role === "admin"}
    />
  );
}
