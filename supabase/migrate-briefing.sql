-- =============================================================
-- 논문 브리핑 (briefing_*) — 새 테이블만 추가. 기존 테이블은 건드리지 않는다.
-- Supabase SQL Editor 에서 통째로 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 구조 (지시서 불변 규칙):
--   briefing_issues  = 날짜별 발행 묶음 1개 (issue_date 유니크)
--   briefing_papers  = 논문 1건 = 카드뉴스 1장 (슬라이드 테이블 없음)
--   card_content(jsonb) 안의 blocks[] 는 "한 장 안의 구역"일 뿐 장수가 아니다.
-- =============================================================

create extension if not exists pg_trgm;

-- -------------------------------------------------------------
-- 1. 날짜별 발행 묶음
-- -------------------------------------------------------------
create table if not exists public.briefing_issues (
  id uuid primary key default gen_random_uuid(),
  issue_date date not null unique,                    -- KST 날짜
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published')),
  scheduled_at timestamptz,                           -- 보통 issue_date 08:30 KST
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- 2. 논문 1건 = 카드 1장
-- -------------------------------------------------------------
create table if not exists public.briefing_papers (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.briefing_issues(id) on delete cascade,
  display_order int not null,
  raw_summary_text text not null check (length(btrim(raw_summary_text)) > 0),  -- 붙여넣은 원본 그대로
  raw_text_hash text,
  headline text,                                      -- 목록·검색·알림용(카드에서 뽑아 둠)
  card_content jsonb,                                 -- 단일 카드 구조(schemaVersion 1)
  previous_card_content jsonb,                        -- 다시 만들기 전 버전(되돌리기용)
  layout_variant text,
  category text,
  source_url text,
  doi text,
  admin_memo text,
  generation_status text not null default 'none'
    check (generation_status in ('none', 'rule', 'ai', 'failed')),
  ai_provider_info jsonb,                             -- 공급자·모델·시각만 (비밀 값 금지)
  review_status text not null default 'draft'
    check (review_status in ('draft', 'reviewed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 순서 바꾸기를 한 문장으로 할 수 있게 deferrable
  constraint briefing_papers_order_unique unique (issue_id, display_order) deferrable initially immediate
);

create index if not exists idx_briefing_papers_issue on public.briefing_papers (issue_id, display_order);
create index if not exists idx_briefing_papers_raw_trgm
  on public.briefing_papers using gin (raw_summary_text gin_trgm_ops);
create index if not exists idx_briefing_papers_headline_trgm
  on public.briefing_papers using gin (headline gin_trgm_ops);

-- -------------------------------------------------------------
-- 3. 북마크 · 읽음 (사람별)
-- -------------------------------------------------------------
create table if not exists public.briefing_bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  paper_id uuid not null references public.briefing_papers(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, paper_id)
);

create table if not exists public.briefing_read_states (
  user_id uuid not null references public.profiles(id) on delete cascade,
  paper_id uuid not null references public.briefing_papers(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, paper_id)
);

-- -------------------------------------------------------------
-- 4. 알림 발송 기록 (내부 알림 · 네이버웍스[추후])
--    delivery_key 유니크 = 같은 날짜·같은 채널로 두 번 보내지 않는다.
-- -------------------------------------------------------------
create table if not exists public.briefing_notification_logs (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.briefing_issues(id) on delete cascade,
  channel_type text not null check (channel_type in ('internal', 'naverworks-group')),
  delivery_key text not null unique,                  -- 예: internal:2026-11-14
  state text not null default 'pending'
    check (state in ('pending', 'sent', 'mock', 'failed', 'skipped')),
  attempt_count int not null default 0,
  sent_at timestamptz,
  error_code text,
  error_message text,
  payload_preview jsonb,                              -- 보낼(보낸) 메시지 미리보기. 토큰·원문 전체 금지
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- 5. updated_at 트리거 (기존 update_updated_at() 재사용)
-- -------------------------------------------------------------
drop trigger if exists briefing_issues_updated_at on public.briefing_issues;
create trigger briefing_issues_updated_at
  before update on public.briefing_issues
  for each row execute function public.update_updated_at();

drop trigger if exists briefing_papers_updated_at on public.briefing_papers;
create trigger briefing_papers_updated_at
  before update on public.briefing_papers
  for each row execute function public.update_updated_at();

drop trigger if exists briefing_notification_logs_updated_at on public.briefing_notification_logs;
create trigger briefing_notification_logs_updated_at
  before update on public.briefing_notification_logs
  for each row execute function public.update_updated_at();

-- -------------------------------------------------------------
-- 6. 헬퍼 함수
-- -------------------------------------------------------------
-- 일반 직원에게 보여도 되는 묶음인가: 발행 완료, 또는 예약 시각이 지난 예약 상태
-- (크론이 늦어도 08:30에 정확히 열리도록 시각으로 판정)
create or replace function public.briefing_issue_visible(p_issue_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.briefing_issues i
    where i.id = p_issue_id
      and (i.status = 'published'
           or (i.status = 'scheduled' and i.scheduled_at is not null and i.scheduled_at <= now()))
  );
$$ language sql security definer stable set search_path = public;

-- 논문 순서 바꾸기 (관리자만). p_paper_ids = 새 순서대로의 논문 id 배열
create or replace function public.briefing_reorder_papers(p_issue_id uuid, p_paper_ids uuid[])
returns void as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  update public.briefing_papers p
     set display_order = x.ord
    from unnest(p_paper_ids) with ordinality as x(id, ord)
   where p.id = x.id and p.issue_id = p_issue_id;
end;
$$ language plpgsql security definer set search_path = public;

-- -------------------------------------------------------------
-- 7. RLS — 관리자: 전부 / 직원: 발행된 것만 읽기
-- -------------------------------------------------------------
alter table public.briefing_issues enable row level security;
alter table public.briefing_papers enable row level security;
alter table public.briefing_bookmarks enable row level security;
alter table public.briefing_read_states enable row level security;
alter table public.briefing_notification_logs enable row level security;

-- 묶음
drop policy if exists "briefing_issues_select" on public.briefing_issues;
create policy "briefing_issues_select" on public.briefing_issues
  for select to authenticated
  using (public.is_admin() or public.briefing_issue_visible(id));

drop policy if exists "briefing_issues_admin_write" on public.briefing_issues;
create policy "briefing_issues_admin_write" on public.briefing_issues
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 논문: 직원은 "검수 완료 + 보이는 묶음"만
drop policy if exists "briefing_papers_select" on public.briefing_papers;
create policy "briefing_papers_select" on public.briefing_papers
  for select to authenticated
  using (
    public.is_admin()
    or (review_status = 'reviewed' and public.briefing_issue_visible(issue_id))
  );

drop policy if exists "briefing_papers_admin_write" on public.briefing_papers;
create policy "briefing_papers_admin_write" on public.briefing_papers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 북마크 · 읽음: 본인 것만
drop policy if exists "briefing_bookmarks_own" on public.briefing_bookmarks;
create policy "briefing_bookmarks_own" on public.briefing_bookmarks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "briefing_read_states_own" on public.briefing_read_states;
create policy "briefing_read_states_own" on public.briefing_read_states
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 발송 기록: 관리자만 (크론은 service_role 이라 RLS 우회)
drop policy if exists "briefing_notification_logs_admin" on public.briefing_notification_logs;
create policy "briefing_notification_logs_admin" on public.briefing_notification_logs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -------------------------------------------------------------
-- 8. 확인용 (실행 후 5줄이 나오면 성공)
-- -------------------------------------------------------------
select relname as table_name, relrowsecurity as rls_on
from pg_class
where relname in (
  'briefing_issues', 'briefing_papers', 'briefing_bookmarks',
  'briefing_read_states', 'briefing_notification_logs'
)
order by relname;
