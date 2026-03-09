import type { Metadata } from "next";
import { MorePage } from "@/components/more/more-page";

export const metadata: Metadata = {
  title: "더보기",
};

export default function MorePageRoute() {
  return <MorePage />;
}
