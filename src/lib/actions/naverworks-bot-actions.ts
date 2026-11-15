"use server";

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/utils/activity-log";
import { botId, buttonMessage, sendToUser } from "@/lib/naverworks/bot";
import { directoryConfig } from "@/lib/naverworks/directory";
import { LINK_TABLE } from "@/lib/naverworks/links";
import { notificationLink } from "@/lib/naverworks/oidc";

/**
 * 네이버웍스 알림 시험 (관리자 전용): 누른 관리자 본인에게만 1:1 메시지 1건을 보낸다.
 * 다른 직원·단체방에는 보내지 않는다. 버튼은 지금 열어 둔 수오더 주소(예: http://localhost:3002)로 간다.
 */
export async function sendTestNotificationToMe(): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const { userId, userName } = await requireAdmin();
  const cfg = directoryConfig();
  const bot = botId();
  if (!cfg || !bot) return { ok: false, error: "네이버웍스 봇 설정(서비스 계정·개인 키·NAVERWORKS_BOT_ID)이 아직 없어요." };

  const { data: link } = await createAdminClient().from(LINK_TABLE).select("nw_login_email, nw_email").eq("user_id", userId).maybeSingle();
  const to = (link?.nw_login_email as string | null) || (link?.nw_email as string | null);
  if (!to) return { ok: false, error: "내 계정에 네이버웍스가 연결돼 있지 않아요. 내 계정 → 네이버웍스 연결을 먼저 해 주세요." };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  const base = (process.env.NAVERWORKS_REDIRECT_BASE ?? "").trim() || (host ? `${proto}://${host}` : null);

  const body = buttonMessage(
    "[알림 시험] 네이버웍스 연동이 잘 되는지 확인하는 메시지예요.\n아래 버튼을 누르면 수오더 논문 브리핑으로 가요.",
    { label: "오늘 논문 보기", url: notificationLink("/briefing", base) },
  );
  try {
    const res = await sendToUser(cfg, bot, to, body);
    if (!res.ok) {
      console.error("[naverworks] 시험 메시지 실패:", res.status, res.error);
      return { ok: false, error: `보내지 못했어요 (${res.status}). ${res.status === 403 ? "봇 사용 권한이나 앱의 bot 권한 범위를 확인해 주세요." : res.status === 404 ? "네이버웍스에서 받는 사람을 찾지 못했어요." : ""}` };
    }
  } catch (e) {
    console.error("[naverworks] 시험 메시지 오류:", e instanceof Error ? e.message : e);
    return { ok: false, error: "보내지 못했어요. 잠시 뒤 다시 눌러 주세요." };
  }
  void logActivity({ userId, userName, category: "auth", action: "naverworks_test_message", description: "네이버웍스 알림 시험 메시지를 나에게 보냄" });
  return { ok: true, to };
}
