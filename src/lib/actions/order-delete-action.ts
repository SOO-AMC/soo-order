"use server";

import { requireUser } from "@/lib/supabase/server";
import { logActivity } from "@/lib/utils/activity-log";
import { deleteNotifications } from "@/lib/utils/order-notify";

/**
 * 주문 삭제 — 모든 삭제가 여기를 지난다.
 * 다른 사람의 주문을 지울 때는 사유가 꼭 있어야 하고, 주문자에게 사유와 어떤 주문이었는지 알림이 간다.
 * 자기 주문을 지우는 것은 사유 없이 된다(알림도 없음).
 */
export async function deleteOrdersWithReason(
  orderIds: string[],
  reason: string,
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const ids = [...new Set(orderIds)].filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "지울 주문이 없어요." };
  if (ids.length > 100) return { ok: false, error: "한 번에 100건까지 지울 수 있어요." };

  const { supabase, userId } = await requireUser();
  const [{ data: me }, { data: rows, error: readErr }] = await Promise.all([
    supabase.from("profiles").select("role, full_name").eq("id", userId).single(),
    supabase.from("orders").select("id, requester_id, item_name, quantity, unit, status, vendor_name, created_at, photo_urls").in("id", ids),
  ]);
  if (readErr) return { ok: false, error: "주문을 불러오지 못했어요. 잠시 뒤 다시 해 주세요." };
  const list = (rows ?? []) as {
    id: string;
    requester_id: string | null;
    item_name: string;
    quantity: number | null;
    unit: string | null;
    status: string;
    vendor_name: string | null;
    created_at: string;
    photo_urls: string[] | null;
  }[];
  if (list.length === 0) return { ok: false, error: "주문을 찾을 수 없어요. 이미 삭제됐을 수 있어요." };

  const isAdmin = me?.role === "admin";
  if (!isAdmin && list.some((o) => o.requester_id !== userId)) return { ok: false, error: "다른 사람의 주문은 관리자만 지울 수 있어요." };
  const why = reason.trim();
  if (list.some((o) => o.requester_id && o.requester_id !== userId) && why.length < 2) {
    return { ok: false, error: "다른 사람의 주문을 지울 때는 사유를 적어 주세요. 주문한 사람에게 함께 알려요." };
  }

  const { data: gone, error } = await supabase
    .from("orders")
    .delete()
    .in("id", list.map((o) => o.id))
    .select("id");
  if (error) return { ok: false, error: "삭제하지 못했어요. 잠시 뒤 다시 해 주세요." };
  const goneIds = new Set((gone ?? []).map((g) => g.id as string));
  const deleted = list.filter((o) => goneIds.has(o.id));
  if (deleted.length === 0) return { ok: false, error: "삭제하지 못했어요. 권한이 없거나 이미 삭제된 주문이에요." };

  const photos = deleted.flatMap((o) => o.photo_urls ?? []);
  // 사진 정리 (lib/utils/photo.ts 는 브라우저 압축 라이브러리를 불러와서 서버에서는 저장소를 직접 부른다)
  if (photos.length) await supabase.storage.from("order-photos").remove(photos).catch(() => {});

  const notes = deleteNotifications(deleted, userId, me?.full_name ?? "", why);
  if (notes.length) {
    const { error: nErr } = await supabase.from("notifications").insert(notes);
    if (nErr) console.error("[delete] 알림 저장 실패:", nErr.message);
  }

  void logActivity({
    userId,
    userName: me?.full_name ?? "알 수 없음",
    category: "order",
    action: "delete_order",
    description: `${deleted.length === 1 ? `'${deleted[0].item_name}'` : `${deleted.length}건`} 주문 삭제${why ? ` · 사유: ${why}` : ""}`,
    metadata: {
      reason: why || null,
      orders: deleted.map((o) => ({
        id: o.id,
        item: o.item_name,
        quantity: o.quantity,
        unit: o.unit,
        status: o.status,
        vendor: o.vendor_name,
        requesterId: o.requester_id,
        createdAt: o.created_at,
      })),
    },
  });

  return { ok: true, deleted: deleted.length };
}
