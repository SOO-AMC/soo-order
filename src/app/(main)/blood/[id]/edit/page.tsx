export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { BloodEditPage } from "@/components/blood/blood-edit-page";

export default async function BloodEditServerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, isAdmin } = await getSessionProfile();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data: record } = await supabase
    .from("blood_records")
    .select("*")
    .eq("id", id)
    .single();

  if (!record) notFound();

  if (!isAdmin && record.created_by !== userId) redirect(`/blood/${id}`);

  return <BloodEditPage record={record} />;
}
