import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { MorePage } from "@/components/more/more-page";

export const metadata: Metadata = {
  title: "더보기",
};

export default async function MorePageRoute() {
  const { userId, isAdmin, userName } = await getSessionProfile();
  if (!userId) redirect("/login");

  return <MorePage profile={{ id: userId, full_name: userName ?? "", role: isAdmin ? "admin" : "user" }} isAdmin={isAdmin} />;
}
