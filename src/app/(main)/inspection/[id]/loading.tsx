import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export default function InspectionDetailLoading() {
  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inspection">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">검수 상세</h1>
      </header>
      <div className="flex items-center justify-center py-24">
        <Spinner text="불러오는 중..." />
      </div>
    </div>
  );
}
