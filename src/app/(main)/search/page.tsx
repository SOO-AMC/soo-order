import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/server";
import { SearchList } from "@/components/search/search-list";

export const metadata: Metadata = {
  title: "조회",
};

export default async function SearchPage() {
  const { userId, isAdmin } = await getSessionProfile();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("is_active", true)
    .order("full_name");

  const personNames = (profiles ?? [])
    .map((p) => p.full_name)
    .filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <SearchList
        isAdmin={isAdmin}
        currentUserId={userId}
        personNames={personNames}
      />
    </div>
  );
}
