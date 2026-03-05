"use client";

import { useActionState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(
    login,
    {}
  );

  return (
    <Card className="overflow-hidden pt-0 gap-0 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col items-center gap-2 bg-gradient-to-br from-[#15BDF0] to-[#1A75BC] px-6 py-8">
        <Image
          src="/icons/icon-192x192.png"
          alt="수오더 로고"
          width={96}
          height={96}
          priority
        />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">수오더</h1>
          <p className="mt-1 text-sm text-white/80">의약품 주문 및 검수 관리</p>
        </div>
      </div>
      <CardHeader className="text-center pt-4 pb-2">
        <CardDescription>로그인하여 시작하세요</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">이름</Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="이름"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
            />
            <p className="text-xs text-muted-foreground">숫자, 영문, 특수문자 조합 4자리 이상</p>
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="pt-2">
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "로그인 중..." : "로그인"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
