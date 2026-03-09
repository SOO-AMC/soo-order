import { BLOOD_STATUS_LABEL, type BloodStatus } from "@/lib/types/blood";

const STATUS_COLORS: Record<BloodStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  confirmed: "bg-green-100 text-green-800 border-green-300",
};

const STATUS_DOT_COLORS: Record<BloodStatus, string> = {
  pending: "bg-yellow-500",
  confirmed: "bg-green-500",
};

export function BloodStatusBadge({ status }: { status: BloodStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_COLORS[status]}`} />
      {BLOOD_STATUS_LABEL[status]}
    </span>
  );
}
