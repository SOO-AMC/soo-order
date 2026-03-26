import Link from "next/link";
import { AdminGuard } from "@/components/admin-guard";

export const dynamic = "force-dynamic";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-50 border-b bg-background">
          <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
            <h1 className="text-lg font-semibold">관리자 페이지</h1>
            <Link
              href="/orders"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              메인으로 돌아가기
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-4xl p-4">{children}</main>
      </div>
    </AdminGuard>
  );
}
