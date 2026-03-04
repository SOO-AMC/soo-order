"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkAdmin = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "admin") {
        router.replace("/orders");
      } else {
        setIsLoading(false);
      }
    };
    checkAdmin();
  }, [router, supabase]);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground">권한 확인 중...</p>
      </div>
    );
  }

  return <>{children}</>;
}
