import Link from "next/link";

import { MfaCodePreviewForm } from "../../../../interface/operational-forms";
import { BackendContractNotice } from "../../../../interface/operational-ui";

export default function MfaChallengePage() {
  return (
    <main className="authPage authPageCompact">
      <section className="authCard" aria-labelledby="mfa-title">
        <div className="authStepBadge">2 / 2</div>
        <div className="authCardHeading"><span>TOTP · AAL2</span><h1 id="mfa-title">2차 인증</h1><p>등록된 인증 앱의 일회용 코드를 입력합니다.</p></div>
        <BackendContractNotice />
        <MfaCodePreviewForm />
        <Link className="authBackLink" href="/login">로그인 화면으로 돌아가기</Link>
      </section>
    </main>
  );
}

