import { ClockCountdown } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export default function SessionExpiredPage() {
  return (
    <main className="authPage authPageCompact">
      <section className="authCard sessionStateCard" aria-labelledby="expired-title">
        <ClockCountdown aria-hidden size={48} weight="duotone" />
        <span>SESSION ENDED</span>
        <h1 id="expired-title">세션이 종료되었습니다.</h1>
        <p>유휴시간 만료, 다른 기기 로그인 또는 계정 상태 변경으로 현재 세션을 계속 사용할 수 없습니다. 저장되지 않은 민감 입력은 서버에 전송되지 않았습니다.</p>
        <Link className="primaryActionLink" href="/login">다시 로그인</Link>
      </section>
    </main>
  );
}

