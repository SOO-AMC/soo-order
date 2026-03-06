import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { SearchList } from "@/components/search/search-list";
import { fetchPersonNames } from "@/lib/actions/search-action";

export const metadata: Metadata = {
  title: "조회",
};

export default async function SearchPage() {
  const { userId, isAdmin } = await getSessionProfile();
  if (!userId) redirect("/login");

  const personNames = await fetchPersonNames();

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <SearchList
        isAdmin={isAdmin}
        personNames={personNames}
      />
    </div>
  );
}
