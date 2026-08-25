# Open Decisions

## Status Vocabulary

- `OPEN`: no approved answer.
- `PARTIALLY_DECIDED`: stable boundary exists, details remain open.
- `WAITING_SOURCE`: required source artifact is missing.
- `PROPOSED`: Codex recommendation awaiting user approval.
- `WAITING_USER`: the user requested a checklist or selection artifact and has not returned the final selection.
- `DECIDED`: move the result into canonical documents and retain a link here.

Blocking levels:

- `GATE_BLOCKER`: blocks any product implementation.
- `P0_SCHEMA_BLOCKER`: blocks physical schema/migration for the affected P0 module.
- `RELEASE_BLOCKER`: blocks production activation or release promotion until resolved.
- `P1_DEVELOPMENT_GATE`: blocks all P1 package, table, route, menu and migration implementation.
- `FEATURE_BLOCKER`: blocks only the named feature or production activation.
- `NON_BLOCKING_CONFIG`: safe to postpone if the system stores a configuration point and no invented default.

## Decisions

| ID | Decision needed | Status | Blocking | Owner / evidence needed | Safe interim treatment |
|---|---|---|---|---|---|
| `OD-001-SUPERIOR-REGULATIONS` | Reconcile the actual `기업부설연구소 운영 규정`, `안전관리규정`, `연구수당 지급 규정` | `DECIDED` | none | Originals uploaded/read 2026-08-21 | Canonical rules reflected in source audit; unresolved internal contradictions split into new decisions |
| `OD-002-CONTRACT-NUMERICS` | Final guarantee ratios, liquidated-damages rate/cap, performance reduction criteria, liability cap/exclusions, warranty periods, insurance/legal review thresholds | `DECIDED` | none; per-contract confirmation remains an operational check | User F.4 + current official law, 2026-08-21 | Use versioned `POL-CONTRACT-BASELINE-V1`; never present public-contract comparison rates as private statutory values |
| `OD-003-ACCEPTANCE-EFFECTS` | Distinguish `PARTIAL_ACCEPTANCE` and `CONDITIONAL_ACCEPTANCE`, including payment eligibility and close conditions | `DECIDED` | none; included in P0 | User F.3 + `P0-SCOPE-V1.0` | Weighted score, distinct dispositions, adjustable approved payment rate, residual hold |
| `OD-004-APPROVAL-POLICY-TABLE` | Document-type, amount-band, security-level, required-step, specific/ALL representative presets | `DECIDED` | none; production policy version must be seeded after Gate | User F.5, `POL-APPROVAL-MATRIX-V1` | Initial version in `docs/legal-policy-baseline.md`; changes are effective-dated and audited |
| `OD-005-COMPANY-FORMS` | Exact fields, pagination, signatures, print/PDF layout for initial six forms and research evidence bundles | `WAITING_SOURCE` | `FEATURE_BLOCKER` for form-specific templates/print fidelity | User uploads originals | Build versioned generic editor/template concepts only after Gate; no guessed layout |
| `OD-006-DASHBOARD-KPI` | Role-specific cards, graphs, thresholds, drill-down, financial projections | `PARTIALLY_DECIDED` | `NON_BLOCKING_CONFIG` | User approved the selected P0 mobile dashboard direction, 2026-08-24 | P0 is limited to personal actionable counts, project progress and recent updates with drill-down. Advanced role KPI, thresholds, financial projections and evaluation charts remain unapproved and must not be hardcoded. |
| `OD-007-HIWORKS` | Mail, organization, SSO, approval, notification integration scope and real API capability | `OPEN` | `FEATURE_BLOCKER` for integration only | API/contract/tenant capability investigation | Keep Integration/Notification/Auth ports; no dependency in domain model |
| `OD-008-MOBILE-NAV` | Final five bottom tabs | `OPEN` | `NON_BLOCKING_CONFIG` | Mobile prototype usability review | Candidate remains Home/Work/Approval/Document/More |
| `OD-009-CALENDAR-IA` | Independent top-level calendar versus Work subpage | `OPEN` | `NON_BLOCKING_CONFIG` | IA/usability review | Route ownership remains feature-neutral |
| `OD-010-SEARCH-SCOPE` | P1 searchable entities and initial technical-document search method | `DECIDED` | none for metadata-only P1 | User PR #49 review, 2026-08-23 | P1 first release indexes explicit internal metadata fields for Project, Document, Item/BOM, Equipment, Safety/MSDS and R&D. Vendor technical-repository search and all body index remain denied. |
| `OD-011-L4-DELIVERY` | Whether an exceptional L4 grant permits preview only, watermark method, maximum period, device/MFA controls | `DECIDED` | none; included in P0 | User F.9 + `P0-SCOPE-V1.0` | No digital/source delivery; internally printed numbered watermarked copy, Director + Rep approval, custody ledger |
| `OD-012-L3-DOWNLOAD-EXCEPTION` | Who can authorize an exception, purpose, max time/count, stronger audit | `DECIDED` | none; P0 implementation awaits checklist | User F.9 | No vendor download/self-print; Director-approved internally printed controlled copy only |
| `OD-013-DOCUMENT-DISPOSAL` | Quarantine duration, purge authority/execution, legal hold, backup deletion behavior | `PARTIALLY_DECIDED` | `FEATURE_BLOCKER` for physical purge | Superior regulations + records policy | Representative approval and permanent audit required; stop at quarantine |
| `OD-014-PROJECT-CLOSE` | Required child states, open contract/warranty/R&D links, reopen policy | `OPEN` | `FEATURE_BLOCKER` for project close transition | Project owner | Closing checklist exists; no automatic cascade |
| `OD-015-TECH-STACK` | Approve Next.js modular monolith, data-access tool, editor, offline store, job runner, hosting | `DECIDED` | none | User F.1, 2026-08-21 | Approved stack in `docs/architecture.md`; exact versions lock after Development Gate |
| `OD-016-ONPREM-TARGET` | PocketBase versus self-hosted Supabase versus PostgreSQL + independent Auth/Storage, and migration RTO/RPO | `OPEN` | `NON_BLOCKING_CONFIG` for P0 if ports/exportability are preserved | Operations/security/cost review | Keep PostgreSQL-centric domain and provider ports; test export manifests |
| `OD-017-NOTIFICATION` | Push/email operational provider, Hiworks mail, opt-out/escalation rules | `OPEN` | `FEATURE_BLOCKER` for external delivery | Operations and Hiworks investigation | Transactional notification outbox only; channel adapter TBD |
| `OD-018-OFFLINE-MERGE` | Field-level merge rules per command and maximum offline data/security policy | `PARTIALLY_DECIDED` | `FEATURE_BLOCKER` for enabling field-level merge on a named command | Field scenarios + security review; common schema fixed by `ADR-007` | Allowlist only; base-version conflicts never auto-apply; merge disabled until a command policy is approved |
| `OD-019-MFA-SESSION` | MFA requirement by actor/action, session duration, device controls, password/SSO policy | `DECIDED` | `RELEASE_BLOCKER` until versioned snapshot and Staging enforcement evidence | User approved recommended policy, 2026-08-23 | INTERNAL/VENDOR, TOTP `aal2`, JWT 60m, session 480m, inactivity 60m, single-session/new-device reauth and exact sensitive-action step-up/managed-device allowlist in `docs/r06-release-gate.md` |
| `OD-020-LEGAL-VALIDATION` | Validate cited civil/subcontract/public-contract provisions and standard clauses for each transaction type | `DECIDED` | none; case-specific checklist remains mandatory | User F.4/F.5 + current official law | Initial internal review in `docs/legal-policy-baseline.md`; law applicability and overrides stored per contract |
| `OD-021-P0-MODULE-CUT` | Confirm optional P0/P1/P2 modules | `DECIDED` | none | User approved recommended selections as `P0-SCOPE-V1.0` and Development Gate, 2026-08-21 | P0: note/test/acceptance/NCR/CAR/ECR/ECO/safety-light/L3-L4 copy; remaining modules staged per checklist |
| `OD-022-ALLOWANCE-SCOPE` | Decide calculation/export scope and payment cadence | `DECIDED` | none; scheduled for P1 | User F.6 + `P0-SCOPE-V1.0` | Approved project policy decides scope and cadence; calculation/export supported only when enabled |
| `OD-023-ALLOWANCE-TAX` | Validate monthly KRW 200,000 tax-exemption text and payroll interface | `DECIDED` | none for logical design; operational revalidation required | User F.7 + Income Tax Act Enforcement Decree/NTS current guidance | Apply once per person/month across eligible projects; unsupported/performance amounts taxable by default; wage status separate |
| `OD-024-ALLOWANCE-REFERENCE` | Correct the allowance appendix's invalid reference to 운영규정 제5조 (meetings) | `DECIDED` | none for logical design; approved regulation amendment still required for source text | User PR #49 review + uploaded allowance regulation, 2026-08-23 | Delete the invalid external regulation reference and self-reference `본 규정 제5조【지급 기준액】에 따라 적용한다`; preserve original and correction provenance until amendment. |
| `OD-025-SAFETY-P0` | Confirm P0 scope for safety manager, inspection schedules, training, MSDS/materials, waste, drills, incident/48-hour investigation | `DECIDED` | none | `P0-SCOPE-V1.0` | P0 light: assignments, monthly/weekly inspections, training, incident/investigation; MSDS, waste, drills in P1 |
| `OD-026-RESEARCH-STAFFING` | Confirm whether current `연구소 4명` description satisfies the operation regulation's principle of one Director plus four or more dedicated researchers | `OPEN` | not a software schema blocker; compliance follow-up | Management/KOITA compliance owner | Keep user scale separate from legal organization headcount; do not infer compliance |
| `OD-027-PROJECT-STRUCTURE` | Approve `STRUCTURE-PROPOSAL-V1` pnpm workspace, package boundaries, route tree, and agent ownership | `DECIDED` | none | User Development Gate approval, 2026-08-21 | Implement through `M00`/`M01`; preserve ownership and merge order |
| `OD-028-DB-PRINCIPAL` | Choose the least-privileged request DB execution pattern: user JWT versus validated transaction-local actor context; isolate service role | `DECIDED` | none; M02 PoC and RLS tests required before production use | `ADR-004`, 2026-08-21 | NOBYPASSRLS request principal + verified transaction-local ActorContext; service-role pool isolated |
| `OD-029-APPROVAL-SUBJECT` | Approve common ApprovalInstance plus typed subject-link tables/adapters for non-Document subjects | `DECIDED` | none | `ADR-003`, 2026-08-21 | Common instance + exactly one typed FK link and subject adapter transaction |
| `OD-030-RND-STATE-MACHINE` | Define the stable states, events, actors, and close/reopen rules for `RND_PROGRAM` | `OPEN` | `FEATURE_BLOCKER` for M11 R&D lifecycle; not a blocker for the M02 empty registry | R&D owner and agreement/settlement scenarios | `WF-RND-V1` exists but no canonical state machine does; M02 must not invent or seed one |
| `OD-031-NCR-REOPEN-FOLLOWUP` | Define the canonical transition path after an NCR reaches `REOPENED` | `OPEN` | `FEATURE_BLOCKER` for post-reopen remediation/second closure; not a blocker for immutable `CLOSED → REOPENED` evidence | Quality owner and recurrence scenarios | M09 implements evidence-backed reopening and immutable history only; it must not invent a `REOPENED` exit transition |
| `OD-032-EMERGENCY-CHANGE-POLICY` | Select production authority tiers, retrospective approval deadline, risk thresholds and notification escalation for EmergencyChangeException | `OPEN` | `NON_BLOCKING_CONFIG` for the versioned engine; production emergency route fails closed until configured | Lab Director/legal/safety/security owners | M10 implements a policy-driven sealed exception and audit contract, but does not invent company-specific authority or deadline values |
| `OD-033-ECO-APPROVAL-NEGATIVE-OUTCOME` | Define the canonical ECO transition/event after Approval is rejected, recalled, or cancelled | `OPEN` | `FEATURE_BLOCKER` for negative-outcome state movement; not a blocker for preserving Approval evidence | Change owner and approval-policy owner | `SM-ECO-V1` lists `CANCELLED` but no canonical rejection/cancel transition. M10 preserves the outcome and leaves ECO state unchanged rather than inventing a transition |
| `OD-034-TECHCOPY-PREHANDOVER-DISPOSITION` | Define the canonical custody event and disposition for an already rendered/printed copy when recipient membership or Project/Contract Scope is lost before handover | `OPEN` | `NON_BLOCKING_CONFIG`; handover remains blocked and the artifact stays in internal custody | Security owner, Lab Director, records-policy owner | M14 revalidates recipient Scope at handover, records the denial, and does not invent a new state/event. The internally held artifact cannot be handed over, deleted, or marked returned/destroyed without a canonical policy action. |
| `OD-035-PRODUCTION-OPERATIONS` | Approve production RPO/RTO, DB and Storage backup frequency/retention, monitoring destinations, incident owners and recovery approval authority | `PARTIALLY_DECIDED` | `RELEASE_BLOCKER` until actual actor binding, snapshot and drill evidence | User approved A values, 2026-08-23; monitoring/evidence/backup provider stable IDs approved 2026-08-25; actual actors pending | RPO 60m/RTO 240m, DB 60m/14d, Storage 60m/30d. Monitoring is `MONITORING_SUPABASE_PLATFORM` + `MONITORING_GITHUB_ACTIONS` + `MONITORING_APPLICATION_SECURITY_LOG`; evidence is `OPS_EVIDENCE_PRIVATE_PRIMARY`; encrypted off-site backup provider is private Google Drive. Select actual incident/recovery approver/executor `UserAccount.id` values; approver/executor sets must be disjoint and drill evidence must bind to the approved payload and finish within RTO. |
| `OD-036-SUPABASE-SESSION-REVOKE` | Select a supported non-destructive Supabase revoke-all-sessions-by-user operation for audited account disable workflow | `DECIDED` | `RELEASE_BLOCKER` until versioned snapshot and Staging capability proof | User approved recommended policy and residual risk, 2026-08-23 | `global` sign-out with trusted target JWT, exact `auth.sessions` every request, residual maximum 60m, retry 3, reconciliation 15m; JWT is one-time memory-only and never retained. |
| `OD-037-P1-DEVELOPMENT-GATE` | Confirm P1 module depth, cross-feature offline/notification/form scope, merge order and implementation start | `PARTIALLY_DECIDED` | `P1_DEVELOPMENT_GATE` | User approved recommended scope/plan and merged issue #48/PR #49 design Gate, 2026-08-23; P0 release and explicit implementation approval remain | Preserve the approved scope/order, but do not create P1 package/table/route/menu/migration until #36 closes, P0 `dev → main` promotion is approved/merged and the user explicitly approves P1 implementation. |
| `OD-038-SEARCH-BODY-INDEX` | Select exact L1/L2 document types, fields, snippet rules and purge SLA for body indexing after the P1 metadata-only release | `OPEN` | `FEATURE_BLOCKER` for body search only | Security owner and document-type/field review | Do not register `search.body.query` or index any body. Metadata-only P1 and all Vendor/L3/L4 body denial remain unaffected. |
| `OD-039-AUTH-RATE-LIMIT-POLICY` | Select per-action fixed-window duration, subject limit and deployment-global limit for login, logout, TOTP enroll/verify, refresh and recovery | `DECIDED` | `RELEASE_BLOCKER` until the exact rules are provisioned with two-person approval evidence | User approved the recommended values, 2026-08-25; distinct active `ADMIN_SECURITY` agreement + `POSITION_LAB_DIRECTOR` approval remains required | Fixed windows `(seconds / subject / global)`: LOGIN `900/5/100`, LOGOUT `60/10/300`, MFA_ENROLL `900/3/30`, MFA_VERIFY `300/5/100`, RECOVERY `3600/3/30`, REFRESH `60/10/500`. The canonical V1 SHA-256 must exactly match all six sorted rules. Missing/mismatched approval, hash, lifecycle, revocation or current-version evidence fails closed before Supabase provider dispatch. |

## Decisions Already Fixed and Not Open

The following must not be reintroduced as TBD:

- Vendor direct login and Deny by Default.
- Junior Researcher project creation.
- Senior Researcher has no official approval authority.
- Lab Director or above is the official approval tier.
- Representative default `ANY_ONE`.
- ResearchNote ends with Lab Director finalization and no Representative approval.
- L2 temporary digital access approval is Lab Director; default duration is 15 days and the approver may change it.
- L3/L4 external source download/self-print is prohibited; controlled printing requires Lab Director for L3 and Lab Director plus Representative for L4.
- Admin-System is separate from L3/L4 source-content access.
- WBS free hierarchy with default 3-level UI.
- Offline conflict comparison/choice/merge; no automatic overwrite.
- General document retention 5 years and technical document permanent retention, subject to superior rules.
- Technical-document deletion requires Representative approval and permanent audit.
- Supplier and Item masters are included in P0 requirements.
- RCMS full replication is prohibited.
- Every active internal user may create an ordinary Project; formal-research designation is a separate sealed application completed by Lab Director review/consent only, without Senior or Representative approval.
- Recommended Next.js/Supabase modular-monolith stack is approved.
- Partial/conditional acceptance uses weighted achievement and an adjustable, separately approved payment rate.
- Contract, legal-review, and approval-matrix initial policies are versioned internal presets in `docs/legal-policy-baseline.md`.
- Research-allowance scope and cadence are configured per approved project policy; tax assessment aggregates across projects per person/month.
- L3/L4 external delivery permits no source download or self-print; controlled watermarked paper handover is the approved route.

## Decision Recording Template

When the user decides an item, record:

```text
Decision ID:
Decision date/time zone:
Decision maker:
Chosen option:
Effective scope:
Effective date:
Source artifact/version:
Affected policy/state/entity IDs:
Migration/backfill impact:
Superseded text:
```

Update `docs/source-audit.md`, every affected design document, and `PROJECT_MEMORY.md` in the same change.
