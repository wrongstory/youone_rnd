# Workflows

This document describes end-to-end business flows. Exact states and permitted transitions are canonical in `docs/state-machines.md`.

## 1. Common Approval

Workflow ID: `WF-APPROVAL-V1`.

1. Author creates a mutable subject draft and an immutable submit candidate version.
2. Application resolves the applicable `approval_policy_version` from subject type, amount, security level, and other approved conditions.
3. Default line begins after the author's position and continues through Representative, except a dedicated workflow such as ResearchNote.
4. Senior Researcher is inserted only as `REVIEW` or `AGREEMENT`, never official `APPROVAL` by position.
5. Author may edit the line before submission within policy limits; required steps cannot be removed.
6. Submission snapshots the subject version, policy version, steps, participants, required flags, and completion modes.
7. Sequential steps activate in order; parallel agreement steps follow their configured completion rule.
8. Representative group defaults to `ANY_ONE`.
9. Reject preserves all actions and returns the subject to an allowed revision path.
10. Recall is permitted only by policy and leads to edit/new-version/resubmission.
11. Final approval marks the exact subject version immutable and emits `EVT-APPROVAL-COMPLETED`.

Delegation/acting authority requires an explicit active record, reason, period, original participant, effective participant, and audit trail.

## 2. Document Lifecycle

Workflow ID: `WF-DOCUMENT-V1`.

1. Select a `template_version` or create an allowed free-form document.
2. Create `document` identity and working `document_version`.
3. Edit content, attachments, links, security level, and approval line subject to permission.
4. Seal a submit candidate version and invoke `WF-APPROVAL-V1`.
5. On approval, keep approved version immutable and optionally generate PDF/rendered evidence with checksum.
6. Later revision creates a new version; it never overwrites approved content.
7. General-document disposal follows retention policy and logical deletion/quarantine.
8. Technical-document deletion requires a reason, Representative approval, quarantine, and permanent deletion audit. Actual purge timing remains governed by policy and superior regulations.

## 3. Project and WBS

Workflow ID: `WF-PROJECT-WBS-V1`.

1. Any active internal user creates an ordinary Project; Vendor actors are excluded.
2. Assign a Project owner and link zero or more Products and R&D Programs through N:M relationships.
3. Seed optional default WBS nodes: Project → Milestone → Task, while allowing additional hierarchy levels.
4. If formal-research designation is requested, create a versioned application containing team lead/members, objective, method, period, budget, outputs, security, safety, and allowance applicability.
5. Seal the application version and submit it through the Approval Engine directly to Lab Director review/consent. This decision completes designation; no Senior or Representative step is added.
6. Approval creates an immutable `research_project_designation`; rejection/recall leaves the ordinary Project intact and requires a new application version for resubmission.
7. Only an active designation may use the formal-research-project label and activate its approved project allowance policy.
8. Assign internal or vendor work. Vendor work requires explicit ProjectScope and remains externally projected.
9. Each transition checks dependency, evidence, inspection, and completion rules.
10. Research outputs are submitted to the Lab Director and managed with company-ownership provenance, subject to law/agreement/contract exceptions.
11. Project close preserves related records and does not silently close contracts, warranties, R&D programs, or designation history.

## 4. Vendor Contract

Workflow ID: `WF-VENDOR-CONTRACT-V1`.

1. Register/evaluate Vendor internally.
2. Prepare SOW, requirements, performance criteria, schedule, deliverable list, IP/security conditions, negotiated payment/guarantee terms.
3. Complete the versioned legal checklist and approval matrix in `docs/legal-policy-baseline.md`; case-specific law/contract overrides are recorded before signature.
4. Sign an immutable contract version and activate scoped vendor access.
5. Manage ContractMilestones, Deliverables, progress reports, changes, guarantees, and inspections.
6. A contract change uses ECR/ECO and, where contractual scope/amount/deadline changes, an executed change agreement/version.
7. Final technical acceptance requires defined criteria and mandatory deliverables; it does not waive latent defects.
8. External payment confirmation does not waive warranty or other responsibility.
9. Close or terminate the contract, revoke vendor access, recover/delete provided technical materials, and retain evidence.
10. Continue WarrantyIssue and Guarantee management after contract performance completion as applicable.

The system may prefill `POL-CONTRACT-BASELINE-V1`, but it is visibly labeled as an internal comparison preset. The signed version stores negotiated values and their law/preset/override provenance.

## 5. Deliverable, Inspection, and Reinspection

Workflow ID: `WF-INSPECTION-V1`.

1. Vendor completes self-verification and submits the exact Deliverable version plus raw evidence.
2. Internal actor opens/activates an Inspection against agreed criteria.
3. Freeze a weighted checklist version whose criteria total 100 and identify critical items, evidence, measurement, and pass rules.
4. Record an immutable `inspection_attempt` with per-criterion achievement, calculated total score, raw evidence, and overall disposition.
5. Apply `POL-ACCEPTANCE-PAYMENT-V1`: 100% accepted; 90–99.99% conditional; 60–89.99% partial; below 60% rejected, subject to critical-item and independent-usable-part rules.
6. Calculate a proposed payment rate from achievement. An authorized adjustment keeps both values and requires reason, evidence, and ApprovalInstance; an upward adjustment follows amount-band approval.
7. Conditional acceptance creates residual conditions, due dates, and held amount. Partial acceptance identifies independently usable portions and the unpaid remainder.
8. Correction requested creates/links NCR and due date; the vendor submits cause/action plan normally within the contract-specific deadline. Five business days is a review default, not a universal hardcoded rule.
9. Reinspection creates a new numbered attempt under the same Inspection.
10. First critical miss: correction and reinspection. Second repeated critical miss: special management/payment hold. Third repeated critical miss: termination review may begin.
11. Acceptance and any differential payment record the tested version and evidence. They never rewrite earlier attempts or waive latent-defect responsibility.

Contract-specific checklist thresholds and payment mappings may override the initial preset only through an approved policy version.

## 6. NCR/CAR

Workflow ID: `WF-NCR-CAR-V1`.

1. Detect nonconformance from test, inspection, delivery, warranty, security, or schedule evidence.
2. Issue NCR with requirement, observed result, severity, scope, evidence, and containment.
3. Assign responsibility assessment without prematurely treating disputed responsibility as final.
4. Vendor/internal owner performs root-cause analysis and proposes CAR.
5. Review/accept the plan; Senior action is review, not official business approval unless another explicit authority applies.
6. Implement actions and attach evidence.
7. Independently verify effectiveness or re-test.
8. Close, reopen, or link ECR/ECO if design change is required.
9. Repeated nonconformance updates vendor evaluation and may trigger contract remedies.

M09 execution rules:

- `PRELIMINARY`, `DISPUTED`, and `FINAL` responsibility assessments are explicit and append-only; disputed responsibility does not block immediate containment but is not treated as an admission.
- One NCR may own multiple required CARs. Closure requires every required, non-cancelled CAR to have a retained effective independent verification and be `EFFECTIVE` or `CLOSED`.
- The CAR owner and recorded implementation actors cannot perform effectiveness verification. An ineffective result is retained and the CAR returns through rework.
- Reopening appends a new reason/evidence record and never deletes the earlier closure or verification.
- Vendor commands require exact active membership, Project/Contract Scope and NCR assignment. NCR/CAR does not expose internal deliberation or financial fields to the Vendor.
- Issue, acceptance, verification, closure and reopening are audited. None of these transitions automatically changes Contract, acceptance, warranty, payment, or responsibility-waiver state.

## 7. ECR/ECO

Workflow ID: `WF-ECR-ECO-V1`.

1. Raise ECR for performance improvement, NCR correction, cost, schedule, obsolescence, safety, regulation, or user request.
2. Capture current and proposed revisions plus affected Requirements, BOM, software, drawings, tests, Deliverables, Contract, cost, and schedule.
3. Perform impact analysis and obtain the required review/approval.
4. Reject, request more analysis, or approve ECR.
5. Approved ECR produces ECO with exact implementation targets and effective revision.
6. Implement ECO; update artifacts as new versions.
7. Re-test/reinspect and verify the applied serial/lot/equipment scope.
8. Close only when required artifacts and verification are complete.

Approval of change scope does not transfer the Vendor's professional design/implementation responsibility. Emergency changes require prompt retrospective documentation and cannot become an unaudited shortcut.

M10 implementation rules:

- Analyze cost, schedule, quality, safety, security and regulatory impact separately; `NO_IMPACT` is a reasoned recorded outcome, not an omitted field.
- Bind ECR approval and ECO release to exact immutable version/checksum/sealed-time subjects. Senior review remains non-approving evidence.
- Use typed target relations for DocumentVersion, RequirementRevision, DeliverableVersion, InspectionChecklistVersion, TestPlan and ContractVersion. Each implementation creates a new after-version and retains the before-version.
- For an emergency, capture a sealed exception under a versioned policy before execution and obtain retrospective approval by that policy's deadline. If the policy is absent, the emergency route is unavailable.
- A contract-affecting ECO cannot become effective until the separately approved, signed and effective change ContractVersion is linked.
- Reverification records exact applied serial/lot/equipment scope and is performed by an internal verifier independent from implementation actors.
- BOM is exposed only through an optional extension port in P0 and has no M10 table or screen.

## 8. Purchase

Workflow ID: `WF-PURCHASE-V1`.

1. Collect one or more quotations and select Supplier/Item master references.
2. Draft PurchaseRequest with items, specification, quantity, amount, purpose, Project/R&D links, and quote evidence.
3. Submit PurchaseRequest through Approval Engine.
4. Create PurchaseResolution from the approved request/version without overwriting it.
5. Record headquarters payment status as an external fact; the system does not transfer funds.
6. Record Receipt by line/quantity.
7. Create PurchaseInspection with specification, quantity, appearance/performance, photos, verdict, and inspector.
8. Resolve discrepancies/rejection or mark complete.

Headquarters staff remain read-only until a future explicit role policy grants more authority.

M11 execution rules:

- PurchaseRequest approval binds the exact immutable PurchaseRequestVersion; edits create a newer version and never retarget a completed Approval.
- Rejection or recall retains the exact negative Approval outcome and uses `EVT-PURCHASE-REVISE-AFTER-NEGATIVE-APPROVAL` to create a direct, strictly newer changed version. The prior version is never returned to an editable state.
- The amount band and approval route come from a versioned internal policy snapshot. VAT-inclusive totals and anti-splitting review facts are retained; presets are not described as statutory values.
- PurchaseResolution may be created only from an approved exact version. External payment information is a recorded fact, not a transfer, accounting journal, or RCMS action.
- Receipt is line/quantity based and may be partial or exceed the expected quantity only through explicit discrepancy handling. PurchaseInspection references the exact Receipt and PurchaseRequest line through typed relations.
- Supplier is an internal procurement master distinct from the external-login Vendor boundary. Vendor actors and unassigned headquarters staff cannot execute internal purchase commands.

## 9. R&D Program and Expenditure

Workflow ID: `WF-RND-V1`.

1. Register R&D Program agreement, agencies, period, total budget, categories, and deadlines.
2. Link multiple Projects and vice versa.
3. Record budget versions and internal Expenditures with evidence.
4. Link Expenditure to relevant Contract/Purchase/Project when applicable.
5. Calculate total budget, expenditure, balance, execution rate, counterparty totals, and category trend.
6. Track report/evaluation/settlement deadlines and evidence completeness.
7. Close/settle program internally while preserving source evidence.

No bank transfer, accounting journal, full VAT/refund workflow, or RCMS approval clone is included. Future integrations use adapters and preserve external IDs/import snapshots.

M11 implements steps 1 through 6 as registration, typed Project links, immutable budget versions, structured expenditure/evidence, aggregates, and deadline alerts. Because `OD-030-RND-STATE-MACHINE` remains open, step 7 lifecycle commands and any Program state/event registry entries remain unavailable rather than being represented by an unconstrained status string.

## 10. Research Note

Workflow ID: `WF-RESEARCH-NOTE-V1`.

1. Author creates note content with research date, purpose, work, result, Project/R&D links, and evidence.
2. Submit for optional Senior review when applicable.
3. Senior records review acceptance or revision request; this is not official Approval Engine approval.
4. Lab Director finalizes the exact note version.
5. Finalized original becomes immutable.
6. Corrections/addenda create new linked entries with reason, author, time, and reference to original.
7. Period/project bundles produce preserved PDF output with manifest/checksums.

No Representative approval step is added.

M12는 이 흐름을 `SM-RESEARCH-NOTE-V1`의 명시적 전이로 구현한다. Senior review를 건너뛰는 경로와 review 후 진행 경로는 모두 exact Entry snapshot에 대한 Lab Director finalization으로 합류한다. 확정 후 correction/addendum는 원본을 덮어쓰지 않으며, PDF bundle은 renderer 식별자·버전, Entry checksum, 포함 Attachment checksum과 최종 manifest/output checksum을 보존한다.

## 11. Technical Document Temporary Access

Workflow ID: `WF-TECHDOC-ACCESS-V1`.

1. Vendor cannot browse or search the technical repository.
2. An internal authorized user/requester creates an access request for an exact document version, grantee, purpose, operation, and period.
3. External release of technical information, including L1, requires Lab Director approval. L2 temporary digital access routes to the Lab Director. L3/L4 external delivery uses controlled print only; L3 routes to the Lab Director and L4 to the Lab Director plus Representative.
4. Approval creates a time-bound `technical_document_access_grant` with explicit conditions.
5. Each L1/L2 preview/download request revalidates user/vendor/scope/grant/expiry/operation.
6. For L3/L4, an internal authorized actor renders an exact-version, numbered watermarked copy, prints it directly, and records page count and printer actor/time. No source-file download or recipient self-print operation exists.
7. Record handover acknowledgment, purpose, recipient/vendor, return/destruction due date, and completion evidence.
8. Revocation, expiry, account disablement, missing provider session, or scope removal makes digital access fail immediately and starts physical-copy recovery follow-up. Account disablement persists DB state, Audit and a provider-revocation request before any Worker provider call; provider failure never restores access.
9. Grant, render, print, handover, return/destruction, denial, revoke, and expire events are audited.

M14 physical implementation binds steps 2~3 to an immutable `TECHNICAL_DOCUMENT_COPY_REQUEST` Approval subject containing the exact DocumentVersion/source Attachment, recipient/vendor, Project/optional Contract, purpose, due plan and request checksum. A copy number is atomically reserved for each request; reprint creates a new request/root/number with the prior-copy link and reason. Project-only recipient Scope requires Membership + Project grant, while Contract-bound Scope requires Membership + Project + Contract grants for the same VendorUser.

The internal renderer proves the watermark on every sequential page and stores only a private output Attachment plus source/output hashes and a manifest. Render, print, handover, return and destruction append custody, audit, transition and outbox evidence in the same transaction. If Scope is lost before handover, handover fails closed and the denial is audited; disposition of an already rendered/printed internally held artifact remains `OD-034` and no invented transition is applied.

## 12. Guarantee and Warranty

Workflow ID: `WF-WARRANTY-V1`.

1. Register contract-specific Guarantee instruments and validity.
2. After acceptance, activate the contract-specific warranty period.
3. Record WarrantyIssue with evidence and severity.
4. Notify Vendor and track plan, remediation, and due dates.
5. Verify fix through inspection/test.
6. Close, extend warranty where contractually agreed, or review guarantee claim/remedy.
7. Before guarantee/warranty expiry, run a final open-issue check.

Periods, ratios, claim rules, and liability caps are contract-specific values. `POL-CONTRACT-BASELINE-V1` supplies an adjustable internal starting preset and must never be labeled a statutory private-contract value.

## 13. Safety Management

Workflow ID: `WF-SAFETY-V1`.

1. Lab Director designates the Safety Manager and optional team safety coordinators.
2. Schedule monthly regular inspections, weekly team self-inspections, event-driven ad-hoc inspections, and directed special inspections.
3. Record checklist results and findings. Critical imminent risk issues a stop-work/area restriction and immediate Lab Director report.
4. Assign corrective action and deadline, verify the result, and retain evidence.
5. Plan new-joiner, semiannual regular, and event-driven special training; track attendance and supplementary training.
6. P1 only: register hazardous materials/current MSDS and waste disposal logs; M13 creates no table or UI for them.
7. P1 only: maintain emergency plans and drills; M13 creates no table or UI for them.
8. On incident, perform emergency response/reporting, preserve the site, investigate within the 48-hour internal-regulation SLA, establish recurrence prevention, verify, and close.
9. Preserve safety records for at least the canonical five-year general period or longer law/legal-hold requirement.

M13에서 Vendor는 활성 VendorMembership과 exact Project/Contract grant가 모두 맞는 경우에도 자신에게 전달된 안전지시·확인·시정 task와 허용된 사건 요약만 조회한다. 내부 원인분석, 개인 교육 상세, 다른 Vendor 또는 내부 전용 증거는 응답 projection에 존재하지 않는다. 48시간 기준은 incident report 시각에서 계산한 내부 조사 SLA이며, 초과 작업은 한 번만 경고·감사하고 상태를 자동 변경하지 않는다.

## 14. Research Allowance

Workflow ID: `WF-ALLOWANCE-V1`.

1. For a formally designated project that grants an allowance, create a `project_allowance_policy_version` defining type, participants, budget, S/A/B/C criteria, amount/formula, cadence, period, and tax-rule version.
2. Lab Director reviews and Representative approves the immutable policy version. Each project may choose monthly, quarterly, semiannual, milestone, or project-end cadence.
3. Capture eligibility evidence for institute recognition, employer qualification, registration, and direct research engagement; title or KOITA registration alone is insufficient for tax treatment.
4. Link Project, ResearchNote, TestResult, result report, patent/prototype/program-success evidence to an evaluation period/project.
5. Lab Director records participation, technical contribution, diligence, limitation factors, and S/A/B/C evaluation; Representative decides the amount under the project policy.
6. Calculate the gross amount and preserve the calculation trace. For tax assessment, aggregate the person's same-month eligible research-activity allowances across every project and apply the KRW 200,000 cap once only when all statutory conditions are evidenced.
7. Unsupported amounts, administrative/support staff, and performance/project-end bonuses default to taxable. Tax classification and wage/ordinary-wage classification remain separate reviewed fields.
8. Export an approved payroll reference without executing payroll or payment. Law version and qualification evidence are revalidated before export.

## 15. Offline Sync

Workflow ID: `WF-OFFLINE-SYNC-V1`.

1. PWA caches only `CACHE-PROJECT-LIST-SAFE`, `CACHE-WBS-LIST-SAFE`, `CACHE-SAFETY-CHECKLIST-TEMPLATE` and creates only the five M15 allowlisted low-risk draft/work-item commands.
2. Each command includes stable ID/type, aggregate/base version, authenticated/effective actor IDs, one-way session binding hash, schema version, canonical minimized payload/hash, and attachment staging metadata when applicable. Raw session credentials are never persisted.
3. Reconnection uploads commands to a trusted sync endpoint.
4. Server re-authenticates and re-authorizes the current actor; offline creation never preserves expired authority.
5. If base version matches, validate and apply through the normal Application Use Case.
6. If it differs, create conflict with local/server representations and do not apply automatically.
7. P0 user chooses server by discarding the local attempt, or creates a new command against the latest server version. Field merge remains disabled until a named command policy and fixture are approved.
8. Resolution records both versions, chosen strategy, current actor/session binding, time, reason and successor command when retrying as new.

Approval, authority/permission/Scope changes, L2~L4 access, technical-document deletion, controlled-copy actions, contract sign/terminate and payment confirmation never enter this flow.
