import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types/order";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const variantMap: Record<OrderStatus, "default" | "secondary" | "outline" | "destructive"> = {
    pending: "outline",
    ordered: "default",
    inspecting: "secondary",
    return_requested: "destructive",
    return_completed: "secondary",
  };

  return (
    <Badge variant={variantMap[status]}>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}
