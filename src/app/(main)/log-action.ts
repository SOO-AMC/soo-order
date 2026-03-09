"use server";

import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/utils/activity-log";

export async function logClientAction(
  category: "auth" | "order" | "dispatch" | "inspection" | "return" | "account" | "price" | "blood",
  action: string,
  description: string,
  metadata?: Record<string, unknown>
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", session.user.id)
    .single();

  await logActivity({
    userId: session.user.id,
    userName: profile?.full_name ?? "알 수 없음",
    category,
    action,
    description,
    metadata,
  });
}
