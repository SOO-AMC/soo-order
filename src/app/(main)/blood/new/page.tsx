"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { BloodForm } from "@/components/blood/blood-form";
import type { BloodFormData } from "@/components/blood/blood-form";
import { logClientAction } from "@/app/(main)/log-action";

export default function NewBloodPage() {
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (data: BloodFormData) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("blood_records").insert({
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
      created_by: user.id,
    });

    if (error) throw error;

    logClientAction(
      "blood",
      "create_blood",
      `${data.hospital_name} ${data.type === "received" ? "수령" : "출고"} 등록`
    );
    router.push("/blood");
  };

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-none">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/blood">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">혈액 등록</h1>
      </header>
      <div className="p-4">
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <BloodForm onSubmit={handleSubmit} />
        </div>
      </div>
    </div>
  );
}
