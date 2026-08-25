# 회원가입 신청 및 계정 활성화

## 1. 사용자 결정

2026-08-25 사용자는 회원가입 기능을 P0 운영 Auth 범위에 추가하고, 가입 승인 권한을 연구소장 직권으로 확정했다.

`직권 승인`은 다음 exact 계약을 뜻한다.

- 현재 활성 `INTERNAL` UserAccount이며 `POSITION_LAB_DIRECTOR`가 유효한 본인만 승인·반려할 수 있다.
- authenticated actor와 effective actor가 같아야 한다. Senior, Representative, `ADMIN_SYSTEM`, `ADMIN_SECURITY`, Role-only 권한과 acting/delegated authority는 가입 승인을 대신할 수 없다.
- 연구소장 한 명의 결정으로 가입 심사는 최종 완료된다. 공통 다단계 ApprovalInstance나 대표 추가결재를 붙이지 않는다.
- 승인 결정은 역할·직책·VendorMembership·Project/Contract Scope 부여가 아니다. 후속 provisioning은 승인 snapshot을 바꾸지 못하며 별도 권한·감사 계약을 통과해야 한다.

## 2. 승인 전 Auth 사용자를 만들지 않는 이유

공개 화면은 Supabase `signUp()`을 직접 호출하지 않는다. 신청자가 입력한 비밀번호를 애플리케이션이 보관하지도 않는다. 먼저 애플리케이션의 immutable 가입신청을 만들고, 연구소장 승인 후에만 server-only Worker가 Supabase Admin invite를 실행한다.

이 경계는 다음을 보장한다.

- 미승인 신청자가 provider session/JWT를 얻지 않는다.
- 브라우저에 `service_role`/secret key가 노출되지 않는다.
- 가입 화면 입력이나 `user_metadata`가 Role, Position, Permission, Vendor, Scope의 근거가 되지 않는다.
- 이미 존재하는 이메일 여부를 공개 응답에서 구분하지 않는다.
- Free default SMTP의 template 제약과 실제 invitation delivery를 Staging에서 별도로 검증한다.

## 3. 가입 신청

Public route는 `GET /register`, `POST /api/auth/registrations`다. 최소 입력은 다음 typed 필드다.

- 신청자 표시명
- 정규화 이메일
- 신청 계정 종류 `INTERNAL | VENDOR`
- `VENDOR`인 경우 기존 활성 Vendor ID
- 개인정보·이용 목적 동의 version과 동의 UTC

신청자는 Position, Role, Permission, 관리권한, Project, Contract 또는 기술자료 등급을 입력하거나 선택할 수 없다. 미등록 업체 생성은 별도 Vendor onboarding 대상이며 회원가입이 Vendor 레코드를 자동 생성하지 않는다.

이메일은 공개 조회가 불가능한 암호문과 server-HMAC 검색 fingerprint를 분리해 저장한다. 평문 이메일, password, provider token, cookie와 invite link는 Audit·log·일반 projection에 남기지 않는다. Public endpoint는 approved `OD-039`과 별도의 `OD-043-REGISTRATION-ABUSE-POLICY`가 없으면 fail-closed한다. 권장 수치·CAPTCHA·network privacy 계약은 `docs/registration-abuse-policy.md`에 있다. 중복·기존계정·존재하지 않는 Vendor 등 내부 사유와 무관하게 외부에는 동일한 접수 응답만 반환한다.

## 4. 상태와 불변성

가입신청 machine은 `SM-USER-REGISTRATION-V1`이다.

```text
SUBMITTED ──DIRECTOR_APPROVE──> APPROVED
    │
    ├──DIRECTOR_REJECT────────> REJECTED
    └──APPLICANT_WITHDRAW─────> WITHDRAWN
```

`APPROVED`, `REJECTED`, `WITHDRAWN`은 해당 신청본의 terminal state다. 제출 후 신청 내용을 덮어쓰지 않는다. 정정·재신청은 predecessor를 가리키는 새 신청본이며, 같은 normalized email fingerprint에 미종결 신청은 하나만 허용한다.

연구소장 결정은 exact 신청 ID/version/checksum, direct actor UserAccount/Position evidence, reason/evidence, UTC를 immutable decision으로 남긴다. 반려 reason은 필수이며, 승인도 정책 version과 감사근거를 요구한다.

## 5. 승인 이후 provisioning

승인 transaction은 credential을 만들지 않고 `IDENTITY_REGISTRATION_APPROVED` outbox를 기록한다. Worker는 exact approved snapshot을 다시 확인한 뒤 Supabase Admin `inviteUserByEmail`을 호출하고 반환된 provider subject를 PENDING `UserAccount`에 결합한다.

계정 활성화 조건은 모두 AND다.

```text
approved registration
AND accepted provider invitation / password established
AND verified TOTP aal2
AND active DeviceTrust
AND required internal assignment OR active VendorMembership
AND no disable/revoke/expiry
────────────────────────────────────────────────────────
ACTIVE UserAccount
```

초대 수락 후 아직 PENDING인 계정은 일반 업무 `ActorContext`나 Data API 권한을 받지 않는다. exact live provider session, TOTP `aal2`와 approved invite/bootstrap evidence로 매 요청 파생한 restricted `ActivationContext`에서 exact-self DeviceTrust enrollment와 최소 readiness 조회만 허용한다.

내부 사용자의 조직·부서·직책·Role은 별도 audited assignment 명령으로 부여한다. 가입 승인이 `ROLE_RESEARCHER`, `ADMIN_SECURITY` 또는 연구소장 직책을 자동 부여하지 않는다. 외주 사용자는 별도 active VendorMembership이 필요하며, 그 이후에도 exact Project + Contract grant가 없으면 업무 데이터는 계속 Deny by Default다.

provider invite 성공 후 DB 결합이 실패하면 초대 성공을 숨기지 않고 provisioning을 `FAILED`로 기록하고 provider session 생성 여부를 확인·회수한다. DB 성공 후 이메일 전송 상태가 불명확하면 같은 idempotency key로 reconciliation하며 중복 UserAccount나 두 번째 invite를 만들지 않는다.

## 6. 최소 화면

- `/register`: 가입신청, 공통 비열거 접수 결과
- `/registration/status`: 이메일로 전달된 one-time status token 기반 상태 확인; raw registration ID 노출 금지
- `/settings/registrations`: 연구소장 전용 대기·처리 목록
- `/settings/registrations/[registrationId]`: exact 신청 snapshot, 승인/반려 사유, provisioning 상태
- `/settings/users`: 승인된 계정의 assignment/MFA/DeviceTrust/세션 상태

가입 승인 버튼은 UI 숨김이 아니라 Application/DB에서 direct Lab Director를 재검증한다. 모바일은 신청·승인 확인 modal/bottom sheet를 사용할 수 있으나 복수 신청 비교와 감사이력은 정식 페이지를 유지한다.

## 7. 최초 연구소장 bootstrap

현재 Staging에는 UserAccount가 0명이므로 첫 `POSITION_LAB_DIRECTOR`는 자신을 승인할 수 없다. 최초 bootstrap은 일반 회원가입 경로의 예외를 코드에 숨기지 않는다. 실제 actor UUID, provider subject, 사용자 승인 evidence, 실행자와 검증자, 생성 SQL/관리 API 결과, TOTP/DeviceTrust, 감사 import를 묶은 `docs/identity-bootstrap.md`의 one-time bootstrap ceremony가 먼저 승인되어야 한다.

bootstrap 완료 후에는 모든 일반 가입이 본 문서의 연구소장 직권 승인 경로를 사용한다. 임의 `FIRST_USER_IS_ADMIN`, 이메일 allowlist나 environment flag로 운영 권한을 자동 부여하지 않는다.

공식 근거: [Supabase password-based signup](https://supabase.com/docs/guides/auth/passwords), [Supabase Admin inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [Supabase Admin createUser server-only](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
