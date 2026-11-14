import { designCardByRules, type DesignOptions } from "./rule-designer";
import { checkFidelity, type FidelityWarning } from "./fidelity";
import type { PaperCardContent } from "./schema";

/**
 * 카드 디자이너 어댑터.
 *
 * 줄글 1개 → 카드 1장. 어떤 공급자를 쓰든 결과는 검증된 PaperCardContent 하나다.
 *
 * 공급자:
 *  - "rule"      : 규칙 정리(AI 미사용). 기본값. 키 없이 동작한다.
 *  - "anthropic" : 실제 AI. 서버 환경변수 BRIEFING_AI_PROVIDER=anthropic 으로 명시적으로 켰을 때만.
 *                  (실제 호출부는 6단계에서 연결. 지금은 켜도 규칙 정리로 떨어지고 그 사실을 알린다.)
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

export async function designCard(raw: string, opts: DesignOptions = {}): Promise<DesignResult> {
  const provider = configuredProvider();
  const adminMeta = [opts.sourceUrl ?? "", opts.doi ?? ""];
  const generatedAt = new Date().toISOString();

  // 6단계에서 여기에 실제 AI 호출을 연결한다. 실패하면 아래 규칙 정리로 떨어진다(원본은 호출자가 보존).
  const card = designCardByRules(raw, opts);
  return {
    card,
    mode: "rule",
    notice:
      provider === "anthropic"
        ? "AI 연결은 아직 준비 중이라 규칙 정리로 만들었어요."
        : "AI를 쓰지 않고 규칙으로 정리했어요. 원문 문장을 그대로 배치한 결과예요.",
    providerInfo: { provider: "rule", generatedAt },
    warnings: checkFidelity(raw, card, adminMeta),
  };
}
