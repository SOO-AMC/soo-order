"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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

const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  user: "일반 사용자",
};

export function AccountPage() {
  const { userId, userName, isAdmin } = useAuth();
  const profile = { id: userId, full_name: userName, role: isAdmin ? "admin" : "user" };
  const [state, formAction, isPending] = useActionState<
    ChangePasswordState,
    FormData
  >(changePassword, {});

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-card px-4 py-3 shadow-header">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild className="lg:hidden">
            <Link href="/more">
              <ChevronLeft />
            </Link>
          </Button>
          <h1 className="text-lg font-bold">계정관리</h1>
        </div>
      </header>

      <div className="p-4 space-y-4">
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
      </div>
    </div>
  );
}
