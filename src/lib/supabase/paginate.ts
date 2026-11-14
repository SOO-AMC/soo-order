/**
 * Supabase(PostgREST)는 한 번에 최대 1,000줄만 돌려준다. 넘는 줄은 오류 없이 잘린다.
 * 줄 수가 1,000을 넘을 수 있는 조회는 반드시 이 헬퍼로 끝까지 읽는다.
 *
 * 주의: 쪽마다 같은 순서여야 하므로, 넘기는 조회에 `.order(...)`(겹치지 않는 칸, 보통 id)를 꼭 붙인다.
 */

interface PageResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

export const PAGE_SIZE = 1000;

/** 안전장치: 이보다 많이 읽게 되면 조회 조건이 잘못된 것으로 본다 */
const MAX_ROWS = 300_000;

export async function fetchAllPages<T>(
  getPage: (from: number, to: number) => PromiseLike<PageResult>,
  opts: { pageSize?: number; label?: string } = {},
): Promise<T[]> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const all: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += pageSize) {
    const { data, error } = await getPage(from, from + pageSize - 1);
    // 조용히 빈 결과를 돌려주지 않는다 — 화면이 "0건"으로 보이면 숫자를 믿게 된다
    if (error) throw new Error(`${opts.label ?? "데이터"}를 불러오지 못했어요: ${error.message}`);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
  throw new Error(`${opts.label ?? "데이터"}가 너무 많아요. 기간을 좁혀 주세요.`);
}

/** 긴 목록을 n개씩 나눈다. `.in("id", ids)`에 id를 수백 개 넣으면 주소가 길어져 요청이 실패하므로 나눠 보낸다. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
