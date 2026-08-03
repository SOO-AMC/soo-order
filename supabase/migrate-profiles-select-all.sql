-- =============================================================
-- profiles SELECT RLS 완화: 인증된 전 직원이 서로의 프로필(이름 등)을 조회 가능
-- =============================================================
-- 배경: 기존 정책은 "본인 행 또는 admin만" SELECT 허용.
--   → 주문/검수/반품/품절 상세·리스트의 요청자 이름은 orders에 profiles를
--     임베드 조인해서 가져오는데, 요청자가 본인이 아니면 RLS가 막아 조인이 null →
--     일반 사용자에게 "알 수 없음"으로 표시됨(관리자는 is_admin()으로 보임).
--   → 연차/근무표는 admin(service_role)으로 우회 조회하므로 이미 전 직원 이름이 보임.
--     즉 앱 설계상 사내 직원 간 이름 공개는 전제 → 주문 화면도 동일하게 맞춤.
-- 변경: SELECT는 인증된 사용자 전체 허용. UPDATE는 기존대로 본인/admin만(그대로 둠).
-- 재실행 안전(DROP ... IF EXISTS 가드).

DROP POLICY IF EXISTS "Users can view own profile or admin can view all" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
