import {
  cleanText,
  paperCardSchema,
  type CardBlock,
  type CategoryKey,
  type LayoutVariant,
  type PaperCardContent,
} from "./schema";

/**
 * 규칙 기반 카드 생성기 (AI 없이 동작).
 *
 * 관리자가 붙여넣은 줄글을 규칙으로 나눠 카드 1장을 만든다.
 * 원칙: 문장을 새로 쓰지 않는다. 카드에 싣는 글자는 전부 원문에 있던 문장(필요하면 잘라낸 것)이다.
 * → 숫자·약물명·출처를 지어낼 수 없다. 정보가 없으면 그 구역을 만들지 않는다.
 *
 * AI 키가 없을 때, AI가 실패했을 때, 개발·테스트할 때 쓴다. 화면에는 "AI 미사용(규칙 정리)"로 표시한다.
 */

export type DesignOptions = {
  /** 관리자가 고른 분야 (있으면 자동 추정보다 우선) */
  category?: CategoryKey | null;
  /** 관리자가 고급 설정에 넣은 원문 링크·DOI */
  sourceUrl?: string | null;
  doi?: string | null;
};

const DOI_RE = /\b10\.\d{4,9}\/[^\s"'<>),;]+/i;
const URL_RE = /https?:\/\/[^\s<>"')]+/i;
const YEAR_RE = /\b(19|20)\d{2}\b/;

/** 줄 맨 앞 불릿·번호 */
const BULLET_RE = /^\s*(?:[-•*·▪◦‣–]|\d{1,2}[.)]|[①②③④⑤⑥⑦⑧⑨]|\(\d{1,2}\))\s+/;

/** 구역 제목으로 쓰이는 말 → 어떤 구역인지 */
const SECTION_DEFS: { key: "background" | "method" | "result" | "conclusion" | "clinical" | "limit" | "source" | "title"; re: RegExp }[] = [
  { key: "title", re: /^(제목|논문\s*제목|title)$/i },
  { key: "background", re: /^(연구\s*)?(배경|목적)|^background|^objective|^introduction|^purpose/i },
  { key: "method", re: /^(연구\s*)?(방법|대상|설계)|^methods?|^materials?|^study\s*design|^animals?/i },
  { key: "result", re: /^(주요\s*|핵심\s*|연구\s*)?결과|^results?|^findings?/i },
  { key: "conclusion", re: /^결론|^요약|^conclusions?|^summary/i },
  { key: "clinical", re: /^임상(적)?\s*(적용|포인트|의의|시사점|적\s*의의)?|^시사점|^clinical\s*(relevance|significance|implications?|pearls?)|^take[-\s]?home/i },
  { key: "limit", re: /^(연구의?\s*)?(한계|제한점|제한|주의)(점|사항)?|^limitations?|^caveats?/i },
  { key: "source", re: /^(출처|참고\s*문헌|원문|저널|reference|source|citation)s?$/i },
];

/** "제목: 내용" / "[결과] 내용" / "## 결과" 꼴에서 제목과 나머지를 뗀다 */
function splitLabel(line: string): { label: string; rest: string } | null {
  const stripped = line.replace(/^#{1,6}\s*/, "").replace(/^\s*(?:\d{1,2}[.)]\s*)?/, "");
  const m =
    stripped.match(/^[\[【(]\s*([^\]】)]{1,24})\s*[\]】)]\s*[:：\-–]?\s*(.*)$/) ??
    stripped.match(/^([A-Za-z가-힣][A-Za-z가-힣\s·/]{0,22}?)\s*[:：]\s*(.*)$/) ??
    (line.startsWith("#") ? stripped.match(/^(.{1,24})()$/) : null);
  if (!m) return null;
  return { label: m[1].trim(), rest: (m[2] ?? "").trim() };
}

function sectionKeyOf(label: string) {
  const l = label.trim();
  return SECTION_DEFS.find((d) => d.re.test(l))?.key ?? null;
}

/** 문장 나누기. 소수점(65.4%)·약어 뒤에서는 나누지 않도록 "마침표 + 공백 + 새 문장 시작"만 본다. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。]["')\]]?)\s+(?=[A-Z가-힣0-9"'(\[])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

/** 길면 자연스러운 곳(쉼표·공백)에서 자르고 말줄임표. 새 글자를 만들지 않는다. */
export function clip(text: string, max: number): string {
  const t = cleanText(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf(" "));
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,\s]+$/, "") + "…";
}

const CATEGORY_HINTS: [CategoryKey, RegExp][] = [
  ["dermatology", /피부|아토피|외이염|소양|가려움|dermat|atopic|otitis|pruritus|pyoderma/i],
  ["ophthalmology", /안과|각막|결막|녹내장|백내장|눈꺼풀|ophthalm|cornea|glaucoma|cataract|eyelid|uveitis/i],
  ["oncology", /종양|암종|림프종|항암|전이|oncolog|tumou?r|lymphoma|carcinoma|sarcoma|chemotherap/i],
  ["cardiology", /심장|판막|심근|부정맥|심부전|cardi|mitral|arrhythm/i],
  ["neurology", /신경|발작|경련|추간판|척수|뇌|neuro|seizure|epilep|IVDD|spinal/i],
  ["imaging", /영상|초음파|방사선|CT\b|MRI\b|radiograph|ultrasonograph|imaging/i],
  ["dentistry", /치과|치주|구강|발치|dental|periodont|stomatitis/i],
  ["emergency", /응급|중환자|쇼크|수혈|패혈|emergency|critical\s*care|sepsis|shock|transfusion/i],
  ["anesthesia", /마취|진통|통증\s*관리|진정|anesth|anaesth|analges|sedation/i],
  ["infectious", /감염|항생제|내성|세균|바이러스|진균|기생충|antibiotic|antimicrobial|resistan|bacteri|viral|fungal|parasit|E\.\s?coli/i],
  ["nutrition", /영양|식이|사료|비만|체중|nutrition|diet\b|dietary|obes/i],
  ["surgery", /외과|수술|절제|봉합|골절|십자인대|슬개골|surg|ectomy|osteotomy|TPLO|fracture|cruciate/i],
  ["internal", /내과|신장|간담|췌장|내분비|당뇨|쿠싱|갑상선|장병증|소화기|호흡기|renal|kidney|hepat|pancrea|endocrin|diabet|enteropathy|gastro/i],
];

export function guessCategory(text: string): CategoryKey | null {
  for (const [key, re] of CATEGORY_HINTS) if (re.test(text)) return key;
  return null;
}

const LIMIT_HINT = /한계|제한점|제한적|주의가\s*필요|주의해야|추가\s*연구|후속\s*연구|표본\s*(수|크기)가\s*작|일반화|해석에\s*주의|limitation|small\s*sample|further\s*(stud|research)|caution/i;
const CLINICAL_HINT = /임상적으로|임상에서|진료(에서|에)|권장|권고|고려할\s*(수|만)|고려해|추천|시사|적용할\s*수|보는\s*것이\s*좋|해\s*볼\s*만|의심해|should\s*be\s*considered|clinically|recommend/i;
const RESULT_HINT = /결과|유의|차이|감소|증가|개선|호전|재발|생존|반응률|관해|감수성|비열등|우월|보였|나타났|확인되|관찰되|%|p\s*[<=>]/i;

/** "A군 65.4%, B군 69.5%" 처럼 한 문장에 "이름 + 숫자%" 가 정확히 2쌍 있을 때만 비교 구역을 만든다 */
function findComparison(sentences: string[]): CardBlock | null {
  const PAIR = /([A-Za-z가-힣][A-Za-z가-힣-]{1,24})\s*(?:군|그룹|투여군|치료군)?\s*(?:이|가|은|는|에서|:)?\s*(\d+(?:\.\d+)?\s?%)/g;
  for (const s of sentences) {
    const pairs = [...s.matchAll(PAIR)];
    if (pairs.length === 2 && pairs[0][1].toLowerCase() !== pairs[1][1].toLowerCase()) {
      return {
        kind: "comparison",
        leftLabel: pairs[0][1],
        leftValue: pairs[0][2].replace(/\s/g, ""),
        rightLabel: pairs[1][1],
        rightValue: pairs[1][2].replace(/\s/g, ""),
        description: clip(s, 260),
      };
    }
  }
  return null;
}

/** 결과 문장에서 눈에 띄는 숫자 하나 (단위까지 원문 그대로) */
function findMetric(sentences: string[]): CardBlock | null {
  const METRIC = /\d+(?:[.,]\d+)*\s?(?:%|마리|명|건|례|배|주|개월|일|mg\/kg|mg|㎎)/;
  for (const s of sentences) {
    if (!RESULT_HINT.test(s)) continue;
    const m = s.match(METRIC);
    if (m) return { kind: "metric", value: m[0].replace(/\s/g, ""), label: "핵심 수치", note: clip(s, 180) };
  }
  return null;
}

function pickVariant(blocks: CardBlock[], raw: string): LayoutVariant {
  if (blocks.some((b) => b.kind === "comparison")) return "comparison";
  if (blocks.some((b) => b.kind === "metric")) return "metric";
  if (/증례|케이스|case\s*(report|series)/i.test(raw)) return "case";
  if (blocks.some((b) => b.kind === "bullets") && /단계|순서|프로토콜|절차|protocol|step/i.test(raw)) return "process";
  if (blocks.some((b) => b.kind === "clinical")) return "clinical";
  if (blocks.length <= 2) return "minimal";
  return "editorial";
}

/**
 * 줄글 1개 → 카드 1장.
 * 반환값은 항상 paperCardSchema 를 통과한 카드 하나다 (배열이 아니다).
 */
export function designCardByRules(rawInput: string, opts: DesignOptions = {}): PaperCardContent {
  const raw = rawInput.replace(/\r\n/g, "\n").trim();
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  // ── 출처 정보: 원문(또는 관리자 입력)에 있는 것만 ──
  const doi = opts.doi?.trim() || raw.match(DOI_RE)?.[0] || null;
  const urlInText = raw.match(URL_RE)?.[0]?.replace(/[.,;]+$/, "") || null;
  const url = opts.sourceUrl?.trim() || urlInText || null;

  // ── 구역 나누기 ──
  type SecKey = NonNullable<ReturnType<typeof sectionKeyOf>>;
  const sections = new Map<SecKey, string[]>();
  const free: string[] = []; // 제목 없는 일반 줄
  const bullets: string[] = [];
  let current: SecKey | null = null;
  let labeledTitle: string | null = null;

  for (const line of lines) {
    const lab = splitLabel(line);
    const key = lab ? sectionKeyOf(lab.label) : null;
    if (lab && key) {
      current = key;
      if (key === "title") {
        if (lab.rest) labeledTitle = lab.rest;
        current = null;
        continue;
      }
      if (!sections.has(key)) sections.set(key, []);
      if (lab.rest) sections.get(key)!.push(lab.rest);
      continue;
    }
    if (BULLET_RE.test(line)) {
      const item = line.replace(BULLET_RE, "").trim();
      if (!item) continue;
      if (current) sections.get(current)!.push(item);
      else bullets.push(item);
      continue;
    }
    if (current) sections.get(current)!.push(line);
    else free.push(line);
  }

  const sourceLines = sections.get("source") ?? [];
  sections.delete("source");
  const hasSections = sections.size > 0;

  // 출처 줄에서 저널·연도 (라벨이 "출처:" 등으로 명시된 줄에서만 — 본문에서 추측하지 않는다)
  let journal: string | null = null;
  let year: string | null = null;
  if (sourceLines.length > 0) {
    const src = sourceLines.join(" ").replace(URL_RE, "").replace(DOI_RE, "").replace(/\bdoi\s*[:：]?\s*/i, "").replace(/[\s.;,]+$/, "").trim();
    if (src) {
      journal = clip(src, 110);
      year = src.match(YEAR_RE)?.[0] ?? null;
    }
  }

  // ── 본문 문장 ──
  const freeText = free.join(" ");
  const freeSentences = splitSentences(freeText);

  // ── 제목 ──
  let headline: string;
  const usedForHeadline = new Set<string>();
  if (labeledTitle) {
    headline = clip(labeledTitle, 100);
  } else if (free.length > 0 && free[0].length <= 70 && !/[.。]$/.test(free[0]) && (free.length > 1 || hasSections || bullets.length > 0)) {
    // 첫 줄이 짧고 마침표로 끝나지 않으면 제목으로 본다
    headline = clip(free[0], 100);
    usedForHeadline.add(free[0]);
  } else {
    const first = freeSentences[0] ?? sections.get("conclusion")?.[0] ?? sections.get("result")?.[0] ?? bullets[0] ?? lines[0] ?? "제목 없음";
    headline = clip(first.replace(/[.。]$/, ""), 100);
    usedForHeadline.add(first);
  }

  // 제목으로 쓴 줄은 본문에서 뺀다
  const body = splitSentences(free.filter((l) => !usedForHeadline.has(l)).join(" ")).filter((s) => !usedForHeadline.has(s));

  const blocks: CardBlock[] = [];
  const usedSentences = new Set<string>();
  const take = (s: string) => {
    usedSentences.add(s);
    return s;
  };

  // ── 한 줄 핵심 ──
  let lead: string | null = null;
  const conclusion = sections.get("conclusion");
  if (conclusion?.length) {
    const s = splitSentences(conclusion.join(" "))[0] ?? conclusion[0];
    lead = clip(s, 200);
    take(s);
  } else {
    const cand = body.find((s) => RESULT_HINT.test(s) && !LIMIT_HINT.test(s)) ?? body[0];
    if (cand) lead = clip(take(cand), 200);
  }

  if (hasSections) {
    // ── 구역 제목이 있는 요약: 그 구조를 그대로 살린다 ──
    const sec = (k: SecKey) => sections.get(k) ?? [];
    const asBlock = (label: string, items: string[]): CardBlock | null => {
      if (items.length === 0) return null;
      if (items.length === 1) return { kind: "keyPoint", label, text: clip(items[0], 300) };
      return { kind: "bullets", label, items: items.slice(0, 4).map((t) => clip(t, 180)) };
    };
    const resultSentences = sec("result").flatMap((l) => splitSentences(l));
    const cmp = findComparison(resultSentences);
    const metric = cmp ? null : findMetric(resultSentences);
    const add = (b: CardBlock | null) => b && blocks.push(b);
    add(asBlock("연구 배경", sec("background")));
    add(asBlock("연구 방법", sec("method")));
    add(cmp ?? metric);
    add(asBlock("주요 결과", sec("result")));
    if (sec("clinical").length) blocks.push({ kind: "clinical", text: clip(sec("clinical").join(" "), 300) });
    if (sec("limit").length) blocks.push({ kind: "caution", text: clip(sec("limit").join(" "), 300) });
    if (bullets.length) add(asBlock("핵심 요약", bullets));
  } else {
    // ── 그냥 줄글 / 불릿 ──
    const rest = body.filter((s) => !usedSentences.has(s));
    const cmp = findComparison([...(lead ? [lead] : []), ...body]);
    // 비교 설명이 한 줄 핵심과 같은 문장이면 두 번 싣지 않는다
    if (cmp?.kind === "comparison" && cmp.description === lead) cmp.description = null;
    const metric = cmp ? null : findMetric(body);
    if (cmp) blocks.push(cmp);
    else if (metric) blocks.push(metric);

    const limit = rest.find((s) => LIMIT_HINT.test(s));
    const clinical = rest.find((s) => s !== limit && CLINICAL_HINT.test(s));
    const others = rest.filter((s) => s !== limit && s !== clinical);

    if (bullets.length > 0) {
      blocks.push({ kind: "bullets", label: "핵심 요약", items: bullets.slice(0, 4).map((t) => clip(t, 180)) });
    } else if (others.length === 1) {
      blocks.push({ kind: "keyPoint", label: "핵심 요약", text: clip(others[0], 300) });
    } else if (others.length > 1) {
      blocks.push({ kind: "bullets", label: "핵심 요약", items: others.slice(0, 3).map((t) => clip(t, 180)) });
    }
    if (clinical) blocks.push({ kind: "clinical", text: clip(clinical, 300) });
    if (limit) blocks.push({ kind: "caution", text: clip(limit, 300) });
  }

  const finalBlocks = blocks.slice(0, 5);

  const flags = ["rule-based"];
  if (!journal && !doi && !url) flags.push("missing-source-metadata");
  if (raw.length > 1200) flags.push("long-source-condensed");

  // 카드 문구 ↔ 원문 대응 (규칙 생성기는 원문 문장을 그대로 쓰므로 자기 자신이 근거)
  const attribution = [
    { displayText: headline, sourceExcerpt: headline.replace(/…$/, "") },
    ...(lead ? [{ displayText: lead, sourceExcerpt: lead.replace(/…$/, "") }] : []),
  ];

  const card = {
    schemaVersion: 1 as const,
    category: opts.category ?? guessCategory(raw),
    headline,
    lead,
    layoutVariant: pickVariant(finalBlocks, raw),
    blocks: finalBlocks,
    source: { journal, year, studyType: null, title: null, doi, url },
    attribution,
    flags,
  };

  // 규격 검증을 한 번 더 통과시켜 항상 같은 모양을 돌려준다
  return paperCardSchema.parse(card);
}
