# Project Memory

## Product

(주)유원산업기술 기업부설연구소의 연구개발 프로젝트, 외주개발, 계약, 구매, 정부 R&D, 연구노트, 시험·검증, 기술자료, 사내문서, 전자결재, 현장업무를 통합 관리하는 모바일 우선 PWA.

## Scale and Actors

- 초기 내부 사용자 약 8명, 외주 사용자 약 10명.
- 최대 약 30명 예상.
- 기본 직위: 전임 → 선임 → 연구소장 → 대표.
- Role과 Position은 분리한다.
- 외주 사용자는 별도 계정으로 직접 로그인한다.
- 본사 직원은 현재 조회 전용이다.

## Stable Decisions

- 모든 활성 내부사용자는 일반 프로젝트를 생성할 수 있다. 외주계정은 생성할 수 없다.
- 일반 프로젝트 생애주기와 `정식 연구과제 승격`을 분리한다. 신청 버전을 봉인한 뒤 연구소장 검토·동의가 완료되면 정식 연구과제로 지정한다. 선임·대표 승인은 이 승격 결재선에 포함하지 않는다.
- 선임은 검토/합의자이며 공식 승인권자는 아니다.
- 공식 결재권자는 연구소장 이상이다.
- 대표 단계는 2명 중 1명 승인하는 `ANY_ONE`이 기본이다.
- Approval Engine은 공통 모듈이고 승인 대상 문서 버전은 immutable snapshot이다.
- 기술자료는 L1~L4이며 외주 접근은 Deny by Default이다.
- 기술정보 외부반출은 L1 여부와 별개로 연구소장 승인을 요구한다.
- L2 외주 임시 디지털열람은 연구소장 승인, 기본 15일(승인자가 변경 가능)이다.
- L3/L4 외주 원문 다운로드와 수신자 자체 출력은 금지한다. 필요 시 내부 권한자가 식별 워터마크·사본번호를 넣어 직접 출력하고 인계·회수/파기 이력을 남긴다.
- L3 통제출력은 연구소장 승인, L4는 연구소장과 대표 승인이 모두 필요하다.
- 시스템관리자와 L3/L4 원문 열람권을 분리한다.
- 외주 계약 목록은 금액·지급정보를 노출하지 않는다. 본인 계약 상세도 별도 권한의 허용 필드만 제공한다.
- 회사는 WHAT을 관리하고 외주업체는 HOW의 전문책임을 부담한다. 회사 확인·검수·지급은 책임 면제가 아니다.
- Product, Project, R&D Program은 독립 엔티티이며 N:M으로 연결한다.
- WBS는 자유계층이고 UI 기본만 프로젝트→마일스톤→과업이다.
- 연구노트는 선임 검토가 선택적으로 가능하며 연구소장 확정으로 완료한다. 대표 결재는 없다.
- 구매 흐름은 견적→구매품의→결재→구매결의→본사 지급→입고→검수보고→완료이다.
- R&D는 진행·예산·집행·증빙·마감을 관리하며 RCMS 전체를 복제하지 않는다.
- 자유편집 문서와 템플릿을 병행하고 템플릿 변경은 과거 문서를 바꾸지 않는다.
- 승인된 초기 기술스택은 Next.js App Router + TypeScript 모듈러 모놀리스, Supabase Auth/PostgreSQL/Private Storage, Repository/Adapter 경계, Tiptap, Service Worker + IndexedDB/Dexie, Vitest + Playwright + RLS 통합테스트다. 도메인 계층과 UI는 Supabase SDK에 종속시키지 않는다.
- 오프라인 충돌은 자동 덮어쓰지 않고 비교·선택·병합한다.
- 연구성과·연구노트·연구시설 등 결과물은 회사 귀속이 원칙이며 법령·협약·개별 계약 예외를 기록한다.
- 안전관리자, 안전점검/교육/비상훈련/사고/폐기물 기록을 별도 안전 모듈 경계로 관리하고 기본 5년 이상 보존한다.
- 연구수당은 수당이 부여된 과제별 버전 정책에서 종류·대상·예산·평가기준·지급주기를 결정한다. 여러 과제의 월 비과세 후보액은 사람별로 합산하며, 적격요건과 월 20만원 한도를 재검증한다.
- 부분합격/조건부합격은 가중치 체크리스트 달성도로 평가하고 기본 지급률을 달성도에 연동한다. 지급률 조정은 사유와 별도 승인을 요구한다.
- 계약 수치, 법령 체크, 금액/보안등급별 결재선은 `docs/legal-policy-baseline.md`의 버전형 내부 프리셋으로 시작한다.
- GitHub 기본 통합 브랜치는 `dev`다. 기능·수정 PR은 `dev`를 대상으로 하고, `main`에는 검토 완료된 릴리즈 승격 PR만 병합한다.

## Current Phase

`IMPLEMENTATION_ACTIVE` (P0 `M00`~`M16`과 Release Gate #36 R01~R05가 `dev`에 병합 완료. 현재 R06 운영정책·릴리즈 증거 Gate를 구현 중이며 실제 사용자 정책 승인과 Staging 증거는 아직 없다. P1 권장 범위·로드맵은 승인됐지만 P0 릴리즈와 P1 설계 Gate 전에는 제품 코드를 시작하지 않는다).

Google Drive 프로젝트 문서 `00`~`15`와 상위 사내규정 3종을 읽고 1차 정본 설계문서를 작성했다. 사용자가 2026-08-21 (Asia/Seoul) Development Gate와 확정된 P0 범위 및 프로젝트 구조에 따라 개발 착수를 승인했다. `M00` ADR과 `M01` 스캐폴딩은 PR #19로 `main`에 병합됐다.

`M00`의 ADR-001~ADR-008을 Accepted로 기록했다. `M01`은 Node.js 24 LTS, pnpm workspace, Turborepo, Next.js App Router, 분리 worker, 전체 P0 package 공개계약 shell, request/worker 자격증명 경계, CI와 architecture test 기반을 생성했다. `config/package-boundaries.json`이 P0 package의 계층·소유자·최초 구현 merge item을 고정한다.

`M02`는 공통 value type, UnitOfWork/Audit/Transition/Outbox Port, 빈 stable-code registry, append-only Audit/Transition, immutable Outbox event와 분리 delivery state, idempotency ledger, NOBYPASSRLS request/worker capability role의 첫 SQL migration을 구현했고 PR #20으로 `main`에 병합됐다. 업무별 상태·Feature table·R&D Program machine은 선도입하지 않는다. 로컬 TypeScript/계약 테스트와 GitHub Actions PostgreSQL 16의 clean/upgrade/RLS/rollback/payload/idempotency/worker/concurrency 테스트를 포함한 총 50개 테스트가 통과했다.

`M03`는 Supabase의 서버 검증 세션을 user-editable metadata와 분리하고, DB의 활성 계정·effective-dated assignment를 매 요청 재조회해 `TrustedActorContext`를 만든다. Actor/Resource/Projection은 WeakSet provenance와 immutable collection으로 caller 조립·spread clone을 거부한다. Authorization 결과는 effect/reason뿐 아니라 Scope evidence, action-bound versioned projection, 후속 audit/delivery obligation을 보존한다. DB에는 Identity/RBAC/VendorMembership, 정규화된 action-set과 projection registry를 만들되, 실제 Project/Contract/DocumentVersion FK가 없는 임시 Scope row는 만들지 않는다. 계정·업체·membership lifecycle은 optimistic update와 M02 Audit을 한 transaction에 기록하며, request/identity-resolver/service Auth 경계를 별도 export로 격리한다. PR #21은 PostgreSQL 16 DB 통합 테스트를 포함한 테스트 80개, typecheck 4개 작업, build 2개 작업 통과 후 `main`에 병합됐다.

`M04`는 공통 Approval domain/application 계약, 정책·결재선·참여자 snapshot, `SEQUENTIAL`/`ANY_ONE`/`ALL`/`SPECIFIC`, REVIEW/AGREEMENT/APPROVAL/REFERENCE, 위임 재검증, 반려·회수·재상신 generation, append-only action과 M02 Audit/Transition/Outbox 원자성을 구현했다. 첫 물리 typed subject는 `APPROVAL_POLICY_VERSION`이며 exact version/checksum과 같은 root의 새 version 재상신을 강제한다. 개인 결재함·상세는 query/command adapter 미연결 시 명시적 unavailable·disabled 상태를 반환한다. PR #22는 GitHub Actions의 PostgreSQL 16 DB 통합 검증을 포함해 통과한 뒤 `main`에 병합됐다.

`M05`는 versioned Template/Document/DocumentVersion, content validation·sealed manifest·scan evidence, private Attachment metadata, 정확한 `DOCUMENT_VERSION` 결재 대상 FK, 반려·회수 후 strictly newer revision, 승인본 supersede, Vendor deny, exact participant read, L3/L4 entitlement, private Storage broker를 구현했다. DB가 canonical JSON/content와 full manifest hash를 재계산하며 승인본 내용·template·renderer·보안등급·봉인 첨부는 변경할 수 없다. raw editor content, private object key, signed/public URL, evidence table은 일반 projection으로 노출하지 않는다. GitHub Actions PostgreSQL 16 실DB 검증까지 통과한 PR #23이 `main`에 병합됐다.

`M06`는 일반 Project, ProjectMember, Product 연결, 자유계층 WBS, 실제 Project FK를 가진 Vendor grant와 정식 연구과제 신청/지정을 구현했다. 모든 활성 내부사용자는 일반 Project를 만들 수 있으나 정식 연구과제 여부는 별도 immutable application version을 봉인하고 정확히 한 명의 연구소장이 검토·동의해 생성된 designation에서만 파생한다. 선임·대표 단계와 직접 플래그 변경은 허용하지 않는다. 신청 반려·재작성 및 신청자 회수는 원본을 수정하지 않고 strictly newer version으로 이어지며, Project 종료·재개는 `OD-014`가 확정될 때까지 명령을 제공하지 않는다. PR #24는 GitHub Actions의 전체 195개 및 M06 PostgreSQL 실DB 10개 검증을 통과해 `main`에 병합됐다.

`M07`은 VendorContract root, immutable ContractVersion, ContractProject, 구조화된 ContractMilestone, Deliverable/Version, Guarantee/Warranty 기반과 실제 Contract Scope를 구현했다. 외주 계약 목록 projection에는 금액·지급·내부평가 필드가 존재하지 않으며, 상세 금융 projection은 exact active Contract Scope와 `contract.detail.finance.read`를 모두 요구한다. 계약 승인·서명·변경은 exact version/checksum/signature evidence로 고정하고, 활성화 시 scope 부여와 종료·해지 시 scope 회수를 계약 전이·감사·outbox와 같은 transaction에서 처리한다. PR #25는 `quality`와 독립 `m07-postgres` 검증을 통과해 `main`에 병합됐다.

`M08`은 Requirement/Revision, TestPlan/Result, weighted InspectionChecklistVersion/Criterion, immutable InspectionAttempt/CriterionResult 및 AcceptancePaymentDecision/PaymentRateAdjustment를 구현했고 PR #26으로 `main`에 병합됐다. 계산 달성도·시스템 제안률·조정 요청률·최종 승인률을 별도 보존하며, critical 실패는 점수만으로 완전합격될 수 없다. 조건부합격은 잔여조건·기한·보류액, 부분합격은 독립 사용가능분·미지급 잔액을 exact snapshot으로 가진다. 조정은 사유·증거·공식 결재 snapshot이 필요하며 지급 가능 상태는 외부 송금이나 회계 실행을 뜻하지 않는다.

`M09`는 PR #27로 `main`에 병합됐다. exact source와 evidence를 가진 NCR, 복수 CAR, containment, root-cause/action plan, 독립 효과검증, ineffective 재작업, close/reopen 이력을 구현한다. 책임 평가는 `PRELIMINARY`/`DISPUTED`/`FINAL`을 분리하고, 외주업체는 정확한 활성 VendorMembership 및 Project/Contract Scope와 책임 할당이 있을 때만 허용된 수행 명령을 사용할 수 있다. NCR/CAR의 검토·종료가 계약 책임을 면제하거나 계약 상태를 자동 변경하지 않는다.

`M10`은 PR #29로 `dev`에 병합됐다. ECR/ECO의 immutable version, 구조화된 6개 영향검토, exact typed before/after target, 승인된 변경지시, 적용범위 및 독립 재검증을 구현한다. 계약 영향 변경은 별도 서명·발효된 ContractVersion snapshot 없이는 효력이 발생하지 않으며, 긴급변경 정책과 결재 부정결과 상태전이는 각각 `OD-032`, `OD-033`을 임의 결정하지 않고 fail-closed로 유지한다. BOM은 P1 extension port만 두고 M10 물리 저장소와 화면에 포함하지 않았다.

`M11`은 PR #30, `M12`는 PR #31, `M13`은 PR #32로 `dev`에 병합됐다. M11은 Purchase/R&D 진행·예산·집행·증빙을, M12는 경량 ResearchNote와 immutable PDF 증빙을, M13은 effective-dated 안전담당·점검·교육·사고 및 48시간 내부 조사 SLA를 구현한다. M13은 MSDS·유해물질·폐기물·비상훈련을 P1로 유지하고 Vendor에게 exact Scope의 안전 allowlist projection만 제공한다.

`M14`는 exact approved DocumentVersion과 source Attachment tuple을 봉인한 통제사본 신청, L3 연구소장 단독 및 L4 연구소장 후 대표자 2명 중 1명 결재, 신청 시점 고유 사본번호, 내부 전용 per-page 워터마크 렌더링·출력, 인계·회수·파기·연체 대장을 구현했다. 외부 수령인은 활성 VendorMembership과 Project grant를 요구하고 계약 연결 건은 동일 VendorUser의 Contract grant까지 AND로 재검증한다. Vendor와 Admin-System은 원문·렌더·자가출력에서 차단되며 Vendor projection은 허용 필드만 제공한다. 로컬 M14 계약·도메인·애플리케이션·PDF·화면 테스트 32개와 전체 408개 테스트, typecheck, lint, build가 통과했다. PostgreSQL 16 실DB 8개 검증은 PR CI에서 실행한다.

`M15`는 설치 가능한 Next.js PWA manifest·service worker·공개 offline fallback과 Dexie 기반 allowlisted 로컬 outbox/cache/draft/attachment metadata/conflict 저장소를 구현했다. 로컬 명령은 현재 actor와 raw session이 아닌 SHA-256 session binding, aggregate/base version, schema version, canonical minimized payload/hash에 묶인다. 서버는 five-command 저위험 allowlist와 고위험 online-only deny registry를 공유하며, trusted request 재인증 후 정상 Application handler가 권한·Scope·상태·precondition·낙관적 버전을 재검증한다. stale version은 local payload와 safe server projection을 모두 보존하는 append-only `SYNC_CONFLICT`가 되고 자동 덮어쓰기·미승인 field merge는 없다. PR #34가 `dev`에 병합됐고 PostgreSQL 16 실DB 검증을 포함한 CI가 통과했다.

`M16`은 Supabase session 검증에서 subject 기반 session fallback을 제거하고 provider-issued `session_id`, 정상 expiry, 현재 DB identity를 모두 요구한다. AuthorizationDecision은 exact trusted actor/action/server resource provenance를 보존하며 privileged Supabase Auth 계정 비활성화는 server-loaded USER_ACCOUNT authSubject와 필수 감사 경계를 요구한다. Document manifest schema/evidence와 ResearchNote restore/정정 계보의 중첩 불변성을 보강했고, Vendor WBS 명령은 exact ProjectScope Project ID 및 `[validFrom, validUntil)`을 command 시점에 강제한다. Web은 안전한 correlation ID, JSON/64 KiB 제한, 비밀 없는 structured security log, live/readiness probe를 제공한다. concrete PostgreSQL/Auth/5개 command handler가 없으므로 readiness와 sync는 계속 명시적 `503` fail-closed이며 이를 생산 활성화 blocker로 기록했다. DB dump와 private Storage manifest를 함께 묶는 복구 계약 및 PostgreSQL full dump/restore CI rehearsal을 추가했다. 첫 PR CI에서 발견된 M02 stable definition registry 6개의 table-owner RLS bypass는 `20260823001500_m16_force_registry_rls.sql` forward-fix로 FORCE RLS와 runtime principal deny-all을 적용했다. 로컬 전체 460개 테스트, lint/typecheck, web/worker production build와 PostgreSQL 16 security/recovery CI가 통과했고 PR #35로 `dev`에 병합됐다.

Release Gate #36 R01은 `pg` 기반 concrete request pool과 Web composition을 추가했다. 배포가 제공하는 별도 `NOINHERIT`/`NOBYPASSRLS`/non-superuser LOGIN만 허용하고 매 transaction에서 `SET LOCAL ROLE youone_request`, `row_security=on`, trusted ActorContext 순서를 강제한다. Pool checkout은 effective role과 login role, 빈 actor/session context 및 `youone_request` 이외 역할로 전환할 수 없음을 검사하고 실패 연결을 폐기한다. 운영 TLS 검증과 bounded pool/timeout을 적용하며 URL 옵션에 의한 TLS/timeout 재정의, 불확실한 transaction cleanup 연결 재사용, 처리되지 않은 유휴 client 오류를 차단한다. `/api/health/ready`의 database component는 실제 probe 성공 때만 ready다. 단위 테스트와 PostgreSQL 16 CI는 superuser·과권한 LOGIN 거부 및 단일 physical connection의 commit/rollback 후 context 비잔존을 검증한다. 실제 Staging 자격증명과 readiness 증적 전까지 첫 activation blocker는 열린 상태다.

Release Gate #36 R02 request Auth는 `@supabase/supabase-js`를 request adapter 안에만 두고 publishable key, session persistence/refresh 비활성화, explicit-token `getUser + getClaims`, bounded health probe를 적용한다. `ActorContextSource`는 verified subject와 provider `session_id`를 함께 받아 별도 최소권한 `youone_identity_resolver` pool에서 `auth.sessions` exact subject/session 활성행을 확인한 뒤에만 DB identity snapshot을 반환한다. Auth readiness는 provider와 resolver capability가 모두 성공해야 한다. Supabase ban은 기존 session revoke가 아니고 delete는 비활성화와 다르므로 임의 매핑하지 않았으며, non-destructive revoke-by-user 수단은 `OD-036` release blocker로 남겼다.

Release Gate #36 R03은 `ADR-010`에 따라 다섯 offline command의 exact schema와 실제 PostgreSQL Application handler를 조합한다. SafetyChecklistDraft, InspectionAttemptDraft, FieldNoteDraft, FieldRecordDraft는 공식 증거와 분리된 typed/normalized aggregate이고 INTERNAL 전용이다. WBS progress만 exact assigned VendorUser와 활성 Membership/Project grant에서 허용하며 `IN_PROGRESS`의 `0..99` 갱신만 수행한다. Web은 32,768 UTF-8 byte에서 스트림을 중단하고, 동일 command ID 동시 요청은 transaction advisory lock으로 직렬화한다. command 등록, 업무 write, 상태전이, 감사, 최소 outbox, terminal result/conflict는 동일 request PostgreSQL transaction에서 commit/rollback되며 DB의 다섯 함수 capability probe까지 성공해야 offline-sync readiness가 ready가 된다.

Release Gate #36 R04는 Supabase SDK를 `@youone/infra-supabase-storage/service` Worker 전용 경계에 격리한다. 구성된 bucket의 live `public=false` 검증, cursor pagination, 안전한 상대 object key, byte download, 존재확인 및 `upsert=false` 복구를 구현했다. 복구 coordinator는 DB dump evidence와 private Storage 객체의 exact size/SHA-256 manifest를 묶고, 모든 artifact를 첫 write 전에 검증하며 원본과 다른 빈 target만 허용한다. 복구 후 전체 객체를 재다운로드해 hash/size/count를 검증하고 부분 실패 target은 자동 삭제·재사용하지 않는다. Worker readiness는 DB와 Storage capability가 모두 실제 성공해야 ready다. 실제 Staging Supabase 두 환경의 복구훈련과 운영정책 `OD-035`는 여전히 production activation blocker다.

Release Gate #36 R05는 Web 3개와 Worker 2개 capability를 stable component ID로 통합하고, concrete `youone_privileged_writer` PostgreSQL pool을 추가한다. Worker login은 `NOINHERIT`/`NOBYPASSRLS`/non-superuser, 무소유, exact role-SET, table 직접권한 없음, clean context와 Outbox capability를 실제 connection에서 검증한다. Staging runner/evidence V1은 non-Staging·Preview·localhost·credential-bearing URL을 거부하고 exact commit/environment/correlation/UTC, readiness, actor·Vendor Scope·불변성·동시성·offline·PWA/mobile·Storage restore 결과 및 artifact SHA-256만 보존한다. 실제 live executor/credential이 없으면 `BLOCKED`, live capability 실패는 `NOT_READY`이며 repository test만으로 `READY`를 만들지 않는다.

Release Gate #36 R06는 `OD-019`, `OD-035`, `OD-036`의 사용자 승인값을 임의 기본값 없이 versioned policy snapshot으로 검증하고, quality·M07~M16·R01~R05·migration·recovery·Staging·PWA/mobile·security 증거의 exact ID/commit/SHA-256/source를 하나의 release report로 묶는다. Supabase global sign-out은 target user의 valid JWT가 필요하고 revoked access token이 만료까지 유효할 수 있으므로 그 잔여위험과 획득 절차 승인 전 `OD-036`은 열린다. 모든 증거를 충족한 상태도 `READY_FOR_RELEASE_PR`일 뿐이며 별도 사용자 승인 없이는 `main`을 갱신하지 않는다.

P1 계획 `DELIVERY-PLAN-P1-V0.1`과 확정 범위 `P1-SCOPE-V1.0`은 GitHub 이슈 #39 및 PR #40으로 승인·병합됐다. P1은 BOM, 연구장비·교정, 안전관리 확장, 연구수당, 권한필터 통합검색을 권장 깊이와 순서로 진행한다. 다만 P0 Release Gate `#36` 완료와 `dev → main` P0 승격, P1 논리 ERD·권한·상태머신 검토 및 별도 Development Gate 승인 전에는 P1 제품 코드나 migration을 만들지 않는다.

로컬 화면 검토는 서버 전용 `YOUONE_PREVIEW_DATA=enabled`에서만 샘플 결재·문서·프로젝트/WBS·계약·검수·NCR/CAR·ECR/ECO·구매·R&D·연구노트·안전 목록과 상세를 제공한다. 화면마다 데모임을 명시하며 실제 저장·결재·지급 기록으로 표시하지 않는다. 플래그가 없으면 기존 조회 어댑터가 fail-closed `UNAVAILABLE`을 유지하고, 외주 안전 projection에는 금액·지급·내부 책임검토 필드를 추가하지 않는다. R&D preview/API는 내부 전용이며 Vendor query는 Preview에서도 `FORBIDDEN`을 유지한다.

`STRUCTURE-PROPOSAL-V1`과 `DELIVERY-PLAN-P0-V1`을 작성했다. 권장 구조는 pnpm workspace, Next.js App Router web, 별도 worker, Core/Feature/Process/Infrastructure package, 전역 SQL migration 정본이다. 서브에이전트는 Platform/Security, Approval/Evidence, Business/Quality의 세 역할과 Root Integration/Release로 나눈다.

## Known Gaps

- 개별 계약은 내부 초기 프리셋을 사용하되 적용 법령과 계약별 수치·예외를 서명 전 확정해야 한다.
- 연구수당 규정의 잘못된 조문 참조는 규정 개정사항으로 남는다. 시스템 정책은 현행 세법과 과제별 승인 버전을 근거로 별도 추적한다.
- `P0-SCOPE-V1.0`으로 권장 범위를 확정했다. P0에는 연구노트 경량, 시험/성능, 검수 달성도/차등지급, NCR/CAR, ECR/ECO, 안전 경량, L3/L4 통제출력을 포함한다.
- BOM, 연구수당, 연구장비/교정, 권한필터 검색은 P1이다. 특허/IP와 하이웍스/외부시스템은 P2다.
- 실제 회사 양식, 역할별 KPI, 하이웍스 범위, 모바일 탭, 캘린더 위치, 검색 범위가 미확정이다.
- `WF-RND-V1`의 `RND_PROGRAM` 정식 상태머신은 미확정이며 `OD-030`으로 기록했다. M11은 Program 등록·Project 연결·예산·집행·증빙·기한 조회를 구현하되 lifecycle 상태/전이/종료·재개 명령은 fail-closed로 두고 registry에 임의 등록하지 않는다.
- NCR `REOPENED` 이후 재시정·재종료 전이 경로는 `OD-031`로 남긴다. M09는 증거가 있는 `CLOSED → REOPENED`와 과거 이력 보존까지만 구현하고 후속 상태를 임의로 만들지 않는다.
- 긴급 ECO의 실제 권한·소급승인 기한·위험기준은 `OD-032`의 버전형 운영정책으로 남기며, 미설정 시 긴급경로를 차단한다.
- ECO 결재의 반려·회수·취소 이후 canonical 상태전이는 `OD-033`으로 남긴다. M10은 결재결과 증거만 보존하고 상태를 임의 전이하지 않는다.
- 렌더링/출력 후 인계 전 수령인 Scope가 상실된 통제사본의 정식 처분 이벤트는 `OD-034`로 남긴다. M14는 인계를 차단하고 실패 감사를 남기며, 내부 보관물을 임의 상태전이·삭제하지 않는다.
- 실제 회사 양식 업로드 전에는 범용 버전형 템플릿만 설계하고 인쇄 레이아웃을 추정하지 않는다.
- 운영 DB, request Auth/Identity Resolver, offline handler와 Private Storage 복구의 concrete repository adapter 및 R05/R06 fail-closed 증거 계약은 구현됐지만 실제 Staging 최소권한 LOGIN, live Supabase session, migration/readiness 및 실제 Storage 복구 증적은 아직 없다. `OD-019`, `OD-035`, `OD-036` 사용자 승인과 함께 `docs/security-operations.md`의 activation blocker를 모두 닫아야 한다.
- 운영 RPO/RTO, 백업 주기·보존기간, 모니터링 대상, 사고대응 담당자와 복구 승인권자는 `OD-035`이며 기간이나 담당자를 임의로 정하지 않는다.
- P1 권장 세부 범위와 로드맵은 승인됐다. `OD-037`의 남은 차단조건은 P0 릴리즈, P1 논리 ERD/권한/상태머신 검토와 P1 Development Gate다.

## Development Gate

기술스택, `P0-SCOPE-V1.0`, `STRUCTURE-PROPOSAL-V1`, `DELIVERY-PLAN-P0-V1` 및 제품 코드·스캐폴딩·DB migration 착수가 2026-08-21 사용자 지시로 승인됐다.

## Next Work After Approval

1. `M00`: 구조/DB principal/typed Approval subject/editor/worker/offline/watermark ADR 확정.
2. `M01`: 프로젝트 스캐폴딩과 import boundary 완료 및 PR #19 병합.
3. `M02`: DB/Audit Kernel 실제 PostgreSQL CI 검증 및 PR #20 병합.
4. `M03`: Auth/RBAC/Scope와 trusted request/RLS/field projection 구현 및 PR #21 병합 완료.
5. `M04`: 공통 Approval Engine과 typed subject adapter 구현 및 PR #22 병합 완료.
6. `M05`: Document/File CI 실DB 검증 및 PR #23 병합 완료.
7. `M06`: Project/WBS, 실제 Project Scope, 정식 연구과제 승격 구현 및 PR #24 병합 완료.
8. `M07`: Vendor/Contract/Deliverable, 실제 Contract Scope와 finance field denial 구현 및 PR #25 병합 완료.
9. `M08`: Requirement/Test/Inspection, 달성도·조건부/부분합격·승인된 지급률 조정 구현 및 PR #26 병합 완료.
10. `M09`: NCR/CAR 부적합·시정조치·독립 효과검증 구현 및 PR #27 병합 완료.
11. `M10`: ECR/ECO 변경요청·변경지시·재검증 구현 및 PR #29 `dev` 병합 완료.
12. `M11`: Purchase/R&D 진행·예산·집행·증빙 구현 및 PR #30 `dev` 병합 완료.
13. `M12`: ResearchNote 경량·불변 Entry·선택적 선임검토·연구소장 확정·generic PDF 증빙 구현 및 PR #31 `dev` 병합 완료.
14. `M13`: Safety 경량 담당지정·주/월 점검·교육·사고 48시간 조사 구현 및 PR #32 `dev` 병합 완료.
15. `M14`: L3/L4 exact version 결재·내부 워터마크 출력·인계/회수/파기 대장 구현 및 PR #33 `dev` 병합 완료.
16. `M15`: installable PWA shell, allowlisted Dexie outbox/cache, actor/session 재바인딩, immutable conflict/no-auto-overwrite 구현 및 PR #34 `dev` 병합 완료.
17. `M16`: trusted request/authorization/evidence/business boundary 보강, 통합 security/recovery CI와 production activation blocker 정리 및 PR #35 `dev` 병합 완료.
18. `R01`: concrete least-privileged PostgreSQL request pool/composition, transaction-local request role, live readiness와 connection-reuse 검증 구현. Staging 증적은 별도 activation gate로 유지.
19. `R02`: Supabase request Auth와 active-session request 경계는 PR #38로 `dev` 병합 완료. audited account disable/provider revoke와 Staging 증적은 잔여.
20. `R03`: 다섯 offline handler, typed draft/WBS progress, 동일 transaction·Scope/RLS·conflict·audit 구현 및 PR #41 `dev` 병합 완료.
21. `R04`: Worker-only Supabase Private Storage SDK, manifest-backed 무덮어쓰기 백업·복구, byte-level 검증과 fail-closed readiness 구현 및 PR #43 `dev` 병합 완료. 실제 Staging drill은 activation blocker로 유지.
22. `R05`: concrete Worker DB principal, Web/Worker 통합 readiness, allowlisted Staging evidence와 fail-closed runner 구현. 실제 live matrix/credential 증거는 R06 blocker로 유지.
23. `R06`: versioned 운영정책·exact 릴리즈 증거 검증기를 구현하되 미승인 정책·실제 Staging 증거 부재 시 `BLOCKED`. 사용자 승인 및 실증 후 별도 `dev → main` 승격 Gate 진행.
24. P1: 승인된 `P1-SCOPE-V1.0`을 기준으로 P0 릴리즈 및 P1 설계/Development Gate 통과 후에만 `P1-M00`부터 착수.
