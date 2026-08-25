# 최초 연구소장 계정 부트스트랩

## 1. 목적과 범위

현재 Staging의 `auth.users`, `UserAccount`, `auth.sessions`가 모두 0명이므로 일반 회원가입 흐름의 승인자인 연구소장을 먼저 만들어야 한다. `OD-042-INITIAL-IDENTITY-BOOTSTRAP`은 이 최초 1회만 허용하는 운영 ceremony이며, 상시 제품 기능이나 숨겨진 관리자 우회경로가 아니다.

본 문서는 권장 실행안이다. 실제 대상자, 실행자, 검증자와 실행시각은 사용자 승인 전까지 확정값으로 취급하지 않는다.

## 2. 역할 분리

- 승인자: 사용자가 저장소 밖에서 최초 연구소장 대상자를 명시적으로 지정한다.
- 실행자: server-only Supabase Admin 자격증명과 최소권한 DB bootstrap 명령을 사용하는 운영 실행자다.
- 검증자: 실행자와 다른 사람이 Auth subject, UserAccount, PositionAssignment, TOTP, DeviceTrust와 Audit evidence를 대조한다. 사용자가 직접 실행하지 않았다면 사용자가 검증자를 맡을 수 있다.
- 대상 연구소장은 일반 가입 Application에서 자신을 승인하지 않는다. bootstrap의 사용자 승인 evidence가 일반 가입 승인 대신 최초 1회 근거가 된다.

실행자와 검증자는 같을 수 없다. 실제 이메일, invite URL, provider token, TOTP secret, service-role/secret key는 저장소·Issue·PR·CI log·evidence artifact에 기록하지 않는다.

## 3. 사전 입력과 Gate

실행 전에 다음 항목을 secret store 또는 승인된 비공개 운영 채널에서 결합한다.

- Supabase project stable ID `YOUONE_STAGING_PRIMARY`
- exact candidate commit과 migration head
- 최초 연구소장의 법적 성명/업무 이메일과 서버-HMAC email fingerprint
- 사용자 승인 evidence ID와 승인 UTC
- 실행자 ID, 독립 검증자 ID
- `POSITION_LAB_DIRECTOR` stable ID와 유효 시작일
- Worker/Admin credential stable ID와 회수 계획
- DeviceTrust 정책 version과 실제 기기 등록 방법

하나라도 미확정이면 실행은 `BLOCKED`다. 이메일 allowlist, `FIRST_USER_IS_ADMIN`, 임시 environment flag, 일반 `ADMIN_SYSTEM`/`ADMIN_SECURITY` Role 또는 `user_metadata`로 연구소장 권한을 추론하지 않는다.

## 4. 실행 절차

1. exact Staging project, candidate commit, migration head와 Security Advisor 상태를 캡처한다.
2. server-only Admin invite로 대상 provider user를 만들고 반환된 exact `auth.users.id`를 확인한다.
3. PENDING `UserAccount`를 만들고 provider subject를 exact 결합한다.
4. 별도 audited 명령으로 유효한 `POSITION_LAB_DIRECTOR` assignment를 만든다. Role이나 다른 Position은 자동 부여하지 않는다.
5. 대상자가 초대를 수락하고 password 설정, verified TOTP `aal2`, DeviceTrust 등록을 완료한다.
6. Identity Resolver가 exact provider `session_id`, PENDING/ACTIVE 상태, PositionAssignment와 DeviceTrust를 재검증한다.
7. 모든 활성조건이 충족된 한 transaction에서 UserAccount를 `ACTIVE`로 전이하고 append-only Audit/outbox를 기록한다.
8. 독립 검증자가 provider subject ↔ UserAccount ↔ PositionAssignment ↔ TOTP ↔ DeviceTrust ↔ Audit evidence를 대조한다.
9. bootstrap용 임시 접근·명령·credential을 회수하고 같은 경로의 재실행이 fail-closed하는지 확인한다.

초대 수락으로 Supabase session이 생겨도 `UserAccount=PENDING` 동안 일반 업무 `ActorContext`를 만들지 않는다.

## 5. Evidence와 실패 보상

evidence에는 비밀값이나 원문 개인정보 대신 다음 stable reference와 digest만 남긴다.

- project/candidate/migration stable reference
- 사용자 승인 evidence ID
- provider subject UUID, UserAccount UUID, PositionAssignment UUID
- TOTP verified factor reference와 DeviceTrust UUID
- 실행자/검증자 ID 및 각 UTC
- 생성·활성화·검증 Audit event ID
- canonical artifact SHA-256

초대 후 DB 결합이 실패하면 provider user/session을 즉시 회수하거나 차단하고 실패 Audit을 남긴다. DB 결합 후 활성조건이 실패하면 UserAccount는 PENDING을 유지한다. 잘못된 대상이나 권한 결합이 확인되면 global sign-out, UserAccount disable, PositionAssignment revoke 순으로 보상하고 새 ceremony를 승인받는다.

## 6. 완료 기준

- 최초 연구소장 UserAccount가 `ACTIVE`이고 exact `POSITION_LAB_DIRECTOR`가 유효하다.
- TOTP `aal2`, DeviceTrust, 480분 absolute/60분 refresh inactivity/newest-session-only 검증이 실제 session에서 통과한다.
- 동일 bootstrap 명령 재실행과 다른 대상/프로젝트/commit evidence 재사용이 거부된다.
- 일반 가입 승인 API가 이 연구소장에게만 열리고 self-approval, acting/delegated authority와 Admin Role 대체가 거부된다.
- 이후 `ADMIN_SECURITY`, 일반 연구원, Vendor는 `WF-USER-REGISTRATION-V1`으로만 생성한다.

