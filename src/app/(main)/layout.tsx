import { BottomNav } from "@/components/bottom-nav";
import { AppSidebar } from "@/components/app-sidebar";
import { UploadIndicator } from "@/components/upload-indicator";
import { MainContent } from "@/components/main-content";
import { LayoutProviders } from "@/components/tab-counts-provider";
import { getSessionProfile } from "@/lib/supabase/server";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, userName, isAdmin } = await getSessionProfile();

  return (
    <LayoutProviders userId={userId ?? ""} userName={userName ?? ""} isAdmin={isAdmin}>
      <div className="flex min-h-dvh flex-col">
        <AppSidebar />
        <UploadIndicator />
        <MainContent>{children}</MainContent>
        <BottomNav />
      </div>
    </LayoutProviders>
  );
}
