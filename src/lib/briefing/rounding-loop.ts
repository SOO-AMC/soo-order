/**
 * 라운딩 대기 모드의 자동 넘김 계산 (화면과 분리한 순수 함수 — 테스트 대상).
 *
 * 장수는 그날 발행된 논문 수와 같다. 표지·목차·마무리 장을 끼워 넣지 않는다.
 * 3건이면 0→1→2→0…, 4건이면 0→1→2→3→0… 으로 끝없이 돈다.
 */

/** 한 장을 보여 주는 시간 (초). 라운딩 화면에서 직접 입력한다. 기본 15초 */
export const DEFAULT_INTERVAL = 15;
export const MIN_INTERVAL = 5;
export const MAX_INTERVAL = 600;

/** 시계가 한 번 울릴 때 흐른 것으로 쳐 주는 최대 시간. 탭이 숨었다 돌아오거나 PC가 잠들었다 깨도 여러 장을 건너뛰지 않게 한다 */
export const MAX_TICK_MS = 1000;

export type LoopState = {
  /** 지금 보여 주는 논문 (0부터) */
  index: number;
  /** 이 장에서 흐른 시간 */
  elapsedMs: number;
};

export const LOOP_START: LoopState = { index: 0, elapsedMs: 0 };

/**
 * 입력·저장된 값을 쓸 수 있는 초로.
 * 숫자가 아니면 기본 15초, 소수는 반올림, 범위(5~600초)를 벗어나면 가장 가까운 끝값.
 */
export function normalizeInterval(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(n)));
}

/**
 * 시간이 deltaMs만큼 흘렀을 때의 다음 상태.
 * 한 번에 많아야 한 장만 넘긴다(밀린 시간을 몰아서 여러 장 넘기지 않는다).
 */
export function advance(state: LoopState, deltaMs: number, intervalMs: number, total: number): LoopState {
  if (total <= 0) return LOOP_START;
  // 논문 수가 줄었으면(관리자가 수정) 범위 안으로
  const index = Math.min(Math.max(0, state.index), total - 1);
  const delta = Math.min(Math.max(0, deltaMs), MAX_TICK_MS);
  const elapsedMs = state.elapsedMs + delta;
  if (elapsedMs < intervalMs) return { index, elapsedMs };
  return { index: (index + 1) % total, elapsedMs: 0 };
}

/** 이전(-1)/다음(+1) 논문으로. 끝에서 처음으로, 처음에서 끝으로 이어진다. 그 장의 시간은 처음부터 다시 센다 */
export function step(state: LoopState, dir: -1 | 1, total: number): LoopState {
  if (total <= 0) return LOOP_START;
  const index = Math.min(Math.max(0, state.index), total - 1);
  return { index: (index + dir + total) % total, elapsedMs: 0 };
}

/** 이 장에서 흐른 비율 0~1 */
export function progressOf(state: LoopState, intervalMs: number): number {
  return intervalMs > 0 ? Math.min(1, state.elapsedMs / intervalMs) : 0;
}

/** 한 바퀴 도는 데 걸리는 시간 설명 (예: 4건·30초 → "2분", 3건·20초 → "1분") */
export function loopDurationLabel(total: number, intervalSec: number): string {
  const sec = total * intervalSec;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}
