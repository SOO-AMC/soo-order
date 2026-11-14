import { createClient } from "@/lib/supabase/server";

/** 설정이 없거나 읽지 못하면 쓰는 영상 (261030 메인영상) */
export const DEFAULT_LOGIN_VIDEO_ID = "cjx0hcdmry8";

export type LoginVideoSetting = { videoId: string; title: string | null };

/**
 * 로그인 화면 배경 영상. 관리자가 앱 설정에서 바꾼 값을 읽는다.
 * 로그인 전에도 읽을 수 있게 DB 정책이 이 값만 공개한다. 표가 아직 없거나 오류면 기본 영상.
 */
export async function readLoginVideo(): Promise<LoginVideoSetting> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("app_settings").select("value").eq("key", "login_video").maybeSingle();
    const v = (data?.value ?? null) as { videoId?: unknown; title?: unknown } | null;
    if (error || !v || typeof v.videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(v.videoId)) {
      return { videoId: DEFAULT_LOGIN_VIDEO_ID, title: null };
    }
    return { videoId: v.videoId, title: typeof v.title === "string" ? v.title : null };
  } catch {
    return { videoId: DEFAULT_LOGIN_VIDEO_ID, title: null };
  }
}
