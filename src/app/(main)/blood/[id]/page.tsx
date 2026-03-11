export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Trash2 } from "lucide-react";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BloodStatusBadge } from "@/components/blood/blood-status-badge";
import { BloodConfirmButton } from "@/components/blood/blood-confirm-button";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { DeleteBloodButton } from "@/components/blood/blood-delete-button";
import {
  BLOOD_TYPE_LABEL,
  ANIMAL_TYPE_LABEL,
  SETTLEMENT_TYPE_LABEL,
  type BloodStatus,
  type BloodType,
  type AnimalType,
  type SettlementType,
} from "@/lib/types/blood";

export default async function BloodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, isAdmin } = await getSessionProfile();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data: record } = await supabase
    .from("blood_records")
    .select(
      "*, creator:profiles!created_by(full_name), confirmer:profiles!confirmed_by(full_name)"
    )
    .eq("id", id)
    .single();

  if (!record) notFound();

  const canDelete = isAdmin;

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/blood">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">혈액 상세</h1>
      </header>

      <div className="p-4">
        <div className="space-y-6 rounded-2xl bg-card p-5 shadow-card">
          <div className="flex items-center gap-2">
            <BloodStatusBadge status={record.status as BloodStatus} />
            <span className="text-sm font-medium text-muted-foreground">
              {BLOOD_TYPE_LABEL[record.type as BloodType]}
            </span>
          </div>

          <Separator />

          <div>
            <h2 className="font-semibold">기본 정보</h2>
            <dl className="mt-3 space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-4 md:space-y-0">
              <div>
                <dt className="text-sm text-muted-foreground">
                  {record.type === "received" ? "수령일자" : "출고일자"}
                </dt>
                <dd className="mt-0.5 font-medium">{formatDate(record.record_date)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">병원이름</dt>
                <dd className="mt-0.5 font-medium">{record.hospital_name}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">동물</dt>
                <dd className="mt-0.5 font-medium">
                  {ANIMAL_TYPE_LABEL[record.animal_type as AnimalType]}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">혈액형</dt>
                <dd className="mt-0.5 font-medium">{record.blood_type}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">용량</dt>
                <dd className="mt-0.5 font-medium">{record.volume_ml}mL</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">채혈일</dt>
                <dd className="mt-0.5 font-medium">{formatDate(record.collection_date)}</dd>
              </div>
              {record.type === "received" && record.receiver && (
                <div>
                  <dt className="text-sm text-muted-foreground">수령인</dt>
                  <dd className="mt-0.5 font-medium">{record.receiver}</dd>
                </div>
              )}
              {record.type === "sent" && record.shipper && (
                <div>
                  <dt className="text-sm text-muted-foreground">출고인</dt>
                  <dd className="mt-0.5 font-medium">{record.shipper}</dd>
                </div>
              )}
              {record.notes && (
                <div>
                  <dt className="text-sm text-muted-foreground">비고</dt>
                  <dd className="mt-0.5 font-medium">{record.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          <Separator />

          <div>
            <h2 className="font-semibold">등록/확인 정보</h2>
            <dl className="mt-3 space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-4 md:space-y-0">
              <div>
                <dt className="text-sm text-muted-foreground">등록자</dt>
                <dd className="mt-0.5 font-medium">
                  {record.creator?.full_name ?? "알 수 없음"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">등록일시</dt>
                <dd className="mt-0.5 font-medium">{formatDateTime(record.created_at)}</dd>
              </div>
              {record.status === "confirmed" && (
                <>
                  <div>
                    <dt className="text-sm text-muted-foreground">결제 방식</dt>
                    <dd className="mt-0.5 font-medium">
                      {record.settlement_type
                        ? SETTLEMENT_TYPE_LABEL[record.settlement_type as SettlementType]
                        : "-"}
                    </dd>
                  </div>
                  {record.confirmer && (
                    <div>
                      <dt className="text-sm text-muted-foreground">확인자</dt>
                      <dd className="mt-0.5 font-medium">
                        {record.confirmer.full_name ?? "알 수 없음"}
                      </dd>
                    </div>
                  )}
                  {record.confirmed_at && (
                    <div>
                      <dt className="text-sm text-muted-foreground">확인일시</dt>
                      <dd className="mt-0.5 font-medium">
                        {formatDateTime(record.confirmed_at)}
                      </dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </div>

          {/* Actions */}
          {(isAdmin && record.status === "pending") && (
            <>
              <Separator />
              <BloodConfirmButton
                recordId={record.id}
                hospitalName={record.hospital_name}
                recordType={record.type}
              />
            </>
          )}

          {canDelete && (
            <>
              <Separator />
              <DeleteBloodButton
                recordId={record.id}
                hospitalName={record.hospital_name}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
