"use server";

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/utils/activity-log";
import { botId, buttonMessage, sendToUser } from "@/lib/naverworks/bot";
import { directoryConfig } from "@/lib/naverworks/directory";
import { LINK_TABLE } from "@/lib/naverworks/links";
import { notificationLink } from "@/lib/naverworks/oidc";
import { formatIssueDate, kstDate } from "@/lib/briefing/kst";
import { briefingChannelBody } from "@/lib/briefing/naverworks-send";
import { buildNaverWorksMessage } from "@/lib/briefing/notify";
import { isIssueVisible } from "@/lib/briefing/publish-rules";
import type { BriefingIssue } from "@/lib/briefing/types";

/**
 * 네이버웍스 알림 시험 (관리자 전용): 누른 관리자 본인에게만 1:1 메시지 1건을 보낸다.
 * 다른 직원·단체방에는 보내지 않는다. 버튼은 지금 열어 둔 수오더 주소(예: http://localhost:3001)로 간다.
 */
type SendResult = { ok: true; to: string } | { ok: false; error: string };
type Admin = Awaited<ReturnType<typeof requireAdmin>>;

/** 보낼 준비: 봇 설정 · 받는 사람(내 네이버웍스 계정) · 버튼이 갈 주소 */
async function prepare(admin: Admin) {
  const cfg = directoryConfig();
  const bot = botId();
  if (!cfg || !bot) return { ok: false as const, error: "네이버웍스 봇 설정(서비스 계정·개인 키·NAVERWORKS_BOT_ID)이 아직 없어요." };

  const { data: link } = await createAdminClient().from(LINK_TABLE).select("nw_login_email, nw_email").eq("user_id", admin.userId).maybeSingle();
  const to = (link?.nw_login_email as string | null) || (link?.nw_email as string | null);
  if (!to) return { ok: false as const, error: "내 계정에 네이버웍스가 연결돼 있지 않아요. 내 계정 → 네이버웍스 연결을 먼저 해 주세요." };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  const base = (process.env.NAVERWORKS_REDIRECT_BASE ?? "").trim() || (host ? `${proto}://${host}` : null);
  return { ok: true as const, cfg, bot, to, base };
}

async function deliver(p: Extract<Awaited<ReturnType<typeof prepare>>, { ok: true }>, body: object, what: string): Promise<SendResult> {
  try {
    const res = await sendToUser(p.cfg, p.bot, p.to, body);
    if (!res.ok) {
      console.error(`[naverworks] ${what} 실패:`, res.status, res.error);
      return { ok: false, error: `보내지 못했어요 (${res.status}). ${res.status === 403 ? "봇 사용 권한이나 앱의 bot 권한 범위를 확인해 주세요." : res.status === 404 ? "네이버웍스에서 받는 사람을 찾지 못했어요." : ""}` };
    }
  } catch (e) {
    console.error(`[naverworks] ${what} 오류:`, e instanceof Error ? e.message : e);
    return { ok: false, error: "보내지 못했어요. 잠시 뒤 다시 눌러 주세요." };
  }
  return { ok: true, to: p.to };
}

export async function sendTestNotificationToMe(): Promise<SendResult> {
  const admin = await requireAdmin();
  const p = await prepare(admin);
  if (!p.ok) return p;
  const body = buttonMessage(
    "[알림 시험] 네이버웍스 연동이 잘 되는지 확인하는 메시지예요.\n아래 버튼을 누르면 수오더 논문 브리핑으로 가요.",
    { label: "오늘 논문 보기", url: notificationLink("/briefing", p.base) },
  );
  const res = await deliver(p, body, "시험 메시지");
  if (res.ok) void logActivity({ userId: admin.userId, userName: admin.userName, category: "auth", action: "naverworks_test_message", description: "네이버웍스 알림 시험 메시지를 나에게 보냄" });
  return res;
}

/**
 * 오늘 발행된 브리핑으로 단체방에 나갈 것과 **같은 내용**(글 + "오늘 논문 보기" 버튼)을 나에게만 1:1로 보낸다.
 * 단체방 발송 스위치와 상관없고, 발송 기록(briefing_notification_logs)도 건드리지 않는다 — 내일 실제 발송에 영향 없음.
 */
export async function sendTodayBriefingToMe(): Promise<SendResult> {
  const admin = await requireAdmin();
  const today = kstDate();
  const { data: issue } = await admin.supabase.from("briefing_issues").select("id, issue_date, status, scheduled_at").eq("issue_date", today).maybeSingle();
  if (!issue || !isIssueVisible(issue as Pick<BriefingIssue, "status" | "scheduled_at">)) {
    return { ok: false, error: `${formatIssueDate(today)} 브리핑이 아직 발행되지 않았어요. 발행한 뒤에 눌러 주세요.` };
  }
  const { data: rows } = await admin.supabase.from("briefing_papers").select("id, headline, review_status").eq("issue_id", issue.id).eq("review_status", "reviewed").order("display_order");
  const papers = ((rows as { id: string; headline: string | null }[] | null) ?? []).map((r) => ({ id: r.id, headline: r.headline ?? "(제목 없음)" }));
  if (papers.length === 0) return { ok: false, error: "오늘 브리핑에 보낼 논문이 없어요." };

  const p = await prepare(admin);
  if (!p.ok) return p;
  const res = await deliver(p, briefingChannelBody(buildNaverWorksMessage(today, papers, p.base)), "오늘 브리핑 미리 받기");
  if (res.ok) void logActivity({ userId: admin.userId, userName: admin.userName, category: "briefing", action: "naverworks_briefing_preview", description: `${today} 브리핑 네이버웍스 메시지를 나에게만 보냄 (논문 ${papers.length}건)` });
  return res;
}
