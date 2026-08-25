# R06 운영정책 및 릴리즈 증거 Gate

## 1. 상태

`R06-RELEASE-EVIDENCE-V1`은 P0 릴리즈 승격을 검증하는 fail-closed 계약이다. 2026-08-23 사용자가 `OD-019`, `OD-035`, `OD-036`의 정책값과 공급자 잔여위험을 승인했고, 2026-08-25 `YOUONE_STAGING_PRIMARY`/Recovery binding, Pro/Vercel, monitoring/evidence/Google Drive backup stable ID와 `OD-039` 값을 승인했다. 다만 실제 승인자 `UserAccount` UUID, versioned approval snapshot/evidence digest, Pro 활성화, 실제 Staging 증거, 복구훈련 및 전체 증거 ID가 아직 없으므로 결과는 `BLOCKED`다. `READY_FOR_RELEASE_PR`도 production 전환 승인이 아니며, 별도의 사용자 승인 `dev → main` PR을 만들 수 있다는 뜻만 가진다.

## 2. 운영정책 계약

릴리즈 입력은 아래 세 정책 모두에 version, 승인자 UUID, 생성·승인·효력 UTC, `revokedAt=null`, 승인 증거 SHA-256을 요구한다. 시간은 `createdAt <= approvedAt <= effectiveFrom <= release evaluation time`이어야 한다. 승인자·명시값이 누락되거나 placeholder이고, policy version이 증거가 참조한 version과 다르거나, 승인이 철회됐거나 아직 효력이 시작되지 않았으면 `BLOCKED`다. 저장소에는 임의 기본값이나 승인된 것처럼 보이는 예제 정책을 두지 않는다.

- `OD-019-MFA-SESSION`: MFA 대상 actor/action, 허용 factor, `aal2`, JWT/session/inactivity/time-box, 동시 session, device 재인증 정책
- `OD-035-PRODUCTION-OPERATIONS`: RPO/RTO, DB·Storage 백업 주기/보존, 모니터링 목적지, 사고대응자, 복구 승인자, 증거 보관 위치
- `OD-036-SUPABASE-SESSION-REVOKE`: target user의 유효 JWT를 이용한 Supabase `global` sign-out, exact `auth.sessions` 요청별 확인, 재시도·조정 정책 및 공급자 한계 승인

Supabase 공식 문서상 global sign-out은 해당 사용자의 모든 session을 종료하지만 access token 자체는 만료시각까지 유효할 수 있다. 또한 Admin sign-out API는 유효한 로그인 JWT를 요구한다. 따라서 target user JWT 확보·보호 방식과 잔존 access-token 시간을 사용자가 승인하기 전에는 `OD-036`을 닫지 않는다. 런타임 adapter는 요청 body의 `user_id`를 받지 않고 trusted `USER_ACCOUNT` resource의 `authSubject`를 기준으로 JWT `sub`, UUID `session_id`, configured issuer와 현재 `auth.sessions`의 subject/session/issuer를 모두 exact match한다. 이후 target JWT로 `global` sign-out하고 같은 `session_id`가 더 이상 활성 상태가 아님을 재조회한다. 애플리케이션은 매 민감 요청에서도 exact `session_id`를 확인해 자체 경계에서는 다음 요청부터 거부한다.

공식 근거:

- [Supabase Signing out](https://supabase.com/docs/guides/auth/signout)
- [Supabase Auth Admin signOut](https://supabase.com/docs/reference/javascript/auth-admin-signout)
- [Supabase User sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Multi-Factor Authentication](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)

## 3. 사용자 승인 체크리스트

### OD-019

- [x] MFA actor는 `INTERNAL`, `VENDOR`; 민감 action은 아래 exact allowlist로 step-up한다.
- [x] factor는 `TOTP`만 허용하고 `aal2`를 요구한다. Phone factor는 허용하지 않는다.
- [x] JWT 만료시간은 60분이다.
- [x] session 최대시간은 480분, inactivity timeout은 60분이다.
- [x] single-session per user를 적용한다.
- [x] 신규 device 재인증을 적용하고 managed-device 제한은 아래 민감정보/운영 action에 적용한다.

민감 action step-up 후보 정본은 다음과 같다. Staging 정책 snapshot은 등록된 `action_definition`과 exact 일치하는지 검증하고, 존재하지 않거나 비활성인 ID가 하나라도 있으면 효력을 시작하지 않는다.

- `identity.account.disable`, `authorization.assignment.manage`, `audit.security.read`
- `approval.step.approve`, `approval.policy.manage`
- `contract.detail.finance.read`, `inspection.record.decide`, `purchase.payment.record`
- `research_note.record.finalize`
- `technical_document.content.preview`, `technical_document.content.download`
- `technical_document.copy.render`, `technical_document.copy.print`, `technical_document.copy.custody`

managed-device 전용 후보는 `audit.security.read`, `contract.detail.finance.read`, `technical_document.content.preview`, `technical_document.content.download`, `technical_document.copy.render`, `technical_document.copy.print`, `technical_document.copy.custody`다. 실제 device trust provider가 없거나 검증되지 않으면 해당 action은 fail-closed로 거부한다.

### OD-035

- [x] RPO 60분, RTO 240분
- [x] DB 백업 주기 60분, 보존 14일
- [x] Private Storage 백업 주기 60분, 보존 30일
- [ ] 모니터링 목적지 stable ID
- [ ] 사고대응 담당자 actor UUID
- [ ] 복구 승인자 actor UUID
- [ ] 복구 실행자 actor UUID와 승인자/실행자 집합 무교집합
- [ ] 운영증거 보관 위치 stable ID

구현수단은 비용을 고려할 수 있지만 승인된 RPO/RTO를 낮추거나 DB와 Storage 객체 백업을 혼동할 수 없다. DB backup cadence와 Storage manifest/byte backup cadence는 각각 60분 이하여야 하고, 격리 복구 실증이 RTO 240분 이내 완료됨을 증명해야 한다.

### OD-036

- [x] `SUPABASE_GLOBAL_SIGN_OUT_WITH_TARGET_JWT`, scope `global` 적용
- [x] target user JWT는 trusted subject/session/issuer와 active `auth.sessions` exact 결합 후 메모리에서 일회성으로만 사용하며 artifact/log/storage에 보존하지 않는다.
- [x] access token이 만료 전까지 공급자 API에서 최대 60분 유효할 수 있고 target user JWT가 필요하다는 잔여위험을 수용한다.
- [x] `EXACT_AUTH_SESSIONS_ROW_EVERY_REQUEST`, 최대 잔존 60분, retry 3회, reconciliation 15분

### 실제 actor와 stable ID 후보

저장소에는 운영 `UserAccount`가 seed되어 있지 않다. 아래는 선택 기준과 후보 stable ID이며 실제 UUID는 Staging의 활성 내부 계정에서 조회·검토해야 한다. preview 표시 이름이나 migration의 Position/Role UUID를 actor UUID로 사용하지 않는다.

| 용도 | 1차 후보 | 독립성/검증 조건 |
|---|---|---|
| 정책 승인자 | active `POSITION_LAB_DIRECTOR` 사용자 | 사용자 승인 증거와 exact `UserAccount.id`; 본인이 폐기·복구 실행자이면 복구 승인자를 겸하지 않음 |
| 사고대응 담당자 | active `ADMIN_SECURITY` 사용자 | `INTERNAL`, 미정지·미만료, 보안 로그/사고 workflow 권한, 연락 가능성 검증 |
| 사고대응 보조 | active `ROLE_SAFETY_MANAGER` 사용자 | 안전사고 범위 담당; 보안사고 단독 owner로 사용하지 않음 |
| 복구 승인자 | active `POSITION_LAB_DIRECTOR` 사용자 | 실제 restore 실행자와 분리; 부재 시 승인된 acting authority만 허용 |
| 복구 실행자 | 최소권한 운영자 또는 `ADMIN_SYSTEM` 사용자 | 승인자가 아니며 L3/L4 원문 자동 열람권을 얻지 않음 |

Staging에서 다음 read-only query로 후보를 출력한다. `auth_subject`와 개인정보는 출력하지 않는다.

```sql
select
  u.id as actor_user_id,
  coalesce(array_agg(distinct p.stable_code) filter (where p.stable_code is not null), '{}') as positions,
  coalesce(array_agg(distinct r.stable_code) filter (where r.stable_code is not null), '{}') as roles
from public.user_account u
left join public.user_position_assignment upa
  on upa.user_id = u.id and upa.revoked_at is null
 and upa.valid_from <= statement_timestamp()
 and (upa.valid_until is null or upa.valid_until > statement_timestamp())
left join public.position p on p.id = upa.position_id and p.status = 'ACTIVE'
left join public.user_role_assignment ura
  on ura.user_id = u.id and ura.revoked_at is null
 and ura.valid_from <= statement_timestamp()
 and (ura.valid_until is null or ura.valid_until > statement_timestamp())
left join public.role r on r.id = ura.role_id and r.status = 'ACTIVE'
where u.account_kind = 'INTERNAL' and u.status = 'ACTIVE'
  and u.valid_from <= statement_timestamp()
  and (u.valid_until is null or u.valid_until > statement_timestamp())
group by u.id
having
  bool_or(p.stable_code = 'POSITION_LAB_DIRECTOR')
  or bool_or(r.stable_code in ('ADMIN_SECURITY', 'ADMIN_SYSTEM', 'ROLE_SAFETY_MANAGER'))
order by u.id;
```

stable ID 후보:

- actor selection reference: `POSITION_LAB_DIRECTOR` (`10000000-0000-4000-8000-000000000003`), `ADMIN_SYSTEM` (`20000000-0000-4000-8000-000000000006`), `ADMIN_SECURITY` (`20000000-0000-4000-8000-000000000007`), `ROLE_SAFETY_MANAGER` (`20000000-0000-4000-8000-000000000009`)
- monitoring (approved): `MONITORING_SUPABASE_PLATFORM`, `MONITORING_GITHUB_ACTIONS`, `MONITORING_APPLICATION_SECURITY_LOG`
- evidence location (approved): `OPS_EVIDENCE_PRIVATE_PRIMARY`, provider binding = encrypted private Google Drive
- Staging environment (approved): `YOUONE_STAGING_PRIMARY` → Supabase project `dttwfqzkhjujqkcatyav`
- isolated restore target (approved): `YOUONE_STAGING_RECOVERY` → Supabase project `jzxhetszlucgutnwidkd`

후보 ID는 credential이나 URL이 아니며, 실제 대상과 owner/retention/access control을 검토한 후 policy snapshot에 등록한다.

### Supabase Staging 준비 목록

- [x] 서로 다른 두 non-production project와 stable binding 준비: `YOUONE_STAGING_PRIMARY`, `YOUONE_STAGING_RECOVERY`
- [ ] Supabase 조직을 실제 Pro 이상으로 전환하고 session-control 지원을 Dashboard/실세션으로 확인
- [x] 비공유 Google Drive에 manifest/DB 14일/Storage 30일/release evidence/recovery drill 폴더 분리
- [ ] Google Drive API 서비스 계정/OAuth, client-side encryption key, 60분 scheduler와 retention deletion을 restricted secret store에 결합
- [ ] 동일 candidate commit migration을 clean/upgrade 경로로 적용하고 recovery target은 restore 시작 전 비어 있음을 증명
- [x] 기존 M10 Primary에 M11~M16/R02/R03/R06/B01 ordered upgrade 적용 및 Security Advisor WARN/ERROR 0 확인
- [ ] Web용 `NOINHERIT`/`NOBYPASSRLS` request login과 별도 Identity Resolver login 발급
- [ ] Worker용 별도 최소권한 login 발급; `youone_privileged_writer` 외 role SET 및 직접 table 권한 금지
- [ ] Auth에서 TOTP/AAL2, JWT 60분, session 480분, inactivity 60분, single-session과 신규 device 재인증 적용·증거화
- [ ] Supabase plan이 time-box/inactivity/single-session을 지원하는지 확인하고 미지원이면 activation 차단
- [ ] time-box/inactivity/single-session 변경이 refresh 시점에 적용되고 JWT expiry까지 최대 60분 지연될 수 있음을 실제 세션으로 검증
- [ ] new-device reauthentication/managed-device는 별도 application/device-trust 계약으로 검증하고 provider 부재 시 민감 action 차단
- [ ] publishable key와 service-role key를 분리하고 service-role은 Worker secret store에만 저장
- [ ] 모든 Storage bucket `public=false`; source와 recovery bucket/object가 서로 다른 project에 존재
- [ ] DB 60분/14일과 Storage 60분/30일 backup job 및 실패 알림 구성
- [ ] RPO 60분/RTO 240분 내 DB+Storage 격리 복구훈련, count/size/SHA-256 및 migration head 검증
- [ ] DB restore 후 custom Web/Identity Resolver/Worker login password를 secret store에서 재프로비저닝
- [ ] 재프로비저닝 후 Web database/request-auth와 Worker database/private-storage readiness 재검증
- [ ] internal/Vendor/disabled/expired/cross-scope 계정과 exact Project/Contract grant fixture 준비
- [ ] `apps/worker/.env.example`의 Staging 변수는 배포/GitHub secret에만 주입하고 populated env·token·URL을 commit/artifact/log에 남기지 않음
- [ ] R05 live matrix 전체 PASS와 artifact digest를 exact candidate commit에 귀속
- [ ] 승인된 세 policy snapshot을 포함한 정확히 27개 R06 artifact를 restricted evidence root에 보존

## 4. 릴리즈 증거

`REQUIRED_RELEASE_EVIDENCE_IDS`는 quality, M07~M16, R01~R05, migration clean/upgrade/rollback 또는 forward-fix, DB+Storage 복구훈련, Staging E2E, PWA 설치, 375px 흐름, critical/high 0건과 세 정책 승인 snapshot을 **정확히 27개** 요구한다. 누락·중복·unknown ID·잘못된 source kind·허용되지 않은 대체 ID는 모두 `BLOCKED`다. 각 참조에는 candidate commit SHA, UTC 관측시각, raw artifact SHA-256, 제한된 source kind만 들어간다. GitHub Actions 증거만 숫자 run ID를 가진다.

각 artifact는 제한된 root의 `<EVIDENCE_ID>.artifact` 파일에서 읽는다. 입력 JSON이 경로나 파일명을 지정할 수 없으며, R06가 실제 byte를 읽어 SHA-256을 다시 계산한다. 파일 부재·빈 파일·크기 초과·digest 불일치·금지 credential material은 `BLOCKED`다. 모든 참조와 R05 Staging packet은 다음 동일성을 만족해야 한다.

```text
evidence.commitSha == R06.candidateCommitSha == R05.commitSha == R06_PROMOTION_SOURCE_COMMIT
```

각 `POLICY_OD019/035/036.artifact`는 `approvedPolicySha256`을 포함한다. R06는 approval metadata를 제외한 정책 본문 전체를 아래 범위로 canonicalize하고 SHA-256을 직접 재계산해 artifact 값과 exact 비교한다. 같은 policyVersion/approval artifact를 유지한 채 action allowlist, session/device 값, RPO/RTO·backup·actor/destination 값, revoke retry/reconciliation 값 중 하나라도 바꾸면 `R06_POLICY_EVIDENCE_MISMATCH`로 차단한다.

- OD-019: `mfa`, `session`, `device`
- OD-035: `recoveryObjectives`, `databaseBackup`, `storageBackup`, monitoring/incident/recovery approver/recovery executor/evidence-location binding
- OD-036: mechanism/scope/request-session-check, residual/retry/reconciliation, acknowledged limitations

`RECOVERY_DB_STORAGE.artifact`도 단순 존재·digest로 끝내지 않는다. exact OD-035 version와 `approvedPolicySha256`, `PASS`, `candidateCommitSha`, `sourceEnvironmentId`, `recoveryEnvironmentId`, `migrationHead`, 실제 승인자 UUID, 실제 실행자 UUID 목록, 시작·완료 UTC를 parse한다. 다음 결합을 모두 만족해야 한다.

```text
artifact.candidateCommitSha == R06.candidateCommitSha == R06_PROMOTION_SOURCE_COMMIT
artifact.sourceEnvironmentId == YOUONE_STAGING_PRIMARY
artifact.recoveryEnvironmentId == YOUONE_STAGING_RECOVERY
artifact.sourceEnvironmentId != artifact.recoveryEnvironmentId
artifact.migrationHead == candidate checkout의 supabase/migrations head
```

승인자는 승인된 `recoveryApproverActorIds`, 실행자는 승인된 `recoveryExecutorActorIds`에 속해야 하고 실제 승인자와 실행자 교집합은 없어야 한다. 훈련은 정책 효력 이후 시작하고 RTO 240분 안에 끝나야 한다. candidate/environment/migration 결합이 다르면 `R06_RECOVERY_CANDIDATE_BINDING_INVALID`, actor 분리가 다르면 `R06_RECOVERY_ACTOR_SEPARATION_INVALID`, 그 밖의 schema/time 오류는 `R06_RECOVERY_EVIDENCE_INVALID`로 차단한다.

Staging packet은 R05의 모든 check가 `PASS`, live credential 증거가 확인되고 environment/commit이 릴리즈 후보와 같아야 한다. R06는 입력에 복사된 packet이나 digest를 신뢰하지 않고 실제 `STAGING_E2E_V1.artifact`를 parse해 5개 readiness, required check 전체, artifact digest를 다시 검증한다.

Canonical JSON은 UTF-8, object key 사전순, insignificant whitespace와 끝 newline 없음, ISO timestamp 문자열 변환 없음, `null` 보존, array 순서 보존으로 고정한다. raw artifact SHA-256과 이 canonical SHA-256을 각각 재계산하며 metadata와 다르면 차단한다.

token, cookie, request body, credential-bearing URL/DB 연결문자열, Storage object key와 signed URL은 report schema와 artifact에 허용하지 않는다. schema parse 실패, validation error, exception, debug/security log에서도 원본 입력값이나 validator context를 직렬화하지 않는다.

## 5. 실행

검토된 JSON 입력 파일과 정확히 27개 artifact가 있는 제한된 작업공간을 주입한다. 입력과 artifact를 저장소에 commit하지 않는다. `R06_PROMOTION_SOURCE_COMMIT`은 CI가 검증한 `dev → main` promotion source SHA를 trusted environment로 전달한다. candidate migration head는 release input이 정하지 않으며, R06 CLI가 현재 candidate checkout의 `supabase/migrations`에서 유효한 migration 파일을 정렬해 직접 산출한다. migration이 없거나 head 형식이 잘못되면 fail-closed 차단한다.

```text
R06_RELEASE_INPUT_PATH=<reviewed-json-path> \
R06_ARTIFACT_ROOT=<restricted-artifact-root> \
R06_PROMOTION_SOURCE_COMMIT=<40-char-source-sha> \
pnpm --filter @youone/worker release:verify
```

stdout은 newline을 포함해 `BLOCKED` 또는 `READY_FOR_RELEASE_PR` 한 줄만 허용한다. `READY_FOR_RELEASE_PR`은 종료코드 0, `BLOCKED`는 종료코드 2다. schema parse, artifact read, validator 내부 오류도 제3의 `ERROR` 상태 없이 `BLOCKED`와 non-zero exit로 수렴한다. stderr는 고정 필드의 비밀값 없는 security event만 기록한다. 실제 승인과 Staging 증거가 확보되기 전 현재 예상 결과는 `BLOCKED`다.
