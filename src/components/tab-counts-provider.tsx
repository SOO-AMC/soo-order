"use client";

import { useMemo } from "react";
import { TabCountsContext, useTabCountsProvider } from "@/hooks/use-tab-counts";
import { NotificationsContext, useNotificationsProvider } from "@/hooks/use-notifications";
import { AuthProvider } from "@/hooks/use-auth";

interface LayoutProvidersProps {
  userId: string;
  userName: string;
  isAdmin: boolean;
  role: string;
  position: string | null;
  children: React.ReactNode;
}

export function LayoutProviders({ userId, userName, isAdmin, role, position, children }: LayoutProvidersProps) {
  const counts = useTabCountsProvider();
  const notifications = useNotificationsProvider(userId);
  const authValue = useMemo(
    () => ({ userId, userName, isAdmin, role, position }),
    [userId, userName, isAdmin, role, position]
  );

  return (
    <AuthProvider value={authValue}>
      <NotificationsContext.Provider value={notifications}>
        <TabCountsContext.Provider value={counts}>
          {children}
        </TabCountsContext.Provider>
      </NotificationsContext.Provider>
    </AuthProvider>
  );
}
