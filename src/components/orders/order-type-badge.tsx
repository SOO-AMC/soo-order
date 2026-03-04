import { Badge } from "@/components/ui/badge";
import { ORDER_TYPE_LABEL, type OrderType } from "@/lib/types/order";

export function OrderTypeBadge({ type }: { type: OrderType }) {
  return (
    <Badge variant={type === "order" ? "default" : "secondary"}>
      {ORDER_TYPE_LABEL[type]}
    </Badge>
  );
}
