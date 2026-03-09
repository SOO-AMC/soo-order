import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types/order";

const STATUS_DOT_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-500",
  ordered: "bg-green-500",
  inspecting: "bg-blue-500",
  return_requested: "bg-orange-500",
  return_completed: "bg-gray-400",
  out_of_stock: "bg-red-500",
};

const STATUS_BG_COLORS: Record<OrderStatus, string> = {
  pending: "bg-yellow-50 text-yellow-800",
  ordered: "bg-green-50 text-green-800",
  inspecting: "bg-blue-50 text-blue-800",
  return_requested: "bg-orange-50 text-orange-800",
  return_completed: "bg-gray-50 text-gray-600",
  out_of_stock: "bg-red-50 text-red-800",
};

const DISPLAY_ORDER: OrderStatus[] = ["pending", "ordered", "out_of_stock", "return_requested", "inspecting"];

interface StatusSummaryProps {
  counts: Partial<Record<OrderStatus, number>>;
}

export function StatusSummary({ counts }: StatusSummaryProps) {
  const items = DISPLAY_ORDER.filter((s) => (counts[s] ?? 0) > 0);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((status) => (
        <span
          key={status}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${STATUS_BG_COLORS[status]}`}
        >
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT_COLORS[status]}`} />
          {ORDER_STATUS_LABEL[status]} {counts[status]}
        </span>
      ))}
    </div>
  );
}
