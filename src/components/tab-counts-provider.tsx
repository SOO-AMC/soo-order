"use client";

import { TabCountsContext, useTabCountsProvider } from "@/hooks/use-tab-counts";
import { AdminProvider } from "@/hooks/use-admin";

interface LayoutProvidersProps {
  isAdmin: boolean;
  children: React.ReactNode;
}

export function LayoutProviders({ isAdmin, children }: LayoutProvidersProps) {
  const counts = useTabCountsProvider();

  return (
    <AdminProvider value={isAdmin}>
      <TabCountsContext.Provider value={counts}>
        {children}
      </TabCountsContext.Provider>
    </AdminProvider>
  );
}
