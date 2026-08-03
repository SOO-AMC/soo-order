"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ScanLine, Upload, FileText, AlertTriangle, Check, X, RefreshCw, Plus, Layers, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchPriceCompareData } from "@/lib/actions/price-compare-action";
import { scanInvoice, renderInvoiceThumbnail, renderInvoicePages } from "@/lib/actions/invoice-scan-action";
import { confirmInvoice } from "@/lib/actions/invoice-confirm-action";
import { createScanVendor } from "@/app/(main)/price-compare/actions";
import { setItemAlias } from "@/lib/actions/item-alias-actions";
import { genId } from "@/lib/utils/uid";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import { bestMatch, nameSimilarity } from "@/lib/utils/item-match";
import { logClientAction } from "@/app/(main)/log-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { Vendor, VendorProduct, ItemNameAlias } from "@/lib/types/price-compare";
import type { ConfirmRowInput, UnmatchedAction, ExtractedInvoice } from "@/lib/types/invoice";

const AUTO_LEARN_MIN_SCORE = 0.7;

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/gif";

interface OrderLite {
  id: string;
  item_name: string;
  quantity: number;
  received_quantity: number;
  vendor_name: string | null;
  requester: { full_name: string | null } | null;
}

interface Alloc {
  orderId: string;
  quantity: number;
}

interface Row {
  id: string;
  name: string;
  quantity: number;
  listPrice: number;
  allocations: Alloc[];
  leftoverAction: UnmatchedAction;
  updatePrice: boolean;
}

type Step = "upload" | "scanning" | "grouping" | "preview";

/** 묶음 업로드의 한 명세서 단위 (그룹 확인 단계용) */
interface BundleUnit {
  id: string;
  invoice: ExtractedInvoice;
  path: string;
  previewUrl: string;
  thumbUrl: string | null;
  kind: "pdf" | "image";
  vendorId: string | null;
  pageStart: number;
  pageEnd: number;
}

/** 큐의 각 항목이 들고 다니는 원본/업체 메타 */
interface QueueMeta {
  path: string;
  previewUrl: string;
  kind: "pdf" | "image";
  vendorId: string | null;
  pageStart: number;
  pageEnd: number;
}

const won = (n: number) => `${Math.round(n).toLocaleString()}원`;

/** 업체명 느슨한 일치 ("브이에스팜(주)" ↔ "브이에스팜" 등 표기차 허용) */
function vendorNameMatches(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\(주\)|주식회사|㈜|\s|·/g, "").toLowerCase();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * 한 명세서 라인 수량을 이름이 유사한 검수대기 주문들에 자동 배분.
 * vendorName이 주어지면 그 업체로 발주된 주문만 대상으로 한다.
 * 유사도 높은 순으로 주문 잔여 용량만큼 채우며, availById(주문별 가용 수량)를 차감한다.
 */
function autoAllocate(
  name: string,
  quantity: number,
  orderList: OrderLite[],
  availById: Map<string, number>,
  vendorName?: string | null,
): Alloc[] {
  const candidates = orderList
    .filter((o) => !vendorName || vendorNameMatches(o.vendor_name ?? "", vendorName))
    .map((o) => ({ o, score: nameSimilarity(name, o.item_name) }))
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score);
  const allocs: Alloc[] = [];
  let remaining = quantity;
  for (const { o } of candidates) {
    if (remaining <= 0) break;
    const avail = availById.get(o.id) ?? 0;
    if (avail <= 0) continue;
    const take = Math.min(remaining, avail);
    allocs.push({ orderId: o.id, quantity: take });
    availById.set(o.id, avail - take);
    remaining -= take;
  }
  return allocs;
}

/** 주문별 가용 수량(잔여 - 이미 배분된 분) 맵 생성. excludeRowId 행의 배분은 제외. */
function buildAvailMap(orderList: OrderLite[], rows: Row[], excludeRowId?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of orderList) m.set(o.id, Math.max(0, o.quantity - o.received_quantity));
  for (const r of rows) {
    if (r.id === excludeRowId) continue;
    for (const a of r.allocations) m.set(a.orderId, (m.get(a.orderId) ?? 0) - a.quantity);
  }
  return m;
}

export function InvoiceScanPage() {
  const supabase = createClient();

  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const [fileKind, setFileKind] = useState<"pdf" | "image">("pdf");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadedPath, setUploadedPath] = useState("");
  // 현재 미리보기 명세서의 PDF 페이지 범위 (합본 PDF 분리 시 명세서별로 다름)
  const [currentPageStart, setCurrentPageStart] = useState(1);
  const [currentPageEnd, setCurrentPageEnd] = useState(1);
  // "원본 보기"가 보여줄 명세서 페이지 이미지들 (mupdf로 해당 페이지만 렌더)
  const [originalPages, setOriginalPages] = useState<string[] | null>(null);
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const renderedOriginalKey = useRef<string>("");

  // "원본 보기"가 켜졌을 때 현재 명세서의 pageStart~pageEnd만 mupdf로 렌더.
  // 한 합본 PDF에 여러 명세서가 있는 경우 다른 명세서 페이지가 섞여 보이지 않도록 제한.
  useEffect(() => {
    if (!showOriginal || fileKind !== "pdf" || !uploadedPath) return;
    const key = `${uploadedPath}:${currentPageStart}-${currentPageEnd}`;
    if (renderedOriginalKey.current === key) return; // 같은 명세서로 이미 렌더됨
    let active = true;
    setLoadingOriginal(true);
    setOriginalPages(null);
    renderInvoicePages(uploadedPath, currentPageStart, currentPageEnd, 2)
      .then((pages) => {
        if (!active) return;
        setOriginalPages(pages);
        renderedOriginalKey.current = key;
      })
      .catch(() => { if (active) setOriginalPages([]); })
      .finally(() => { if (active) setLoadingOriginal(false); });
    return () => { active = false; };
  }, [showOriginal, fileKind, uploadedPath, currentPageStart, currentPageEnd]);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorProducts, setVendorProducts] = useState<VendorProduct[]>([]);
  const [aliases, setAliases] = useState<ItemNameAlias[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  // 신규 업체 등록(인라인)
  const [regOpen, setRegOpen] = useState(false);
  const [regName, setRegName] = useState("");
  const [regRate, setRegRate] = useState("0");
  const [registering, setRegistering] = useState(false);

  // 여러 명세서 묶음 처리 큐
  const [queue, setQueue] = useState<ExtractedInvoice[]>([]);
  const [queueMeta, setQueueMeta] = useState<QueueMeta[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);

  // 그룹 확인 단계
  const [units, setUnits] = useState<BundleUnit[]>([]);

  const selectedVendor = useMemo(
    () => vendors.find((v) => v.id === vendorId) ?? null,
    [vendors, vendorId],
  );
  const discountRate = selectedVendor?.discount_rate ?? 0;

  const vendorProductsOfVendor = useMemo(
    () => (vendorId ? vendorProducts.filter((p) => p.vendor_id === vendorId) : []),
    [vendorProducts, vendorId],
  );

  // 행별 파생 정보(단가/신규/배분 합계). 별칭(학습)을 먼저 사용.
  const derive = (row: Row) => {
    const computedUnitPrice = Math.round(row.listPrice * (1 - discountRate / 100));
    const key = normalizeItemName(row.name);
    const alias = aliases.find((a) => a.item_name === key);

    let vendorProduct: VendorProduct | null = null;
    let unifiedProductId: string | null = null;
    let learnUnifiedId: string | null = null; // 확정 시 학습할 통합제품(별칭 없을 때만)

    if (alias) {
      unifiedProductId = alias.unified_product_id;
      vendorProduct = vendorProductsOfVendor.find((p) => p.unified_product_id === alias.unified_product_id) ?? null;
    } else {
      const vp = bestMatch(row.name, vendorProductsOfVendor, (p) => p.product_name, 0.55);
      vendorProduct = vp?.item ?? null;
      unifiedProductId = vendorProduct?.unified_product_id ?? null;
      if (vp && vp.score >= AUTO_LEARN_MIN_SCORE && unifiedProductId) learnUnifiedId = unifiedProductId;
    }

    const currentUnitPrice = vendorProduct?.unit_price ?? null;
    const isNewProduct = !vendorProduct;
    const priceMismatch =
      !!vendorProduct && currentUnitPrice !== null && currentUnitPrice !== computedUnitPrice;
    const allocated = row.allocations.reduce((s, a) => s + (a.quantity || 0), 0);
    const leftover = row.quantity - allocated;
    return {
      computedUnitPrice,
      vendorProduct,
      unifiedProductId,
      learnUnifiedId,
      currentUnitPrice,
      isNewProduct,
      priceMismatch,
      allocated,
      leftover,
    };
  };

  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // 주문 후보 드롭다운: 같은 업체 우선 → 이름 유사도순. 다른 업체 주문도 아래에 모두 표시.
  // (이미 같은 행에 배분된 주문은 제외, current는 유지)
  const orderOptionsFor = (row: Row, currentOrderId?: string) => {
    const usedInRow = new Set(row.allocations.map((a) => a.orderId).filter((id) => id !== currentOrderId));
    const vname = selectedVendor?.name ?? null;
    return orders
      .filter((o) => !usedInRow.has(o.id))
      .map((o) => ({
        o,
        sameVendor: vname ? vendorNameMatches(o.vendor_name ?? "", vname) : false,
        score: nameSimilarity(row.name, o.item_name),
      }))
      .sort((a, b) => {
        if (a.sameVendor !== b.sameVendor) return a.sameVendor ? -1 : 1;
        return b.score - a.score;
      })
      .map((x) => x.o);
  };

  // 모든 행을 현재(또는 지정) 업체 기준으로 자동 재배분
  const reallocateAll = (vname: string | null) =>
    setRows((prev) => {
      const avail = new Map<string, number>();
      for (const o of orders) avail.set(o.id, Math.max(0, o.quantity - o.received_quantity));
      return prev.map((r) => ({ ...r, allocations: autoAllocate(r.name, r.quantity, orders, avail, vname) }));
    });

  // 상단 업체 변경 시 그 업체 기준으로 전체 재배분
  const changeVendor = (newId: string | null) => {
    setVendorId(newId);
    reallocateAll(vendors.find((v) => v.id === newId)?.name ?? null);
  };

  const addAlloc = (rowId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const cand = orderOptionsFor(r);
        if (cand.length === 0) return r;
        const best = bestMatch(r.name, cand, (o) => o.item_name, 0) ?? { item: cand[0] };
        const allocated = r.allocations.reduce((s, a) => s + (a.quantity || 0), 0);
        const qty = Math.max(0, r.quantity - allocated);
        return { ...r, allocations: [...r.allocations, { orderId: best.item.id, quantity: qty }] };
      }),
    );
  };

  const updateAlloc = (rowId: string, idx: number, patch: Partial<Alloc>) =>
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? { ...r, allocations: r.allocations.map((a, i) => (i === idx ? { ...a, ...patch } : a)) }
          : r,
      ),
    );

  const removeAlloc = (rowId: string, idx: number) =>
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, allocations: r.allocations.filter((_, i) => i !== idx) } : r)),
    );

  // 이 행을 검수대기 주문들에 자동 재배분 (다른 행의 배분은 가용량에서 제외)
  const redistribute = (rowId: string) =>
    setRows((prev) => {
      const row = prev.find((r) => r.id === rowId);
      if (!row) return prev;
      const avail = buildAvailMap(orders, prev, rowId);
      const allocations = autoAllocate(row.name, row.quantity, orders, avail, selectedVendor?.name ?? null);
      return prev.map((r) => (r.id === rowId ? { ...r, allocations } : r));
    });

  // 가격/주문 참조 데이터 로드 (업체 매칭·배분용)
  const loadRefData = async () => {
    const [priceData, ordersRes] = await Promise.all([
      fetchPriceCompareData(),
      supabase
        .from("orders")
        .select("id, item_name, quantity, received_quantity, vendor_name, requester:profiles!requester_id(full_name)")
        .eq("type", "order")
        .eq("status", "ordered")
        .order("created_at", { ascending: false }),
    ]);
    const orderList = (ordersRes.data as unknown as OrderLite[]) ?? [];
    setVendors(priceData.vendors);
    setVendorProducts(priceData.vendorProducts);
    setAliases(priceData.itemAliases);
    setOrders(orderList);
    return { vendors: priceData.vendors, orderList };
  };

  const uploadOne = async (file: File): Promise<{ path: string; kind: "pdf" | "image"; previewUrl: string }> => {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const kind: "pdf" | "image" = ext === "pdf" ? "pdf" : "image";
    const previewUrl = URL.createObjectURL(file);
    const path = `${genId()}.${ext || "pdf"}`;
    const up = await supabase.storage.from("invoices").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (up.error) throw new Error("업로드 실패: " + up.error.message);
    return { path, kind, previewUrl };
  };

  const matchVendorId = (name: string, vendorsList: Vendor[]) =>
    bestMatch(name, vendorsList, (v) => v.name, 0.4)?.item.id ?? null;

  // 단일 명세서 (1건)
  const handleSingle = async (file: File) => {
    setError("");
    setSuccess("");
    setStep("scanning");
    try {
      const { path, kind, previewUrl } = await uploadOne(file);
      const [invoices, ref] = await Promise.all([scanInvoice(path, "single"), loadRefData()]);
      if (invoices.length === 0) {
        setError("명세서를 인식하지 못했습니다. 파일을 확인해주세요.");
        setStep("upload");
        return;
      }
      const meta: QueueMeta[] = invoices.map((inv) => ({
        path,
        previewUrl,
        kind,
        vendorId: matchVendorId(inv.vendorName, ref.vendors),
        pageStart: 1,
        pageEnd: kind === "pdf" ? 99 : 1,
      }));
      setQueue(invoices);
      setQueueMeta(meta);
      setQueueIndex(0);
      loadInvoiceIntoPreview(invoices[0], ref.orderList, ref.vendors, meta[0]);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "스캔 처리 중 오류가 발생했습니다.");
      setStep("upload");
    }
  };

  // 여러 명세서 묶음: 여러 파일 또는 단일 PDF(자동분리) → 그룹 확인 단계
  const handleBundle = async (files: File[]) => {
    if (files.length === 0) return;
    setError("");
    setSuccess("");
    setStep("scanning");
    try {
      const ref = await loadRefData();
      const collected: BundleUnit[] = [];

      const singlePdf = files.length === 1 && files[0].name.toLowerCase().endsWith(".pdf");
      if (singlePdf) {
        const { path, kind, previewUrl } = await uploadOne(files[0]);
        const invoices = await scanInvoice(path, "multi");
        // 명세서별 시작 페이지를 각각 렌더해 썸네일로 (그 명세서의 실제 페이지)
        const built = await Promise.all(
          invoices.map(async (inv) => {
            const ps = inv.pageStart ?? 1;
            const pe = inv.pageEnd ?? ps;
            const thumbUrl = await renderInvoiceThumbnail(path, ps).catch(() => null);
            return {
              id: genId(),
              invoice: inv,
              path,
              previewUrl,
              thumbUrl,
              kind,
              vendorId: matchVendorId(inv.vendorName, ref.vendors),
              pageStart: ps,
              pageEnd: pe,
            };
          }),
        );
        collected.push(...built);
      } else {
        for (const file of files) {
          const { path, kind, previewUrl } = await uploadOne(file);
          const [invoices, pdfThumb] = await Promise.all([
            scanInvoice(path, "single"),
            kind === "pdf" ? renderInvoiceThumbnail(path, 1).catch(() => null) : Promise.resolve(null),
          ]);
          const thumbUrl = kind === "image" ? previewUrl : pdfThumb;
          for (const inv of invoices) {
            collected.push({
              id: genId(),
              invoice: inv,
              path,
              previewUrl,
              thumbUrl,
              kind,
              vendorId: matchVendorId(inv.vendorName, ref.vendors),
              pageStart: 1,
              pageEnd: kind === "pdf" ? 99 : 1,
            });
          }
        }
      }

      if (collected.length === 0) {
        setError("명세서를 인식하지 못했습니다. 파일을 확인해주세요.");
        setStep("upload");
        return;
      }
      // 업체별로 묶이도록 정렬 (매칭된 업체 우선, 같은 업체끼리)
      collected.sort((a, b) => {
        const ka = a.vendorId ?? `z:${a.invoice.vendorName}`;
        const kb = b.vendorId ?? `z:${b.invoice.vendorName}`;
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      setUnits(collected);
      setStep("grouping");
    } catch (e) {
      setError(e instanceof Error ? e.message : "스캔 처리 중 오류가 발생했습니다.");
      setStep("upload");
    }
  };

  // 그룹 키: 매칭된 업체 id, 없으면 추출 업체명
  const unitKey = (u: BundleUnit) => u.vendorId ?? `n:${u.invoice.vendorName}`;

  const groupedUnits = useMemo(() => {
    const groups: { key: string; vendorId: string | null; label: string; units: BundleUnit[] }[] = [];
    for (const u of units) {
      const key = unitKey(u);
      let g = groups.find((x) => x.key === key);
      if (!g) {
        const matched = u.vendorId ? vendors.find((v) => v.id === u.vendorId) : null;
        g = {
          key,
          vendorId: u.vendorId,
          label: matched ? matched.name : `${u.invoice.vendorName || "미상"} (미등록)`,
          units: [],
        };
        groups.push(g);
      }
      g.units.push(u);
    }
    return groups;
  }, [units, vendors]);

  const reassignUnit = (unitId: string, newVendorId: string | null) =>
    setUnits((prev) => prev.map((u) => (u.id === unitId ? { ...u, vendorId: newVendorId } : u)));

  const moveUnit = (unitId: string, dir: "up" | "down") =>
    setUnits((prev) => {
      const arr = [...prev];
      const i = arr.findIndex((u) => u.id === unitId);
      if (i < 0) return prev;
      const key = unitKey(arr[i]);
      let j = i + (dir === "up" ? -1 : 1);
      while (j >= 0 && j < arr.length && unitKey(arr[j]) !== key) j += dir === "up" ? -1 : 1;
      if (j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });

  // 데스크톱 드래그 — 카드 위에 드롭: 그 카드 앞으로 이동 + 그 카드의 업체로 편입
  const [dragId, setDragId] = useState<string | null>(null);

  // 그룹 단계에서 카드별 신규 업체 등록
  const [groupRegUnitId, setGroupRegUnitId] = useState<string | null>(null);

  const handleRegisterVendorForUnit = async (unitId: string) => {
    const name = regName.trim();
    if (!name) return;
    setRegistering(true);
    setError("");
    try {
      const res = await createScanVendor(name, parseFloat(regRate) || 0);
      if (res.error || !res.vendor) throw new Error(res.error || "업체 등록에 실패했습니다.");
      const v = res.vendor;
      setVendors((prev) => (prev.some((x) => x.id === v.id) ? prev.map((x) => (x.id === v.id ? v : x)) : [...prev, v]));
      reassignUnit(unitId, v.id);
      setGroupRegUnitId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업체 등록 중 오류가 발생했습니다.");
    } finally {
      setRegistering(false);
    }
  };

  const dropOnUnit = (targetId: string) => {
    setUnits((prev) => {
      if (!dragId || dragId === targetId) return prev;
      const arr = [...prev];
      const fromIdx = arr.findIndex((u) => u.id === dragId);
      if (fromIdx < 0) return prev;
      const moved = { ...arr[fromIdx] };
      arr.splice(fromIdx, 1);
      const tgtIdx = arr.findIndex((u) => u.id === targetId);
      if (tgtIdx < 0) return prev;
      moved.vendorId = arr[tgtIdx].vendorId;
      arr.splice(tgtIdx, 0, moved);
      return arr;
    });
    setDragId(null);
  };

  // 그룹 영역에 드롭: 그 그룹의 업체로 편입(끝으로)
  const dropOnGroup = (groupKey: string, vendorId: string | null) => {
    setUnits((prev) => {
      if (!dragId) return prev;
      const arr = [...prev];
      const fromIdx = arr.findIndex((u) => u.id === dragId);
      if (fromIdx < 0) return prev;
      const moved = { ...arr[fromIdx], vendorId };
      arr.splice(fromIdx, 1);
      let lastIdx = -1;
      for (let i = 0; i < arr.length; i++) if (unitKey(arr[i]) === groupKey) lastIdx = i;
      arr.splice(lastIdx + 1, 0, moved);
      return arr;
    });
    setDragId(null);
  };

  // 명세서 페이지 크게 보기
  const [enlargeUnit, setEnlargeUnit] = useState<BundleUnit | null>(null);
  const [enlargePages, setEnlargePages] = useState<string[] | null>(null);

  const openEnlarge = (u: BundleUnit) => {
    setEnlargeUnit(u);
    if (u.kind === "image") {
      setEnlargePages([u.previewUrl]);
    } else {
      setEnlargePages(null);
      renderInvoicePages(u.path, u.pageStart, u.pageEnd, 2)
        .then((pages) => setEnlargePages(pages))
        .catch(() => setEnlargePages([]));
    }
  };

  const proceedFromGrouping = () => {
    if (units.length === 0) return;
    const ordered = units;
    setQueue(ordered.map((u) => u.invoice));
    const meta: QueueMeta[] = ordered.map((u) => ({
      path: u.path,
      previewUrl: u.previewUrl,
      kind: u.kind,
      vendorId: u.vendorId,
      pageStart: u.pageStart,
      pageEnd: u.pageEnd,
    }));
    setQueueMeta(meta);
    setQueueIndex(0);
    loadInvoiceIntoPreview(ordered[0].invoice, orders, vendors, meta[0]);
    setStep("preview");
  };

  // 추출된 명세서 1건을 미리보기 상태(업체/일자/행)로 적재 + 자동 배분
  const loadInvoiceIntoPreview = (
    extracted: ExtractedInvoice,
    orderList: OrderLite[],
    vendorsList: Vendor[],
    meta?: QueueMeta,
  ) => {
    const matchedId = meta ? meta.vendorId : bestMatch(extracted.vendorName, vendorsList, (v) => v.name, 0.4)?.item.id ?? null;
    setVendorId(matchedId);
    if (meta) {
      setUploadedPath(meta.path);
      setPreviewUrl(meta.previewUrl);
      setFileKind(meta.kind);
      setCurrentPageStart(meta.pageStart);
      setCurrentPageEnd(meta.pageEnd);
      // 명세서 전환 시 이전 명세서 페이지 잔상 방지
      setOriginalPages(null);
      renderedOriginalKey.current = "";
    }
    setVendorName(extracted.vendorName);
    setInvoiceDate(extracted.invoiceDate || "");
    setRegOpen(false);
    setShowOriginal(false);

    const merged = new Map<string, { name: string; quantity: number; listPrice: number }>();
    for (const it of extracted.items) {
      const key = normalizeItemName(it.name) + "|" + it.listPrice;
      const ex = merged.get(key);
      if (ex) ex.quantity += it.quantity;
      else merged.set(key, { name: it.name, quantity: it.quantity, listPrice: it.listPrice });
    }
    const availById = new Map<string, number>();
    for (const o of orderList) availById.set(o.id, Math.max(0, o.quantity - o.received_quantity));
    const vName = vendorsList.find((v) => v.id === matchedId)?.name ?? null;
    setRows(
      [...merged.values()].map((m) => ({
        id: genId(),
        name: m.name,
        quantity: m.quantity,
        listPrice: m.listPrice,
        allocations: autoAllocate(m.name, m.quantity, orderList, availById, vName),
        leftoverAction: "inspect" as UnmatchedAction,
        updatePrice: true,
      })),
    );
  };

  // 검수대기 주문 재조회 (건별 확정 후 다음 명세서 매칭 갱신용)
  const fetchOrderedOrders = async (): Promise<OrderLite[]> => {
    const { data } = await supabase
      .from("orders")
      .select("id, item_name, quantity, received_quantity, vendor_name, requester:profiles!requester_id(full_name)")
      .eq("type", "order")
      .eq("status", "ordered")
      .order("created_at", { ascending: false });
    return (data as unknown as OrderLite[]) ?? [];
  };

  const reset = () => {
    setStep("upload");
    setRows([]);
    setUploadedPath("");
    setPreviewUrl("");
    setVendorId(null);
    setVendorName("");
    setInvoiceDate("");
    setError("");
    setShowOriginal(false);
    setOriginalPages(null);
    renderedOriginalKey.current = "";
    setQueue([]);
    setQueueMeta([]);
    setQueueIndex(0);
    setUnits([]);
  };

  // 이 명세서 건너뛰고 다음 큐로 (없으면 종료)
  const skipCurrent = () => {
    const next = queueIndex + 1;
    if (next < queue.length) {
      setQueueIndex(next);
      loadInvoiceIntoPreview(queue[next], orders, vendors, queueMeta[next]);
    } else {
      reset();
    }
  };

  const openRegister = () => {
    setRegName(vendorName || "");
    setRegRate("0");
    setError("");
    setRegOpen(true);
  };

  const handleRegisterVendor = async () => {
    const name = regName.trim();
    if (!name) return;
    setRegistering(true);
    setError("");
    try {
      const res = await createScanVendor(name, parseFloat(regRate) || 0);
      if (res.error || !res.vendor) throw new Error(res.error || "업체 등록에 실패했습니다.");
      const v = res.vendor;
      setVendors((prev) => (prev.some((x) => x.id === v.id) ? prev.map((x) => (x.id === v.id ? v : x)) : [...prev, v]));
      setVendorId(v.id);
      setVendorName(v.name);
      reallocateAll(v.name);
      setRegOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업체 등록 중 오류가 발생했습니다.");
    } finally {
      setRegistering(false);
    }
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError("");
    try {
      const payloadRows: ConfirmRowInput[] = rows.map((row) => {
        const d = derive(row);
        const allocations = row.allocations.filter((a) => a.orderId && a.quantity > 0);
        const allocated = allocations.reduce((s, a) => s + a.quantity, 0);
        const leftover = row.quantity - allocated;
        return {
          itemName: row.name.trim(),
          quantity: row.quantity,
          listPrice: row.listPrice,
          unitPrice: d.computedUnitPrice,
          amount: d.computedUnitPrice * row.quantity,
          allocations,
          leftoverAction: leftover > 0 ? row.leftoverAction : null,
          unifiedProductId: d.unifiedProductId,
          vendorProductId: d.vendorProduct?.id ?? null,
          updatePrice: row.updatePrice && d.priceMismatch,
          isNewProduct: d.isNewProduct,
        };
      });
      await confirmInvoice({
        vendorId,
        vendorName: vendorName.trim(),
        invoiceDate: invoiceDate || null,
        imagePath: uploadedPath,
        // 합본 PDF 자동분리 시 이 명세서의 페이지 범위 (vendor 합본에서 다른 vendor 페이지가
        // 섞이지 않도록 거래처원장에서 사용). 단일 invoice면 페이지 범위 = 파일 전체.
        pageStart: currentPageStart,
        pageEnd: currentPageEnd,
        rows: payloadRows,
      });

      // 별칭 자동 학습 (퍼지 매칭 고신뢰 + 기존 별칭 없을 때)
      for (const row of rows) {
        const d = derive(row);
        const key = normalizeItemName(row.name);
        if (d.learnUnifiedId && !aliases.some((a) => a.item_name === key)) {
          setItemAlias(row.name, d.learnUnifiedId).catch(() => {});
        }
      }

      const count = rows.length;
      const vname = vendorName.trim();
      logClientAction("dispatch", "invoice_scan_confirm", `${vname} 명세서 ${count}건 처리`);

      const next = queueIndex + 1;
      if (next < queue.length) {
        // 다음 명세서로 — 검수대기 재조회해 중복 배분 방지
        const fresh = await fetchOrderedOrders();
        setOrders(fresh);
        setQueueIndex(next);
        loadInvoiceIntoPreview(queue[next], fresh, vendors, queueMeta[next]);
        setSaving(false);
        setSuccess(`${vname || "명세서"} 처리 완료 — 다음 명세서 (${next + 1}/${queue.length})`);
      } else {
        reset();
        setSaving(false);
        setSuccess(`명세서 ${queue.length}건 처리 완료 — 다른 명세서를 이어서 올리세요.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "확정 처리 중 오류가 발생했습니다.");
      setSaving(false);
    }
  };

  const orderLabel = (o: OrderLite) =>
    `${o.item_name} · ${o.requester?.full_name ?? "?"} · ${o.vendor_name || "업체?"} (잔여 ${Math.max(0, o.quantity - o.received_quantity)})`;

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-4xl">
      <header className="sticky top-[var(--page-top)] z-40 flex items-center gap-2 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md">
        <ScanLine className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">명세서 스캔</h1>
      </header>

      <div className="p-4">
        {error && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <Check className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {step === "upload" && (
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center shadow-card transition-colors hover:bg-accent/40">
              <Upload className="h-7 w-7 text-muted-foreground" />
              <span className="text-sm font-medium">단일 명세서 업로드</span>
              <span className="text-xs text-muted-foreground">한 업체 명세서 (여러 페이지여도 1건) · PDF/이미지</span>
              <input
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleSingle(f);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-8 text-center shadow-card transition-colors hover:bg-primary/10">
              <Layers className="h-7 w-7 text-primary" />
              <span className="text-sm font-medium">여러 명세서 묶음 업로드</span>
              <span className="text-xs text-muted-foreground">여러 파일을 한꺼번에, 또는 합쳐진 PDF 1개 · 업체별로 묶어 확인 후 처리</span>
              <input
                type="file"
                accept={ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  if (files.length) handleBundle(files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}

        {step === "scanning" && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-card p-10 shadow-card">
            <Spinner text="명세서 읽는 중…" />
            <span className="text-xs text-muted-foreground">Claude가 표를 추출하고 있어요 (수 초 소요)</span>
          </div>
        )}

        {step === "grouping" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
              <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
                <Layers className="h-4 w-4" /> 명세서 {units.length}건 — 업체별로 묶었어요
              </span>
              <p className="mt-0.5 text-xs text-muted-foreground">
                업체가 잘못 묶였으면 카드의 업체를 바꾸고, 화살표로 순서를 조정한 뒤 다음으로 진행하세요.
              </p>
            </div>

            {groupedUnits.map((g) => (
              <div
                key={g.key}
                className="space-y-2 rounded-xl p-1 transition-colors"
                onDragOver={(e) => {
                  if (dragId) e.preventDefault();
                }}
                onDrop={() => dropOnGroup(g.key, g.vendorId)}
              >
                <div className="flex items-center gap-2 px-1">
                  <span className="text-sm font-semibold">{g.label}</span>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                    {g.units.length}건
                  </Badge>
                </div>
                {g.units.map((u) => (
                  <div
                    key={u.id}
                    draggable
                    onDragStart={() => setDragId(u.id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => {
                      if (dragId) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      dropOnUnit(u.id);
                    }}
                    className={`flex gap-3 rounded-xl bg-card p-3 shadow-card ${dragId === u.id ? "opacity-50" : ""} ${dragId ? "cursor-grabbing" : "lg:cursor-grab"}`}
                  >
                    <GripVertical className="mt-8 hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" />
                    <button
                      type="button"
                      onClick={() => openEnlarge(u)}
                      className="group relative shrink-0"
                      aria-label="크게 보기"
                    >
                      {u.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.thumbUrl}
                          alt=""
                          className="h-44 w-32 rounded-md border object-cover object-top transition group-hover:ring-2 group-hover:ring-primary"
                        />
                      ) : (
                        <div className="flex h-44 w-32 items-center justify-center rounded-md border bg-muted">
                          <FileText className="h-7 w-7 text-muted-foreground" />
                        </div>
                      )}
                      <span className="absolute inset-x-0 bottom-0 rounded-b-md bg-black/50 py-0.5 text-center text-[10px] text-white opacity-0 group-hover:opacity-100">
                        크게 보기
                      </span>
                    </button>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="truncate font-medium text-foreground">{u.invoice.vendorName || "업체 미상"}</span>
                        {u.invoice.invoiceDate && <span>· {u.invoice.invoiceDate}</span>}
                        <span>· {u.invoice.items.length}품목</span>
                      </div>
                      <SearchableSelect
                        value={u.vendorId}
                        onChange={(v) => reassignUnit(u.id, v)}
                        options={vendors.map((v) => ({ value: v.id, label: v.name, keywords: v.name }))}
                        placeholder="업체 선택"
                        allowClear
                        clearLabel={`미매칭 (${u.invoice.vendorName})`}
                        className="h-8 text-sm"
                      />
                      {groupRegUnitId === u.id ? (
                        <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-2">
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={regName}
                              onChange={(e) => setRegName(e.target.value)}
                              placeholder="업체명"
                              className="h-8 flex-1 text-sm"
                            />
                            <Input
                              type="number"
                              value={regRate}
                              onChange={(e) => setRegRate(e.target.value)}
                              className="h-8 w-14"
                              aria-label="할인율"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => handleRegisterVendorForUnit(u.id)}
                              disabled={registering || !regName.trim()}
                            >
                              {registering ? "등록 중…" : "등록"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => setGroupRegUnitId(null)}
                              disabled={registering}
                            >
                              취소
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setGroupRegUnitId(u.id);
                            setRegName(u.invoice.vendorName || "");
                            setRegRate("0");
                            setError("");
                          }}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Plus className="h-3.5 w-3.5" /> 신규 업체 등록
                        </button>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveUnit(u.id, "up")}
                        className="rounded p-1 text-muted-foreground hover:bg-accent"
                        aria-label="위로"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveUnit(u.id, "down")}
                        className="rounded p-1 text-muted-foreground hover:bg-accent"
                        aria-label="아래로"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEnlarge(u)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent"
                        aria-label="원본 보기"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            <div className="sticky bottom-0 flex gap-2 border-t border-border/60 bg-background/95 py-3 backdrop-blur-sm">
              <Button variant="outline" className="flex-1" onClick={reset}>
                취소
              </Button>
              <Button className="flex-1" onClick={proceedFromGrouping} disabled={units.length === 0}>
                <Check className="h-4 w-4" /> 다음 ({units.length}건)
              </Button>
            </div>

            {/* 명세서 크게 보기 */}
            <Dialog open={!!enlargeUnit} onOpenChange={(o) => !o && setEnlargeUnit(null)}>
              <DialogContent className="max-h-[92dvh] max-w-5xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-sm">
                    {enlargeUnit?.invoice.vendorName || "명세서"}
                    {enlargeUnit && enlargeUnit.kind === "pdf" ? ` · ${enlargeUnit.pageStart}~${enlargeUnit.pageEnd}쪽` : ""}
                  </DialogTitle>
                </DialogHeader>
                {enlargePages === null ? (
                  <div className="flex justify-center py-10">
                    <Spinner text="페이지 렌더 중…" />
                  </div>
                ) : enlargePages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">미리보기를 불러오지 못했습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {enlargePages.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt={`page ${i + 1}`} className="w-full rounded border" />
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            {queue.length > 1 && (
              <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5 font-medium text-primary">
                  <Layers className="h-4 w-4" /> 명세서 {queue.length}건 묶음
                </span>
                <span className="text-muted-foreground">{queueIndex + 1} / {queue.length} 처리 중</span>
              </div>
            )}
            <div className="rounded-2xl bg-card p-4 shadow-card space-y-3">
              <div className="space-y-1.5">
                <Label>업체</Label>
                <SearchableSelect
                  value={vendorId}
                  onChange={changeVendor}
                  options={vendors.map((v) => ({
                    value: v.id,
                    label: v.discount_rate ? `${v.name} · 할인 ${v.discount_rate}%` : v.name,
                    keywords: v.name,
                  }))}
                  placeholder="업체 선택"
                  allowClear
                  clearLabel={`매칭 안 됨${vendorName ? ` (${vendorName})` : ""}`}
                  className="h-9 text-sm"
                />

                {!regOpen && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openRegister}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" /> 신규 업체 등록
                    </button>
                    {!vendorId && (
                      <span className="text-xs text-amber-600">미등록 업체 — 등록하면 할인율이 적용돼요</span>
                    )}
                  </div>
                )}

                {regOpen && (
                  <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2.5">
                    <div className="flex items-center gap-2">
                      <Input
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="업체명"
                        className="h-8 flex-1 text-sm"
                      />
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={regRate}
                          onChange={(e) => setRegRate(e.target.value)}
                          className="h-8 w-16"
                          aria-label="할인율"
                        />
                        <span className="text-xs text-muted-foreground">% 할인</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={handleRegisterVendor} disabled={registering || !regName.trim()}>
                        {registering ? "등록 중…" : "등록"}
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setRegOpen(false)} disabled={registering}>
                        취소
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">가격비교 탭엔 숨겨지고, 명세서·거래처원장 검색에만 나와요. 할인율은 나중에 가격비교에서 수정 가능.</p>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-date">거래일자</Label>
                <Input id="inv-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
              <button
                type="button"
                onClick={() => setShowOriginal((s) => !s)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <FileText className="h-3.5 w-3.5" />
                {showOriginal ? "원본 숨기기" : "원본 보기"}
              </button>
              {showOriginal && (
                fileKind === "image" && previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="원본 명세서" className="w-full rounded-md border" />
                ) : fileKind === "pdf" ? (
                  loadingOriginal ? (
                    <div className="flex items-center justify-center py-8">
                      <Spinner text="원본 페이지 렌더 중…" />
                    </div>
                  ) : originalPages && originalPages.length > 0 ? (
                    <div className="space-y-2">
                      {originalPages.map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={src}
                          alt={`원본 명세서 ${currentPageStart + i}쪽`}
                          className="w-full rounded-md border"
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">원본을 불러올 수 없습니다.</p>
                  )
                ) : null
              )}
            </div>

            <div className="space-y-2">
              {rows.map((row) => {
                const d = derive(row);
                const hasMatch = row.allocations.length > 0;
                const leftover = d.leftover;
                return (
                  <div
                    key={row.id}
                    className={`rounded-xl bg-card p-3 shadow-card ${leftover !== 0 ? "ring-1 ring-amber-300" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <Input
                        value={row.name}
                        onChange={(e) => updateRow(row.id, { name: e.target.value })}
                        className="h-8 flex-1 text-sm font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                        className="mt-1 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="라인 삭제"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* 수량 / 명세서 정가 입력 */}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">수량</span>
                        <Input
                          type="number"
                          value={row.quantity}
                          onChange={(e) => updateRow(row.id, { quantity: Number(e.target.value) || 0 })}
                          className="h-8 w-16"
                        />
                      </label>
                      <label className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">명세서 정가</span>
                        <Input
                          type="number"
                          value={row.listPrice}
                          onChange={(e) => updateRow(row.id, { listPrice: Number(e.target.value) || 0 })}
                          className="h-8 w-24"
                        />
                        <span className="text-xs text-muted-foreground">원</span>
                      </label>
                    </div>

                    {/* 단가 비교 — 신규/불일치일 때만 표시 (일치는 생략) */}
                    {d.isNewProduct ? (
                      <div className="mt-2 flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-2 text-xs text-blue-700">
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">신규</Badge>
                        <span>앱에 없는 품목 — 이 단가({won(d.computedUnitPrice)})로 새로 등록돼요</span>
                      </div>
                    ) : d.priceMismatch ? (
                      <div className="mt-2 space-y-1 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                        <div className="text-[11px] font-medium opacity-80">단가 불일치 · 할인후 기준</div>
                        <div className="flex items-center justify-between">
                          <span>{discountRate > 0 ? `명세서 정가 → 할인후 (−${discountRate}%)` : "명세서 단가"}</span>
                          <span className="font-semibold tabular-nums">{won(d.computedUnitPrice)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>앱 저장 단가 (할인후)</span>
                          <span className="font-semibold tabular-nums">{won(d.currentUnitPrice ?? 0)}</span>
                        </div>
                        <label className="mt-0.5 flex cursor-pointer items-center justify-between gap-2 border-t border-amber-200 pt-1.5">
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            앱 단가를 {won(d.computedUnitPrice)}로
                          </span>
                          <span className="flex shrink-0 items-center gap-1 font-medium">
                            <input
                              type="checkbox"
                              checked={row.updatePrice}
                              onChange={(e) => updateRow(row.id, { updatePrice: e.target.checked })}
                            />
                            갱신
                          </span>
                        </label>
                      </div>
                    ) : null}

                    {/* 검수대기 배분 */}
                    <div className="mt-2 border-t border-border/60 pt-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">검수대기 배분</span>
                        <span className={`text-xs ${leftover === 0 ? "text-muted-foreground" : "text-amber-600"}`}>
                          배분 {d.allocated} / {row.quantity}{leftover !== 0 ? ` · 잔여 ${leftover}` : ""}
                        </span>
                      </div>

                      {row.allocations.map((a, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <div className="flex-1">
                            <SearchableSelect
                              value={a.orderId}
                              onChange={(v) => updateAlloc(row.id, idx, { orderId: v ?? "" })}
                              options={orderOptionsFor(row, a.orderId).map((o) => ({
                                value: o.id,
                                label: orderLabel(o),
                                keywords: o.item_name,
                              }))}
                              placeholder="주문 선택"
                              emptyText="검수대기 주문 없음"
                            />
                          </div>
                          <Input
                            type="number"
                            value={a.quantity}
                            onChange={(e) => updateAlloc(row.id, idx, { quantity: Number(e.target.value) || 0 })}
                            className="h-8 w-14"
                            aria-label="배분 수량"
                          />
                          <button
                            type="button"
                            onClick={() => removeAlloc(row.id, idx)}
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            aria-label="배분 삭제"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}

                      <div className="flex items-center gap-3">
                        {orderOptionsFor(row).length > 0 && (
                          <button
                            type="button"
                            onClick={() => addAlloc(row.id)}
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Plus className="h-3.5 w-3.5" /> 주문 추가 배분
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => redistribute(row.id)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw className="h-3 w-3" /> 자동 재배분
                        </button>
                      </div>

                      {/* 잔여 처리 */}
                      {leftover > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="bg-red-50 text-red-700 gap-1 shrink-0">
                            <AlertTriangle className="h-3 w-3" /> {hasMatch ? `잔여 ${leftover}` : "오류건"}
                          </Badge>
                          <Select
                            value={row.leftoverAction}
                            onValueChange={(v) => updateRow(row.id, { leftoverAction: v as UnmatchedAction })}
                          >
                            <SelectTrigger className="h-8 flex-1 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="inspect">검수완료로 등록</SelectItem>
                              <SelectItem value="return">반품으로 등록</SelectItem>
                              <SelectItem value="ledger">원장에만 기록</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-border/60 bg-background/95 py-3 backdrop-blur-sm">
              <Button variant="outline" className="flex-1" onClick={skipCurrent} disabled={saving}>
                <RefreshCw className="h-4 w-4" /> {queueIndex + 1 < queue.length ? "이 명세서 건너뛰기" : "건너뛰기"}
              </Button>
              <Button className="flex-1" onClick={handleConfirm} disabled={saving || rows.length === 0}>
                <Check className="h-4 w-4" />{" "}
                {saving
                  ? "처리 중…"
                  : queueIndex + 1 < queue.length
                    ? `확정 후 다음 (${rows.length})`
                    : `확정 (${rows.length}건)`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
