import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { fetchLoginVideoSetting } from "@/lib/actions/app-settings-actions";
import { AppSettingsPage } from "@/components/settings/app-settings-page";

export const metadata: Metadata = { title: "앱 설정" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");
  const loginVideo = await fetchLoginVideoSetting();
  return <AppSettingsPage loginVideo={loginVideo} />;
}
