# 공개 회원가입 남용방지 정책

## 1. 상태

`OD-043-REGISTRATION-ABUSE-POLICY`의 초기 수치와 provider는 2026-08-25 사용자 승인으로 확정됐다. versioned policy 및 distinct 운영 승인 evidence가 적용되기 전까지 공개 `POST /api/auth/registrations`는 fail-closed한다.

정책 stable ID는 `REGISTRATION_ABUSE_2026_01`이다.

## 2. 승인된 fixed-window 한도

모든 Gate는 AND다. oversized/schema-invalid 요청은 먼저 거부하고, network/global bucket은 CAPTCHA provider 호출 전에 한 transaction에서 소비한다. CAPTCHA가 성공한 뒤 email bucket 확인·소비와 Application write를 두 번째 transaction에서 원자 처리한다. CAPTCHA 실패 요청이 타인의 email bucket을 고갈시켜 정상 신청을 막지 못하게 한다.

| Bucket | Window | Maximum | Subject material |
| --- | ---: | ---: | --- |
| `REGISTRATION_EMAIL_24H` | 86,400초 | 3 | normalized email의 server-HMAC fingerprint |
| `REGISTRATION_NETWORK_1H` | 3,600초 | 10 | trusted client network의 server-HMAC fingerprint |
| `REGISTRATION_NETWORK_24H` | 86,400초 | 30 | trusted client network의 server-HMAC fingerprint |
| `REGISTRATION_GLOBAL_1H` | 3,600초 | 100 | deployment stable ID |
| `REGISTRATION_GLOBAL_24H` | 86,400초 | 500 | deployment stable ID |

동일 email fingerprint의 미종결 `SUBMITTED` 신청은 정확히 1개만 허용한다. 이는 rate limit과 별도의 DB unique invariant다. Terminal 신청의 재신청은 predecessor-linked 새 Application으로만 허용하며 위 24시간 한도를 계속 적용한다.

제한 시 외부 응답은 `429`와 동시에 초과된 모든 해당 bucket 중 가장 늦게 해제되는 남은 초의 올림 정수, 즉 `max(over-limit bucket remaining seconds)`를 `Retry-After`로 반환한다. Network 5분과 Global 40분이 함께 남았다면 `Retry-After: 2400`이다. 어떤 bucket, 이메일 존재 여부, Vendor 존재 여부 또는 기존 계정 여부가 원인인지는 노출하지 않는다.

## 3. CAPTCHA

공개 신청은 첫 요청부터 Cloudflare Turnstile managed challenge를 요구한다. 위험 점수에 따라 나중에만 발동하는 조건부 CAPTCHA는 P0에서 사용하지 않는다.

- frontend token은 backend가 Cloudflare Siteverify로 반드시 검증한다.
- token은 최대 5분, single-use로 취급하고 replay를 거부한다.
- Siteverify 응답의 `success`, expected hostname과 action `registration.submit`을 exact 검증한다. 응답에 존재하지 않는 `environment` 필드를 가정하지 않는다.
- production/staging widget, sitekey와 secret을 분리하고 deployment별 expected hostname/action 설정에 exact 결합한다. Free에서는 허용 hostname을 명시하고 Enterprise 전용 Any Hostname을 사용하지 않는다. sitekey는 공개 설정, secret은 server-only secret store에 둔다.
- provider 미설정, timeout, malformed response, invalid/expired/replayed token과 내부 오류는 신청 write 전에 fail-closed한다.
- provider `internal-error`/일시 network 실패만 같은 token과 같은 UUID `idempotency_key`로 최대 총 3회 시도하며 최종 실패는 generic `503`으로 처리한다.
- raw IP 최소화를 위해 Siteverify의 optional `remoteip`은 전송하지 않는다. IP-derived 값은 아래 내부 network HMAC rate-limit에만 사용한다.

Supabase Auth CAPTCHA 설정은 이후 invitation/password recovery 같은 provider Auth endpoint의 별도 방어선이다. 애플리케이션 소유 가입신청 endpoint의 Turnstile 검증을 대체하지 않는다.

## 4. Network 정보와 개인정보

Vercel direct deployment의 Interface adapter만 `@vercel/functions`의 `ipAddress(request)`가 해석하는 Vercel-overwritten `x-forwarded-for`를 trusted client IP source로 사용한다. 임의 `X-Forwarded-For`, `CF-Connecting-IP`, `X-Real-IP` 우선순위 fallback이나 request body/query의 IP는 신뢰하지 않는다. 현재 구성 앞에 별도 reverse proxy를 추가하면 이 계약을 재검토하기 전까지 공개 신청을 fail-closed한다. local/test는 production header를 흉내 내지 않고 명시적 test adapter로 source를 주입한다.

adapter가 얻은 client IP는 요청 메모리에서만 정규화한다. missing/malformed/multiple source는 fail-closed한다. IPv4는 `/24`, IPv6는 `/64` network prefix로 축약한 뒤 deployment-scoped HMAC-SHA256을 계산한다. raw IP, forwarded header 원문과 HMAC secret은 DB, Audit, application log, exception, CI snapshot에 저장하지 않으며 Siteverify에도 보내지 않는다.

email과 network fingerprint는 서로 다른 domain-separation prefix와 secret version을 사용한다. 정책 secret rotation 시 grace lookup은 승인된 이전 version 하나에만 허용하고, 새 신청은 current version fingerprint만 쓴다.

## 5. 승인 snapshot과 Audit

정책 본문 전체를 stable key ordering/UTF-8/no insignificant whitespace 규칙으로 canonicalize하고 SHA-256을 계산한다. effective policy에는 다음이 exact 결합되어야 한다.

- policy stable ID/version/상태/유효시각
- 다섯 bucket의 window/maximum/subject kind
- CAPTCHA provider/mode/deployment-specific sitekey·secret stable ID/hostname/action/retry/fail-closed 규칙
- fingerprint prefix length와 HMAC secret-version stable ID
- Retry-After 계산 규칙
- distinct active `ADMIN_SECURITY` agreement와 direct `POSITION_LAB_DIRECTOR` approval evidence

Audit에는 correlation ID, policy UUID/version, outcome enum, consumed/blocked bucket kind, window start, email/network HMAC fingerprint, CAPTCHA provider와 coarse outcome code, UTC만 허용한다. raw email/IP, CAPTCHA token/response 원문, cookie, provider error body와 secret은 금지한다.

정책 missing/mismatch/revoked/future-effective, snapshot hash 불일치, 승인자 중복/비활성 또는 현재 정책이 둘 이상이면 provider 호출과 신청 write 전에 `503`으로 fail-closed한다.

## 6. 필수 검증

- email/network/global 각 경계값과 `Retry-After`
- 여러 bucket 동시 초과 시 `Retry-After`가 max remaining seconds인지 검증
- 동일 미종결 신청 동시 제출 시 하나만 생성
- forged/expired/replayed/wrong-hostname/wrong-action/cross-deployment CAPTCHA token 차단
- Vercel adapter의 missing/malformed/multiple IP 및 client-supplied header spoofing 차단
- CAPTCHA/provider/schema/internal 오류에서 신청 미생성 및 입력·비밀값 미출력
- raw IP/email/token이 stdout/stderr/Audit/log/artifact/snapshot에 없음을 검사
- policy payload 변조, stale approval, 같은 사람 2인 승인, secret-version 불일치 차단
- global bucket 경쟁조건에서 허용 maximum 초과가 없음을 DB integration test로 증명
- invalid CAPTCHA 반복으로 타인의 email bucket이나 미종결 신청을 선점하지 못함을 증명

공식 근거: [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha), [Cloudflare Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Cloudflare hostname management](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/), [Vercel request headers](https://vercel.com/docs/headers/request-headers).
