# Logical ERD

## 1. Conventions

- Logical design only; physical types, indexes, partitioning, and migration syntax follow after Gate approval.
- `id` values are UUIDs. Human numbers are alternate unique keys.
- Every mutable aggregate root includes `version_no`, `created_at`, and `updated_at` even where omitted from diagrams.
- State columns use reviewed enum/check/state-definition IDs from `docs/state-machines.md`, never unconstrained text.
- All money uses amount plus currency.
- Soft deletion is not a universal substitute for retention/disposal lifecycle.
- Polymorphic foreign keys are avoided for protected business links; typed join tables preserve referential integrity.

## 2. Identity, Role, and Scope

```mermaid
erDiagram
  ORGANIZATION ||--o{ DEPARTMENT : contains
  USER_ACCOUNT ||--o{ USER_ORGANIZATION_ASSIGNMENT : assigned
  ORGANIZATION ||--o{ USER_ORGANIZATION_ASSIGNMENT : bounds
  USER_ACCOUNT ||--o{ USER_DEPARTMENT_ASSIGNMENT : assigned
  DEPARTMENT ||--o{ USER_DEPARTMENT_ASSIGNMENT : bounds
  USER_ACCOUNT ||--o{ USER_POSITION_ASSIGNMENT : assigned
  POSITION ||--o{ USER_POSITION_ASSIGNMENT : bounds
  USER_ACCOUNT ||--o{ USER_ROLE_ASSIGNMENT : has
  ROLE ||--o{ USER_ROLE_ASSIGNMENT : assigned
  ROLE ||--o{ ROLE_PERMISSION_ASSIGNMENT : contains
  PERMISSION ||--o{ ROLE_PERMISSION_ASSIGNMENT : grants
  USER_ACCOUNT ||--o{ USER_SECURITY_ENTITLEMENT_ASSIGNMENT : has
  SECURITY_ENTITLEMENT ||--o{ USER_SECURITY_ENTITLEMENT_ASSIGNMENT : grants
  VENDOR ||--o{ VENDOR_USER : has
  USER_ACCOUNT ||--o{ VENDOR_USER : joins
  AUTHORIZATION_ACTION_SET ||--o{ AUTHORIZATION_ACTION_SET_VERSION : versions
  AUTHORIZATION_ACTION_SET_VERSION ||--o{ AUTHORIZATION_ACTION_SET_PERMISSION : contains
  PERMISSION ||--o{ AUTHORIZATION_ACTION_SET_PERMISSION : allows
  FIELD_PROJECTION_PROFILE ||--o{ FIELD_PROJECTION_PROFILE_VERSION : versions
  FIELD_PROJECTION_PROFILE_VERSION ||--o{ FIELD_PROJECTION_FIELD : includes
  USER_ACCOUNT ||--o{ ACTING_AUTHORITY_ASSIGNMENT : authenticates
  AUTHORIZATION_ACTION_SET_VERSION ||--o{ ACTING_AUTHORITY_ASSIGNMENT : limits
  USER_ACCOUNT ||--o{ PROJECT_SCOPE : granted
  PROJECT ||--o{ PROJECT_SCOPE : bounds
  USER_ACCOUNT ||--o{ CONTRACT_SCOPE : granted
  VENDOR_CONTRACT ||--o{ CONTRACT_SCOPE : bounds

  ORGANIZATION {
    uuid id PK
    string legal_name
    enum status
  }
  DEPARTMENT {
    uuid id PK
    uuid organization_id FK
    uuid parent_id FK
    string stable_code UK
  }
  POSITION {
    uuid id PK
    string stable_code UK
    int approval_rank
  }
  USER_ACCOUNT {
    uuid id PK
    string auth_subject UK
    enum account_kind
    enum status
    datetime valid_from
    datetime valid_until
  }
  ROLE {
    uuid id PK
    string stable_code UK
  }
  PERMISSION {
    uuid id PK
    string stable_code UK
  }
  USER_ROLE_ASSIGNMENT {
    uuid id PK
    uuid user_id FK
    uuid role_id FK
    datetime valid_from
    datetime valid_until
    datetime revoked_at
  }
  ROLE_PERMISSION_ASSIGNMENT {
    uuid id PK
    uuid role_id FK
    uuid permission_id FK
    datetime valid_from
    datetime valid_until
    datetime revoked_at
  }
  SECURITY_ENTITLEMENT {
    uuid id PK
    string stable_code UK
    enum status
  }
  USER_SECURITY_ENTITLEMENT_ASSIGNMENT {
    uuid id PK
    uuid user_id FK
    uuid entitlement_id FK
    datetime valid_from
    datetime valid_until
    datetime revoked_at
    bigint version_no
  }
  VENDOR {
    uuid id PK
    string vendor_code UK
    enum status
  }
  VENDOR_USER {
    uuid id PK
    uuid vendor_id FK
    uuid user_id FK
    enum status
    datetime valid_from
    datetime valid_until
    datetime revoked_at
  }
  AUTHORIZATION_ACTION_SET_VERSION {
    uuid action_set_id FK
    int version_no
    datetime valid_from
    datetime valid_until
  }
  AUTHORIZATION_ACTION_SET_PERMISSION {
    uuid action_set_id FK
    int action_set_version FK
    uuid permission_id FK
  }
  FIELD_PROJECTION_PROFILE_VERSION {
    uuid profile_id FK
    int version_no
    enum actor_kind
    string resource_type
    string action_id
    datetime valid_from
    datetime valid_until
  }
  FIELD_PROJECTION_FIELD {
    uuid profile_id FK
    int profile_version FK
    string field_id
  }
  ACTING_AUTHORITY_ASSIGNMENT {
    uuid id PK
    uuid authenticated_user_id FK
    uuid effective_actor_user_id FK
    uuid role_id FK
    uuid action_set_id FK
    int action_set_version FK
    datetime valid_from
    datetime valid_until
  }
  PROJECT_SCOPE {
    uuid id PK
    uuid vendor_user_id FK
    uuid project_id FK
    uuid action_set_id FK
    int action_set_version FK
    datetime valid_until
    enum state
  }
  CONTRACT_SCOPE {
    uuid id PK
    uuid vendor_user_id FK
    uuid vendor_contract_id FK
    uuid action_set_id FK
    int action_set_version FK
    datetime valid_until
    enum state
  }
```

M03 physically creates Identity/RBAC, Vendor/VendorUser, acting-authority, normalized action-set, and named field-projection records. `PROJECT_SCOPE`, `CONTRACT_SCOPE`, and exact DocumentVersion grant records remain logical extension points until M06, M07, and M05 can create them with their real typed FK targets and RLS in the same migration. M03 must not substitute a generic `(resource_type, resource_id)` grant table.

M04 physically creates `APPROVAL_POLICY`, immutable/sealed `APPROVAL_POLICY_VERSION`, normalized step/participant policy rules, `APPROVAL_INSTANCE`, snapshotted `APPROVAL_STEP`/`APPROVAL_PARTICIPANT`, append-only `APPROVAL_ACTION`, and the bootstrap typed link `APPROVAL_SUBJECT_POLICY_VERSION`. The typed link uses exact version/checksum composite FKs; later subject adapters are added only with their real aggregate FKs. Policy-rule ownership cannot be reparented to bypass a sealed version, and resubmission requires the same subject root plus a strictly newer sealed version.

M05 physically creates normalized `TEMPLATE`/`TEMPLATE_VERSION`, `DOCUMENT`/`DOCUMENT_VERSION`, `ATTACHMENT`, logical `DOCUMENT_ATTACHMENT` history, content-validation/seal/scan evidence, and `APPROVAL_SUBJECT_DOCUMENT_VERSION`. Exact composite FKs bind template snapshots, validation checksum, sealed manifest evidence, scan evidence and approval subject version/checksum/sealed-at. `DOCUMENT_VERSION.security_level_snapshot` prevents a later Document-head downgrade from weakening a historical L3/L4 version. FORCE RLS and column grants exclude raw editor content, object coordinates and evidence tables; SECURITY DEFINER commands are the only write/content-delivery path.

M06 physically creates `PRODUCT`, `PROJECT`, `PROJECT_MEMBER`, `PROJECT_PRODUCT_LINK`, self-referencing `WBS_NODE`, and exact-FK `PROJECT_VENDOR_GRANT`. Formal designation uses `RESEARCH_PROJECT_APPLICATION_ROOT`, immutable/versioned `RESEARCH_PROJECT_APPLICATION_VERSION`, normalized team/output/evidence children, exact `APPROVAL_SUBJECT_RESEARCH_PROJECT_APPLICATION`, and immutable `RESEARCH_PROJECT_DESIGNATION`. Formal status is a derived projection, never an editable Project column. RLS and command functions require active internal membership or the exact active Vendor membership + Project grant; Vendor projections omit unreviewed fields.

M07 physically creates `VENDOR_CONTRACT`, immutable `CONTRACT_VERSION`, `CONTRACT_PROJECT`, structured `CONTRACT_MILESTONE`, `DELIVERABLE`/`DELIVERABLE_VERSION`, `GUARANTEE`, `WARRANTY_ISSUE`, exact-FK `CONTRACT_VENDOR_GRANT` and `APPROVAL_SUBJECT_CONTRACT_VERSION`. Contract list-safe, basic-detail and finance-detail projections are separate database contracts. The safe projections never select finance/payment/internal-evaluation columns; finance requires an exact active Vendor membership/grant and finance action. Activation and terminal Contract transitions update grants with audit/transition/outbox atomically.

M08 physically creates `REQUIREMENT`/immutable `REQUIREMENT_REVISION`, versioned `TEST_PLAN` with exact revision coverage, immutable `TEST_RESULT` evidence, `INSPECTION`, immutable `INSPECTION_CHECKLIST_VERSION`/`INSPECTION_CRITERION`, numbered immutable `INSPECTION_ATTEMPT`/`INSPECTION_CRITERION_RESULT`, typed residual-condition/partial-usable-portion children, `ACCEPTANCE_PAYMENT_DECISION`, `PAYMENT_RATE_ADJUSTMENT`, and exact-FK `APPROVAL_SUBJECT_ACCEPTANCE_PAYMENT_DECISION`. Calculated, proposed, adjusted and final rates are separate columns. No payment-transfer or accounting table/function is introduced.

## 3. Document, File, Approval, and Technical Access

```mermaid
erDiagram
  TEMPLATE ||--o{ TEMPLATE_VERSION : versions
  TEMPLATE_VERSION ||--o{ DOCUMENT : instantiates
  DOCUMENT ||--o{ DOCUMENT_VERSION : versions
  DOCUMENT_VERSION ||--o{ DOCUMENT_ATTACHMENT : includes
  ATTACHMENT ||--o{ DOCUMENT_ATTACHMENT : linked
  APPROVAL_POLICY ||--o{ APPROVAL_POLICY_VERSION : versions
  APPROVAL_POLICY_VERSION ||--o{ APPROVAL_INSTANCE : governs
  DOCUMENT_VERSION ||--o{ APPROVAL_INSTANCE : subject_snapshot
  APPROVAL_INSTANCE ||--o{ APPROVAL_STEP : contains
  APPROVAL_STEP ||--o{ APPROVAL_PARTICIPANT : resolves
  USER_ACCOUNT ||--o{ APPROVAL_PARTICIPANT : acts
  APPROVAL_INSTANCE ||--o{ APPROVAL_ACTION : records
  USER_ACCOUNT ||--o{ APPROVAL_ACTION : performs
  DOCUMENT_VERSION ||--o{ TECH_ACCESS_REQUEST : requested
  VENDOR_USER ||--o{ TECH_ACCESS_REQUEST : requests_for
  TECH_ACCESS_REQUEST ||--o| APPROVAL_INSTANCE : approved_by
  TECH_ACCESS_REQUEST ||--o{ TECH_ACCESS_GRANT : creates
  DOCUMENT_VERSION ||--o{ TECH_ACCESS_GRANT : protects
  VENDOR_USER ||--o{ TECH_ACCESS_GRANT : receives
  DOCUMENT_VERSION ||--o{ TECHNICAL_DOCUMENT_COPY : copied_as
  APPROVAL_INSTANCE ||--o{ TECHNICAL_DOCUMENT_COPY : authorizes
  USER_ACCOUNT ||--o{ TECHNICAL_DOCUMENT_COPY : prints

  TEMPLATE {
    uuid id PK
    string template_code UK
    enum state
  }
  TEMPLATE_VERSION {
    uuid id PK
    uuid template_id FK
    int version_no
    json content_schema
    string checksum
  }
  DOCUMENT {
    uuid id PK
    string document_no UK
    string document_type_id
    enum security_level
    string retention_policy_id
    enum lifecycle_state
  }
  DOCUMENT_VERSION {
    uuid id PK
    uuid document_id FK
    int version_no
    json editor_content
    string content_schema_version
    string checksum
    bool immutable
  }
  ATTACHMENT {
    uuid id PK
    string storage_provider
    string storage_key UK
    string mime_type
    bigint size_bytes
    string sha256
    enum security_level
  }
  DOCUMENT_ATTACHMENT {
    uuid document_version_id FK
    uuid attachment_id FK
    string purpose_code
  }
  APPROVAL_POLICY {
    uuid id PK
    string stable_code UK
    enum state
  }
  APPROVAL_POLICY_VERSION {
    uuid id PK
    uuid approval_policy_id FK
    int version_no
    json typed_rule_config
    string checksum
  }
  APPROVAL_INSTANCE {
    uuid id PK
    uuid policy_version_id FK
    uuid document_version_id FK
    uuid submitter_id FK
    int generation
    enum state
  }
  APPROVAL_STEP {
    uuid id PK
    uuid approval_instance_id FK
    int sequence_no
    enum participant_role
    enum completion_mode
    bool required
    enum state
  }
  APPROVAL_PARTICIPANT {
    uuid id PK
    uuid approval_step_id FK
    uuid user_id FK
    uuid acting_for_user_id FK
    enum state
  }
  APPROVAL_ACTION {
    uuid id PK
    uuid approval_instance_id FK
    uuid approval_step_id FK
    uuid actor_user_id FK
    string event_id
    string opinion
    datetime occurred_at
  }
  TECH_ACCESS_REQUEST {
    uuid id PK
    uuid document_version_id FK
    uuid vendor_user_id FK
    enum requested_operation
    datetime requested_until
    enum state
  }
  TECH_ACCESS_GRANT {
    uuid id PK
    uuid request_id FK
    uuid document_version_id FK
    uuid vendor_user_id FK
    enum allowed_operation
    datetime starts_at
    datetime ends_at
    bool watermark_required
    bool download_allowed
    enum state
  }
  TECHNICAL_DOCUMENT_COPY {
    uuid id PK
    uuid document_version_id FK
    uuid approval_instance_id FK
    uuid printed_by_user_id FK
    string copy_no UK
    enum security_level
    string recipient_identity
    string recipient_vendor
    int page_count
    datetime printed_at
    datetime handed_over_at
    datetime return_destroy_due_at
    enum state
  }
```

Document business links are typed join tables, for example `PROJECT_DOCUMENT`, `CONTRACT_DOCUMENT`, `RND_DOCUMENT`, `PURCHASE_DOCUMENT`, `INSPECTION_DOCUMENT`, and `RESEARCH_NOTE_DOCUMENT`.

## 4. Project, WBS, Requirement, and R&D Links

```mermaid
erDiagram
  PRODUCT ||--o{ PROJECT_PRODUCT : linked
  PROJECT ||--o{ PROJECT_PRODUCT : linked
  PROJECT ||--o{ PROJECT_RND_PROGRAM : linked
  RND_PROGRAM ||--o{ PROJECT_RND_PROGRAM : linked
  PROJECT ||--o{ PROJECT_MEMBER : assigns
  USER_ACCOUNT ||--o{ PROJECT_MEMBER : participates
  PROJECT ||--o{ RESEARCH_PROJECT_APPLICATION : applies
  RESEARCH_PROJECT_APPLICATION ||--o| RESEARCH_PROJECT_DESIGNATION : approved_as
  APPROVAL_INSTANCE ||--o| RESEARCH_PROJECT_DESIGNATION : authorizes
  PROJECT ||--o{ WBS_NODE : decomposes
  WBS_NODE ||--o{ WBS_NODE : parent_of
  PROJECT ||--o{ REQUIREMENT : defines
  REQUIREMENT ||--o{ REQUIREMENT_REVISION : versions
  REQUIREMENT_REVISION ||--o{ TEST_PLAN_REQUIREMENT : covered_by
  TEST_PLAN ||--o{ TEST_PLAN_REQUIREMENT : covers
  TEST_PLAN ||--o{ TEST_RESULT : executes

  PRODUCT {
    uuid id PK
    string product_code UK
    enum state
  }
  PROJECT {
    uuid id PK
    string project_code UK
    enum state
    int version_no
  }
  PROJECT_PRODUCT {
    uuid project_id FK
    uuid product_id FK
    string relation_type
  }
  PROJECT_RND_PROGRAM {
    uuid project_id FK
    uuid rnd_program_id FK
    string relation_type
  }
  PROJECT_MEMBER {
    uuid id PK
    uuid project_id FK
    uuid user_id FK
    string project_role_id
    enum state
  }
  RESEARCH_PROJECT_APPLICATION {
    uuid id PK
    uuid project_id FK
    int version_no
    uuid sealed_document_version_id FK
    enum state
  }
  RESEARCH_PROJECT_DESIGNATION {
    uuid id PK
    uuid application_id FK
    uuid approval_instance_id FK
    date valid_from
    date valid_until
    enum state
  }
  WBS_NODE {
    uuid id PK
    uuid project_id FK
    uuid parent_id FK
    enum node_kind
    enum state
    int sort_order
    int progress_percent
  }
  REQUIREMENT {
    uuid id PK
    uuid project_id FK
    string requirement_code UK
    enum criticality
    enum state
  }
  REQUIREMENT_REVISION {
    uuid id PK
    uuid requirement_id FK
    int revision_no
    decimal target_value
    decimal tolerance
    string unit
    string acceptance_rule
  }
  TEST_PLAN {
    uuid id PK
    string test_plan_no UK
    enum state
  }
  TEST_PLAN_REQUIREMENT {
    uuid test_plan_id FK
    uuid requirement_revision_id FK
  }
  TEST_RESULT {
    uuid id PK
    uuid test_plan_id FK
    int attempt_no
    enum verdict
    string evidence_manifest_hash
  }
```

## 5. Vendor Contract, Deliverable, Inspection, Quality, Change, and Warranty

```mermaid
erDiagram
  VENDOR ||--o{ VENDOR_CONTRACT : signs
  VENDOR_CONTRACT ||--o{ CONTRACT_PROJECT : covers
  PROJECT ||--o{ CONTRACT_PROJECT : linked
  VENDOR_CONTRACT ||--o{ CONTRACT_MILESTONE : plans
  CONTRACT_MILESTONE ||--o{ DELIVERABLE : requires
  VENDOR_CONTRACT ||--o{ PAYMENT_SCHEDULE : schedules
  PAYMENT_SCHEDULE ||--o{ PAYMENT_RECORD : confirms
  VENDOR_CONTRACT ||--o{ GUARANTEE : secures
  DELIVERABLE ||--o{ DELIVERABLE_VERSION : submitted_as
  DELIVERABLE ||--o{ INSPECTION : inspected
  INSPECTION ||--o{ INSPECTION_CHECKLIST_VERSION : freezes
  INSPECTION_CHECKLIST_VERSION ||--o{ INSPECTION_CRITERION : contains
  INSPECTION ||--o{ INSPECTION_ATTEMPT : attempts
  INSPECTION_ATTEMPT ||--o{ INSPECTION_CRITERION_RESULT : results
  INSPECTION_CRITERION ||--o{ INSPECTION_CRITERION_RESULT : scored_as
  INSPECTION_ATTEMPT ||--o| ACCEPTANCE_PAYMENT_DECISION : determines
  ACCEPTANCE_PAYMENT_DECISION ||--o{ PAYMENT_RATE_ADJUSTMENT : adjusted_by
  REQUIREMENT_REVISION ||--o{ INSPECTION_CRITERION_RESULT : criterion
  INSPECTION_ATTEMPT ||--o{ NON_CONFORMANCE : discovers
  NON_CONFORMANCE ||--o{ CORRECTIVE_ACTION : corrected_by
  NON_CONFORMANCE ||--o{ CHANGE_REQUEST : may_trigger
  VENDOR_CONTRACT ||--o{ CHANGE_REQUEST : changes
  CHANGE_REQUEST ||--o| CHANGE_ORDER : produces
  CHANGE_ORDER ||--o{ CHANGE_TARGET : applies
  VENDOR_CONTRACT ||--o{ WARRANTY_ISSUE : warrants
  WARRANTY_ISSUE ||--o{ INSPECTION : verifies
  WARRANTY_ISSUE }o--o| GUARANTEE : may_claim

  VENDOR_CONTRACT {
    uuid id PK
    uuid vendor_id FK
    string contract_no UK
    enum state
    uuid signed_document_version_id FK
    decimal contract_amount
    string currency
  }
  CONTRACT_PROJECT {
    uuid contract_id FK
    uuid project_id FK
  }
  CONTRACT_MILESTONE {
    uuid id PK
    uuid contract_id FK
    int sequence_no
    date due_date
    decimal planned_amount
    decimal planned_ratio
    enum state
  }
  PAYMENT_SCHEDULE {
    uuid id PK
    uuid contract_id FK
    uuid milestone_id FK
    decimal amount
    enum state
  }
  PAYMENT_RECORD {
    uuid id PK
    uuid schedule_id FK
    date external_payment_date
    decimal amount
    enum confirmation_state
  }
  DELIVERABLE {
    uuid id PK
    uuid milestone_id FK
    string deliverable_code
    enum state
  }
  DELIVERABLE_VERSION {
    uuid id PK
    uuid deliverable_id FK
    int version_no
    string manifest_hash
  }
  INSPECTION {
    uuid id PK
    uuid deliverable_id FK
    enum inspection_type
    enum state
  }
  INSPECTION_ATTEMPT {
    uuid id PK
    uuid inspection_id FK
    int attempt_no
    uuid deliverable_version_id FK
    enum disposition
    decimal achievement_percent
  }
  INSPECTION_CHECKLIST_VERSION {
    uuid id PK
    uuid inspection_id FK
    int version_no
    decimal total_weight_percent
    string policy_version
  }
  INSPECTION_CRITERION {
    uuid id PK
    uuid checklist_version_id FK
    string criterion_code
    decimal weight_percent
    bool critical
    string pass_rule
  }
  INSPECTION_CRITERION_RESULT {
    uuid id PK
    uuid attempt_id FK
    uuid requirement_revision_id FK
    string observed_value
    enum verdict
    decimal achieved_percent
  }
  ACCEPTANCE_PAYMENT_DECISION {
    uuid id PK
    uuid inspection_attempt_id FK
    uuid milestone_id FK
    decimal calculated_rate_percent
    decimal final_rate_percent
    enum state
  }
  PAYMENT_RATE_ADJUSTMENT {
    uuid id PK
    uuid payment_decision_id FK
    uuid approval_instance_id FK
    decimal adjusted_rate_percent
    string reason
  }
  NON_CONFORMANCE {
    uuid id PK
    uuid inspection_attempt_id FK
    string ncr_no UK
    enum severity
    enum state
  }
  CORRECTIVE_ACTION {
    uuid id PK
    uuid ncr_id FK
    string car_no UK
    enum state
    date due_date
  }
  CHANGE_REQUEST {
    uuid id PK
    uuid contract_id FK
    uuid ncr_id FK
    string ecr_no UK
    enum state
  }
  CHANGE_ORDER {
    uuid id PK
    uuid change_request_id FK
    string eco_no UK
    enum state
  }
  CHANGE_TARGET {
    uuid id PK
    uuid change_order_id FK
    enum target_kind
    string before_revision
    string after_revision
  }
  GUARANTEE {
    uuid id PK
    uuid contract_id FK
    enum guarantee_type
    decimal amount
    date valid_until
    enum state
  }
  WARRANTY_ISSUE {
    uuid id PK
    uuid contract_id FK
    string issue_no UK
    enum severity
    enum state
  }
```

`CHANGE_TARGET` is a controlled change index, not permission to store all changed entities in JSON. Physical design should add typed target join tables where FK enforcement is required.

## 6. Purchase, Supplier, Item, BOM, Receipt, and Inspection

```mermaid
erDiagram
  SUPPLIER ||--o{ SUPPLIER_ITEM : supplies
  ITEM ||--o{ SUPPLIER_ITEM : sourced
  PRODUCT ||--o{ BOM : owns
  PROJECT ||--o{ BOM : uses
  BOM ||--o{ BOM_VERSION : versions
  BOM_VERSION ||--o{ BOM_LINE : contains
  ITEM ||--o{ BOM_LINE : component
  PURCHASE_REQUEST ||--o{ PURCHASE_REQUEST_LINE : contains
  ITEM ||--o{ PURCHASE_REQUEST_LINE : requests
  SUPPLIER ||--o{ QUOTATION : quotes
  PURCHASE_REQUEST ||--o{ QUOTATION : compares
  PURCHASE_REQUEST ||--o| APPROVAL_INSTANCE : approved_by
  PURCHASE_REQUEST ||--o{ PURCHASE_RESOLUTION : resolves
  PURCHASE_RESOLUTION ||--o{ RECEIPT : receives
  RECEIPT ||--o{ RECEIPT_LINE : contains
  PURCHASE_REQUEST_LINE ||--o{ RECEIPT_LINE : fulfills
  RECEIPT ||--o{ PURCHASE_INSPECTION : inspected
  PURCHASE_INSPECTION ||--|| INSPECTION : uses_engine

  SUPPLIER {
    uuid id PK
    string supplier_code UK
    enum state
  }
  ITEM {
    uuid id PK
    string item_code UK
    string specification
    string manufacturer
    enum state
  }
  SUPPLIER_ITEM {
    uuid supplier_id FK
    uuid item_id FK
    decimal latest_observed_price
    string currency
  }
  BOM {
    uuid id PK
    uuid product_id FK
    uuid project_id FK
    string bom_code UK
  }
  BOM_VERSION {
    uuid id PK
    uuid bom_id FK
    int version_no
    enum state
  }
  BOM_LINE {
    uuid id PK
    uuid bom_version_id FK
    uuid item_id FK
    decimal quantity
  }
  PURCHASE_REQUEST {
    uuid id PK
    string request_no UK
    enum state
    uuid approved_version_id
  }
  PURCHASE_REQUEST_LINE {
    uuid id PK
    uuid request_id FK
    uuid item_id FK
    decimal quantity
    decimal expected_amount
  }
  QUOTATION {
    uuid id PK
    uuid request_id FK
    uuid supplier_id FK
    decimal total_amount
    uuid attachment_id FK
  }
  PURCHASE_RESOLUTION {
    uuid id PK
    uuid request_id FK
    int generation
    enum state
  }
  RECEIPT {
    uuid id PK
    uuid resolution_id FK
    date received_on
    enum state
  }
  RECEIPT_LINE {
    uuid id PK
    uuid receipt_id FK
    uuid request_line_id FK
    decimal received_quantity
  }
  PURCHASE_INSPECTION {
    uuid id PK
    uuid receipt_id FK
    uuid inspection_id FK
  }
```

## 7. R&D, Evidence, and Research Note

```mermaid
erDiagram
  RND_PROGRAM ||--o{ BUDGET : budgets
  BUDGET ||--o{ BUDGET_LINE : allocates
  RND_PROGRAM ||--o{ EXPENDITURE : spends
  BUDGET_LINE ||--o{ EXPENDITURE : categorized
  SUPPLIER ||--o{ EXPENDITURE : counterparty
  EXPENDITURE ||--o{ EXPENDITURE_EVIDENCE : evidenced
  EVIDENCE ||--o{ EXPENDITURE_EVIDENCE : supports
  ATTACHMENT ||--o{ EVIDENCE : stored_as
  RND_PROGRAM ||--o{ REPORT_DEADLINE : schedules
  RND_PROGRAM ||--o{ RESEARCH_NOTE_RND : links
  RESEARCH_NOTE ||--o{ RESEARCH_NOTE_RND : links
  PROJECT ||--o{ RESEARCH_NOTE_PROJECT : links
  RESEARCH_NOTE ||--o{ RESEARCH_NOTE_PROJECT : links
  RESEARCH_NOTE ||--o{ RESEARCH_NOTE_ENTRY : records
  RESEARCH_NOTE ||--o{ RESEARCH_NOTE_REVIEW : reviewed
  USER_ACCOUNT ||--o{ RESEARCH_NOTE_REVIEW : performs

  RND_PROGRAM {
    uuid id PK
    string program_code UK
    decimal total_budget
    string currency
    enum state
  }
  BUDGET {
    uuid id PK
    uuid rnd_program_id FK
    int version_no
    enum state
  }
  BUDGET_LINE {
    uuid id PK
    uuid budget_id FK
    string category_code
    decimal allocated_amount
  }
  EXPENDITURE {
    uuid id PK
    uuid rnd_program_id FK
    uuid budget_line_id FK
    uuid supplier_id FK
    date spent_on
    decimal amount
    string currency
  }
  EVIDENCE {
    uuid id PK
    uuid attachment_id FK
    string evidence_type_id
    string integrity_hash
  }
  EXPENDITURE_EVIDENCE {
    uuid expenditure_id FK
    uuid evidence_id FK
  }
  REPORT_DEADLINE {
    uuid id PK
    uuid rnd_program_id FK
    enum deadline_type
    date due_date
    enum state
  }
  RESEARCH_NOTE {
    uuid id PK
    string note_no UK
    uuid author_id FK
    date research_date
    enum state
  }
  RESEARCH_NOTE_ENTRY {
    uuid id PK
    uuid research_note_id FK
    int sequence_no
    enum entry_type
    uuid corrects_entry_id FK
    json editor_content
    string checksum
  }
  RESEARCH_NOTE_REVIEW {
    uuid id PK
    uuid research_note_id FK
    uuid reviewer_id FK
    enum outcome
    datetime reviewed_at
  }
```

Expenditure may use typed join tables such as `EXPENDITURE_PROJECT`, `EXPENDITURE_CONTRACT`, and `EXPENDITURE_PURCHASE`; it must not use an unchecked generic foreign ID.

## 8. Safety and Research Allowance Evidence

```mermaid
erDiagram
  USER_ACCOUNT ||--o{ SAFETY_MANAGER_ASSIGNMENT : designated
  USER_ACCOUNT ||--o{ SAFETY_INSPECTION : performs
  SAFETY_INSPECTION ||--o{ SAFETY_INSPECTION_ITEM : checks
  SAFETY_INSPECTION ||--o{ SAFETY_FINDING : finds
  USER_ACCOUNT ||--o{ SAFETY_FINDING : owns_correction
  SAFETY_TRAINING ||--o{ SAFETY_TRAINING_ATTENDANCE : attends
  USER_ACCOUNT ||--o{ SAFETY_TRAINING_ATTENDANCE : participant
  HAZARDOUS_MATERIAL ||--o{ MSDS_VERSION : documented
  HAZARDOUS_MATERIAL ||--o{ WASTE_LOG : disposed
  EMERGENCY_PLAN ||--o{ EMERGENCY_DRILL : exercised
  SAFETY_INCIDENT ||--|| INCIDENT_INVESTIGATION : investigated
  SAFETY_INCIDENT ||--o{ SAFETY_ACTION : corrected
  USER_ACCOUNT ||--o{ RESEARCH_ELIGIBILITY_SNAPSHOT : eligible
  PROJECT ||--o{ PROJECT_ALLOWANCE_POLICY : configures
  PROJECT_ALLOWANCE_POLICY ||--o{ PROJECT_ALLOWANCE_POLICY_VERSION : versions
  RESEARCH_PROJECT_DESIGNATION ||--o{ PROJECT_ALLOWANCE_POLICY_VERSION : enables
  USER_ACCOUNT ||--o{ RESEARCH_PERFORMANCE_EVALUATION : evaluated
  PROJECT ||--o{ RESEARCH_PERFORMANCE_EVALUATION : evidence_for
  PROJECT_ALLOWANCE_POLICY_VERSION ||--o{ RESEARCH_PERFORMANCE_EVALUATION : governs
  RESEARCH_PERFORMANCE_EVALUATION ||--o| ALLOWANCE_CALCULATION : calculates
  ALLOWANCE_CALCULATION ||--o| ALLOWANCE_TAX_ASSESSMENT : assessed
  ALLOWANCE_CALCULATION ||--o{ ALLOWANCE_DECISION_REFERENCE : exported

  SAFETY_MANAGER_ASSIGNMENT {
    uuid id PK
    uuid user_id FK
    enum assignment_type
    date valid_from
    date valid_until
  }
  SAFETY_INSPECTION {
    uuid id PK
    uuid inspector_user_id FK
    enum inspection_type
    date scheduled_on
    enum state
  }
  SAFETY_INSPECTION_ITEM {
    uuid id PK
    uuid inspection_id FK
    string criterion_code
    enum verdict
  }
  SAFETY_FINDING {
    uuid id PK
    uuid inspection_id FK
    uuid correction_owner_id FK
    enum severity
    bool stop_work
    date due_date
    enum state
  }
  SAFETY_TRAINING {
    uuid id PK
    enum training_type
    date held_on
    enum state
  }
  SAFETY_TRAINING_ATTENDANCE {
    uuid training_id FK
    uuid user_id FK
    enum completion_state
  }
  HAZARDOUS_MATERIAL {
    uuid id PK
    string material_code UK
    string hazard_class
    enum state
  }
  MSDS_VERSION {
    uuid id PK
    uuid material_id FK
    int version_no
    uuid attachment_id FK
    date effective_on
  }
  WASTE_LOG {
    uuid id PK
    uuid material_id FK
    decimal quantity
    date disposed_on
    uuid evidence_attachment_id FK
  }
  EMERGENCY_PLAN {
    uuid id PK
    int version_no
    date effective_on
  }
  EMERGENCY_DRILL {
    uuid id PK
    uuid emergency_plan_id FK
    date held_on
    enum outcome
  }
  SAFETY_INCIDENT {
    uuid id PK
    string incident_no UK
    datetime occurred_at
    enum severity
    enum state
  }
  INCIDENT_INVESTIGATION {
    uuid id PK
    uuid incident_id FK
    datetime due_at
    datetime completed_at
    string root_cause
  }
  SAFETY_ACTION {
    uuid id PK
    uuid incident_id FK
    uuid owner_user_id FK
    date due_date
    enum state
  }
  RESEARCH_ELIGIBILITY_SNAPSHOT {
    uuid id PK
    uuid user_id FK
    enum eligibility_type
    date valid_from
    date valid_until
    uuid evidence_attachment_id FK
  }
  PROJECT_ALLOWANCE_POLICY {
    uuid id PK
    uuid project_id FK
    enum state
  }
  PROJECT_ALLOWANCE_POLICY_VERSION {
    uuid id PK
    uuid policy_id FK
    uuid designation_id FK
    int version_no
    enum cadence
    decimal budget_amount
    date effective_from
    date effective_until
    string tax_rule_version
    enum state
  }
  RESEARCH_PERFORMANCE_EVALUATION {
    uuid id PK
    uuid subject_user_id FK
    uuid project_id FK
    uuid evaluator_user_id FK
    uuid allowance_policy_version_id FK
    enum grade
    enum state
    string policy_version
  }
  ALLOWANCE_CALCULATION {
    uuid id PK
    uuid evaluation_id FK
    decimal gross_amount
    string currency
    string calculation_hash
    enum state
  }
  ALLOWANCE_TAX_ASSESSMENT {
    uuid id PK
    uuid calculation_id FK
    string person_month
    decimal cross_project_eligible_total
    decimal non_taxable_amount
    decimal taxable_amount
    enum wage_classification
    string law_version
  }
  ALLOWANCE_DECISION_REFERENCE {
    uuid id PK
    uuid calculation_id FK
    uuid representative_user_id FK
    string external_payroll_reference
    enum state
  }
```

These allowance records support project-policy calculation and evidence-backed tax classification. They export a payroll reference but do not perform payroll or transfer funds.

## 9. Audit, Notification, and Offline Sync

```mermaid
erDiagram
  USER_ACCOUNT ||--o{ AUDIT_LOG : acts
  USER_ACCOUNT ||--o{ NOTIFICATION : receives
  USER_ACCOUNT ||--o{ OFFLINE_COMMAND : creates
  OFFLINE_COMMAND ||--o| SYNC_CONFLICT : may_conflict
  USER_ACCOUNT ||--o{ SYNC_CONFLICT : resolves
  AUDIT_LOG ||--o{ STATE_TRANSITION_HISTORY : correlates
  AUDIT_LOG ||--o{ OUTBOX_MESSAGE : initiates

  AUDIT_LOG {
    uuid id PK
    uuid actor_user_id FK
    uuid effective_actor_user_id FK
    string action_id
    string resource_type
    uuid resource_id
    int resource_version
    enum result
    string correlation_id
    uuid causation_id
    datetime occurred_at
  }
  STATE_TRANSITION_HISTORY {
    uuid id PK
    uuid audit_log_id FK
    string aggregate_type
    uuid aggregate_id
    string machine_id
    string event_id
    string from_state
    string to_state
    int version_before
    int version_after
    uuid command_id
    string correlation_id
  }
  OUTBOX_MESSAGE {
    uuid id PK
    uuid initiating_audit_log_id FK
    string event_id
    string aggregate_type
    uuid aggregate_id
    int aggregate_version
    string idempotency_key UK
    string payload_schema_id
    int payload_schema_version
    enum delivery_state
    int attempt_count
    datetime available_at
  }
  NOTIFICATION {
    uuid id PK
    uuid recipient_user_id FK
    string event_id
    enum channel
    enum delivery_state
  }
  OFFLINE_COMMAND {
    uuid id PK
    uuid actor_user_id FK
    string command_type
    uuid aggregate_id
    int base_version
    string payload_schema_version
    enum state
  }
  SYNC_CONFLICT {
    uuid id PK
    uuid offline_command_id FK
    uuid resolved_by_user_id FK
    int server_version
    enum resolution
    datetime resolved_at
  }
```

M02 physical tables keep actor/effective-actor UUID snapshots without a `USER_ACCOUNT` FK until M03 and never use cascading evidence deletion. Audit and transition rows are insert-only. Outbox identity, event body, schema, correlation, and idempotency fields are immutable after insert; protected worker operations may change only lease/retry/delivery fields. Business state/action/event definitions are registered by their owning feature migration, not pre-populated by M02.

## 10. Required Physical Constraints

To be defined in migrations after approval:

- unique `(document_id, version_no)`, `(template_id, version_no)`, `(inspection_id, attempt_no)`, `(approval_instance_id, sequence_no)`;
- no update/delete on approved/finalized version rows except controlled retention path;
- check constraints for valid dates, nonnegative quantities/amounts, ratio bounds where a ratio is used;
- foreign keys for all typed joins;
- partial unique constraints for active memberships/scopes as needed;
- RLS on exposed tables and Storage metadata;
- append-only protection for ApprovalAction, AuditLog, StateTransitionHistory, finalized ResearchNoteEntry, and accepted InspectionAttempt;
- immutable Outbox envelope fields with separately controlled lease/retry/delivery updates;
- unique state transition result `(aggregate_type, aggregate_id, version_after)` and outbox idempotency key;
- registered stable-code FKs/checks for machine, event, from/to state, action, result, and delivery state;
- indexes supporting exact vendor/project/contract scope checks and expiry scans;
- exclusion or validation rules preventing overlapping contradictory grants;
- idempotency uniqueness for background expiry, notification, and offline commands.

## 11. Explicit Anti-Patterns

- `business_object(data jsonb, status text)` for all modules.
- `approval_history jsonb` embedded in Document.
- WBS stored only as nested JSON.
- Contract terms, payment milestones, inspections, NCR/CAR, or ECR/ECO stored only in editor content.
- Generic attachment or document links without FK-backed subject tables where integrity matters.
- Vendor security implemented by `vendor_id` query parameters or UI filtering.
- Mutable approved document content.
