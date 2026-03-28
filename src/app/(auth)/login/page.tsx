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

function LoginForm({ isPending, state }: { isPending: boolean; state: LoginState }) {
  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">이름</Label>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="이름을 입력하세요"
            required
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="비밀번호를 입력하세요"
            required
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">숫자, 영문, 특수문자 조합 4자리 이상</p>
        </div>
        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
      </div>
      <Button
        type="submit"
        className="w-full h-11 mt-6 rounded-full text-white shadow-md"
        disabled={isPending}
      >
        {isPending ? "로그인 중..." : "로그인"}
      </Button>
    </>
  );
}

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(
    login,
    {}
  );

  return (
    <>
      {/* 모바일: 풀스크린 */}
      <div className="flex flex-1 flex-col lg:hidden animate-in fade-in-0 duration-700">
        {/* 상단: 로고 + 브랜드 */}
        <div className="relative flex flex-col items-center pt-16 pb-10 px-6 overflow-hidden">
          {/* 배경 장식 원형들 */}
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10" />
          <div className="absolute -top-6 -left-10 w-36 h-36 rounded-full bg-white/10" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-white/5" />

          {/* 로고 */}
          <div className="relative z-10 flex items-center justify-center w-24 h-24 rounded-2xl bg-white shadow-2xl shadow-black/30 animate-in zoom-in-75 duration-500">
            <Image
              src="/icons/logo.png"
              alt="수오더 로고"
              width={72}
              height={72}
              priority
            />
          </div>

          {/* 텍스트 */}
          <h1 className="relative z-10 mt-5 text-3xl font-extrabold text-white tracking-tight animate-in slide-in-from-bottom-2 duration-500 delay-100">수오더</h1>
          <p className="relative z-10 mt-1.5 text-sm text-white/70 animate-in slide-in-from-bottom-2 duration-500 delay-150">SOO Animal Medical Center</p>

          {/* 하단 구분선 장식 */}
          <div className="relative z-10 mt-6 flex items-center gap-2">
            <div className="w-8 h-px bg-white/30" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
            <div className="w-8 h-px bg-white/30" />
          </div>
        </div>

        {/* 하단: 폼 영역 (흰색 라운드) */}
        <div className="flex-1 rounded-t-3xl bg-white px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-[0_-8px_32px_rgba(0,0,0,0.15)]">
          <p className="text-sm text-muted-foreground mb-6">로그인하여 시작하세요</p>
          <form action={formAction}>
            <LoginForm isPending={isPending} state={state} />
          </form>
        </div>
      </div>

      {/* PC: 플랫 폼 스타일 */}
      <div className="hidden lg:block animate-in fade-in-0 duration-500">
        <div className="mb-8">
          <Image
            src="/icons/logo.png"
            alt="수오더 로고"
            width={48}
            height={48}
            priority
            className="mb-4"
          />
          <h2 className="text-2xl font-bold text-foreground">환영합니다</h2>
          <p className="mt-1 text-sm text-muted-foreground">로그인하여 시작하세요</p>
        </div>
        <form action={formAction}>
          <LoginForm isPending={isPending} state={state} />
        </form>
      </div>
    </>
  );
}
