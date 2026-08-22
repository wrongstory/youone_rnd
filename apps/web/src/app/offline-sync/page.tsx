import type { Metadata } from "next";
import Link from "next/link";

import { previewDataEnabled } from "../../composition/preview-mode";
import { PreviewNotice } from "../../interface/preview-ui";
import { PwaRuntimeStatus } from "../../interface/pwa/service-worker-registration";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "오프라인 동기화 | 유원 R&D"
};

const offlineAllowed = [
  "체크리스트·검수 초안",
  "현장노트·현장기록 초안",
  "허용된 작업항목 진행률 업데이트"
] as const;

const onlineOnly = [
  "결재 및 권한·Scope 변경",
  "L2~L4 기술자료 접근과 통제사본",
  "계약 서명·종료 및 지급확인"
] as const;

export default function OfflineSyncPage() {
  const preview = previewDataEnabled();
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="offline-sync-title">
        <Link className="backLink" href="/">
          ← 개발 현황 홈
        </Link>
        <p className="eyebrow">M15 · PWA / OFFLINE</p>
        <h1 id="offline-sync-title">연결이 끊겨도 안전한 초안만 보관합니다.</h1>
        <p className="summary">
          재연결 시 현재 사용자와 세션을 다시 확인하고, 서버 기준 버전이 달라졌다면 어느 쪽도
          덮어쓰지 않은 채 충돌 기록을 만듭니다.
        </p>
        {preview ? <PreviewNotice /> : null}
        <PwaRuntimeStatus />
      </section>

      <section className="principles" aria-labelledby="offline-allowed-title">
        <h2 id="offline-allowed-title">오프라인 허용 범위</h2>
        <ul>
          {offlineAllowed.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="principles" aria-labelledby="online-only-title">
        <h2 id="online-only-title">항상 온라인에서만 처리</h2>
        <ul>
          {onlineOnly.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="policyCallout warning">
          <strong>자동 병합 없음</strong>
          <p>
            충돌 시 서버본·로컬본·기준 버전을 모두 보존합니다. 명시적으로 지원되는 병합 정책이
            승인되기 전에는 사용자가 새 변경으로 다시 작성해야 합니다.
          </p>
        </div>
      </section>

      {preview ? (
        <section className="principles" aria-labelledby="conflict-preview-title">
          <p className="recordEyebrow">SYNC_CONFLICT · DEMO</p>
          <h2 id="conflict-preview-title">안전점검 초안 충돌 비교</h2>
          <p className="summary">
            로컬은 기준 버전 3에서 작성됐지만 서버는 이미 버전 4입니다. 두 기록은 그대로 보존됩니다.
          </p>
          <div className="conflictComparison">
            <article>
              <span>로컬 초안 · base v3</span>
              <strong>달성도 40%</strong>
              <p>방호커버 확인 완료 · 비상정지 스위치 재확인 필요</p>
            </article>
            <article>
              <span>현재 서버본 · v4</span>
              <strong>달성도 70%</strong>
              <p>방호커버·비상정지 확인 완료 · 접지 사진 추가</p>
            </article>
          </div>
          <div className="actionRow conflictActions" aria-label="충돌 해결 선택 예시">
            <button type="button" disabled>
              서버본 유지·로컬 폐기
            </button>
            <button type="button" disabled>
              서버 v4 기준 새 변경 작성
            </button>
          </div>
          <div className="policyCallout">
            <strong>데모 화면</strong>
            <p>실제 선택은 온라인 재인증과 M16 live request adapter 연결 후에만 기록됩니다.</p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
