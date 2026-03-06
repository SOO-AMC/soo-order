import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { ReturnList } from "@/components/returns/return-list";

export const metadata: Metadata = {
  title: "반품",
};

export default async function ReturnsPage() {
  const { userId, isAdmin } = await getSessionProfile();
  if (!userId) redirect("/login");

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-background/95 backdrop-blur-sm px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">반품</h1>
      </header>
      <div className="p-4">
        <ReturnList
          isAdmin={isAdmin}
          currentUserId={userId}
          initialData={[]}
        />
      </div>
    </div>
  );
}
