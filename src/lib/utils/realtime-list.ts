import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type Row = { id: string };

interface ApplyOpts<T extends Row> {
  /** 이 행이 현재 리스트(상태 필터)에 속하는지 */
  matchesFilter: (row: Record<string, unknown>) => boolean;
  /** 신규 진입 행을 조인 포함해 1건만 조회 (없으면 null) */
  fetchOne: (id: string) => Promise<T | null>;
}

/**
 * Supabase realtime 변경(payload)을 로컬 리스트에 증분 반영한다.
 * 전체 재조회 대신 바뀐 행만 처리해 100명 동시 사용 시의 재조회 폭주를 막는다.
 * 반환값이 입력과 동일 참조면 변경 없음(리렌더 불필요).
 *
 * payload엔 조인 컬럼(예: requester.full_name)이 없으므로:
 * - 기존 행 UPDATE는 새 필드를 병합해 조인 데이터를 보존
 * - 신규 진입(INSERT 또는 미존재 행의 UPDATE)은 fetchOne으로 조인 포함 1건만 조회
 */
export async function applyRealtimeChange<T extends Row>(
  current: T[],
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  { matchesFilter, fetchOne }: ApplyOpts<T>,
): Promise<T[]> {
  if (payload.eventType === "DELETE") {
    const id = (payload.old as Partial<Row>)?.id;
    if (!id) return current;
    return current.some((r) => r.id === id) ? current.filter((r) => r.id !== id) : current;
  }

  const row = payload.new as Record<string, unknown> & Partial<Row>;
  const id = row?.id;
  if (!id) return current;

  if (!matchesFilter(row)) {
    // 필터를 벗어난 행 → 리스트에서 제거
    return current.some((r) => r.id === id) ? current.filter((r) => r.id !== id) : current;
  }

  const idx = current.findIndex((r) => r.id === id);
  if (idx !== -1) {
    // 기존 행 갱신 — 조인 데이터 보존 위해 병합
    const next = current.slice();
    next[idx] = { ...current[idx], ...row } as T;
    return next;
  }

  // 신규 진입 — 조인 포함 1건만 조회해 맨 앞(최신)에 삽입
  const full = await fetchOne(id);
  if (!full || !matchesFilter(full as unknown as Record<string, unknown>)) return current;
  if (current.some((r) => r.id === id)) return current; // 경합 방지
  return [full, ...current];
}

/** Set에서 valid에 없는 id 제거 (변경 없으면 동일 참조 반환) */
export function pruneSet(set: Set<string>, valid: Set<string>): Set<string> {
  let changed = false;
  for (const id of set) if (!valid.has(id)) { changed = true; break; }
  if (!changed) return set;
  const next = new Set<string>();
  for (const id of set) if (valid.has(id)) next.add(id);
  return next;
}

/** Map에서 valid에 없는 key 제거 (변경 없으면 동일 참조 반환) */
export function pruneMap<V>(map: Map<string, V>, valid: Set<string>): Map<string, V> {
  let changed = false;
  for (const id of map.keys()) if (!valid.has(id)) { changed = true; break; }
  if (!changed) return map;
  const next = new Map<string, V>();
  for (const [id, v] of map) if (valid.has(id)) next.set(id, v);
  return next;
}
