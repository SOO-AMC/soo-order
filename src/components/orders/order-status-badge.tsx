import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types/order";

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  ordered: "bg-green-100 text-green-800 border-green-300",
  inspecting: "bg-blue-100 text-blue-800 border-blue-300",
  return_requested: "bg-orange-100 text-orange-800 border-orange-300",
  return_completed: "bg-gray-100 text-gray-600 border-gray-300",
  out_of_stock: "bg-red-100 text-red-800 border-red-300",
};

const STATUS_DOT_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-500",
  ordered: "bg-green-500",
  inspecting: "bg-blue-500",
  return_requested: "bg-orange-500",
  return_completed: "bg-gray-400",
  out_of_stock: "bg-red-500",
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
  const row1: { status: OrderStatus; label: string }[] = [
    { status: "pending", label: "주문신청" },
    { status: "ordered", label: "검수대기" },
  ];
  const row2: { status: OrderStatus; label: string }[] = [
    { status: "inspecting", label: "검수완료" },
    { status: "return_requested", label: "반품신청" },
    { status: "out_of_stock", label: "품절" },
  ];

  const Item = ({ status, label }: { status: OrderStatus; label: string }) => (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${STATUS_DOT_COLORS[status]}`} />
      {label}
    </span>
  );

  return (
    <div className="flex flex-col items-end gap-0.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-2">
      <div className="flex items-center gap-3">
        {row1.map((item) => <Item key={item.status} {...item} />)}
      </div>
      <div className="flex items-center gap-3">
        {row2.map((item) => <Item key={item.status} {...item} />)}
      </div>
    </div>
  );
}
