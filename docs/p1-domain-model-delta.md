# P1 Domain Model Delta

- 문서 ID: `P1-DOMAIN-DELTA-V0.1`
- 상태: `PROPOSED_FOR_REVIEW`
- 추적 이슈: GitHub `#48`
- 적용 전제: `OD-037-P1-DEVELOPMENT-GATE` 승인 전 논리 설계로만 사용

## 1. 모델링 원칙

- P0 aggregate와 공개 Application Port를 재사용하고 P1 module이 다른 module의 내부 repository/entity를 import하지 않는다.
- 업무 record는 UUID PK, human code는 alternate unique ID, UTC timestamp, optimistic version을 사용한다.
- 승인·효력화된 version과 공식 evidence는 immutable이다. 정정은 새 version 또는 명시적 reversal record다.
- 상태는 `docs/p1-state-machines-delta.md`의 stable ID로만 전이한다.
- 정책값·주기·보존기한·예외권한은 versioned policy snapshot과 source basis를 저장하며 guessed default를 두지 않는다.
- Attachment는 private storage metadata만 참조하고 public URL/object key를 domain/UI DTO에 노출하지 않는다.

## 2. Aggregate 경계

| Aggregate Root | 소유 내용 | 외부 참조 |
|---|---|---|
| `Bom` | BomVersion, line, alternate, applicability, approval/effectivity | Item, Product, Project, ECR/ECO, DocumentVersion |
| `AsBuiltBomSnapshot` | exact effective BOM/line/revision/serial-lot evidence | DeliverableVersion, InspectionAttempt, ECO |
| `ResearchEquipment` | 장비 identity, lifecycle, location/custodian, usage eligibility | Project, Department, Item, Attachment |
| `CalibrationPlan` | 장비별 policy/version, due calculation, provider requirements | ResearchEquipment, policy source |
| `CalibrationRecord` | 성적서, result, validity, immutable equipment snapshot | Equipment, Attachment, actor/provider |
| `EquipmentUsage` | 예약/사용/반출/반납과 당시 교정 snapshot | Equipment, Project/WBS, TestResult, User/VendorUser |
| `SafetySubstance` | 물질 master, hazard classification, current MSDS link | Item, Supplier, Attachment |
| `HazardousMaterialLot` | 입고 lot, 보관위치, 수량단위, transaction ledger | Substance, Project, Vendor, User |
| `WasteBatch` | 폐기물 분류, 발생·보관·인계·처리 증거 | Project, Vendor/Supplier, Attachment |
| `EmergencyPlan` | versioned plan, scope, approval/effectivity | Organization/Project, DocumentVersion |
| `EmergencyDrill` | schedule, participants, result, finding/action closure | EmergencyPlanVersion, Training, Attachment |
| `ProjectAllowancePolicy` | 과제별 대상·주기·산정·평가·승인·효력 version | Project/RndProgram, ApprovalPolicyVersion |
| `AllowanceCalculationRun` | period/person/project lines, tax/wage classification, adjustment, approval | PolicyVersion, participation/evaluation, User |
| `AllowanceExport` | 승인된 계산 snapshot의 급여 검토 참고자료 manifest | CalculationRun, DocumentVersion/Attachment |
| `SearchIndexPolicy` | entity/field/security/source allowlist version | ProjectionProfile, security classification |
| `SearchIndexEntry` | source-derived 최소 index record와 purge/reindex provenance | exact source entity/version, policy version |

## 3. BOM

### `bom`, `bom_version`

`Bom`은 Product 또는 상위 Item의 구성 정의 identity다. `BomVersion`은 version number, lifecycle state, checksum, created/sealed/approved/effective/superseded evidence를 가진다. 승인 후 내용과 적용범위를 갱신하지 않는다.

### `bom_line`, `bom_line_alternate`

Line은 exact child Item revision, quantity, unit, scrap/remark의 허용된 typed field와 정렬순서를 가진다. 대체품은 원 line을 덮지 않고 priority, approval/effectivity, 적용 제한을 별도 record로 가진다. 원가·최근가격은 BOM aggregate가 소유하지 않는다.

### `bom_applicability`

`PROJECT`, `PRODUCT_REVISION`, `SERIAL_RANGE`, `LOT_RANGE`, `EFFECTIVE_INTERVAL`을 typed discriminator와 전용 link/check로 표현한다. 하나의 범용 JSON scope로 축약하지 않는다.

### `as_built_bom_snapshot`

납품/검수/시험 시점에 실제 사용된 BomVersion과 line/item revision tuple을 봉인한다. 이후 BOM supersede가 과거 snapshot을 바꾸지 않는다.

핵심 불변조건:

- 같은 Bom에서 승인된 version number/checksum은 unique·immutable이다.
- 한 applicability scope/time에서 충돌하는 두 effective version을 허용하지 않는다.
- ECO 효력화는 exact before/after BomVersion과 필요한 ContractVersion evidence 없이는 적용되지 않는다.
- Vendor DTO에는 허용된 Item/quantity/revision만 있으며 원가·내부평가·승인선이 없다.

## 4. 연구장비·교정

### `research_equipment`

장비번호, 명칭, manufacturer/model/serial, 소유/임대 구분, 위치, 관리부서·custodian, serviceability lifecycle, 보안/반출 분류를 가진다. Equipment serviceability, Checkout custody, Usage와 Calibration은 서로 독립 상태축이다. 사용 중 고장/교정만료가 발생해 Equipment가 `OUT_OF_SERVICE`가 되어도 기존 Usage `IN_USE`와 Checkout `CHECKED_OUT` 사실을 잃지 않으며 종료·반납 전이를 계속 허용한다.

### `calibration_plan`, `calibration_policy_version`

대상 장비/종류, 요구주기 또는 event-based trigger, 사전알림, 허용기관/방법, 판정기준, source basis, effective interval을 version으로 보존한다. `CalibrationPolicyVersion`은 exact typed Approval subject를 가진 sealed lifecycle이며 반려본은 `RETURNED` terminal, 정정은 successor `DRAFT`다. 확정 주기는 장비·규정·제조사 근거별 값이며 전역 기본값을 두지 않는다.

### `calibration_record`

장비 snapshot, 실시/발행/유효기간, provider, certificate number, result, 측정불확도/범위의 typed metadata, private 성적서 hash/evidence를 봉인한다. 새 교정은 과거 record를 수정하지 않는다.

### `equipment_usage`, `equipment_checkout`, `maintenance_record`

Usage는 목적, Project/WBS, operator, start/end meter/time, exact CalibrationRecord와 eligibility decision을 저장한다. 반출/반납과 정비는 독립 append-only event/evidence이며 장비 현재상태를 transaction에서 함께 전이한다.

### `equipment_use_exception`

교정 만료 예외가 승인되는 경우 exact 장비, 목적, Project/TestPlan, 최대기간, 제한조건, 위험검토, Approval snapshot과 재검토 evidence를 봉인한다. 정책 미승인 상태에서는 생성할 수 없다.

핵심 불변조건:

- `EXPIRED` 또는 유효 CalibrationRecord가 없는 장비는 승인된 exact exception 없이는 공식 시험/검사에 사용할 수 없다.
- TestResult는 당시 Equipment와 CalibrationRecord/Exception snapshot을 참조한다.
- Checkout 중복, retired/out-of-service 장비 사용, 반납 전 재반출을 차단한다.

## 5. 안전관리 확장

### `safety_substance`, `msds`, `msds_version`

Substance는 물질/제품 식별, hazard classification, 공급자와 current effective MSDS를 가진다. `MsdsVersion`은 언어, 발행/효력, source, checksum, private Attachment를 봉인하며 새 버전이 과거 버전을 덮지 않는다.

### `hazardous_material_lot`, `hazardous_material_transaction`

Lot은 exact Substance/MSDSVersion, 수량·단위, 보관위치, 입고일, expiry, Project/Vendor scope를 가진다. Transaction은 `RECEIPT`, `USE`, `TRANSFER`, `ADJUSTMENT`, `QUARANTINE`, `RELEASE`, `WASTE_CONVERSION`을 append-only ledger로 기록한다. 재고는 ledger 합계로 검증하며 직접 숫자 덮어쓰기를 허용하지 않는다.

### `waste_batch`, `waste_handover`, `waste_disposal_evidence`

폐기물 발생 근거와 material lot link, 분류, 수량·단위, 보관, 인계자/수령자, 운반·처리업체, 인계/처리 시각과 private evidence를 분리한다. 처리확인은 인계만으로 자동 완료되지 않는다.

### `emergency_plan_version`, `emergency_drill`, `emergency_drill_action`

PlanVersion은 적용 Organization/Project/site, scenario, 역할/연락/대피/장비 checklist, 승인·효력을 봉인한다. Drill은 exact effective plan, 일정, 참가대상/출석, 관찰·결과를 기록하며 발견사항은 owner/due/effectiveness verification을 가진 action으로 닫는다.

핵심 불변조건:

- MSDS 효력화, 폐기물 인계/처리 확인, 비상계획 효력화는 online-only 공식 action이다.
- Vendor는 exact assignment와 Scope의 지시/확인/action만 볼 수 있고 전체 물질 재고·내부 사고분석을 볼 수 없다.
- 법정 신고/보존과 내부 기록은 source basis와 retention decision을 별도 저장한다.

## 6. 연구수당

### `project_allowance_policy`, `project_allowance_policy_version`

과제/RndProgram별 적용대상, 기간, 산정주기, 평가요소/가중치, 재원·한도, 조정 허용범위, 세무검토 기준, ApprovalPolicyVersion과 source basis를 version으로 보존한다. 한 전역 지급주기를 두지 않는다.

### `allowance_participation`, `research_performance_evaluation`

참여자는 User, Project/RndProgram, 참여기간/비율/역할과 근거를 가진다. 평가는 exact policy version과 period, 항목별 점수/evidence, evaluator, sealed total/grade를 보존하며 공식 승인권과 평가자 역할을 혼동하지 않는다.

### `allowance_calculation_run`, `allowance_calculation_line`

Run은 정산월/기간과 policy set checksum을 가진다. Line은 사람·과제별 base, performance result, calculated amount, 조정 전후액, 조정사유와 승인 snapshot을 typed field로 보존한다. 다과제 합산은 동일 person/month key로 계산한다.

### `allowance_tax_assessment`, `allowance_wage_classification`

세무 비과세 후보/과세액과 임금성 판단은 별도 record/enum/source version으로 저장한다. 한 판단이 다른 판단을 자동 결정하지 않는다. 세법 문구와 한도는 versioned source로 재검증한다.

### `allowance_export`

승인된 CalculationRun exact checksum을 기반으로 generic 급여 검토 참고자료를 생성한다. export number, generated-by/at, renderer/template version, private Attachment/hash, recipient handover audit를 보존한다. 지급완료 상태나 송금 명령은 없다.

핵심 불변조건:

- 계산·조정·승인·export는 서로 다른 사건이며 승인된 계산을 덮어쓰지 않는다.
- 동일 person/month의 모든 포함 과제를 합산한다.
- 과제별 ApprovalPolicyVersion이 참여 조합을 정하지만 participant는 canonical Lab Director 이상 공식 approval authority 또는 유효한 acting authority로 제한한다. Senior Researcher position 자체에는 승인권이 없다.
- Vendor와 일반 Project member에게 금액·세무·임금 분류를 노출하지 않는다.

## 7. 권한필터 통합검색

### `search_index_policy`, `search_index_policy_version`

허용 source entity/version, field, security level, actor kind, projection profile, tokenizer/snippet 정책, retention/purge SLA를 version으로 보존한다. `SearchIndexPolicyVersion`은 exact typed Approval subject와 `DRAFT → IN_REVIEW → RETURNED/APPROVED → EFFECTIVE → SUPERSEDED/REVOKED` lifecycle을 가지며 sealed 반려본은 immutable하다. P1 첫 릴리즈는 internal metadata-only다. Project, Document, Item/BOM, Equipment, Safety/MSDS, R&D source를 entity별 명시 field allowlist로만 색인한다. L1/L2 body는 후속 별도 결정/정책 전까지 금지한다.

### `search_index_entry`

source type/id/version, policy version, owning scope IDs, security level, indexed field IDs, content checksum, indexed/purged time을 가진 파생 record다. `INDEX_FAILED`와 보안상 중요한 `PURGE_FAILED`를 분리하며 purge 실패는 일반 재색인 queue로 이동할 수 없다. source 내용을 정본으로 소유하지 않으며 source 삭제/권한회수 event에서 purge/reindex한다.

### `search_query_audit`, `search_result_access_audit`

민감 query는 원문 대신 정규화 digest/분류와 actor/correlation/policy version을 감사한다. 결과 전달 시점에 다시 authorization과 projection을 평가하고 delivered source IDs를 감사한다.

핵심 불변조건:

- index match는 authorization evidence가 아니다.
- result/snippet/detail 각각 trusted ActorContext, source live state, Scope, security level, versioned projection을 재검증한다.
- Vendor technical repository search와 L3/L4 body index는 hard deny다.
- 권한 회수 후 이전 cache/index 결과를 제공하지 않는다.

## 8. Cross-feature event/port

| 공개 계약 | Producer | Consumer | 금지사항 |
|---|---|---|---|
| `BomVersionEffectivityPort` | Purchase/BOM | Change, Quality | BOM 내부 repository import 금지 |
| `EquipmentEligibilityPort` | Equipment | Quality | TestResult가 교정상태를 자체 계산 금지 |
| `TestEquipmentSnapshotPort` | Quality | Equipment | 과거 TestResult 수정 금지 |
| `SafetyMaterialScopePort` | Safety | Project/Vendor Auth | request vendor/project ID 신뢰 금지 |
| `AllowanceProjectPolicyPort` | Allowance | Project/R&D, Approval | 전역 cadence fallback 금지 |
| `SearchProjectionSourcePort` | 각 Feature | Search | raw table scan/공용 DTO 재사용 금지 |
| `SearchPurgeEvent` | Identity/Auth/Feature | Search | 권한회수 후 eventual unlimited exposure 금지 |

## 9. P1 최소 개념 목록

P1 구현 Gate가 열릴 때 최소한 다음을 독립 entity/version으로 유지한다: Bom, BomVersion, BomLine, BomApplicability, AsBuiltBomSnapshot, ResearchEquipment, CalibrationPolicyVersion, CalibrationRecord, EquipmentUsage, EquipmentCheckout, MaintenanceRecord, SafetySubstance, MsdsVersion, HazardousMaterialLot/Transaction, WasteBatch/Handover/DisposalEvidence, EmergencyPlanVersion, EmergencyDrill/Action, ProjectAllowancePolicyVersion, AllowanceParticipation, ResearchPerformanceEvaluation, AllowanceCalculationRun/Line, AllowanceAdjustment, AllowanceTaxAssessment, AllowanceWageClassification, AllowanceExport, SearchIndexPolicyVersion, SearchIndexEntry, SearchQuery/ResultAccessAudit.
