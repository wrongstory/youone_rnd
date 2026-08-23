# P1 Workstreams and Merge Order

- 문서 ID: `P1-WORKSTREAMS-V0.1`
- 상태: `APPROVED_PLAN`
- 추적 이슈: GitHub `#48`

## 1. Gate와 병합 원칙

이 문서는 향후 역할/소유권 계획이다. P0 `dev → main` 승격과 `OD-037` 승인 전에는 아래 구현 agent를 시작하거나 P1 package/table/route/menu/migration을 만들지 않는다.

- 모든 branch는 `dev`에서 `codex/` prefix로 생성하고 PR은 `dev`를 대상으로 한다.
- Root Integration/Release가 shared public contract, composition, ADR, cross-feature E2E와 최종 merge를 소유한다.
- Platform/Security만 `supabase/migrations`를 작성한다.
- 같은 module/path를 두 active agent가 동시에 편집하지 않는다.
- 준비는 병렬 가능하지만 merge는 `P1-M00 → P1-M07` 순서다.

## 2. 역할별 소유권

| Workstream | 소유 범위 | 쓰기 금지/협업 경계 |
|---|---|---|
| Root Integration/Release | workspace, ADR, composition, public contract review, shared docs, E2E, release PR | Feature 내부 entity/repository 직접 결합 금지 |
| Platform/Security | Identity/AuthZ/Audit extension, PostgreSQL/RLS, migration, search security/purge, recovery | Feature policy를 임의 결정 금지 |
| Product/Change | `feature.purchase` BOM, Item/ECR/ECO/Deliverable public links | migration 직접 작성 금지 |
| Equipment/Quality | `feature.equipment`, calibration/usage/custody, Quality snapshot port | Quality 내부 repository import 금지 |
| Safety | `feature.safety` MSDS/material/waste/emergency extension | P0 incident/training aggregate 복제 금지 |
| Allowance/R&D | `feature.allowance`, Project/R&D policy/calculation/export ports | 지급/송금/급여 원장 구현 금지 |
| Search/Experience | `feature.search`, source projection ports, PWA approved commands, notifications, mobile integration | search hit를 authorization으로 사용 금지 |

## 3. 순차 이슈 초안

### `P1-M00` Gate·구조·공개계약

- 승인된 delta를 P0 정본에 병합하고 ADR-011을 Accepted로 전환한다.
- stable entity/action/state/event/projection ID registry를 확정한다.
- package/route/menu 후보, public port, migration 요구 packet과 테스트 행렬을 확정한다.
- 제품 Feature 구현/migration은 하지 않는다.

완료선: P0 release promotion + 사용자 `OD-037` 승인 + P1-M01 착수 허용.

### `P1-M01` BOM

- Item 기반 Bom/BomVersion/Line/Alternate/Applicability/AsBuilt snapshot.
- exact typed Approval subject와 ECR/ECO before/after link.
- Vendor assigned projection은 exact Project+Contract+assignment+effective BomVersion과 제한 field로 추가.
- state/concurrency/immutability/RLS/forbidden-field tests.

### `P1-M02` 연구장비·교정

- Equipment/CalibrationPolicyVersion/Record/Usage/Checkout/Maintenance.
- 만료 사용 기본 차단과 versioned exception policy + exact equipment/purpose/interval + canonical Approval의 제한 예외.
- TestResult equipment/calibration snapshot public port.
- due/expiry notification과 custody/concurrency tests.

### `P1-M03` 안전관리 확장

- Substance/MSDSVersion, material lot/ledger, Waste handover/disposal, Emergency plan/drill/action.
- P0 Safety assignment/inspection/training/incident 재사용.
- Vendor assigned safety projection과 retention/source evidence.

### `P1-M04` 연구수당

- Project policy version, participation/evaluation, calculation/adjustment/approval.
- person/month 다과제 합산, tax/wage separation, generic payroll-review export.
- actual payment/transfer 없음; amount/tax field isolation tests.

### `P1-M05` 권한필터 통합검색

- approved source/field/security policy와 derived index.
- live source reauthorization, projection, audit, revoke purge/reindex.
- 첫 P1 release는 6개 source entity군의 명시 metadata-only; L1/L2 body는 `OD-038` 전 deny; Vendor/L3/L4 body hard deny.

### `P1-M06` PWA·알림·모바일 통합

- command-specific ADR이 승인된 장비/안전 draft capture만 offline allowlist; 실제 state transition은 전부 online-only.
- calibration/MSDS/drill/allowance due in-app notification.
- 375px empty/loading/error/forbidden/offline/conflict flow.

### `P1-M07` 보안·이관·릴리즈 Gate

- clean DB/P0 release fixture upgrade, forward-fix, DB+Storage recovery.
- internal/vendor/disabled/expired/cross-scope RLS·projection·audit·concurrency.
- search purge/cache, PWA install/offline, Staging E2E, critical/high zero.
- 별도 사용자 승인 `dev → main` release promotion.

## 4. Handoff packet

각 workstream은 다음을 PR/인수인계에 포함한다.

- requirement/decision/state/action/event/projection IDs;
- 변경한 public contracts와 의존성;
- table/FK/check/index/RLS/guarded-function 요구사항(Feature는 migration 파일 미작성);
- authorization/Scope/field-redaction 규칙;
- state/precondition/concurrency/audit/outbox 규칙;
- tests run과 changed files;
- unresolved decisions, residual risk, rollback/forward-fix;
- 다음 merge item이 알아야 할 compatibility note.

## 5. 공통 Definition of Done

- Domain/Application/Infrastructure/Interface/Test 수직 슬라이스;
- P0 전체 회귀 통과;
- exact state transition과 immutable evidence;
- app + DB Vendor isolation/forbidden-field tests;
- clean/P0 fixture migration verification;
- no raw secrets/object key/public URL in logs/artifacts;
- affected canonical docs와 `PROJECT_MEMORY.md` 동기화;
- PR/issue 제목·본문·검증 결과를 한글로 기록.
