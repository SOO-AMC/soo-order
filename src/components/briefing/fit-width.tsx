"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 안의 내용을 정해진 폭(예: PC 960px)으로 그린 뒤, 바깥 칸 폭에 맞게 통째로 줄여 보여 준다.
 * 관리자 미리보기에서 "PC 화면에서는 이렇게 보인다"를 좁은 칸에서도 실제 비례로 보여 주려고 쓴다.
 * zoom 은 높이까지 같이 줄어서 아래 내용이 겹치지 않는다.
 */
export function FitWidth({ width, children, className }: { width: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setZoom(Math.min(1, el.clientWidth / width));
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={ref} className={className}>
      <div style={{ width, zoom }}>{children}</div>
    </div>
  );
}
