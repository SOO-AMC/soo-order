export type BloodType = "received" | "sent";
export type BloodStatus = "pending" | "confirmed";
export type AnimalType = "dog" | "cat";
export type SettlementType = "invoice" | "transfer";

export interface BloodRecord {
  id: string;
  type: BloodType;
  record_date: string;
  hospital_name: string;
  animal_type: AnimalType;
  blood_type: string;
  volume_ml: number;
  collection_date: string;
  receiver: string | null;
  shipper: string | null;
  status: BloodStatus;
  settlement_type: SettlementType | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  notes: string;
}

export interface BloodRecordWithCreator extends BloodRecord {
  creator: {
    full_name: string | null;
  };
  confirmer: {
    full_name: string | null;
  } | null;
}

export const BLOOD_TYPE_LABEL: Record<BloodType, string> = {
  received: "수령",
  sent: "출고",
};

export const BLOOD_STATUS_LABEL: Record<BloodStatus, string> = {
  pending: "미확인",
  confirmed: "확인완료",
};

export const SETTLEMENT_TYPE_LABEL: Record<SettlementType, string> = {
  invoice: "거래명세서 돌림",
  transfer: "병원으로 입금",
};

export const ANIMAL_TYPE_LABEL: Record<AnimalType, string> = {
  dog: "개",
  cat: "고양이",
};
