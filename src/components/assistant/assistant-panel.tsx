"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUp, ExternalLink, MessageCircleQuestion, SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { askAssistant } from "@/lib/actions/assistant-action";
import type { ToolSource } from "@/lib/assistant/tools";

/**
 * 물어보기 (관리자 전용 대화 창).
 * Ctrl J(맥 ⌘J)·사이드바 "물어보기" 버튼·모바일 맨 위 버튼으로 연다. 질문하면 서버(askAssistant)가 앱의 데이터를 조회해서 답한다.
 * - 조회만 한다 (발주·검수·수정은 못 한다).
 * - 답 아래에 근거가 된 화면 링크를 붙인다.
 * - 대화는 이 화면을 떠나도 남아 있고(레이아웃에 있다), 새로고침하면 지워진다.
 * - PC 에서는 창을 열어 둔 채 뒤 화면을 볼 수 있다(모달이 아니다).
 */

interface Message {
  role: "user" | "assistant";
  text: string;
  sources?: ToolSource[];
  error?: boolean;
}

const EXAMPLES = ["이번 달 얼마 썼어?", "지난달보다 오른 약품 뭐야?", "7일 넘게 안 들어온 주문 있어?", "메로페넴 마지막으로 언제 얼마에 샀어?"];

const AssistantContext = createContext<{ open: () => void; available: boolean }>({ open: () => {}, available: false });

export function useAssistant() {
  return useContext(AssistantContext);
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);

  // Ctrl J(맥 ⌘J)로 열고 닫는다 — 빠른 실행(Ctrl K) 바로 옆 글쇠
  useEffect(() => {
    if (!isAdmin) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAdmin]);

  const value = useMemo(() => ({ open, available: isAdmin }), [open, isAdmin]);
  return (
    <AssistantContext.Provider value={value}>
      {children}
      {isAdmin && <AssistantPanel open={isOpen} onOpenChange={setIsOpen} />}
    </AssistantContext.Provider>
  );
}

function AssistantPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  /** "새 대화"를 누른 뒤에 늦게 도착한 답을 버리기 위한 번호 */
  const conversation = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, open]);

  const send = async (textArg?: string) => {
    const q = (textArg ?? input).trim();
    if (!q || pending) return;
    const mine = conversation.current;
    const next: Message[] = [...messages, { role: "user", text: q }];
    setMessages(next);
    setInput("");
    setPending(true);
    let reply: Message;
    try {
      // 실패한 답(오류 문구)은 AI 에게 다시 보내지 않는다
      const r = await askAssistant(next.filter((m) => !m.error).map(({ role, text }) => ({ role, text })));
      reply = r.ok ? { role: "assistant", text: r.answer, sources: r.sources } : { role: "assistant", text: r.error, error: true };
    } catch {
      reply = { role: "assistant", text: "답을 받지 못했어요. 연결을 확인하고 다시 물어봐 주세요.", error: true };
    }
    if (mine !== conversation.current) return;
    setMessages((m) => [...m, reply]);
    setPending(false);
    inputRef.current?.focus();
  };

  const reset = () => {
    conversation.current += 1;
    setMessages([]);
    setPending(false);
    setInput("");
    inputRef.current?.focus();
  };

  /** 좁은 화면에서는 창이 화면을 다 덮으므로 근거 화면으로 갈 때 닫는다 */
  const closeIfNarrow = () => {
    if (window.matchMedia("(max-width: 1023px)").matches) onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        className="w-full gap-0 border-border bg-card p-0 sm:max-w-[420px] print:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border pl-4 pr-12">
          <MessageCircleQuestion className="size-[18px] text-primary" aria-hidden="true" />
          <SheetTitle className="text-[15px] font-semibold">물어보기</SheetTitle>
          <SheetDescription className="sr-only">약품 구매에 대해 물어보면 앱의 데이터를 조회해서 답해요. 조회만 할 수 있어요.</SheetDescription>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="ml-auto flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <SquarePen className="size-3.5" aria-hidden="true" />새 대화
            </button>
          )}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
          {messages.length === 0 && (
            <div className="space-y-4 pt-2">
              <p className="text-sm leading-relaxed text-subtle-foreground">
                지출, 약품 가격, 주문에 대해 물어보세요. 앱에 있는 데이터를 찾아서 답해요.
              </p>
              <div className="space-y-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => send(ex)}
                    className="block w-full rounded-xl px-3.5 py-2.5 text-left text-sm font-medium ring-1 ring-border transition-colors hover:bg-muted"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">{m.text}</p>
              </div>
            ) : (
              <div key={i} className="space-y-2">
                <p
                  className={cn(
                    "max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm leading-relaxed",
                    m.error ? "bg-status-ask-bg text-status-ask" : "bg-muted text-foreground",
                  )}
                >
                  {m.text}
                </p>
                {m.sources && m.sources.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">근거</span>
                    {m.sources.map((s) => (
                      <Link
                        key={s.href}
                        href={s.href}
                        onClick={closeIfNarrow}
                        className="inline-flex max-w-full items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-subtle-foreground hover:text-primary"
                      >
                        <span className="truncate">{s.label}</span>
                        <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}

          {pending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              찾아보는 중이에요…
            </p>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="shrink-0 border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="flex items-end gap-2 rounded-xl bg-card p-1.5 shadow-[inset_0_0_0_1px_var(--input)] focus-within:shadow-[inset_0_0_0_2px_var(--primary)]">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // 한글 조합 중의 Enter 는 보내지 않는다 (글자가 두 번 들어가는 것을 막는다)
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              maxLength={1000}
              placeholder="예: 이번 달 vs팜에 얼마 썼어?"
              aria-label="질문"
              className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label="질문 보내기"
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">조회만 해요. 숫자는 답 아래 근거 화면에서 확인해 주세요.</p>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** 사이드바 "물어보기" (관리자만 보인다) */
export function AskButton() {
  const { open, available } = useAssistant();
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={open}
      className="mb-2 flex h-[34px] w-full items-center gap-2 rounded-lg bg-card px-2.5 text-[13px] text-muted-foreground shadow-[0_0_0_1px_var(--sidebar-border)] transition-colors hover:text-foreground"
    >
      <MessageCircleQuestion className="size-[15px]" aria-hidden="true" />
      물어보기
      <kbd className="ml-auto rounded bg-secondary px-1.5 py-px font-mono text-xs text-subtle-foreground">Ctrl J</kbd>
    </button>
  );
}

/** 모바일 맨 위 검색 버튼 옆의 "물어보기" (관리자만 보인다) */
export function MobileAskButton() {
  const { open, available } = useAssistant();
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={open}
      aria-label="물어보기"
      className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-muted-foreground shadow-[inset_0_0_0_1px_var(--input)]"
    >
      <MessageCircleQuestion className="size-4" aria-hidden="true" />
    </button>
  );
}
