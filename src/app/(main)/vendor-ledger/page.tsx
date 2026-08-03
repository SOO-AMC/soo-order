import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { VendorLedgerPage } from "@/components/vendor-ledger/vendor-ledger-page";

export const metadata: Metadata = {
  title: "거래처원장",
};

export default async function VendorLedgerPageRoute() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  return <VendorLedgerPage />;
}
