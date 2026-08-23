"use client";

import { WifiHigh, WifiSlash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

export function ConnectivityStatus({ className = "syncSummary", detail = false }: { className?: string; detail?: boolean }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const Icon = online ? WifiHigh : WifiSlash;
  return (
    <span className={className} role="status">
      <Icon aria-hidden size={18} weight="bold" />
      <span><strong>{online ? "온라인 · 동기화 가능" : "오프라인 · 로컬 작업만 가능"}</strong>{detail ? <small>{online ? "동기화 화면에서 보류 작업을 확인하세요." : "결재·권한 변경은 온라인 전용입니다."}</small> : null}</span>
    </span>
  );
}

