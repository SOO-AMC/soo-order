import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { VendorAdminPage } from "@/components/vendors/vendor-admin-page";

export const metadata: Metadata = {
  title: "업체 관리",
};

export default async function VendorsPageRoute() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  return <VendorAdminPage />;
}
