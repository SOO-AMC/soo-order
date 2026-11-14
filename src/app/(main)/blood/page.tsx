import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";
import { BloodListPage } from "@/components/blood/blood-list-page";
import { createClient } from "@/lib/supabase/server";
import type { BloodRecordWithCreator } from "@/lib/types/blood";

export const metadata: Metadata = {
  title: "혈액 대장",
};

export default async function BloodPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blood_records")
    .select("*, creator:profiles!created_by(full_name), confirmer:profiles!confirmed_by(full_name)")
    .order("record_date", { ascending: false });
  const initialRecords = (data as BloodRecordWithCreator[] | null) ?? [];

  // 상단바(PageHeader)는 수령/출고 건수가 필요해 BloodListPage 안에서 그린다
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <BloodListPage
        initialRecords={initialRecords}
        headerLeading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
      />
    </div>
  );
}
