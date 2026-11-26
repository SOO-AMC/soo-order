"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * 이 앱의 경로(예: /b/paper/…) → 전체 주소 QR 코드(SVG). 라운딩 화면에서 해설 페이지로 가는 길 (TV 는 누를 수 없으니 휴대폰으로 찍는다).
 * base = 밖에서 열리는 운영 주소(publicAppUrl). 없을 때만 이 화면의 주소를 쓴다 — TV 가 내부 IP 등으로 열려 있으면 휴대폰에서 안 열린다.
 */
export function QrCode({ path, label, base }: { path: string; label: string; base?: string | null }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    QRCode.toString(`${base || window.location.origin}${path}`, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#082344", light: "#ffffff" } })
      .then((s) => {
        if (active) setSvg(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [path, base]);
  if (!svg) return null;
  // 라이브러리가 만든 SVG 만 넣는다 (사용자 글이 아니다)
  return <span role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}
