export type Position = "manager" | "technician" | "veterinarian" | "admin_staff";

export const POSITION_LABEL: Record<Position, string> = {
  manager: "매니저",
  technician: "테크니션",
  veterinarian: "수의사",
  admin_staff: "행정",
};
