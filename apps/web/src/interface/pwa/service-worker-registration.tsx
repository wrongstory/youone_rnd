"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type InstallPrompt = Event & {
  readonly prompt: () => Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
};

function subscribeOnlineStatus(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function currentOnlineStatus() {
  return navigator.onLine;
}

function serverOnlineStatus() {
  return true;
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(() => caches.keys())
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith("youone-pwa-shell-")).map((key) => caches.delete(key))))
        .catch(() => undefined);
      return;
    }
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);

  return null;
}

export function PwaRuntimeStatus() {
  const online = useSyncExternalStore(subscribeOnlineStatus, currentOnlineStatus, serverOnlineStatus);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [queueCounts, setQueueCounts] = useState<{
    readonly pending: number;
    readonly conflicts: number;
    readonly rejected: number;
  } | null>(null);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    void import("../../composition/offline-browser")
      .then(({ readOfflineQueueCounts }) => readOfflineQueueCounts())
      .then((counts) => setQueueCounts(counts))
      .catch(() => setQueueCounts(null));
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
    };
  }, []);

  async function install() {
    if (installPrompt === null) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  return (
    <section className="pwaStatusPanel" aria-labelledby="pwa-runtime-title">
      <div>
        <p className="recordEyebrow">PWA RUNTIME</p>
        <h2 id="pwa-runtime-title">{online ? "온라인 연결됨" : "오프라인 모드"}</h2>
        <p>
          {online
            ? "서버 재인증 후 허용된 로컬 명령만 동기화할 수 있습니다."
            : "승인·권한·보안자료·계약·지급 명령은 연결 복구 전까지 실행할 수 없습니다."}
        </p>
        <p className="offlineQueueSummary">
          {queueCounts === null
            ? "로컬 대기열을 확인하는 중입니다."
            : `대기 ${queueCounts.pending}건 · 충돌 ${queueCounts.conflicts}건 · 거부 ${queueCounts.rejected}건`}
        </p>
      </div>
      {installPrompt === null ? null : (
        <button type="button" onClick={install}>
          이 기기에 설치
        </button>
      )}
    </section>
  );
}
