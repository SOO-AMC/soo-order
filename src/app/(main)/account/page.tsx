import type { Metadata } from "next";
import { AccountPage } from "@/components/account/account-page";

export const metadata: Metadata = {
  title: "내 계정",
};

export default function AccountRoute() {
  return <AccountPage />;
}
