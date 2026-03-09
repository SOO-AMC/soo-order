"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils/format";
import { BloodStatusBadge } from "@/components/blood/blood-status-badge";
import { Spinner } from "@/components/ui/spinner";
import type { BloodRecordWithCreator, BloodType, BloodStatus } from "@/lib/types/blood";
import { ANIMAL_TYPE_LABEL, SETTLEMENT_TYPE_LABEL } from "@/lib/types/blood";

interface BloodListProps {
  type: BloodType;
}

export function BloodList({ type }: BloodListProps) {
  const [records, setRecords] = useState<BloodRecordWithCreator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const supabase = createClient();
  const router = useRouter();

  const fetchRecords = useCallback(async () => {
    const { data, error } = await supabase
      .from("blood_records")
      .select(
        "*, creator:profiles!created_by(full_name), confirmer:profiles!confirmed_by(full_name)"
      )
      .eq("type", type)
      .order("record_date", { ascending: false });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    setRecords((data as BloodRecordWithCreator[]) ?? []);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchRecords();

    const channel = supabase
      .channel(`blood-list-${type}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blood_records" },
        () => {
          if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
          realtimeTimer.current = setTimeout(fetchRecords, 500);
        }
      )
      .subscribe();

    return () => {
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRecords]);

  const pendingCount = records.filter((r) => r.status === "pending").length;
  const confirmedCount = records.filter((r) => r.status === "confirmed").length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner text="불러오는 중..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-destructive">데이터를 불러올 수 없습니다.</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">
          {type === "received" ? "수령" : "출고"} 기록이 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="px-1 py-2 text-sm text-muted-foreground">
        미확인 {pendingCount}건 · 확인완료 {confirmedCount}건
      </div>

      {/* PC 테이블 뷰 */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>상태</TableHead>
              <TableHead>일자</TableHead>
              <TableHead>병원</TableHead>
              <TableHead>동물</TableHead>
              <TableHead>혈액형</TableHead>
              <TableHead>용량</TableHead>
              <TableHead>채혈일</TableHead>
              <TableHead>{type === "received" ? "수령인" : "출고인"}</TableHead>
              <TableHead>결제</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow
                key={record.id}
                className="cursor-pointer"
                onClick={() => router.push(`/blood/${record.id}`)}
              >
                <TableCell>
                  <BloodStatusBadge status={record.status as BloodStatus} />
                </TableCell>
                <TableCell>{formatDate(record.record_date)}</TableCell>
                <TableCell className="font-medium">{record.hospital_name}</TableCell>
                <TableCell>{ANIMAL_TYPE_LABEL[record.animal_type]}</TableCell>
                <TableCell>{record.blood_type}</TableCell>
                <TableCell>{record.volume_ml}mL</TableCell>
                <TableCell>{formatDate(record.collection_date)}</TableCell>
                <TableCell>{(type === "received" ? record.receiver : record.shipper) || "-"}</TableCell>
                <TableCell>
                  {record.settlement_type ? SETTLEMENT_TYPE_LABEL[record.settlement_type] : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 모바일/태블릿 카드 뷰 */}
      <div className="lg:hidden space-y-2">
        {records.map((record) => (
          <Link
            key={record.id}
            href={`/blood/${record.id}`}
            className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-card transition-colors active:opacity-70"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <BloodStatusBadge status={record.status as BloodStatus} />
                <span className="text-sm text-muted-foreground">
                  {formatDate(record.record_date)}
                </span>
                <span className="truncate font-medium">{record.hospital_name}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <span>{ANIMAL_TYPE_LABEL[record.animal_type]} {record.blood_type}</span>
                <span>·</span>
                <span>{record.volume_ml}mL</span>
                {record.settlement_type && (
                  <>
                    <span>·</span>
                    <span>{SETTLEMENT_TYPE_LABEL[record.settlement_type]}</span>
                  </>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
