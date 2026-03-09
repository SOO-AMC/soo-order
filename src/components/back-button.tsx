"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  fallbackHref: string;
}

export function BackButton({ fallbackHref }: BackButtonProps) {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
    >
      <ChevronLeft />
    </Button>
  );
}
