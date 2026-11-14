import { MyOrdersPage } from "@/components/my-orders/my-orders-page";

// 데이터는 화면이 뜬 뒤에 한 번만 읽는다 (여기서도 읽으면 같은 조회가 두 번 돈다)
export default function DashboardRoute() {
  return <MyOrdersPage />;
}
