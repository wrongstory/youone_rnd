# P1 State Machines Delta

- 문서 ID: `P1-STATE-MACHINES-DELTA-V0.1`
- 상태: `PROPOSED_FOR_REVIEW`
- 추적 이슈: GitHub `#48`

## 1. 공통 transition 계약

모든 전이는 trusted actor, exact resource/Scope, current stable state, optimistic version, policy/precondition과 idempotency key를 한 transaction에서 검증한다. 성공 시 aggregate update, `state_transition_history`, Audit, Outbox를 함께 기록한다. 승인본/evidence row는 전이와 별개로 immutable하다.

표에 없는 전이는 deny한다. `REJECTED`, `RECALLED`, `CANCELLED` Approval 결과가 업무상태를 자동 추정하지 않으며 표에 정의된 event만 적용한다.

## 2. BOM Version — `SM-P1-BOM-V1`

상태: `DRAFT`, `IN_REVIEW`, `RETURNED`, `APPROVED`, `EFFECTIVE`, `SUPERSEDED`, `RETIRED`, `CANCELLED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `DRAFT` | `BOM_VERSION_SUBMITTED` | `IN_REVIEW` | line/applicability validation, sealed checksum, Approval subject 생성 |
| `IN_REVIEW` | `BOM_VERSION_APPROVED` | `APPROVED` | exact Approval outcome, immutable sealed version |
| `IN_REVIEW` | `BOM_VERSION_RETURNED` | `RETURNED` | sealed version은 terminal immutable history로 유지 |
| `IN_REVIEW` | `BOM_VERSION_CANCELLED` | `CANCELLED` | cancellation reason/audit |
| `APPROVED` | `BOM_VERSION_EFFECTED` | `EFFECTIVE` | effective time/scope conflict 없음, 필요한 ECO/Contract evidence |
| `EFFECTIVE` | `BOM_VERSION_SUPERSEDED` | `SUPERSEDED` | direct successor가 같은 scope에서 effective |
| `APPROVED` | `BOM_VERSION_RETIRED` | `RETIRED` | 사용 전 철회 근거/승인 |
| `EFFECTIVE` | `BOM_VERSION_RETIRED` | `RETIRED` | open production/contract 영향 검토와 승인 |

`RETURNED`/`APPROVED`/`EFFECTIVE` version 내용은 변경하지 않는다. 반려 후 편집은 동일 version을 `DRAFT`로 되돌리는 것이 아니라 `predecessor_version_id`로 `RETURNED` version을 가리키는 새 `DRAFT` revision을 생성한다.

## 3. Equipment Lifecycle/Serviceability — `SM-P1-EQUIPMENT-V1`

상태: `REGISTERED`, `ACTIVE`, `MAINTENANCE`, `OUT_OF_SERVICE`, `RETIRED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `REGISTERED` | `EQUIPMENT_COMMISSIONED` | `ACTIVE` | inventory evidence, calibration eligibility 또는 not-required policy |
| `ACTIVE`/`OUT_OF_SERVICE` | `EQUIPMENT_MAINTENANCE_STARTED` | `MAINTENANCE` | maintenance work order; open usage/custody 사실은 별도 축에 보존 |
| `MAINTENANCE` | `EQUIPMENT_MAINTENANCE_COMPLETED` | `ACTIVE`/`OUT_OF_SERVICE` | independent serviceability verification result |
| `ACTIVE`/`MAINTENANCE` | `EQUIPMENT_SERVICE_BLOCKED` | `OUT_OF_SERVICE` | defect/calibration/safety reason |
| `OUT_OF_SERVICE` | `EQUIPMENT_SERVICE_RESTORED` | `ACTIVE` | correction + independent eligibility check |
| `ACTIVE`/`OUT_OF_SERVICE` | `EQUIPMENT_RETIRED` | `RETIRED` | open usage 종료·checkout 반납, disposition evidence |

Serviceability가 `OUT_OF_SERVICE`로 바뀌어도 진행 중 `EquipmentUsage`와 `EquipmentCheckout` 상태는 보존한다. 새 사용/반출은 차단하지만 기존 사용 종료와 반납은 허용한다.

## 4. Equipment Checkout — `SM-P1-EQUIPMENT-CHECKOUT-V1`

상태: `AVAILABLE`, `CHECKED_OUT`, `RETURNED`, `CANCELLED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `AVAILABLE` | `EQUIPMENT_CHECKED_OUT` | `CHECKED_OUT` | equipment `ACTIVE`, custodian handover, recipient/scope/condition evidence |
| `CHECKED_OUT` | `EQUIPMENT_RETURNED` | `RETURNED` | return inspection/condition/evidence; serviceability와 무관하게 허용 |
| `AVAILABLE` | `EQUIPMENT_CHECKOUT_CANCELLED` | `CANCELLED` | handover 전 cancellation reason |

각 checkout은 immutable custody episode다. 재반출은 `RETURNED` row를 되돌리지 않고 새 `AVAILABLE` checkout record를 만든다.

## 5. Equipment Usage — `SM-P1-EQUIPMENT-USAGE-V1`

상태: `PLANNED`, `RESERVED`, `IN_USE`, `ENDED`, `CANCELLED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `PLANNED` | `EQUIPMENT_USAGE_RESERVED` | `RESERVED` | exact user/project/time, reservation conflict 없음 |
| `PLANNED`/`RESERVED` | `EQUIPMENT_USE_STARTED` | `IN_USE` | equipment `ACTIVE`, operator assignment, calibration current 또는 exact exception |
| `IN_USE` | `EQUIPMENT_USE_ENDED` | `ENDED` | end meter/time/result evidence; serviceability와 무관하게 허용 |
| `PLANNED`/`RESERVED` | `EQUIPMENT_USAGE_CANCELLED` | `CANCELLED` | 사용 시작 전 reason/audit |

사용 중 교정만료·고장 발생은 Equipment를 `OUT_OF_SERVICE`로 바꾸고 새 작업을 막지만 현재 Usage를 삭제하거나 강제로 완료하지 않는다.

## 6. Calibration Status — `SM-P1-CALIBRATION-V1`

상태: `NOT_REQUIRED`, `CURRENT`, `DUE_SOON`, `EXPIRED`, `UNDER_CALIBRATION`, `FAILED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| any except `UNDER_CALIBRATION` | `CALIBRATION_STARTED` | `UNDER_CALIBRATION` | plan/version, provider/work order |
| `UNDER_CALIBRATION` | `CALIBRATION_PASSED` | `CURRENT` | sealed certificate, valid interval |
| `UNDER_CALIBRATION` | `CALIBRATION_FAILED` | `FAILED` | sealed failure evidence, equipment block |
| `CURRENT` | `CALIBRATION_DUE_WINDOW_ENTERED` | `DUE_SOON` | idempotent clock event |
| `CURRENT`/`DUE_SOON` | `CALIBRATION_EXPIRED` | `EXPIRED` | valid-until reached, idempotent clock event |
| `FAILED`/`EXPIRED` | `CALIBRATION_RESTARTED` | `UNDER_CALIBRATION` | corrective/work order evidence |
| any | `CALIBRATION_NOT_REQUIRED_EFFECTED` | `NOT_REQUIRED` | approved policy version; free manual selection 금지 |

예외 사용은 `EXPIRED`를 `CURRENT`로 바꾸지 않는다. exact `EquipmentUseException`이 개별 usage eligibility만 제한적으로 허용한다.

## 7. Calibration Policy Version — `SM-P1-CALIBRATION-POLICY-V1`

상태: `DRAFT`, `IN_REVIEW`, `RETURNED`, `APPROVED`, `EFFECTIVE`, `SUPERSEDED`, `REVOKED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `DRAFT` | `CALIBRATION_POLICY_SUBMITTED` | `IN_REVIEW` | cadence/trigger/source/checksum sealed, typed Approval subject 생성 |
| `IN_REVIEW` | `CALIBRATION_POLICY_RETURNED` | `RETURNED` | sealed version terminal; correction은 successor draft |
| `IN_REVIEW` | `CALIBRATION_POLICY_APPROVED` | `APPROVED` | exact Approval outcome/participant |
| `APPROVED` | `CALIBRATION_POLICY_EFFECTED` | `EFFECTIVE` | equipment/kind effectivity overlap 없음 |
| `EFFECTIVE` | `CALIBRATION_POLICY_SUPERSEDED` | `SUPERSEDED` | direct approved successor effective |
| `APPROVED`/`EFFECTIVE` | `CALIBRATION_POLICY_REVOKED` | `REVOKED` | reason/authority, affected equipment eligibility 재평가 |

`RETURNED` version은 수정하지 않고 predecessor로 연결한 새 `DRAFT` version을 만든다.

## 8. MSDS Version — `SM-P1-MSDS-V1`

상태: `DRAFT`, `IN_REVIEW`, `RETURNED`, `APPROVED`, `EFFECTIVE`, `SUPERSEDED`, `WITHDRAWN`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `DRAFT` | `MSDS_SUBMITTED` | `IN_REVIEW` | source/checksum/language/effective date sealed, typed Approval subject 생성 |
| `IN_REVIEW` | `MSDS_APPROVED` | `APPROVED` | exact approval/policy |
| `IN_REVIEW` | `MSDS_RETURNED` | `RETURNED` | sealed version terminal; correction은 predecessor-linked successor draft |
| `APPROVED` | `MSDS_EFFECTED` | `EFFECTIVE` | 같은 substance/language/time 충돌 없음 |
| `EFFECTIVE` | `MSDS_SUPERSEDED` | `SUPERSEDED` | direct successor effective |
| `APPROVED`/`EFFECTIVE` | `MSDS_WITHDRAWN` | `WITHDRAWN` | recall/legal/supplier evidence, notification obligation |

## 9. Hazardous Material Lot — `SM-P1-MATERIAL-LOT-V1`

상태: `RECEIVED`, `AVAILABLE`, `QUARANTINED`, `DEPLETED`, `WASTE_PENDING`, `CLOSED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `RECEIVED` | `MATERIAL_ACCEPTED` | `AVAILABLE` | effective MSDS, receipt/storage verification |
| `RECEIVED`/`AVAILABLE` | `MATERIAL_QUARANTINED` | `QUARANTINED` | reason/scope/evidence |
| `QUARANTINED` | `MATERIAL_RELEASED` | `AVAILABLE` | independent safety verification |
| `AVAILABLE` | `MATERIAL_DEPLETED` | `DEPLETED` | ledger balance zero |
| `AVAILABLE`/`QUARANTINED`/`DEPLETED` | `MATERIAL_WASTE_OPENED` | `WASTE_PENDING` | exact WasteBatch link and transferred quantity |
| `DEPLETED`/`WASTE_PENDING` | `MATERIAL_LOT_CLOSED` | `CLOSED` | balance/remaining disposition reconciled |

수량 변경은 state row의 직접 수정이 아니라 append-only MaterialTransaction으로만 수행한다.

## 10. Waste Batch — `SM-P1-WASTE-V1`

상태: `OPEN`, `READY_FOR_HANDOVER`, `HANDED_OVER`, `DISPOSAL_CONFIRMED`, `CLOSED`, `CANCELLED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `OPEN` | `WASTE_BATCH_SEALED` | `READY_FOR_HANDOVER` | classification/quantity/source lots/checksum |
| `READY_FOR_HANDOVER` | `WASTE_HANDED_OVER` | `HANDED_OVER` | authorized parties, carrier/handler evidence |
| `HANDED_OVER` | `WASTE_DISPOSAL_CONFIRMED` | `DISPOSAL_CONFIRMED` | independent treatment evidence; handover alone 불충분 |
| `DISPOSAL_CONFIRMED` | `WASTE_BATCH_CLOSED` | `CLOSED` | evidence/retention/reconciliation complete |
| `OPEN`/`READY_FOR_HANDOVER` | `WASTE_BATCH_CANCELLED` | `CANCELLED` | no handover, reversal/reconciliation evidence |

## 11. Emergency Plan — `SM-P1-EMERGENCY-PLAN-V1`

상태: `DRAFT`, `IN_REVIEW`, `RETURNED`, `APPROVED`, `EFFECTIVE`, `SUPERSEDED`, `WITHDRAWN`

전이는 `SM-P1-MSDS-V1`과 같은 version lifecycle을 사용하되 event prefix를 `EMERGENCY_PLAN_*`로 한다. PlanVersion은 approval/effectivity 이후 immutable하다.

## 12. Emergency Drill — `SM-P1-EMERGENCY-DRILL-V1`

상태: `PLANNED`, `IN_PROGRESS`, `RESULT_RECORDED`, `ACTIONS_OPEN`, `COMPLETED`, `CANCELLED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `PLANNED` | `DRILL_STARTED` | `IN_PROGRESS` | exact effective plan, facilitator, participant scope |
| `IN_PROGRESS` | `DRILL_RESULT_RECORDED` | `RESULT_RECORDED` | attendance/observation/evidence sealed |
| `RESULT_RECORDED` | `DRILL_ACTIONS_OPENED` | `ACTIONS_OPEN` | one or more finding/action |
| `RESULT_RECORDED` | `DRILL_COMPLETED` | `COMPLETED` | no open finding/action |
| `ACTIONS_OPEN` | `DRILL_ACTIONS_VERIFIED` | `COMPLETED` | all actions independently verified |
| `PLANNED` | `DRILL_CANCELLED` | `CANCELLED` | reason/authority/notification |

## 13. Allowance Policy — `SM-P1-ALLOWANCE-POLICY-V1`

상태: `DRAFT`, `IN_APPROVAL`, `RETURNED`, `APPROVED`, `EFFECTIVE`, `SUPERSEDED`, `CANCELLED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `DRAFT` | `ALLOWANCE_POLICY_SUBMITTED` | `IN_APPROVAL` | exact Project/RndProgram, sealed rule/checksum/source basis |
| `IN_APPROVAL` | `ALLOWANCE_POLICY_APPROVED` | `APPROVED` | exact ApprovalPolicyVersion/outcome |
| `IN_APPROVAL` | `ALLOWANCE_POLICY_RETURNED` | `RETURNED` | sealed policy version terminal; correction은 predecessor-linked successor draft |
| `APPROVED` | `ALLOWANCE_POLICY_EFFECTED` | `EFFECTIVE` | period overlap conflict 없음 |
| `EFFECTIVE` | `ALLOWANCE_POLICY_SUPERSEDED` | `SUPERSEDED` | direct successor effective |
| `DRAFT`/`IN_APPROVAL`/`APPROVED` | `ALLOWANCE_POLICY_CANCELLED` | `CANCELLED` | 사용된 calculation 없음 또는 explicit disposition |

## 14. Allowance Calculation — `SM-P1-ALLOWANCE-CALCULATION-V1`

상태: `DRAFT`, `CALCULATED`, `IN_REVIEW`, `RETURNED`, `APPROVED`, `EXPORTED`, `VOIDED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `DRAFT` | `ALLOWANCE_CALCULATED` | `CALCULATED` | exact policy/evaluation/participation, person-month aggregate checksum |
| `CALCULATED` | `ALLOWANCE_REVIEW_STARTED` | `IN_REVIEW` | sealed lines, assigned reviewer |
| `IN_REVIEW` | `ALLOWANCE_CALCULATION_APPROVED` | `APPROVED` | exact Approval outcome, adjustment reason/evidence |
| `IN_REVIEW` | `ALLOWANCE_CALCULATION_RETURNED` | `RETURNED` | sealed run terminal; correction은 predecessor-linked successor `DRAFT` run |
| `APPROVED` | `ALLOWANCE_EXPORT_GENERATED` | `EXPORTED` | exact approved checksum, generic template/version, delivery audit |
| `CALCULATED`/`IN_REVIEW`/`APPROVED` | `ALLOWANCE_CALCULATION_VOIDED` | `VOIDED` | reversal reason/approval; 지급완료 의미 아님 |

`EXPORTED`는 지급 또는 급여 반영 완료 상태가 아니다.

## 15. Search Index Policy Version — `SM-P1-SEARCH-POLICY-V1`

상태: `DRAFT`, `IN_REVIEW`, `RETURNED`, `APPROVED`, `EFFECTIVE`, `SUPERSEDED`, `REVOKED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `DRAFT` | `SEARCH_POLICY_SUBMITTED` | `IN_REVIEW` | entity/field/security/snippet/purge allowlist checksum sealed |
| `IN_REVIEW` | `SEARCH_POLICY_RETURNED` | `RETURNED` | sealed version terminal; correction은 successor draft |
| `IN_REVIEW` | `SEARCH_POLICY_APPROVED` | `APPROVED` | exact typed Approval outcome, security owner evidence |
| `APPROVED` | `SEARCH_POLICY_EFFECTED` | `EFFECTIVE` | predecessor/successor와 effectivity conflict 없음 |
| `EFFECTIVE` | `SEARCH_POLICY_SUPERSEDED` | `SUPERSEDED` | direct approved successor effective; reindex/purge queued |
| `APPROVED`/`EFFECTIVE` | `SEARCH_POLICY_REVOKED` | `REVOKED` | reason/authority; affected entries delivery 즉시 deny 및 purge queued |

P1 첫 릴리즈 정책은 internal metadata-only다. L1/L2 body field를 추가하는 후속 정책은 별도 결정과 새 Approval을 요구한다.

## 16. Search Index Entry — `SM-P1-SEARCH-INDEX-V1`

상태: `QUEUED`, `INDEXED`, `INDEX_FAILED`, `PURGE_QUEUED`, `PURGE_FAILED`, `PURGED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `QUEUED` | `SEARCH_ENTRY_INDEXED` | `INDEXED` | source live, allowed policy/fields/security, content checksum |
| `QUEUED` | `SEARCH_ENTRY_INDEX_FAILED` | `INDEX_FAILED` | stable safe reason, index retry evidence |
| `QUEUED`/`INDEXED`/`INDEX_FAILED` | `SEARCH_ENTRY_PURGE_QUEUED` | `PURGE_QUEUED` | source revoke/delete/policy change/security escalation |
| `PURGE_QUEUED` | `SEARCH_ENTRY_PURGED` | `PURGED` | index/cache deletion evidence |
| `PURGE_QUEUED` | `SEARCH_ENTRY_PURGE_FAILED` | `PURGE_FAILED` | stable safe reason, security retry/escalation evidence |
| `INDEX_FAILED` | `SEARCH_ENTRY_INDEX_REQUEUED` | `QUEUED` | current source/policy reauthorization |
| `PURGE_FAILED` | `SEARCH_ENTRY_PURGE_REQUEUED` | `PURGE_QUEUED` | purge retry only; 일반 index queue 진입 금지 |
| `PURGED` | `SEARCH_ENTRY_REINDEX_QUEUED` | `QUEUED` | current source/policy reauthorization |

Query는 index state와 무관하게 delivery 시 source authorization을 다시 검증한다. `PURGE_QUEUED`/`PURGE_FAILED` entry는 결과에서 즉시 deny하며 보안 경보·재시도 대상이다.

## 17. Automated jobs

- calibration due/expiry, MSDS/effective plan change, drill/action due, allowance review due, search purge/reindex는 idempotency key를 사용한다.
- job은 상태를 추정해 건너뛰지 않고 current state/version/precondition을 guarded command에서 재검증한다.
- 실패는 stable reason code와 Audit/Outbox로 기록하며 input payload, token, object key를 로그에 남기지 않는다.
