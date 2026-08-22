import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "유원산업기술 R&D 업무관리",
    short_name: "유원 R&D",
    description: "기업부설연구소 모바일 업무관리 시스템",
    start_url: "/",
    display: "standalone",
    background_color: "#eef4f3",
    theme_color: "#0f4c5c",
    lang: "ko",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      },
      {
        src: "/icons/app-icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
