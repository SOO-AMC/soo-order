"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Users, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  changePassword,
  type ChangePasswordState,
} from "@/app/(main)/account/actions";

interface AccountPageProps {
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

export function AccountPage({ profile, isAdmin }: AccountPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [state, formAction, isPending] = useActionState<
    ChangePasswordState,
    FormData
  >(changePassword, {});

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">계정관리</h1>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-1" />
          로그아웃
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">내 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">이름</span>
            <span className="font-medium">{profile.full_name}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">권한</span>
            <Badge variant={isAdmin ? "default" : "secondary"}>
              {ROLE_LABEL[profile.role] ?? profile.role}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">비밀번호 변경</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="newPassword">새 비밀번호</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                placeholder="4자 이상"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">비밀번호 확인</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
              />
            </div>
            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            {state.success && (
              <p className="text-sm text-green-600">
                비밀번호가 변경되었습니다.
              </p>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "변경 중..." : "변경하기"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isAdmin && (
        <Link href="/account/members">
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <span className="font-medium">직원 관리</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}
    </div>
  );
}
