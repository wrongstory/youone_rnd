# P1 Permissions Delta

- 문서 ID: `P1-PERMISSIONS-DELTA-V0.1`
- 상태: `PROPOSED_FOR_REVIEW`
- 추적 이슈: GitHub `#48`

## 1. 공통 강제 경계

P1은 P0 `AUTHZ-VENDOR-V1`, trusted ActorContext/ResourceContext, action-bound ProjectionProfile, Application authorization와 PostgreSQL RLS/guarded command를 그대로 사용한다.

- actor/user/vendor/project/contract/permission/scope identity를 request field에서 신뢰하지 않는다.
- UI 숨김은 권한이 아니다. list/search/index도 server와 DB에서 같은 deny를 강제한다.
- Vendor는 active account + active VendorMembership + exact active Project/Contract grant + assignment + action-bound projection을 모두 요구한다.
- `Admin-System`은 P1 schema/policy 운영권만 가질 수 있고 L3/L4 source, 연구수당 금액/세무, 내부 안전조사 자동 열람권을 갖지 않는다.
- 공식 Approval action은 exact participant와 Lab Director/Representative 또는 기록된 acting authority만 수행한다. Senior Researcher position은 공식 승인권이 아니다.
- 서비스 역할 작업도 trusted actor/action/resource ALLOW와 audit obligation을 통과한다.

## 2. Stable action IDs

| Module | Action ID | 기본 actor/scope | 비고 |
|---|---|---|---|
| BOM | `bom.list.read` | INTERNAL, Organization/Project | allowlisted metadata |
| BOM | `bom.version.read` | INTERNAL, exact Project/Product | 보안등급 재검증 |
| BOM | `bom.version.create` | authorized INTERNAL, Project/Product | DRAFT만 |
| BOM | `bom.version.submit` | owner/authorized INTERNAL | sealed version |
| BOM | `bom.version.effect` | exact Approval outcome + authorized INTERNAL | 승인본만 |
| BOM | `bom.vendor.assigned.read` | VENDOR, Membership + Project + Contract + assignment | effective approved BOM의 제한 projection |
| Equipment | `equipment.list.read` | INTERNAL, Organization/Department/Project | 보안 필드 projection |
| Equipment | `equipment.manage` | authorized INTERNAL | 장비대장/정비 |
| Equipment | `equipment.calibration.record` | authorized INTERNAL | immutable certificate |
| Equipment | `equipment.usage.record` | assigned INTERNAL | eligible equipment only |
| Equipment | `equipment.checkout.manage` | custodian/authorized INTERNAL | custody evidence |
| Equipment | `equipment.exception.request` | assigned INTERNAL | policy가 없으면 deny |
| Safety | `safety.msds.read` | INTERNAL; assigned VENDOR projection 가능 | exact substance/scope |
| Safety | `safety.msds.manage` | Safety authorized INTERNAL | version/effectivity |
| Safety | `safety.material.record` | Safety authorized INTERNAL | lot/ledger |
| Safety | `safety.waste.manage` | Safety authorized INTERNAL | handover/disposal 분리 |
| Safety | `safety.emergency_plan.manage` | Safety authorized INTERNAL | versioned plan |
| Safety | `safety.drill.manage` | Safety manager/coordinator | schedule/result/action |
| Safety | `safety.vendor.action.read` | assigned VENDOR, exact Scope | instruction/own action only |
| Allowance | `allowance.policy.read` | authorized INTERNAL | amount/tax field 분리 |
| Allowance | `allowance.policy.manage` | authorized INTERNAL | Approval 필요 |
| Allowance | `allowance.evaluation.record` | assigned evaluator | official approval 아님 |
| Allowance | `allowance.calculation.run` | authorized INTERNAL | exact policy/period |
| Allowance | `allowance.adjustment.propose` | authorized INTERNAL | reason 필수 |
| Allowance | `allowance.calculation.approve` | exact Approval participant | Senior position 자체 권한 없음 |
| Allowance | `allowance.export.generate` | approved payroll-review recipient | 지급 명령 아님 |
| Search | `search.metadata.query` | INTERNAL | `OD-010` allowlist |
| Search | `search.body.query` | INTERNAL + approved future policy | P1 첫 release 미등록; L1/L2 후속 결정 전 deny |
| Search | `search.index.manage` | trusted Worker/service | actor/audit 필수 |
| Search | `search.sensitive_result.read` | exact source permission/scope | delivery-time 재검증 |

## 3. Versioned projection IDs

| Projection ID | 포함 | 반드시 제외 |
|---|---|---|
| `BOM_LIST_INTERNAL_V1` | Bom identity, product/item, current version/state | cost, quotation, internal approval participant |
| `BOM_DETAIL_INTERNAL_V1` | authorized line/item/revision/applicability | unrelated Project scope, private attachment coordinates |
| `BOM_VENDOR_ASSIGNED_V1` | approved item code/name/spec, quantity/unit, effective revision | cost/recent price, alternate evaluation, internal ECR/ECO review, approval data |
| `EQUIPMENT_LIST_INTERNAL_V1` | equipment no/name/model/location, asset/calibration summary | certificate object key, maintenance confidential notes |
| `EQUIPMENT_USAGE_INTERNAL_V1` | exact usage/custody/calibration snapshot | other Project usage, private evidence coordinates |
| `SAFETY_MSDS_ASSIGNED_V1` | effective safety instructions and approved MSDS delivery metadata | full inventory, internal risk review, unrelated substances |
| `SAFETY_VENDOR_ACTION_V1` | assigned instruction, due, own acknowledgement/action evidence | other Vendor/user attendance, internal incident cause analysis |
| `ALLOWANCE_POLICY_INTERNAL_V1` | policy identity/version/period/status | person amounts/tax details without separate action |
| `ALLOWANCE_CALCULATION_REVIEW_V1` | exact run/line, evaluation, calculation/adjustment, tax/wage classification | unrelated person/project/month |
| `ALLOWANCE_EXPORT_SAFE_V1` | approved export number/period/checksum/delivery audit | raw storage key, payroll credential, bank/payment field |
| `SEARCH_RESULT_INTERNAL_METADATA_V1` | source type/id/title/allowed metadata/security label | unauthorized snippet/body, hidden source fields |
| `SEARCH_RESULT_INTERNAL_BODY_V1` | approved L1/L2 snippet fields only | L3/L4 body, private object location, secrets |

`BOM_VENDOR_ASSIGNED_V1`은 exact active Project + Contract + assignment + effective approved BomVersion을 모두 요구한다. P1에는 Vendor용 검색 projection을 만들지 않는다.

## 4. Actor/Surface Matrix

| Surface | 일반 내부 | 담당 내부 | Lab Director/Rep exact participant | Vendor | Admin-System |
|---|---|---|---|---|---|
| BOM list/detail | scope/action에 따라 | create/submit 가능 | approval/effect action만 exact policy | 기본 deny; 승인 시 assigned projection만 | schema metadata only |
| 장비/교정 | allowlisted read | manage/record/use/custody | 예외 Approval participant | 기본 deny | operational metadata only |
| MSDS/안전 | 내부 scope read | manage/record/verify | plan/예외 Approval participant | assigned instruction/action만 | policy metadata only |
| 연구수당 | 별도 permission 없으면 deny | evaluation/calculation 역할별 | exact approval action | hard deny | configuration only, amount/tax deny |
| 통합검색 | metadata action+scope | same | same; 직급이 결과범위를 자동 확장하지 않음 | hard deny | metadata administration; source authorization 별도 |

## 5. Vendor Scope 규칙

### BOM

다음 AND 조건을 사용한다.

1. active VendorUser와 VendorMembership;
2. exact Project grant;
3. same VendorUser의 exact active Contract grant;
4. Deliverable/WBS/BOM assignment;
5. effective approved BomVersion;
6. `bom.vendor.assigned.read` action;
7. `BOM_VENDOR_ASSIGNED_V1` projection.

Vendor BOM projection에는 exact active Project와 exact active Contract가 항상 존재해야 한다. Contract가 없거나 Project/Contract 연결이 불완전한 BOM은 Vendor projection 대상이 아니며 fail-closed로 거부한다.

Project ID 또는 Contract ID 하나만 query에 전달하는 것은 authority가 아니다.

### Safety

Vendor는 자신에게 할당된 MSDS acknowledgement, 안전 지시, drill attendance, corrective action만 본다. hazardous inventory balance, waste vendor internal evaluation, other attendee, incident root cause/internal action은 제외한다.

### Equipment/Allowance/Search

P1 기본선에서 Vendor equipment repository, allowance, integrated search는 전부 deny한다. 향후 장비 custody가 필요하면 별도 action/projection/Scope 결정을 추가해야 하며 P1 설계 Gate가 자동 허용하지 않는다.

## 6. Security level과 검색

| Security level | Metadata index | Body index | Result delivery |
|---|---|---|---|
| `SEC_L1_PUBLIC_GENERAL` | 승인된 internal field allowlist | P1 첫 release 금지; 후속 별도 승인 후 가능 | source live authorization 재검증 |
| `SEC_L2_INTERNAL` | 승인된 internal field allowlist | P1 첫 release 금지; 후속 문서유형/필드 승인 후 가능 | Lab/Project/Document Scope와 projection 재검증 |
| `SEC_L3_CONFIDENTIAL` | 최소 opaque identifier/label만 별도 승인 가능 | 금지 | source entitlement + audited direct detail; search snippet 없음 |
| `SEC_L4_CORE_SECRET` | 기본 미색인 | 금지 | 검색 결과 없음; 기존 직접 접근 경계만 사용 |

Vendor는 모든 security level에서 기술자료 repository search가 금지된다. L1 분류도 외부 release permission이 아니다.

P1 metadata entity/field baseline:

| Entity | 허용 metadata field |
|---|---|
| Project | project number/name/type, owning department, formal-designation state, planned/actual date |
| Document | document number/title/type, current approved version, effective date, security label |
| Item/BOM | item code/name/spec/unit, BOM number, effective version/revision |
| Equipment | equipment number/name/model, authorized location, serviceability/calibration summary/due date |
| Safety/MSDS | substance/product name, hazard label, effective MSDS version/issued/effective date |
| R&D | program number/title/sponsor/agreement period, linked Project, report deadline |

각 source Feature가 live authorization과 별도 ProjectionProfile로 field를 줄인다. Document body/editor content, price/cost, equipment certificate content, material lot balance, safety incident analysis, R&D budget/expenditure와 allowance 정보는 포함하지 않는다.

## 7. 연구수당 field separation

- Policy metadata read와 person amount/tax/wage detail read를 별도 action/projection으로 나눈다.
- evaluator는 자신에게 할당된 evaluation만 쓰며 calculation/approval/export 권한을 자동 상속하지 않는다.
- payroll-review recipient는 승인된 export snapshot만 전달받고 policy 수정 또는 지급 상태 기록 권한을 갖지 않는다.
- person/month aggregate는 조직 전체 raw row list 대신 exact run/period application service에서 계산한다.
- audit/search/notification payload에는 amount/tax/wage detail을 넣지 않고 opaque record ID와 action/result만 사용한다.

## 8. Application/DB enforcement

### Application

- request마다 trusted actor/resource를 서버에서 재구성한다.
- transition 전에 state/version/policy/Approval/Scope/projection을 하나의 use case에서 검증한다.
- cross-feature read/write는 public Application Port 또는 domain event만 사용한다.
- search hit 전달 시 source feature authorization을 batch-safe port로 다시 평가한다.

### PostgreSQL

- 모든 P1 table은 RLS enabled/forced, owner/service direct exposure 금지, guarded function만 mutation을 수행한다.
- Vendor policy는 membership/grant/assignment/current version을 DB에서도 재검증한다.
- allowance amount/tax, equipment certificate, MSDS/waste evidence와 search index는 일반 table SELECT를 허용하지 않는다.
- transition, append-only history, audit와 outbox를 동일 transaction에 기록한다.

### Worker/Index/Storage

- indexer와 notification job은 idempotency key를 사용하고 trusted service actor/audit를 기록한다.
- private file delivery는 기존 broker/short-lived authorized delivery를 사용한다.
- index artifact, logs, snapshots에 token/cookie/body/object key/signed URL/connection string을 넣지 않는다.

## 9. 필수 권한 테스트

- internal authorized/unauthorized, Vendor active/disabled/expired/cross-vendor/cross-project/cross-contract;
- revoked Project/Contract grant와 assignment;
- Vendor BOM 금지필드 list/detail contract test;
- expired calibration with/without exact approved exception;
- Vendor safety own assignment vs other Vendor/participant;
- allowance evaluator/calculator/approver/exporter 역할 분리와 amount/tax field redaction;
- allowance ApprovalPolicy participant가 canonical Lab Director 이상 공식 approval authority 또는 그 acting authority인지 검증;
- Search L1/L2 allowed source, L3/L4 body denial, Vendor hard deny, revoked permission stale index denial;
- Admin-System의 L3/L4 source와 allowance amount/tax 자동열람 deny;
- service-role call의 trusted authorization/audit provenance.
