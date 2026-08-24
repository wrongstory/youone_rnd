import { DeviceMobile, LockKey, QrCode } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { BackendContractNotice } from "../../../../interface/operational-ui";

export default function MfaEnrollPage() {
  return (
    <main className="authPage authPageCompact">
      <section className="authCard authCardWide" aria-labelledby="enroll-title">
        <div className="authCardHeading"><span>MFA ENROLLMENT</span><h1 id="enroll-title">TOTP 등록</h1><p>최초 로그인 또는 관리자 초기화 뒤 인증 앱을 다시 등록합니다.</p></div>
        <BackendContractNotice>실제 QR·secret·factor ID는 Supabase Auth가 발급한 뒤 이 세션에서만 표시합니다.</BackendContractNotice>
        <ol className="enrollmentSteps">
          <li><span><DeviceMobile aria-hidden size={22} /></span><div><strong>인증 앱 준비</strong><p>승인된 TOTP 앱을 기기에 설치하고 화면 잠금을 사용합니다.</p></div></li>
          <li><span><QrCode aria-hidden size={22} /></span><div><strong>QR 등록</strong><p>Backend #58 연결 후 발급된 QR을 이 위치에서 등록합니다. 현재는 가짜 QR을 표시하지 않습니다.</p></div></li>
          <li><span><LockKey aria-hidden size={22} /></span><div><strong>코드 검증</strong><p>첫 코드를 검증해야 factor가 verified 상태가 됩니다.</p></div></li>
        </ol>
        <div className="formActionBar"><Link href="/login">취소</Link><button className="pendingFormButton" type="button" disabled>Backend #58 연결 후 등록 시작</button></div>
      </section>
    </main>
  );
}

