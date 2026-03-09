"use server";

import { requireUser } from "@/lib/supabase/server";
import { logActivity } from "@/lib/utils/activity-log";

export async function logClientAction(
  category: "auth" | "order" | "dispatch" | "inspection" | "return" | "account" | "price" | "blood",
  action: string,
  description: string,
  metadata?: Record<string, unknown>
) {
  const { supabase, userId } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();

  await logActivity({
    userId,
    userName: profile?.full_name ?? "알 수 없음",
    category,
    action,
    description,
    metadata,
  });
}
