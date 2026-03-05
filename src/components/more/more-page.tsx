"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart3, ChevronRight, LogOut, Scale, UserCog, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface MorePageProps {
  profile: {
    id: string;
    full_name: string;
    role: string;
  };
  isAdmin: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  user: "일반 사용자",
};

export function MorePage({ profile, isAdmin }: MorePageProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-background px-4 py-3">
        <h1 className="text-lg font-bold">더보기</h1>
      </header>

      <div className="flex min-h-[calc(100dvh-3.25rem-3.5rem-env(safe-area-inset-bottom))] flex-col p-4 lg:min-h-[calc(100dvh-3.25rem)]">
        <div className="space-y-4">
          {/* 사용자 정보 */}
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                  {profile.full_name?.charAt(0) ?? "?"}
                </div>
                <div>
                  <p className="font-medium">{profile.full_name}</p>
                  <Badge
                    variant={isAdmin ? "default" : "secondary"}
                    className="mt-0.5"
                  >
                    {ROLE_LABEL[profile.role] ?? profile.role}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 메뉴 */}
          <Card className="py-0 gap-0">
            <CardContent className="divide-y p-0">
              <Link
                href="/account"
                className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-accent/50"
              >
                <div className="flex items-center gap-3">
                  <UserCog className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">내 계정관리</span>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>

          {/* 관리자 전용 메뉴 */}
          {isAdmin && (
            <>
              <p className="px-1 text-xs font-semibold text-muted-foreground/70">관리자 전용</p>
              <Card className="py-0 gap-0">
                <CardContent className="divide-y p-0">
                  <Link
                    href="/dashboard"
                    className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex items-center gap-3">
                      <BarChart3 className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">대시보드</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                  <Link
                    href="/price-compare"
                    className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex items-center gap-3">
                      <Scale className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">가격 비교</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                  <Link
                    href="/account/members"
                    className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">직원 관리</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* 로그아웃 - 하단 고정 */}
        <div className="mt-auto pt-4">
          <Separator className="mb-4" />
          <Button
            variant="outline"
            className="w-full text-destructive hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </Button>
        </div>
      </div>
    </div>
  );
}
