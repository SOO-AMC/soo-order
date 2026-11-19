"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2, Package, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { toKSTDateString } from "@/lib/utils/format";
import { fetchVendorNameEvidence } from "@/lib/actions/vendor-actions";
import { getInvoiceFileUrl } from "@/lib/actions/vendor-ledger-action";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types/order";
import type { VendorNameEvidence } from "@/lib/types/vendor";

/** 이름별 근거 — 같은 이름을 접었다 펴거나 대화상자에서 다시 열 때 또 읽지 않는다 */
const cache = new Map<string, Promise<VendorNameEvidence>>();

/** 정리한 뒤에는 근거가 바뀌므로 비운다 */
export function clearVendorEvidenceCache() {
  cache.clear();
}

function load(name: string): Promise<VendorNameEvidence> {
  let p = cache.get(name);
  if (!p) {
    p = fetchVendorNameEvidence(name);
    cache.set(name, p);
    p.catch(() => cache.delete(name));
  }
  return p;
}

const num = (n: number) => n.toLocaleString();

/**
 * "정리할 이름"의 근거. 업체 칸에 업체가 아닌 글자가 적혀 있으면 이름만 보고는 고르기 어려우니
 * 그 이름이 적힌 주문(품목·메모·누가), 연결된 명세서, 그 품목을 파는 업체를 보여 준다.
 */
export function VendorNameEvidencePanel({
  name,
  onPickVendor,
  pickedId,
  className,
}: {
  name: string;
  /** 후보 업체를 누르면 — 그 업체로 고르기 */
  onPickVendor?: (vendorId: string) => void;
  pickedId?: string | null;
  className?: string;
}) {
  const [state, setState] = useState<{ name: string; data?: VendorNameEvidence; error?: string }>({ name });
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    load(name)
      .then((data) => { if (active) setState({ name, data }); })
      .catch((e) => { if (active) setState({ name, error: e instanceof Error ? e.message : "근거를 불러오지 못했어요." }); });
    return () => { active = false; };
  }, [name]);

  const data = state.name === name ? state.data : undefined;
  const error = state.name === name ? state.error : undefined;

  const openInvoice = async (id: string, path: string) => {
    if (opening) return;
    // 팝업 차단을 피하려고 창부터 연다
    const win = window.open("", "_blank");
    setOpening(id);
    try {
      const url = await getInvoiceFileUrl(path);
      if (url && win) win.location.href = url;
      else win?.close();
    } catch {
      win?.close();
    } finally {
      setOpening(null);
    }
  };

  if (error) return <p role="alert" className={cn("rounded-lg bg-status-late-bg px-3 py-2 text-[13px] font-medium text-status-late", className)}>{error}</p>;
  if (!data) {
    return (
      <p className={cn("flex items-center gap-2 px-1 py-2 text-[13px] text-muted-foreground", className)}>
        <Loader2 className="size-3.5 animate-spin" /> 근거를 찾는 중…
      </p>
    );
  }

  return (
    <div className={cn("space-y-3 text-[13px]", className)}>
      {/* 그 품목을 파는 업체 */}
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 font-semibold text-subtle-foreground">
          <Store className="size-3.5" /> 이 주문 품목을 가격표에 가진 업체
        </p>
        {data.carriers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {data.carriers.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={!onPickVendor}
                onClick={() => onPickVendor?.(c.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 font-semibold tabular-nums disabled:cursor-default",
                  pickedId === c.id ? "bg-primary text-primary-foreground" : "bg-muted text-subtle-foreground hover:bg-secondary",
                )}
                title={onPickVendor ? `${c.name}(으)로 고르기` : undefined}
              >
                {c.name} <span className="font-normal opacity-80">{c.items}/{data.linkedItems}품목</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">가격표와 연결된 품목이 없어서 찾지 못했어요.</p>
        )}
      </div>

      {/* 연결된 명세서 */}
      {data.invoices.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 font-semibold text-subtle-foreground">
            <FileText className="size-3.5" /> 이 주문과 맞춰진 명세서
          </p>
          <ul className="space-y-1.5">
            {data.invoices.map((inv) => (
              <li key={inv.id} className="rounded-lg bg-muted/60 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="tabular-nums text-muted-foreground">{inv.date ?? "날짜 없음"}</span>
                  {inv.vendorName ? (
                    <button
                      type="button"
                      disabled={!onPickVendor || !inv.vendorId}
                      onClick={() => inv.vendorId && onPickVendor?.(inv.vendorId)}
                      className={cn(
                        "rounded-full px-2 py-0.5 font-semibold disabled:cursor-default",
                        pickedId === inv.vendorId ? "bg-primary text-primary-foreground" : "bg-card text-foreground ring-1 ring-border hover:bg-secondary",
                      )}
                    >
                      {inv.vendorName}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">업체 미연결</span>
                  )}
                  {inv.readName && inv.readName !== inv.vendorName && (
                    <span className="text-muted-foreground">명세서에 찍힌 글자: <span className="text-foreground">{inv.readName}</span></span>
                  )}
                  {inv.totalAmount != null && <span className="tabular-nums text-muted-foreground">합계 {num(inv.totalAmount)}원</span>}
                  {inv.filePath && (
                    <button
                      type="button"
                      onClick={() => openInvoice(inv.id, inv.filePath!)}
                      className="ml-auto flex items-center gap-1 font-semibold text-primary hover:underline"
                    >
                      {opening === inv.id ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />} 원본
                    </button>
                  )}
                </div>
                {inv.lines.length > 0 && <p className="mt-1 text-muted-foreground">{inv.lines.join(" · ")}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 이 이름이 적힌 주문 */}
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 font-semibold text-subtle-foreground">
          <Package className="size-3.5" /> 이 이름이 업체 칸에 적힌 주문
          <span className="font-normal text-muted-foreground">
            {data.total > data.orders.length ? `최근 ${num(data.orders.length)}건 / 전체 ${num(data.total)}건` : `${num(data.total)}건`}
          </span>
        </p>
        <ul className="divide-y divide-border rounded-lg ring-1 ring-border">
          {data.orders.map((o) => (
            <li key={o.id} className="space-y-0.5 px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <a href={`/orders/${o.id}`} target="_blank" rel="noreferrer" className="font-semibold text-foreground hover:underline">
                  {o.itemName}
                </a>
                <span className="tabular-nums text-muted-foreground">{o.quantity}{o.unit}</span>
                <span className="text-muted-foreground">{ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">{toKSTDateString(o.createdAt)}</span>
              </div>
              <p className="text-muted-foreground">
                주문 {o.requester ?? "알 수 없음"}
                {o.updater && o.updater !== o.requester ? ` · 마지막 처리 ${o.updater}` : ""}
                {o.dispatchedAt ? ` · 발주 ${toKSTDateString(o.dispatchedAt)}` : ""}
              </p>
              {o.notes.length > 0 && <p className="break-words text-subtle-foreground">메모: {o.notes.join(" / ")}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
