-- profiles 테이블에 직책(position) 컬럼 추가
-- 값: manager(매니저), technician(테크니션), veterinarian(수의사), admin_staff(행정)

ALTER TABLE public.profiles
ADD COLUMN position TEXT DEFAULT NULL
CHECK (position IS NULL OR position IN ('manager', 'technician', 'veterinarian', 'admin_staff'));
