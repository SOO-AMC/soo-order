import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "수오더",
    short_name: "수오더",
    description: "의약품 주문 및 검수 관리",
    start_url: "/orders",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#15BDF0",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
