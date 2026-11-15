import { addDays, isPastPublishTime, scheduledAtFor } from "./kst";
import { QUEUE_DATE, type PlanSettings } from "./types";

/**
 * 논문 브리핑 배치 계산 (순수 함수 — DB·시각을 직접 보지 않는다).
 *
 * 모델:
 *  - 대기함 = 날짜가 QUEUE_DATE 인 묶음 하나. 올린 논문은 일단 여기에 있다.
 *  - 검수를 마친 대기함 논문은 "발행 예정"의 맨 뒤에 붙는다.
 *  - 발행 예정 논문은 한 줄로 순서가 있고, 시작일부터 하루 perDay 건씩 잘라 날짜를 정한다.
 *    (순서가 곧 날짜다. 앞의 논문이 빠지면 뒤의 논문이 당겨진다.)
 *  - 한 번 자리를 잡은 논문은 검수가 풀려도(글·카드를 고쳐서) 자리를 지킨다.
 *    다만 그날의 논문이 전부 검수돼 있어야 그날이 예약된다.
 *  - 발행된 날, 이미 직원에게 보이는 날은 잠겨 있다 → 건너뛴다.
 */

export type PlanPaper = {
  id: string;
  /** 지금 들어 있는 묶음의 날짜 (대기함이면 QUEUE_DATE) */
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
  /** 예약되지 않은 이유 (예약됐으면 null) */
  blocked: "short" | "unreviewed" | "past-time" | null;
};

export type PlanItem = { id: string; date: string; ord: number };

export type Plan = {
  days: PlanDay[];
  /** 대기함에 남는 논문 (순서대로) */
  queueIds: string[];
  /** 모든 논문의 최종 위치 */
  items: PlanItem[];
  /** 발행 예정 논문의 한 줄 순서 */
  order: string[];
};

/** 시작일부터 잠긴 날을 건너뛰며 n번째(0부터) 날짜 */
export function nthOpenDate(startDate: string, n: number, locked: ReadonlySet<string>): string {
  let date = startDate;
  // 잠긴 날이 끝없이 이어질 수는 없다(발행은 과거·오늘뿐) — 그래도 안전하게 상한을 둔다
  for (let guard = 0; guard < 3660; guard++) {
    if (!locked.has(date)) {
      if (n === 0) return date;
      n -= 1;
    }
    date = addDays(date, 1);
  }
  return date;
}

export function buildPlan(input: {
  papers: PlanPaper[];
  settings: PlanSettings;
  /** 첫 발행일 (오늘 08:30 전이면 오늘, 지났으면 내일. "오늘 것 지금 발행"은 오늘) */
  startDate: string;
  /** 발행됐거나 이미 보이는 날짜 */
  lockedDates: ReadonlySet<string>;
  now: Date;
  /** 발행 예정 논문의 순서를 직접 정할 때 (옮기기). 빠진 논문은 원래 순서로 뒤에 붙는다 */
  order?: string[];
}): Plan {
  const { settings, startDate, lockedDates, now } = input;
  const perDay = Math.max(1, Math.floor(settings.perDay));
  const min = Math.min(Math.max(1, Math.floor(settings.min)), perDay);
  const byId = new Map(input.papers.map((p) => [p.id, p]));

  const byPosition = (a: PlanPaper, b: PlanPaper) => (a.issueDate === b.issueDate ? a.order - b.order : a.issueDate < b.issueDate ? -1 : 1);
  const placed = input.papers.filter((p) => p.issueDate !== QUEUE_DATE).sort(byPosition);
  const inQueue = input.papers.filter((p) => p.issueDate === QUEUE_DATE).sort(byPosition);
  const arriving = inQueue.filter((p) => p.reviewed && p.hasCard);
  const staying = inQueue.filter((p) => !(p.reviewed && p.hasCard));

  // 한 줄 순서: (직접 정한 순서 →) 원래 자리 순 → 새로 검수된 대기함 논문
  const natural = [...placed, ...arriving].map((p) => p.id);
  let order = natural;
  if (input.order) {
    const allowed = new Set(natural);
    const seen = new Set<string>();
    const head = input.order.filter((id) => allowed.has(id) && !seen.has(id) && (seen.add(id), true));
    order = [...head, ...natural.filter((id) => !seen.has(id))];
  }

  const days: PlanDay[] = [];
  const items: PlanItem[] = [];
  for (let i = 0; i < order.length; i += perDay) {
    const ids = order.slice(i, i + perDay);
    const date = nthOpenDate(startDate, i / perDay, lockedDates);
    const allReady = ids.every((id) => {
      const p = byId.get(id);
      return !!p && p.reviewed && p.hasCard;
    });
    const pastTime = isPastPublishTime(date, now);
    const blocked: PlanDay["blocked"] = !allReady ? "unreviewed" : ids.length < min ? "short" : pastTime ? "past-time" : null;
    days.push({ date, paperIds: ids, status: blocked ? "draft" : "scheduled", scheduledAt: blocked ? null : scheduledAtFor(date), blocked });
    ids.forEach((id, k) => items.push({ id, date, ord: k + 1 }));
  }
  staying.forEach((p, k) => items.push({ id: p.id, date: QUEUE_DATE, ord: k + 1 }));

  return { days, queueIds: staying.map((p) => p.id), items, order };
}

export type CurrentIssue = { date: string; status: "draft" | "scheduled"; scheduledAt: string | null };

/**
 * 지금 상태와 비교해서 실제로 바꿀 것만 고른다 (바꿀 게 없으면 DB를 부르지 않는다).
 * 계획에서 빠진 예약 묶음(논문이 0건이 된 날)은 초안으로 되돌린다.
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
  // 대기함 묶음이 아직 없는데 대기함으로 갈 논문이 있으면 만든다
  if (plan.items.some((it) => it.date === QUEUE_DATE) && !current.has(QUEUE_DATE)) days.push({ date: QUEUE_DATE, status: "draft", scheduled_at: null });
  for (const i of issues) {
    if (i.date === QUEUE_DATE || planned.has(i.date)) continue;
    if (i.status === "scheduled" || i.scheduledAt !== null) days.push({ date: i.date, status: "draft", scheduled_at: null });
  }
  return { items, days };
}

/** id 를 최종 위치 toIndex 로 옮긴 새 순서 */
export function moveInOrder(order: string[], id: string, toIndex: number): string[] {
  const rest = order.filter((x) => x !== id);
  if (rest.length === order.length) return order;
  const at = Math.max(0, Math.min(toIndex, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** id 를 beforeId 바로 앞으로 옮긴 새 순서 (beforeId 가 없으면 맨 뒤) */
export function moveBefore(order: string[], id: string, beforeId: string | null): string[] {
  if (id === beforeId) return order;
  const rest = order.filter((x) => x !== id);
  if (rest.length === order.length) return order;
  const at = beforeId ? rest.indexOf(beforeId) : -1;
  return at < 0 ? [...rest, id] : [...rest.slice(0, at), id, ...rest.slice(at)];
}

/**
 * id 를 dayIndex 번째 날(0부터)에 들어가게 옮긴다 — 그날의 마지막 자리.
 * 그날이 꽉 차 있으면 그날의 마지막 논문이 다음 날로 밀린다. 날짜가 끝보다 뒤면 맨 뒤.
 */
export function moveToDay(order: string[], id: string, dayIndex: number, perDay: number): string[] {
  const target = Math.min(dayIndex * perDay + perDay - 1, order.length - 1);
  return moveInOrder(order, id, target);
}

/** 예약된 날 수 = 앞으로 며칠치가 준비됐나 */
export function stockDays(days: Pick<PlanDay, "status">[]): number {
  return days.filter((d) => d.status === "scheduled").length;
}

// ── 여러 건 한 번에 붙여넣기 ──────────────────────────────────────────────

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
