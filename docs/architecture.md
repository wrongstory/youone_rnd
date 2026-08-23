# Architecture

## 1. 결정 요약

본 시스템은 약 30명 규모에 맞춘 **모듈러 모놀리스(modular monolith)** 로 시작한다. 한 배포 단위 안에서도 Core와 Feature Module, 도메인과 공급자 Adapter를 분리한다. 초기 인프라는 Supabase Auth/PostgreSQL/Storage를 사용하지만, 화면이나 도메인 규칙이 Supabase SDK에 직접 결합되지 않게 한다.

핵심 결정 ID:

| ID | 결정 |
|---|---|
| `ARC-001-MODULAR-MONOLITH` | 독립 마이크로서비스가 아닌 모듈러 모놀리스로 시작한다. |
| `ARC-002-HEX-BOUNDARY` | Interface → Application → Domain 방향으로 의존하고 Infrastructure가 Port를 구현한다. |
| `ARC-003-SERVER-AUTHZ` | 권한·Scope·필드 노출·상태전이는 신뢰된 서버 경계에서 검사한다. |
| `ARC-004-RLS-DEFENSE` | Postgres RLS를 2차 방어선으로 적용한다. |
| `ARC-005-NO-UI-SUPABASE` | UI에서 업무 테이블·Storage를 Supabase SDK로 직접 호출하지 않는다. |
| `ARC-006-IMMUTABLE-EVIDENCE` | 승인본·확정 연구노트·감사이력은 append-only/immutable 규칙을 갖는다. |
| `ARC-007-OFFLINE-ALLOWLIST` | 오프라인 기능은 허용된 명령만 로컬 Outbox에 저장한다. |
| `ARC-008-PROVIDER-PORTS` | Auth, Storage, Notification, Integration을 Port/Adapter로 분리한다. |
| `ARC-009-TYPED-WORKFLOW` | 상태와 전이를 명시적으로 모델링하고 자유 문자열 상태를 금지한다. |
| `ARC-010-TRANSACTIONAL-AUDIT` | 업무 전이, 전이이력, 감사이벤트를 하나의 DB 트랜잭션으로 기록한다. |
| `ARC-011-NEXT-APP-ROUTER` | Next.js App Router + TypeScript, 기본 Node.js runtime을 Web/BFF 기준으로 채택한다. |
| `ARC-012-SQL-FIRST-MIGRATION` | Supabase CLI의 검토 가능한 SQL migration을 DB 정본으로 사용한다. |

## 2. 시스템 컨텍스트

```mermaid
flowchart LR
  Internal[내부 사용자] --> Web[PWA Web App]
  Vendor[외주업체 사용자] --> Web
  Web --> App[Trusted Application Boundary]
  App --> Auth[Auth Port]
  App --> Repo[Repository Ports]
  App --> Files[Storage Port]
  App --> Notify[Notification Port]
  App --> Integrate[Integration Ports]
  Auth --> SupaAuth[Supabase Auth Adapter]
  Repo --> PG[(PostgreSQL + RLS)]
  Files --> SupaStorage[Private Supabase Storage]
  Notify --> Channels[In-app / Push / Email]
  Integrate -. future .-> External[Hiworks / RCMS / e나라도움 / TP]
```

`Trusted Application Boundary`는 Next.js App Router의 기본 Node.js 서버 런타임이다. 내부 조회는 Server Component에서 Application Service를 호출하고, UI mutation은 Server Action, 외부 API·Webhook·PWA sync endpoint는 Route Handler를 사용한다. 브라우저는 표시용 공개키를 사용한 Auth 세션 처리 외에 핵심 업무 DB를 직접 조작하지 않는다.

## 3. 계층과 의존성

```text
interface/
  web, route handlers, server actions, API DTO, presenters
application/
  use cases, authorization service, transaction boundary, ports
domain/
  aggregates, entities, value objects, policies, transitions, events
infrastructure/
  supabase auth, postgres repositories, storage, mail/push, integrations
```

의존 규칙:

- Domain은 Next.js, React, Supabase, HTTP, Storage SDK를 import하지 않는다.
- Application은 Domain과 Port만 안다.
- Infrastructure는 Application Port를 구현한다.
- Interface는 사용자 입력을 검증하고 Use Case를 호출하지만 정책을 복제하지 않는다.
- DB enum/check/foreign key/RLS는 도메인 규칙의 방어선이며 유일한 규칙 저장소가 아니다.
- 공급자 교체는 Adapter 교체를 목표로 하며 PostgreSQL의 관계형 무결성을 억지로 추상화하지 않는다.

## 4. 모듈 구조

### Core

| 모듈 ID | 책임 | 금지 |
|---|---|---|
| `core.identity` | User, Organization, Department, Position, Role, Permission | 업무 승인권 자동 추론 금지 |
| `core.authorization` | ActorContext, Scope, policy evaluation, field projection | UI 메뉴를 권한 근거로 사용 금지 |
| `core.approval` | ApprovalPolicy, Instance, Step, Participant, delegation | 문서 본문을 직접 소유하지 않음 |
| `core.document` | Template, Document, DocumentVersion, rendering, retention | 승인본 덮어쓰기 금지 |
| `core.file` | Attachment metadata, hash, private delivery | 장기 공개 URL 저장 금지 |
| `core.audit` | append-only security/business audit events | 일반 CRUD 수정/삭제 금지 |
| `core.notification` | in-app/push/email outbox and preferences | 업무 상태의 원본이 되지 않음 |
| `core.sync` | offline command allowlist, outbox, conflict record | last-write-wins 금지 |
| `core.codes` | 안정된 코드/표시 라벨, 정책 버전 | 핵심 상태를 임의 문자열로 추가 금지 |

### Feature Modules

| 모듈 ID | 핵심 Aggregate |
|---|---|
| `feature.project` | Product, Project, ProjectMember, WbsNode, Requirement |
| `feature.quality` | TestPlan, TestResult, Inspection, InspectionAttempt, NCR, CAR |
| `feature.vendor` | Vendor, VendorUser, ProjectScope |
| `feature.contract` | VendorContract, ContractMilestone, Deliverable, Guarantee, WarrantyIssue |
| `feature.change` | ChangeRequest(ECR), ChangeOrder(ECO) |
| `feature.purchase` | Supplier, Item, BOM, PurchaseRequest, PurchaseResolution, Receipt, PurchaseInspection |
| `feature.rnd` | RndProgram, Budget, Expenditure, Evidence, Deadline |
| `feature.research-note` | ResearchNote, correction/addendum, evidence export |
| `feature.safety` | SafetyManagerAssignment, SafetyInspection/Finding, Training/Attendance, SafetyIncident/Investigation; HazardousMaterial/WasteLog/Drill are P1 ports only |
| `feature.allowance` | ProjectAllowancePolicyVersion, eligibility/tax snapshots, evaluation, calculation decision, payroll export reference |
| `feature.tech-copy` | L3/L4 controlled print rendering, numbered copy, handover, return/destruction evidence |

Feature 간 직접 테이블 수정은 금지한다. 예를 들어 검수 합격이 지급 가능 상태에 영향을 주면 `InspectionAccepted` 도메인 이벤트를 Application 계층이 받아 ContractMilestone Use Case를 호출한다.

## 5. 요청 처리와 권한

```mermaid
sequenceDiagram
  actor U as User
  participant I as Interface
  participant A as Application Service
  participant Z as Authorization
  participant R as Repository
  participant D as PostgreSQL/RLS
  U->>I: command/query
  I->>A: validated DTO + session
  A->>Z: build trusted ActorContext
  Z-->>A: roles + position + scopes + grants
  A->>Z: authorize(action, resource, context)
  Z-->>A: allow + field projection / deny
  A->>R: scoped operation
  R->>D: parameterized query / transaction
  D-->>R: RLS-filtered result
  R-->>A: domain data
  A-->>I: projected response
  I-->>U: permitted view
```

목록 허용과 상세 허용을 분리한다. 특히 외주 계약 목록 DTO에는 금액·지급 필드가 존재하지 않는다. 상세 조회는 `contract.detail.finance.read` 권한과 정확한 vendor/contract Scope를 모두 만족할 때만 해당 필드를 투영한다.

M03의 request composition은 Supabase가 서버에서 검증한 subject/expiry/session/AAL만 인증 증거로 사용하고, Role·Position·Vendor·Scope는 user metadata나 request body가 아니라 현재 DB 레코드에서 다시 구성한다. 검증된 subject의 서버 snapshot은 ordinary request role이 호출할 수 없는 전용 NOBYPASSRLS `youone_identity_resolver` 경계에서만 읽는다. 검증 팩토리가 만든 명목상 `TrustedActorContext`만 request PostgreSQL UnitOfWork에 전달할 수 있다. Supabase request adapter와 privileged service/secret adapter는 서로 다른 export이며, web request interface는 privileged adapter를 import할 수 없다.

Authorization은 boolean만 반환하지 않는다. 결정에는 stable reason, 사용한 Scope/assignment evidence, 서버가 등록한 projection profile ID/version, audit·재인가·step-up 같은 obligation을 포함한다. 실제 Project/Contract/DocumentVersion FK가 생기기 전에는 generic resource UUID Scope table을 만들지 않으며, M05/M06/M07 migration이 typed FK와 RLS를 함께 추가한다.

Actor, Resource Context, Projection은 모두 factory provenance를 런타임에 검증한다. Feature의 Resource loader가 DB에서 resource ID와 실제 Vendor/Project/Contract/DocumentVersion 관계, workflow/security 판정, Approval participant evidence를 함께 읽는다. 외주 조회는 exact Project/Contract Scope와 action-bound Vendor projection이 없으면 거부하며, owner 또는 Organization Scope를 우회 근거로 사용하지 않는다.

Identity/RBAC 변경은 일반 table write로 열지 않는다. 계정·업체 비활성화와 Vendor membership 부여/회수는 trusted request time, 현재 권한, optimistic version을 검사하고 상태 변경과 M02 Audit을 같은 transaction에 기록하는 guarded function만 사용한다. Acting authority ID도 transaction context에 전달하고 DB가 authenticated/effective actor, 기간, 회수, action set, 공식 승인 role을 재검증한다.

## 6. 데이터와 트랜잭션

- PostgreSQL이 업무 정본이다.
- 각 mutable aggregate root는 `version_no`를 두고 optimistic concurrency를 적용한다.
- 상태전이는 현재 상태와 `version_no`를 조건으로 갱신한다.
- 전이와 `state_transition_history`, `audit_log`, notification outbox를 같은 트랜잭션에서 기록한다.
- M02는 aggregate/action/event/state-machine/state/transition의 빈 registry 구조만 제공한다. 각 업무 migration이 자기 stable code를 등록하며 M02가 미래 업무 상태나 PostgreSQL enum을 임의로 선도입하지 않는다.
- Audit은 stable reason/reference와 before/after hash만 저장하고 범용 JSON payload를 두지 않는다. Outbox JSON은 schema ID/version이 있는 최소 envelope만 허용하며 업무 원문, 전체 before/after row, token, URL, evidence bytes, SQL/stack을 복제하지 않는다.
- 금액은 통화코드와 정밀 Decimal/Numeric으로 저장한다.
- 업무 날짜와 타임스탬프를 구분한다. 타임스탬프는 UTC로 저장한다.
- JSON은 DocumentVersion 편집기 콘텐츠, 공급자 응답 snapshot, 정책 파라미터 중 스키마가 명시된 부분에만 제한적으로 사용한다.
- 승인, 계약, WBS, 검수, NCR/CAR, ECR/ECO의 식별자·관계·상태·책임자는 정규 컬럼/테이블로 저장한다.

## 7. 파일과 문서

- Attachment DB 레코드와 Storage 객체를 분리한다.
- 필수 메타데이터: `storage_provider`, `storage_key`, `mime_type`, `size_bytes`, `sha256`, `version_no`, `security_level`, `created_by`, `created_at`.
- 파일은 private bucket에 저장하고 권한검사 후 짧은 만료의 전달 URL 또는 서버 프록시로 제공한다.
- 기술자료의 미리보기·다운로드 요청은 grant 상태와 조건을 검사하고 성공/실패를 감사한다.
- L3/L4 외부 전달은 원문 파일이나 수신자 자체 출력이 아니라 내부 서버가 생성한 사본번호별 워터마크 PDF를 내부 권한자가 직접 출력하는 파이프라인을 거친다.
- 출력물 인계, 수령확인, 회수/파기와 승인 인스턴스를 `technical_document_copy`에 기록한다. L3는 연구소장, L4는 연구소장+대표 승인 없이는 렌더링·출력할 수 없다.

## 8. Approval과 Document 결합

- 업무 모듈은 자유 문자열 subject를 전달하지 않는다. 공개 `TypedApprovalSubjectPort`를 구현하고 exact typed FK, version, checksum snapshot을 Approval Engine에 전달한다.
- Approval Instance는 결재선 snapshot과 정책 version을 보존한다.
- 결재 명령은 domain mutation, exact subject 재검증, optimistic save, append-only action/audit/outbox, subject outcome을 하나의 application UnitOfWork에서 처리한다.
- 최종 승인 시 adapter가 exact subject version을 immutable outcome으로 전환한다.
- 반려 후 수정은 새 DocumentVersion을 만든다.
- 회수·반려 후 재상신은 이전 Instance를 보존하고 새 generation으로 연결한다. subject adapter는 같은 업무 root와 더 높은 새 immutable version을 검증한다.
- Approval Engine은 계약·구매·기술자료 접근·기술문서 삭제 등 여러 업무가 재사용하지만 각 도메인의 전이조건을 대신하지 않는다.

M04는 순환 의존 없이 엔진 자체를 승인하기 위한 최초 typed adapter로 `APPROVAL_POLICY_VERSION`을 물리 구현한다. M05는 `DOCUMENT_VERSION` exact composite FK와 Document-owned adapter를 추가하며 Approval Core 내부나 generic polymorphic subject table을 확장하지 않는다. 개인 결재함·상세 및 문서함·상세 화면은 query/command adapter가 연결되지 않으면 가짜 빈 결과나 실행 가능한 버튼을 만들지 않고 명시적 unavailable 상태를 반환한다.

M05의 파일 전달은 `core.file`의 trusted authorization과 `infrastructure.supabase-storage`의 일회성 broker를 통과한다. 브라우저는 Storage SDK, bucket/key 또는 provider signed URL을 직접 받지 않는다. PostgreSQL은 content hash와 봉인 manifest를 다시 계산하고, Supabase Storage 스키마가 존재할 때 `PRIVATE_BUSINESS` 비공개 bucket과 restrictive object policy를 설치한다. 일반 PostgreSQL CI에서는 이 conditional provider branch를 계약 검사하며 실제 Supabase 환경 smoke test는 별도 운영 Gate로 남긴다.

M06는 `features.project`가 Project/WBS 순수 규칙과 application port를 소유하고, `processes.formal-research-designation`이 Project 신청본과 Approval Core의 exact typed subject를 조합한다. Approval Core는 Project 내부 엔티티나 저장소를 import하지 않으며 Project UI도 Supabase SDK나 table에 직접 접근하지 않는다. 일반 Project와 정식 연구과제 지정을 분리하고, formal status는 immutable designation query에서만 파생한다. query adapter가 아직 조립되지 않은 화면은 가짜 빈 목록이나 실행 가능한 명령 대신 명시적 unavailable 상태를 표시한다.

M07는 `features.vendor`와 `features.contract`가 Vendor/Contract/Deliverable 규칙과 application port를 소유한다. ContractVersion은 Approval Core에 exact typed subject adapter로 연결되지만 Approval Core가 Contract 내부 저장소나 엔티티에 의존하지 않는다. Vendor 목록·기본 상세·금융 상세은 서로 다른 public DTO와 DB projection이며, 금융 상세은 기본 DTO에 optional 필드를 추가하는 방식으로 우회하지 않는다. Contract Scope의 생성·회수는 계약 application service가 요청하고 Platform transaction이 상태·감사·outbox와 원자적으로 저장한다.

M08는 `features.quality`가 Requirement/Test/Inspection과 immutable attempt 규칙을 소유하고, `processes.vendor-acceptance-payment`가 exact sealed InspectionAttempt와 Approval Core를 조합한다. Quality는 지급결정 내부 엔티티를 import하지 않고 finalized-inspection public port/event만 발행한다. 계산 달성도·시스템 제안률·조정 요청률·최종 승인률은 서로 다른 필드와 상태로 유지하며, 최종 승인 시 지급정책 버전의 반올림 규칙으로 산출한 지급가능액도 함께 봉인한다. UI·API는 검수 외부판정/내부검수상세/지급판정을 별도 DTO로 노출한다. `ELIGIBLE_FOR_EXTERNAL_PAYMENT`는 외부 지급 가능 표시에 불과하고 송금·회계 adapter를 호출하지 않는다.

M09는 같은 `features.quality` 안에서 NCR/CAR aggregate와 application port를 추가한다. NCR은 exact InspectionAttempt/RequirementRevision/DeliverableVersion/Contract 중 적용 가능한 typed source FK와 정규화된 evidence를 보존하고, 하나 이상의 CAR를 소유한다. 외주용 projection에는 책임 할당, 수행에 필요한 시정 범위·기한·외부 evidence만 포함하며 내부 책임검토, 계약구제 검토, 내부 메모는 포함하지 않는다. UI는 Supabase SDK나 테이블을 직접 호출하지 않고 query adapter가 미연결이면 가짜 빈 목록 대신 `UNAVAILABLE`을 반환한다.

NCR/CAR 명령은 trusted ActorContext, exact VendorMembership 및 Project/Contract Scope, 책임 할당, 현재 상태와 optimistic version을 검증한다. 상태 변경, append-only transition/audit/outbox, evidence link는 한 transaction에 기록한다. 독립 효과검증은 CAR owner·실행자와 다른 내부 검증자만 수행하며, 종료·재개방은 과거 검증과 전이를 수정하지 않는다. M09는 계약 상태를 직접 변경하지 않고 M10 ECR/ECO 또는 계약구제 검토가 필요한 사실만 typed event/port로 전달한다.

M10은 `features.change`가 ECR/ECO aggregate, impact snapshot, exact typed target, implementation 및 reverification application port를 소유한다. Approval Core에는 `CHANGE_REQUEST_VERSION`과 `CHANGE_ORDER_VERSION` exact subject adapter만 연결하며, Approval Core가 Change 저장소나 내부 엔티티를 import하지 않는다. ECR의 Senior/technical review는 review evidence일 뿐 공식 Approval action이 아니다.

ECO는 승인된 ECR의 exact version 또는 감사 가능한 EmergencyException version 중 하나를 근거로 생성한다. 대상은 generic `type/id`나 JSON으로 쓰지 않고 DocumentVersion, RequirementRevision, DeliverableVersion, InspectionChecklistVersion, TestPlan, ContractVersion별 typed target relation으로 연결한다. 적용 결과는 항상 새 after-version이며 before-version을 수정하지 않는다. 비용·일정·품질·안전·보안·규제 영향은 모두 명시적으로 분석하거나 `NO_IMPACT` 근거를 남긴다.

계약 범위·금액·납기·검수기준에 영향을 주는 ECO는 별도 서명·발효된 ContractVersion/변경계약 snapshot 없이는 `EFFECTIVE`가 될 수 없다. 적용자와 독립된 내부 검증자가 exact serial/lot/equipment scope와 재시험·재검수 evidence를 확인한다. Vendor 명령은 활성 VendorMembership 및 exact Project/Contract Scope와 할당을 재검증하며, 외주 projection에는 내부 영향검토·결재선·계약금액·법무메모를 포함하지 않는다. BOM은 P1 public extension port만 두고 M10 물리 table/UI를 만들지 않는다.

M11은 `features.purchase`가 Supplier/Item, immutable PurchaseRequestVersion, quotation evidence, PurchaseResolution, external payment fact, line Receipt와 PurchaseInspection을 소유하고, Approval Core에는 exact `PURCHASE_REQUEST_VERSION` subject adapter만 연결한다. 결재 완료는 exact request version과 Approval outcome을 trusted port로 재조회하며, 승인 전 Resolution 생성이나 승인본 덮어쓰기를 허용하지 않는다. 지급은 외부 본사 사실을 기록할 뿐 송금·회계 명령을 제공하지 않는다.

M13은 `features.safety`가 유효기간형 담당 지정, 주/월 점검과 finding/stop-work/correction/verification, 교육·참석·보충교육, 사고·응급조치·현장보존·48시간 내부 조사·재발방지를 소유한다. 안전 상태 변경은 trusted ActorContext, 현재 유효한 SafetyManager/Coordinator assignment, exact Project/Vendor Scope, 낙관적 버전을 한 transaction에서 검증하고 audit/transition/outbox를 함께 기록한다. 48시간 SLA 작업은 idempotency key로 경고만 생성하며 조사 완료를 조작하지 않는다. MSDS·유해물질·폐기물·비상훈련은 P1 public port만 남기고 M13 table·route·menu를 만들지 않는다.

M14는 `features.tech-copy`가 `SM-TECHDOC-COPY-V1` aggregate와 exact request/approval/render/custody 규칙을, `processes.controlled-copy-delivery`가 Document·Approval·Vendor/Project/Contract 공개 Port의 orchestration을 소유한다. `infrastructure.pdf-renderer`는 exact private source Attachment를 읽고 모든 페이지에 동일한 수령인·업체·Project·사본번호·보안등급·발급자·출력시각·목적·재배포 금지 워터마크를 입힌 뒤 private output과 source/output hash·renderer/manifest evidence를 반환한다.

신청은 `TECHNICAL_DOCUMENT_COPY_REQUEST` typed Approval subject로 immutable request checksum에 묶인다. Project-only 외부 수령인은 active VendorMembership과 exact Project grant를, Contract-bound 수령인은 여기에 같은 VendorUser의 exact Contract grant까지 AND로 요구한다. 이 Scope는 request/render/print/handover마다 live 재검증한다. Vendor와 Admin-System에는 source/render/self-print 경로가 없고, 앱 화면은 allowlisted metadata/custody projection만 사용한다.

`features.rnd`는 RndProgram 등록정보, Project N:M, immutable BudgetVersion/Line, Expenditure, Evidence와 Deadline을 소유한다. Vendor는 모든 R&D 예산·집행 projection과 명령에서 거부하며 본사 직원은 별도 정책 확정 전 read-only다. `OD-030`이 열린 동안 Program lifecycle state/event를 registry나 임의 `status`로 만들지 않고, 종료·정산·재개 명령은 명시적으로 fail-closed 처리한다. 두 feature의 UI와 API는 application query/command port만 사용하고 provider SDK나 table에 직접 접근하지 않는다.

M12는 `features.research-note`가 ResearchNote root, exact Entry version, 선택적 Senior review, Lab Director finalization, correction/addendum lineage와 generic PDF evidence manifest 계약을 소유한다. 이 전용 workflow는 공통 Approval Engine의 대표까지 이어지는 기본 결재선을 사용하지 않는다. Senior review는 별도 review evidence이며 공식 approval action이 아니고, finalization은 현재 exact entry snapshot을 대상으로 Lab Director가 수행한다.

확정 Entry와 생성된 PDF manifest는 불변이며 정정은 원본을 수정하지 않고 direct linked correction/addendum Entry로 만든다. PDF renderer는 port 뒤에 있으며 source Attachment는 private exact tuple로만 참조한다. UI/API는 allowlisted metadata projection만 받고 editor source, Storage bucket/key, public/signed URL 또는 Admin-System의 자동 원문열람 capability를 노출하지 않는다.

## 9. PWA와 오프라인

오프라인 허용 명령:

- `CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT` 체크리스트 초안.
- `CMD-OFFLINE-INSPECTION-DRAFT-UPSERT` 검수 초안.
- `CMD-OFFLINE-FIELD-NOTE-DRAFT-UPSERT` 현장노트 초안.
- `CMD-OFFLINE-WORK-ITEM-PROGRESS-UPDATE` 허용된 작업항목 진행률 변경.
- `CMD-OFFLINE-FIELD-RECORD-DRAFT-UPSERT` 현장기록 초안.

온라인 전용:

- 결재·합의·전결·대결.
- 역할/권한/Scope 변경.
- L2~L4 외부 기술자료 접근 및 민감 원문 열람.
- 기술문서 삭제 승인.
- 계약 체결/해지와 지급확정 같은 고위험 전이.

M15는 Dexie `4.4.5`를 통해 IndexedDB에 위 명령의 `offline_outbox`, 로컬 초안, 첨부 staging metadata, 충돌과 `CACHE-PROJECT-LIST-SAFE`·`CACHE-WBS-LIST-SAFE`·`CACHE-SAFETY-CHECKLIST-TEMPLATE`만 저장한다. bearer token·raw session ID·민감 원문은 저장하지 않고 현재 사용자와 세션의 SHA-256 binding으로 재생 대상을 제한하며, 세션 교체/로그아웃 시 해당 binding의 payload를 제거한다.

명령에는 immutable `command_id`, stable command type, authenticated/effective actor, session binding hash, aggregate ID/type, `base_version`, schema version, UTC 생성시각, canonical minimized payload와 SHA-256을 포함한다. `/api/v1/sync/commands`는 현재 서버 세션으로 `TrustedActorContext`를 다시 만들고 등록된 정상 Application handler에 권한·Scope·상태·precondition·낙관적 버전 검사를 위임한다. M16 live request adapter 조합 전에는 endpoint가 `503 SYNC_REQUEST_ADAPTER_NOT_CONFIGURED`로 fail-closed한다. 서버 version이 다르면 양쪽 payload를 보존한 `SYNC_CONFLICT`를 만들고 자동 적용하지 않으며, 승인된 field merge 정책이 없는 P0에서는 `DISCARD_LOCAL` 또는 최신 server version을 기준으로 새 명령을 만드는 `RETRY_AS_NEW`만 기록한다.

M16 request boundary는 Bearer session과 provider가 발급한 non-empty `session_id`를 요구하고, 서버 DB에서 현재 identity/permission/Scope를 다시 읽는다. actor/vendor/project/contract/scope를 body 값으로 조립하지 않는다. live DB/Auth/command-handler adapter가 모두 실제 조합되기 전 readiness는 `503 not_ready`이며 환경변수 존재만으로 준비 상태를 선언하지 않는다. 상세 운영·복구·사고대응 및 production activation blocker는 `docs/security-operations.md`를 정본으로 한다.

## 10. 배포 구조

### 초기 권장

- Web/Application: Node.js 호환 Next.js App Router 배포.
- DB/Auth/File: Managed Supabase.
- Background worker: 별도 worker 프로세스 또는 검증된 scheduler/queue adapter.
- Environments: local, staging, production 분리.
- Observability: 구조화 로그, request/actor correlation ID, error monitoring, security audit.
- Backup: DB와 Storage manifest를 함께 검증하는 복구훈련.

### 온프레미스 경로

첫 이전 후보는 PocketBase 재작성보다 **PostgreSQL 데이터 모델을 유지하는 self-hosted Supabase 또는 표준 PostgreSQL + 대체 Auth/Storage Adapter** 다. Supabase 공식 문서는 Docker self-hosting을 지원하지만 운영·보안·백업·HA 책임이 사용자에게 있다고 명시한다. 따라서 온프레미스 전환은 단순 설정 변경이 아니라 별도 운영 프로젝트로 취급한다.

## 11. 승인된 기술스택 기준

사용자가 2026-08-21 추천 기술스택 진행을 승인했다. 의존성의 정확한 버전은 스캐폴딩 시 공식 지원범위와 lockfile로 고정한다.

`M01` 초기 lock 기준은 Node.js `24.19.0` LTS, pnpm `11.19.0`, Next.js `16.3.2`, React `19.2.8`, TypeScript `5.9.3`, Turborepo `2.10.11`, Vitest `4.1.11`이다. ESLint는 Next.js 간접 플러그인의 선언된 peer 범위를 지키기 위해 `9.39.5`로 고정하며, 플러그인이 ESLint 10을 공식 지원한 뒤 별도 upgrade 검증을 수행한다.

| 영역 | 채택 기준 | 이유 | 경계/조건 |
|---|---|---|---|
| Web/BFF | Next.js App Router + TypeScript | 반응형 UI와 trusted server boundary를 한 코드베이스에서 운영 가능 | React SPA + Fastify/NestJS는 API 조직 분리가 더 중요할 때 |
| UI | React + 접근성 있는 headless component primitives + CSS tokens | 모바일/데스크톱 공통 디자인 시스템 | 특정 UI kit는 시안 검토 후 선택 |
| Validation | Zod 또는 동등한 schema validator | DTO와 offline payload version 검증 | 서버/클라이언트 schema 생성전략 검토 |
| DB | PostgreSQL | 관계·무결성·트랜잭션·RLS가 핵심 요구에 적합 | PocketBase는 후속 대안이나 복잡한 관계/RLS 재설계 비용이 큼 |
| Backend provider | Supabase Auth/Postgres/Storage | 사용자 지정 초기 인프라와 일치 | self-hosted Supabase 또는 독립 Adapter 조합 |
| Data access | 명시적 Repository + SQL/migration layer | 공급자 SDK 누수 방지와 정밀한 쿼리/트랜잭션 | ORM은 migration/enum/RLS/SQL 검토가 가능한 도구만 선정 |
| Editor | Tiptap JSON schema editor | 표·이미지·체크리스트·확장 node와 snapshot 저장 가능 | 실시간 협업은 P0 제외; schema version 필수 |
| Offline | Service Worker + IndexedDB/Dexie + 자체 sync protocol | 허용 명령, outbox, conflict UI를 명시적으로 통제 | 범용 양방향 sync 제품은 사용하지 않음 |
| Test | Vitest + Playwright + Postgres/RLS integration tests | 도메인·브라우저·DB 정책을 모두 검증 | 동일 범위를 만족하는 대안 가능 |
| Runtime | Next.js 기본 Node.js runtime | DB, 암호화, 파일 렌더링과 패키지 호환성 | 명확한 지연 요구와 호환성 검증 없이는 Edge 사용 금지 |
| Package/DB change | pnpm + Supabase CLI SQL migrations | 재현 가능한 lockfile과 RLS/constraint 검토 | ORM 생성 migration이 정본 SQL을 우회하면 안 됨 |

현재 공식 문서 기준으로 Next.js는 App Router를 최신 기능 경로로 안내하고 PWA 가이드를 제공한다. Supabase는 공개 스키마 테이블의 RLS 사용과 Storage RLS를 공식적으로 지원한다. Dexie는 브라우저 IndexedDB wrapper다. 이 근거와 사용자의 F.1 결정으로 기술 방향은 확정됐으며, 버전 고정은 구현 Gate 후 수행한다.

공식 참고:

- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js 설치 및 현재 요구사항](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase Self-Hosting](https://supabase.com/docs/guides/self-hosting)
- [Dexie.js documentation](https://dexie.org/docs)
- [Tiptap editor documentation](https://tiptap.dev/docs/editor/getting-started/overview)

## 12. Accepted Architecture Decision Records

- `ADR-001`: workspace and module boundaries.
- `ADR-002`: SQL-first repositories and migrations.
- `ADR-003`: typed Approval subject links and adapters.
- `ADR-004`: request DB principal and transaction-local ActorContext.
- `ADR-005`: Tiptap editor schema and rendering versions.
- `ADR-006`: worker runner and transactional outbox.
- `ADR-007`: Dexie offline allowlist and conflict records.
- `ADR-008`: L3/L4 controlled-copy watermark and custody.

## 13. Architecture Gate Checks

- Supabase imports are confined to infrastructure and narrowly scoped session helpers.
- Vendor access is tested at application and RLS layers.
- Approval, DocumentVersion, WBS, Contract, Inspection, NCR/CAR, ECR/ECO remain typed domain objects.
- All core state transitions are enumerated in `docs/state-machines.md`.
- Offline command allowlist excludes sensitive operations.
- No long-lived public Storage URL exists.
- Provider adapters never bypass domain authorization merely because they hold service credentials.
