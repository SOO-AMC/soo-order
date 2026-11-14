import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { fetchBriefingSettings } from "@/lib/actions/briefing-publish-actions";
import { BriefingSettings } from "@/components/briefing/admin/briefing-settings";

export const metadata: Metadata = { title: "논문 브리핑 설정" };
export const dynamic = "force-dynamic";

export default async function BriefingSettingsPage() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");
  const data = await fetchBriefingSettings().catch(() => null);
  return <BriefingSettings data={data} />;
}
