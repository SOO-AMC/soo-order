import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types/order";
import { STATUS_TONE_TEXT, StatusBadge, StatusIcon, type StatusTone } from "@/components/ui/status-badge";

/** 주문 상태 → 공용 상태 톤. 색 + 아이콘 모양으로 구분한다. */
export const ORDER_STATUS_TONE: Record<OrderStatus, StatusTone> = {
  pending: "todo",
  ordered: "doing",
  inspecting: "done",
  return_requested: "ask",
  return_pending: "doing",
  return_completed: "muted",
  out_of_stock: "late",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <StatusBadge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</StatusBadge>;
}

export function StatusLegend() {
  const row1: { status: OrderStatus; label: string }[] = [
    { status: "pending", label: "주문신청" },
    { status: "ordered", label: "검수대기" },
  ];
  const row2: { status: OrderStatus; label: string }[] = [
    { status: "inspecting", label: "검수완료" },
    { status: "return_requested", label: "반품신청" },
    { status: "return_pending", label: "반품대기" },
    { status: "out_of_stock", label: "품절" },
  ];

  const Item = ({ status, label }: { status: OrderStatus; label: string }) => (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <StatusIcon tone={ORDER_STATUS_TONE[status]} className={`size-3 ${STATUS_TONE_TEXT[ORDER_STATUS_TONE[status]]}`} />
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
