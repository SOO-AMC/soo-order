import { addDays, isPastPublishTime, scheduledAtFor } from "./kst";
import { QUEUE_DATE } from "./types";

/**
 * 논문 브리핑 날짜 묶음 계산 (순수 함수 — DB·시각을 직접 보지 않는다).
 *
 * 모델:
 *  - 논문은 올릴 때 정한 날짜의 묶음에 들어간다. 한 번에 올린 논문들이 그날의 브리핑이다(날마다 건수가 달라도 된다).
 *  - 앱이 논문을 다른 날짜로 옮기지 않는다. 지워도 뒤 날짜의 논문을 당겨 채우지 않고, 발행하지 못하고 지난 날의 논문도 그 날짜에 그대로 있다.
 *    옮기는 것은 관리자가 시켰을 때뿐이다(moves).
 *  - 그날의 논문이 1건 이상이고 전부 카드가 있고 검수돼 있으면 08:30 발행을 예약한다. (최소 건수 없음)
 *    08:30이 이미 지난 날짜는 예약하지 않는다 — "지금 발행"으로만 내보낸다.
 *  - 날짜 미정 = 날짜가 QUEUE_DATE 인 묶음 하나. 날짜에서 뺀 논문이 머무는 곳이고, 절대 발행되지 않는다.
 *  - 발행된 날, 이미 직원에게 보이는 날은 잠겨 있다 → 호출하는 쪽이 그 논문들을 넘기지 않는다.
 */

export type PlanPaper = {
  id: string;
  /** 지금 들어 있는 묶음의 날짜 (날짜 미정이면 QUEUE_DATE) */
  issueDate: string;
  order: number;
  reviewed: boolean;
  hasCard: boolean;
};

export type PlanDay = {
  date: string;
  paperIds: string[];
  status: "draft" | "scheduled";
  scheduledAt: string | null;
  /** 예약되지 않은 이유 (예약됐으면 null). unreviewed = 검수(또는 카드)가 덜 됨, past-time = 08:30이 지남 */
  blocked: "unreviewed" | "past-time" | null;
};

export type PlanItem = { id: string; date: string; ord: number };

/** 논문을 다른 날짜(또는 같은 날짜의 다른 자리)로 옮기기. index 는 그 날짜 안에서의 자리(0부터), 없으면 맨 뒤 */
export type PlanMove = { id: string; date: string; index?: number };

export type Plan = {
  /** 논문이 있는 날짜 묶음 (날짜순, 날짜 미정 제외) */
  days: PlanDay[];
  /** 날짜 미정 논문 (순서대로) */
  queueIds: string[];
  /** 모든 논문의 최종 위치 */
  items: PlanItem[];
};

export function settlePlan(input: { papers: PlanPaper[]; now: Date; moves?: PlanMove[] }): Plan {
  const byId = new Map(input.papers.map((p) => [p.id, p]));
  const byDate = new Map<string, string[]>();
  for (const p of [...input.papers].sort((a, b) => (a.issueDate === b.issueDate ? a.order - b.order : a.issueDate < b.issueDate ? -1 : 1))) {
    const arr = byDate.get(p.issueDate) ?? [];
    arr.push(p.id);
    byDate.set(p.issueDate, arr);
  }

  for (const m of input.moves ?? []) {
    if (!byId.has(m.id)) continue;
    for (const ids of byDate.values()) {
      const at = ids.indexOf(m.id);
      if (at >= 0) ids.splice(at, 1);
    }
    const target = byDate.get(m.date) ?? [];
    const at = m.index === undefined ? target.length : Math.max(0, Math.min(Math.floor(m.index), target.length));
    target.splice(at, 0, m.id);
    byDate.set(m.date, target);
  }

  const days: PlanDay[] = [];
  const items: PlanItem[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const ids = byDate.get(date)!;
    if (ids.length === 0) continue;
    ids.forEach((id, k) => items.push({ id, date, ord: k + 1 }));
    if (date === QUEUE_DATE) continue;
    const allReady = ids.every((id) => {
      const p = byId.get(id);
      return !!p && p.reviewed && p.hasCard;
    });
    const blocked: PlanDay["blocked"] = !allReady ? "unreviewed" : isPastPublishTime(date, input.now) ? "past-time" : null;
    days.push({ date, paperIds: ids, status: blocked ? "draft" : "scheduled", scheduledAt: blocked ? null : scheduledAtFor(date), blocked });
  }
  return { days, queueIds: byDate.get(QUEUE_DATE) ?? [], items };
}

export type CurrentIssue = { date: string; status: "draft" | "scheduled"; scheduledAt: string | null };

/**
 * 지금 상태와 비교해서 실제로 바꿀 것만 고른다 (바꿀 게 없으면 DB를 부르지 않는다).
 * 논문이 0건이 된 날의 예약은 초안으로 되돌린다.
 */
export function planChanges(papers: PlanPaper[], issues: CurrentIssue[], plan: Plan): { items: PlanItem[]; days: { date: string; status: "draft" | "scheduled"; scheduled_at: string | null }[] } {
  const now = new Map(papers.map((p) => [p.id, p]));
  const items = plan.items.filter((it) => {
    const p = now.get(it.id);
    return !p || p.issueDate !== it.date || p.order !== it.ord;
  });

  const current = new Map(issues.map((i) => [i.date, i]));
  const sameTime = (a: string | null, b: string | null) => (a === null || b === null ? a === b : new Date(a).getTime() === new Date(b).getTime());
  const days: { date: string; status: "draft" | "scheduled"; scheduled_at: string | null }[] = [];
  const planned = new Set<string>();
  for (const d of plan.days) {
    planned.add(d.date);
    const cur = current.get(d.date);
    if (!cur || cur.status !== d.status || !sameTime(cur.scheduledAt, d.scheduledAt)) days.push({ date: d.date, status: d.status, scheduled_at: d.scheduledAt });
  }
  // 날짜 미정 묶음이 아직 없는데 그리로 갈 논문이 있으면 만든다
  if (plan.items.some((it) => it.date === QUEUE_DATE) && !current.has(QUEUE_DATE)) days.push({ date: QUEUE_DATE, status: "draft", scheduled_at: null });
  for (const i of issues) {
    if (i.date === QUEUE_DATE || planned.has(i.date)) continue;
    if (i.status === "scheduled" || i.scheduledAt !== null) days.push({ date: i.date, status: "draft", scheduled_at: null });
  }
  return { items, days };
}

/** start 부터 taken 에 없는 첫 날짜 — 올리기 화면의 기본 날짜(다음 빈 날짜)에 쓴다 */
export function nextFreeDate(start: string, taken: ReadonlySet<string>): string {
  let date = start;
  for (let guard = 0; guard < 3660 && taken.has(date); guard++) date = addDays(date, 1);
  return date;
}

/** 예약된 날 수 = 앞으로 며칠치가 준비됐나 */
export function stockDays(days: Pick<PlanDay, "status">[]): number {
  return days.filter((d) => d.status === "scheduled").length;
}

// ── 한 칸에 여러 건을 붙여넣었을 때 ──────────────────────────────────────

/** 구분선(---, ===, ***, ___ 를 세 개 이상) 한 줄로 요약을 나눈다. 빈 덩어리는 버린다. */
export function splitSummaries(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/^[ \t]*(?:-{3,}|={3,}|\*{3,}|_{3,})[ \t]*$/m)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// ── 중복 올림 찾기 ────────────────────────────────────────────────────────

export function extractDois(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = text.match(/10\.\d{4,9}\/[^\s"'<>]+/g) ?? [];
  return [...new Set(found.map((d) => d.replace(/[.,;:)\]]+$/, "").toLowerCase()))];
}

const titleKey = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export type DupItem = { id: string; hash: string | null; dois: string[]; headline: string | null; /** 사람이 읽는 위치, 예: "11.13 발행분" */ where: string };
export type DupHit = { otherId: string; where: string; reason: "same-text" | "same-doi" | "same-title" };

/** target 과 같아 보이는 다른 논문 하나 (없으면 null). 같은 글 > 같은 DOI > 같은 제목 순으로 본다 */
export function findDuplicate(target: DupItem, others: DupItem[]): DupHit | null {
  const rest = others.filter((o) => o.id !== target.id);
  const text = target.hash ? rest.find((o) => o.hash && o.hash === target.hash) : undefined;
  if (text) return { otherId: text.id, where: text.where, reason: "same-text" };
  const doi = target.dois.length > 0 ? rest.find((o) => o.dois.some((d) => target.dois.includes(d))) : undefined;
  if (doi) return { otherId: doi.id, where: doi.where, reason: "same-doi" };
  const key = titleKey(target.headline);
  // 너무 짧은 제목은 우연히 같을 수 있어 비교하지 않는다
  const title = key.length >= 12 ? rest.find((o) => titleKey(o.headline) === key) : undefined;
  if (title) return { otherId: title.id, where: title.where, reason: "same-title" };
  return null;
}

export const DUP_REASON_LABEL: Record<DupHit["reason"], string> = {
  "same-text": "같은 글",
  "same-doi": "같은 DOI",
  "same-title": "같은 제목",
};
