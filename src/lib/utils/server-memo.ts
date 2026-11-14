/**
 * 서버가 조회 결과를 잠깐 기억해 두고 재사용한다 (서버 프로세스 메모리, 프로세스마다 따로).
 *
 * 쓰는 조건 — 셋 다 맞을 때만:
 *  1. 누가 불러도 결과가 같다 (사용자별로 달라지는 조회에는 쓰지 않는다. 권한 검사는 반드시 이 함수 **밖에서** 먼저 한다)
 *  2. ttl 만큼 묵은 값이어도 된다 (힌트·참고 표시 같은 것. 방금 고친 값이 바로 보여야 하는 조회에는 쓰지 않는다)
 *  3. 조회가 무겁다
 *
 * 진행 중인 조회도 같이 쓴다(같은 key 가 동시에 와도 DB 에는 한 번만 간다). 실패한 결과는 기억하지 않는다.
 */
const store = new Map<string, { at: number; value: Promise<unknown> }>();

export function serverMemo<T>(key: string, ttlMs: number, fn: () => Promise<T>, keep?: (value: T) => boolean): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const entry = { at: Date.now(), value: null as unknown as Promise<unknown> };
  const forget = () => {
    if (store.get(key) === entry) store.delete(key);
  };
  const value = fn().then(
    (v) => {
      // keep 이 false 면 (예: 빈 결과) 기억하지 않는다
      if (keep && !keep(v)) forget();
      return v;
    },
    (e) => {
      forget();
      throw e;
    },
  );
  entry.value = value;
  store.set(key, entry);
  return value;
}
