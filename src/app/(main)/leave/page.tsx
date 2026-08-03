import type { Metadata } from "next";
import { LeavePage } from "@/components/leave/leave-page";

export const metadata: Metadata = {
  title: "연차",
};

export default function LeavePageRoute() {
  return <LeavePage />;
}
