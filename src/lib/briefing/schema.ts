import { z } from "zod";

/**
 * 논문 브리핑 카드 규격 (schemaVersion 1).
 *
 * 불변 규칙: 논문 1건 = 카드 1장.
 *  - 이 규격에는 slides[] / pages[] 가 없다. `.strict()` 라서 그런 키가 들어오면 검증에서 떨어진다.
 *  - blocks[] 는 "한 장 안의 구역"이다. 장수가 아니다.
 *  - AI(또는 규칙 생성기)는 이 JSON만 만든다. HTML/CSS/JS 문자열은 받지 않는다(꺾쇠 태그는 제거).
 */

export const LAYOUT_VARIANTS = ["editorial", "metric", "comparison", "case", "clinical", "process", "minimal", "brief"] as const;
export type LayoutVariant = (typeof LAYOUT_VARIANTS)[number];

export const LAYOUT_LABEL: Record<LayoutVariant, string> = {
  editorial: "글 중심",
  metric: "숫자 강조",
  comparison: "비교",
  case: "증례",
  clinical: "임상 포인트",
  process: "순서·단계",
  minimal: "간결",
  brief: "한 문단",
};

/** 진료 분야 (자동 추정 또는 관리자가 고름). 없으면 null = "분야 미지정" */
export const CATEGORY_KEYS = [
  "dermatology",
  "ophthalmology",
  "surgery",
  "internal",
  "oncology",
  "cardiology",
  "neurology",
  "imaging",
  "dentistry",
  "emergency",
  "anesthesia",
  "infectious",
  "nutrition",
  "etc",
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const CATEGORY_LABEL: Record<CategoryKey, { ko: string; en: string }> = {
  dermatology: { ko: "피부과", en: "DERMATOLOGY" },
  ophthalmology: { ko: "안과", en: "OPHTHALMOLOGY" },
  surgery: { ko: "외과", en: "SURGERY" },
  internal: { ko: "내과", en: "INTERNAL MEDICINE" },
  oncology: { ko: "종양", en: "ONCOLOGY" },
  cardiology: { ko: "심장", en: "CARDIOLOGY" },
  neurology: { ko: "신경", en: "NEUROLOGY" },
  imaging: { ko: "영상", en: "IMAGING" },
  dentistry: { ko: "치과", en: "DENTISTRY" },
  emergency: { ko: "응급·중환자", en: "EMERGENCY" },
  anesthesia: { ko: "마취·통증", en: "ANESTHESIA" },
  infectious: { ko: "감염", en: "INFECTIOUS DISEASE" },
  nutrition: { ko: "영양", en: "NUTRITION" },
  etc: { ko: "기타", en: "GENERAL" },
};

/** 꺾쇠 태그 제거 + 공백 정리. 카드 글자는 전부 순수 텍스트다. */
export function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const text = (max: number) => z.string().transform(cleanText).pipe(z.string().min(1).max(max));
const optText = (max: number) =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().max(max))
    .nullish()
    .transform((v) => (v ? v : null));

/** http(s) 주소만 허용 (javascript: 등 차단) */
const safeUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https?:\/\/[^\s<>"']+$/i.test(v), "http(s) 주소만 넣을 수 있어요")
  .nullish()
  .transform((v) => (v ? v : null));

/** keyPoint 글은 한 문단형(brief) 카드의 요약 문단이 될 수 있어 600자까지 */
const keyPointBlock = z.object({ kind: z.literal("keyPoint"), label: text(24), text: text(600) }).strict();
const bulletsBlock = z
  .object({ kind: z.literal("bullets"), label: text(24), items: z.array(text(200)).min(1).max(5) })
  .strict();
const metricBlock = z
  .object({ kind: z.literal("metric"), value: text(28), label: text(60), note: optText(200) })
  .strict();
const comparisonBlock = z
  .object({
    kind: z.literal("comparison"),
    leftLabel: text(40),
    leftValue: optText(28),
    rightLabel: text(40),
    rightValue: optText(28),
    description: optText(280),
  })
  .strict();
const clinicalBlock = z.object({ kind: z.literal("clinical"), text: text(320) }).strict();
const cautionBlock = z.object({ kind: z.literal("caution"), text: text(320) }).strict();

export const cardBlockSchema = z.discriminatedUnion("kind", [
  keyPointBlock,
  bulletsBlock,
  metricBlock,
  comparisonBlock,
  clinicalBlock,
  cautionBlock,
]);
export type CardBlock = z.infer<typeof cardBlockSchema>;

export const cardSourceSchema = z
  .object({
    journal: optText(120),
    year: optText(12),
    studyType: optText(60),
    title: optText(300),
    doi: optText(200),
    url: safeUrl,
    /** 저자 ("첫 저자 외") — 자동으로 찾은 논문만 */
    authors: optText(120),
    /** 무엇을 보고 요약했나 (예: "초록 기준 요약") — 자동으로 찾은 논문만 */
    basis: optText(40),
  })
  .strict();
export type CardSource = z.infer<typeof cardSourceSchema>;

/** 해설 페이지의 저자 — 교신저자(무료 원문·PubMed 표시로 확인된 경우) 또는 제1저자 */
export const detailAuthorSchema = z
  .object({ role: z.enum(["corresponding", "first"]), name: text(120), affiliation: optText(300) })
  .strict();
export type DetailAuthor = z.infer<typeof detailAuthorSchema>;

/**
 * 해설 (자동으로 찾은 논문만). 카드 아래 "해설 보기"로 여는 긴 글 — 장이 아니라 같은 논문의 읽을거리다.
 * paragraphs = 해설 문단들, clinical = 자세한 임상적 의미, author = 교신저자/제1저자(데이터베이스 값).
 */
export const cardDetailSchema = z
  .object({
    paragraphs: z.array(text(800)).max(6),
    clinical: optText(1200),
    author: detailAuthorSchema.nullish().transform((v) => v ?? null),
  })
  .strict();
export type CardDetail = z.infer<typeof cardDetailSchema>;

export const paperCardSchema = z
  .object({
    schemaVersion: z.literal(1),
    category: z.enum(CATEGORY_KEYS).nullish().transform((v) => v ?? null),
    headline: text(110),
    lead: optText(220),
    layoutVariant: z.enum(LAYOUT_VARIANTS),
    /** 한 장 안의 구역들 (최대 6). 장수가 아니다. */
    blocks: z.array(cardBlockSchema).max(6),
    source: cardSourceSchema,
    /** 카드 문구 ↔ 원문 대응 (검수용) */
    attribution: z
      .array(z.object({ displayText: text(320), sourceExcerpt: text(600) }).strict())
      .max(16)
      .default([]),
    flags: z.array(text(60)).max(12).default([]),
    detail: cardDetailSchema.nullish().transform((v) => v ?? null),
  })
  .strict();

export type PaperCardContent = z.infer<typeof paperCardSchema>;

export type CardParseResult = { ok: true; card: PaperCardContent } | { ok: false; error: string };

/** 어떤 값이든 안전하게 카드로 검증한다. 실패하면 이유를 사람 말로 돌려준다. */
export function parseCard(value: unknown): CardParseResult {
  const res = paperCardSchema.safeParse(value);
  if (res.success) return { ok: true, card: res.data };
  const first = res.error.issues[0];
  const where = first?.path.join(".") || "카드";
  return { ok: false, error: `${where}: ${first?.message ?? "형식이 맞지 않아요"}` };
}

/** 카드에 보이는 모든 글자를 한 줄씩 (대조·검색용) */
export function cardTexts(card: PaperCardContent): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [{ where: "제목", text: card.headline }];
  if (card.lead) out.push({ where: "한 줄 핵심", text: card.lead });
  card.blocks.forEach((b, i) => {
    const n = `구역 ${i + 1}`;
    if (b.kind === "keyPoint") out.push({ where: `${n}(${b.label})`, text: b.text });
    else if (b.kind === "bullets") b.items.forEach((t) => out.push({ where: `${n}(${b.label})`, text: t }));
    else if (b.kind === "metric") {
      out.push({ where: `${n}(숫자)`, text: b.value });
      out.push({ where: `${n}(숫자 설명)`, text: b.label });
      if (b.note) out.push({ where: `${n}(숫자 설명)`, text: b.note });
    } else if (b.kind === "comparison") {
      out.push({ where: `${n}(비교)`, text: [b.leftLabel, b.leftValue, b.rightLabel, b.rightValue].filter(Boolean).join(" ") });
      if (b.description) out.push({ where: `${n}(비교)`, text: b.description });
    } else out.push({ where: `${n}(${b.kind === "clinical" ? "임상 포인트" : "주의·한계"})`, text: b.text });
  });
  card.detail?.paragraphs.forEach((t, i) => out.push({ where: `해설 ${i + 1}문단`, text: t }));
  if (card.detail?.clinical) out.push({ where: "해설(임상적 의미)", text: card.detail.clinical });
  return out;
}
