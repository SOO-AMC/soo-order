"use client";

import { createContext, useContext } from "react";

const AdminContext = createContext(false);

export const AdminProvider = AdminContext.Provider;

export function useIsAdmin() {
  return useContext(AdminContext);
}
