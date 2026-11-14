import { describe, expect, it, vi } from "vitest";
import { shareInflight } from "../inflight";
import { serverMemo } from "../server-memo";

const later = <T,>(value: T, ms = 5) => new Promise<T>((r) => setTimeout(() => r(value), ms));

describe("shareInflight", () => {
  it("진행 중인 같은 조회는 한 번만 보낸다", async () => {
    const fn = vi.fn(() => later("a"));
    const [x, y] = await Promise.all([shareInflight("k1", fn), shareInflight("k1", fn)]);
    expect([x, y]).toEqual(["a", "a"]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("끝난 뒤에는 다시 보낸다 (결과를 기억하지 않는다)", async () => {
    const fn = vi.fn(() => later("a"));
    await shareInflight("k2", fn);
    await shareInflight("k2", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("key 가 다르면 따로 보낸다", async () => {
    const fn = vi.fn(() => later("a"));
    await Promise.all([shareInflight("k3", fn), shareInflight("k4", fn)]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("실패해도 다음 호출은 새로 보낸다", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce("ok");
    await expect(shareInflight("k5", fn)).rejects.toThrow("x");
    await expect(shareInflight("k5", fn)).resolves.toBe("ok");
  });
});

describe("serverMemo", () => {
  it("기간 안에는 기억한 값을 쓴다", async () => {
    const fn = vi.fn(() => later(1));
    expect(await serverMemo("m1", 1000, fn)).toBe(1);
    expect(await serverMemo("m1", 1000, fn)).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("동시에 와도 한 번만 조회한다", async () => {
    const fn = vi.fn(() => later(1));
    await Promise.all([serverMemo("m2", 1000, fn), serverMemo("m2", 1000, fn)]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("기간이 지나면 다시 조회한다", async () => {
    const fn = vi.fn(() => later(1, 1));
    await serverMemo("m3", 5, fn);
    await later(null, 15);
    await serverMemo("m3", 5, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("실패한 결과는 기억하지 않는다", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(2);
    await expect(serverMemo("m4", 1000, fn)).rejects.toThrow("x");
    expect(await serverMemo("m4", 1000, fn)).toBe(2);
  });

  it("keep 이 false 인 결과(빈 값)는 기억하지 않는다", async () => {
    const fn = vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({ a: "b" });
    const keep = (v: Record<string, string>) => Object.keys(v).length > 0;
    expect(await serverMemo("m5", 1000, fn, keep)).toEqual({});
    expect(await serverMemo("m5", 1000, fn, keep)).toEqual({ a: "b" });
    expect(await serverMemo("m5", 1000, fn, keep)).toEqual({ a: "b" });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
