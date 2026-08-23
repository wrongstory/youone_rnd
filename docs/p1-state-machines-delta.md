# P1 State Machines Delta

- 문서 ID: `P1-STATE-MACHINES-DELTA-V0.1`
- 상태: `PROPOSED_FOR_REVIEW`
- 추적 이슈: GitHub `#48`

## 1. 공통 transition 계약

모든 전이는 trusted actor, exact resource/Scope, current stable state, optimistic version, policy/precondition과 idempotency key를 한 transaction에서 검증한다. 성공 시 aggregate update, `state_transition_history`, Audit, Outbox를 함께 기록한다. 승인본/evidence row는 전이와 별개로 immutable하다.

표에 없는 전이는 deny한다. `REJECTED`, `RECALLED`, `CANCELLED` Approval 결과가 업무상태를 자동 추정하지 않으며 표에 정의된 event만 적용한다.

## 2. BOM Version — `SM-P1-BOM-V1`

상태: `DRAFT`, `IN_REVIEW`, `APPROVED`, `EFFECTIVE`, `SUPERSEDED`, `RETIRED`, `CANCELLED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `DRAFT` | `BOM_VERSION_SUBMITTED` | `IN_REVIEW` | line/applicability validation, sealed checksum, Approval subject 생성 |
| `IN_REVIEW` | `BOM_VERSION_APPROVED` | `APPROVED` | exact Approval outcome, immutable sealed version |
| `IN_REVIEW` | `BOM_VERSION_RETURNED` | `DRAFT` | 승인본 수정이 아니라 draft 새 revision/checksum |
| `IN_REVIEW` | `BOM_VERSION_CANCELLED` | `CANCELLED` | cancellation reason/audit |
| `APPROVED` | `BOM_VERSION_EFFECTED` | `EFFECTIVE` | effective time/scope conflict 없음, 필요한 ECO/Contract evidence |
| `EFFECTIVE` | `BOM_VERSION_SUPERSEDED` | `SUPERSEDED` | direct successor가 같은 scope에서 effective |
| `APPROVED` | `BOM_VERSION_RETIRED` | `RETIRED` | 사용 전 철회 근거/승인 |
| `EFFECTIVE` | `BOM_VERSION_RETIRED` | `RETIRED` | open production/contract 영향 검토와 승인 |

`APPROVED`/`EFFECTIVE` version 내용은 변경하지 않는다. 반려 후 편집은 동일 immutable version을 덮는 것이 아니라 새 draft revision을 만든다.

## 3. Equipment Asset — `SM-P1-EQUIPMENT-V1`

상태: `REGISTERED`, `AVAILABLE`, `RESERVED`, `CHECKED_OUT`, `IN_USE`, `MAINTENANCE`, `OUT_OF_SERVICE`, `RETIRED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `REGISTERED` | `EQUIPMENT_COMMISSIONED` | `AVAILABLE` | inventory evidence, calibration eligibility 또는 not-required policy |
| `AVAILABLE` | `EQUIPMENT_RESERVED` | `RESERVED` | exact user/project/time, conflict 없음 |
| `AVAILABLE`/`RESERVED` | `EQUIPMENT_CHECKED_OUT` | `CHECKED_OUT` | custodian handover, eligibility snapshot |
| `AVAILABLE`/`CHECKED_OUT` | `EQUIPMENT_USE_STARTED` | `IN_USE` | operator assignment, calibration current 또는 exact exception |
| `IN_USE` | `EQUIPMENT_USE_ENDED` | `AVAILABLE`/`CHECKED_OUT` | usage evidence; custody 위치에 따라 결정 |
| `CHECKED_OUT` | `EQUIPMENT_RETURNED` | `AVAILABLE` | return inspection/evidence |
| `AVAILABLE`/`OUT_OF_SERVICE` | `EQUIPMENT_MAINTENANCE_STARTED` | `MAINTENANCE` | maintenance work order |
| `MAINTENANCE` | `EQUIPMENT_MAINTENANCE_COMPLETED` | `AVAILABLE`/`OUT_OF_SERVICE` | verification result |
| non-`RETIRED` | `EQUIPMENT_SERVICE_BLOCKED` | `OUT_OF_SERVICE` | defect/calibration/safety reason |
| `OUT_OF_SERVICE` | `EQUIPMENT_SERVICE_RESTORED` | `AVAILABLE` | correction + independent eligibility check |
| `AVAILABLE`/`OUT_OF_SERVICE` | `EQUIPMENT_RETIRED` | `RETIRED` | no open custody/use, disposition evidence |

## 4. Calibration Status — `SM-P1-CALIBRATION-V1`

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

## 5. MSDS Version — `SM-P1-MSDS-V1`

상태: `DRAFT`, `IN_REVIEW`, `APPROVED`, `EFFECTIVE`, `SUPERSEDED`, `WITHDRAWN`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `DRAFT` | `MSDS_SUBMITTED` | `IN_REVIEW` | source/checksum/language/effective date sealed |
| `IN_REVIEW` | `MSDS_APPROVED` | `APPROVED` | exact approval/policy |
| `IN_REVIEW` | `MSDS_RETURNED` | `DRAFT` | 새 draft version/revision |
| `APPROVED` | `MSDS_EFFECTED` | `EFFECTIVE` | 같은 substance/language/time 충돌 없음 |
| `EFFECTIVE` | `MSDS_SUPERSEDED` | `SUPERSEDED` | direct successor effective |
| `APPROVED`/`EFFECTIVE` | `MSDS_WITHDRAWN` | `WITHDRAWN` | recall/legal/supplier evidence, notification obligation |

## 6. Hazardous Material Lot — `SM-P1-MATERIAL-LOT-V1`

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

## 7. Waste Batch — `SM-P1-WASTE-V1`

상태: `OPEN`, `READY_FOR_HANDOVER`, `HANDED_OVER`, `DISPOSAL_CONFIRMED`, `CLOSED`, `CANCELLED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `OPEN` | `WASTE_BATCH_SEALED` | `READY_FOR_HANDOVER` | classification/quantity/source lots/checksum |
| `READY_FOR_HANDOVER` | `WASTE_HANDED_OVER` | `HANDED_OVER` | authorized parties, carrier/handler evidence |
| `HANDED_OVER` | `WASTE_DISPOSAL_CONFIRMED` | `DISPOSAL_CONFIRMED` | independent treatment evidence; handover alone 불충분 |
| `DISPOSAL_CONFIRMED` | `WASTE_BATCH_CLOSED` | `CLOSED` | evidence/retention/reconciliation complete |
| `OPEN`/`READY_FOR_HANDOVER` | `WASTE_BATCH_CANCELLED` | `CANCELLED` | no handover, reversal/reconciliation evidence |

## 8. Emergency Plan — `SM-P1-EMERGENCY-PLAN-V1`

상태: `DRAFT`, `IN_REVIEW`, `APPROVED`, `EFFECTIVE`, `SUPERSEDED`, `WITHDRAWN`

전이는 `SM-P1-MSDS-V1`과 같은 version lifecycle을 사용하되 event prefix를 `EMERGENCY_PLAN_*`로 한다. PlanVersion은 approval/effectivity 이후 immutable하다.

## 9. Emergency Drill — `SM-P1-EMERGENCY-DRILL-V1`

상태: `PLANNED`, `IN_PROGRESS`, `RESULT_RECORDED`, `ACTIONS_OPEN`, `COMPLETED`, `CANCELLED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `PLANNED` | `DRILL_STARTED` | `IN_PROGRESS` | exact effective plan, facilitator, participant scope |
| `IN_PROGRESS` | `DRILL_RESULT_RECORDED` | `RESULT_RECORDED` | attendance/observation/evidence sealed |
| `RESULT_RECORDED` | `DRILL_ACTIONS_OPENED` | `ACTIONS_OPEN` | one or more finding/action |
| `RESULT_RECORDED` | `DRILL_COMPLETED` | `COMPLETED` | no open finding/action |
| `ACTIONS_OPEN` | `DRILL_ACTIONS_VERIFIED` | `COMPLETED` | all actions independently verified |
| `PLANNED` | `DRILL_CANCELLED` | `CANCELLED` | reason/authority/notification |

## 10. Allowance Policy — `SM-P1-ALLOWANCE-POLICY-V1`

상태: `DRAFT`, `IN_APPROVAL`, `APPROVED`, `EFFECTIVE`, `SUPERSEDED`, `CANCELLED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `DRAFT` | `ALLOWANCE_POLICY_SUBMITTED` | `IN_APPROVAL` | exact Project/RndProgram, sealed rule/checksum/source basis |
| `IN_APPROVAL` | `ALLOWANCE_POLICY_APPROVED` | `APPROVED` | exact ApprovalPolicyVersion/outcome |
| `IN_APPROVAL` | `ALLOWANCE_POLICY_RETURNED` | `DRAFT` | 새 draft version/revision |
| `APPROVED` | `ALLOWANCE_POLICY_EFFECTED` | `EFFECTIVE` | period overlap conflict 없음 |
| `EFFECTIVE` | `ALLOWANCE_POLICY_SUPERSEDED` | `SUPERSEDED` | direct successor effective |
| `DRAFT`/`IN_APPROVAL`/`APPROVED` | `ALLOWANCE_POLICY_CANCELLED` | `CANCELLED` | 사용된 calculation 없음 또는 explicit disposition |

## 11. Allowance Calculation — `SM-P1-ALLOWANCE-CALCULATION-V1`

상태: `DRAFT`, `CALCULATED`, `IN_REVIEW`, `APPROVED`, `EXPORTED`, `VOIDED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `DRAFT` | `ALLOWANCE_CALCULATED` | `CALCULATED` | exact policy/evaluation/participation, person-month aggregate checksum |
| `CALCULATED` | `ALLOWANCE_REVIEW_STARTED` | `IN_REVIEW` | sealed lines, assigned reviewer |
| `IN_REVIEW` | `ALLOWANCE_CALCULATION_APPROVED` | `APPROVED` | exact Approval outcome, adjustment reason/evidence |
| `IN_REVIEW` | `ALLOWANCE_CALCULATION_RETURNED` | `DRAFT` | 기존 sealed run 덮기 금지; successor run/revision |
| `APPROVED` | `ALLOWANCE_EXPORT_GENERATED` | `EXPORTED` | exact approved checksum, generic template/version, delivery audit |
| `CALCULATED`/`IN_REVIEW`/`APPROVED` | `ALLOWANCE_CALCULATION_VOIDED` | `VOIDED` | reversal reason/approval; 지급완료 의미 아님 |

`EXPORTED`는 지급 또는 급여 반영 완료 상태가 아니다.

## 12. Search Index Entry — `SM-P1-SEARCH-INDEX-V1`

상태: `QUEUED`, `INDEXED`, `PURGE_QUEUED`, `PURGED`, `FAILED`

| From | Event | To | 필수조건 |
|---|---|---|---|
| `QUEUED` | `SEARCH_ENTRY_INDEXED` | `INDEXED` | source live, allowed policy/fields/security, content checksum |
| `QUEUED`/`INDEXED`/`FAILED` | `SEARCH_ENTRY_PURGE_QUEUED` | `PURGE_QUEUED` | source revoke/delete/policy change/security escalation |
| `PURGE_QUEUED` | `SEARCH_ENTRY_PURGED` | `PURGED` | index/cache deletion evidence |
| `QUEUED`/`PURGE_QUEUED` | `SEARCH_ENTRY_FAILED` | `FAILED` | stable safe reason, retry/idempotency evidence |
| `FAILED`/`PURGED` | `SEARCH_ENTRY_REQUEUED` | `QUEUED` | current source/policy reauthorization |

Query는 index state와 무관하게 delivery 시 source authorization을 다시 검증한다. purge 지연 중인 entry는 결과에서 deny한다.

## 13. Automated jobs

- calibration due/expiry, MSDS/effective plan change, drill/action due, allowance review due, search purge/reindex는 idempotency key를 사용한다.
- job은 상태를 추정해 건너뛰지 않고 current state/version/precondition을 guarded command에서 재검증한다.
- 실패는 stable reason code와 Audit/Outbox로 기록하며 input payload, token, object key를 로그에 남기지 않는다.
