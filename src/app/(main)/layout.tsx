import { BottomNav } from "@/components/bottom-nav";
import { AppSidebar } from "@/components/app-sidebar";
import { UploadIndicator } from "@/components/upload-indicator";
import { MainContent } from "@/components/main-content";
import { LayoutProviders } from "@/components/tab-counts-provider";
import { CommandPaletteProvider } from "@/components/workspace/command-palette";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, userName, isAdmin, role, position } = await getSessionProfile();
  // 세미나실 화면 전용 계정은 주문·관리 화면에 들어오지 못하고 라운딩 화면으로만 간다
  if (role === "display") redirect("/briefing/rounding");

  return (
    <LayoutProviders
      userId={userId ?? ""}
      userName={userName ?? ""}
      isAdmin={isAdmin}
      role={role}
      position={position}
    >
      <CommandPaletteProvider>
      <div className="flex min-h-dvh flex-col">
        <AppSidebar />
        <UploadIndicator />
        <MainContent>{children}</MainContent>
        <BottomNav />
      </div>
      </CommandPaletteProvider>
    </LayoutProviders>
  );
}
