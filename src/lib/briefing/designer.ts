import { AiDesignError, designCardWithAi, type AiFailureCode, type AiInputKind, type AiMessagesClient } from "./ai-designer";
import { checkFidelity, type FidelityWarning } from "./fidelity";
import { designCardByRules, type DesignOptions } from "./rule-designer";
import type { PaperCardContent } from "./schema";

/**
 * 카드 디자이너 어댑터.
 *
 * 줄글 1개 → 카드 1장. 어떤 공급자를 쓰든 결과는 검증된 PaperCardContent 하나다.
 *
 * 공급자:
 *  - "rule"      : 규칙 정리(AI 미사용). 기본값. 키 없이 동작한다.
 *  - "anthropic" : 실제 AI. 서버 환경변수 BRIEFING_AI_PROVIDER=anthropic 과 ANTHROPIC_API_KEY 가 둘 다 있을 때만.
 *
 * AI가 실패하거나(오류·거절·형식 이상) 요약문에 없는 숫자를 쓰면, 그 결과를 버리고 규칙 정리로 대신 만든다.
 * 그래서 이 함수는 던지지 않는다 — 원본 글과 기존 카드는 호출자가 그대로 보존한다.
 *
 * AI는 관리자가 "만들기/다시 만들기"를 누를 때만 돈다. 직원 조회·라운딩 반복 때는 저장된 카드를 읽기만 한다.
 */
export type DesignerMode = "rule" | "ai";

export type DesignResult = {
  card: PaperCardContent;
  mode: DesignerMode;
  /** 화면에 보여 줄 안내 (예: AI가 실패해 규칙 정리로 만들었어요) */
  notice: string | null;
  providerInfo: { provider: string; model?: string; generatedAt: string; note?: string };
  warnings: FidelityWarning[];
};

export function configuredProvider(): "rule" | "anthropic" {
  return process.env.BRIEFING_AI_PROVIDER === "anthropic" && !!process.env.ANTHROPIC_API_KEY ? "anthropic" : "rule";
}

/** AI가 실패했을 때 관리자에게 보여 줄 말 */
const FAILURE_TEXT: Record<AiFailureCode, string> = {
  refusal: "AI가 이 글의 처리를 거절했어요.",
  truncated: "AI 응답이 중간에 끊겼어요.",
  "no-output": "AI가 빈 응답을 보냈어요.",
  "invalid-json": "AI 응답의 형식이 올바르지 않았어요.",
  "invalid-card": "AI 응답이 카드 규격에 맞지 않았어요.",
  "unverified-number": "AI 카드에 요약문에 없는 숫자가 있어서 쓰지 않았어요.",
  "api-error": "AI 서버에 연결하지 못했어요.",
};

export type DesignDeps = {
  /** 테스트용: 공급자를 직접 지정 */
  provider?: "rule" | "anthropic";
  /** 테스트용: 가짜 AI 클라이언트 */
  client?: AiMessagesClient;
  model?: string;
  /** summary(기본) = 붙여넣은 완성 요약문을 배치만, abstract = 자동으로 찾은 논문의 초록을 요약·번역 */
  kind?: AiInputKind;
};

export async function designCard(raw: string, opts: DesignOptions = {}, deps: DesignDeps = {}): Promise<DesignResult> {
  const provider = deps.provider ?? configuredProvider();
  const adminMeta = [opts.sourceUrl ?? "", opts.doi ?? ""];
  const generatedAt = new Date().toISOString();

  let aiFailure: AiFailureCode | null = null;
  if (provider === "anthropic") {
    try {
      const { card, model } = await designCardWithAi(raw, opts, { client: deps.client, model: deps.model, kind: deps.kind });
      return {
        card,
        mode: "ai",
        notice: "AI가 디자인한 카드예요. 숫자·약물명·결론이 원문과 같은지 꼭 확인해 주세요.",
        providerInfo: { provider: "anthropic", model, generatedAt },
        warnings: checkFidelity(raw, card, adminMeta),
      };
    } catch (e) {
      aiFailure = e instanceof AiDesignError ? e.code : "api-error";
      // 사유 코드만 남긴다 (요약문·응답 본문은 남기지 않는다)
      console.error("[briefing] AI 카드 만들기 실패 → 규칙 정리로 대체:", e instanceof AiDesignError ? e.message : "unknown");
    }
  }

  const card = designCardByRules(raw, opts);
  return {
    card,
    mode: "rule",
    notice: aiFailure
      ? `${FAILURE_TEXT[aiFailure]} 대신 규칙으로 정리했어요(원문 문장을 그대로 배치). 다시 만들기를 누르면 AI로 다시 시도해요.`
      : "AI를 쓰지 않고 규칙으로 정리했어요. 원문 문장을 그대로 배치한 결과예요.",
    providerInfo: { provider: "rule", generatedAt, ...(aiFailure ? { note: `ai-failed:${aiFailure}` } : {}) },
    warnings: checkFidelity(raw, card, adminMeta),
  };
}
