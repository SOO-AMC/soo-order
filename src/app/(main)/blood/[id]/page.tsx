export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/list-parts";
import { BloodStatusBadge } from "@/components/blood/blood-status-badge";
import { BloodConfirmButton } from "@/components/blood/blood-confirm-button";
import { DeleteBloodButton } from "@/components/blood/blood-delete-button";
import { DetailPage, DetailHero, DetailCard, InfoGrid, DetailActions } from "@/components/workspace/detail-page";
import { Timeline } from "@/components/workspace/detail-panel";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import {
  BLOOD_TYPE_LABEL,
  ANIMAL_TYPE_LABEL,
  SETTLEMENT_TYPE_LABEL,
  type BloodStatus,
  type BloodType,
  type AnimalType,
  type SettlementType,
} from "@/lib/types/blood";

export default async function BloodDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, isAdmin } = await getSessionProfile();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data: record } = await supabase
    .from("blood_records")
    .select("*, creator:profiles!created_by(full_name), confirmer:profiles!confirmed_by(full_name)")
    .eq("id", id)
    .single();

  if (!record) notFound();

  const isOwner = record.created_by === userId;
  const canEdit = isAdmin || isOwner;
  const canDelete = isAdmin || isOwner;
  const canConfirm = isAdmin && record.status === "pending";
  const isReceived = record.type === "received";

  return (
    <DetailPage
      title="혈액 상세"
      backHref="/blood"
      aside={
        <>
          {(canConfirm || canEdit || canDelete) && (
            <DetailActions hint={canConfirm ? "결제 방식을 정해 확인하면 확인완료로 바뀌어요." : undefined}>
              {canConfirm && <BloodConfirmButton recordId={record.id} hospitalName={record.hospital_name} recordType={record.type} />}
              {canEdit && (
                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/blood/${record.id}/edit`}>
                    <Pencil className="size-4" />
                    수정
                  </Link>
                </Button>
              )}
              {canDelete && <DeleteBloodButton recordId={record.id} hospitalName={record.hospital_name} />}
            </DetailActions>
          )}
          <DetailCard title="처리 이력">
            <Timeline
              items={[
                ...(record.confirmed_at
                  ? [{ key: "conf", text: <><b className="font-semibold text-foreground">확인</b> · {record.confirmer?.full_name ?? "—"}</>, at: formatDateTime(record.confirmed_at) }]
                  : []),
                { key: "created", text: <><b className="font-semibold text-foreground">등록</b> · {record.creator?.full_name ?? "—"}</>, at: formatDateTime(record.created_at) },
              ]}
            />
          </DetailCard>
        </>
      }
    >
      <DetailHero
        badges={
          <>
            <BloodStatusBadge status={record.status as BloodStatus} />
            <Tag>{BLOOD_TYPE_LABEL[record.type as BloodType]}</Tag>
          </>
        }
        title={record.hospital_name}
        summary={
          <>
            {ANIMAL_TYPE_LABEL[record.animal_type as AnimalType]} <b className="font-semibold text-foreground">{record.blood_type}</b> ·{" "}
            <b className="font-semibold text-foreground tabular-nums">{record.volume_ml} mL</b> · {formatDate(record.record_date)}
          </>
        }
      />

      <DetailCard title="혈액 정보">
        <InfoGrid
          items={[
            { label: isReceived ? "수령일" : "출고일", value: formatDate(record.record_date) },
            { label: "병원", value: record.hospital_name },
            { label: "동물", value: ANIMAL_TYPE_LABEL[record.animal_type as AnimalType] },
            { label: "혈액형", value: record.blood_type },
            { label: "용량", value: `${record.volume_ml} mL` },
            { label: "채혈일", value: formatDate(record.collection_date) },
            isReceived && record.receiver && { label: "수령인", value: record.receiver },
            !isReceived && record.shipper && { label: "출고인", value: record.shipper },
            record.notes && { label: "비고", value: record.notes, wide: true },
          ]}
        />
      </DetailCard>

      <DetailCard title="등록·확인">
        <InfoGrid
          items={[
            { label: "등록자", value: record.creator?.full_name ?? "알 수 없음" },
            { label: "등록 일시", value: formatDateTime(record.created_at) },
            {
              label: "결제 방식",
              value: record.settlement_type ? (
                SETTLEMENT_TYPE_LABEL[record.settlement_type as SettlementType]
              ) : (
                <span className="text-status-ask">아직 안 정함</span>
              ),
            },
            record.confirmer && { label: "확인자", value: record.confirmer.full_name ?? "알 수 없음" },
            record.confirmed_at && { label: "확인 일시", value: formatDateTime(record.confirmed_at) },
          ]}
        />
      </DetailCard>
    </DetailPage>
  );
}
