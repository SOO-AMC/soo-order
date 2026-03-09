import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";
import { ReturnList } from "@/components/returns/return-list";

export const metadata: Metadata = {
  title: "반품",
};

export default function ReturnsPage() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <div className="lg:hidden">
          <BackButton fallbackHref="/more" />
        </div>
        <h1 className="text-lg font-bold">반품</h1>
      </header>
      <div className="p-4">
        <ReturnList />
      </div>
    </div>
  );
}
