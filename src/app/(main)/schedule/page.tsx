import type { Metadata } from "next";
import { SchedulePage } from "@/components/schedule/schedule-page";

export const metadata: Metadata = {
  title: "근무표",
};

export default function ScheduleRoute() {
  return <SchedulePage />;
}
