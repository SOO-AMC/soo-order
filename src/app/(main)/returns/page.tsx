import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReturnList } from "@/components/returns/return-list";
import type { OrderWithRequester } from "@/lib/types/order";

export const metadata: Metadata = {
  title: "반품",
};

export default async function ReturnsPage() {
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
        "*, requester:profiles!requester_id(full_name), return_requester:profiles!return_requested_by(full_name)"
      )
      .eq("status", "return_requested")
      .order("return_requested_at", { ascending: false }),
  ]);

  const isAdmin = profile?.role === "admin";

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-background/95 backdrop-blur-sm px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">반품</h1>
      </header>
      <div className="p-4">
        <ReturnList
          isAdmin={isAdmin}
          currentUserId={userId}
          initialData={(orders as OrderWithRequester[]) ?? []}
        />
      </div>
    </div>
  );
}
