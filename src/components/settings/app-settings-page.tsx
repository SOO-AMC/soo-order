"use client";

import { useState } from "react";
import { CheckCircle2, Film, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { resetLoginVideo, updateLoginVideo } from "@/lib/actions/app-settings-actions";
import { parseYouTubeId } from "@/lib/utils/youtube";

type LoginVideo = { videoId: string; title: string | null; isDefault: boolean; defaultId: string };

/** 앱 설정 (관리자) — 지금은 로그인 화면 영상 하나 */
export function AppSettingsPage({ loginVideo }: { loginVideo: LoginVideo }) {
  const [current, setCurrent] = useState(loginVideo);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const previewId = parseYouTubeId(link);
  const shownId = previewId ?? current.videoId;
  const linkInvalid = link.trim() !== "" && !previewId;

  const save = async () => {
    if (busy || !previewId) return;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const res = await updateLoginVideo(link);
      if (!res.ok) return setError(res.error);
      setCurrent({ ...current, videoId: res.data.videoId, title: res.data.title, isDefault: res.data.videoId === current.defaultId });
      setLink("");
      setNotice(res.data.note ?? "바꿨어요. 로그인 화면(PC)에 바로 나와요.");
    } catch {
      setError("저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (busy) return;
    setBusy("reset");
    setError("");
    setNotice("");
    try {
      const res = await resetLoginVideo();
      if (!res.ok) return setError(res.error);
      setCurrent({ ...current, videoId: res.data.videoId, title: null, isDefault: true });
      setNotice("기본 영상으로 되돌렸어요.");
    } catch {
      setError("되돌리지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="앱 설정"
        leading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
      />
      <div className="mx-auto max-w-md space-y-4 p-4 md:max-w-2xl lg:max-w-3xl lg:px-6">
        <section className="rounded-xl bg-card p-5 ring-1 ring-border">
          <div className="flex items-start gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-subtle-foreground">
              <Film className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-tight">로그인 화면 영상</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">PC 로그인 화면 왼쪽에 소리 없이 반복 재생돼요. 휴대폰 로그인 화면에는 나오지 않아요.</p>
            </div>
          </div>

          {/* 미리보기 (링크를 붙여넣으면 그 영상으로 바뀐다) */}
          <div className="mt-4 overflow-hidden rounded-xl bg-black ring-1 ring-border">
            <iframe
              key={shownId}
              src={`https://www.youtube.com/embed/${shownId}?mute=1&rel=0&modestbranding=1&playsinline=1`}
              title="로그인 화면 영상 미리보기"
              className="aspect-video w-full"
              allow="autoplay; encrypted-media"
              loading="lazy"
            />
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {previewId ? (
              <b className="font-semibold text-foreground">새 영상 미리보기 — 아직 저장 전이에요</b>
            ) : (
              <>
                지금 영상: <span className="font-medium text-foreground">{current.title ?? (current.isDefault ? "기본 영상" : current.videoId)}</span>
                {current.isDefault && current.title ? " (기본 영상)" : ""}
              </>
            )}
          </p>

          <label className="mt-4 grid gap-1.5">
            <span className="text-[13px] font-semibold text-subtle-foreground">새 영상 유튜브 링크</span>
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void save()}
              placeholder="https://youtu.be/…  또는  https://www.youtube.com/watch?v=…"
              inputMode="url"
              aria-invalid={linkInvalid}
              className="h-11 text-base"
            />
          </label>
          {linkInvalid && <p className="mt-1.5 text-[13px] font-medium text-status-late">유튜브 영상 링크가 아니에요. 영상 페이지의 주소를 붙여넣어 주세요.</p>}

          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mt-3 flex items-center gap-1.5 rounded-lg bg-status-done-bg px-3 py-2.5 text-sm font-medium text-status-done">
              <CheckCircle2 className="size-4 shrink-0" /> {notice}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={save} disabled={!previewId || !!busy} className="h-11 rounded-xl px-5 font-bold">
              {busy === "save" && <Loader2 className="size-4 animate-spin" />}
              {busy === "save" ? "확인하는 중…" : "이 영상으로 바꾸기"}
            </Button>
            {!current.isDefault && (
              <Button variant="outline" onClick={reset} disabled={!!busy} className="h-11 rounded-xl">
                <RotateCcw className="size-4" /> 기본 영상으로
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">영상 주인이 다른 사이트에서 재생(퍼가기)을 허용한 영상만 쓸 수 있어요. 저장할 때 유튜브에 확인해요.</p>
        </section>
      </div>
    </>
  );
}
