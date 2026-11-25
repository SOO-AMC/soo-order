"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** 이 앱의 경로(예: /b/paper/…) → 전체 주소 QR 코드(SVG). 라운딩 화면에서 해설 페이지로 가는 길 (TV 는 누를 수 없으니 휴대폰으로 찍는다) */
export function QrCode({ path, label }: { path: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    QRCode.toString(`${window.location.origin}${path}`, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#082344", light: "#ffffff" } })
      .then((s) => {
        if (active) setSvg(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [path]);
  if (!svg) return null;
  // 라이브러리가 만든 SVG 만 넣는다 (사용자 글이 아니다)
  return <span role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}
