"use client";

import { createContext, useContext } from "react";
import { positionToTeam, type Team } from "@/lib/utils/team";
import type { Position } from "@/lib/types/member";

interface AuthInfo {
  userId: string;
  userName: string;
  isAdmin: boolean;
  role: string;
  position: string | null;
}

const AuthContext = createContext<AuthInfo>({
  userId: "",
  userName: "",
  isAdmin: false,
  role: "user",
  position: null,
});

export const AuthProvider = AuthContext.Provider;

export function useAuth() {
  const ctx = useContext(AuthContext);
  const team: Team | null = positionToTeam(ctx.position as Position | null);
  return {
    ...ctx,
    team,
    isTeamManager: ctx.role === "team_manager",
    /** 전체관리자 또는 팀관리자 */
    isManager: ctx.role === "admin" || ctx.role === "team_manager",
  };
}

export function useIsAdmin() {
  return useContext(AuthContext).isAdmin;
}
