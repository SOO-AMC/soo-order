"use client";

import { useEffect, useRef } from "react";

/**
 * 목록 화면 단축키 (PC). 키 이름은 e.code 기준이라 한글 입력 상태에서도 J·K·X 가 그대로 먹는다.
 *
 * 안 먹는 때 (실수로 처리되지 않게):
 *  - 글자를 쓰는 중 (input·textarea·select·contenteditable)
 *  - 대화상자·팝오버가 열려 있을 때 ([role=dialog|alertdialog] — 상세 패널은 대화상자가 아니라 괜찮다)
 *  - Alt 를 같이 눌렀을 때, 또는 Ctrl/⌘ 조합이 아닌 키에 Ctrl/⌘ 를 같이 눌렀을 때 (브라우저 단축키와 겹치지 않게)
 *  - 버튼·체크박스에 초점이 있을 때의 Space·Enter (그 버튼을 누르는 브라우저 동작에 맡긴다)
 *  - 키를 꾹 누르고 있을 때의 반복 입력 — repeat: true 로 둔 키(이동)만 반복된다
 *
 * 키 이름: "KeyJ", "Space", "Digit1", "Enter", "Escape", "Slash" … 앞에 "mod+"(Ctrl 또는 ⌘), "shift+" 를 붙인다.
 */
export type Shortcut = { run: (e: KeyboardEvent) => void; repeat?: boolean };
export type ShortcutMap = Record<string, Shortcut | ((e: KeyboardEvent) => void) | undefined | false>;

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

export function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || TYPING.test(t.tagName));
}

function isPressable(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t || t === document.body) return false;
  return !!t.closest?.('button, a[href], [role="button"], [role="checkbox"], [role="menuitem"], [role="option"], [role="tab"], summary');
}

export function overlayOpen(): boolean {
  return !!document.querySelector('[role="dialog"], [role="alertdialog"]');
}

export function comboOf(e: KeyboardEvent): string {
  return `${e.ctrlKey || e.metaKey ? "mod+" : ""}${e.shiftKey ? "shift+" : ""}${e.code}`;
}

export function useShortcuts(map: ShortcutMap, enabled = true) {
  // 매 렌더마다 최신 처리기를 쓰되, 이벤트는 한 번만 단다
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || isTypingTarget(e.target) || overlayOpen()) return;
      const combo = comboOf(e);
      const entry = ref.current[combo];
      if (!entry) return;
      if ((e.code === "Space" || e.code === "Enter") && !combo.startsWith("mod+") && isPressable(e.target)) return;
      const sc = typeof entry === "function" ? { run: entry } : entry;
      e.preventDefault();
      if (e.repeat && !sc.repeat) return;
      sc.run(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
