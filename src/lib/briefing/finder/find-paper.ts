import type { AiMessagesClient } from "../ai-designer";
import { designCard, type DesignResult } from "../designer";
import { addDays } from "../kst";
import { parseCard, type PaperCardContent } from "../schema";
import { chooseCandidate, type ChooseResult } from "./choose";
import { FinderSearchError, searchCandidates, type FetchLike } from "./pubmed";
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
  const c = choice.candidate;

  const raw = candidateRawText(c);
  const design = await designCard(raw, { category, doi: c.doi, sourceUrl: c.url }, { provider: deps.provider, client: deps.client, kind: "abstract" });
  // 출처는 데이터베이스 값으로, 분야는 찾은 분야로 고정한다
  const parsed = parseCard({ ...design.card, category, source: candidateSource(c, design.card.source.studyType) });
  if (!parsed.ok) return { ok: false, reason: "card-failed" };

  return {
    ok: true,
    candidate: c,
    choice,
    card: parsed.card,
    raw,
    design: { mode: design.mode, providerInfo: design.providerInfo, warnings: design.warnings },
    pool: { vet: vet.length, human: human.length },
  };
}
