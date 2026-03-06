import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { InspectionList } from "@/components/inspection/inspection-list";

export const metadata: Metadata = {
  title: "검수",
};

export default async function InspectionPage() {
  const { userId, isAdmin } = await getSessionProfile();
  if (!userId) redirect("/login");

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-background/95 backdrop-blur-sm px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">검수</h1>
      </header>
      <div className="p-4">
        <InspectionList
          isAdmin={isAdmin}
          currentUserId={userId}
        />
      </div>
    </div>
  );
}
