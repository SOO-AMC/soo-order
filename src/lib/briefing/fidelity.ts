import { cardTexts, type PaperCardContent } from "./schema";

/**
 * 원문 대조 검사.
 * 카드에 적힌 숫자·영문 용어(약물명·균명 등)·출처가 관리자가 붙여넣은 원문에 실제로 있는지 본다.
 * AI가 수치나 출처를 지어내거나 바꾸면 여기서 걸려서 검수 화면에 경고로 뜬다.
 * (의미 왜곡까지 잡지는 못한다 — 그건 사람 검수 몫이라 화면에서 원문을 나란히 보여 준다.)
 */
export type FidelityWarning = {
  type: "number" | "term" | "source";
  /** 문제의 글자 */
  token: string;
  /** 카드 어디에 있는지 */
  where: string;
  message: string;
};

/** 숫자 토큰: 12, 65.4, 1,200, 0.5 … (앞뒤 숫자·점에 붙어 있지 않은 것) */
const NUMBER_RE = /(?<![\d.])\d+(?:[.,]\d+)*(?![\d])/g;
/** 영문 용어: 4글자 이상 (methotrexate, Aspergillus, ciclosporin …) */
const TERM_RE = /[A-Za-z][A-Za-z-]{3,}/g;

/** 카드 UI가 스스로 붙이는 말은 검사하지 않는다 */
const UI_WORDS = new Set(["rule", "based"]);

const normNum = (s: string) => s.replace(/,/g, "");

export function numberTokens(text: string): string[] {
  return (text.match(NUMBER_RE) ?? []).map(normNum);
}

/** 영어 초록은 작은 수를 낱말로 쓴다("five dogs") — 한국어 카드의 "5마리"를 근거 있는 숫자로 친다 */
const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
  thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90", hundred: "100",
  single: "1", twice: "2", both: "2", dozen: "12",
};
export function numberWordTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).flatMap((w) => (NUMBER_WORDS[w] ? [NUMBER_WORDS[w]] : []));
}

function buildSourceIndex(raw: string, extra: string[]) {
  const all = [raw, ...extra].join("\n");
  return {
    numbers: new Set([...numberTokens(all), ...numberWordTokens(all)]),
    lower: all.toLowerCase(),
  };
}

/**
 * @param raw 관리자가 붙여넣은 원문
 * @param card 검사할 카드
 * @param adminMeta 관리자가 고급 설정에 직접 넣은 값(원문 링크·DOI 등) — 이것도 "근거 있음"으로 친다
 */
export function checkFidelity(raw: string, card: PaperCardContent, adminMeta: string[] = []): FidelityWarning[] {
  const src = buildSourceIndex(raw, adminMeta.filter(Boolean));
  const warnings: FidelityWarning[] = [];
  const seen = new Set<string>();
  const push = (w: FidelityWarning) => {
    const k = `${w.type}:${w.token}`;
    if (seen.has(k)) return;
    seen.add(k);
    warnings.push(w);
  };

  for (const { where, text } of cardTexts(card)) {
    for (const n of numberTokens(text)) {
      if (!src.numbers.has(n)) {
        push({ type: "number", token: n, where, message: `숫자 "${n}"이(가) 원문에 없어요` });
      }
    }
    for (const t of text.match(TERM_RE) ?? []) {
      const low = t.toLowerCase();
      if (UI_WORDS.has(low)) continue;
      if (!src.lower.includes(low)) {
        push({ type: "term", token: t, where, message: `"${t}"이(가) 원문에 없어요` });
      }
    }
  }

  // 출처: 원문이나 관리자 입력에 없는 저널·연도·DOI·주소는 지어낸 것일 수 있다
  const s = card.source;
  const sourceFields: [string, string | null][] = [
    ["저널", s.journal],
    ["연도", s.year],
    ["연구 유형", s.studyType],
    ["논문 제목", s.title],
    ["DOI", s.doi],
    ["주소", s.url],
  ];
  for (const [label, value] of sourceFields) {
    if (!value) continue;
    // 한국어로 쓴 연구 유형(근거 수준, 예: "다기관 후향 증례군(개 6마리)")은 번역이라 글자 대조는 하지 않고, 숫자만 원문과 맞춰 본다
    if (label === "연구 유형" && /[가-힣]/.test(value)) {
      for (const n of numberTokens(value)) {
        if (!src.numbers.has(n)) push({ type: "number", token: n, where: "출처(근거 수준)", message: `숫자 "${n}"이(가) 원문에 없어요` });
      }
      continue;
    }
    if (!src.lower.includes(value.toLowerCase())) {
      push({ type: "source", token: value, where: `출처(${label})`, message: `출처의 ${label} "${value}"이(가) 원문에 없어요` });
    }
  }

  return warnings;
}
