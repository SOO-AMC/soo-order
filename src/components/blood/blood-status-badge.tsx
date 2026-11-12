import { BLOOD_STATUS_LABEL, type BloodStatus } from "@/lib/types/blood";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

/** 혈액 상태 → 공용 상태 톤. 대기 = 관리자 확인 필요(ask), 확인 = 완료(done). */
const BLOOD_STATUS_TONE: Record<BloodStatus, StatusTone> = {
  pending: "ask",
  confirmed: "done",
};

export function BloodStatusBadge({ status }: { status: BloodStatus }) {
  return <StatusBadge tone={BLOOD_STATUS_TONE[status]}>{BLOOD_STATUS_LABEL[status]}</StatusBadge>;
}
