"use client";

import { WarningCircle } from "@phosphor-icons/react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="shell">
      <section className="hero centeredState" role="alert">
        <WarningCircle aria-hidden size={44} weight="duotone" />
        <h1>화면을 불러오지 못했습니다.</h1>
        <p>입력값이나 보안 정보를 표시하지 않았습니다. 잠시 뒤 다시 시도해 주세요.</p>
        <button type="button" onClick={reset}>다시 시도</button>
      </section>
    </main>
  );
}

