# State Machines

## 1. Common Rules

Every machine has a stable machine ID and enumerated state/event IDs. A transition succeeds only when current state, optimistic version, actor permission, resource scope, preconditions, and online requirement are valid in one transaction.

Every successful transition writes:

- new state and incremented `version_no`;
- append-only `state_transition_history`;
- required `audit_log` event;
- domain event/outbox record when downstream work is needed.

Unknown state strings or unregistered transitions fail closed.

Legend:

- `Author`: record owner/submitter.
- `PM`: authorized internal project manager/researcher.
- `Senior`: Senior Researcher review role only.
- `Director`: Lab Director.
- `Rep`: Representative.
- `Vendor`: exact active vendor/scope.
- `System`: idempotent trusted worker.

## 2. Project

Machine: `SM-PROJECT-V1`.

States: `DRAFT`, `PLANNED`, `ACTIVE`, `ON_HOLD`, `CLOSING`, `CLOSED`, `CANCELLED`.

| From | Event | To | Actor | Preconditions / audit |
|---|---|---|---|---|
| — | `EVT-PROJECT-CREATE` | `DRAFT` | any active internal user | creator and internal identity audit; Vendor denied |
| `DRAFT` | `EVT-PROJECT-PLAN` | `PLANNED` | Author/PM | owner, objective, period and visibility set |
| `PLANNED` | `EVT-PROJECT-START` | `ACTIVE` | authorized PM/Director | start authorization; formal designation not implied |
| `ACTIVE` | `EVT-PROJECT-HOLD` | `ON_HOLD` | PM/Director | reason required |
| `ON_HOLD` | `EVT-PROJECT-RESUME` | `ACTIVE` | PM/Director | reason/audit |
| `ACTIVE`,`ON_HOLD` | `EVT-PROJECT-BEGIN-CLOSE` | `CLOSING` | PM/Director | closure checklist created |
| `CLOSING` | `EVT-PROJECT-CLOSE` | `CLOSED` | Director | blocking children evaluated; evidence retained |
| `DRAFT`,`PLANNED`,`ACTIVE`,`ON_HOLD` | `EVT-PROJECT-CANCEL` | `CANCELLED` | Director/policy approver | reason and impact required |

`CLOSED` and `CANCELLED` are terminal except a future separately approved reopen policy.

### Formal Research Project Designation

Machine: `SM-RESEARCH-PROJECT-DESIGNATION-V1`.

States: `NOT_APPLIED`, `APPLICATION_DRAFT`, `DIRECTOR_REVIEW_PENDING`, `APPROVED`, `RETURNED`, `REJECTED`, `SUSPENDED`, `REVOKED`, `EXPIRED`.

| From | Event | To | Actor | Preconditions / effect |
|---|---|---|---|---|
| `NOT_APPLIED`,`RETURNED`,`REJECTED` | `EVT-RP-APPLICATION-CREATE` | `APPLICATION_DRAFT` | Project owner/authorized internal | new version linked to ordinary Project |
| `APPLICATION_DRAFT` | `EVT-RP-APPLICATION-SUBMIT` | `DIRECTOR_REVIEW_PENDING` | applicant | exact plan/team/budget/output version sealed |
| `DIRECTOR_REVIEW_PENDING` | `EVT-RP-DIRECTOR-CONSENT` | `APPROVED` | Director | final review/consent; immutable designation created |
| `DIRECTOR_REVIEW_PENDING` | `EVT-RP-RETURN` | `RETURNED` | Director | reason; new version required |
| `DIRECTOR_REVIEW_PENDING` | `EVT-RP-REJECT` | `REJECTED` | Director | reason; ordinary Project remains |
| `APPROVED` | `EVT-RP-SUSPEND` | `SUSPENDED` | Director | reason/effective date; allowance policy suspended |
| `SUSPENDED` | `EVT-RP-REINSTATE` | `APPROVED` | Director | reviewed reinstatement |
| `APPROVED`,`SUSPENDED` | `EVT-RP-REVOKE` | `REVOKED` | Director | reason; no deletion of history |
| `APPROVED` | `EVT-RP-EXPIRE` | `EXPIRED` | System | approved period ended; audit/outbox |

Project lifecycle changes never write this state directly. Formal-research labels, allowance activation, and official exports derive from an active `APPROVED` designation.

## 3. WBS Node / Task

Machine: `SM-WBS-V1`.

States: `BACKLOG`, `READY`, `IN_PROGRESS`, `BLOCKED`, `REVIEW_REQUIRED`, `DONE`, `CANCELLED`.

| From | Event | To | Actor | Preconditions |
|---|---|---|---|---|
| — | `EVT-WBS-CREATE` | `BACKLOG` | PM | parent/scope valid |
| `BACKLOG` | `EVT-WBS-READY` | `READY` | PM | required assignment/dependencies |
| `READY` | `EVT-WBS-START` | `IN_PROGRESS` | assignee/PM/Vendor in scope | project active |
| `IN_PROGRESS` | `EVT-WBS-BLOCK` | `BLOCKED` | assignee/PM/Vendor in scope | blocking reason required |
| `BLOCKED` | `EVT-WBS-UNBLOCK` | `IN_PROGRESS` | assignee/PM | resolution note |
| `IN_PROGRESS` | `EVT-WBS-SUBMIT-REVIEW` | `REVIEW_REQUIRED` | assignee/Vendor | evidence/deliverable rule |
| `REVIEW_REQUIRED` | `EVT-WBS-ACCEPT` | `DONE` | internal reviewer | vendor cannot self-accept |
| `REVIEW_REQUIRED` | `EVT-WBS-REWORK` | `IN_PROGRESS` | internal reviewer | reason/NCR when required |
| non-terminal | `EVT-WBS-CANCEL` | `CANCELLED` | PM/Director | dependency impact and reason |

Parent progress is derived; setting a parent `DONE` cannot silently complete children.

## 4. Vendor Contract

Machine: `SM-VENDOR-CONTRACT-V1`.

States: `DRAFT`, `INTERNAL_REVIEW`, `NEGOTIATION`, `APPROVAL_PENDING`, `SIGNED`, `ACTIVE`, `CHANGE_PENDING`, `PERFORMANCE_COMPLETE`, `CLOSING`, `CLOSED`, `TERMINATION_REVIEW`, `TERMINATED`.

| From | Event | To | Actor | Preconditions |
|---|---|---|---|---|
| — | `EVT-CONTRACT-CREATE` | `DRAFT` | internal contract manager | vendor exists |
| `DRAFT` | `EVT-CONTRACT-REQUEST-REVIEW` | `INTERNAL_REVIEW` | Author | mandatory draft docs |
| `INTERNAL_REVIEW` | `EVT-CONTRACT-BEGIN-NEGOTIATION` | `NEGOTIATION` | Director/authorized | review outcome |
| `NEGOTIATION` | `EVT-CONTRACT-SUBMIT-APPROVAL` | `APPROVAL_PENDING` | Author | exact version sealed |
| `APPROVAL_PENDING` | `EVT-CONTRACT-APPROVED-SIGNED` | `SIGNED` | system after approval + signature evidence | immutable signed version |
| `SIGNED` | `EVT-CONTRACT-ACTIVATE` | `ACTIVE` | contract manager | effective date and scopes |
| `ACTIVE` | `EVT-CONTRACT-REQUEST-CHANGE` | `CHANGE_PENDING` | authorized internal/Vendor request | ECR/change record |
| `CHANGE_PENDING` | `EVT-CONTRACT-CHANGE-EFFECTIVE` | `ACTIVE` | authorized after approval/signature | new immutable contract version |
| `ACTIVE` | `EVT-CONTRACT-PERFORMANCE-COMPLETE` | `PERFORMANCE_COMPLETE` | Director | deliverables/inspection checks |
| `PERFORMANCE_COMPLETE` | `EVT-CONTRACT-BEGIN-CLOSE` | `CLOSING` | contract manager | handover/payment status/guarantee checks |
| `CLOSING` | `EVT-CONTRACT-CLOSE` | `CLOSED` | Director/policy approver | access revocation and records retained |
| `ACTIVE`,`CHANGE_PENDING`,`PERFORMANCE_COMPLETE` | `EVT-CONTRACT-REVIEW-TERMINATION` | `TERMINATION_REVIEW` | Director | breach/evidence/reason |
| `TERMINATION_REVIEW` | `EVT-CONTRACT-TERMINATE` | `TERMINATED` | policy approver | legal/approval requirements met |
| `TERMINATION_REVIEW` | `EVT-CONTRACT-CONTINUE` | prior active state | policy approver | remedy/decision recorded |

Acceptance or payment does not change warranty responsibility.

M07 implementation notes:

- Contract creation and every lifecycle transition validate trusted actor, current state, expected version, exact immutable ContractVersion and required evidence before state/audit/outbox persistence.
- `APPROVAL_PENDING → SIGNED` requires the exact approved ContractVersion plus signature evidence; an amendment is a strictly newer same-contract version and never overwrites the signed predecessor.
- `SIGNED → ACTIVE` creates reviewed Vendor Contract grants in the same transaction. `CLOSED` or `TERMINATED` revokes them in the terminal transition transaction; expiry and disabled membership deny immediately.
- Contract list-safe projection contains no finance/payment/internal-evaluation fields. Vendor finance detail is a separate exact-scope and explicit-permission projection.
- Deliverable acceptance and payment eligibility are not decided in M07. No Contract or Deliverable transition waives Vendor professional, latent-defect, warranty or indemnity responsibility.

## 5. Deliverable

Machine: `SM-DELIVERABLE-V1`.

States: `EXPECTED`, `IN_PROGRESS`, `SUBMITTED`, `UNDER_REVIEW`, `CORRECTION_REQUIRED`, `ACCEPTED`, `REJECTED`, `SUPERSEDED`, `CANCELLED`.

| From | Event | To | Actor |
|---|---|---|---|
| — | `EVT-DELIVERABLE-DEFINE` | `EXPECTED` | contract manager |
| `EXPECTED` | `EVT-DELIVERABLE-START` | `IN_PROGRESS` | Vendor/assignee |
| `EXPECTED`,`IN_PROGRESS`,`CORRECTION_REQUIRED` | `EVT-DELIVERABLE-SUBMIT` | `SUBMITTED` | Vendor/assignee |
| `SUBMITTED` | `EVT-DELIVERABLE-REVIEW-START` | `UNDER_REVIEW` | internal reviewer |
| `UNDER_REVIEW` | `EVT-DELIVERABLE-REQUEST-CORRECTION` | `CORRECTION_REQUIRED` | internal reviewer |
| `UNDER_REVIEW` | `EVT-DELIVERABLE-ACCEPT` | `ACCEPTED` | authorized inspection result |
| `UNDER_REVIEW` | `EVT-DELIVERABLE-REJECT` | `REJECTED` | authorized internal |
| `ACCEPTED` | `EVT-DELIVERABLE-SUPERSEDE` | `SUPERSEDED` | approved change/new version |
| non-terminal | `EVT-DELIVERABLE-CANCEL` | `CANCELLED` | contract manager |

Each submission references an immutable version and evidence manifest.

## 6. Inspection and Reinspection

Machine: `SM-INSPECTION-V1`.

Lifecycle states: `REQUESTED`, `SCHEDULED`, `IN_PROGRESS`, `DECISION_PENDING`, `CORRECTION_REQUIRED`, `REINSPECTION_PENDING`, `COMPLETED`, `CANCELLED`.

Attempt dispositions: `ACCEPTED`, `PARTIAL_ACCEPTANCE`, `CONDITIONAL_ACCEPTANCE`, `CORRECTION_REQUESTED`, `REJECTED`, `UNABLE_TO_VERIFY`.

| From | Event | To | Actor | Effect |
|---|---|---|---|---|
| — | `EVT-INSPECTION-REQUEST` | `REQUESTED` | Vendor/internal | exact version + self-test evidence |
| `REQUESTED` | `EVT-INSPECTION-SCHEDULE` | `SCHEDULED` | internal inspector | schedule/criteria snapshot |
| `SCHEDULED` | `EVT-INSPECTION-START` | `IN_PROGRESS` | inspector | open attempt N |
| `IN_PROGRESS` | `EVT-INSPECTION-SUBMIT-DECISION` | `DECISION_PENDING` | inspector | attempt results sealed |
| `DECISION_PENDING` | `EVT-INSPECTION-ACCEPT` | `COMPLETED` | authorized decider | sealed weighted score; accepted/partial/conditional; payment proposal created |
| `DECISION_PENDING` | `EVT-INSPECTION-REQUEST-CORRECTION` | `CORRECTION_REQUIRED` | authorized decider | NCR/CAR link when required |
| `DECISION_PENDING` | `EVT-INSPECTION-REJECT` | `COMPLETED` | authorized decider | rejected disposition |
| `CORRECTION_REQUIRED` | `EVT-INSPECTION-CORRECTION-SUBMITTED` | `REINSPECTION_PENDING` | Vendor/assignee | new deliverable/evidence version |
| `REINSPECTION_PENDING` | `EVT-INSPECTION-REINSPECT` | `IN_PROGRESS` | inspector | create attempt N+1 |
| `REQUESTED`,`SCHEDULED` | `EVT-INSPECTION-CANCEL` | `CANCELLED` | internal authorized | reason required |

Prior attempts are immutable. Repeated critical-failure counts drive alerts/review but do not automatically terminate a contract without its own authorized transition.

### Acceptance Payment Decision

Machine: `SM-ACCEPTANCE-PAYMENT-V1`.

States: `CALCULATED`, `ADJUSTMENT_PROPOSED`, `APPROVAL_PENDING`, `APPROVED`, `HELD_FOR_CONDITIONS`, `ELIGIBLE_FOR_EXTERNAL_PAYMENT`, `CANCELLED`.

| From | Event | To | Actor | Condition |
|---|---|---|---|---|
| — | `EVT-ACCEPTANCE-PAYMENT-CALCULATE` | `CALCULATED` | System | sealed attempt + policy version |
| `CALCULATED` | `EVT-ACCEPTANCE-PAYMENT-ADJUST` | `ADJUSTMENT_PROPOSED` | contract owner | 0–100%, reason and evidence |
| `CALCULATED`,`ADJUSTMENT_PROPOSED` | `EVT-ACCEPTANCE-PAYMENT-SUBMIT` | `APPROVAL_PENDING` | contract owner | amount-band route; upward change always reviewed |
| `APPROVAL_PENDING` | `EVT-ACCEPTANCE-PAYMENT-APPROVE` | `APPROVED` | Approval Engine | calculated and adjusted values both frozen |
| `APPROVED` | `EVT-ACCEPTANCE-PAYMENT-HOLD` | `HELD_FOR_CONDITIONS` | System/policy | partial/conditional residual obligations |
| `APPROVED`,`HELD_FOR_CONDITIONS` | `EVT-ACCEPTANCE-PAYMENT-ELIGIBLE` | `ELIGIBLE_FOR_EXTERNAL_PAYMENT` | authorized internal | all current release conditions met |

This machine marks eligibility only; it does not transfer funds. Reinspection creates a new decision and never overwrites the prior payment basis.

M08 implementation notes:

- An InspectionAttempt seals one exact DeliverableVersion, ChecklistVersion, criterion-result set, policy version, checksum and evidence manifest. Earlier attempts are append-only.
- Checklist sealing requires normalized criterion weights totaling exactly 100. Critical failure is evaluated before score-band disposition and cannot be hidden by aggregate achievement.
- `ACCEPTED`, `CONDITIONAL_ACCEPTANCE`, `PARTIAL_ACCEPTANCE` and `REJECTED` remain distinct persisted dispositions. Conditional and partial results require their typed residual/usable-part obligations.
- AcceptancePaymentDecision preserves calculated achievement, system proposal, adjustment request and final approved rate separately. Approval completion also freezes the policy-rounded approved payable amount; any current held amount/unpaid remainder must be equal and cannot exceed it. Eligibility clears the current held/unpaid values to zero while retaining the approved amount and audit history. Completion and eligibility do not transfer funds.
- Repeated critical failures create derived alert/review facts only. They do not transition the Contract automatically.

## 7. NCR and CAR

NCR machine `SM-NCR-V1`: `DRAFT`, `ISSUED`, `CONTAINMENT`, `ROOT_CAUSE_REQUIRED`, `ACTION_PLAN_REVIEW`, `IMPLEMENTING`, `VERIFICATION`, `CLOSED`, `REOPENED`, `CANCELLED`.

CAR machine `SM-CAR-V1`: `PROPOSED`, `ACCEPTED`, `IN_PROGRESS`, `VERIFICATION_REQUIRED`, `EFFECTIVE`, `INEFFECTIVE`, `CLOSED`, `CANCELLED`.

Key transitions:

| Machine | Event | From → To | Actor / condition |
|---|---|---|---|
| NCR | `EVT-NCR-ISSUE` | `DRAFT` → `ISSUED` | authorized internal; evidence required |
| NCR | `EVT-NCR-CONTAIN` | `ISSUED` → `CONTAINMENT` | assignee/Vendor |
| NCR | `EVT-NCR-REQUEST-ROOT-CAUSE` | `CONTAINMENT` → `ROOT_CAUSE_REQUIRED` | internal owner |
| NCR | `EVT-NCR-SUBMIT-PLAN` | `ROOT_CAUSE_REQUIRED` → `ACTION_PLAN_REVIEW` | responsible party |
| NCR | `EVT-NCR-ACCEPT-PLAN` | `ACTION_PLAN_REVIEW` → `IMPLEMENTING` | internal reviewer |
| NCR | `EVT-NCR-READY-VERIFY` | `IMPLEMENTING` → `VERIFICATION` | responsible party |
| NCR | `EVT-NCR-CLOSE` | `VERIFICATION` → `CLOSED` | Director/quality authority; effective CARs |
| NCR | `EVT-NCR-REOPEN` | `CLOSED` → `REOPENED` | quality authority; reason/evidence |
| CAR | `EVT-CAR-ACCEPT` | `PROPOSED` → `ACCEPTED` | internal reviewer |
| CAR | `EVT-CAR-START` | `ACCEPTED` → `IN_PROGRESS` | action owner |
| CAR | `EVT-CAR-SUBMIT-VERIFY` | `IN_PROGRESS` → `VERIFICATION_REQUIRED` | action owner |
| CAR | `EVT-CAR-VERIFY-EFFECTIVE` | `VERIFICATION_REQUIRED` → `EFFECTIVE` | independent verifier |
| CAR | `EVT-CAR-VERIFY-INEFFECTIVE` | `VERIFICATION_REQUIRED` → `INEFFECTIVE` | independent verifier |
| CAR | `EVT-CAR-CLOSE` | `EFFECTIVE` → `CLOSED` | quality authority |
| CAR | `EVT-CAR-REWORK` | `INEFFECTIVE` → `IN_PROGRESS` | action owner |

## 8. ECR and ECO

ECR machine `SM-ECR-V1`: `DRAFT`, `IMPACT_ANALYSIS`, `REVIEW_PENDING`, `APPROVAL_PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `CONVERTED_TO_ECO`.

ECO machine `SM-ECO-V1`: `DRAFT`, `APPROVAL_PENDING`, `RELEASED`, `IMPLEMENTING`, `VERIFICATION_PENDING`, `EFFECTIVE`, `CLOSED`, `SUSPENDED`, `CANCELLED`.

| Machine | Event | From → To | Actor / precondition |
|---|---|---|---|
| ECR | `EVT-ECR-START-ANALYSIS` | `DRAFT` → `IMPACT_ANALYSIS` | originator/owner |
| ECR | `EVT-ECR-SUBMIT-REVIEW` | `IMPACT_ANALYSIS` → `REVIEW_PENDING` | complete impact fields |
| ECR | `EVT-ECR-REVIEWED` | `REVIEW_PENDING` → `APPROVAL_PENDING` | Senior/technical reviewers; review only |
| ECR | `EVT-ECR-APPROVE` | `APPROVAL_PENDING` → `APPROVED` | applicable official approver |
| ECR | `EVT-ECR-REJECT` | pending → `REJECTED` | applicable approver |
| ECR | `EVT-ECR-CREATE-ECO` | `APPROVED` → `CONVERTED_TO_ECO` | change manager |
| ECO | `EVT-ECO-SUBMIT` | `DRAFT` → `APPROVAL_PENDING` | exact changes/revisions defined |
| ECO | `EVT-ECO-RELEASE` | `APPROVAL_PENDING` → `RELEASED` | official approval completed |
| ECO | `EVT-ECO-START` | `RELEASED` → `IMPLEMENTING` | assigned implementer |
| ECO | `EVT-ECO-SUBMIT-VERIFY` | `IMPLEMENTING` → `VERIFICATION_PENDING` | artifacts/version evidence |
| ECO | `EVT-ECO-VERIFY` | `VERIFICATION_PENDING` → `EFFECTIVE` | authorized verifier |
| ECO | `EVT-ECO-CLOSE` | `EFFECTIVE` → `CLOSED` | change manager |
| ECO | `EVT-ECO-SUSPEND` | `RELEASED`,`IMPLEMENTING` → `SUSPENDED` | authorized owner; reason |

## 9. Approval

Machine: `SM-APPROVAL-V1`.

Instance states: `DRAFT`, `SUBMITTED`, `IN_PROGRESS`, `REJECTED`, `RECALL_REQUESTED`, `RECALLED`, `COMPLETED`, `CANCELLED`.

Step states: `WAITING`, `ACTIVE`, `REVIEWED`, `AGREED`, `APPROVED`, `REJECTED`, `SKIPPED_BY_POLICY`, `CANCELLED`.

| From | Event | To | Actor | Preconditions |
|---|---|---|---|---|
| — | `EVT-APPROVAL-CREATE` | `DRAFT` | Author | subject version exists |
| `DRAFT` | `EVT-APPROVAL-SUBMIT` | `SUBMITTED` | Author | line/policy/subject snapshot valid |
| `SUBMITTED` | `EVT-APPROVAL-ACTIVATE` | `IN_PROGRESS` | System | first steps activated atomically |
| `IN_PROGRESS` | `EVT-APPROVAL-REVIEW` | `IN_PROGRESS` | designated reviewer | Senior allowed; not approval |
| `IN_PROGRESS` | `EVT-APPROVAL-AGREE` | `IN_PROGRESS` | designated participant | step completion rule |
| `IN_PROGRESS` | `EVT-APPROVAL-REFERENCE` | `IN_PROGRESS` | designated reference recipient | receipt evidence; `approval.step.reference` |
| `IN_PROGRESS` | `EVT-APPROVAL-APPROVE` | `IN_PROGRESS` or `COMPLETED` | designated official approver | position/role; ANY_ONE/ALL rules |
| `IN_PROGRESS` | `EVT-APPROVAL-REJECT` | `REJECTED` | designated authorized participant | reason required |
| `SUBMITTED`,`IN_PROGRESS` | `EVT-APPROVAL-REQUEST-RECALL` | `RECALL_REQUESTED` | Author | policy permits |
| `RECALL_REQUESTED` | `EVT-APPROVAL-RECALL` | `RECALLED` | System/policy authority | no conflicting terminal action |
| `DRAFT`,`RECALLED`,`REJECTED` | `EVT-APPROVAL-CANCEL` | `CANCELLED` | Author/authorized | record retained |

Completion freezes the subject version. Resubmission creates a new generation/instance linked to the prior one.

Transition event IDs above describe state-machine commands. Append-only domain/outbox completion facts use the corresponding past-tense IDs such as `EVT-APPROVAL-SUBMITTED`, `EVT-APPROVAL-REFERENCE-RECEIVED`, and `EVT-APPROVAL-COMPLETED`; the mapping is explicit and both vocabularies are stable. Current state, exact participant, policy/subject snapshot, optimistic versions, action, audit transition, outbox event, and subject outcome are validated or persisted in one transaction.

## 10. Purchase

Machine: `SM-PURCHASE-V1`.

States: `QUOTE_COLLECTION`, `REQUEST_DRAFT`, `APPROVAL_PENDING`, `REQUEST_APPROVED`, `RESOLUTION_DRAFT`, `RESOLVED`, `PAYMENT_PENDING_EXTERNAL`, `PAYMENT_CONFIRMED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `INSPECTION_PENDING`, `CORRECTION_REQUIRED`, `COMPLETED`, `CANCELLED`.

| Event | From → To | Actor / condition |
|---|---|---|
| `EVT-PURCHASE-CREATE` | — → `QUOTE_COLLECTION` | authorized researcher |
| `EVT-PURCHASE-DRAFT-REQUEST` | `QUOTE_COLLECTION` → `REQUEST_DRAFT` | requester; quote policy checked |
| `EVT-PURCHASE-SUBMIT` | `REQUEST_DRAFT` → `APPROVAL_PENDING` | requester; immutable request version |
| `EVT-PURCHASE-APPROVED` | `APPROVAL_PENDING` → `REQUEST_APPROVED` | Approval Engine completed |
| `EVT-PURCHASE-CREATE-RESOLUTION` | `REQUEST_APPROVED` → `RESOLUTION_DRAFT` | authorized internal |
| `EVT-PURCHASE-RESOLVE` | `RESOLUTION_DRAFT` → `RESOLVED` | applicable approval/policy |
| `EVT-PURCHASE-AWAIT-PAYMENT` | `RESOLVED` → `PAYMENT_PENDING_EXTERNAL` | system/internal |
| `EVT-PURCHASE-CONFIRM-PAYMENT` | `PAYMENT_PENDING_EXTERNAL` → `PAYMENT_CONFIRMED` | currently external readback/authorized recorder; HQ viewer cannot mutate by default |
| `EVT-PURCHASE-RECEIVE-PART` | payment/receipt state → `PARTIALLY_RECEIVED` | receiver |
| `EVT-PURCHASE-RECEIVE` | payment/receipt state → `RECEIVED` | receiver |
| `EVT-PURCHASE-REQUEST-INSPECTION` | `RECEIVED` → `INSPECTION_PENDING` | receiver/inspector |
| `EVT-PURCHASE-INSPECTION-FAIL` | `INSPECTION_PENDING` → `CORRECTION_REQUIRED` | inspector |
| `EVT-PURCHASE-INSPECTION-PASS` | `INSPECTION_PENDING` → `COMPLETED` | inspector |
| `EVT-PURCHASE-RESOLVE-CORRECTION` | `CORRECTION_REQUIRED` → `INSPECTION_PENDING` | supplier/internal owner |

Cancellation is policy-limited and cannot erase approved/payment/receipt evidence.

## 11. Research Note

Machine: `SM-RESEARCH-NOTE-V1`.

States: `DRAFT`, `SENIOR_REVIEW_PENDING`, `REVISION_REQUIRED`, `DIRECTOR_FINALIZATION_PENDING`, `FINALIZED`, `CORRECTED_BY_ADDENDUM`, `VOIDED_BY_POLICY`.

| From | Event | To | Actor |
|---|---|---|---|
| — | `EVT-NOTE-CREATE` | `DRAFT` | Author |
| `DRAFT` | `EVT-NOTE-SUBMIT-SENIOR` | `SENIOR_REVIEW_PENDING` | Author |
| `DRAFT` | `EVT-NOTE-SUBMIT-DIRECTOR` | `DIRECTOR_FINALIZATION_PENDING` | Author when Senior review not required |
| `SENIOR_REVIEW_PENDING` | `EVT-NOTE-REQUEST-REVISION` | `REVISION_REQUIRED` | Senior |
| `REVISION_REQUIRED` | `EVT-NOTE-RESUBMIT` | review or director pending | Author |
| `SENIOR_REVIEW_PENDING` | `EVT-NOTE-REVIEWED` | `DIRECTOR_FINALIZATION_PENDING` | Senior; review action |
| `DIRECTOR_FINALIZATION_PENDING` | `EVT-NOTE-FINALIZE` | `FINALIZED` | Director only |
| `FINALIZED` | `EVT-NOTE-ADD-CORRECTION` | `CORRECTED_BY_ADDENDUM` | authorized author/Director |

Original content remains immutable. No Representative approval transition exists.

## 12. Technical Document Access Grant

Machine: `SM-TECHDOC-GRANT-V1`.

States: `REQUESTED`, `APPROVAL_PENDING`, `APPROVED_SCHEDULED`, `ACTIVE`, `REJECTED`, `REVOKED`, `EXPIRED`, `CANCELLED`.

| From | Event | To | Actor | Preconditions |
|---|---|---|---|---|
| — | `EVT-TECHDOC-ACCESS-REQUEST` | `REQUESTED` | authorized requester | exact user/vendor/version/operation/period |
| `REQUESTED` | `EVT-TECHDOC-ACCESS-SUBMIT` | `APPROVAL_PENDING` | requester | L2/L3/L4 policy route |
| `APPROVAL_PENDING` | `EVT-TECHDOC-ACCESS-APPROVE` | `APPROVED_SCHEDULED` or `ACTIVE` | Approval Engine | required approvers complete |
| `APPROVAL_PENDING` | `EVT-TECHDOC-ACCESS-REJECT` | `REJECTED` | approver | reason |
| `APPROVED_SCHEDULED` | `EVT-TECHDOC-ACCESS-ACTIVATE` | `ACTIVE` | System | start time reached and scopes active |
| `ACTIVE`,`APPROVED_SCHEDULED` | `EVT-TECHDOC-ACCESS-REVOKE` | `REVOKED` | Director/security authority | immediate deny/audit |
| `ACTIVE`,`APPROVED_SCHEDULED` | `EVT-TECHDOC-ACCESS-EXPIRE` | `EXPIRED` | System/read-time enforcement | end time reached |
| `REQUESTED` | `EVT-TECHDOC-ACCESS-CANCEL` | `CANCELLED` | requester |

Account/vendor/scope disablement denies access even before the persisted state worker records expiry/revocation.

### L3/L4 Controlled Copy

Machine: `SM-TECHDOC-COPY-V1`.

States: `REQUESTED`, `APPROVAL_PENDING`, `APPROVED`, `RENDERED`, `PRINTED`, `HANDED_OVER`, `RETURN_DUE`, `RETURNED`, `DESTROYED`, `OVERDUE`, `CANCELLED`.

| From | Event | To | Actor | Condition |
|---|---|---|---|---|
| — | `EVT-TECHCOPY-REQUEST` | `REQUESTED` | authorized internal | exact version/recipient/purpose/copy count |
| `REQUESTED` | `EVT-TECHCOPY-SUBMIT` | `APPROVAL_PENDING` | requester | L3 Director; L4 Director + Rep route |
| `APPROVAL_PENDING` | `EVT-TECHCOPY-APPROVE` | `APPROVED` | Approval Engine | approval snapshot complete |
| `APPROVED` | `EVT-TECHCOPY-RENDER` | `RENDERED` | internal document service | unique copy number and watermark |
| `RENDERED` | `EVT-TECHCOPY-PRINT` | `PRINTED` | authorized internal | printer/time/page count audit |
| `PRINTED` | `EVT-TECHCOPY-HANDOVER` | `HANDED_OVER` | internal custodian | recipient acknowledgment |
| `HANDED_OVER` | `EVT-TECHCOPY-RETURN-DUE` | `RETURN_DUE` | System | use period ended |
| `HANDED_OVER`,`RETURN_DUE`,`OVERDUE` | `EVT-TECHCOPY-RETURN` | `RETURNED` | custodian | all numbered pages reconciled |
| `HANDED_OVER`,`RETURN_DUE`,`RETURNED`,`OVERDUE` | `EVT-TECHCOPY-DESTROY` | `DESTROYED` | authorized custodian | destruction evidence |
| `RETURN_DUE` | `EVT-TECHCOPY-OVERDUE` | `OVERDUE` | System | escalation/audit |

No transition grants vendor download, source-file delivery, or recipient-controlled printing.

## 13. Guarantee and Warranty Issue

Guarantee machine `SM-GUARANTEE-V1`: `DRAFT`, `ACTIVE`, `CLAIM_REVIEW`, `CLAIMED`, `RELEASE_PENDING`, `RELEASED`, `EXPIRED`, `CANCELLED`.

Warranty machine `SM-WARRANTY-V1`: `OPEN`, `VENDOR_NOTIFIED`, `PLAN_PENDING`, `REMEDIATION`, `VERIFICATION`, `RESOLVED`, `REOPENED`, `CLAIM_REVIEW`, `CLOSED`.

| Machine | Event | From → To | Actor |
|---|---|---|---|
| Guarantee | `EVT-GUARANTEE-ACTIVATE` | `DRAFT` → `ACTIVE` | contract manager |
| Guarantee | `EVT-GUARANTEE-REVIEW-CLAIM` | `ACTIVE` → `CLAIM_REVIEW` | Director/authorized |
| Guarantee | `EVT-GUARANTEE-CLAIM` | `CLAIM_REVIEW` → `CLAIMED` | policy approver |
| Guarantee | `EVT-GUARANTEE-REQUEST-RELEASE` | `ACTIVE` → `RELEASE_PENDING` | contract manager |
| Guarantee | `EVT-GUARANTEE-RELEASE` | `RELEASE_PENDING` → `RELEASED` | authorized approver |
| Guarantee | `EVT-GUARANTEE-EXPIRE` | `ACTIVE` → `EXPIRED` | System after open-issue checks/alerts |
| Warranty | `EVT-WARRANTY-OPEN` | — → `OPEN` | authorized reporter |
| Warranty | `EVT-WARRANTY-NOTIFY` | `OPEN` → `VENDOR_NOTIFIED` | internal owner |
| Warranty | `EVT-WARRANTY-REQUEST-PLAN` | `VENDOR_NOTIFIED` → `PLAN_PENDING` | internal owner |
| Warranty | `EVT-WARRANTY-START-REMEDIATION` | `PLAN_PENDING` → `REMEDIATION` | Vendor/internal owner |
| Warranty | `EVT-WARRANTY-SUBMIT-VERIFY` | `REMEDIATION` → `VERIFICATION` | responsible party |
| Warranty | `EVT-WARRANTY-RESOLVE` | `VERIFICATION` → `RESOLVED` | verifier |
| Warranty | `EVT-WARRANTY-CLOSE` | `RESOLVED` → `CLOSED` | Director/owner |
| Warranty | `EVT-WARRANTY-REOPEN` | `RESOLVED`,`CLOSED` → `REOPENED` | authorized owner |
| Warranty | `EVT-WARRANTY-REVIEW-CLAIM` | active nonterminal → `CLAIM_REVIEW` | Director |

## 14. Document Lifecycle

Machine: `SM-DOCUMENT-V1`.

States: `DRAFT`, `REVIEW_READY`, `APPROVAL_PENDING`, `APPROVED`, `REJECTED`, `RECALLED`, `SUPERSEDED`, `RETENTION_HOLD`, `DISPOSAL_REQUESTED`, `QUARANTINED`, `DISPOSED`.

| From | Event | To | Actor | Effect |
|---|---|---|---|---|
| — | `EVT-DOCUMENT-CREATE` | `DRAFT` | Author | template version snapshot |
| `DRAFT` | `EVT-DOCUMENT-SEAL` | `REVIEW_READY` | Author | immutable candidate version |
| `REVIEW_READY` | `EVT-DOCUMENT-SUBMIT` | `APPROVAL_PENDING` | Author | Approval Instance created |
| `APPROVAL_PENDING` | `EVT-DOCUMENT-APPROVE` | `APPROVED` | System after approval | approved version immutable |
| `APPROVAL_PENDING` | `EVT-DOCUMENT-REJECT` | `REJECTED` | System after rejection | actions retained |
| `APPROVAL_PENDING` | `EVT-DOCUMENT-RECALL` | `RECALLED` | System after recall | new version required for change |
| `APPROVED` | `EVT-DOCUMENT-REVISE` | `SUPERSEDED` | authorized author | new DocumentVersion/possibly new lifecycle head |

M05 implementation notes:

- `DRAFT` edits require a fresh trusted content-validation evidence record; checksum is recalculated in PostgreSQL.
- Seal locks the DocumentVersion and active Attachment rows, requires every active attachment to be `AVAILABLE`, and stores one full manifest checksum/evidence snapshot.
- `APPROVAL_PENDING` outcomes are applied by the exact typed Approval subject in the same transaction as Approval audit/transition/outbox.
- `REJECTED`/`RECALLED` cannot be edited in place; resubmission requires a strictly newer same-root DocumentVersion.
- `APPROVED` to `SUPERSEDED` changes only lifecycle/head linkage. Approved content, template, renderer, security and manifest fields remain immutable.
- Attachment lifecycle is `UPLOAD_INTENDED → UPLOADED → SCANNING → AVAILABLE | QUARANTINED`; FILE_INGEST and FILE_SCANNER are distinct trusted system actors.

| protected | `EVT-DOCUMENT-HOLD` | `RETENTION_HOLD` | document/security authority | disposal blocked |
| eligible | `EVT-DOCUMENT-REQUEST-DISPOSAL` | `DISPOSAL_REQUESTED` | authorized requester | reason/retention check |
| `DISPOSAL_REQUESTED` | `EVT-DOCUMENT-QUARANTINE` | `QUARANTINED` | authorized after required approval | technical docs require Rep approval |
| `QUARANTINED` | `EVT-DOCUMENT-DISPOSE` | `DISPOSED` | retention worker/authorized | permanent audit/hash remains |

Technical documents do not transition directly from approved to disposed. Superior regulation and legal-hold rules override the default retention policy.

M06 implementation notes:

- Project/WBS commands validate trusted actor, exact Project scope, current state, expected version and preconditions before mutation; transition, audit and outbox evidence commit atomically.
- Project creation is available to every active internal user. Formal designation is a separate `APPLICATION_DRAFT → DIRECTOR_REVIEW_PENDING → APPROVED | RETURNED | REJECTED` machine bound to an exact sealed application version.
- `APPROVED` requires exactly one `POSITION_LAB_DIRECTOR` approval step. Senior and Representative are not designation steps. Applicant recall maps to `RETURNED`; a Director return uses stable reason `RP-RETURNED-FOR-REVISION`, while a final rejection remains `REJECTED`.
- Returned, rejected or recalled content is never edited in place; resubmission creates a strictly newer same-root application version. Project `CLOSING`/`CLOSED`/reopen commands remain disabled until `OD-014` is resolved.

## 15. Safety Inspection and Incident

Safety Inspection machine `SM-SAFETY-INSPECTION-V1`: `PLANNED`, `IN_PROGRESS`, `FINDINGS_OPEN`, `STOP_WORK`, `CORRECTION_PENDING`, `VERIFICATION`, `CLOSED`, `CANCELLED`.

Safety Incident machine `SM-SAFETY-INCIDENT-V1`: `REPORTED`, `EMERGENCY_RESPONSE`, `SITE_SECURED`, `INVESTIGATION`, `RECURRENCE_ACTION`, `VERIFICATION`, `CLOSED`.

| Machine | Event | From → To | Actor / condition |
|---|---|---|---|
| Inspection | `EVT-SAFETY-INSPECTION-START` | `PLANNED` → `IN_PROGRESS` | Safety Manager/team coordinator |
| Inspection | `EVT-SAFETY-FINDINGS-ISSUE` | `IN_PROGRESS` → `FINDINGS_OPEN` | inspector; evidence |
| Inspection | `EVT-SAFETY-STOP-WORK` | `IN_PROGRESS`,`FINDINGS_OPEN` → `STOP_WORK` | Safety Manager/Director; imminent risk |
| Inspection | `EVT-SAFETY-CORRECTION-ASSIGN` | `FINDINGS_OPEN`,`STOP_WORK` → `CORRECTION_PENDING` | Safety Manager/Director |
| Inspection | `EVT-SAFETY-SUBMIT-VERIFY` | `CORRECTION_PENDING` → `VERIFICATION` | responsible owner |
| Inspection | `EVT-SAFETY-VERIFY-CLOSE` | `VERIFICATION` → `CLOSED` | Safety Manager/Director |
| Inspection | `EVT-SAFETY-VERIFY-FAIL` | `VERIFICATION` → `CORRECTION_PENDING` | verifier |
| Incident | `EVT-SAFETY-INCIDENT-REPORT` | — → `REPORTED` | any authorized reporter |
| Incident | `EVT-SAFETY-EMERGENCY-RESPOND` | `REPORTED` → `EMERGENCY_RESPONSE` | Safety Manager/emergency actor |
| Incident | `EVT-SAFETY-SECURE-SITE` | `EMERGENCY_RESPONSE` → `SITE_SECURED` | authorized responder |
| Incident | `EVT-SAFETY-START-INVESTIGATION` | `SITE_SECURED` → `INVESTIGATION` | Safety Manager; 48-hour SLA clock |
| Incident | `EVT-SAFETY-SET-RECURRENCE-ACTION` | `INVESTIGATION` → `RECURRENCE_ACTION` | Director/Safety Manager |
| Incident | `EVT-SAFETY-SUBMIT-VERIFY` | `RECURRENCE_ACTION` → `VERIFICATION` | action owner |
| Incident | `EVT-SAFETY-CLOSE` | `VERIFICATION` → `CLOSED` | Director; effectiveness verified |

Missed inspection/training/investigation SLAs create alerts and audit events; they do not fabricate completion.

## 16. Research Allowance Evaluation

Machine: `SM-ALLOWANCE-EVALUATION-V1`.

States: `POLICY_REQUIRED`, `EVIDENCE_COLLECTION`, `DIRECTOR_EVALUATION`, `REPRESENTATIVE_REVIEW`, `DECIDED`, `TAX_REVIEW`, `EXPORT_READY`, `EXPORTED_REFERENCE`, `RETURNED`, `CANCELLED`.

| Event | From → To | Actor / condition |
|---|---|---|
| `EVT-ALLOWANCE-OPEN` | — → `POLICY_REQUIRED` | authorized evaluator; exact project/period/subject |
| `EVT-ALLOWANCE-COLLECT-EVIDENCE` | `POLICY_REQUIRED` → `EVIDENCE_COLLECTION` | authorized evaluator; active formal designation + approved project policy |
| `EVT-ALLOWANCE-SUBMIT-EVALUATION` | `EVIDENCE_COLLECTION` → `DIRECTOR_EVALUATION` | evaluator |
| `EVT-ALLOWANCE-DIRECTOR-EVALUATE` | `DIRECTOR_EVALUATION` → `REPRESENTATIVE_REVIEW` | Director; S/A/B/C + evidence |
| `EVT-ALLOWANCE-REP-DECIDE` | `REPRESENTATIVE_REVIEW` → `DECIDED` | Representative; gross amount and policy version |
| `EVT-ALLOWANCE-RETURN` | review states → `RETURNED` | Director/Representative; reason |
| `EVT-ALLOWANCE-RESUBMIT` | `RETURNED` → `DIRECTOR_EVALUATION` | evaluator |
| `EVT-ALLOWANCE-TAX-ASSESS` | `DECIDED` → `TAX_REVIEW` | authorized processor; cross-project monthly aggregation + law version |
| `EVT-ALLOWANCE-TAX-APPROVE` | `TAX_REVIEW` → `EXPORT_READY` | authorized reviewer; tax and wage fields separate |
| `EVT-ALLOWANCE-RECORD-PAYROLL-REF` | `EXPORT_READY` → `EXPORTED_REFERENCE` | authorized recorder; external reference only |

Calculation and tax classification are evidence-backed functions. No transition performs payroll or transfers funds.

## 17. Required Negative Tests

- Transition with arbitrary state string.
- Transition from stale `version_no`.
- Vendor transition outside exact project/contract scope.
- Vendor self-accepting deliverable or inspection.
- Senior Researcher using official approval event.
- Representative inserted into ResearchNote finalization.
- Admin-System previewing L3/L4 without content permission/grant.
- Approval completion against a mutable or mismatched subject version.
- Reinspection overwriting prior attempt.
- Offline command invoking online-only event.
- Expired grant accessing a cached/signed URL.
- Contract recommendation automatically becoming stored legal default.
- Project being labeled formal research without an approved designation snapshot.
- L1 technical information being exported without Lab Director approval.
- Critical safety stop-work being cleared without correction verification.
- Research allowance calculation without an approved per-project cadence/policy version.
- Applying the KRW 200,000 non-taxable cap separately to each project instead of once per person/month.
- Vendor downloading or self-printing an L3/L4 source file.
- Adjusted inspection payment rate overwriting the calculated rate or lacking approval.
