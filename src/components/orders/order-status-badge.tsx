import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types/order";

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  ordered: "bg-green-100 text-green-800 border-green-300",
  inspecting: "bg-blue-100 text-blue-800 border-blue-300",
  return_requested: "bg-orange-100 text-orange-800 border-orange-300",
  return_completed: "bg-gray-100 text-gray-600 border-gray-300",
};

const STATUS_DOT_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-500",
  ordered: "bg-green-500",
  inspecting: "bg-blue-500",
  return_requested: "bg-orange-500",
  return_completed: "bg-gray-400",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_COLORS[status]}`} />
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

export function StatusLegend() {
  const items: { status: OrderStatus; label: string }[] = [
    { status: "pending", label: "주문신청" },
    { status: "ordered", label: "검수대기" },
    { status: "inspecting", label: "검수완료" },
    { status: "return_requested", label: "반품신청" },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 justify-items-end lg:flex lg:flex-wrap lg:items-center lg:gap-2">
      {items.map(({ status, label }) => (
        <span key={status} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT_COLORS[status]}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
