# Domain Model

## 1. Modeling Rules

- Business primary keys use opaque UUIDs. Human numbers such as `YW-RND-...` are unique alternate identifiers.
- Stable English IDs identify states, permissions, policies, and events; Korean labels are presentation data.
- Aggregate roots own invariants and state transitions.
- Cross-aggregate references use IDs and Application Services; one aggregate does not mutate another directly.
- Approved/finalized evidence is immutable. Corrections are linked records.
- Core relationships, states, money, actors, dates, and security levels are relational fields, not an unvalidated JSON blob.
- JSON is allowed for versioned editor content, bounded policy parameters, and external raw snapshots with a declared schema version.

## 2. Identity and Authorization

### `organization`

Legal or operational organization. Initial internal organization is 유원산업기술; each vendor is represented separately through `vendor` rather than treated as a full internal tenant.

### `department`

Internal organizational unit. Belongs to an organization and may form a hierarchy.

### `position`

Ordered organizational position such as `POSITION_JUNIOR_RESEARCHER`, `POSITION_SENIOR_RESEARCHER`, `POSITION_LAB_DIRECTOR`, `POSITION_REPRESENTATIVE`. Position drives default approval-line construction but is not a Role.

### `user`

Application identity profile linked to an Auth provider subject. Holds activation state, organization, department, and position. Authentication credentials stay in the Auth provider.

`VerifiedAuthSession` is transient authentication evidence, not an application entity. It contains only the provider-verified subject, provider-issued session ID, expiry and assurance level. ActorContext creation requires an exact active provider session/subject match and then reloads the current `user` state and assignments; provider metadata never supplies Role, Position, Permission or Scope.

### `role`, `permission`, `user_role`

RBAC primitives. A user may have multiple roles. Administrative roles are split into `ADMIN_SYSTEM`, `ADMIN_SECURITY`, `ADMIN_DOCUMENT`, `ADMIN_APPROVAL`.

### `vendor`, `vendor_user`

`vendor` is the external company record. `vendor_user` links a user to exactly one or reviewed multiple vendor memberships with active dates/status. Deactivation invalidates all derived access immediately.

### `project_scope`, `contract_scope`, `document_grant`

Explicit scope grants. They record subject, resource, action set, valid period, grant source, and revocation. Vendor access requires both an active vendor membership and a matching active scope.

## 3. Product, Project, and WBS

### `product`

Independent product/robot model. A product can relate to many projects and R&D programs through typed join entities.

### `project`

Internal development project aggregate root. Owns project lifecycle, metadata, risk summary, and membership but not contract or R&D lifecycle.

Invariants:

- Project visibility is granted explicitly.
- Any active internal user may create an ordinary `DRAFT`; vendor actors cannot create internal projects.
- Project lifecycle and formal-research designation are independent. A project may not claim formal-research status without an approved designation record.
- Closing a project requires no prohibited active child work; exact close policy remains configurable.
- Product and R&D links do not imply identical lifecycle or ownership.

### `project_product`, `project_rnd_program`

N:M relation entities with effective dates and relationship type.

### `research_project_application`, `research_project_designation`

`research_project_application` is a versioned application snapshot containing purpose, research plan, team, period, budget, expected outputs, allowance applicability, and evidence. Submission creates an Approval subject. `research_project_designation` is the immutable result created when Lab Director review/consent completes; this route has no Senior or Representative approval step.

Designation invariants:

- Rejection or recall returns the application for a new version; it does not delete the ordinary Project.
- The approved application version and approval-line snapshot are immutable.
- Only an active designation may be displayed or exported as `FORMAL_RESEARCH_PROJECT`.
- A designation change, suspension, or revocation is a new audited decision, not an edit to the original approval.

### `project_member`

User assignment and project role. This is a scope source, not a global RBAC role.

### `wbs_node`

Free-hierarchy node with `parent_id`, `sort_order`, `node_kind`, owner, schedule, progress, and explicit state. Default UI seeds milestone and task nodes but the data model permits additional levels.

`milestone` and `task` are domain concepts represented as constrained WBS node kinds plus type-specific extension entities only when they need distinct fields. Their concepts must remain visible in API and UI even if stored on one tree.

### `requirement`

Structured technical or functional requirement with criticality, target, tolerance, unit, acceptance rule, current revision, and links to tests/deliverables. Requirement revisions are preserved.

## 4. Test, Inspection, and Quality

### `test_plan`

Defines conditions, method, equipment, repetitions, evidence requirements, and requirement coverage before execution.

### `test_result`

One execution result with measured values, verdict, evidence, executed-by, version identifiers, and immutable raw evidence references.

### `inspection`

Inspection aggregate root tied to a contract, milestone, deliverable, receipt, or warranty issue. It defines scope, criteria set, type, and overall lifecycle.

### `inspection_attempt`

An ordered attempt: initial inspection or reinspection. This preserves the `Reinspection` concept without duplicating the aggregate. Each attempt holds criterion results, verdict, evidence, and inspected version.

Invariants:

- Attempt number is unique within an inspection.
- A reinspection cannot erase or rewrite the prior attempt.
- Repeated critical failures are counted from immutable attempts.
- `PARTIAL_ACCEPTANCE` and `CONDITIONAL_ACCEPTANCE` remain distinct dispositions.
- The criterion weights of an inspection checklist version total 100; critical criteria cannot be bypassed by aggregate score alone.
- Achievement score, system-proposed payment rate, approved adjustment, and final payment rate are preserved separately.

### `inspection_checklist_version`, `inspection_criterion`, `inspection_criterion_result`

Immutable checklist version and per-attempt results. Each criterion stores weight, critical flag, measurement/pass rule, evidence requirement, and achieved percentage. The initial policy maps 100% to acceptance, 90–99.99% to conditional acceptance, 60–89.99% to partial acceptance, and below 60% to rejection, subject to critical-item rules.

### `acceptance_payment_decision`, `payment_rate_adjustment`

Links the sealed InspectionAttempt to its calculated achievement score and milestone payment. A payment-rate adjustment requires reason, evidence, actor, and ApprovalInstance. It never rewrites the calculated value and never waives warranty or professional responsibility.

### `non_conformance` and `corrective_action`

NCR records the observed nonconformance, requirement/criterion, severity, impact, evidence, and responsibility assessment. CAR records root cause, action plan, owner, due date, verification, and closure. One NCR may have multiple corrective actions.

M09 invariants:

- An issued NCR references at least one exact typed source and immutable evidence; an `inspection_attempt` source is identified by its exact sealed row and checksum.
- Responsibility party and responsibility status are separate. Status is `PRELIMINARY`, `DISPUTED`, or `FINAL`; a dispute is never silently converted to final responsibility.
- Containment, root-cause analysis, action-plan acceptance, implementation evidence, and effectiveness verification are separate records or transitions.
- Every required, non-cancelled CAR must have a retained effective independent verification and be `EFFECTIVE` or `CLOSED` before the NCR can close.
- A CAR owner or implementation actor cannot verify that CAR's effectiveness. Verification records the verifier, result, evidence, and timestamp immutably.
- `INEFFECTIVE` returns through a new rework transition without deleting the failed verification. Reopening an NCR appends reason/evidence and preserves its prior closure.
- NCR/CAR closure does not waive Vendor responsibility or automatically change Contract state, acceptance, warranty, or payment.

## 5. Vendor Contract

### `vendor_contract`

Contract aggregate root linked to one vendor and one or more projects/R&D programs using typed join tables. It owns contract lifecycle, signed version reference, period, negotiated terms, and termination/close data.

Financial data is structured and protected separately from list-safe contract metadata.

### `contract_milestone`

Contract delivery/payment stage with due date, amount or ratio, required deliverables, inspection rule, and payment eligibility state. Recommendation ranges are never injected as fixed defaults.

### `deliverable`

Named contractual deliverable with required format, due date, responsible party, submitted version, acceptance state, and links to requirements/tests.

### `payment_schedule`, `payment_record`

Optional structured records for expected and externally confirmed payment state. The system never executes a bank transfer. Vendor list responses exclude these entities and related fields.

### `guarantee`

Performance, advance, defect, or other guarantee with issuer, policy number, amount, currency, validity, document, and state. Percentages and periods are contract-specific.

### `warranty_issue`

Post-acceptance defect/warranty case with classification, evidence, response deadline, remediation, verification, guarantee claim link, and lifecycle.

### `change_request`, `change_order`

ECR and ECO are separate entities. ECR contains rationale and impact analysis. An approved ECR may produce an ECO that identifies exact revisions, targets, cost/schedule effects, implementation, and verification.

Invariants:

- An ECO cannot exist without a reviewed ECR or a documented emergency exception.
- Approval of an ECR/ECO does not transfer the vendor's professional responsibility.
- Contract scope, price, deadline, or acceptance criteria change only through an effective signed change record.
- Every ECR impact dimension (`COST`, `SCHEDULE`, `QUALITY`, `SAFETY`, `SECURITY`, `REGULATORY`) is explicitly assessed with evidence or a reasoned `NO_IMPACT` finding before review.
- Approval binds an immutable ECR/ECO version, checksum, and sealed timestamp. A rejected or recalled subject is corrected as a newer version, never overwritten.
- An ECO target uses an exact typed before-version relation. Implementation produces a distinct after-version relation and cannot replace or mutate the before-version.
- Emergency execution requires an immutable exception version with reason, risk, temporary authority, evidence, policy-selected retrospective approval deadline, and complete audit. Missing policy or evidence fails closed.
- ECO effectiveness requires independent verification, exact applied serial/lot/equipment scope, and required retest/reinspection evidence.
- BOM integration is a public extension port in P0; BOM persistence and UI remain P1.

## 6. Purchase

### `supplier`

Supplier master separate from Vendor because a purchasing supplier need not be an outsourcing vendor. A reviewed link may connect them.

### `item`

Item master with item code, name, specification, manufacturer, unit, preferred supplier, recent-price projection, and lifecycle.

### `purchase_request`

Purchase aggregate root and its constrained `SM-PURCHASE-V1` lifecycle. It points to the current immutable request version but never stores line or quotation facts in a generic JSON field.

### `purchase_request_version`, `purchase_request_line`, `purchase_quotation`

Immutable purchase proposal snapshot with purpose, VAT-inclusive total, anti-splitting review window/effective amount, exact policy snapshot, normalized Item lines, Supplier quotations, private evidence, and typed Project/R&D links. Approval binds this exact sealed version, version number, checksum, and sealed time.

### `purchase_resolution`

Purchase resolution that reuses approved request data through a snapshot/reference, records final decision and external payment status, but does not alter the approved request version.

### `receipt` and `purchase_inspection`

Receipt records physical arrival and quantities. PurchaseInspection records quantity/specification/appearance/performance/photo/verdict and links to the receipt. It may reuse the generic Inspection engine while retaining a typed relation.

M11 invariants:

- Supplier is not Vendor; a reviewed, evidenced link may connect them without collapsing either identity.
- PurchaseResolution references the exact approved PurchaseRequestVersion and selected quotation. A later request version cannot retarget the completed Approval or resolution.
- Receipt lines reference exact request-version lines. Partial receipt remains visible; an overage is retained only as an explicit discrepancy and is never silently counted as accepted quantity.
- PurchaseInspection retains exact Receipt and Inspection/InspectionAttempt lineage. A failed result enters correction handling rather than rewriting the receipt.
- ExternalPaymentFact is evidence of a headquarters-system fact. It cannot create a transfer, payment instruction, accounting journal, or RCMS operation.
- Headquarters users remain read-only until a later explicit authority policy; Vendor actors have no internal purchase capability.
- BOM remains a P1 extension and M11 does not add BOM persistence or screens.

## 7. R&D Program

### `rnd_program`

Government/agency program registration root with agreement period, agencies, currency, Project N:M links, budget/expenditure totals, and reporting deadlines. It is independent from Project. M11 deliberately has no lifecycle state field because `OD-030` is open.

### `rnd_budget`, `rnd_budget_version`, `rnd_budget_line`

Versioned program budget and normalized category allocations. A new version links to the prior immutable version; Expenditure references the exact current BudgetVersion and line used when recorded.

### `expenditure`

Internal tracking record with amount, date, counterparty, category, and exact typed links to ContractVersion/PurchaseResolution/Project. It is not a ledger journal or payment instruction.

### `evidence`

Evidence record linking an attachment to an expenditure, report, test, inspection, or other typed subject with evidence type and integrity metadata.

### `report_deadline`

Report/evaluation/settlement milestone and notification source.

M11 invariants:

- Only an active, explicitly authorized internal actor may register or mutate R&D facts. Vendor is always denied, and headquarters remains read-only until a later role policy.
- Budget versions, expenditures, evidence, Project links and deadlines are structured records with optimistic versions and append-only audit/outbox evidence.
- Evidence binds an exact Expenditure, BudgetVersion, or ReportDeadline and a private Attachment/checksum; missing and overdue evidence remain visible in summaries and alerts.
- Deadline alert delivery is idempotent and preserves the selected alert-policy version and recipient.
- No lifecycle state/event, close, settle, or reopen command is inferred from registration events. `OD-030` keeps those commands fail-closed.
- No bank transfer, payment instruction, accounting journal, VAT-refund workflow, or RCMS workflow clone is exposed.

## 8. Research Note

### `research_note`

Research-note aggregate with author, research date, purpose, content version, project/R&D links, reviewers, and finalization state.

### `research_note_entry`

Immutable authored content version or addendum/correction. A finalized note cannot update or delete its original entry. Correction records reference the corrected entry and reason.

### `research_note_review`

Optional Senior Researcher review record. It is not an official approval action.

Finalization is an explicit Lab Director action and must not generate a Representative approval step.

## 9. Document, Template, and Approval

### `template`, `template_version`

Template definition and immutable version. A document instance references the template version used at creation; later template changes do not affect it.

### `document`

Document identity, type, human number, owner, security level, retention policy, and lifecycle.

### `document_version`

Immutable version record containing versioned editor JSON, rendered artifact references, checksum, author, and creation reason. Draft editing creates or replaces a working draft only under an explicit draft model; submitted/approved versions are never overwritten.

### Typed document links

Use `project_document`, `contract_document`, `rnd_document`, `purchase_document`, `inspection_document`, and similar FK-backed join entities. Avoid an unconstrained `subject_type + subject_id` relation for records requiring referential integrity.

### `approval_policy`, `approval_policy_version`

Configurable rule and immutable version for subject type, amount/security conditions, required positions/roles, and completion modes.

### `approval_instance`

Execution aggregate referencing subject and immutable subject version. Stores policy version, submitter, generation, state, and final outcome.

### `approval_step`

Ordered or parallel step with role (`REVIEW`, `AGREEMENT`, `APPROVAL`, `REFERENCE`), completion mode (`SEQUENTIAL`, `ANY_ONE`, `ALL`, `SPECIFIC`), required flag, and state.

### `approval_participant`

Resolved participant snapshot. Delegation/acting authority is stored as an explicit relationship and reason, not inferred after the fact.

### `approval_action`

Append-only action record for submit, review, agree, approve, reject, recall, delegate, act, reference receipt, and comment.

Invariants:

- Senior Researcher may not be an `APPROVAL` participant merely because of position.
- Required steps cannot be removed by the drafter.
- Representative default completion mode is `ANY_ONE`.
- Final completion freezes the exact subject version and approval-line snapshot.
- `REFERENCE` completion uses the stable permission `approval.step.reference` and remains distinct from official approval.
- Resubmission preserves the prior instance/action evidence and requires the same subject root with a strictly newer immutable version; a changed checksum cannot disguise the same version.
- Position, permission, event, and policy identifiers use canonical stable IDs only; translated or legacy aliases are not persistent authority.

## 10. Technical Document Access

### `technical_document_access_request`

Request for a specific document/version, requester/vendor, reason, requested actions, and requested period.

### `technical_document_access_grant`

Granted capability with document version, grantee user/vendor, allowed operation, start/end, watermark/download conditions, approval instance, state, and revocation reason.

Invariants:

- Vendor browsing/search of the technical repository never derives from a grant.
- L2 temporary digital access requires Lab Director approval. L3 controlled printing requires Lab Director approval; L4 controlled printing requires Lab Director plus Representative approval.
- Expiry changes effective access immediately and creates an audit event.
- Admin-System alone cannot grant itself source-content access.

### `technical_document_copy`

Numbered, watermarked L3/L4 physical-copy record for an exact DocumentVersion. It stores security level, recipient/vendor, purpose, page/copy count, printed-by/at, approval instance, handover acknowledgement, return/destruction due date and completion evidence.

External L3/L4 invariants:

- No source-file download or recipient-controlled print operation exists.
- L3 rendering/printing requires Lab Director approval; L4 requires Lab Director plus Representative approval.
- The watermark contains recipient/vendor, project, copy number, security level, issuer, print time, and redistribution prohibition.
- Expiry ends the authorized use and starts return/destruction follow-up; it does not erase the copy ledger.

### M14 physical baseline

M14는 `TechnicalDocumentCopy` root에 exact approved `DocumentVersion` composite tuple, exact private source `Attachment` tuple/hash, immutable recipient/vendor·Project·optional Contract·purpose·return/destruction plan, request checksum/sealed-at, 전역 unique copy number와 optional reprint predecessor/reason을 정규화해 보존한다. 결재는 일반 DocumentVersion 결재를 재사용하는 대신 `TECHNICAL_DOCUMENT_COPY_REQUEST` typed subject로 이 request 전체를 봉인한다.

Project-only 외부 수령인은 active VendorMembership과 exact Project grant를, Contract-bound 수령인은 동일 VendorUser의 exact Contract grant까지 요구한다. Scope evidence는 request/render/print/handover 시점마다 새 immutable snapshot으로 추가한다. 출력물은 private Attachment, source/output hash, renderer ID/version, manifest checksum, 모든 페이지 watermark proof를 갖는다. print/handover/return/destruction evidence와 custody event는 append-only이고 reprint는 기존 row를 갱신하지 않는 새 root다.

## 11. Safety Management

### `safety_manager_assignment`

Time-bounded designation by the Lab Director for the Safety Manager and optional team safety coordinators.

### `safety_inspection`, `safety_inspection_item`, `safety_finding`

Planned monthly regular, weekly team self, ad-hoc, or special inspection. Findings have severity, stop-work flag, corrective owner/deadline, evidence, verification, and closure. The scheduled frequency is policy data with regulation-version provenance.

### `safety_training`, `safety_training_attendance`

New-joiner, semiannual regular, and special training session plus participant completion/supplementary-training status.

### `hazardous_material`, `msds_version`, `waste_log`

Hazardous-material inventory/classification, current MSDS evidence, storage/handling controls, and waste occurrence/disposal log.

### `emergency_plan`, `emergency_drill`

Versioned evacuation plan/contact network and at-least-annual drill record.

### `safety_incident`, `incident_investigation`

Incident report, immediate response, site preservation, notifications, cause investigation, recurrence-prevention actions, and evidence. Investigation has a 48-hour regulation SLA but statutory reporting deadlines require separate legal validation.

Safety records use the longer of the canonical five-year general retention, applicable regulation/law, and legal hold.

### M13 physical baseline

M13는 `SafetyManagerAssignment`을 지정자 Lab Director, 대상 사용자, assignment type, 선택 Project/team scope, 유효기간의 독립 record로 보존하며 겹치는 모순된 활성 지정을 허용하지 않는다. `SafetyInspection`은 inspection type·policy version·schedule·inspector assignment snapshot·상태·낙관적 버전을, `SafetyInspectionItem`은 criterion/verdict/evidence를, `SafetyFinding`은 severity·stop-work scope·시정 책임자/기한을 typed field로 가진다. 시정 제출과 독립 검증은 exact finding/evidence snapshot을 새 append-only record로 남기고 stop-work는 성공한 권한 검증 전이 외에는 해제되지 않는다.

`SafetyTrainingSession`과 `SafetyTrainingAttendance`는 교육 유형·일시·대상·출석/이수·보충교육 due/completion을 분리한다. `SafetyIncident`는 발생·보고·Project/Vendor scope·응급조치·현장보존·상태·version을, `IncidentInvestigation`과 `SafetyRecurrenceAction`은 원인·증거·책임자·효과검증을 정규화한다. `investigation_due_at`은 report time + 48시간으로 고정하고 SLA 초과는 idempotent alert/audit만 추가한다. 모든 record는 최소 5년 보존일과 더 긴 policy/legal hold를 별도 field로 유지한다. M13 migration에는 `HazardousMaterial`, `MsdsVersion`, `WasteLog`, `EmergencyPlan`, `EmergencyDrill` table을 만들지 않는다.

## 12. Research Allowance

### `project_allowance_policy`, `project_allowance_policy_version`

Opt-in policy attached to a formal research project. An immutable approved version defines allowance types, budget, participant eligibility, evaluation weights/grades, amount or formula, cadence (`MONTHLY`, `QUARTERLY`, `SEMIANNUAL`, `MILESTONE`, `PROJECT_END`), effective period, tax-rule version, and ApprovalInstance. There is no global cadence.

### `research_eligibility_snapshot`

Effective-dated evidence of institute registration, direct-research engagement, employer qualification, and supporting documents. The application must not infer tax eligibility from job title, Role, or registration alone.

### `research_performance_evaluation`

Evaluation period/project, evaluator, S/A/B/C grade, participation/technical contribution/diligence evidence, limitation reasons, and Representative-approved project policy version.

### `allowance_calculation`, `allowance_tax_assessment`

`allowance_calculation` preserves inputs, policy version, gross decision amount, and calculation trace. `allowance_tax_assessment` records the law version, employer/institute/person eligibility facts, same-person same-month cross-project aggregation, non-taxable candidate amount, taxable amount, wage-classification status, and reviewer. The initial tax rule applies the monthly KRW 200,000 cap only once across all eligible projects and defaults unsupported or performance-bonus amounts to taxable.

### `allowance_decision_reference`

Optional export record of an approved allowance calculation and external payroll reference. The application may calculate and export when the project's approved policy enables it, but it never transfers funds or silently treats export as payment confirmation.

## 13. Shared Supporting Entities

### `attachment`

File metadata and integrity hash. Storage bytes are external to the DB record.

### `comment`

Threaded business comment scoped to an authorized subject. Approval opinions remain append-only ApprovalAction records even if displayed with comments.

### `notification`

User-facing delivery record generated from an outbox event. It is not the source of business truth.

### `outbox_message`

Transactional event envelope written in the same UnitOfWork as the aggregate change, AuditLog, and StateTransitionHistory. Its immutable body contains stable IDs, aggregate identity/version, correlation/causation, idempotency key, payload schema version, and a bounded redacted payload. Worker-owned lease, retry, delivery, and dead-letter fields are mutable through protected operations only. It never carries document/editor content, evidence bytes, tokens, signed URLs, whole request/response bodies, SQL, or exception stacks.

### `audit_log`

Append-only event with actor, effective actor, action ID, resource, result, stable reason/reference, request correlation, before/after hash, IP/device context where allowed, and timestamp. M02 deliberately has no generic Audit JSON payload.

### `state_transition_history`

Append-only domain transition record with stateful resource type/ID, machine ID, from/to state, event ID, version before/after, reason code, correlation/causation, command ID, and correlation to AuditLog. A successful transition is unique for the resulting aggregate version.

### `offline_command`, `sync_conflict`

Offline Outbox command and server-side conflict record. Sensitive payloads must be minimized and encrypted at rest where supported. Resolved conflicts retain both versions and the resolution decision.

M15 `OfflineCommand`은 stable allowlisted command type, authenticated/effective actor snapshot, raw session이 아닌 session binding hash, aggregate type/ID, base version, schema version, canonical JSON payload/hash를 불변으로 소유한다. 같은 `command_id`와 동일 hash의 재전송은 `IDEMPOTENT_REPLAY`이며 다른 hash 재사용은 거부한다. 정상 Application handler만 `APPLIED`/`REJECTED`/`STALE_BASE_VERSION`을 반환할 수 있다.

`SyncConflict`는 정확한 OfflineCommand, base/server version, 원본 local payload/hash와 allowlisted safe server comparison projection/hash를 보존한다. 충돌 자체와 terminal resolution은 append-only다. P0 resolution은 `RESOLVED_DISCARD_LOCAL` 또는 동일 actor·command type·aggregate와 최신 server version에 묶인 successor command를 갖는 `RESOLVED_RETRY_AS_NEW`뿐이며 자동 overwrite와 미승인 field merge 상태는 없다.

## 14. Aggregate Boundaries

| Aggregate | Owns | References, does not own |
|---|---|---|
| Project | members, WBS structure, project state | Products, R&D Programs, Contracts, Documents |
| VendorContract | milestones, deliverables, negotiated terms | Vendor, Projects, Approval, Inspections |
| Inspection | attempts, criterion results | Contract, Deliverable, NCR/CAR, Evidence |
| NCR | nonconformance and CARs | InspectionAttempt, ECR/ECO |
| ChangeRequest | impact analysis and resulting ChangeOrder | Contract, Requirements, BOM, Documents |
| PurchaseRequest | request lines, quotes, approval reference | Supplier, Items, Project, R&D |
| RndProgram | budget versions and deadlines | Projects, Expenditures |
| ResearchNote | entries, reviews, finalization | Project, R&D, Attachments |
| Document | versions and retention lifecycle | TemplateVersion, Approval, typed business links |
| ApprovalInstance | steps, participants, actions | immutable subject version |
| TechnicalAccessRequest | approval and resulting grants | DocumentVersion, VendorUser |
| SafetyInspection | items, findings, corrective verification | SafetyManagerAssignment, Attachments |
| SafetyIncident | response, investigation, recurrence actions | People, Project, Attachments |
| ResearchPerformanceEvaluation | evidence links and approved grade snapshot | User, Project, ResearchNote, TestResult |

## 15. Minimum Concept Coverage

The master list is covered as follows:

- User, Organization, Department, Position, Role, Permission, UserRole: Identity.
- ProjectScope: Authorization; Vendor, VendorUser: Vendor.
- Product, Project, ProjectMember, WbsNode, Milestone, Task, Requirement: Project/WBS.
- TestPlan, TestResult: Quality.
- VendorContract, ContractMilestone, Deliverable, Inspection, Reinspection: Contract/Inspection, with Reinspection as immutable `inspection_attempt` number > 1.
- NonConformance, CorrectiveAction: NCR/CAR.
- ChangeRequest, ChangeOrder: ECR/ECO.
- Guarantee, WarrantyIssue: Warranty.
- PurchaseRequest, PurchaseResolution, Supplier, Item, BOM, Receipt, PurchaseInspection: Purchase.
- RndProgram, Budget, Expenditure, Evidence: R&D.
- ResearchNote: Research Note aggregate.
- Document, DocumentVersion, Template: Document Engine.
- ApprovalInstance, ApprovalStep, ApprovalParticipant: Approval Engine.
- TechnicalDocumentAccessGrant: Technical access.
- Attachment, Comment, Notification, AuditLog: shared Core.

### M05 physical baseline

M05는 `Template`/`TemplateVersion`, `Document`/`DocumentVersion`, `Attachment`, `DocumentAttachment`, content-validation evidence, sealed-manifest evidence, file-scan evidence를 각각 정규화한다. `DocumentVersion`은 template snapshot, editor schema/renderer, content checksum, security-level snapshot, active AVAILABLE attachment의 MIME/size/hash/scan evidence를 exact sealed manifest로 고정한다. 승인·반려·회수 후 수정은 동일 Document root의 strictly newer version이며 승인본 대체는 이전 version의 content를 바꾸지 않고 successor exact link만 기록한다.

`DOCUMENT_VERSION` 결재 대상은 version number, sealed manifest checksum, sealed timestamp의 composite FK로 고정한다. Attachment 객체 위치는 private provider metadata일 뿐이며 URL/token은 엔티티에 저장하지 않는다. `AVAILABLE`은 FILE_INGEST 검증과 FILE_SCANNER CLEAN 결과를 모두 거친 상태로, 복원 시에도 MIME·크기·체크섬·scan evidence invariant를 다시 확인한다.

### M06 physical baseline

M06는 `Project`, `ProjectMember`, `ProjectProductLink`, `WbsNode`, `ProjectVendorGrant`를 각각 정규화한다. WBS는 같은 Project 안의 자기참조 자유계층이며 순환을 허용하지 않는다. 부모 완료는 자식 상태를 자동 변경하지 않고, Vendor 명령은 활성 VendorMembership·정확한 Project grant·할당 Vendor·허용 action과 유효기간을 모두 만족해야 한다. Project 종료·재개 명령은 `OD-014` 확정 전까지 제공하지 않는다.

`ResearchProjectApplicationRoot`와 immutable `ResearchProjectApplicationVersion`은 신청 목적·계획·방법·기간·예산·연구팀·예상 성과·보안·안전·연구수당 적용 및 증거 첨부를 exact snapshot으로 봉인한다. `APPROVAL_SUBJECT_RESEARCH_PROJECT_APPLICATION`은 application version/checksum/sealed-at과 정확히 결합된다. 정확히 한 명의 `POSITION_LAB_DIRECTOR` 동의가 완료된 경우에만 immutable `ResearchProjectDesignation`이 생기며, Project의 formal status는 이 지정에서 파생한다. 반려·재작성 또는 신청자 회수 후 변경은 동일 root의 strictly newer application version이다.

### M07 physical baseline

M07는 `VendorContract`, immutable/versioned `ContractVersion`, `ContractProject`, `ContractMilestone`, `Deliverable`, immutable `DeliverableVersion`, `Guarantee`, `WarrantyIssue` 기반을 각각 정규화한다. ContractVersion은 총부담액·통화·기간·SOW/조건·IP/보안·보증·하자·지체·책임한도와 법령 체크, 선택한 내부 preset version, 계약별 override/reason/approval/signature provenance를 exact snapshot으로 고정한다. 이 값은 법정 고정값이 아니라 계약별 확정값이다.

Contract list-safe projection에는 amount/payment/internal evaluation 필드가 타입과 SQL 결과에 존재하지 않는다. 기본 상세과 금융 상세은 별도 projection이며 금융 상세은 exact VendorMembership + Project/Contract Scope + `contract.detail.finance.read`를 모두 요구한다. 계약 활성화·종료·해지와 Scope 부여·회수는 같은 transaction의 obligation이다. Deliverable 수락과 실제 지급 확인은 M08에서 다루며 Contract/Deliverable 자체의 전문책임·잠재하자 비면책 표시는 변경할 수 없는 정책 provenance로 유지한다.

### M08 physical baseline

M08는 `Requirement`/immutable direct-next `RequirementRevision`, versioned `TestPlan`/coverage, immutable `TestResult`/evidence manifest, `Inspection`, immutable `InspectionChecklistVersion`/`InspectionCriterion`, numbered immutable `InspectionAttempt`/`InspectionCriterionResult`를 정규화한다. Attempt는 exact DeliverableVersion·ChecklistVersion·policy version·checksum·evidence를 봉인하며 재검수는 같은 Inspection 아래 `attempt_no + 1`인 새 record다.

`AcceptancePaymentDecision`은 exact sealed attempt에서 계산한 achievement, system-proposed rate, requested adjustment 및 final approved rate를 별도 값으로 보존한다. 승인 완료 시 milestone amount × final approved rate를 지급정책 버전의 금액 반올림 규칙으로 계산한 `approvedPayableAmount`를 함께 봉인한다. 조건부합격은 typed residual condition·due date·held amount를, 부분합격은 independently usable portion·unpaid remainder를 가지며, 현재 held amount와 unpaid remainder는 동일하고 approved payable amount를 초과할 수 없다. 모든 조건을 충족해 지급가능 상태가 되면 현재 보류·미지급 값은 0으로 해제하되 승인 지급가능액과 이력은 유지한다. `PaymentRateAdjustment`는 reason·evidence·actor·exact Approval snapshot을 요구하고 계산값을 수정하지 않는다. 지급 가능 상태는 외부 지급 실행과 분리되며 모든 snapshot에는 acceptance/payment non-waiver가 유지된다.

### M12 physical baseline

M12는 `ResearchNote` root를 정확히 한 Project와 작성자에 결합하고, 해당 시 선택된 하나의 typed `RndProgram` 문맥을 함께 보존한다. Root는 현재 exact `ResearchNoteEntryVersion`과 상태·낙관적 버전을 가리킨다. `ResearchNoteEntryVersion`은 연구일·제목·목적·방법·관찰·결과·결론을 각각 typed column으로 보존하며 범용 editor JSON에 핵심 내용을 위임하지 않는다. 최초 엔트리와 직접 수정본은 `ORIGINAL`, 최종확정 후 정정·추가는 `CORRECTION` 또는 `ADDENDUM`으로 구분한다. 모든 후속 엔트리는 같은 note의 바로 이전 버전을 가리키고, 정정·추가는 대상 최종확정 엔트리를 추가로 가리킨다.

제출 시 entry content와 exact `ResearchNoteEntryAttachment`의 Attachment id·row version·checksum을 함께 봉인해 sealed snapshot checksum을 만든다. 봉인·최종확정된 엔트리와 첨부 연결은 수정하지 않으며, 수정 요구는 새 `ORIGINAL` 엔트리로 재제출한다. 선택적 `ResearchNoteSeniorReview`는 exact 봉인 엔트리·검토자·유효한 선임연구원 직위 배정·의견·결과를 기록하는 검토 증거일 뿐 공식 결재가 아니다.

`ResearchNoteFinalization`은 exact 봉인 엔트리와 당시 유효한 `POSITION_LAB_DIRECTOR` 배정을 먼저 결합한다. 연구소장만 최종확정할 수 있고 선임연구원·대표는 최종확정 권한이 없다. 그 후 `ResearchNotePdfManifest`가 이 finalization, 포함된 모든 봉인 entry/attachment exact tuple, renderer id/version, page count, PDF checksum, private output Attachment, rendered timestamp 및 canonical manifest checksum을 불변 증거로 보존한다. 최종확정 후 원본은 변경하지 않으며 정정·추가는 한 개의 새 엔트리와 직접 계보로 남기고 기존 root는 terminal `CORRECTED_BY_ADDENDUM`으로 전이한다.

Additional superior-regulation concepts are covered by Safety Management and Research Allowance Evidence. Research outcomes and notes carry ownership provenance: company ownership by default with explicit law/agreement/contract exception records.
