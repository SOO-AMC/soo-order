"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCommentMarks } from "@/lib/actions/order-comment-actions";
import type { CommentMark } from "@/lib/types/order-comment";

/**
 * 목록의 코멘트 표시(관리자). 보이는 주문이 바뀌면 한 번 읽는다.
 * 실시간 변경이 몰려도 한 번만 읽도록 잠깐 기다렸다가 읽는다.
 */
export function useCommentMarks(orders: { id: string; requester_id: string | null }[], enabled: boolean) {
  const key = enabled ? orders.map((o) => o.id).sort().join(",") : "";
  const [marks, setMarks] = useState<Record<string, CommentMark>>({});
  const [tick, setTick] = useState(0);
  const ordersRef = useRef(orders);
  useEffect(() => {
    ordersRef.current = orders;
  });

  useEffect(() => {
    if (!key) return;
    let active = true;
    const t = setTimeout(() => {
      fetchCommentMarks(ordersRef.current.map((o) => ({ id: o.id, requester_id: o.requester_id })))
        .then((m) => {
          if (active) setMarks(m);
        })
        .catch(() => {});
    }, 400);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [key, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { marks, refresh };
}
