import { describe, expect, it } from "vitest";
import { minPasswordLength, padPassword, validatePassword } from "../auth";

describe("비밀번호 규칙", () => {
  it("일반·관리자는 4자리부터", () => {
    expect(minPasswordLength("user")).toBe(4);
    expect(minPasswordLength("admin")).toBe(4);
    expect(minPasswordLength(undefined)).toBe(4);
    expect(validatePassword("abc", "user")).not.toBeNull();
    expect(validatePassword("ab1!", "user")).toBeNull();
  });

  it("세미나실 화면 계정은 1자리부터", () => {
    expect(minPasswordLength("display")).toBe(1);
    expect(validatePassword("1", "display")).toBeNull();
    expect(validatePassword("", "display")).not.toBeNull();
  });

  it("기존 비밀번호(2자리 이상)의 덧붙임은 예전과 같다 — 기존 계정 로그인이 깨지지 않게", () => {
    expect(padPassword("ab1!")).toBe("ab1!#Sx9");
    expect(padPassword("12")).toBe("12#Sx9");
  });

  it("1자리 비밀번호도 Supabase 최소 6자를 넘고, 늘 같은 값이 된다", () => {
    expect(padPassword("1").length).toBeGreaterThanOrEqual(6);
    expect(padPassword("1")).toBe(padPassword("1"));
    expect(padPassword("1")).not.toBe(padPassword("2"));
  });
});
