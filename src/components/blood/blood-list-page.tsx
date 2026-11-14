"use client";

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Droplet, ExternalLink, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { UnderlineTabs } from "@/components/list-parts";
import { SavedViews } from "@/components/workspace/saved-views";
import { FilterBar, SearchField, FilterChip, ClearFilters } from "@/components/workspace/filter-bar";
import { DetailPanel, WorkspaceSplit, DetailFields, Timeline } from "@/components/workspace/detail-panel";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { BloodStatusBadge } from "@/components/blood/blood-status-badge";
import { formatDate } from "@/lib/utils/format";
import type { AnimalType, BloodRecordWithCreator, BloodType, SettlementType } from "@/lib/types/blood";
import { ANIMAL_TYPE_LABEL, SETTLEMENT_TYPE_LABEL } from "@/lib/types/blood";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { applyRealtimeChange } from "@/lib/utils/realtime-list";

const SELECT = "*, creator:profiles!created_by(full_name), confirmer:profiles!confirmed_by(full_name)";
type ViewKey = "all" | "pending" | "confirmed";

/** 표 날짜: 올해면 "11. 14.", 아니면 "25. 11. 14." (record_date는 YYYY-MM-DD) */
const shortDate = (d: string | null | undefined, thisYear: string) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return y === thisYear ? `${Number(m)}. ${Number(day)}.` : `${y.slice(2)}. ${Number(m)}. ${Number(day)}.`;
};

const at = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : undefined;

/**
 * 혈액 대장 (디자인 시스템 데이터 작업대).
 * 밑줄 탭 = 수령/출고(데이터 종류), 보기 = 미확인/확인완료, 검색·필터, 표, 상세 패널(읽기 전용 — 확인·수정은 전체 보기에서).
 */
export function BloodListPage({
  initialRecords,
  headerLeading,
}: {
  initialRecords?: BloodRecordWithCreator[];
  headerLeading?: ReactNode;
}) {
  const [records, setRecords] = useState<BloodRecordWithCreator[]>(initialRecords ?? []);
  const [isLoading, setIsLoading] = useState(!initialRecords);
  const [error, setError] = useState("");
  const [type, setType] = useState<BloodType>("received");
  const [view, setView] = useState<ViewKey>("all");
  const [query, setQuery] = useState("");
  const [animal, setAnimal] = useState<AnimalType | null>(null);
  const [settlement, setSettlement] = useState<SettlementType | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [thisYear] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }).slice(0, 4));
  const supabase = createClient();

  const fetchRecords = useCallback(async () => {
    const { data, error } = await supabase.from("blood_records").select(SELECT).order("record_date", { ascending: false });
    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }
    setRecords((data as BloodRecordWithCreator[]) ?? []);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordsRef = useRef(records);
  useEffect(() => { recordsRef.current = records; }, [records]);

  const handleRealtime = useCallback(
    async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const next = await applyRealtimeChange<BloodRecordWithCreator>(recordsRef.current, payload, {
        matchesFilter: () => true,
        fetchOne: async (id) => {
          const { data } = await supabase.from("blood_records").select(SELECT).eq("id", id).maybeSingle();
          return (data as BloodRecordWithCreator) ?? null;
        },
      });
      if (next === recordsRef.current) return;
      recordsRef.current = next;
      setRecords(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    fetchRecords();
    let firstSub = true;
    const channel = supabase
      .channel("blood-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "blood_records" }, handleRealtime)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (firstSub) { firstSub = false; return; }
          fetchRecords();
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRecords, handleRealtime]);

  // ── 종류 → 보기 → 검색·필터 ──
  const ofType = useMemo(() => records.filter((r) => r.type === type), [records, type]);
  const typeCounts = useMemo(
    () => ({
      received: records.filter((r) => r.type === "received").length,
      sent: records.filter((r) => r.type === "sent").length,
    }),
    [records]
  );
  const viewCounts = useMemo(
    () => ({
      all: ofType.length,
      pending: ofType.filter((r) => r.status === "pending").length,
      confirmed: ofType.filter((r) => r.status === "confirmed").length,
    }),
    [ofType]
  );

  const visible = useMemo(() => {
    let list = ofType;
    if (view !== "all") list = list.filter((r) => r.status === view);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.hospital_name.toLowerCase().includes(q) ||
          r.blood_type.toLowerCase().includes(q) ||
          (r.receiver ?? "").toLowerCase().includes(q) ||
          (r.shipper ?? "").toLowerCase().includes(q) ||
          (r.notes ?? "").toLowerCase().includes(q)
      );
    }
    if (animal) list = list.filter((r) => r.animal_type === animal);
    if (settlement) list = list.filter((r) => r.settlement_type === settlement);
    return list;
  }, [ofType, view, query, animal, settlement]);

  const detail = detailId ? records.find((r) => r.id === detailId) ?? null : null;
  const detailIndex = detail ? visible.findIndex((r) => r.id === detail.id) : -1;
  /** 상세 패널이 열려 표가 좁아지면 채혈일·결제 칸은 숨긴다(패널에 있음) */
  const compact = !!detail;
  const totalVolume = useMemo(() => visible.reduce((s, r) => s + (r.volume_ml || 0), 0), [visible]);

  const hasFilters = !!query.trim() || !!animal || !!settlement;
  const clearFilters = () => {
    setQuery("");
    setAnimal(null);
    setSettlement(null);
  };

  const personLabel = type === "received" ? "수령인" : "출고인";
  const settlementOptions: SettlementType[] = type === "received" ? ["invoice", "transfer", "confirm_only"] : ["invoice", "transfer"];

  return (
    <>
      <PageHeader
        title="혈액 대장"
        description={viewCounts.pending > 0 ? `미확인 ${viewCounts.pending}건` : undefined}
        leading={headerLeading}
        action={
          <Button asChild className="h-9 rounded-lg px-3 text-[13px]">
            <Link href="/blood/new">
              <Plus className="size-4" /> 혈액 등록
            </Link>
          </Button>
        }
        tabs={
          <UnderlineTabs<BloodType>
            ariaLabel="수령·출고"
            value={type}
            onValueChange={(t) => {
              setType(t);
              setDetailId(null);
              setSettlement(null);
            }}
            items={[
              { value: "received", label: "수령", count: typeCounts.received },
              { value: "sent", label: "출고", count: typeCounts.sent },
            ]}
          />
        }
      />

      <div className="space-y-3 p-4 lg:px-6">
        <SavedViews<ViewKey>
          value={view}
          onValueChange={setView}
          views={[
            { value: "all", label: "전체", count: viewCounts.all },
            { value: "pending", label: "미확인", count: viewCounts.pending },
            { value: "confirmed", label: "확인완료", count: viewCounts.confirmed },
          ]}
        />
        <FilterBar>
          <SearchField id="blood-search" value={query} onChange={setQuery} placeholder={`병원·혈액형·${personLabel} 검색`} />
          <FilterChip<AnimalType>
            label="동물"
            options={(Object.keys(ANIMAL_TYPE_LABEL) as AnimalType[]).map((a) => ({ value: a, label: ANIMAL_TYPE_LABEL[a] }))}
            value={animal}
            onChange={setAnimal}
          />
          <FilterChip<SettlementType>
            label="결제"
            options={settlementOptions.map((s) => ({ value: s, label: SETTLEMENT_TYPE_LABEL[s] }))}
            value={settlement}
            onChange={setSettlement}
          />
          <ClearFilters show={hasFilters} onClear={clearFilters} />
        </FilterBar>

        {error ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState title="혈액 대장을 불러오지 못했어요" description={error} />
          </div>
        ) : isLoading ? (
          <ListSkeleton rows={6} />
        ) : visible.length === 0 ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState
              icon={Droplet}
              title={hasFilters ? "조건에 맞는 기록이 없어요" : `${type === "received" ? "수령" : "출고"} 기록이 없어요`}
              description={hasFilters ? "검색어나 필터를 바꿔 보세요." : "혈액을 받거나 보내면 등록해 주세요."}
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    필터 지우기
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <WorkspaceSplit>
            <div className="min-w-0 flex-1 space-y-3">
              {/* PC 표 */}
              <section className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-border lg:block">
                <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-muted-foreground">
                      <th className="w-[96px] border-b border-border py-2 pl-4 font-semibold">상태</th>
                      <th className="w-[84px] border-b border-border px-3 py-2 font-semibold">일자</th>
                      <th className="border-b border-border px-3 py-2 font-semibold">병원</th>
                      <th className="w-28 border-b border-border px-3 py-2 font-semibold">동물·혈액형</th>
                      <th className="w-[84px] border-b border-border px-3 py-2 text-right font-semibold">용량</th>
                      {!compact && <th className="w-[84px] border-b border-border px-3 py-2 font-semibold">채혈일</th>}
                      <th className={cn("w-[84px] border-b border-border px-3 py-2 font-semibold", compact && "pr-4")}>{personLabel}</th>
                      {!compact && <th className="w-[120px] border-b border-border px-3 py-2 pr-4 font-semibold">결제</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => {
                      const isOpen = detailId === r.id;
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setDetailId(r.id)}
                          className={cn("cursor-pointer", isOpen ? "bg-row-selected shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-muted/60")}
                        >
                          <td className="border-b border-border py-2.5 pl-4">
                            <BloodStatusBadge status={r.status} />
                          </td>
                          <td className="whitespace-nowrap border-b border-border px-3 py-2.5 tabular-nums text-subtle-foreground">{shortDate(r.record_date, thisYear)}</td>
                          <td className="truncate border-b border-border px-3 py-2.5 text-sm font-semibold">{r.hospital_name}</td>
                          <td className="truncate border-b border-border px-3 py-2.5">
                            {ANIMAL_TYPE_LABEL[r.animal_type]} <b className="font-semibold">{r.blood_type}</b>
                          </td>
                          <td className="whitespace-nowrap border-b border-border px-3 py-2.5 text-right tabular-nums">
                            <b className="text-sm">{r.volume_ml}</b>
                            <span className="text-subtle-foreground"> mL</span>
                          </td>
                          {!compact && <td className="whitespace-nowrap border-b border-border px-3 py-2.5 tabular-nums text-subtle-foreground">{shortDate(r.collection_date, thisYear)}</td>}
                          <td className={cn("truncate border-b border-border px-3 py-2.5", compact && "pr-4")}>{(type === "received" ? r.receiver : r.shipper) || "—"}</td>
                          {!compact && (
                            <td className="truncate border-b border-border px-3 py-2.5 pr-4 text-subtle-foreground">
                              {r.settlement_type ? SETTLEMENT_TYPE_LABEL[r.settlement_type] : <span className="text-muted-foreground">—</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              {/* 모바일/태블릿 */}
              <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border lg:hidden">
                {visible.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setDetailId(r.id)}
                    className={cn("flex w-full items-start gap-3 px-4 py-3 text-left active:bg-muted", i > 0 && "border-t border-border")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[15px] font-semibold leading-snug">{r.hospital_name}</span>
                        <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{formatDate(r.record_date)}</span>
                      </span>
                      <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                        <BloodStatusBadge status={r.status} />
                        <span className="shrink-0 text-foreground">
                          {ANIMAL_TYPE_LABEL[r.animal_type]} <b className="font-semibold">{r.blood_type}</b>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">{r.volume_ml}mL</span>
                        {r.settlement_type && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{SETTLEMENT_TYPE_LABEL[r.settlement_type]}</span>
                          </>
                        )}
                      </span>
                    </span>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                ))}
              </section>

              <p className="px-1 text-[13px] tabular-nums text-muted-foreground">
                {visible.length}건 · 합계 {totalVolume.toLocaleString()} mL
              </p>
            </div>

            {detail && (
              <BloodDetail
                record={detail}
                onClose={() => setDetailId(null)}
                onPrev={detailIndex > 0 ? () => setDetailId(visible[detailIndex - 1].id) : undefined}
                onNext={detailIndex >= 0 && detailIndex < visible.length - 1 ? () => setDetailId(visible[detailIndex + 1].id) : undefined}
              />
            )}
          </WorkspaceSplit>
        )}
      </div>
    </>
  );
}

/** 상세 패널(읽기 전용) — 확인·수정·삭제는 "전체 보기"에서 */
function BloodDetail({
  record: r,
  onClose,
  onPrev,
  onNext,
}: {
  record: BloodRecordWithCreator;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const isReceived = r.type === "received";
  return (
    <DetailPanel
      open
      onClose={onClose}
      onPrev={onPrev}
      onNext={onNext}
      title={r.hospital_name}
      badge={<BloodStatusBadge status={r.status} />}
      footer={
        <Button asChild className="h-10 w-full rounded-lg lg:h-9">
          <Link href={`/blood/${r.id}`}>
            <ExternalLink className="size-4" />
            {r.status === "pending" ? "전체 보기 · 확인" : "전체 보기"}
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <DetailFields
          items={[
            { label: "구분", value: isReceived ? "수령" : "출고" },
            { label: "일자", value: formatDate(r.record_date) },
            {
              label: "혈액",
              value: (
                <span>
                  {ANIMAL_TYPE_LABEL[r.animal_type]} <b>{r.blood_type}</b> · <b className="tabular-nums">{r.volume_ml}</b> mL
                </span>
              ),
            },
            { label: "채혈일", value: formatDate(r.collection_date) },
            { label: isReceived ? "수령인" : "출고인", value: (isReceived ? r.receiver : r.shipper) || <span className="text-muted-foreground">없음</span> },
            { label: "결제", value: r.settlement_type ? SETTLEMENT_TYPE_LABEL[r.settlement_type] : <span className="text-status-ask">아직 안 정함</span> },
            ...(r.notes ? [{ label: "비고", value: r.notes }] : []),
          ]}
        />
        <section className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold text-subtle-foreground">처리 이력</h3>
          <Timeline
            items={[
              ...(r.confirmed_at
                ? [{ key: "conf", text: <><b className="font-semibold text-foreground">확인</b> · {r.confirmer?.full_name ?? "—"}</>, at: at(r.confirmed_at) }]
                : []),
              { key: "created", text: <><b className="font-semibold text-foreground">등록</b> · {r.creator?.full_name ?? "—"}</>, at: at(r.created_at) },
            ]}
          />
        </section>
      </div>
    </DetailPanel>
  );
}
