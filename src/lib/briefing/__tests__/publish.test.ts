import { describe, expect, it } from "vitest";
import { checkPublishable, isIssueVisible, progressLabel } from "../publish-rules";
import { addDays, defaultIssueDate, formatIssueDate, isPastPublishTime, kstDate, scheduledAtFor } from "../kst";
import { designCardByRules } from "../rule-designer";

const card = designCardByRules("테스트용 요약 문장입니다. 두 번째 문장입니다.");
const reviewed = { review_status: "reviewed" as const, card_content: card };
const draft = { review_status: "draft" as const, card_content: card };
const empty = { review_status: "draft" as const, card_content: null };

describe("발행 조건: 검수 완료 3~4건만", () => {
  it("3건·4건은 발행 가능", () => {
    expect(checkPublishable([reviewed, reviewed, reviewed]).ok).toBe(true);
    expect(checkPublishable([reviewed, reviewed, reviewed, reviewed]).ok).toBe(true);
  });

  it.each([0, 1, 2])("%i건이면 발행하지 않고 이유를 알려 준다", (n) => {
    const res = checkPublishable(Array.from({ length: n }, () => reviewed));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reasons.join(" ")).toContain("3~4건");
  });

  it("5건이면 임의로 고르지 않고 막는다", () => {
    const res = checkPublishable(Array.from({ length: 5 }, () => reviewed));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reasons.join(" ")).toContain("4건까지");
  });

  it("검수 안 한 논문·카드 없는 논문이 있으면 막는다", () => {
    const a = checkPublishable([reviewed, reviewed, draft]);
    expect(a.ok).toBe(false);
    const b = checkPublishable([reviewed, reviewed, empty]);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reasons.join(" ")).toContain("만들지 않은");
  });
});

describe("한국시간 08:30 예약 (서버가 UTC여도 같다)", () => {
  it("11월 14일 08:30 KST = 11월 13일 23:30 UTC", () => {
    expect(scheduledAtFor("2026-11-14")).toBe("2026-11-13T23:30:00.000Z");
  });

  it("UTC 기준 전날 밤이어도 한국 날짜로 계산", () => {
    // UTC 11/13 23:00 = KST 11/14 08:00
    const now = new Date("2026-11-13T23:00:00Z");
    expect(kstDate(now)).toBe("2026-11-14");
    expect(isPastPublishTime("2026-11-14", now)).toBe(false);
    expect(defaultIssueDate(now)).toBe("2026-11-14");
  });

  it("08:30이 지나면 새 논문의 기본 발행일은 내일", () => {
    const now = new Date("2026-11-13T23:31:00Z"); // KST 08:31
    expect(isPastPublishTime("2026-11-14", now)).toBe(true);
    expect(defaultIssueDate(now)).toBe("2026-11-15");
  });

  it("주말도 똑같이 계산 (토·일 포함 매일)", () => {
    expect(formatIssueDate("2026-11-14")).toBe("2026.11.14 (토)");
    expect(formatIssueDate("2026-11-15")).toBe("2026.11.15 (일)");
    expect(scheduledAtFor("2026-11-15")).toBe("2026-11-14T23:30:00.000Z");
  });

  it("월말·연말 날짜 더하기", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("직원에게 보이는 시점", () => {
  const at = scheduledAtFor("2026-11-14");

  it("초안은 안 보인다", () => {
    expect(isIssueVisible({ status: "draft", scheduled_at: at }, new Date("2026-11-14T03:00:00Z"))).toBe(false);
  });

  it("예약 상태는 08:30 전에는 안 보이고, 지나면 보인다", () => {
    expect(isIssueVisible({ status: "scheduled", scheduled_at: at }, new Date("2026-11-13T23:29:59Z"))).toBe(false);
    expect(isIssueVisible({ status: "scheduled", scheduled_at: at }, new Date("2026-11-13T23:30:00Z"))).toBe(true);
  });

  it("발행 완료는 보인다", () => {
    expect(isIssueVisible({ status: "published", scheduled_at: null })).toBe(true);
  });
});

describe("장 번호는 실제 논문 수로", () => {
  it("4건이면 01/04 ~ 04/04", () => {
    expect([0, 1, 2, 3].map((i) => progressLabel(i, 4))).toEqual(["01 / 04", "02 / 04", "03 / 04", "04 / 04"]);
  });
  it("3건이면 02/03", () => {
    expect(progressLabel(1, 3)).toBe("02 / 03");
  });
});
