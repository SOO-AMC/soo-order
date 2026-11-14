"use client";

import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/hooks/use-auth";
import { BackButton } from "@/components/back-button";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OrderForm } from "@/components/orders/order-form";
import type { OrderFormResult } from "@/components/orders/order-form";
import type { Order } from "@/lib/types/order";
import { enqueueEditOrderPhotos } from "@/lib/utils/upload-queue";
import { logClientAction } from "@/app/(main)/log-action";
import { notifyOrderEdited } from "@/lib/actions/notification-actions";
import { describeOrderChanges } from "@/lib/utils/order-changes";

export function InspectionEditForm({ order }: { order: Order }) {
  const id = order.id;
  const router = useRouter();
  const supabase = createClient();
  const { userId: currentUserId } = useAuth();

  const handleSubmit = async (data: OrderFormResult) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const existingPaths = order.photo_urls ?? [];
    const keptPaths = data.photos.filter((p) => p.type === "existing").map((p) => p.path);
    const deletedPaths = existingPaths.filter((p) => !keptPaths.includes(p));
    const newFiles = data.photos.filter((p) => p.type === "new").map((p) => p.file);

    const prevVendor = order.vendor_name ?? "";
    const vendorChanged = data.vendor_name !== prevVendor;

    const { error } = await supabase
      .from("orders")
      .update({
        item_name: data.item_name,
        quantity: data.quantity,
        unit: data.unit,
        is_urgent: data.is_urgent,
        notes: data.notes,
        vendor_name: data.vendor_name,
        inspection_notes: data.inspection_notes,
        updated_by: user?.id,
        photo_urls: keptPaths,
      })
      .eq("id", id);

    if (error) throw error;

    logClientAction("inspection", "edit_item", `${data.item_name} 품목 정보 수정`);
    if (vendorChanged) {
      logClientAction(
        "dispatch",
        "update_vendor",
        `${data.item_name} 업체명 변경: ${prevVendor || "(없음)"} → ${data.vendor_name || "(없음)"}`
      );
    }

    // 요청자가 아닌 사람(관리자)이 수정했으면 요청자에게 알림
    if (order.requester_id && user?.id && user.id !== order.requester_id) {
      const changes = describeOrderChanges(
        {
          item_name: order.item_name,
          quantity: order.quantity,
          unit: order.unit ?? "",
          is_urgent: !!order.is_urgent,
          notes: order.notes ?? "",
          vendor_name: order.vendor_name ?? "",
          photoCount: order.photo_urls?.length ?? 0,
          inspection_notes: order.inspection_notes ?? "",
        },
        {
          item_name: data.item_name,
          quantity: data.quantity,
          unit: data.unit ?? "",
          is_urgent: !!data.is_urgent,
          notes: data.notes ?? "",
          vendor_name: data.vendor_name ?? "",
          photoCount: data.photos.length,
          inspection_notes: data.inspection_notes ?? "",
        }
      );
      notifyOrderEdited(id, order.requester_id, data.item_name, `/inspection/${id}`, changes, data.change_reason).catch(() => {});

      // 수량·품목을 바꿨으면 "무엇을 왜 바꿨는지"를 주문에 남긴다 → 주문자가 주문 화면에서 볼 수 있다.
      // 따로 저장한다: 이 칸들이 아직 없어도(마이그레이션 전) 위의 수정 자체는 이미 끝났다.
      if (data.change_reason) {
        const summary = changes.filter((c) => c.startsWith("수량:") || c.startsWith("품목명:")).join(" · ");
        await supabase
          .from("orders")
          .update({ admin_change_summary: summary, admin_change_reason: data.change_reason, admin_change_at: new Date().toISOString() })
          .eq("id", id);
      }
    }

    router.push(`/inspection/${id}`);

    enqueueEditOrderPhotos(supabase, id, keptPaths, newFiles, deletedPaths);
  };

  return (
    <div className="mx-auto max-w-md md:max-w-2xl">
      <PageHeader title="품목 수정" leading={<BackButton fallbackHref={`/inspection/${id}`} />} />
      <div className="py-2 lg:px-6 lg:py-4">
          <OrderForm
            defaultValues={{
              item_name: order.item_name,
              quantity: order.quantity,
              unit: order.unit,
              is_urgent: order.is_urgent,
              notes: order.notes ?? "",
              vendor_name: order.vendor_name ?? "",
              inspection_notes: order.inspection_notes ?? "",
            }}
            existingPhotoUrls={order.photo_urls}
            showVendorField
            showInspectionField
            changeReasonFor={
              currentUserId && order.requester_id && currentUserId !== order.requester_id
                ? { item_name: order.item_name, quantity: order.quantity, unit: order.unit ?? "" }
                : undefined
            }
            onSubmit={handleSubmit}
          />
      </div>
    </div>
  );
}
