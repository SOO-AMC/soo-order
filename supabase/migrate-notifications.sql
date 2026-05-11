-- =============================================================
-- 알림(notifications) 테이블 추가
-- Supabase SQL Editor 에서 실행하세요.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'order_edited',
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 본인 알림만 조회
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- 로그인한 사용자가 알림 생성 가능 (관리자가 주문 수정 시 요청자에게 발송)
CREATE POLICY "notifications_insert_authenticated"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 본인 알림만 읽음 처리 가능
CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 본인 알림 삭제 가능
CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Realtime 구독 활성화 (이미 추가돼 있으면 에러 — 무시해도 됩니다)
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
