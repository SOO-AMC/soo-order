import type { OrderWithRequester } from "@/lib/types/order";
import { toKSTDateString } from "@/lib/utils/format";

/** 주문·검수 목록 공용: 짧은 시각, 날짜 묶음, 수량 표시 */

const KST = "Asia/Seoul";

/** 목록용 짧은 시각 (KST). 날짜 묶음 안에서는 "14:05", 날짜가 섞인 묶음(긴급·업체별)에서는 "11. 10. 14:05" */
export function formatShort(iso: string, withDate: boolean): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit", hour12: false });
  if (!withDate) return time;
  return `${d.toLocaleDateString("ko-KR", { timeZone: KST, month: "2-digit", day: "2-digit" })} ${time}`;
}

/** 날짜 구분 행 제목: "11월 11일 (화)" (KST) */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const md = d.toLocaleDateString("ko-KR", { timeZone: KST, month: "long", day: "numeric" });
  const wd = d.toLocaleDateString("ko-KR", { timeZone: KST, weekday: "short" });
  return `${md} (${wd})`;
}

export type OrderGroup = {
  key: string;
  label: string;
  /** 오늘/어제 같은 보조 표시 */
  hint?: string;
  urgent?: boolean;
  /** 묶음 안 행들의 날짜가 섞여 있으면 시각에 날짜도 붙인다 */
  mixedDates?: boolean;
  orders: OrderWithRequester[];
};

/**
 * 긴급(맨 위 고정) → 날짜별(최신순) 묶음.
 * orders는 created_at 내림차순이어야 한다. todayKST는 컴포넌트에서 useState 지연 초기화로 받는다(렌더 중 new Date 금지).
 */
export function groupByDay(orders: OrderWithRequester[], todayKST: string): OrderGroup[] {
  const result: OrderGroup[] = [];
  const urgent = orders.filter((o) => o.is_urgent);
  if (urgent.length > 0) result.push({ key: "urgent", label: "긴급", urgent: true, mixedDates: true, orders: urgent });
  const yesterdayKST = toKSTDateString(new Date(new Date(`${todayKST}T12:00:00+09:00`).getTime() - 86400000).toISOString());
  const byDay = new Map<string, OrderGroup>();
  for (const o of orders) {
    if (o.is_urgent) continue;
    const key = toKSTDateString(o.created_at);
    let g = byDay.get(key);
    if (!g) {
      g = {
        key,
        label: formatDayLabel(o.created_at),
        hint: key === todayKST ? "오늘" : key === yesterdayKST ? "어제" : undefined,
        orders: [],
      };
      byDay.set(key, g);
      result.push(g);
    }
    g.orders.push(o);
  }
  return result;
}

/** 수량: 주문에 가장 중요한 정보라 보조 줄 안에서도 진하게 */
export function QuantityText({ order }: { order: OrderWithRequester }) {
  if (order.quantity > 0) {
    return (
      <span className="shrink-0 font-semibold tabular-nums text-foreground">
        {order.quantity}
        {order.unit ? ` ${order.unit}` : ""}
      </span>
    );
  }
  return <span className="shrink-0">사진 참고</span>;
}
