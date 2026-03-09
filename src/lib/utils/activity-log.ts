import { createAdminClient } from "@/lib/supabase/admin";

interface LogParams {
  userId: string;
  userName: string;
  category: "auth" | "order" | "dispatch" | "inspection" | "return" | "account" | "price" | "blood";
  action: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(params: LogParams): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("activity_logs").insert({
      user_id: params.userId,
      user_name: params.userName,
      category: params.category,
      action: params.action,
      description: params.description,
      metadata: params.metadata ?? {},
    });
  } catch {
    console.error("Failed to log activity:", params.action);
  }
}
