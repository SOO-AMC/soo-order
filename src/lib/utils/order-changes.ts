export interface OrderSnapshot {
  item_name: string;
  quantity: number;
  unit: string;
  is_urgent: boolean;
  notes: string;
  vendor_name: string;
  photoCount: number;
}

const formatQty = (q: number, u: string) => (q > 0 ? `${q}${u ? ` ${u}` : ""}` : "(미입력)");

/** 주문 수정 전/후를 비교해 변경 내역을 한국어 문자열 배열로 반환 */
export function describeOrderChanges(prev: OrderSnapshot, next: OrderSnapshot): string[] {
  const changes: string[] = [];

  if (prev.item_name !== next.item_name) {
    changes.push(`품목명: ${prev.item_name} → ${next.item_name}`);
  }
  if (prev.quantity !== next.quantity || prev.unit !== next.unit) {
    changes.push(`수량: ${formatQty(prev.quantity, prev.unit)} → ${formatQty(next.quantity, next.unit)}`);
  }
  if (prev.notes !== next.notes) {
    changes.push(next.notes ? `비고: ${next.notes}` : "비고 삭제");
  }
  if (prev.is_urgent !== next.is_urgent) {
    changes.push(next.is_urgent ? "긴급으로 변경" : "긴급 해제");
  }
  if (prev.vendor_name !== next.vendor_name) {
    changes.push(next.vendor_name ? `업체명: ${next.vendor_name}` : "업체명 삭제");
  }
  if (prev.photoCount !== next.photoCount) {
    changes.push("사진 변경");
  }

  return changes;
}
