import { describe, expect, it } from "vitest";
import { DEFAULT_INTERVAL, INTERVAL_OPTIONS, LOOP_START, MAX_TICK_MS, advance, loopDurationLabel, normalizeInterval, progressOf, step, type LoopState } from "../rounding-loop";

/** 250ms 시계로 ms만큼 흘려 보내며 거쳐 간 논문 순서를 모은다 */
function run(total: number, intervalSec: number, ms: number, start: LoopState = LOOP_START) {
  let s = start;
  const visited = [s.index];
  for (let t = 0; t < ms; t += 250) {
    s = advance(s, 250, intervalSec * 1000, total);
    if (visited[visited.length - 1] !== s.index) visited.push(s.index);
  }
  return { state: s, visited };
}

describe("라운딩 자동 넘김", () => {
  it("논문 3건이면 정확히 3장을 돌고 첫 장으로 돌아온다 (표지·마무리 장 없음)", () => {
    const { visited } = run(3, 30, 30_000 * 6);
    expect(visited).toEqual([0, 1, 2, 0, 1, 2, 0]);
  });

  it("논문 4건이면 정확히 4장을 돌고 첫 장으로 돌아온다", () => {
    const { visited } = run(4, 30, 30_000 * 8);
    expect(visited).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0]);
  });

  it("기본은 30초이고, 30초가 되기 전에는 넘어가지 않는다", () => {
    expect(DEFAULT_INTERVAL).toBe(30);
    expect(run(4, DEFAULT_INTERVAL, 29_750).state.index).toBe(0);
    expect(run(4, DEFAULT_INTERVAL, 30_000).state.index).toBe(1);
  });

  it("4건·30초면 한 바퀴가 120초다", () => {
    expect(run(4, 30, 119_750).state.index).toBe(3);
    expect(run(4, 30, 120_000).state).toEqual({ index: 0, elapsedMs: 0 });
    expect(loopDurationLabel(4, 30)).toBe("2분");
    expect(loopDurationLabel(3, 30)).toBe("1분 30초");
    expect(loopDurationLabel(3, 15)).toBe("45초");
  });

  it("전환 속도를 바꾸면 그 간격으로 넘어간다", () => {
    for (const sec of INTERVAL_OPTIONS) {
      expect(run(3, sec, sec * 1000 - 250).state.index).toBe(0);
      expect(run(3, sec, sec * 1000).state.index).toBe(1);
    }
  });

  it("탭이 숨었다 돌아와 시간이 한꺼번에 흘러도 한 장만 넘어간다 (몰아서 넘기지 않음)", () => {
    // 10분이 한 번에 흘렀다고 알려 와도 한 틱은 최대 MAX_TICK_MS
    const s = advance({ index: 0, elapsedMs: 29_500 }, 600_000, 30_000, 4);
    expect(s).toEqual({ index: 1, elapsedMs: 0 });
    const mid = advance({ index: 0, elapsedMs: 0 }, 600_000, 30_000, 4);
    expect(mid).toEqual({ index: 0, elapsedMs: MAX_TICK_MS });
  });

  it("시계가 거꾸로 가도(음수) 뒤로 가지 않는다", () => {
    expect(advance({ index: 2, elapsedMs: 5000 }, -9999, 30_000, 4)).toEqual({ index: 2, elapsedMs: 5000 });
  });

  it("이전·다음은 다른 논문으로 가고 끝과 처음이 이어진다", () => {
    expect(step({ index: 3, elapsedMs: 12_000 }, 1, 4)).toEqual({ index: 0, elapsedMs: 0 });
    expect(step({ index: 0, elapsedMs: 12_000 }, -1, 4)).toEqual({ index: 3, elapsedMs: 0 });
    expect(step({ index: 1, elapsedMs: 12_000 }, 1, 3)).toEqual({ index: 2, elapsedMs: 0 });
  });

  it("논문 수가 줄어도 범위를 벗어나지 않는다", () => {
    expect(advance({ index: 3, elapsedMs: 0 }, 250, 30_000, 3).index).toBe(2);
    expect(step({ index: 3, elapsedMs: 0 }, 1, 3).index).toBe(0);
  });

  it("발행된 논문이 없으면 넘길 장이 없다", () => {
    expect(advance({ index: 2, elapsedMs: 100 }, 250, 30_000, 0)).toEqual(LOOP_START);
    expect(step({ index: 2, elapsedMs: 100 }, 1, 0)).toEqual(LOOP_START);
  });

  it("저장된 속도 값이 이상하면 30초로 돌아간다", () => {
    expect(normalizeInterval("45")).toBe(45);
    expect(normalizeInterval(20)).toBe(20);
    expect(normalizeInterval("7")).toBe(30);
    expect(normalizeInterval(null)).toBe(30);
    expect(normalizeInterval("abc")).toBe(30);
  });

  it("진행 비율은 0~1 사이다", () => {
    expect(progressOf({ index: 0, elapsedMs: 15_000 }, 30_000)).toBe(0.5);
    expect(progressOf({ index: 0, elapsedMs: 99_000 }, 30_000)).toBe(1);
  });
});
