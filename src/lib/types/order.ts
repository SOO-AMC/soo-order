export type OrderType = "order" | "return";
export type OrderStatus = "pending" | "ordered" | "inspecting";

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
}

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  order: "주문",
  return: "반품",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "요청중",
  ordered: "발주완료",
  inspecting: "검수완료",
};
