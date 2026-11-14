"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock, LogOut, Maximize, Minimize, Pause, Play, Repeat, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PaperCard } from "@/components/briefing/paper-card";
import { fetchTodayBriefing, type ReaderIssue } from "@/lib/actions/briefing-reader-actions";
import { PUBLISH_HOUR, PUBLISH_MINUTE, formatIssueDate, isPastPublishTime, kstDate } from "@/lib/briefing/kst";
import { DEFAULT_INTERVAL, INTERVAL_OPTIONS, LOOP_START, advance, loopDurationLabel, normalizeInterval, progressOf, step, type LoopState } from "@/lib/briefing/rounding-loop";
import { createClient } from "@/lib/supabase/client";
import "@/components/briefing/briefing.css";

const publishTime = `${String(PUBLISH_HOUR).padStart(2, "0")}:${String(PUBLISH_MINUTE).padStart(2, "0")}`;

/* ── 전환 속도: 이 PC에 기억해 둔다 (세미나실 PC는 매일 같은 설정을 쓴다) ── */
const INTERVAL_KEY = "soo-briefing-rounding-interval";
const intervalListeners = new Set<() => void>();
let intervalMemory: number | null = null; // 저장소를 못 쓰는 브라우저용
function subscribeInterval(cb: () => void) {
  intervalListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    intervalListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readInterval(): number {
  if (intervalMemory !== null) return intervalMemory;
  try {
    return normalizeInterval(window.localStorage.getItem(INTERVAL_KEY));
  } catch {
    return DEFAULT_INTERVAL;
  }
}
function writeInterval(sec: number) {
  intervalMemory = normalizeInterval(sec);
  try {
    window.localStorage.setItem(INTERVAL_KEY, String(intervalMemory));
  } catch {
    // 저장 실패해도 이번 실행에서는 intervalMemory로 동작
  }
  intervalListeners.forEach((l) => l());
}

/* ── 전체화면 여부 ── */
function subscribeFullscreen(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}
const readFullscreen = () => !!document.fullscreenElement;

type Data = { today: string; issue: ReaderIssue | null; past: boolean; failed: boolean };

/**
 * 세미나실 라운딩 대기 모드 (16:9 전체화면, 읽기 전용).
 *
 * - 오늘 발행된 논문 수만큼만 돈다: 3건이면 3장, 4건이면 4장. 표지·마무리 장 없음.
 * - 기본 30초마다 다음 논문, 마지막 뒤에는 첫 논문으로 끝없이 반복.
 * - 전체화면은 사람이 "시작"을 눌렀을 때만 켠다.
 * - 오늘 발행분이 없으면 없다고 보여 준다. 어제 논문을 오늘 것처럼 틀지 않는다(밤새 켜 둬도 날짜가 바뀌면 대기 화면으로).
 * - 주문·관리 메뉴가 없는 단독 화면이다.
 */
export function RoundingScreen({
  today,
  issue,
  past,
  loadFailed,
  isDisplayAccount,
}: {
  today: string;
  issue: ReaderIssue | null;
  /** 오늘 발행 시각이 지났는지 */
  past: boolean;
  loadFailed: boolean;
  /** 세미나실 전용 계정 — 다른 화면으로 가는 길을 보여 주지 않는다 */
  isDisplayAccount: boolean;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Data>({ today, issue, past, failed: loadFailed });
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loop, setLoop] = useState<LoopState>(LOOP_START);
  const [controls, setControls] = useState(true);
  const intervalSec = useSyncExternalStore(subscribeInterval, readInterval, () => DEFAULT_INTERVAL);
  const fullscreen = useSyncExternalStore(subscribeFullscreen, readFullscreen, () => false);

  const papers = data.issue?.papers ?? [];
  const total = papers.length;
  const index = total > 0 ? Math.min(loop.index, total - 1) : 0;
  const paper = papers[index];

  /* ── 자동 넘김: 시계는 하나만. 조건이 바뀌거나 화면을 떠나면 반드시 끈다 ── */
  useEffect(() => {
    if (!running || paused || total === 0) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      if (document.hidden) return; // 탭이 가려진 동안은 흐르지 않는다
      setLoop((s) => advance(s, delta, intervalSec * 1000, total));
    }, 250);
    return () => window.clearInterval(id);
  }, [running, paused, intervalSec, total]);

  /* ── 오늘 발행분 다시 확인: 발행 전이면 1분마다, 있으면 5분마다, 날짜가 바뀌면 바로 ── */
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    let active = true;
    let lastFetch = Date.now();
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const cur = dataRef.current;
      const nowDay = kstDate();
      const dayChanged = nowDay !== cur.today;
      const due = Date.now() - lastFetch >= (cur.issue ? 5 * 60_000 : 60_000);
      if (!dayChanged && !due) return;
      lastFetch = Date.now();
      fetchTodayBriefing()
        .then((r) => active && setData({ today: r.today, issue: r.issue, past: isPastPublishTime(r.today), failed: false }))
        .catch(() => {
          // 못 불러왔는데 날짜가 바뀌었으면 어제 논문을 계속 틀지 않는다
          if (active && dayChanged) setData({ today: nowDay, issue: null, past: isPastPublishTime(nowDay), failed: true });
        });
    }, 30_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  /* ── 화면 꺼짐 방지 (지원하는 브라우저에서만. 안 돼도 그대로 동작) ── */
  useEffect(() => {
    if (!running) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        if (!("wakeLock" in navigator) || document.hidden) return;
        const l = await navigator.wakeLock.request("screen");
        if (cancelled) void l.release().catch(() => {});
        else lock = l;
      } catch {
        // 미지원·거부: 모니터 절전은 PC 설정으로 안내
      }
    };
    void request();
    const onVisible = () => {
      if (!document.hidden) void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [running]);

  /* ── 조작 버튼: 마우스·터치·키를 쓰면 나타나고, 가만히 두면 숨는다(마우스 커서도 같이) ── */
  const hideTimer = useRef<number | undefined>(undefined);
  const poke = useCallback(() => {
    setControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), 3500);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const start = () => {
    // 전체화면은 사람이 누른 이 순간에만 요청한다. 거부돼도 창 안에서 그대로 돈다
    void rootRef.current?.requestFullscreen?.().catch(() => {});
    setLoop(LOOP_START);
    setPaused(false);
    setRunning(true);
    poke();
  };
  const stop = useCallback(() => {
    setRunning(false);
    setPaused(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void rootRef.current?.requestFullscreen?.().catch(() => {});
  }, []);
  const go = useCallback((dir: -1 | 1) => setLoop((s) => step(s, dir, total)), [total]);

  /* ── 키보드: ← → 이전·다음 논문, Space 정지·재생, F 전체화면, Esc 나가기 ── */
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const onControl = e.target instanceof HTMLElement && !!e.target.closest("button, a, select, input");
      poke();
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " " || e.code === "Space") {
        if (onControl) return; // 버튼에 초점이 있으면 그 버튼이 처리한다
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === "Escape") {
        // 전체화면 중의 Esc는 브라우저가 전체화면만 끈다. 창 상태에서 누르면 시작 화면으로
        if (!document.fullscreenElement) stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, go, poke, stop, toggleFullscreen]);

  const handleLogout = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
  };

  const dateLabel = formatIssueDate(data.issue?.issue_date ?? data.today);
  const showControls = controls || paused;

  return (
    <div ref={rootRef} className="bf bf-text fixed inset-0 z-[100] overflow-hidden bg-[#020c1a] text-white">
      {running && paper ? (
        /* ───────── 돌아가는 화면: 논문 1건 = 1장 ───────── */
        <div className={cn("grid h-full w-full place-items-center", !showControls && "cursor-none")} onMouseMove={poke} onTouchStart={poke}>
          {/* 16:9 면. 화면 비율이 달라도 이 비율을 지키고 남는 곳은 검게 둔다 */}
          <div className="relative" style={{ width: "min(100vw, calc(100dvh * 16 / 9))" }}>
            <PaperCard
              card={paper.card}
              variant="rounding"
              rounding={{ dateLabel, index, total, elapsed: progressOf(loop, intervalSec * 1000), paused }}
            />
          {/* 화면 낭독기용: 논문이 바뀔 때만 알린다 */}
          <p className="sr-only" aria-live="polite">
            {`논문 ${total}건 중 ${index + 1}번째. ${paper.headline}`}
          </p>

          {/* 조작 버튼: 바닥 띠(12:00 ROUNDING) 바로 위 — 바닥 글자를 가리지 않는다 */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-[11.5%] flex justify-center px-4 transition-opacity duration-300",
              showControls ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            <div className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl bg-black/70 p-1.5 ring-1 ring-white/15 backdrop-blur" role="toolbar" aria-label="라운딩 화면 조작">
              <CtrlButton label="이전 논문 (←)" onClick={() => go(-1)}>
                <ChevronLeft />
              </CtrlButton>
              <CtrlButton label={paused ? "다시 재생 (Space)" : "잠시 멈춤 (Space)"} onClick={() => setPaused((p) => !p)} wide>
                {paused ? <Play /> : <Pause />}
                <span className="text-sm font-semibold">{paused ? "재생" : "멈춤"}</span>
              </CtrlButton>
              <CtrlButton label="다음 논문 (→)" onClick={() => go(1)}>
                <ChevronRight />
              </CtrlButton>
              <span className="mx-1 h-6 w-px bg-white/20" aria-hidden="true" />
              <IntervalPicker value={intervalSec} onChange={writeInterval} />
              <span className="mx-1 h-6 w-px bg-white/20" aria-hidden="true" />
              <CtrlButton label={fullscreen ? "전체화면 끄기 (F)" : "전체화면 (F)"} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize /> : <Maximize />}
              </CtrlButton>
              <CtrlButton label="라운딩 화면 끝내기 (Esc)" onClick={stop}>
                <X />
              </CtrlButton>
            </div>
          </div>
          </div>
        </div>
      ) : (
        /* ───────── 시작 전 / 오늘 발행분 없음 ───────── */
        <div className="bf-navy-surface flex h-full w-full flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
          <Image src="/sooorder-brand/logo-horizontal-on-dark.webp" alt="수오더" width={1231} height={440} className="h-9 w-auto" priority />
          <p className="mt-8 text-sm font-medium tabular-nums text-white/65">{formatIssueDate(data.today)}</p>
          <h1 className="mt-2 text-[34px] font-extrabold leading-[1.2] tracking-tight sm:text-[52px]">
            오늘의 수의학 <span className="text-[var(--bf-gold-300)]">논문 브리핑</span>
          </h1>

          {total > 0 ? (
            <>
              <p className="mt-4 text-lg text-white/80">
                오늘 논문 <b className="font-bold text-white">{total}건</b> · {intervalSec}초마다 다음 논문 · 한 바퀴 {loopDurationLabel(total, intervalSec)}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-white/70">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4" aria-hidden="true" /> 넘어가는 속도
                </span>
                <IntervalPicker value={intervalSec} onChange={writeInterval} />
              </div>
              <button
                type="button"
                onClick={start}
                autoFocus
                className="mt-8 inline-flex h-16 items-center gap-3 rounded-2xl bg-[var(--bf-gold-400)] px-9 text-xl font-extrabold text-[var(--bf-navy-950)] shadow-[0_16px_40px_-12px_rgb(216_180_127/0.55)] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
              >
                <Repeat className="size-6" aria-hidden="true" /> 라운딩 대기 모드 시작
              </button>
              <p className="mt-4 text-sm text-white/55">누르면 전체화면으로 바뀌고 논문 {total}건이 끝없이 반복돼요.</p>
              <p className="mt-1 text-[13px] text-white/45">← → 이전·다음 논문 · Space 멈춤/재생 · F 전체화면 · Esc 끝내기</p>
            </>
          ) : (
            <>
              <p className="mt-6 text-2xl font-bold text-white sm:text-[30px]">
                {data.failed ? "브리핑을 불러오지 못했어요" : "오늘의 논문이 아직 발행되지 않았어요"}
              </p>
              <p className="mt-3 max-w-xl text-base text-white/65">
                {data.failed
                  ? "잠시 뒤 자동으로 다시 확인해요."
                  : data.past
                    ? "오늘은 올라온 브리핑이 없어요. 발행되면 이 화면에 자동으로 나타나요."
                    : `매일 ${publishTime}에 발행돼요. 발행되면 이 화면에 자동으로 나타나요.`}
              </p>
              <p className="mt-2 text-[13px] text-white/45">지난 논문을 오늘 것처럼 틀지 않아요 · 1분마다 다시 확인 중</p>
              {running && (
                <button type="button" onClick={stop} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-semibold ring-1 ring-white/20 hover:bg-white/15">
                  <X className="size-4" /> 라운딩 화면 끝내기
                </button>
              )}
            </>
          )}

          {!running && (
            <div className="mt-10">
              {isDisplayAccount ? (
                <button type="button" onClick={handleLogout} className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white">
                  <LogOut className="size-4" /> 로그아웃
                </button>
              ) : (
                <Link href="/briefing" className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white">
                  <ChevronLeft className="size-4" /> 논문 브리핑으로 돌아가기
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CtrlButton({ label, onClick, wide, children }: { label: string; onClick: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 [&_svg]:size-5",
        wide ? "px-3.5" : "w-11"
      )}
    >
      {children}
    </button>
  );
}

/** 넘어가는 속도 고르기 (15·20·30·45·60초) */
function IntervalPicker({ value, onChange }: { value: number; onChange: (sec: number) => void }) {
  return (
    <div className="inline-flex rounded-xl bg-white/10 p-0.5 ring-1 ring-white/15" role="group" aria-label="넘어가는 속도 (초)">
      {INTERVAL_OPTIONS.map((sec) => (
        <button
          key={sec}
          type="button"
          aria-pressed={value === sec}
          onClick={() => onChange(sec)}
          className={cn(
            "h-10 min-w-11 rounded-[10px] px-2 text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            value === sec ? "bg-white text-[var(--bf-navy-950)]" : "text-white/75 hover:text-white"
          )}
        >
          {sec}초
        </button>
      ))}
    </div>
  );
}
