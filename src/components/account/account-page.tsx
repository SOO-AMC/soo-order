"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { ThemeModeSegmented } from "@/components/theme-toggle";
import { BackButton } from "@/components/back-button";
import { ROLE_LABEL, POSITION_LABEL, type Role, type Position } from "@/lib/types/member";
import { changePassword, type ChangePasswordState } from "@/app/(main)/account/actions";
import { NaverWorksLinkSection } from "@/components/account/naverworks-link";

/** 내 계정: 내 정보 + 비밀번호 바꾸기 */
export function AccountPage() {
  const { userName, role, position } = useAuth();
  const [state, formAction, isPending] = useActionState<ChangePasswordState, FormData>(changePassword, {});
  const [show, setShow] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // 바꾸기에 성공하면 입력칸을 비운다
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  const roleText = ROLE_LABEL[role as Role] ?? role;
  const positionText = position ? POSITION_LABEL[position as Position] ?? position : null;

  return (
    <>
      <PageHeader
        title="내 계정"
        leading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
      />

      <div className="mx-auto max-w-md md:max-w-2xl flex flex-col gap-3 p-4 lg:px-6">
        {/* 내 정보 */}
        <section className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <div className="flex items-center gap-3.5">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary/10 text-xl font-bold text-primary">
              {userName?.charAt(0) ?? "?"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xl font-extrabold tracking-tight">{userName}</p>
              <p className="text-[13px] text-muted-foreground">이름으로 로그인해요</p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4">
            <div>
              <dt className="text-xs text-muted-foreground">권한</dt>
              <dd className="mt-0.5 text-[15px] font-medium">{roleText}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">직책</dt>
              <dd className="mt-0.5 text-[15px] font-medium">{positionText ?? <span className="text-muted-foreground">없음</span>}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[13px] text-muted-foreground">이름·권한·직책은 관리자가 직원 관리에서 바꿔요.</p>
        </section>

        {/* 화면 모드 */}
        <NaverWorksLinkSection />

        <section className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <h2 className="text-lg font-extrabold tracking-tight">화면 모드</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">이 기기에서만 바뀌어요. 시스템은 휴대폰·PC 설정을 따라가요.</p>
          <ThemeModeSegmented className="mt-4" />
        </section>

        {/* 비밀번호 바꾸기 */}
        <section className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <h2 className="text-lg font-extrabold tracking-tight">비밀번호 바꾸기</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">숫자·영문·특수문자 조합 4자리 이상</p>

          <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-3">
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-subtle-foreground">새 비밀번호</span>
              <div className="relative">
                <Input
                  id="newPassword"
                  name="newPassword"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className="h-11 pr-11 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
                  className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-subtle-foreground">한 번 더</span>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                required
                className="h-11 text-base"
              />
            </label>

            {state.error && (
              <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
                {state.error}
              </p>
            )}
            {state.success && (
              <p role="status" className="flex items-center gap-2 rounded-lg bg-status-done-bg px-3 py-2.5 text-sm font-medium text-status-done">
                <CheckCircle2 className="size-4" />
                비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.
              </p>
            )}

            <Button type="submit" className="mt-1 h-11 w-full rounded-xl text-base font-bold" disabled={isPending}>
              {isPending ? "바꾸는 중…" : "비밀번호 바꾸기"}
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}
