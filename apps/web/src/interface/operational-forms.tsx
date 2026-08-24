"use client";

import { CheckCircle, Eye, EyeSlash, LockKey, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

function PreviewFormResult({ message }: { message: string }) {
  return <p className="formResult" role="status"><CheckCircle aria-hidden size={18} weight="fill" />{message}</p>;
}

export function LoginPreviewForm() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [message, setMessage] = useState("");

  function validate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const identifier = String(form.get("identifier") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setMessage(identifier.length > 2 && password.length >= 8
      ? "입력 형식을 확인했습니다. 인증 요청은 전송하지 않았습니다."
      : "계정 식별자와 8자 이상의 비밀번호를 입력해 주세요.");
  }

  return (
    <form className="operationalForm authForm" onSubmit={validate} noValidate>
      <label><span>계정 식별자</span><input name="identifier" autoComplete="username" placeholder="회사 이메일 또는 승인된 로그인 ID" required /></label>
      <label>
        <span>비밀번호</span>
        <span className="passwordField"><input name="password" type={passwordVisible ? "text" : "password"} autoComplete="current-password" minLength={8} required /><button type="button" aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"} onClick={() => setPasswordVisible((value) => !value)}>{passwordVisible ? <EyeSlash aria-hidden size={20} /> : <Eye aria-hidden size={20} />}</button></span>
      </label>
      <div className="authFormMeta"><span><LockKey aria-hidden size={16} />TOTP 2차 인증이 이어집니다.</span><Link href="/auth/recovery">계정 복구</Link></div>
      <button className="primaryFormButton" type="submit">입력 형식 확인</button>
      <button className="pendingFormButton" type="button" disabled>Backend #58 연결 후 로그인</button>
      {message ? <PreviewFormResult message={message} /> : null}
    </form>
  );
}

export function MfaCodePreviewForm({ purpose = "로그인" }: { purpose?: string }) {
  const [message, setMessage] = useState("");
  function validate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setMessage(/^\d{6}$/.test(code) ? "6자리 코드 형식을 확인했습니다. 실제 factor 검증은 수행하지 않았습니다." : "인증 앱에 표시된 숫자 6자리를 입력해 주세요.");
  }
  return (
    <form className="operationalForm authForm" onSubmit={validate}>
      <label><span>{purpose} 인증 코드</span><input className="otpInput" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" aria-describedby="otp-help" required /></label>
      <p className="fieldHelp" id="otp-help">코드·factor ID·session ID는 URL이나 화면 기록에 남기지 않습니다.</p>
      <button className="primaryFormButton" type="submit">코드 형식 확인</button>
      <button className="pendingFormButton" type="button" disabled>Backend #58 연결 후 인증</button>
      {message ? <PreviewFormResult message={message} /> : null}
    </form>
  );
}

export function RecoveryPreviewForm() {
  const [message, setMessage] = useState("");
  function validate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const identifier = String(new FormData(event.currentTarget).get("identifier") ?? "").trim();
    setMessage(identifier.length > 2 ? "복구 요청 화면을 확인했습니다. 이메일이나 provider 요청은 전송하지 않았습니다." : "승인된 계정 식별자를 입력해 주세요.");
  }
  return (
    <form className="operationalForm authForm" onSubmit={validate}>
      <label><span>계정 식별자</span><input name="identifier" autoComplete="username" required /></label>
      <div className="formPolicyCallout"><WarningCircle aria-hidden size={19} /><p>관리자나 연구소는 비밀번호·TOTP 코드를 요청하지 않습니다. 복구 완료 뒤 모든 기존 세션을 재검증합니다.</p></div>
      <button className="primaryFormButton" type="submit">복구 입력 확인</button>
      <button className="pendingFormButton" type="button" disabled>Backend #58 연결 후 복구 요청</button>
      {message ? <PreviewFormResult message={message} /> : null}
    </form>
  );
}

export function ProjectCreatePreviewForm() {
  const [message, setMessage] = useState("");
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const start = String(data.get("periodStart") ?? "");
    const end = String(data.get("periodEnd") ?? "");
    if (!name || !start || !end) return setMessage("프로젝트명과 수행기간을 입력해 주세요.");
    if (start > end) return setMessage("종료일은 시작일보다 빠를 수 없습니다.");
    setMessage(`“${name}” 생성 입력을 검토했습니다. 실제 Project는 생성하지 않았습니다.`);
  }
  return (
    <form className="operationalForm businessForm" onSubmit={review}>
      <section className="formSection"><div><span>01</span><h2>기본정보</h2><p>일반 프로젝트를 생성합니다. 정식 연구과제 여부는 여기에서 선택하지 않습니다.</p></div><div className="formGrid"><label className="spanTwo"><span>프로젝트명</span><input name="name" required /></label><label><span>시작일</span><input name="periodStart" type="date" required /></label><label><span>종료일</span><input name="periodEnd" type="date" required /></label><label className="spanTwo"><span>목적</span><textarea name="objective" rows={4} required /></label></div></section>
      <section className="formSection"><div><span>02</span><h2>업무 범위</h2><p>생성자는 로그인한 활성 INTERNAL actor로 서버에서 확정합니다.</p></div><div className="formGrid"><label><span>가시성</span><select name="visibility" defaultValue="PROJECT_MEMBERS"><option value="PROJECT_MEMBERS">프로젝트 구성원</option><option value="INTERNAL">내부 사용자</option></select></label><label><span>프로젝트 책임자</span><input value="현재 로그인 사용자 · 서버 확정" readOnly /></label></div></section>
      <div className="formActionBar"><Link href="/projects">취소</Link><button className="primaryFormButton" type="submit">입력 검토</button><button className="pendingFormButton" type="button" disabled>Backend #58 연결 후 생성</button></div>
      {message ? <PreviewFormResult message={message} /> : null}
    </form>
  );
}

export function FormalResearchApplicationPreviewForm({ projectName }: { projectName: string }) {
  const [message, setMessage] = useState("");
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const purpose = String(data.get("researchPurpose") ?? "").trim();
    const method = String(data.get("researchMethod") ?? "").trim();
    setMessage(purpose && method ? "신청본 입력을 검토했습니다. 봉인·상신 또는 지정 기록은 생성하지 않았습니다." : "연구 목적과 수행 방법을 입력해 주세요.");
  }
  return (
    <form className="operationalForm businessForm" onSubmit={review}>
      <section className="formSection"><div><span>01</span><h2>연구 개요</h2><p>{projectName}의 별도 불변 신청본을 작성합니다.</p></div><div className="formGrid"><label className="spanTwo"><span>연구 목적</span><textarea name="researchPurpose" rows={4} required /></label><label className="spanTwo"><span>수행 방법</span><textarea name="researchMethod" rows={5} required /></label><label><span>예상 시작일</span><input type="date" name="periodStart" /></label><label><span>예상 종료일</span><input type="date" name="periodEnd" /></label></div></section>
      <section className="formSection"><div><span>02</span><h2>계획·통제</h2><p>예산·연구팀·성과·보안·안전·연구수당 적용 여부를 신청 시점 snapshot으로 봉인합니다.</p></div><div className="formGrid"><label><span>예상 예산</span><input name="budget" inputMode="numeric" placeholder="승인 전 계획금액" /></label><label><span>보안등급</span><select name="securityLevel" defaultValue="L2"><option>L1</option><option>L2</option><option>L3</option><option>L4</option></select></label><label className="spanTwo"><span>예상 성과</span><textarea name="outcome" rows={3} /></label><label className="checkboxField"><input type="checkbox" name="safetyReview" /><span>안전 검토 대상</span></label><label className="checkboxField"><input type="checkbox" name="allowance" /><span>과제별 연구수당 정책 검토 대상</span></label></div></section>
      <section className="immutableReview"><WarningCircle aria-hidden size={22} /><div><h2>봉인 전 확인</h2><p>봉인 뒤 원본은 수정하지 않습니다. 반려·회수 후 변경은 같은 신청 root의 신규 버전으로 작성하며, 연구소장 검토·동의 완료 후에만 정식 연구과제로 표시됩니다.</p></div></section>
      <div className="formActionBar"><button className="primaryFormButton" type="submit">입력 검토</button><button className="pendingFormButton" type="button" disabled>Backend #58 연결 후 봉인·상신</button></div>
      {message ? <PreviewFormResult message={message} /> : null}
    </form>
  );
}
