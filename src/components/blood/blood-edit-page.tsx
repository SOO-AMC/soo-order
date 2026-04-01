"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { BloodForm } from "@/components/blood/blood-form";
import type { BloodFormData } from "@/components/blood/blood-form";
import { logClientAction } from "@/app/(main)/log-action";
import type { BloodRecord } from "@/lib/types/blood";

interface BloodEditPageProps {
  record: BloodRecord;
}

export function BloodEditPage({ record }: BloodEditPageProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (data: BloodFormData) => {
    const { error } = await supabase
      .from("blood_records")
      .update({
        type: data.type,
        record_date: data.record_date,
        hospital_name: data.hospital_name,
        animal_type: data.animal_type,
        blood_type: data.blood_type,
        volume_ml: data.volume_ml,
        collection_date: data.collection_date,
        receiver: data.type === "received" ? data.receiver || null : null,
        shipper: data.type === "sent" ? data.shipper || null : null,
        notes: data.notes,
      })
      .eq("id", record.id);

    if (error) throw error;

    logClientAction(
      "blood",
      "update_blood",
      `${data.hospital_name} ${data.type === "received" ? "수령" : "출고"} 수정`
    );
    router.push(`/blood/${record.id}`);
  };

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-none">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/blood/${record.id}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">혈액 수정</h1>
      </header>
      <div className="p-4">
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <BloodForm defaultValues={record} onSubmit={handleSubmit} />
        </div>
      </div>
    </div>
  );
}
