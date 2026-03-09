"use client";

import { createContext, useContext } from "react";

interface AuthInfo {
  userId: string;
  userName: string;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthInfo>({
  userId: "",
  userName: "",
  isAdmin: false,
});

export const AuthProvider = AuthContext.Provider;

export function useAuth() {
  return useContext(AuthContext);
}

export function useIsAdmin() {
  return useContext(AuthContext).isAdmin;
}
