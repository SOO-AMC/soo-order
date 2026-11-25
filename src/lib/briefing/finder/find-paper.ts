import type { AiMessagesClient } from "../ai-designer";
import { designCard, type DesignResult } from "../designer";
import { addDays } from "../kst";
import { parseCard, type PaperCardContent } from "../schema";
import { chooseCandidate, type ChooseResult } from "./choose";
import { FinderSearchError, fetchFullText, searchCandidates, type FetchLike } from "./pubmed";
import { RECENT_DAYS, candidateRawText, candidateSource, excludeUsed, type Candidate, type FindCategory } from "./sources";

/**
 * 한 분야의 오늘 논문 1건: 찾기 → 고르기 → 카드 만들기. DB 는 건드리지 않는다(저장은 호출자).
 * 던지지 않고 결과/실패 이유를 돌려준다.
 */
export type FindPaperResult =
  | {
      ok: true;
      candidate: Candidate;
      choice: ChooseResult;
      card: PaperCardContent;
      raw: string;
      /** 무료 원문 본문까지 읽고 요약했나 */
      fullText: boolean;
      design: Pick<DesignResult, "mode" | "providerInfo" | "warnings">;
      /** 검색된 후보 수 (이미 쓴 논문 뺀 뒤) */
      pool: { vet: number; human: number };
    }
  | { ok: false; reason: "no-candidates" | "search-failed" | "card-failed" };

export type FindPaperDeps = {
  provider: "rule" | "anthropic";
  client?: AiMessagesClient;
  fetchImpl?: FetchLike;
};

export async function findPaper(
  category: FindCategory,
  ctx: { today: string; used: { dois: string[]; titles: string[] }; skip?: string[] },
  deps: FindPaperDeps
): Promise<FindPaperResult> {
  const range = { from: addDays(ctx.today, -RECENT_DAYS), to: ctx.today };
  let vet: Candidate[];
  let human: Candidate[];
  try {
    // 차례로 (PubMed 는 초당 3번까지)
    vet = await searchCandidates(category, "vet", range, { max: 15, fetchImpl: deps.fetchImpl });
    human = await searchCandidates(category, "human", range, { max: 8, fetchImpl: deps.fetchImpl });
  } catch (e) {
    console.error("[briefing-finder] 검색 실패:", e instanceof FinderSearchError ? e.status : "unknown");
    return { ok: false, reason: "search-failed" };
  }
  const used = { dois: [...ctx.used.dois, ...(ctx.skip ?? [])], titles: ctx.used.titles };
  vet = excludeUsed(vet, used).slice(0, 12);
  human = excludeUsed(human, used).slice(0, 5);
  const pool = [...vet, ...human];
  if (pool.length === 0) return { ok: false, reason: "no-candidates" };

  const choice = await chooseCandidate(category, pool, { useAi: deps.provider === "anthropic", client: deps.client });
  if (!choice) return { ok: false, reason: "no-candidates" };
  // AI 를 쓰는데 카드가 실패하면(초록에 없는 숫자 등) 영어 문장 카드를 남기지 않고 다음 후보로 (수의학 먼저, 최대 3건)
  const rest = pool.filter((p) => p !== choice.candidate).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "vet" ? -1 : 1));
  const tries = deps.provider === "anthropic" ? [choice.candidate, ...rest].slice(0, MAX_TRIES) : [choice.candidate];
  for (const [i, c] of tries.entries()) {
    // 무료 원문(PMC)이 있으면 본문 발췌까지 넣는다 (못 받으면 초록만)
    const fullText = c.pmcid ? await fetchFullText(c.pmcid, { fetchImpl: deps.fetchImpl }) : null;
    const raw = candidateRawText(c, fullText);
    const design = await designCard(raw, { category, doi: c.doi, sourceUrl: c.url }, { provider: deps.provider, client: deps.client, kind: "abstract" });
    if (deps.provider === "anthropic" && design.mode !== "ai") continue;
    // 출처는 데이터베이스 값으로, 분야는 찾은 분야로 고정한다
    const parsed = parseCard({ ...design.card, category, source: candidateSource(c, design.card.source.studyType, !!fullText) });
    if (!parsed.ok) continue;
    return {
      ok: true,
      candidate: c,
      choice: i === 0 ? choice : { candidate: c, by: "rule", reason: null },
      card: parsed.card,
      raw,
      fullText: !!fullText,
      design: { mode: design.mode, providerInfo: design.providerInfo, warnings: design.warnings },
      pool: { vet: vet.length, human: human.length },
    };
  }
  return { ok: false, reason: "card-failed" };
}

/** AI 카드가 실패할 때 시도할 후보 수 (분야 하나에 길어야 1~2분) */
const MAX_TRIES = 3;
