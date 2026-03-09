import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { PriceComparePage } from "@/components/price-compare/price-compare-page";

export const metadata: Metadata = {
  title: "가격 비교",
};

export default async function PriceComparePageRoute() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  return <PriceComparePage />;
}
