import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";

import { previewDataEnabled } from "../../composition/preview-mode";
import { LoginPreviewForm } from "../../interface/operational-forms";
import { BackendContractNotice } from "../../interface/operational-ui";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const previewEnabled = previewDataEnabled();
  return (
    <main className="authPage">
      <section className="authIntroduction">
        <span className="authProductMark"><ShieldCheck aria-hidden size={28} weight="fill" /></span>
        <p className="eyebrow">YOUONE R&amp;D WORKSPACE</p>
        <h1>연구업무를 안전하게 시작하세요.</h1>
        <p>내부 사용자와 외주 사용자는 동일한 인증 강도를 적용하며, 로그인 뒤 현재 계정·직책·역할·프로젝트 Scope를 서버와 DB에서 다시 확인합니다.</p>
        <ul><li>INTERNAL/VENDOR TOTP AAL2</li><li>민감 업무 재인증</li><li>매 요청 활성 session 검증</li></ul>
      </section>
      <section className="authCard" aria-labelledby="login-title">
        <div className="authCardHeading"><span>SECURE SIGN IN</span><h2 id="login-title">업무관리 로그인</h2><p>승인된 회사 계정으로 로그인합니다.</p></div>
        {previewEnabled ? <BackendContractNotice /> : <BackendContractNotice>운영 Auth API가 조합되기 전에는 로그인 요청을 보내지 않습니다.</BackendContractNotice>}
        <LoginPreviewForm />
      </section>
    </main>
  );
}

