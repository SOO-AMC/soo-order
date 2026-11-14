"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** 자주 쓰는 혈액형 (동물별 칩). 그 밖은 직접 입력 */
const BLOOD_TYPE_CHIPS: Record<AnimalType, string[]> = {
  dog: ["DEA 1+", "DEA 1-"],
  cat: ["A형", "B형", "AB형"],
};
const VOLUME_CHIPS = [60, 100, 160, 200, 320];

const kstToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

/** 질문 한 덩어리 (주문 등록과 같은 모양) */
function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 bg-card px-5 py-5 lg:rounded-xl lg:ring-1 lg:ring-border">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-[38px] rounded-full px-4 text-[15px] font-semibold tabular-nums transition-colors",
        on ? "bg-foreground text-background" : "bg-muted text-subtle-foreground ring-1 ring-border hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="grid gap-1.5">
      <span className="text-[13px] font-semibold text-subtle-foreground">{label}</span>
      {children}
    </label>
  );
}

export function BloodForm({ defaultValues, onSubmit }: BloodFormProps) {
  const [today] = useState(kstToday);

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
  const isReceived = type === "received";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!hospitalName.trim()) {
      setError("병원 이름을 써 주세요.");
      return;
    }
    if (!bloodType.trim()) {
      setError("혈액형을 골라 주세요.");
      return;
    }
    if (volumeMl <= 0) {
      setError("용량을 정해 주세요.");
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
      setError("저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 pb-28 lg:gap-3 lg:pb-0">
      <Question title="받았나요, 보냈나요?">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="group" aria-label="수령·출고">
          {(["received", "sent"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className={cn(
                "h-11 rounded-lg text-base font-bold transition-colors",
                type === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "received" ? "받았어요 (수령)" : "보냈어요 (출고)"}
            </button>
          ))}
        </div>
      </Question>

      <Question title={isReceived ? "어느 병원에서 받았나요?" : "어느 병원으로 보냈나요?"}>
        <Input
          id="hospital-name"
          placeholder="병원 이름"
          value={hospitalName}
          onChange={(e) => setHospitalName(e.target.value)}
          className="h-11 text-base"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label={isReceived ? "받은 날" : "보낸 날"} htmlFor="record-date">
            <Input id="record-date" type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} className="h-11 tabular-nums" />
          </Field>
          <Field label={isReceived ? "받은 사람" : "보낸 사람"} htmlFor="person">
            <Input
              id="person"
              placeholder="이름 (선택)"
              value={isReceived ? receiver : shipper}
              onChange={(e) => (isReceived ? setReceiver(e.target.value) : setShipper(e.target.value))}
              className="h-11"
            />
          </Field>
        </div>
      </Question>

      <Question title="어떤 혈액인가요?">
        <div className="flex gap-1.5" role="group" aria-label="동물">
          {(Object.keys(ANIMAL_TYPE_LABEL) as AnimalType[]).map((a) => (
            <Chip
              key={a}
              on={animalType === a}
              onClick={() => {
                setAnimalType(a);
                // 다른 동물의 칩 혈액형이 남아 있으면 비운다(직접 쓴 값은 둔다)
                if (BLOOD_TYPE_CHIPS[a === "dog" ? "cat" : "dog"].includes(bloodType)) setBloodType("");
              }}
            >
              {ANIMAL_TYPE_LABEL[a]}
            </Chip>
          ))}
        </div>
        <Field label="혈액형" htmlFor="blood-type">
          <div className="flex flex-wrap gap-1.5">
            {BLOOD_TYPE_CHIPS[animalType].map((b) => (
              <Chip key={b} on={bloodType === b} onClick={() => setBloodType(b)}>
                {b}
              </Chip>
            ))}
          </div>
          <Input
            id="blood-type"
            placeholder="목록에 없으면 직접 쓰기 (예: DEA 4+)"
            value={bloodType}
            onChange={(e) => setBloodType(e.target.value)}
            className="h-11"
          />
        </Field>
        <Field label="용량 (mL)" htmlFor="volume-ml">
          <div className="flex flex-wrap gap-1.5">
            {VOLUME_CHIPS.map((v) => (
              <Chip key={v} on={volumeMl === v} onClick={() => setVolumeMl(v)}>
                {v}
              </Chip>
            ))}
          </div>
          <Input
            id="volume-ml"
            inputMode="numeric"
            placeholder="직접 쓰기"
            value={volumeMl || ""}
            onChange={(e) => setVolumeMl(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
            className="h-11 tabular-nums"
          />
        </Field>
        <Field label="채혈일" htmlFor="collection-date">
          <Input id="collection-date" type="date" value={collectionDate} onChange={(e) => setCollectionDate(e.target.value)} className="h-11 tabular-nums" />
        </Field>
      </Question>

      <Question title="더 적어 둘 것이 있나요?" hint="선택">
        <Input id="notes" placeholder="비고" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11 text-base" />
      </Question>

      {/* 모바일: 아래 고정 큰 버튼 / PC: 폼 끝 */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
        {error && (
          <p role="alert" className="mb-2 text-sm font-medium text-status-late">
            {error}
          </p>
        )}
        <Button type="submit" className="h-[52px] w-full rounded-[14px] text-base font-bold lg:h-11" disabled={isLoading}>
          {isLoading ? "저장하는 중…" : isEdit ? "수정하기" : `${isReceived ? "수령" : "출고"} 등록하기`}
        </Button>
      </div>
    </form>
  );
}
