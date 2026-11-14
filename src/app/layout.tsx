import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

// Pretendard를 앱에 직접 포함(수링크와 동일). 이전 CDN 주소(jsdelivr gh)는 404라 폰트가 한 번도 적용되지 않았다.
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

const APP_NAME = "수오더";
const APP_DESCRIPTION = "의약품 주문 및 검수 관리";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: [{ url: "/sooorder-brand/og-image.png", width: 1200, height: 630 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1166A7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 다크 클래스는 아래 스크립트가 그리기 전에 붙이므로 서버 HTML과 다를 수 있다 → suppressHydrationWarning
    <html lang="ko" className={`${pretendard.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
