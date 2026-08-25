# Supabase Free 운영 대체 설계

## 1. 결정과 범위

2026-08-25 사용자는 당분간 `YOUONE_STAGING_PRIMARY`와 `YOUONE_STAGING_RECOVERY`를 Supabase Free Plan으로 유지하기로 결정했다. 이 문서는 Pro 전용 기능을 사용한 것으로 가장하지 않고, 승인된 `OD-019`, `OD-035`, `OD-036`, `OD-039` 계약을 애플리케이션·PostgreSQL·외부 운영 Worker에서 fail-closed로 강제하는 P0 Release Gate 대체 경로다.

이 결정은 P1 제품 구현을 허용하지 않는다. 또한 Free 프로젝트 자동 일시중지와 무상 서비스 가용성 한계를 제거하지 않으므로, Staging 실증을 진행할 수 있다는 뜻이지 곧바로 production 승격을 허용한다는 뜻은 아니다.

## 2. 기능별 대체 경로

| 필요 기능 | Free에서 사용할 경계 | 검증 계약 |
|---|---|---|
| Password + TOTP MFA | Supabase Auth | `INTERNAL`/`VENDOR` 모두 verified TOTP와 `aal2`; AAL1은 업무 ActorContext 생성 금지 |
| JWT 60분 | Supabase Auth 설정 + 서버 검증 | `exp`, issuer, `sub`, UUID `session_id`, `getUser + getClaims` exact match |
| session 최대 480분 | PostgreSQL Identity Resolver | `auth.sessions.created_at + 480 minutes` 이후 모든 trusted request 즉시 거부 |
| refresh inactivity 60분 | PostgreSQL Identity Resolver | `auth.sessions.refreshed_at` 또는 최초 생성시각 + 60분 이후 거부; 마지막 사용자 화면 조작이 아니라 provider session refresh 시각 기준이며 같은 `session_id`에 결합 |
| single-session | PostgreSQL Identity Resolver | 같은 subject의 가장 최근 provider session 하나만 허용; 이전 session은 provider JWT가 남아도 애플리케이션에서 거부 |
| 로그아웃·계정차단 | Supabase global sign-out + application deny | exact trusted target JWT, 요청별 `auth.sessions` 확인, retry 3회, 15분 reconciliation, append-only Audit |
| 신규 기기 재인증 | application-owned DeviceTrust | 서버 발급 random nonce의 HMAC fingerprint만 저장; HttpOnly/Secure/SameSite=Strict cookie와 actor/session exact binding; 신규·철회·만료 기기는 password+TOTP 재인증 전 거부 |
| 민감 action step-up | application-owned StepUpGrant | TOTP 재검증 결과를 actor + provider session + device + exact action/action-set에 짧게 결합; 원본 TOTP/token은 저장하지 않고 재사용·다른 action 전용을 금지 |
| 인증 rate limit | existing B01 PostgreSQL limiter | 승인된 정확히 6개 `OD-039` rule, two-person Approval, canonical hash, HMAC-authenticated stable subject cookie |
| DB/Storage 백업 | 별도 운영 Worker → private Google Drive | 매 60분, client-side authenticated encryption, DB 14일/Storage 30일, manifest·SHA-256·candidate/migration binding |

`20260824001800_r06_free_session_policy.sql`의 `resolve_active_actor_context_snapshot`은 앞의 480분/60분/newest-session 검사를 `auth.sessions`와 verified TOTP factor에 대해 매 trusted identity bootstrap에서 실행한다. UI 숨김이나 브라우저 타이머는 이 계약을 대신하지 않는다.

## 3. DeviceTrust와 StepUpGrant 최소 계약

DeviceTrust는 브라우저 fingerprint를 신뢰하지 않는다. 서버가 256-bit random nonce를 만들고 deployment secret으로 domain-separated HMAC을 생성한다. DB에는 raw nonce·cookie·token 대신 HMAC fingerprint, `UserAccount.id`, provider `session_id`, 생성·만료·철회시각, 승인한 인증방법과 optimistic version만 저장한다. cookie 누락·MAC 불일치·다른 actor/session·만료·철회·provider 장애는 모두 민감 action 호출 전에 거부한다.

Issue `#65`의 최소 vertical slice는 별도 `ActivationContext`와 `youone_activation` DB capability, no-seed versioned policy, 2단계 enrollment/verification, readiness 및 guarded account-activation 계약을 구현한다. 이는 로컬 코드·migration 계약 완료를 뜻할 뿐 실제 정책 version, HMAC secret, Staging actor/session 및 live evidence가 적용됐다는 뜻은 아니다. 따라서 아래 Staging 검증 항목은 계속 열린다.

StepUpGrant는 immutable challenge 결과와 짧은 유효기간을 갖고 다음 tuple에 exact 결합한다.

```text
UserAccount.id
+ provider session_id
+ DeviceTrust.id/version
+ exact action ID 또는 승인된 action-set version
+ authenticated_at/expires_at
+ consumed/revoked state
```

step-up 유효시간은 아직 사용자가 확정하지 않았으므로 임의 기본값을 production policy에 넣지 않는다. 구현 권장값은 15분이며, 승인 전에는 해당 민감 action을 fail-closed로 유지한다.

## 4. 외부 Worker와 스케줄링

권장 실행 주체는 회사가 통제하는 상시 실행 Worker다. 기존 NAS/미니 PC/서버의 systemd, Windows Task Scheduler 또는 해당 장비에 설치한 GitHub Actions self-hosted runner를 사용할 수 있다. 이 Worker만 다음 restricted secret을 갖는다.

- Primary/Recovery 최소권한 DB login과 Worker 전용 Supabase secret
- Google Drive API 서비스계정/OAuth credential
- backup encryption key reference와 HMAC secret
- 알림 목적지 credential

Worker 작업은 서로 다른 idempotency key와 lease를 사용한다.

- 매 15분: 미확인 global sign-out reconciliation, 실패 누적 시 incident escalation
- 매 60분: PostgreSQL logical dump, Private Storage byte/manifest backup, client-side encryption, Drive upload, 원격 digest 재검증
- 매 60분: DB 14일/Storage 30일 retention 정리. 먼저 새 backup 검증을 완료한 뒤 만료본만 삭제
- 매 5분 권장: heartbeat 기록. 마지막 성공시각이 허용 cadence를 넘으면 `MONITORING_APPLICATION_SECURITY_LOG`에 경보

Vercel Hobby Cron은 하루 1회만 허용하므로 15분/60분 작업의 실행 주체가 될 수 없다. GitHub-hosted scheduled workflow도 지연되거나 누락될 수 있어 보조 감시·수동 재실행에는 사용할 수 있지만 RPO 60분의 단독 증거로 인정하지 않는다. Google Drive Codex connector 역시 설계·폴더 관리용 사용자 연결이며, 배포 Worker의 runtime credential이 아니다.

## 5. Free Plan 잔여위험

- Free 프로젝트는 낮은 활동이 지속되면 자동 일시중지될 수 있다. 인위적 keep-alive로 이를 숨기지 않으며, pause 경보·수동 resume·readiness 재검증 절차를 둔다.
- Supabase native time-box/inactivity/single-session 설정은 Pro 전용이므로 Dashboard 설정 증거가 아니라 애플리케이션 거부 증거를 R05/R06에 남긴다.
- 외부 logical dump는 Supabase platform backup/PITR의 대체물이 아니다. Storage 객체와 custom role password를 별도로 복원하고 Web/Identity Resolver/Worker readiness를 다시 증명해야 한다.
- Free 서비스의 SLA와 자동 pause 위험 때문에 production 연속가용성을 보장한다고 표시할 수 없다. production 승격 전 사용자가 이 잔여위험을 명시적으로 수용하거나 유료/자체호스팅 운영으로 변경해야 한다.
- 두 Free 프로젝트와 500 MB DB/1 GB Storage 등 조직 quota를 지속 감시하고, 임계치 초과 시 쓰기 실패 전에 운영 중단·이관 절차를 실행한다.

## 6. Staging 완료 체크리스트

- [ ] Supabase JWT expiry 60분, TOTP `aal2`, exact `session_id` 확인
- [ ] `OD-042` one-time ceremony로 최초 실제 Lab Director를 생성하고 이후 `WF-USER-REGISTRATION-V1`으로 ADMIN_SECURITY·일반 연구원·Vendor 가입을 각각 승인/활성화
- [ ] 480분 absolute 경과·`refreshed_at` 기준 60분 refresh inactivity·이전 session이 다음 요청에서 각각 거부됨을 실세션으로 증명
- [ ] DeviceTrust nonce/MAC 변조, cross-actor/session, 만료·철회가 provider/업무 호출 전 거부됨을 증명
- [ ] 민감 action step-up policy version과 유효시간 승인 후 replay/cross-action 거부 증명
- [ ] 외부 Worker의 15분 reconciliation과 60분 DB/Storage backup을 24시간 이상 연속 실증
- [ ] 암호화된 Drive artifact의 digest·보존·접근제어·credential 미노출 검증
- [ ] `YOUONE_STAGING_PRIMARY → YOUONE_STAGING_RECOVERY` 격리 복구, role password 재프로비저닝 및 RTO 240분 내 readiness 복구
- [ ] Free project pause/복구 runbook과 경보를 모의하고, production용 Free 잔여위험을 별도 사용자 승인
- [ ] exact candidate commit에 귀속된 R05 matrix와 정확히 27개 R06 artifact 생성

DeviceTrust/StepUpGrant 개발과 실제 actor 준비는 순차 대기가 아니라 병행한다. 최초 Lab Director bootstrap이 승인·완료되면 ADMIN_SECURITY, 일반 연구원, Vendor 신청을 즉시 만들어 각 보안기능을 live Supabase session으로 검증한다.

공식 근거: [Supabase User sessions](https://supabase.com/docs/guides/auth/sessions), [Supabase Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Supabase backups](https://supabase.com/docs/guides/platform/backups), [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), [GitHub Actions scheduled workflow 주의사항](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows#triggering-event-conditions).
