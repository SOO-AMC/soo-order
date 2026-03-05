-- 대시보드 통계 RPC 함수
-- Supabase SQL Editor에서 1회 실행 필요
-- 모든 집계를 DB에서 수행하여 JSONB 객체로 반환

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  v_summary jsonb;
  v_daily_trend jsonb;
  v_weekly_trend jsonb;
  v_monthly_trend jsonb;
  v_top_items jsonb;
  v_vendors jsonb;
  v_return_analysis jsonb;
  v_today date;
  v_yesterday date;
BEGIN
  -- 한국 시간대 기준 오늘/어제
  v_today := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_yesterday := v_today - 1;

  -- === Summary ===
  -- 오늘 기준 총 건수 + 어제 기준 추정 총 건수 (오늘 상태 변동을 역추적)
  -- pending 어제 = 현재 pending - 오늘 신규 pending + 오늘 pending→ordered 전환분
  -- ordered 어제 = 현재 ordered - 오늘 ordered 전환분 + 오늘 ordered→inspecting 전환분
  -- return_requested 어제 = 현재 return_requested - 오늘 반품신청 + 오늘 반품완료 전환분
  SELECT jsonb_build_object(
    'pending', COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0),
    'ordered', COALESCE(SUM(CASE WHEN status = 'ordered' THEN 1 ELSE 0 END), 0),
    'inspecting', COALESCE(SUM(CASE WHEN status = 'inspecting' THEN 1 ELSE 0 END), 0),
    'returnRequested', COALESCE(SUM(CASE WHEN status = 'return_requested' THEN 1 ELSE 0 END), 0),
    'pendingYesterday', GREATEST(0,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN status = 'pending'
          AND (created_at AT TIME ZONE 'Asia/Seoul')::date = v_today THEN 1 ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN status = 'ordered'
          AND (updated_at AT TIME ZONE 'Asia/Seoul')::date = v_today
          AND (created_at AT TIME ZONE 'Asia/Seoul')::date < v_today THEN 1 ELSE 0 END), 0)
    ),
    'orderedYesterday', GREATEST(0,
      COALESCE(SUM(CASE WHEN status = 'ordered' THEN 1 ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN status = 'ordered'
          AND (updated_at AT TIME ZONE 'Asia/Seoul')::date = v_today THEN 1 ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN status = 'inspecting'
          AND (inspected_at AT TIME ZONE 'Asia/Seoul')::date = v_today
          AND (created_at AT TIME ZONE 'Asia/Seoul')::date < v_today THEN 1 ELSE 0 END), 0)
    ),
    'inspectingYesterday', 0,
    'returnRequestedYesterday', GREATEST(0,
      COALESCE(SUM(CASE WHEN status = 'return_requested' THEN 1 ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN return_requested_at IS NOT NULL
          AND (return_requested_at AT TIME ZONE 'Asia/Seoul')::date = v_today THEN 1 ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN status = 'return_completed'
          AND (updated_at AT TIME ZONE 'Asia/Seoul')::date = v_today THEN 1 ELSE 0 END), 0)
    ),
    'urgentPending', COALESCE(SUM(CASE WHEN status = 'pending' AND is_urgent = true THEN 1 ELSE 0 END), 0),
    'urgentOrdered', COALESCE(SUM(CASE WHEN status = 'ordered' AND is_urgent = true THEN 1 ELSE 0 END), 0)
  ) INTO v_summary
  FROM orders;

  -- === Daily Trend (last 30 days) ===
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('label', to_char(d, 'MM-DD'), 'count', COALESCE(c.cnt, 0))
    ORDER BY d
  ), '[]'::jsonb)
  INTO v_daily_trend
  FROM generate_series(v_today - 29, v_today, '1 day'::interval) AS d
  LEFT JOIN (
    SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS dt, COUNT(*) AS cnt
    FROM orders
    WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date >= v_today - 29
    GROUP BY dt
  ) c ON c.dt = d::date;

  -- === Weekly Trend (last 12 weeks) ===
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('label', to_char(w, 'MM/DD'), 'count', COALESCE(c.cnt, 0))
    ORDER BY w
  ), '[]'::jsonb)
  INTO v_weekly_trend
  FROM generate_series(
    date_trunc('week', v_today::timestamp - interval '11 weeks'),
    date_trunc('week', v_today::timestamp),
    '1 week'::interval
  ) AS w
  LEFT JOIN (
    SELECT date_trunc('week', (created_at AT TIME ZONE 'Asia/Seoul')::timestamp) AS wk, COUNT(*) AS cnt
    FROM orders
    WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date >= (date_trunc('week', v_today::timestamp - interval '11 weeks'))::date
    GROUP BY wk
  ) c ON c.wk = w;

  -- === Monthly Trend (last 12 months) ===
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('label', to_char(m, 'YYYY-MM'), 'count', COALESCE(c.cnt, 0))
    ORDER BY m
  ), '[]'::jsonb)
  INTO v_monthly_trend
  FROM generate_series(
    date_trunc('month', v_today::timestamp - interval '11 months'),
    date_trunc('month', v_today::timestamp),
    '1 month'::interval
  ) AS m
  LEFT JOIN (
    SELECT date_trunc('month', (created_at AT TIME ZONE 'Asia/Seoul')::timestamp) AS mo, COUNT(*) AS cnt
    FROM orders
    WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date >= (date_trunc('month', v_today::timestamp - interval '11 months'))::date
    GROUP BY mo
  ) c ON c.mo = m;

  -- === Top Items (top 10) ===
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('name', item_name, 'count', cnt)
    ORDER BY cnt DESC
  ), '[]'::jsonb)
  INTO v_top_items
  FROM (
    SELECT item_name, COUNT(*) AS cnt
    FROM orders
    GROUP BY item_name
    ORDER BY cnt DESC
    LIMIT 10
  ) t;

  -- === Vendor Stats (top 10) ===
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('vendor', vendor_name, 'total', total, 'invoiceReceived', inv)
    ORDER BY total DESC
  ), '[]'::jsonb)
  INTO v_vendors
  FROM (
    SELECT
      vendor_name,
      COUNT(*) AS total,
      SUM(CASE WHEN invoice_received = true THEN 1 ELSE 0 END) AS inv
    FROM orders
    WHERE vendor_name IS NOT NULL AND vendor_name != '' AND status != 'pending'
    GROUP BY vendor_name
    ORDER BY total DESC
    LIMIT 10
  ) t;

  -- === Return Analysis ===
  SELECT jsonb_build_object(
    'totalInspected', (
      SELECT COUNT(*) FROM orders WHERE inspected_at IS NOT NULL OR status IN ('return_requested', 'return_completed')
    ),
    'totalReturned', (
      SELECT COUNT(*) FROM orders WHERE status IN ('return_requested', 'return_completed')
    ),
    'returnRate', (
      SELECT CASE
        WHEN COUNT(*) FILTER (WHERE inspected_at IS NOT NULL OR status IN ('return_requested', 'return_completed')) = 0 THEN 0
        ELSE ROUND(
          COUNT(*) FILTER (WHERE status IN ('return_requested', 'return_completed'))::numeric /
          COUNT(*) FILTER (WHERE inspected_at IS NOT NULL OR status IN ('return_requested', 'return_completed')) * 100,
          2
        )
      END
      FROM orders
    ),
    'topItems', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', item_name, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT item_name, COUNT(*) AS cnt
        FROM orders
        WHERE status IN ('return_requested', 'return_completed')
        GROUP BY item_name
        ORDER BY cnt DESC
        LIMIT 10
      ) ri
    ),
    'recentReasons', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'itemName', o.item_name,
          'reason', COALESCE(NULLIF(TRIM(o.return_reason), ''), '-'),
          'date', to_char(o.return_requested_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD'),
          'requester', COALESCE(p.full_name, '알 수 없음')
        )
        ORDER BY o.return_requested_at DESC
      ), '[]'::jsonb)
      FROM (
        SELECT item_name, return_reason, return_requested_at, return_requested_by
        FROM orders
        WHERE status IN ('return_requested', 'return_completed') AND return_requested_at IS NOT NULL
        ORDER BY return_requested_at DESC
        LIMIT 10
      ) o
      LEFT JOIN profiles p ON p.id = o.return_requested_by
    )
  ) INTO v_return_analysis;

  -- === Build final result ===
  result := jsonb_build_object(
    'summary', v_summary,
    'dailyTrend', v_daily_trend,
    'weeklyTrend', v_weekly_trend,
    'monthlyTrend', v_monthly_trend,
    'topItems', v_top_items,
    'vendors', v_vendors,
    'returnAnalysis', v_return_analysis
  );

  RETURN result;
END;
$$;
