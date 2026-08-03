import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { InvoiceScanPage } from "@/components/invoice-scan/invoice-scan-page";

export const metadata: Metadata = {
  title: "명세서 스캔",
};

export default async function InvoiceScanPageRoute() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  return <InvoiceScanPage />;
}
