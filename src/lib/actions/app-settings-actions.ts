"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/server";
import { logActivity } from "@/lib/utils/activity-log";
import { parseYouTubeId } from "@/lib/utils/youtube";
import { DEFAULT_LOGIN_VIDEO_ID, readLoginVideo, type LoginVideoSetting } from "@/lib/settings/login-video";

export type SettingResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** 지금 로그인 화면 영상 (관리자 화면용) */
export async function fetchLoginVideoSetting(): Promise<LoginVideoSetting & { isDefault: boolean; defaultId: string }> {
  await requireAdmin();
  const v = await readLoginVideo();
  return { ...v, isDefault: v.videoId === DEFAULT_LOGIN_VIDEO_ID, defaultId: DEFAULT_LOGIN_VIDEO_ID };
}

/**
 * 유튜브가 이 영상을 다른 사이트에서 재생하게 해 주는지 확인 (공개 정보만 묻는다 — 영상 주소 외에 아무것도 보내지 않는다)
 * ok=false 면 저장하지 않는다. 확인 자체가 안 되면(인터넷 문제) unknown.
 */
async function checkEmbeddable(id: string): Promise<{ ok: true; title: string | null } | { ok: false; error: string } | { ok: "unknown" }> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (res.ok) {
      const j = (await res.json().catch(() => null)) as { title?: unknown } | null;
      return { ok: true, title: typeof j?.title === "string" ? j.title.slice(0, 200) : null };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, error: "이 영상은 다른 사이트에서 재생할 수 없게 막혀 있어요. 영상 주인이 '퍼가기 허용'을 켜야 해요." };
    if (res.status === 404 || res.status === 400) return { ok: false, error: "영상을 찾지 못했어요. 비공개이거나 지워진 영상일 수 있어요." };
    return { ok: "unknown" };
  } catch {
    return { ok: "unknown" };
  }
}

/** 로그인 화면 영상 바꾸기 — 유튜브 링크를 붙여넣으면 된다 */
export async function updateLoginVideo(link: string): Promise<SettingResult<LoginVideoSetting & { note: string | null }>> {
  const { supabase, userId, userName } = await requireAdmin();
  const id = parseYouTubeId(link);
  if (!id) return { ok: false, error: "유튜브 링크를 알아보지 못했어요. 영상 페이지의 주소(youtu.be/… 또는 youtube.com/watch?v=…)를 붙여넣어 주세요." };

  const check = await checkEmbeddable(id);
  if (check.ok === false) return { ok: false, error: check.error };
  const title = check.ok === true ? check.title : null;

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "login_video", value: { videoId: id, title }, updated_by: userId }, { onConflict: "key" });
  if (error) {
    if (error.code === "42P01" || /app_settings/.test(error.message)) {
      return { ok: false, error: "설정 표가 아직 없어요. supabase/migrate-app-settings.sql 을 먼저 실행해 주세요." };
    }
    return { ok: false, error: "저장하지 못했어요. 잠시 뒤 다시 눌러 주세요." };
  }
  void logActivity({ userId, userName, category: "account", action: "update_login_video", description: `로그인 화면 영상 변경: ${title ?? id}` });
  revalidatePath("/login");
  revalidatePath("/settings");
  return {
    ok: true,
    data: { videoId: id, title, note: check.ok === "unknown" ? "유튜브에 재생 가능 여부를 확인하지 못했어요. 로그인 화면에서 영상이 나오는지 한 번 봐 주세요." : null },
  };
}

/** 기본 영상으로 되돌리기 */
export async function resetLoginVideo(): Promise<SettingResult<LoginVideoSetting>> {
  const { supabase, userId, userName } = await requireAdmin();
  const { error } = await supabase.from("app_settings").delete().eq("key", "login_video");
  if (error) return { ok: false, error: "되돌리지 못했어요. 잠시 뒤 다시 눌러 주세요." };
  void logActivity({ userId, userName, category: "account", action: "reset_login_video", description: "로그인 화면 영상을 기본 영상으로 되돌림" });
  revalidatePath("/login");
  revalidatePath("/settings");
  return { ok: true, data: { videoId: DEFAULT_LOGIN_VIDEO_ID, title: null } };
}
