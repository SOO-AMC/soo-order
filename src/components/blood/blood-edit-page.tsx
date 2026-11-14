"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
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
    <div className="mx-auto max-w-md md:max-w-2xl">
      <PageHeader title="혈액 수정" leading={<BackButton fallbackHref={`/blood/${record.id}`} />} />
      <div className="py-2 lg:px-6 lg:py-4">
        <BloodForm defaultValues={record} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
