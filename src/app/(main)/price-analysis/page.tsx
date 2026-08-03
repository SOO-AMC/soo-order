import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { PriceAnalysisPage } from "@/components/price-analysis/price-analysis-page";

export const metadata: Metadata = {
  title: "단가 분석",
};

export default async function PriceAnalysisPageRoute() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  return <PriceAnalysisPage />;
}
