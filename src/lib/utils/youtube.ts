/** 유튜브 영상 번호는 11자 (영문·숫자·-·_) */
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * 붙여넣은 유튜브 링크(또는 영상 번호)에서 영상 번호를 뽑는다. 못 뽑으면 null.
 * 받는 꼴: youtu.be/번호 · youtube.com/watch?v=번호 · /embed/번호 · /shorts/번호 · /live/번호 · 번호만
 */
export function parseYouTubeId(input: string): string | null {
  const text = (input ?? "").trim();
  if (!text) return null;
  if (ID_RE.test(text)) return text;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "").toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = m?.[1] ?? null;
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

/** 로그인 화면용 퍼가기 주소 (소리 없이 · 반복 · 조작 막대 없이) */
export function loginEmbedUrl(id: string): string {
  return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&disablekb=1&iv_load_policy=3`;
}
