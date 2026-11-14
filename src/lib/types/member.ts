/** display = 세미나실 화면 전용 계정 (라운딩 대기 모드만 열 수 있다) */
export type Role = "admin" | "team_manager" | "user" | "display";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "전체관리자",
  team_manager: "팀관리자",
  user: "일반",
  display: "세미나실 화면",
};

export type Position =
  | "manager"
  | "technician"
  | "veterinarian"
  | "intern_vet"
  | "radiologist"
  | "admin_staff";

export const POSITION_LABEL: Record<Position, string> = {
  manager: "매니저",
  technician: "테크니션",
  veterinarian: "수의사",
  intern_vet: "인턴수의사",
  radiologist: "방사선사",
  admin_staff: "행정",
};
