import { BottomNav } from "@/components/bottom-nav";
import { AuthGuard } from "@/components/auth-guard";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex min-h-dvh flex-col">
        <main className="flex-1 overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)]">
          <div className="animate-page-enter">{children}</div>
        </main>
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
