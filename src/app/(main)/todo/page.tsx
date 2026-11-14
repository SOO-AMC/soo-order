import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { fetchTodoAlerts } from "@/lib/actions/todo-action";
import { TodoPage } from "@/components/todo/todo-page";
import type { AlertsData } from "@/lib/types/dashboard";

export const metadata: Metadata = {
  title: "처리할 일",
};

export default async function TodoRoute() {
  const { isAdmin } = await getSessionProfile();
  if (!isAdmin) redirect("/dashboard");

  let initialAlerts: AlertsData | undefined;
  try {
    initialAlerts = await fetchTodoAlerts();
  } catch {
    // 실패하면 클라이언트가 다시 불러온다
  }
  return <TodoPage initialAlerts={initialAlerts} />;
}
