# Permissions

## 1. Authorization Model

Authorization is the intersection of five dimensions, followed by explicit deny and field projection:

```text
allow = identity_active
     AND role_permission
     AND position_rule
     AND resource_scope
     AND security_level_rule
     AND workflow_state_rule
     AND NOT explicit_deny
```

An `allow` result grants only the fields and operations included in the decision. A permitted row is not permission to read every column or download every attachment.

Decision ID: `AUTHZ-V1`.

## 2. Trusted Actor Context

Every server request builds an `ActorContext` from the verified session and server-side records:

- `user_id`
- activation/session state
- internal organization or active vendor membership
- department and position
- assigned roles and permissions
- active project/contract/document grants
- delegations or acting-authority records
- request time, assurance level/MFA state, and correlation ID

The client may request a resource ID but may not assert its own vendor, role, position, approval authority, or scope.

M03 trust rules:

- Accept only a server-verified Auth subject, expiry, session ID, and assurance level; never derive authorization from user-editable Auth metadata.
- Re-read account kind/status/validity, assignments, memberships, grants, and entitlements at the request time. A stale JWT claim is not proof of current authorization.
- Keep authenticated and effective actor IDs separate and require an exact active acting-authority record before they differ.
- Pass only the factory-produced nominal `TrustedActorContext` into the request database boundary; a raw actor envelope is not a request API.
- Return stable deny reasons, Scope evidence, the named projection profile, and required obligations. A boolean `can()` is insufficient for protected delivery and audit.
- Resolve projection fields from a versioned server registry. Request callers never provide an arbitrary column list.
- Keep request Auth and privileged service/secret Auth clients in separate composition exports.
- Treat ActorContext, resource lineage/state/security context, and projection profiles as factory-produced opaque evidence. Spread clones and caller-assembled lookalikes are rejected at runtime.
- Require every Vendor `*.read` query to use a versioned projection bound to actor kind, resource type, and action.
- Require exact external-release approval evidence for Vendor L1/L2 technical preview or download; L3/L4 digital preview/download/render/print remain hard-denied.
- Official approval requires the exact participant evidence plus Lab Director/Representative position or an active official acting-authority record. Permission alone is never sufficient.
- Account disablement, Vendor disablement, and Vendor membership grant/revoke use guarded optimistic functions that append Audit in the same transaction.

## 3. Stable Roles

| Role ID | Purpose | Does not imply |
|---|---|---|
| `ROLE_RESEARCHER` | Internal research work | official approval |
| `ROLE_PROJECT_MANAGER` | Project/WBS coordination | technical-document source access |
| `ROLE_LAB_DIRECTOR` | Lab management and official approval | representative approval |
| `ROLE_REPRESENTATIVE` | Executive view and representative approval | system administration |
| `ROLE_HQ_VIEWER` | Approved purchase/payment-related read scope | payment mutation or approval |
| `ROLE_VENDOR_USER` | Vendor portal within explicit scope | repository search or internal data |
| `ROLE_SAFETY_MANAGER` | safety inspections, training, hazardous-material/waste and incident operations | general HR discipline or business approval |
| `ROLE_ALLOWANCE_EVALUATOR` | authorized research-performance evaluation evidence | payroll/tax processing or self-approval |
| `ADMIN_SYSTEM` | users, roles, modules, system settings | L3/L4 source content or business approval |
| `ADMIN_SECURITY` | security policy, access grants, audit review | automatic business ownership |
| `ADMIN_DOCUMENT` | templates, numbering, retention policy | delete approval or source-content access |
| `ADMIN_APPROVAL` | approval policy configuration | approval of individual business cases |

A person may hold multiple roles, but every role assignment is explicit and audited.

## 4. Position Rules

| Position ID | Default workflow capability |
|---|---|
| `POSITION_JUNIOR_RESEARCHER` | draft, submit, ordinary project creation |
| `POSITION_SENIOR_RESEARCHER` | review/agreement; no official `APPROVE` action |
| `POSITION_LAB_DIRECTOR` | first official approval, research-note finalization |
| `POSITION_REPRESENTATIVE` | representative approval; default group `ANY_ONE` |

Position participates in default approval-line resolution. It never replaces Permission or Scope checks.

## 5. Permission Naming

Format: `<resource>.<surface>.<action>`.

Examples:

- `project.record.create`
- `project.research_designation.submit`
- `project.wbs.update`
- `contract.list.read`
- `contract.detail.read`
- `contract.detail.finance.read`
- `deliverable.record.submit`
- `inspection.record.decide`
- `ncr.record.issue`
- `ncr.action.perform`
- `ncr.plan.review`
- `ncr.effectiveness.verify`
- `ncr.record.close`
- `approval.instance.submit`
- `approval.step.review`
- `approval.step.approve`
- `research_note.record.finalize`
- `technical_document.repository.search`
- `technical_document.content.preview`
- `technical_document.content.download`
- `technical_document.copy.render`
- `technical_document.copy.handover`
- `technical_document.copy.close`
- `technical_document.access.grant`
- `audit.security.read`

`technical_document.repository.search` is never granted to a vendor. A vendor grant targets an exact document version and action.

## 6. Scope Types

| Scope ID | Resource boundary | Typical source |
|---|---|---|
| `SCOPE_ORGANIZATION` | internal organization | employment/role |
| `SCOPE_DEPARTMENT` | department | internal assignment |
| `SCOPE_PROJECT` | exact project | ProjectMember/ProjectScope |
| `SCOPE_CONTRACT` | exact vendor contract | ContractScope |
| `SCOPE_VENDOR` | exact vendor membership | VendorUser |
| `SCOPE_DOCUMENT` | exact document/version | DocumentGrant |
| `SCOPE_SELF` | actor-owned draft/action | ownership |

For vendor data, `SCOPE_VENDOR` alone is insufficient. The action also requires the appropriate active Project or Contract scope.

## 7. Deny by Default for Vendors

Vendor authorization algorithm `AUTHZ-VENDOR-V1`:

1. Verify an active user and active vendor membership.
2. Reject if vendor account, membership, project scope, contract scope, or access grant is expired/revoked/disabled.
3. Resolve the resource's owning vendor and project/contract relationships from the database.
4. Require exact vendor match.
5. Require exact active project or contract scope for the action.
6. Apply resource action permission.
7. Apply security level and workflow-state restrictions.
8. Apply response field projection.
9. Record sensitive success/failure audit events.

No endpoint uses a caller-supplied `vendor_id` as proof of access. No query returns all vendors and filters them in browser code.

## 8. Vendor Surface Matrix

| Surface | Vendor access | Enforcement |
|---|---|---|
| Assigned project summary | read approved external projection | server scope + RLS |
| Assigned vendor task | read/update/submit allowed fields | server transition + RLS |
| Deliverable | submit own, read permitted status | server scope + storage policy |
| Inspection/rework | read external verdict and requests | external DTO projection |
| Contract list | list-safe metadata only | dedicated query/view; no finance columns |
| Own contract detail | allowed details; finance fields only with `contract.detail.finance.read` | exact ContractScope + field projection |
| Shared general document | exact grant | document/version scope |
| Temporary technical document | exact active grant, no repository browsing | grant check + storage delivery policy |
| Other vendors | always deny | RLS and application test |
| Internal vendor evaluation/risk | always deny | separate schema/query/permission |
| R&D budget/expenditure | always deny | no scope mapping |
| Internal approval inbox | always deny | internal actor condition |
| Internal purchase/payment | always deny | no permission/scope |

## 9. Technical Security Levels

| Level ID | Internal | Vendor | Approval | Delivery |
|---|---|---|---|---|
| `SEC_L1_PUBLIC_GENERAL` | job/scope | explicitly shared | Lab Director for external technical-information release | controlled download/preview |
| `SEC_L2_INTERNAL` | job/scope | default deny; temporary exception | Lab Director | exact version, time-bound |
| `SEC_L3_CONFIDENTIAL` | project/job scope and permission | digital source denied; exceptional controlled copy | Lab Director | internal watermarked print, numbered handover, return/destruction audit |
| `SEC_L4_CORE_SECRET` | separately entitled users only | digital source denied; exceptional controlled copy | Lab Director + Representative | internally printed numbered copy only; strongest custody controls |

`ADMIN_SYSTEM` does not satisfy content-read requirements for L3 or L4.

L1 means the content is eligible for external sharing; it does not itself authorize external release. The superior operation regulation requires Lab Director approval for technical-information export.

Technical access decision `AUTHZ-TECHDOC-V1` requires:

- exact document version;
- active grant and allowed operation;
- current time within grant interval;
- matching grantee user and vendor;
- unchanged account/vendor/scope state;
- required approval instance completed;
- delivery constraints satisfied.

For L3/L4 external delivery, the only allowed external operation is `CONTROLLED_PRINT_HANDOVER`. Rendering and printing are internal-only actions. Authorization additionally requires an unconsumed approval for the exact DocumentVersion, a unique copy number, recipient identity, purpose, and return/destruction plan. Vendors never receive `content.download` or `copy.render`.

Expiry and revocation are evaluated at read time, not only by a background job.

## 10. Approval Permissions

- `approval.instance.submit`: author or authorized submitter.
- `approval.step.review`: designated reviewer.
- `approval.step.agree`: designated agreement participant.
- `approval.step.reference`: designated reference recipient; receipt is evidence, not official approval.
- `approval.step.approve`: designated official approver with position/role capability.
- `approval.step.reject`: currently active designated participant; reason required.
- `approval.instance.recall`: submitter while policy and current state permit.
- `approval.policy.manage`: `ADMIN_APPROVAL`; does not authorize a case action.
- `approval.instance.override`: not defined by default. Any future emergency override requires a new policy, dual control, reason, and audit.

The Senior Researcher position fails `approval.step.approve` even if the person can review. A user holding another explicitly authorized acting role may approve only through a recorded delegation/acting-authority context, never by silently converting the Senior position.

M04 revalidates the active account, exact participant, current Position assignment, selected acting-authority assignment, evidence, allowed action, revocation and `[valid_from, valid_to)` interval at command time. UI visibility is advisory only; application authorization and PostgreSQL command functions/RLS are authoritative. `Admin-System` policy administration and Vendor membership confer no case-action authority.

M05 keeps Vendor access to Document/File denied until M06/M07 provide real Project/Contract parent FKs and reviewed grants. An owner may read metadata, while an active exact-version approval participant may read only the sealed subject needed for that approval. Raw editor content, private object coordinates and evidence tables are excluded from ordinary table projections and are returned only through audited SECURITY DEFINER commands. L3/L4 source access requires the canonical authorization action plus explicit `ENTITLEMENT_L3_SOURCE_READ` or `ENTITLEMENT_L4_SOURCE_READ`; the `ADMIN_SYSTEM` role alone is never sufficient.

## 11. Project Creation and Formal Designation

| Action | Active internal user | Project owner | Senior | Lab Director | Representative | Vendor |
|---|---:|---:|---:|---:|---:|---:|
| Create ordinary Project | allow | allow | allow | allow | allow | deny |
| Edit owned Project draft | own/scope | allow | scope | scope | policy read | deny |
| Submit designation application | own/scope | allow | scope | scope | deny | deny |
| Review and approve designation | deny | deny | deny | final consent/review | deny | deny |
| Set formal-research label directly | deny | deny | deny | deny | deny | deny |

Formal status is derived only from a completed `research_project_designation`, never from Project edit permission.

M06 makes this Project scope physical. Internal Project access is evaluated from the current active account, owner/membership and action; Vendor access additionally requires the same active VendorMembership referenced by an unexpired, unrevoked Project grant with the requested action. A matching row alone does not widen field projection. Formal-research application review reads only the exact sealed application version bound to the active Approval participant, and only a direct or explicitly recorded acting `POSITION_LAB_DIRECTOR` may produce the designation outcome.

M07 makes `SCOPE_CONTRACT` physical with a real Contract FK and active VendorMembership. Vendor list access uses only `CONTRACT_LIST_VENDOR_V1`; it cannot return amount, payment schedule/status, guarantee amount or internal evaluation/risk fields. `CONTRACT_DETAIL_VENDOR_BASIC_V1` requires exact Contract Scope. `CONTRACT_DETAIL_VENDOR_FINANCE_V1` additionally requires `contract.detail.finance.read` and is a separate projection/result type, so omission cannot be bypassed by requesting optional fields. Contract close/termination or membership/grant expiry/revoke removes access immediately at application and RLS layers.

M08 Vendor Inspection access requires the same active account, VendorMembership and exact Project/Contract grant used by the inspected Deliverable. `INSPECTION_VENDOR_EXTERNAL_V1` exposes only submitted-version identity, external disposition, residual/correction requests and due dates; it excludes internal inspector opinion, policy deliberation, amount, held amount, calculated/adjusted/final rate and Approval evidence. Finance decision projection remains a distinct `contract.detail.finance.read` path. A Vendor may submit evidence and correction but may never inspect, accept, adjust or approve its own work.

M11 Purchase/R&D permissions:

| Action | Authorized internal owner | Lab Director/Representative | Headquarters | Vendor |
|---|---:|---:|---:|---:|
| Draft and submit PurchaseRequest | explicit purchase permission | only with explicit purchase permission | read only | deny |
| Official PurchaseRequest approval | exact policy participant and acting authority | amount-policy participant only | read only | deny |
| Create Resolution / record Receipt / Inspection | explicit function-specific permission | only with explicit function permission | read only | deny |
| Record external payment fact | explicit `purchase.payment.record` | only with explicit permission | read only until role policy | deny |
| Read R&D budget/expenditure/evidence | explicit internal R&D read | explicit internal R&D read | read only | deny |
| Mutate R&D budget/expenditure/evidence/deadline | explicit function-specific permission | only with explicit function permission | deny until role policy | deny |
| Start/close/settle/reopen RndProgram | deny while `OD-030` is open | deny while `OD-030` is open | deny | deny |

`PURCHASE_LIST_INTERNAL_V1`, `PURCHASE_DETAIL_INTERNAL_V1`, `RND_PROGRAM_LIST_INTERNAL_V1`, and `RND_PROGRAM_SUMMARY_INTERNAL_V1` are versioned internal-only projections. Vendor has no Purchase/R&D projection variant and cannot gain one from Project, Contract, Supplier/Vendor linkage, or an Approval participant row. API handlers derive trusted ActorContext, and RLS/guarded command functions recheck active account, internal actor kind, exact action, current state/version, and immutable subject lineage.

## 12. Research Note Permissions

| Action | Author | Senior | Lab Director | Representative | Admin |
|---|---:|---:|---:|---:|---:|
| Draft own note | allow | allow | allow | policy read only | no content by default |
| Submit review | own | own | own | deny | deny |
| Senior review | if assigned | allow if assigned | optional view | deny | deny |
| Finalize | deny | deny | allow | deny | deny |
| Edit finalized original | deny | deny | deny | deny | deny |
| Add correction/addendum | author/authorized | authorized | authorized | deny | deny |

Representative approval must not be injected by the generic default line because ResearchNote uses the dedicated finalization workflow policy.

M12의 `RESEARCH_NOTE_LIST_INTERNAL_V1`과 `RESEARCH_NOTE_DETAIL_INTERNAL_V1`은 내부 전용 allowlist projection이다. 목록에는 원문/editor content, Attachment 저장좌표와 URL/token이 없고, 상세도 exact Entry/PDF manifest 식별·무결성 metadata만 제공한다. Vendor는 Project나 R&D 연결이 있어도 ResearchNote projection과 명령에서 거부된다. `Admin-System`은 정책·운영 metadata 권한만으로 Entry 원문이나 private Attachment 내용을 읽을 수 없다.

명령은 활성 내부계정, author/assigned Senior/Lab Director 역할, exact Project/R&D 관계, 현재 상태와 optimistic version을 서버와 DB에서 재검증한다. Senior와 Representative는 finalization을 수행할 수 없으며, Lab Director 권한도 확정된 원본을 수정하거나 PDF evidence를 교체하는 권한으로 확장되지 않는다.

## 13. Field-Level Projection

Field projection policies are versioned server rules.

Example contract projections:

- `CONTRACT_LIST_INTERNAL_V1`: identity, vendor, title, period, state, risk badge as permitted.
- `CONTRACT_LIST_VENDOR_V1`: title, contract number, assigned project, period, external state; excludes amount, payment, internal risk/evaluation.
- `CONTRACT_DETAIL_VENDOR_BASIC_V1`: list fields plus external milestones/deliverables.
- `CONTRACT_DETAIL_VENDOR_FINANCE_V1`: explicitly permitted contract amount and payment-status subset.

The database may expose dedicated views/functions for these projections, but the application still verifies ActorContext and action.

NCR/CAR projections:

- `NCR_LIST_INTERNAL_V1`: NCR number, source, severity, state, responsibility status, owner and due/overdue facts.
- `NCR_DETAIL_INTERNAL_V1`: internal list plus typed source/evidence, containment, root cause, every CAR, verification and immutable transition history.
- `NCR_LIST_VENDOR_V1`: only exact assigned NCR number, external severity/state, due fact and scoped Contract/Deliverable reference.
- `NCR_DETAIL_VENDOR_ACTION_V1`: only the containment, root-cause/action-plan and implementation fields/evidence that the assigned Vendor must perform. Internal responsibility deliberation, contract-remedy review and internal notes are absent from the DTO.

Vendor action requires an active account and VendorMembership, an active exact Project or Contract grant, and assignment to that Vendor/NCR. Vendor actors cannot issue, accept a plan, verify effectiveness, close or reopen. Internal review authority does not imply independent verification when the same actor owned or performed the CAR. Senior Researcher review never becomes official approval authority through NCR/CAR.

## 14. Application and Database Enforcement

### Application server

- Builds ActorContext.
- Checks permission, position, scope, state, security level, and field projection.
- Executes domain transition.
- Uses service credentials only after authorization.
- Emits business and security audit events.

### PostgreSQL/RLS

- Enables RLS on exposed business and storage metadata tables.
- Prevents cross-vendor and unauthorized project/contract reads/writes.
- Treats service-role bypass as infrastructure privilege, not user authorization.
- Uses separate DB roles or guarded functions for background workers and audit writers.

### Storage

M05 uses a private `PRIVATE_BUSINESS` bucket, server-issued object keys and an audited one-time delivery broker. Anonymous/authenticated direct object select/insert/update/delete is denied for that bucket. Each redemption is bound to the trusted authorization decision ID, actor, exact Attachment and short expiry; provider coordinates and signed/public URLs are never persisted or returned as durable application data.

- Private buckets only for business/technical content.
- Object path is not an authorization boundary by itself.
- Upload requires a server-issued intent bound to subject, version, size/type constraints, and actor.
- Download/preview requires a fresh authorization decision.

## 15. Safety and Allowance Permissions

- The Lab Director designates `ROLE_SAFETY_MANAGER`; designation is effective-dated and audited.
- M13 Safety Manager may schedule/record inspections, education, incident investigation, and corrective verification. Material/waste/drill capabilities remain P1 and have no M13 physical route or table.
- A critical safety finding may place the affected work area/task into stop-work state; release requires the authorized safety/Lab Director transition and evidence.
- Vendors/visitors see only allowlisted safety instructions, acknowledgements, assigned corrective tasks, and permitted incident summaries after active VendorMembership plus exact Project/Contract grant validation. Internal cause analysis, other users' training detail, and unrestricted evidence fields are excluded at application and DB projection layers.
- Research allowance eligibility/evaluation data is restricted HR-like data. Project membership does not imply access.
- The Lab Director evaluates contribution under the superior regulation; Representative-approved ratios/decisions are separate records.
- Allowance calculation and tax classification require an approved project policy, exact calculation/tax-rule version, and HR-like restricted permission. No project role may self-approve or mark external payment complete.

## 16. Audit Requirements

Always audit:

- login success/failure and account disablement;
- role/permission/position/scope grant or revoke;
- approval submit/action/recall/reject/complete;
- technical-document preview/download/access failure and every L3/L4 render/print/handover/return/destruction event;
- access request/grant/revoke/expire;
- contract, inspection, NCR/CAR, purchase, research-note, warranty, ECR/ECO critical transitions;
- technical-document delete request/approval/quarantine/purge;
- field-protected vendor contract finance reads;
- administrative use of service privilege.

ECR/ECO authorization additionally requires:

- trusted internal review and official Approval to remain separate actions; Senior review never satisfies `APPROVE`;
- Vendor access to require active membership, exact Project/Contract grants and explicit ECR/ECO assignment on every request;
- Vendor list/detail projections to omit internal impact deliberation, approval participants, contract amounts, legal notes and security findings not assigned for action;
- ECO verification to be internal and independent from every implementation actor;
- emergency exception creation, use and retrospective approval to emit append-only audit events and fail closed when the versioned policy is unavailable.

Audit records are append-only and must identify both the authenticated actor and effective delegated actor.

## 17. Required Authorization Test Matrix

For each protected use case, test:

- internal permitted actor;
- internal actor lacking role;
- correct role but wrong project/contract scope;
- vendor in exact vendor/project/contract scope;
- vendor from another vendor;
- expired scope;
- disabled vendor user;
- system administrator without business/content permission;
- Senior Researcher attempting official approval;
- Representative access where only Lab Director is allowed;
- list response field absence, not merely null/hide;
- direct DB/RLS access and trusted server path.
