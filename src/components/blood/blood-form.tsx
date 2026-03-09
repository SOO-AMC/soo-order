"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ANIMAL_TYPE_LABEL, type BloodType, type AnimalType, type BloodRecord } from "@/lib/types/blood";

export interface BloodFormData {
  type: BloodType;
  record_date: string;
  hospital_name: string;
  animal_type: AnimalType;
  blood_type: string;
  volume_ml: number;
  collection_date: string;
  receiver: string;
  shipper: string;
  notes: string;
}

interface BloodFormProps {
  defaultValues?: Partial<BloodRecord>;
  onSubmit: (data: BloodFormData) => Promise<void>;
}

export function BloodForm({ defaultValues, onSubmit }: BloodFormProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [type, setType] = useState<BloodType>(defaultValues?.type ?? "received");
  const [recordDate, setRecordDate] = useState(defaultValues?.record_date ?? today);
  const [hospitalName, setHospitalName] = useState(defaultValues?.hospital_name ?? "");
  const [animalType, setAnimalType] = useState<AnimalType>(defaultValues?.animal_type ?? "dog");
  const [bloodType, setBloodType] = useState(defaultValues?.blood_type ?? "");
  const [volumeMl, setVolumeMl] = useState(defaultValues?.volume_ml ?? 0);
  const [collectionDate, setCollectionDate] = useState(defaultValues?.collection_date ?? today);
  const [receiver, setReceiver] = useState(defaultValues?.receiver ?? "");
  const [shipper, setShipper] = useState(defaultValues?.shipper ?? "");
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isEdit = !!defaultValues;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!hospitalName.trim()) {
      setError("병원이름을 입력해주세요.");
      return;
    }
    if (!bloodType.trim()) {
      setError("혈액형을 입력해주세요.");
      return;
    }
    if (volumeMl <= 0) {
      setError("용량을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit({
        type,
        record_date: recordDate,
        hospital_name: hospitalName.trim(),
        animal_type: animalType,
        blood_type: bloodType.trim(),
        volume_ml: volumeMl,
        collection_date: collectionDate,
        receiver: receiver.trim(),
        shipper: shipper.trim(),
        notes: notes.trim(),
      });
    } catch {
      setError("저장에 실패했습니다.");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>유형</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={type === "received" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setType("received")}
          >
            수령
          </Button>
          <Button
            type="button"
            variant={type === "sent" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setType("sent")}
          >
            출고
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="record-date">{type === "received" ? "수령일자" : "출고일자"}</Label>
        <Input
          id="record-date"
          type="date"
          value={recordDate}
          onChange={(e) => setRecordDate(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="hospital-name">병원이름</Label>
        <Input
          id="hospital-name"
          placeholder="병원이름"
          value={hospitalName}
          onChange={(e) => setHospitalName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>개/고양이</Label>
        <Select value={animalType} onValueChange={(v) => setAnimalType(v as AnimalType)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ANIMAL_TYPE_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="blood-type">혈액형</Label>
        <Input
          id="blood-type"
          placeholder="예: A형, DEA1+"
          value={bloodType}
          onChange={(e) => setBloodType(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="volume-ml">용량 (mL)</Label>
        <Input
          id="volume-ml"
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="mL"
          value={volumeMl || ""}
          onChange={(e) => setVolumeMl(Number(e.target.value))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="collection-date">채혈일</Label>
        <Input
          id="collection-date"
          type="date"
          value={collectionDate}
          onChange={(e) => setCollectionDate(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="person">{type === "received" ? "수령인" : "출고인"}</Label>
        <Input
          id="person"
          placeholder={type === "received" ? "수령인" : "출고인"}
          value={type === "received" ? receiver : shipper}
          onChange={(e) =>
            type === "received"
              ? setReceiver(e.target.value)
              : setShipper(e.target.value)
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">비고</Label>
        <Input
          id="notes"
          placeholder="비고 (선택)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "저장 중..." : isEdit ? "수정하기" : "등록하기"}
      </Button>
    </form>
  );
}
