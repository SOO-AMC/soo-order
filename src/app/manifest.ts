import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "수오더",
    short_name: "수오더",
    description: "의약품 주문 및 검수 관리",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1166A7",
    orientation: "portrait",
    icons: [
      {
        src: "/sooorder-brand/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/sooorder-brand/pwa-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/sooorder-brand/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
