import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ReturnDetailLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/returns">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">반품 상세</h1>
      </header>
      <div className="p-4">
        <div className="space-y-6 rounded-2xl bg-card p-5 shadow-card animate-pulse">
          <div className="flex items-center gap-2">
            <div className="h-6 w-16 rounded-full bg-muted" />
          </div>
          <div className="h-px bg-muted" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="h-3 w-16 rounded bg-muted" />
                <div className="mt-1.5 h-4 w-32 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
