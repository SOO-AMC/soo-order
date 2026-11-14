"use client";

import { useSyncExternalStore } from "react";
import { THEME_BAR_COLOR, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme";

/**
 * 화면 모드 저장소. html.dark 클래스로 다크를 켠다(globals.css의 .dark 토큰).
 * - 고른 값: localStorage(기기별). 다른 탭에서 바꾸면 storage 이벤트로 따라 바뀐다.
 * - 시스템: 휴대폰·PC 설정이 바뀌면 바로 따라간다.
 */
const listeners = new Set<() => void>();
let mqlBound = false;

function readMode(): ThemeMode {
  try {
    const m = localStorage.getItem(THEME_STORAGE_KEY);
    return m === "dark" || m === "system" ? m : "light";
  } catch {
    return "light";
  }
}

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && systemDark());
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  el.style.colorScheme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? THEME_BAR_COLOR.dark : THEME_BAR_COLOR.light);
}

function notify() {
  listeners.forEach((l) => l());
}

export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // 저장이 막힌 브라우저(사생활 보호 모드 등)에서도 지금 화면에는 적용
  }
  applyTheme(mode);
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!mqlBound && typeof window !== "undefined") {
    mqlBound = true;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (readMode() === "system") {
        applyTheme("system");
        notify();
      }
    });
    window.addEventListener("storage", (e) => {
      if (e.key === THEME_STORAGE_KEY) {
        applyTheme(readMode());
        notify();
      }
    });
    // 첫 연결 때 상태바 색도 맞춘다(초기 스크립트는 meta보다 먼저 돌 수 있음)
    applyTheme(readMode());
  }
  return () => {
    listeners.delete(cb);
  };
}

const isDarkNow = () => document.documentElement.classList.contains("dark");

export function useTheme() {
  const mode = useSyncExternalStore(subscribe, readMode, () => "light" as ThemeMode);
  const dark = useSyncExternalStore(subscribe, isDarkNow, () => false);
  return {
    /** 고른 값 */
    mode,
    /** 지금 실제로 어두운지(시스템일 때 포함) */
    dark,
    setMode: setThemeMode,
    /** 한 번 누르면 라이트 ↔ 다크 */
    toggle: () => setThemeMode(dark ? "light" : "dark"),
  };
}
