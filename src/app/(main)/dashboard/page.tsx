import { MyOrdersPage } from "@/components/my-orders/my-orders-page";
import { fetchMyOrdersStatus, type MyOrdersData } from "@/lib/actions/my-orders-action";

export default async function DashboardRoute() {
  let initialData: MyOrdersData | undefined;
  try {
    initialData = await fetchMyOrdersStatus();
  } catch {
    // 실패 시 클라이언트가 다시 fetch
  }
  return <MyOrdersPage initialData={initialData} />;
}
