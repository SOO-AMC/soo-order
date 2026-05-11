"use server";

import { requireUser } from "@/lib/supabase/server";

/**
 * 관리자가 요청자의 주문을 수정했을 때 요청자에게 인앱 알림 생성.
 * fire-and-forget 으로 호출 (실패해도 수정 자체는 영향 없음).
 */
export async function notifyOrderEdited(
  orderId: string,
  recipientId: string,
  itemName: string,
  link: string,
  changes: string[],
) {
  if (!orderId || !recipientId) return;

  const { supabase, userId } = await requireUser();

  // 본인이 본인 주문을 수정한 경우엔 알림 안 보냄
  if (recipientId === userId) return;

  await supabase.from("notifications").insert({
    user_id: recipientId,
    order_id: orderId,
    type: "order_edited",
    title: `'${itemName}' 주문이 수정되었습니다`,
    body: changes.length > 0 ? changes.join("\n") : "주문 정보가 수정되었습니다.",
    link: link || null,
  });
}

/** 알림 읽음 처리 */
export async function markNotificationRead(notificationId: string) {
  const { supabase, userId } = await requireUser();
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", userId);
}

/** 안 읽은 알림 모두 읽음 처리 */
export async function markAllNotificationsRead() {
  const { supabase, userId } = await requireUser();
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
}
