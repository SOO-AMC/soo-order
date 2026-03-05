import { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { defineString } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "firebase-functions/v2";

initializeApp();

// ── Supabase 환경변수 (런타임에 resolve) ──

const supabaseUrl = defineString("SUPABASE_URL");
const supabaseKey = defineString("SUPABASE_SERVICE_ROLE_KEY");

// ── Supabase client (lazy init) ──

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(supabaseUrl.value(), supabaseKey.value());
  }
  return _supabase;
}

// ── Name → Profile ID 캐시 (5분) ──

let profileCache: Map<string, string> | null = null;
let profileCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;
let adminId: string | null = null;

async function getProfileMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (profileCache && now - profileCacheTime < CACHE_TTL) {
    return profileCache;
  }

  const { data, error } = await getSupabase()
    .from("profiles")
    .select("id, full_name");

  if (error) {
    logger.error("Failed to fetch profiles", error);
    return profileCache ?? new Map();
  }

  const map = new Map<string, string>();
  for (const row of data) {
    map.set(row.full_name, row.id);
    if (row.full_name === "정윤혁") {
      adminId = row.id;
    }
  }

  profileCache = map;
  profileCacheTime = now;
  return map;
}

async function resolveProfileId(
  name: string | null | undefined,
  fallbackToAdmin: boolean,
): Promise<string | null> {
  if (!name) return fallbackToAdmin ? adminId : null;
  const map = await getProfileMap();
  return map.get(name) ?? (fallbackToAdmin ? adminId : null);
}

// ── 필드 변환 ──

function parseType(raw: unknown): "order" | "return" {
  if (raw === "반품") return "return";
  return "order";
}

function parseStatus(progress: unknown): string {
  switch (progress) {
    case 1: return "ordered";
    case 2: return "inspecting";
    default: return "pending";
  }
}

function parseQuantityAndUnit(raw: unknown): { quantity: number; unit: string } {
  if (raw == null) return { quantity: 0, unit: "" };
  const str = String(raw);
  const match = str.match(/^(\d+)\s*(.*)$/);
  if (match) {
    return { quantity: parseInt(match[1], 10), unit: match[2].trim() };
  }
  return { quantity: 0, unit: str };
}

function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

function toISO(raw: unknown): string | null {
  if (raw == null) return null;
  // Firestore Timestamp has toDate()
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    return (raw as { toDate(): Date }).toDate().toISOString();
  }
  if (typeof raw === "string") return raw;
  return null;
}

// ── Upsert 로직 ──

async function syncToSupabase(docId: string, data: Record<string, unknown>) {
  const profiles = await getProfileMap();
  // adminId 보장
  if (!adminId && profiles.size > 0) {
    adminId = profiles.values().next().value ?? null;
  }

  const requesterId = await resolveProfileId(data.requester as string, true);
  const updatedBy = await resolveProfileId(data.orderer as string, true);
  const inspectedBy = await resolveProfileId(data.inspector as string, false);

  const { quantity, unit } = parseQuantityAndUnit(data.requestQty);

  const row = {
    firebase_id: docId,
    type: parseType(data.type),
    item_name: data.name ?? "",
    quantity,
    unit,
    status: parseStatus(data.progress),
    vendor_name: data.companyNm ?? "",
    requester_id: requesterId,
    updated_by: updatedBy,
    inspected_by: inspectedBy,
    confirmed_quantity: parseNumber(data.confirmQty),
    invoice_received: data.hasTS === true,
    created_at: toISO(data.createdAt),
    inspected_at: toISO(data.recievedAt),
    updated_at: toISO(data.lastEdited),
  };

  const { error } = await getSupabase()
    .from("orders")
    .upsert(row, { onConflict: "firebase_id" });

  if (error) {
    logger.error(`Upsert failed for ${docId}`, error);
    throw error;
  }

  logger.info(`Synced ${docId} → Supabase`);
}

// ── Cloud Functions 트리거 ──

export const onItemCreated = onDocumentCreated("Items/{docId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  await syncToSupabase(snap.id, snap.data());
});

export const onItemUpdated = onDocumentUpdated("Items/{docId}", async (event) => {
  const snap = event.data?.after;
  if (!snap) return;
  await syncToSupabase(snap.id, snap.data());
});

export const onItemDeleted = onDocumentDeleted("Items/{docId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const { error } = await getSupabase()
    .from("orders")
    .delete()
    .eq("firebase_id", snap.id);

  if (error) {
    logger.error(`Delete failed for ${snap.id}`, error);
    throw error;
  }

  logger.info(`Deleted ${snap.id} from Supabase`);
});
