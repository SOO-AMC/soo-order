export type OrderType = "order" | "return";
export type OrderStatus = "pending" | "ordered" | "inspecting" | "return_requested" | "return_pending" | "return_completed" | "out_of_stock";

export interface Order {
  id: string;
  type: OrderType;
  item_name: string;
  quantity: number;
  unit: string;
  status: OrderStatus;
  requester_id: string;
  updated_by: string | null;
  dispatched_at: string | null;
  vendor_name: string;
  confirmed_quantity: number | null;
  received_quantity: number | null;
  invoice_received: boolean | null;
  inspected_by: string | null;
  inspected_at: string | null;
  photo_urls: string[];
  is_urgent: boolean;
  return_quantity: number | null;
  return_reason: string | null;
  return_requested_by: string | null;
  return_requested_at: string | null;
  return_photo_urls: string[];
  inspection_memo: string | null;
  notes: string;
  order_notes: string;
  inspection_notes: string;
  /** 품절 사유·시각, 주문자가 확인한 시각 (supabase/migrate-order-reasons.sql — 실행 전에는 없다) */
  out_of_stock_reason?: string | null;
  out_of_stock_at?: string | null;
  out_of_stock_ack_at?: string | null;
  /** 관리자가 마지막으로 바꾼 내용과 이유 (예: "수량: 3 박스 → 2 박스") */
  admin_change_summary?: string | null;
  admin_change_reason?: string | null;
  admin_change_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderWithRequester extends Order {
  requester: {
    full_name: string | null;
  };
  updater: {
    full_name: string | null;
  } | null;
  inspector: {
    full_name: string | null;
  } | null;
  return_requester: {
    full_name: string | null;
  } | null;
}

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  order: "주문",
  return: "반품",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "주문신청",
  ordered: "검수대기",
  inspecting: "검수완료",
  return_requested: "반품신청",
  return_pending: "반품대기",
  return_completed: "반품완료",
  out_of_stock: "품절",
};
