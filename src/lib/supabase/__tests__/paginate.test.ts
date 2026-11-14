import { describe, expect, it } from "vitest";
import { chunk, fetchAllPages } from "../paginate";

/** n줄짜리 가짜 표. 한 번에 최대 1,000줄만 돌려준다 (Supabase 와 같은 제한) */
function fakeTable(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const getPage = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null };
  };
  return { getPage, calls };
}

describe("끝까지 읽기", () => {
  it("1,000줄을 넘어도 전부 읽는다", async () => {
    const t = fakeTable(3207);
    const all = await fetchAllPages<{ id: number }>(t.getPage);
    expect(all).toHaveLength(3207);
    expect(all[3206].id).toBe(3206);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999], [3000, 3999]]);
  });

  it("정확히 1,000줄이면 한 번 더 읽어 끝을 확인한다", async () => {
    const t = fakeTable(1000);
    expect(await fetchAllPages(t.getPage)).toHaveLength(1000);
    expect(t.calls).toHaveLength(2);
  });

  it("빈 결과", async () => {
    expect(await fetchAllPages(fakeTable(0).getPage)).toEqual([]);
  });

  it("읽다가 실패하면 빈 목록이 아니라 오류를 낸다", async () => {
    const getPage = async (from: number) =>
      from === 0 ? { data: Array.from({ length: 1000 }, (_, i) => i), error: null } : { data: null, error: { message: "URI too long" } };
    await expect(fetchAllPages(getPage, { label: "명세서 거래 내역" })).rejects.toThrow("명세서 거래 내역를 불러오지 못했어요: URI too long");
  });
});

describe("목록 나누기", () => {
  it("n개씩 나눈다", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
    expect(chunk(Array.from({ length: 878 }), 100).map((c) => c.length)).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 78]);
  });
});
