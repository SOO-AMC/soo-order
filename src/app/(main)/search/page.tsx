import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SearchList } from "@/components/search/search-list";
import { parseSearchParams } from "@/lib/utils/search-params";
import { fetchSearchOrders } from "@/lib/queries/search-orders";

export const metadata: Metadata = {
  title: "조회",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseSearchParams(params);

  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const userId = session.user.id;

  const [{ data: profile }, { orders, totalCount }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single(),
      fetchSearchOrders(supabase, filters),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("is_active", true)
        .order("full_name"),
    ]);

  const isAdmin = profile?.role === "admin";
  const personNames = (profiles ?? [])
    .map((p) => p.full_name)
    .filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <SearchList
        isAdmin={isAdmin}
        currentUserId={userId}
        initialData={orders}
        totalCount={totalCount}
        filters={filters}
        personNames={personNames}
      />
    </div>
  );
}
