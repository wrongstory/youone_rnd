# Project Structure Proposal

- 구조안 ID: `STRUCTURE-PROPOSAL-V1`
- 기준 범위: `P0-SCOPE-V1.0`
- 상태: `APPROVED` — 2026-08-21 Development Gate 승인, `M00`/`M01` 착수

## 1. 구조 결정

약 30명 규모와 도메인 복잡도를 고려해 **pnpm workspace 기반 단일 배포 모듈러 모놀리스**로 구성한다.

- `apps/web`은 Next.js App Router 기반 PWA/BFF이며 Interface와 Composition Root만 소유한다.
- `apps/worker`는 Outbox, 만료, 알림, SLA 등 idempotent background job 진입점이다.
- Core와 Feature는 workspace package로 분리하고 각 package 안에서 Domain/Application을 나눈다.
- Supabase/Postgres/Auth/Storage/PDF/Dexie SDK는 Infrastructure package에만 둔다.
- DB 변경의 유일한 정본은 `supabase/migrations`의 전역 순서 SQL이다.
- P1/P2 전용 package/table/route/menu는 해당 단계 전에는 생성하지 않는다.
- 실제 P0 package 목록, 계층, 주 소유자와 최초 구현 merge item은 `config/package-boundaries.json`을 기계 판독 정본으로 사용한다.

## 2. 권장 최상위 구조

```text
youone_rnd/
├─ apps/
│  ├─ web/                         # Next.js App Router PWA/BFF
│  │  ├─ src/
│  │  │  ├─ app/                   # route, layout, loading/error UI
│  │  │  ├─ interface/             # actions, schemas, presenters, HTTP adapters
│  │  │  └─ composition/           # request/worker container, module wiring
│  │  └─ public/
│  └─ worker/                      # outbox, expiry, notification, SLA jobs
├─ packages/
│  ├─ shared-kernel/               # UUID, Money, UTC Instant, Result, Version
│  ├─ application-kernel/          # UnitOfWork, Clock, IdGenerator, EventBus ports
│  ├─ core/
│  │  ├─ identity/
│  │  ├─ authorization/
│  │  ├─ approval/
│  │  ├─ document/
│  │  ├─ file/
│  │  ├─ audit/
│  │  ├─ notification/
│  │  ├─ sync/
│  │  └─ codes/
│  ├─ features/
│  │  ├─ project/
│  │  ├─ vendor/
│  │  ├─ contract/
│  │  ├─ quality/
│  │  ├─ change/
│  │  ├─ purchase/
│  │  ├─ rnd/
│  │  ├─ research-note/
│  │  ├─ safety/
│  │  └─ tech-copy/
│  ├─ processes/                   # cross-feature application orchestration
│  │  ├─ formal-research-designation/
│  │  ├─ vendor-acceptance-payment/
│  │  ├─ purchase-receipt-inspection/
│  │  └─ controlled-copy-delivery/
│  ├─ infrastructure/
│  │  ├─ postgres/
│  │  ├─ supabase-auth/
│  │  ├─ supabase-storage/
│  │  ├─ notification-adapters/
│  │  ├─ pdf-renderer/
│  │  └─ offline-dexie/
│  ├─ ui/                          # accessible shared UI primitives/tokens
│  └─ test-support/
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/                  # single SQL source of truth
│  ├─ seed.sql                     # local/test data only
│  └─ tests/                       # RLS, constraints, migration checks
├─ tests/
│  ├─ architecture/
│  ├─ integration/application/
│  ├─ integration/postgres/
│  ├─ integration/rls/
│  ├─ contract/
│  ├─ e2e/internal/
│  ├─ e2e/vendor/
│  ├─ e2e/pwa/
│  ├─ e2e/controlled-print/
│  └─ fixtures/
├─ docs/adr/
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ package.json
```

`features/allowance`, `features/equipment`, `features/ip`, 검색 전용 package와 Hiworks adapter는 각각 P1/P2까지 만들지 않는다. 논리 ERD와 공개 확장점만 보존한다.

## 3. 모듈 내부 규격

모든 Core/Feature package는 같은 모양을 사용한다.

```text
packages/features/project/
└─ src/
   ├─ domain/
   │  ├─ aggregates/
   │  ├─ entities/
   │  ├─ value-objects/
   │  ├─ policies/
   │  ├─ events/
   │  └─ errors/
   ├─ application/
   │  ├─ commands/
   │  ├─ queries/
   │  ├─ ports/
   │  └─ dto/
   ├─ public.ts                    # 다른 모듈의 유일한 import entry
   └─ index.ts                    # package export only
```

Feature package에는 React, Next.js, Supabase, 구체 DB query, Storage/PDF SDK를 넣지 않는다.

## 4. 의존성 규칙

```text
shared-kernel
      ↑
domain
      ↑
application ← core public contracts
      ↑
processes
      ↑
interface
      ↓
composition root → infrastructure adapters
```

- Domain은 `shared-kernel`과 같은 모듈 Domain만 import한다.
- Feature Application은 같은 Feature Domain과 Core의 `public.ts`만 import한다.
- Feature 간 내부 import와 직접 테이블 갱신은 금지한다.
- 여러 Feature를 함께 갱신하는 흐름은 `processes`가 공개 Use Case/Port를 하나의 UnitOfWork로 조정한다.
- Infrastructure는 Application Port를 구현하지만 Domain 정책을 복제하지 않는다.
- `apps/web/src/composition`과 `apps/worker`만 구체 Adapter를 조립한다.
- UI에는 Aggregate/Repository가 아니라 직렬화된 Presenter DTO만 전달한다.
- ESLint boundary 규칙과 `tests/architecture`가 금지 import와 SDK 누수를 검사한다.
- 다른 package는 `package.json`의 공개 export만 사용할 수 있고 `src/**` deep import는 금지한다.
- `infrastructure/postgres`는 verified-subject bootstrap용 `./identity-resolver`, 업무 request용 `./request`, background job용 `./worker` export를 분리한다. Identity resolver와 worker 자격증명을 web interface에 주입하지 않는다.
- `infrastructure/supabase-storage`는 일반 File port용 `./public`과 service-role backup/restore용 `./service` export를 분리한다. `./service`는 Worker에서만 조합하고 Web source에서 import하지 않는다.

## 5. App Router 구조

```text
apps/web/src/app/
├─ layout.tsx
├─ global-error.tsx
├─ not-found.tsx
├─ (auth)/
│  └─ login/page.tsx
├─ (internal)/
│  └─ app/
│     ├─ layout.tsx
│     ├─ page.tsx
│     ├─ approvals/
│     ├─ projects/
│     │  ├─ page.tsx
│     │  ├─ new/page.tsx
│     │  └─ [projectId]/
│     │     ├─ page.tsx
│     │     ├─ wbs/
│     │     └─ formal-designation/
│     ├─ documents/
│     ├─ vendors/
│     ├─ contracts/
│     ├─ quality/
│     ├─ changes/
│     ├─ purchases/
│     ├─ rnd/
│     ├─ research-notes/
│     ├─ safety/
│     └─ controlled-copies/
├─ (vendor)/
│  └─ vendor/
│     ├─ layout.tsx
│     ├─ projects/
│     ├─ contracts/
│     ├─ deliverables/
│     └─ inspections/
└─ api/
   ├─ health/live/route.ts
   ├─ health/ready/route.ts
   ├─ v1/sync/commands/route.ts
   ├─ v1/files/[attachmentId]/delivery/route.ts
   ├─ v1/controlled-copies/[copyId]/render/route.ts
   ├─ v1/push/subscriptions/route.ts
   └─ webhooks/[provider]/route.ts
```

Route group은 레이아웃 경계일 뿐 권한 경계가 아니다. 모든 Query/Command에서 trusted `ActorContext`, Permission, Scope, security level, workflow state를 재검사한다.

## 6. Next.js 경계

| 경계 | 용도 | 금지 |
|---|---|---|
| Server Component | 내부 페이지 조회, Application Query 직접 호출 | 내부 API를 다시 HTTP 호출 |
| Server Action | UI mutation과 form/DTO 검증 | Repository/SDK 직접 호출, 읽기용 남용 |
| Route Handler | PWA sync, webhook, binary 전달, PDF streaming, push, 외부 API | 일반 내부 CRUD 우회 API |
| Client Component | 상호작용, Dexie, Service Worker, 로컬 draft | async component, 비밀/DB 접근 |

- 기본 runtime은 Node.js다. Edge runtime은 사용하지 않는다.
- 날짜는 ISO 문자열, 금액은 decimal 문자열, 상태는 stable ID로 직렬화한다.
- 정확한 Next.js version을 lock할 때 v16 이상이면 `proxy.ts`, 이전 지원 버전이면 `middleware.ts` 명칭을 사용한다.
- 거대한 공용 `actions.ts` 대신 `interface/server-actions/<module>/*.action.ts`로 분리한다.

## 7. DB와 보안 구조

- Migration은 package별로 분산하지 않고 `supabase/migrations`에 전역 순서로 둔다.
- 각 업무 migration은 table/constraint/index와 RLS enable/deny-first policy를 함께 만든다.
- production 기준코드·정책 버전은 migration, local/test 예시는 `seed.sql`에 둔다.
- 일반 request DB adapter와 service-role worker adapter를 분리한다.
- service-role adapter는 request container에 주입하지 않는다.
- 내부/외주 Scope는 분리한다. 외주 Scope는 `vendor_user_id`와 exact Project/Contract FK를 사용한다.
- Position/Role/Scope는 유효기간·부여/회수자·사유가 있는 이력으로 저장하고 Approval 참가자에는 당시 snapshot을 남긴다.
- DocumentVersion은 `sealed`와 `approved`를 별도 상태/시각으로 구분한다.

### Approval subject 연결

자유 `subject_type + subject_id`만으로 핵심 결재 FK를 표현하지 않는다. 공통 Instance와 typed link table을 함께 사용한다.

```text
approval_instance
approval_subject_document
approval_subject_research_project_application
approval_subject_purchase_request
approval_subject_contract
approval_subject_tech_access_request
approval_subject_acceptance_payment_decision
```

구체 subject adapter가 같은 transaction 안에서 봉인·상태전이·감사를 처리한다.

M04의 최초 물리 adapter는 `approval_subject_policy_version`이다. 이는 ApprovalPolicyVersion의 SEALED→PUBLISHED 자체승인 bootstrap 용도이며 composite FK로 exact version/checksum을 고정한다. 이후 `approval_subject_document` 등은 해당 aggregate가 도입되는 migration에서 실제 typed FK와 함께 추가한다. 모든 adapter는 `assertExactVersion`, 같은 root의 더 높은 version을 확인하는 `assertResubmissionLineage`, `applyApprovalOutcome` 계약을 구현한다.

## 8. P0 물리 구현 경계

| 모듈 | P0 물리 구현 |
|---|---|
| Project | Project, Product link, 자유계층 WBS, 정식 연구과제 신청/소장 동의 |
| Quality | Requirement, TestPlan/Result, Inspection checklist/score/payment, NCR/CAR |
| Change | ECR/ECO와 적용/재검증; BOM link는 후속 확장점만 |
| Purchase | Supplier, Item, 구매요청/결재/입고/검수; BOM 제외 |
| R&D | 예산·집행·증빙·마감; 회계·송금 제외 |
| ResearchNote | 경량 작성/검토/소장확정/PDF 증빙 |
| Safety | 담당자, 주·월 점검, 교육, 사고·48시간 조사; MSDS/폐기물/훈련 제외 |
| TechCopy | L3/L4 결재, 워터마크, 사본번호, 내부출력·인계·회수/파기 |

P1/P2용 Port/typed link는 둘 수 있지만 빈 메뉴, 추측 table, 임시 JSON 저장은 만들지 않는다.

### P0 사용자 화면 셸

`P0-UI-COMPLETION-V1`은 기존 App Router를 다음 공통 셸에 결합한다.

- 모바일 `< 1024px`: 상단 앱 바 + 하단 주요 메뉴 + 계층형 전체 메뉴 drawer
- PC `>= 1024px`: 같은 stable route 목록을 쓰는 왼쪽 고정 사이드바
- 대시보드: 미승인 고급 KPI 없이 개인 결재·할 일·프로젝트 진행·최근 알림의 최소 현황
- 결재 하위 route: `/approvals`, `/approvals/submitted`, `/approvals/completed`, `/settings/approval`
- 공통 route state: `loading.tsx`, `error.tsx`, `not-found.tsx`

Client AppShell은 내비게이션과 브라우저 연결상태만 담당한다. 업무 데이터 조회와 권한 판정은 Server Component/Application Query 및 DB policy에 남으며 UI 메뉴 숨김을 권한으로 사용하지 않는다.

## 9. 구현 전 ADR

- `ADR-001`: 이 workspace/package 구조와 import boundary.
- `ADR-002`: query implementation과 SQL-first migration 규칙.
- `ADR-003`: typed Approval subject link와 subject adapter transaction.
- `ADR-004`: request DB principal/JWT 대 transaction-local actor context, service-role 격리.
- `ADR-005`: Tiptap schema/render version.
- `ADR-006`: worker runner와 notification outbox.
- `ADR-007`: Dexie cache allowlist와 sync conflict schema (`OD-018`).
- `ADR-008`: L3/L4 watermark PDF와 controlled-copy custody.

## 10. 구조 승인과 실제 생성의 구분

이 문서는 승인된 scaffold 명세다. 2026-08-21 Development Gate 승인에 따라 `M00`에서 ADR을 확정하고 `M01`에서 이 트리를 실제로 생성했다. M01의 업무 package는 공개 계약 shell만 제공하며 실제 Domain/Application 구현은 각 package의 지정 merge item에서 시작한다. DB migration과 Supabase 연결은 M02 이후에만 추가한다.
