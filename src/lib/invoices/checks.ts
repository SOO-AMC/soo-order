/**
 * 명세서 확정 전 검사 (순수 함수).
 *
 * 종이 명세서를 글자로 읽으면 자릿수가 빠지거나 묶음 단가와 낱개 단가가 섞인다.
 * 예전에는 그런 값이 그대로 저장된 뒤에야 원장·분석에서 발견됐다. 여기서 확정 **전에** 걸러서,
 * 문제없는 줄은 접어 두고 확인이 필요한 줄만 사람이 보게 한다.
 */

import { isSuspectChange } from "@/lib/utils/price-outlier";

/** 품목이 가격표의 어느 줄과 어떻게 이어졌는가 */
export type MatchSource =
  | "memory" // 이 업체의 이 이름을 전에 확정한 적이 있다 (가장 확실)
  | "alias" // 품목 매칭에 연결돼 있다
  | "exact" // 가격표의 이름과 띄어쓰기만 다르다
  | "guess"; // 이름이 비슷해서 추측했다 → 확인 필요

export type IssueCode = "amount" | "price-jump" | "price-change" | "guess" | "new" | "leftover" | "other-vendor" | "zero";

export interface LineIssue {
  code: IssueCode;
  /** 줄 옆에 붙이는 짧은 말 */
  label: string;
  /** 왜 확인해야 하는지 */
  detail: string;
}

export interface LineCheckInput {
  quantity: number;
  /** 명세서에 찍힌 단가(할인전) */
  listPrice: number;
  /** 명세서에 찍힌 그 줄의 금액. 읽지 못했으면 null/0 */
  printedAmount?: number | null;
  /** 업체 할인율(%) */
  discountRate: number;
  /** 할인율을 적용한 단가(앱에 저장되는 값) */
  computedUnitPrice: number;
  /** 가격표에 지금 저장된 단가. 새 품목이면 null */
  currentUnitPrice: number | null;
  matchSource: MatchSource | null;
  isNewProduct: boolean;
  /** 주문에 맞추지 못하고 남은 수량 (음수면 주문보다 많이 맞춘 것) */
  leftover: number;
  /** 다른 업체로 발주했던 주문에 맞춘 건수 */
  otherVendorOrders: number;
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(2, Math.abs(b) * 0.005);

/**
 * 수량 × 단가가 찍힌 금액과 맞는가. 금액을 읽지 못했으면 null(검사하지 않음).
 * 명세서마다 금액 칸이 할인전·할인후, 부가세 별도·포함으로 달라서, 그중 하나와 맞으면 맞는 것으로 본다.
 */
export function amountConsistent(quantity: number, listPrice: number, printedAmount: number | null | undefined, discountRate: number): boolean | null {
  if (!printedAmount || printedAmount <= 0) return null;
  const base = quantity * listPrice;
  const discounted = quantity * Math.round(listPrice * (1 - discountRate / 100));
  return [base, discounted, base * 1.1, discounted * 1.1].some((c) => near(c, printedAmount));
}

/** 줄 합계가 명세서에 찍힌 총액과 맞는가. 총액을 읽지 못했으면 ok = null */
export function totalCheck(
  lines: { quantity: number; listPrice: number }[],
  printedTotal: number | null | undefined,
  discountRate: number,
): { ok: boolean | null; computed: number; printed: number } {
  const base = lines.reduce((s, l) => s + l.quantity * l.listPrice, 0);
  if (!printedTotal || printedTotal <= 0) return { ok: null, computed: base, printed: 0 };
  const discounted = lines.reduce((s, l) => s + l.quantity * Math.round(l.listPrice * (1 - discountRate / 100)), 0);
  const candidates = [base, discounted, base * 1.1, discounted * 1.1];
  const closest = candidates.reduce((best, c) => (Math.abs(c - printedTotal) < Math.abs(best - printedTotal) ? c : best), candidates[0]);
  return { ok: candidates.some((c) => near(c, printedTotal)), computed: Math.round(closest), printed: printedTotal };
}

/** 단가가 2배 이상 뛰었거나 절반 이하로 떨어졌는가 (자릿수·묶음 단위 오류 의심) */
export function isPriceJump(current: number | null, next: number): boolean {
  return isSuspectChange(current, next);
}

/** 한 줄의 확인할 점들. 비어 있으면 문제없는 줄 */
export function lineIssues(i: LineCheckInput): LineIssue[] {
  const issues: LineIssue[] = [];
  const won = (n: number) => `${Math.round(n).toLocaleString()}원`;

  if (!(i.quantity > 0) || !(i.listPrice > 0)) {
    issues.push({ code: "zero", label: "수량·단가 확인", detail: "수량이나 단가가 0이에요. 원본과 비교해 주세요." });
  }
  if (amountConsistent(i.quantity, i.listPrice, i.printedAmount, i.discountRate) === false) {
    issues.push({
      code: "amount",
      label: "금액이 안 맞음",
      detail: `수량 × 단가(${won(i.quantity * i.listPrice)})가 명세서의 금액(${won(i.printedAmount ?? 0)})과 달라요. 단가나 수량을 잘못 읽었을 수 있어요.`,
    });
  }
  if (i.isNewProduct) {
    issues.push({ code: "new", label: "새 품목", detail: "이 업체 가격표에 없는 품목이에요. 이름이 조금 달라서 못 찾은 것은 아닌지 확인해 주세요." });
  } else {
    if (i.matchSource === "guess") {
      issues.push({ code: "guess", label: "품목 추측", detail: "이름이 비슷한 품목에 연결했어요. 맞는지 확인해 주세요. 한 번 확정하면 다음부터는 묻지 않아요." });
    }
    if (i.currentUnitPrice != null && i.currentUnitPrice !== i.computedUnitPrice) {
      if (isPriceJump(i.currentUnitPrice, i.computedUnitPrice)) {
        issues.push({
          code: "price-jump",
          label: "단가 급변",
          detail: `저장된 단가 ${won(i.currentUnitPrice)}에서 ${won(i.computedUnitPrice)}(으)로 2배 넘게 달라져요. 자릿수나 묶음 단위를 확인해 주세요. 확인 전에는 단가를 갱신하지 않아요.`,
        });
      } else {
        issues.push({ code: "price-change", label: "단가 달라짐", detail: `저장된 단가 ${won(i.currentUnitPrice)} → ${won(i.computedUnitPrice)}` });
      }
    }
  }
  if (i.leftover !== 0) {
    issues.push({
      code: "leftover",
      label: i.leftover > 0 ? "주문에 못 맞춤" : "주문보다 많이 맞춤",
      detail: i.leftover > 0 ? `검수대기 주문에 맞추지 못한 수량이 ${i.leftover} 남았어요.` : `주문에 맞춘 수량이 명세서 수량보다 ${-i.leftover} 많아요.`,
    });
  }
  if (i.otherVendorOrders > 0) {
    issues.push({
      code: "other-vendor",
      label: "다른 업체 주문",
      detail: "다른 업체로 발주했던 주문에 맞췄어요(업체 휴무 등으로 바꿔 산 경우). 맞으면 확정할 때 그 주문의 업체가 이 업체로 바뀌어요.",
    });
  }
  return issues;
}
