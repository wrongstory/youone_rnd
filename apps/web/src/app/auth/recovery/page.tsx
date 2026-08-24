import Link from "next/link";

import { RecoveryPreviewForm } from "../../../interface/operational-forms";
import { BackendContractNotice } from "../../../interface/operational-ui";

export default function AccountRecoveryPage() {
  return (
    <main className="authPage authPageCompact">
      <section className="authCard" aria-labelledby="recovery-title">
        <div className="authCardHeading"><span>ACCOUNT RECOVERY</span><h1 id="recovery-title">계정 복구</h1><p>승인된 복구 절차를 시작하고 기존 세션을 재검증합니다.</p></div>
        <BackendContractNotice />
        <RecoveryPreviewForm />
        <Link className="authBackLink" href="/login">로그인 화면으로 돌아가기</Link>
      </section>
    </main>
  );
}

