import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { BloodListPage } from "@/components/blood/blood-list-page";

export const metadata: Metadata = {
  title: "혈액 대장",
};

export default function BloodPage() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-card px-4 py-3 shadow-header">
        <div className="flex items-center gap-2">
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
          <h1 className="text-lg font-bold">혈액 대장</h1>
        </div>
        <Button size="icon" asChild>
          <Link href="/blood/new">
            <Plus />
          </Link>
        </Button>
      </header>
      <BloodListPage />
    </div>
  );
}
