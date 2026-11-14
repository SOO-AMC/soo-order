/**
 * 화면 모드(라이트/다크/시스템) 공용 상수.
 * "use client"가 아니므로 서버 레이아웃(app/layout.tsx)에서도 THEME_INIT_SCRIPT를 쓸 수 있다.
 * 기본값은 라이트(예전과 같음). 고른 값은 기기마다 localStorage에 남는다.
 */
export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "soo-theme";

/** 휴대폰 상단 상태바 색(meta theme-color) */
export const THEME_BAR_COLOR = { light: "#1166A7", dark: "#0b1118" } as const;

export const THEME_LABEL: Record<ThemeMode, string> = {
  light: "라이트",
  dark: "다크",
  system: "시스템",
};

/**
 * 첫 화면을 그리기 전에 실행 — 다크를 고른 사람이 새로고침할 때 하얗게 번쩍이지 않게.
 * (React 코드와 같은 규칙: dark | system만 인정, 나머지는 light)
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem("${THEME_STORAGE_KEY}");if(m!=="dark"&&m!=="system")m="light";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;if(d)e.classList.add("dark");e.style.colorScheme=d?"dark":"light";}catch(_){}})();`;
