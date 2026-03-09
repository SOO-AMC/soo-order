import type { Metadata } from "next";
import { InspectionList } from "@/components/inspection/inspection-list";

export const metadata: Metadata = {
  title: "검수",
};

export default function InspectionPage() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-card px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">검수</h1>
      </header>
      <div className="p-4">
        <InspectionList />
      </div>
    </div>
  );
}
