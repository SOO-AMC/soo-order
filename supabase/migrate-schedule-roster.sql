-- 근무표 명단 조정: 제외 플래그 + 행정 분류
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS schedule_exclude BOOLEAN NOT NULL DEFAULT false;

-- 정윤성: 근무표에서 제외
UPDATE public.profiles SET schedule_exclude = true WHERE full_name = '정윤성';

-- 소리엘 / 정연미 / 정윤혁: 행정으로 분류
UPDATE public.profiles SET position = 'admin_staff' WHERE full_name IN ('소리엘', '정연미', '정윤혁');
