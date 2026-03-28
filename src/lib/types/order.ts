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
  vendor_name: string;
  confirmed_quantity: number | null;
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
