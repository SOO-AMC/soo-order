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
import { NW_ERROR_TEXT } from "@/lib/naverworks/errors";

/** 네이버웍스로 로그인 버튼 + 돌아온 결과 안내 */
function NaverWorksLogin({ enabled, next, error }: { enabled: boolean; next: string; error: string | null }) {
  const text = error ? NW_ERROR_TEXT[error] ?? NW_ERROR_TEXT.failed : null;
  if (!enabled && !text) return null;
  return (
    <div className="mt-5">
      {text && <p role="alert" className="mb-3 rounded-lg bg-status-ask-bg px-3 py-2.5 text-[13px] font-medium leading-5 text-status-ask">{text}</p>}
      {enabled && (
        <>
          <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            또는
            <span className="h-px flex-1 bg-border" />
          </div>
          {/* 네이버웍스 로그인 화면으로 갔다가 돌아오는 이동이라 일반 링크(a)를 쓴다.
              위 이름 칸에 이름이 적혀 있으면 같이 보낸다 → 네이버웍스 로그인 화면에 그 사람의 아이디가 미리 채워진다 */}
          <a
            href={`/auth/naverworks/start?next=${encodeURIComponent(next)}`}
            onClick={(e) => {
              const box = e.currentTarget.closest("[data-login-box]");
              const name = box?.querySelector<HTMLInputElement>('input[name="name"]')?.value.trim();
              if (name) e.currentTarget.href = `/auth/naverworks/start?next=${encodeURIComponent(next)}&name=${encodeURIComponent(name)}`;
            }}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#00c73c] text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90"
          >
            네이버웍스로 로그인
          </a>
          <p className="mt-2.5 text-center text-xs leading-5 text-muted-foreground">
            네이버웍스 아이디를 몰라도 돼요.
            <br />
            위 <b className="font-semibold text-foreground">이름</b> 칸에 이름만 적고 누르면 아이디가 채워져요.
          </p>
        </>
      )}
    </div>
  );
}

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
        className="w-full h-11 mt-6 rounded-full shadow-md"
        disabled={isPending}
      >
        {isPending ? "로그인 중..." : "로그인"}
      </Button>
    </>
  );
}

/**
 * 로그인 화면.
 * nwEnabled: 서버에 네이버웍스 앱 값이 있으면 "네이버웍스로 로그인" 버튼을 보여 준다.
 * next: 로그인 뒤 돌아갈 곳(예: 네이버웍스 알림의 링크 → /briefing). nwError: 네이버웍스에서 돌아온 결과 코드.
 */
export function LoginView({ nwEnabled, next, nwError }: { nwEnabled: boolean; next: string; nwError: string | null }) {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(
    login,
    {}
  );
  const nw = <NaverWorksLogin enabled={nwEnabled} next={next} error={nwError} />;

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

          {/* 로고 (다크 바탕용 가로형) */}
          <h1 className="relative z-10 m-0 animate-in zoom-in-75 duration-500">
            <Image
              src="/sooorder-brand/logo-horizontal-on-dark.webp"
              alt="수오더"
              width={1231}
              height={440}
              priority
              className="h-16 w-auto"
            />
          </h1>

          <p className="relative z-10 mt-3 text-sm text-white/75 animate-in slide-in-from-bottom-2 duration-500 delay-150">SOO Animal Medical Center</p>

          {/* 하단 구분선 장식 */}
          <div className="relative z-10 mt-6 flex items-center gap-2">
            <div className="w-8 h-px bg-white/30" />
            <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
            <div className="w-8 h-px bg-white/30" />
          </div>
        </div>

        {/* 하단: 폼 영역 (흰색 라운드) */}
        <div data-login-box className="flex-1 rounded-t-3xl bg-card px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-[0_-8px_32px_rgba(0,0,0,0.15)]">
          <p className="text-sm text-muted-foreground mb-6">로그인하여 시작하세요</p>
          <form action={formAction}>
            <input type="hidden" name="next" value={next} />
            <LoginForm isPending={isPending} state={state} />
          </form>
          {nw}
        </div>
      </div>

      {/* PC: 플랫 폼 스타일 */}
      <div data-login-box className="hidden lg:block animate-in fade-in-0 duration-500">
        <div className="mb-8">
          <Image
            src="/sooorder-brand/logo-horizontal.webp"
            alt="수오더"
            width={1231}
            height={440}
            priority
            className="mb-6 h-10 w-auto dark:hidden"
          />
          <Image
            src="/sooorder-brand/logo-horizontal-on-dark.webp"
            alt="수오더"
            width={1231}
            height={440}
            className="mb-6 hidden h-10 w-auto dark:block"
          />
          <h2 className="text-2xl font-bold text-foreground">환영합니다</h2>
          <p className="mt-1 text-sm text-muted-foreground">로그인하여 시작하세요</p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="next" value={next} />
          <LoginForm isPending={isPending} state={state} />
        </form>
        {nw}
      </div>
    </>
  );
}
