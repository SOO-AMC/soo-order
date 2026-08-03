-- 인턴수의사 직책 + 인턴수의사팀 추가
-- 1) profiles.position 에 CHECK 제약이 있으면 'intern_vet' 도 허용되도록 교체
--    (제약이 없으면 아무것도 하지 않음 — position 은 자유 텍스트)
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%position%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

-- 2) my_team(): 직책 → 팀 매핑에 인턴수의사 추가
CREATE OR REPLACE FUNCTION public.my_team()
RETURNS TEXT AS $$
  SELECT CASE position
    WHEN 'veterinarian' THEN 'vet'
    WHEN 'intern_vet' THEN 'intern_vet'
    WHEN 'manager' THEN 'manager'
    WHEN 'technician' THEN 'tech'
    ELSE NULL END
  FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;
