# Agent Workstreams and Delivery Plan

- 계획 ID: `DELIVERY-PLAN-P0-V1`
- 전제: 최대 동시 슬롯은 Root 통합담당을 포함해 4개
- 상태: 역할·병합계획 확정안, 제품 코드 착수 전

## 1. 운영 모델

한 번에 Root 1명과 서브에이전트 3명을 운용한다.

| 역할 | 주 소유영역 | 핵심 책임 |
|---|---|---|
| Root Integration/Release | workspace config, ADR, `apps/web` 공통 shell/composition, central contracts/codes, cross-feature E2E, 최종 병합 | 요구사항 추적, 작업 분배, 공개 계약 승인, 충돌 해결, release Gate |
| Platform/Security Agent | `shared-kernel`, `application-kernel`, identity, authorization, audit, Postgres/Auth infrastructure, `supabase/**` | ActorContext, RBAC/Scope, RLS, migration 단일 작성, append-only audit, vendor isolation |
| Approval/Evidence Agent | approval, document, file, notification, research-note, tech-copy, Storage/PDF adapter 요구계약 | immutable snapshot, private file, document versions, controlled copy, research-note evidence |
| Business/Quality Agent | project, vendor, contract, quality, change, purchase, rnd, safety, cross-feature process 요구계약 | 업무 Aggregate/상태전이, 검수·차등지급, NCR/CAR, ECR/ECO, 구매/R&D/안전 |

범위가 큰 Business/Quality 역할은 Wave별 모듈만 활성화한다. 동시에 여러 에이전트가 같은 Feature를 편집하지 않는다.

## 2. 파일 소유권

| 경로 | 기본 작성자 | 규칙 |
|---|---|---|
| `pnpm-workspace.yaml`, root config, lockfile | Root | 다른 에이전트는 변경 요청만 제출 |
| `apps/web/src/app/**` | 해당 route의 Feature 담당 | root layout/composition은 Root 전용 |
| `apps/web/src/interface/**/<module>` | 해당 모듈 담당 | 공용 HTTP/error contract는 Root 승인 |
| `packages/shared-kernel`, `application-kernel` | Platform/Security | 변경은 공개계약 검토 후 병합 |
| `packages/core/identity`, `authorization`, `audit` | Platform/Security | 다른 모듈은 `public.ts`만 사용 |
| `packages/core/approval`, `document`, `file`, `notification` | Approval/Evidence | DB 요구사항은 Platform에 전달 |
| `packages/features/research-note`, `tech-copy` | Approval/Evidence | PDF/Storage 구현은 Infrastructure Port 사용 |
| 나머지 `packages/features/**`와 `processes/**` | Business/Quality | cross-feature direct import 금지 |
| `packages/infrastructure/postgres`, `supabase-auth` | Platform/Security | request/service-role adapter 분리 |
| `packages/infrastructure/supabase-storage`, `pdf-renderer` | Approval/Evidence | security review는 Platform 필수 |
| `supabase/migrations/**` | Platform/Security 단일 작성자 | 전역 번호·RLS 포함; 병렬 migration 파일 생성 금지 |
| `tests/architecture`, cross-feature `tests/e2e` | Root | 모듈별 test는 각 담당자가 작성 |

## 3. 병합 슬라이스

| 병합 | 수직 슬라이스 | 완료선 |
|---|---|---|
| `M00` | Gate/ADR | 구조, typed Approval subject, DB principal, editor/offline/worker/watermark ADR |
| `M01` | Scaffold | workspace, Next.js app, worker entry, lint/type/test/build, import boundary |
| `M02` | DB/Audit kernel | stable codes, UUID/UTC/version, UnitOfWork, audit/transition/outbox, migration tests |
| `M03` | Auth/RBAC/Scope | internal/vendor login, ActorContext, assignments, field projection, RLS |
| `M04` | Approval Engine | policy/version, instance/step/participant/action, concurrency, typed subjects |
| `M05` | Document/File | Template/Document/Version/File, private Storage, seal/approve/supersede |
| `M06` | Project/WBS | 누구나 일반 Project 생성, WBS, 정식 연구과제 신청→연구소장 동의 |
| `M07` | Vendor/Contract | vendor account/scope, contract/milestone/deliverable, finance field denial |
| `M08` | Test/Inspection/Payment | Requirement/Test, weighted checklist, partial/conditional, rate adjustment approval |
| `M09` | NCR/CAR | issue, containment, root cause, correction, verification, reopen |
| `M10` | ECR/ECO | impact, approval, exact change target, apply/reverify; BOM excluded |
| `M11` | Purchase/R&D | Supplier/Item, request/receipt/inspection, R&D budget/expenditure/evidence/deadline |
| `M12` | ResearchNote light | draft, optional Senior review, Director finalization, immutable entry, generic PDF |
| `M13` | Safety light | assignment, weekly/monthly inspection, training, incident/48-hour investigation |
| `M14` | L3/L4 TechCopy | exact-version approval, watermark/copy no., print/handover/return/destruction |
| `M15` | PWA/Offline | installable shell, allowlisted outbox, base-version conflict, no auto overwrite |
| `M16` | Security/Operations Gate | full RLS/authz/audit/concurrency/E2E, recovery drill, mobile acceptance |

각 `Mxx`는 DB나 UI만 따로 끝내지 않고 `Domain → Application → Infrastructure → Interface → Test`를 닫는 수직 슬라이스다.

## 4. 권장 병렬 Wave

| Wave | Root | Platform/Security | Approval/Evidence | Business/Quality |
|---|---|---|---|---|
| W0 | `M00/M01` workspace·ADR | migration/test harness, DB principal PoC | ApprovalSubject/Document Port 설계 | Project/Scope resource contract 설계 |
| W1 | composition/E2E harness | `M02/M03` | `M04/M05` 순수 domain/application 준비 | `M06` 준비 |
| W2 | route integration | RLS/migration 직렬 통합 | Approval/Document UI와 Storage | `M06/M07` |
| W3 | cross-feature contract review | security review | `M12/M14` 기반 준비 | `M08/M09/M10/M11` 순차 |
| W4 | PWA shell/integration | offline authorization/RLS | `M12/M14` 완료 | `M13` 완료 |
| W5 | `M15/M16` 통합 | penetration/RLS/audit | evidence/immutability E2E | business lifecycle E2E |

병렬로 준비해도 DB migration과 main 병합은 `M00 → M16` 순서를 지킨다.

## 5. 반드시 직렬화할 작업

- Development Gate 승인 후 workspace/ADR 확정.
- migration 번호와 SQL 작성, FK/RLS 적용.
- shared kernel과 public contract 변경.
- typed Approval subject link 통합.
- Application authorization과 DB/RLS의 end-to-end 연결.
- PWA sync conflict 물리 스키마(`OD-018`)와 offline cache 정책.
- 최종 security/operations Gate.

그 외 순수 Domain 상태머신, DTO/Presenter, 화면 prototype, 테스트 fixture는 공개계약을 먼저 고정하면 병렬화할 수 있다.

## 6. 에이전트 인계 패킷

각 에이전트는 작업 완료 시 다음을 Root에 넘긴다.

- 요구사항 추적: policy/state/event/permission ID.
- 공개 계약: Use Case, command/query DTO, projection, domain event.
- 데이터 요구: table/FK/check/unique/index/RLS와 migration forward-fix 메모.
- 상태 계약: actor, precondition, optimistic version, transition/audit/outbox.
- 보안 행렬: 허용·거부 actor, vendor scope, 제외 필드.
- 테스트 증거: 실행 명령과 unit/application/Postgres/RLS/E2E 결과.
- 후속 Port/event와 알려진 제한/open decision.
- 변경 파일 목록과 다른 에이전트가 건드리면 안 되는 미완료 범위.

## 7. 공통 Definition of Done

- Domain에 Next.js/Supabase/React/browser import가 없다.
- ActorContext는 검증된 session과 서버 레코드로 만든다.
- state/actor/Scope/precondition/version 검증, state 변경, transition, audit, outbox가 한 transaction이다.
- 핵심 상태는 자유 문자열이 아니며 DB constraint가 있다.
- 승인 snapshot, approved DocumentVersion, finalized ResearchNote, InspectionAttempt, AuditLog는 immutable이다.
- internal/vendor/disabled/expired/cross-vendor actor의 allow/deny test가 있다.
- vendor list/detail DTO의 finance/sensitive field absence를 contract test한다.
- clean DB와 upgrade fixture에서 migration을 검증한다.
- 동시 승인/전이 요청 중 하나만 성공한다.
- mobile empty/error/loading/accessibility 상태를 제공한다.
- 관련 canonical docs와 `PROJECT_MEMORY.md`를 함께 갱신한다.
- lint, typecheck, unit, integration, RLS, E2E가 모두 통과한다.

## 8. P1/P2 침범 방지

- P1: BOM, allowance, equipment/calibration, permission-filtered full search.
- Safety P1: MSDS/hazardous material, waste, emergency drill.
- P2: patent/IP, Hiworks/SSO/external-system adapters.
- 제외: RCMS 회계/송금 복제, 실시간 공동편집, vendor L3/L4 download/self-print.
- 회사 원본양식 전에는 generic versioned template/PDF만 제공한다.

Port와 typed link는 허용하지만 빈 기능 메뉴, 추측 table, 임시 JSON blob은 만들지 않는다.
