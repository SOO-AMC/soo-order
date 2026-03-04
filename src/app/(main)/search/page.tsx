import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SearchList } from "@/components/search/search-list";
import type { OrderWithRequester } from "@/lib/types/order";

export const metadata: Metadata = {
  title: "조회",
};

export default async function SearchPage() {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const userId = session.user.id;

  const [{ data: profile }, { data: orders }] = await Promise.all([
    supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single(),
    supabase
      .from("orders")
      .select(
        "*, requester:profiles!requester_id(full_name), updater:profiles!updated_by(full_name), inspector:profiles!inspected_by(full_name)"
      )
      .order("created_at", { ascending: false }),
  ]);

  const isAdmin = profile?.role === "admin";

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <SearchList
        isAdmin={isAdmin}
        currentUserId={userId}
        initialData={(orders as OrderWithRequester[]) ?? []}
      />
    </div>
  );
}
