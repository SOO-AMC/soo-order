"use client";

import { useMemo } from "react";
import { TabCountsContext, useTabCountsProvider } from "@/hooks/use-tab-counts";
import { AuthProvider } from "@/hooks/use-auth";

interface LayoutProvidersProps {
  userId: string;
  userName: string;
  isAdmin: boolean;
  children: React.ReactNode;
}

export function LayoutProviders({ userId, userName, isAdmin, children }: LayoutProvidersProps) {
  const counts = useTabCountsProvider();
  const authValue = useMemo(
    () => ({ userId, userName, isAdmin }),
    [userId, userName, isAdmin]
  );

  return (
    <AuthProvider value={authValue}>
      <TabCountsContext.Provider value={counts}>
        {children}
      </TabCountsContext.Provider>
    </AuthProvider>
  );
}
