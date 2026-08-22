import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { ServiceWorkerRegistration } from "../interface/pwa/service-worker-registration";

import "./styles.css";

export const metadata: Metadata = {
  title: "유원산업기술 R&D 업무관리",
  description: "기업부설연구소 모바일 업무관리 시스템"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f4c5c"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
