import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig = {
  // mupdf(WASM)는 번들링하지 말고 런타임에 node_modules에서 로드
  serverExternalPackages: ["mupdf"],
  experimental: {
    staleTimes: {
      dynamic: 60, // 동적 페이지 60초간 캐시 유지
    },
  },
  // 인사(연차·근무표) 화면은 앱에서 빠짐. 예전 알림·북마크 링크는 내 현황으로 보낸다(데이터는 DB에 그대로).
  async redirects() {
    return [
      { source: "/leave", destination: "/dashboard", permanent: false },
      { source: "/schedule", destination: "/dashboard", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
