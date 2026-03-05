import { BottomNav } from "@/components/bottom-nav";
import { AppSidebar } from "@/components/app-sidebar";
import { UploadIndicator } from "@/components/upload-indicator";
import { MainContent } from "@/components/main-content";
import { LayoutProviders } from "@/components/tab-counts-provider";
import { createClient } from "@/lib/supabase/server";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let isAdmin = false;
  if (session) {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    isAdmin = data?.role === "admin";
  }

  return (
    <LayoutProviders isAdmin={isAdmin}>
      <div className="flex min-h-dvh flex-col">
        <AppSidebar />
        <UploadIndicator />
        <MainContent>{children}</MainContent>
        <BottomNav />
      </div>
    </LayoutProviders>
  );
}
