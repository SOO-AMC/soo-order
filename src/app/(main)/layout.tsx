import { BottomNav } from "@/components/bottom-nav";
import { AppSidebar } from "@/components/app-sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] lg:pl-60 lg:pb-0">
        <div className="animate-page-enter">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
