# R06 운영정책 및 릴리즈 증거 Gate

## 1. 상태

`R06-RELEASE-EVIDENCE-V1`은 P0 릴리즈 승격을 검증하는 fail-closed 계약이다. 저장소 CI가 성공해도 사용자 승인 운영정책, 실제 Staging 증거, 복구훈련 및 전체 증거 ID가 없으면 결과는 `BLOCKED`다. `READY_FOR_RELEASE_PR`도 production 전환 승인이 아니며, 별도의 사용자 승인 `dev → main` PR을 만들 수 있다는 뜻만 가진다.

## 2. 운영정책 계약

릴리즈 입력은 아래 세 정책 모두에 version, 승인자 UUID, 승인·효력 UTC, 승인 증거 SHA-256을 요구한다. 저장소에는 임의 기본값이나 승인된 것처럼 보이는 예제 정책을 두지 않는다.

- `OD-019-MFA-SESSION`: MFA 대상 actor/action, 허용 factor, `aal2`, JWT/session/inactivity/time-box, 동시 session, device 재인증 정책
- `OD-035-PRODUCTION-OPERATIONS`: RPO/RTO, DB·Storage 백업 주기/보존, 모니터링 목적지, 사고대응자, 복구 승인자, 증거 보관 위치
- `OD-036-SUPABASE-SESSION-REVOKE`: target user의 유효 JWT를 이용한 Supabase `global` sign-out, exact `auth.sessions` 요청별 확인, 재시도·조정 정책 및 공급자 한계 승인

Supabase 공식 문서상 global sign-out은 해당 사용자의 모든 session을 종료하지만 access token 자체는 만료시각까지 유효할 수 있다. 또한 Admin sign-out API는 유효한 로그인 JWT를 요구한다. 따라서 target user JWT 확보·보호 방식과 잔존 access-token 시간을 사용자가 승인하기 전에는 `OD-036`을 닫지 않는다. 애플리케이션은 현재처럼 매 요청의 exact `session_id`가 `auth.sessions`에 존재하는지 검사해 자체 경계에서는 다음 요청부터 거부한다.

공식 근거:

- [Supabase Signing out](https://supabase.com/docs/guides/auth/signout)
- [Supabase Auth Admin signOut](https://supabase.com/docs/reference/javascript/auth-admin-signout)
- [Supabase User sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Multi-Factor Authentication](https://supabase.com/docs/guides/auth/auth-mfa)

## 3. 사용자 승인 체크리스트

### OD-019

- [ ] MFA를 적용할 actor 종류와 step-up action ID
- [ ] TOTP/Phone 허용 여부와 요구 AAL(`aal2`)
- [ ] JWT 만료시간
- [ ] session 최대시간과 inactivity timeout 또는 미사용 결정
- [ ] single-session 적용 여부
- [ ] 신규 device 재인증과 managed-device 전용 action

### OD-035

- [ ] RPO와 RTO
- [ ] DB 백업 주기·보존일
- [ ] Private Storage 백업 주기·보존일
- [ ] 모니터링 목적지 stable ID
- [ ] 사고대응 담당자 actor UUID
- [ ] 복구 승인자 actor UUID
- [ ] 운영증거 보관 위치 stable ID

### OD-036

- [ ] `SUPABASE_GLOBAL_SIGN_OUT_WITH_TARGET_JWT` 적용 승인 여부
- [ ] target user JWT의 안전한 획득·일회성 처리 절차
- [ ] access token이 만료 전까지 공급자 API에서 유효할 수 있다는 잔여위험 수용 여부
- [ ] 최대 잔존시간, 재시도 횟수, reconciliation 주기

## 4. 릴리즈 증거

`REQUIRED_RELEASE_EVIDENCE_IDS`는 quality, M07~M16, R01~R05, migration clean/upgrade/rollback 또는 forward-fix, DB+Storage 복구훈련, Staging E2E, PWA 설치, 375px 흐름, critical/high 0건과 세 정책 승인 snapshot을 정확히 요구한다. 각 참조에는 candidate commit SHA, UTC 관측시각, SHA-256, 제한된 source kind만 들어간다. GitHub Actions 증거만 숫자 run ID를 가진다.

Staging packet은 R05의 모든 check가 `PASS`, live credential 증거가 확인되고 environment/commit이 릴리즈 후보와 같아야 한다. Embedded packet은 key를 정렬한 deterministic JSON SHA-256과 `STAGING_E2E_V1` 참조 digest까지 일치해야 한다. token, cookie, body, 개인식별정보, URL, DB 접속정보, Storage key와 signed URL은 R06 출력 schema에 필드가 없다.

## 5. 실행

검토된 JSON 입력 파일 경로를 secret store 또는 제한된 작업공간에서 주입한다. 입력 파일 자체를 저장소에 commit하지 않는다.

```text
R06_RELEASE_INPUT_PATH=<reviewed-json-path> pnpm --filter @youone/worker release:verify
```

명령은 stdout에 정규화된 안전한 report 하나를 출력하고 `BLOCKED`일 때 종료코드 2를 반환한다. 실제 승인과 Staging 증거가 확보되기 전 현재 예상 결과는 `BLOCKED`다.
