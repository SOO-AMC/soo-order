/**
 * 같은 key 의 조회가 이미 진행 중이면 새로 보내지 않고 그 결과를 같이 쓴다.
 *
 * 화면이 열릴 때 보내는 조회에 쓴다. 개발 모드는 effect 를 두 번 실행해서 같은 조회가 두 번 나가고,
 * 화면을 빠르게 다시 열어도 같은 조회가 겹친다 — 작은 DB 에서는 이 중복이 곧바로 느려짐으로 이어진다.
 * 끝난 결과를 기억해 두지는 않는다(항상 최신). 기억이 필요하면 서버의 serverMemo 를 쓴다.
 */
const pending = new Map<string, Promise<unknown>>();

export function shareInflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = pending.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const p = fn().finally(() => {
    if (pending.get(key) === p) pending.delete(key);
  });
  pending.set(key, p);
  return p;
}
