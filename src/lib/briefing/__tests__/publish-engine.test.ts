import { describe, expect, it } from "vitest";
import { scheduledAtFor } from "../kst";
import { STALE_PENDING_MS, buildInternalNotification, buildNaverWorksMessage, claimDecision, deliveryKey, type Channel, type DeliveryState } from "../notify";
import { publishIssue, runDuePublish, warnIfStockLow, warnIfTodayMissing, type EngineIssue, type EngineOptions, type EnginePaper, type NotificationRow, type PublishStore } from "../publish-engine";
import { designCardByRules } from "../rule-designer";

/** DB 대신 쓰는 메모리 저장소. 실제 DB와 같은 규칙: 상태 전환은 조건부, 발송 키는 유니크 */
class MemoryStore implements PublishStore {
  issues = new Map<string, EngineIssue>();
  papers = new Map<string, EnginePaper[]>();
  logs = new Map<string, { issueId: string; channel: Channel; state: DeliveryState; attempts: number; updatedAt: string; payload?: unknown; error?: string | null }>();
  notifications: NotificationRow[] = [];
  recipients = ["u1", "u2", "u3"];
  admins = ["a1"];
  failInsertTimes = 0;
  // 호출 사이에 다른 실행이 끼어들 수 있게 한 박자 쉰다
  private tick = () => new Promise<void>((r) => setTimeout(r, 0));

  async getIssue(id: string) {
    await this.tick();
    const i = this.issues.get(id);
    return i ? { ...i } : null;
  }
  async getIssueByDate(date: string) {
    await this.tick();
    const i = [...this.issues.values()].find((x) => x.issue_date === date);
    return i ? { ...i } : null;
  }
  async listDueScheduled(nowIso: string) {
    await this.tick();
    return [...this.issues.values()].filter((i) => i.status === "scheduled" && !!i.scheduled_at && i.scheduled_at <= nowIso).map((i) => ({ ...i }));
  }
  async listPapers(issueId: string) {
    await this.tick();
    return this.papers.get(issueId) ?? [];
  }
  async markPublished(issueId: string, nowIso: string) {
    await this.tick();
    const i = this.issues.get(issueId);
    if (!i || i.status === "published") return false; // 조건부 전환 (한 문장으로 일어난다)
    i.status = "published";
    i.published_at = nowIso;
    return true;
  }
  async revertScheduledToDraft(issueId: string) {
    await this.tick();
    const i = this.issues.get(issueId);
    if (i && i.status === "scheduled") {
      i.status = "draft";
      i.scheduled_at = null;
    }
  }
  async claimDelivery(key: string, issueId: string, channel: Channel, now: Date) {
    await this.tick();
    const ex = this.logs.get(key);
    if (!ex) {
      this.logs.set(key, { issueId, channel, state: "pending", attempts: 1, updatedAt: now.toISOString() });
      return "claimed" as const;
    }
    const d = claimDecision({ state: ex.state, updatedAt: ex.updatedAt }, now);
    if (d !== "claim") return d;
    ex.state = "pending";
    ex.attempts += 1;
    ex.updatedAt = now.toISOString();
    return "claimed" as const;
  }
  async finishDelivery(key: string, r: { state: DeliveryState; nowIso: string; errorMessage?: string | null; payloadPreview?: unknown }) {
    await this.tick();
    const ex = this.logs.get(key)!;
    ex.state = r.state;
    ex.updatedAt = r.nowIso;
    ex.payload = r.payloadPreview;
    ex.error = r.errorMessage ?? null;
  }
  async listRecipientIds() {
    await this.tick();
    return this.recipients;
  }
  async listAdminIds() {
    await this.tick();
    return this.admins;
  }
  async countScheduledAfter(date: string) {
    await this.tick();
    return [...this.issues.values()].filter((i) => i.status === "scheduled" && i.issue_date > date).length;
  }
  async insertNotifications(rows: NotificationRow[]) {
    await this.tick();
    if (this.failInsertTimes > 0) {
      this.failInsertTimes -= 1;
      throw new Error("일시적인 오류");
    }
    this.notifications.push(...rows);
  }
}

const paper = (i: number, reviewed = true, withCard = true): EnginePaper => ({
  id: `p${i}`,
  headline: `논문 제목 ${i}`,
  review_status: reviewed ? "reviewed" : "draft",
  card_content: withCard ? designCardByRules(`논문 제목 ${i}\n결과: 회복 기간이 ${i}일 짧았다.`) : null,
  display_order: i,
});

function setup(count: number, issue: Partial<EngineIssue> = {}, paperOpts: { reviewed?: boolean; withCard?: boolean } = {}) {
  const store = new MemoryStore();
  store.issues.set("i1", { id: "i1", issue_date: "2026-11-14", status: "draft", scheduled_at: null, published_at: null, ...issue });
  store.papers.set(
    "i1",
    Array.from({ length: count }, (_, k) => paper(k + 1, paperOpts.reviewed ?? true, paperOpts.withCard ?? true))
  );
  return store;
}
const at = (iso: string, extra: Partial<EngineOptions> = {}): EngineOptions => ({ now: new Date(iso), internalLive: true, baseUrl: "https://app.example", ...extra });
const NOW = "2026-11-14T01:00:00.000Z"; // KST 10:00

describe("발행 조건", () => {
  it("검수 완료 4건이면 발행되고, 직원 알림과 네이버웍스 기록이 한 번씩 남는다", async () => {
    const store = setup(4);
    const out = await publishIssue(store, "i1", at(NOW));
    expect(out.ok && out.newlyPublished).toBe(true);
    expect(store.issues.get("i1")!.status).toBe("published");
    expect(store.notifications).toHaveLength(3); // 받는 사람 3명 × 1건
    expect(store.logs.get("internal:2026-11-14")!.state).toBe("sent");
    expect(store.logs.get("naverworks-group:2026-11-14")!.state).toBe("mock"); // 실제 전송 없음
  });

  it("3건도 발행된다", async () => {
    const out = await publishIssue(setup(3), "i1", at(NOW));
    expect(out.ok && out.paperCount).toBe(3);
  });

  it.each([0, 1, 2, 5])("논문이 %i건이면 발행하지 않고 이유를 돌려준다 (골라서 내보내지 않음)", async (n) => {
    const store = setup(n);
    const out = await publishIssue(store, "i1", at(NOW));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reasons.length).toBeGreaterThan(0);
    expect(store.issues.get("i1")!.status).toBe("draft");
    expect(store.notifications).toHaveLength(0);
    expect(store.logs.size).toBe(0); // 발행이 안 됐으면 알림 기록도 만들지 않는다
  });

  it("검수하지 않은 논문이 있으면 발행하지 않는다", async () => {
    const store = setup(4, {}, { reviewed: false });
    expect((await publishIssue(store, "i1", at(NOW))).ok).toBe(false);
    expect(store.issues.get("i1")!.status).toBe("draft");
  });

  it("카드가 없는 논문이 있으면 발행하지 않는다", async () => {
    expect((await publishIssue(setup(3, {}, { withCard: false }), "i1", at(NOW))).ok).toBe(false);
  });
});

describe("중복 방지", () => {
  it("같은 날짜를 두 번 발행해도 한 번만 발행되고 알림도 한 번만 나간다", async () => {
    const store = setup(4);
    const first = await publishIssue(store, "i1", at(NOW));
    const second = await publishIssue(store, "i1", at(NOW));
    expect(first.ok && first.newlyPublished).toBe(true);
    expect(second.ok && second.newlyPublished).toBe(false);
    expect(second.ok && second.deliveries.every((d) => d.outcome === "already-done")).toBe(true);
    expect(store.notifications).toHaveLength(3);
    expect(store.logs.size).toBe(2);
  });

  it("동시에 다섯 번 실행돼도 발행 1번, 직원 알림 1번, 네이버웍스 기록 1건", async () => {
    const store = setup(4);
    const outs = await Promise.all(Array.from({ length: 5 }, () => publishIssue(store, "i1", at(NOW))));
    expect(outs.filter((o) => o.ok && o.newlyPublished)).toHaveLength(1);
    expect(store.notifications).toHaveLength(3);
    expect(store.logs.size).toBe(2);
    expect(store.logs.get("internal:2026-11-14")!.attempts).toBe(1);
    expect(store.logs.get("naverworks-group:2026-11-14")!.attempts).toBe(1);
  });

  it("발행을 취소했다가 다시 발행해도 알림을 또 보내지 않는다", async () => {
    const store = setup(4);
    await publishIssue(store, "i1", at(NOW));
    store.issues.get("i1")!.status = "draft"; // 발행 취소
    const again = await publishIssue(store, "i1", at(NOW));
    expect(again.ok && again.newlyPublished).toBe(true);
    expect(store.notifications).toHaveLength(3);
  });

  it("알림이 실패하면 기록이 남고, 다음 실행에서 다시 시도해 한 번만 나간다", async () => {
    const store = setup(4);
    store.failInsertTimes = 1;
    const first = await publishIssue(store, "i1", at(NOW));
    expect(first.ok && first.deliveries.find((d) => d.channel === "internal")!.outcome).toBe("failed");
    expect(store.logs.get("internal:2026-11-14")!.state).toBe("failed");
    expect(store.issues.get("i1")!.status).toBe("published"); // 발행 자체는 유지
    const retry = await publishIssue(store, "i1", at(NOW));
    expect(retry.ok && retry.deliveries.find((d) => d.channel === "internal")!.outcome).toBe("sent");
    expect(store.notifications).toHaveLength(3);
    expect(store.logs.get("internal:2026-11-14")!.attempts).toBe(2);
  });
});

describe("테스트 모드", () => {
  it("직원 알림을 넣지 않고 내용만 기록한다", async () => {
    const store = setup(4);
    const out = await publishIssue(store, "i1", at(NOW, { internalLive: false }));
    expect(out.ok).toBe(true);
    expect(store.notifications).toHaveLength(0);
    const log = store.logs.get("internal:2026-11-14")!;
    expect(log.state).toBe("mock");
    expect((log.payload as { recipientCount: number }).recipientCount).toBe(3);
  });
});

describe("08:30 예약 발행 (서버가 UTC여도 한국시간 기준)", () => {
  it("예약 시각 1분 전에는 그대로, 08:30이 되면 발행된다", async () => {
    const scheduledAt = scheduledAtFor("2026-11-15");
    expect(scheduledAt).toBe("2026-11-14T23:30:00.000Z"); // KST 11/15 08:30 = UTC 11/14 23:30
    const store = setup(4, { issue_date: "2026-11-15", status: "scheduled", scheduled_at: scheduledAt });

    const before = await runDuePublish(store, at("2026-11-14T23:29:00.000Z"));
    expect(before.published).toEqual([]);
    expect(store.issues.get("i1")!.status).toBe("scheduled");

    const due = await runDuePublish(store, at("2026-11-14T23:30:00.000Z"));
    expect(due.published).toEqual(["2026-11-15"]);
    expect(store.issues.get("i1")!.status).toBe("published");
    expect(store.notifications).toHaveLength(3);
  });

  it("크론과 첫 조회가 겹쳐 여러 번 돌아도 한 번만 발행·알림", async () => {
    const store = setup(3, { status: "scheduled", scheduled_at: scheduledAtFor("2026-11-14") });
    const runs = await Promise.all(Array.from({ length: 4 }, () => runDuePublish(store, at(NOW))));
    expect(runs.flatMap((r) => r.published)).toEqual(["2026-11-14"]);
    expect(store.notifications).toHaveLength(3);
    const later = await runDuePublish(store, at("2026-11-14T03:00:00.000Z"));
    expect(later.published).toEqual([]);
    expect(store.notifications).toHaveLength(3);
  });

  it("예약해 둔 뒤 조건이 깨졌으면 발행하지 않고 초안으로 되돌린다", async () => {
    const store = setup(2, { status: "scheduled", scheduled_at: scheduledAtFor("2026-11-14") });
    const run = await runDuePublish(store, at(NOW));
    expect(run.published).toEqual([]);
    expect(run.reverted).toHaveLength(1);
    expect(store.issues.get("i1")!.status).toBe("draft");
    expect(store.notifications).toHaveLength(0);
  });

  it("초안은 08:30이 지나도 저절로 발행되지 않는다", async () => {
    const store = setup(4);
    expect((await runDuePublish(store, at(NOW))).published).toEqual([]);
    expect(store.issues.get("i1")!.status).toBe("draft");
  });
});

describe("발행되지 않은 날 관리자 경고", () => {
  it("08:30이 지났는데 발행이 없으면 관리자에게 하루 한 번만 알린다", async () => {
    const store = setup(2);
    expect(await warnIfTodayMissing(store, at(NOW))).toBe("2026-11-14");
    expect(store.notifications.map((n) => n.user_id)).toEqual(["a1"]);
    expect(store.notifications[0].body).toContain("2건");
    expect(await warnIfTodayMissing(store, at("2026-11-14T02:00:00.000Z"))).toBeNull();
    expect(store.notifications).toHaveLength(1);
  });

  it("08:30 전이거나 이미 발행됐으면 알리지 않는다", async () => {
    expect(await warnIfTodayMissing(setup(2), at("2026-11-13T23:00:00.000Z"))).toBeNull(); // KST 08:00
    expect(await warnIfTodayMissing(setup(4, { status: "published" }), at(NOW))).toBeNull();
  });
});

describe("알림 내용", () => {
  const papers = [1, 2, 3, 4].map((i) => ({ id: `p${i}`, headline: `논문 제목 ${i}` }));

  it("네이버웍스: 논문 4건이 메시지 1건에 묶인다", () => {
    const msg = buildNaverWorksMessage("2026-11-14", papers, "https://app.example/");
    expect(msg.messageCount).toBe(1);
    expect(msg.itemCount).toBe(4);
    for (const p of papers) expect(msg.text).toContain(p.headline);
    expect(msg.text).toContain("2026.11.14 (토)");
    expect(msg.link).toBe("https://app.example/briefing");
    expect(msg.text).not.toMatch(/token|secret|key=/i); // 주소에 토큰을 싣지 않는다
  });

  it("네이버웍스: 3건이면 3줄, 앱 주소가 없으면 경로만", () => {
    const msg = buildNaverWorksMessage("2026-11-14", papers.slice(0, 3), null);
    expect(msg.itemCount).toBe(3);
    expect(msg.text).toContain("3. 논문 제목 3");
    expect(msg.text).not.toContain("4. ");
    expect(msg.link).toBe("/briefing");
  });

  it("수오더 안 알림: 한 건에 논문 수와 제목 목록, 누르면 오늘 브리핑으로", () => {
    const n = buildInternalNotification("2026-11-14", papers);
    expect(n.link).toBe("/briefing");
    expect(n.body).toContain("논문 4건");
    expect(n.body.split("\n")).toHaveLength(5);
  });

  it("발송 키는 날짜와 채널로 정해진다", () => {
    expect(deliveryKey("internal", "2026-11-14")).toBe("internal:2026-11-14");
    expect(deliveryKey("naverworks-group", "2026-11-14")).not.toBe(deliveryKey("internal", "2026-11-14"));
    expect(deliveryKey("internal", "2026-11-15")).not.toBe(deliveryKey("internal", "2026-11-14"));
  });
});

describe("이미 기록이 있을 때 다시 보낼지", () => {
  const now = new Date(NOW);
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  it("끝난 것(보냄·테스트 기록·건너뜀)은 다시 보내지 않는다", () => {
    for (const state of ["sent", "mock", "skipped"] as const) expect(claimDecision({ state, updatedAt: ago(1000) }, now)).toBe("done");
  });
  it("실패한 것은 다시 시도한다", () => {
    expect(claimDecision({ state: "failed", updatedAt: ago(1000) }, now)).toBe("claim");
  });
  it("보내는 중인 것은 건드리지 않고, 오래 멈춰 있으면 다시 맡는다", () => {
    expect(claimDecision({ state: "pending", updatedAt: ago(5000) }, now)).toBe("busy");
    expect(claimDecision({ state: "pending", updatedAt: ago(STALE_PENDING_MS + 1000) }, now)).toBe("claim");
  });
  it("기록이 없으면 맡는다", () => {
    expect(claimDecision(null, now)).toBe("claim");
  });
});

describe("준비분이 모자라면 관리자에게 알린다", () => {
  const NOW = new Date("2026-11-16T01:00:00Z"); // 11-16 10:00 KST
  const QUEUE = "9999-12-31";
  const make = (scheduledDates: string[], withQueue = true) => {
    const s = new MemoryStore();
    scheduledDates.forEach((d, i) => s.issues.set("i" + i, { id: "i" + i, issue_date: d, status: "scheduled", scheduled_at: d + "T00:00:00.000Z", published_at: null }));
    if (withQueue) s.issues.set("q", { id: "q", issue_date: QUEUE, status: "draft", scheduled_at: null, published_at: null });
    return s;
  };
  const live: EngineOptions = { now: NOW, internalLive: true };

  it("내일부터 예약된 날이 2일치보다 적으면 하루 한 번 알린다", async () => {
    const store = make(["2026-11-17"]);
    expect(await warnIfStockLow(store, live)).toBe(1);
    expect(store.notifications).toHaveLength(1);
    expect(store.notifications[0]).toMatchObject({ user_id: "a1", type: "briefing_warning", link: "/briefing/admin" });
    expect(store.notifications[0].title).toContain("1일치");
    // 같은 날 다시 불러도 또 보내지 않는다
    expect(await warnIfStockLow(store, live)).toBeNull();
    expect(store.notifications).toHaveLength(1);
  });

  it("오늘 것은 세지 않는다 (내일 이후만)", async () => {
    const store = make(["2026-11-16"]);
    expect(await warnIfStockLow(store, live)).toBe(0);
    expect(store.notifications[0].title).toContain("내일");
  });

  it("2일치 이상 준비돼 있으면 알리지 않는다", async () => {
    const store = make(["2026-11-17", "2026-11-18"]);
    expect(await warnIfStockLow(store, live)).toBeNull();
    expect(store.notifications).toHaveLength(0);
    expect(store.logs.size).toBe(0);
  });

  it("대기함을 한 번도 쓰지 않았으면 알리지 않는다", async () => {
    const store = make([], false);
    expect(await warnIfStockLow(store, live)).toBeNull();
    expect(store.notifications).toHaveLength(0);
  });

  it("테스트 모드에서는 기록만 남기고 알림함에 넣지 않는다", async () => {
    const store = make([]);
    expect(await warnIfStockLow(store, { now: NOW, internalLive: false })).toBe(0);
    expect(store.notifications).toHaveLength(0);
    expect([...store.logs.values()][0].state).toBe("mock");
  });

  it("대기함은 발행할 수 없다", async () => {
    const store = make([]);
    store.papers.set("q", [paper(1), paper(2), paper(3)]);
    const out = await publishIssue(store, "q", live);
    expect(out.ok).toBe(false);
    expect(store.issues.get("q")!.status).toBe("draft");
  });

  it("건수 범위를 주면 그 범위로 발행을 판단한다", async () => {
    const store = make([]);
    store.issues.set("d", { id: "d", issue_date: "2026-11-16", status: "draft", scheduled_at: null, published_at: null });
    store.papers.set("d", [paper(1), paper(2)]);
    expect((await publishIssue(store, "d", live)).ok).toBe(false); // 예전 규칙 3~4건
    expect((await publishIssue(store, "d", { ...live, limits: { min: 2, max: 3 } })).ok).toBe(true);
  });
});
