import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { EmptyState } from "@/components/workspace/feedback";
import { describeLog } from "@/components/briefing/admin/log-text";
import type { BriefingSettingsData } from "@/lib/actions/briefing-publish-actions";
import { PUBLISH_HOUR, PUBLISH_MINUTE, formatIssueDate, formatKstDateTime } from "@/lib/briefing/kst";
import { DEFAULT_INTERVAL, MAX_INTERVAL, MIN_INTERVAL } from "@/lib/briefing/rounding-loop";
import { MAX_PAPERS, MIN_PAPERS } from "@/lib/briefing/types";
import { PlanSettingsForm } from "@/components/briefing/admin/plan-settings-form";

const publishTime = `${String(PUBLISH_HOUR).padStart(2, "0")}:${String(PUBLISH_MINUTE).padStart(2, "0")}`;

function Row({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "test" | "on" }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-36 shrink-0 text-[13px] font-semibold text-subtle-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">
        <span className={cn("text-[15px] font-semibold", tone === "test" && "text-status-ask", tone === "on" && "text-status-done")}>{value}</span>
        {hint && <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>}
      </dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[13px] font-semibold text-subtle-foreground">{title}</h2>
      <dl className="divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-border">{children}</dl>
    </section>
  );
}

/**
 * 논문 브리핑 설정 (관리자, 읽기 전용).
 * 운영 규칙은 고정이고, 실제 동작 방식(테스트/실제)은 서버 환경변수로 정해진다 — 여기서는 지금 상태를 보여 준다.
 * 비밀 값(키·토큰)은 보여 주지 않는다.
 */
export function BriefingSettings({ data }: { data: BriefingSettingsData | null }) {
  return (
    <>
      <PageHeader title="논문 브리핑 설정" leading={<BackButton fallbackHref="/briefing/admin" />} />
      <div className="mx-auto max-w-md space-y-5 p-4 md:max-w-2xl lg:max-w-4xl lg:px-6">
        {!data ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState title="설정을 불러오지 못했어요" description="잠시 뒤 다시 열어 주세요." />
          </div>
        ) : (
          <>
            {data.planReady && (
              <section>
                <h2 className="mb-2 px-1 text-[13px] font-semibold text-subtle-foreground">하루 발행 건수</h2>
                <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                  <PlanSettingsForm initial={data.plan} />
                </div>
              </section>
            )}

            <Group title="운영 규칙 (고정)">
              <Row label="발행 시각" value={`매일 ${publishTime} · 한국시간(Asia/Seoul)`} hint="주말 포함. 예약한 브리핑은 이 시각부터 직원에게 보여요." />
              {!data.planReady && (
                <Row label="하루 논문 수" value={`${MIN_PAPERS}~${MAX_PAPERS}건 (논문 1건 = 카드 1장)`} hint="수가 맞지 않거나 검수가 덜 됐으면 발행하지 않고 관리자에게 알려요. supabase/migrate-briefing-planner.sql 을 실행하면 건수를 바꿀 수 있어요." />
              )}
              <Row label="라운딩 화면" value={`기본 ${DEFAULT_INTERVAL}초마다 다음 논문`} hint={`라운딩 화면에서 ${MIN_INTERVAL}~${MAX_INTERVAL}초 사이로 직접 입력할 수 있어요. 그 PC에 기억돼요.`} />
            </Group>

            <Group title="지금 동작 방식">
              <Row
                label="카드 만들기"
                value={data.config.ai === "anthropic" ? `AI 사용 (${data.config.aiModel})` : "규칙 정리 (AI 미사용)"}
                tone={data.config.ai === "anthropic" ? "on" : "test"}
                hint={
                  data.config.ai === "anthropic"
                    ? "만들기·다시 만들기를 누를 때만 AI를 불러요. AI가 실패하거나 요약문에 없는 숫자를 쓰면 규칙 정리로 대신 만들어요."
                    : "붙여넣은 글의 문장을 그대로 골라 배치해요. 숫자·출처를 새로 만들지 않아요. 서버 설정 BRIEFING_AI_PROVIDER=anthropic 으로 AI를 켜요."
                }
              />
              <Row
                label="직원 알림"
                value={data.config.internalLive ? "실제로 보냄" : "테스트 모드 (보내지 않음)"}
                tone={data.config.internalLive ? "on" : "test"}
                hint={
                  data.config.internalLive
                    ? "발행하면 재직 중인 직원의 수오더 알림함에 하루 1건이 가요."
                    : "발행해도 직원 알림함에는 넣지 않고, 보낼 내용만 아래 기록에 남겨요. 서버 설정 BRIEFING_INTERNAL_NOTIFY=on 으로 켜요."
                }
              />
              <Row label="네이버웍스" value="연결 전 (보내지 않음)" tone="test" hint="그날의 논문을 메시지 1건에 묶은 내용을 미리보기와 기록으로만 남겨요. 실제 전송은 하지 않아요." />
              <Row label="브라우저 푸시" value="쓰지 않음" hint="알림 권한을 묻지 않아요. 알림은 수오더 안 알림함으로만 가요." />
              <Row label="앱 주소" value={data.config.baseUrl ?? "설정 안 됨"} hint="네이버웍스 메시지의 링크에 써요. 없으면 경로(/briefing)만 넣어요." />
              <Row label="서버 시각" value={formatKstDateTime(data.serverNow)} hint={`UTC ${data.serverNow.slice(0, 16).replace("T", " ")} — 서버가 UTC여도 발행은 한국시간으로 계산해요.`} />
            </Group>

            <section>
              <h2 className="mb-2 px-1 text-[13px] font-semibold text-subtle-foreground">최근 알림 기록</h2>
              {data.logs.length === 0 ? (
                <div className="rounded-xl bg-card ring-1 ring-border">
                  <EmptyState title="아직 기록이 없어요" description="브리핑을 발행하면 채널마다 하루 1줄씩 남아요." />
                </div>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-border">
                  {data.logs.map((l) => {
                    const d = describeLog(l);
                    return (
                      <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-3">
                        <span className="w-28 shrink-0 text-[13px] font-semibold tabular-nums">{l.issue_date ? formatIssueDate(l.issue_date) : "-"}</span>
                        <span className="text-sm font-medium">{d.label}</span>
                        <span className={cn("inline-flex items-center gap-1 text-[13px]", d.bad ? "font-medium text-status-late" : "text-muted-foreground")}>
                          {d.bad && <CircleAlert className="size-3.5" aria-hidden="true" />}
                          {d.text}
                        </span>
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          {formatKstDateTime(l.updated_at)}
                          {l.attempt_count > 1 ? ` · ${l.attempt_count}번째 시도` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
