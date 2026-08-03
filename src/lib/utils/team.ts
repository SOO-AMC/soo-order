import type { Position } from "@/lib/types/member";

// 연차 팀 = 직책 파생 (행정/admin_staff 는 팀 없음 → 연차 미사용)
export type Team = "vet" | "intern_vet" | "manager" | "tech";

export const TEAM_LABEL: Record<Team, string> = {
  vet: "수의사팀",
  intern_vet: "인턴수의사팀",
  manager: "매니저팀",
  tech: "간호팀",
};

export const TEAMS: Team[] = ["vet", "intern_vet", "manager", "tech"];

export function positionToTeam(position: Position | null | undefined): Team | null {
  switch (position) {
    case "veterinarian":
      return "vet";
    case "intern_vet":
      return "intern_vet";
    case "manager":
      return "manager";
    case "technician":
      return "tech";
    default:
      return null;
  }
}

export function teamToPosition(team: Team): Position {
  switch (team) {
    case "vet":
      return "veterinarian";
    case "intern_vet":
      return "intern_vet";
    case "manager":
      return "manager";
    case "tech":
      return "technician";
  }
}
