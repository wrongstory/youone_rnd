-- M08 Quality, Inspection, Acceptance and Payment-decision evidence boundary.
-- Internal policy thresholds are versioned data. This migration contains no statutory acceptance/payment bands.

insert into public.permission(id,stable_code,status) values
  ('38000000-0000-4000-8000-000000000001','quality.requirement.manage','ACTIVE'),
  ('38000000-0000-4000-8000-000000000002','quality.test.manage','ACTIVE'),
  ('38000000-0000-4000-8000-000000000003','inspection.record.request','ACTIVE'),
  ('38000000-0000-4000-8000-000000000004','inspection.record.inspect','ACTIVE'),
  ('38000000-0000-4000-8000-000000000005','inspection.record.decide','ACTIVE'),
  ('38000000-0000-4000-8000-000000000006','inspection.external.read','ACTIVE'),
  ('38000000-0000-4000-8000-000000000007','acceptance_payment.record.manage','ACTIVE'),
  ('38000000-0000-4000-8000-000000000008','acceptance_payment.finance.read','ACTIVE'),
  ('38000000-0000-4000-8000-000000000009','acceptance_payment.record.release','ACTIVE'),
  ('38000000-0000-4000-8000-000000000010','quality.policy.manage','ACTIVE')
on conflict(stable_code) do nothing;

insert into public.aggregate_type_definition(aggregate_type) values
  ('REQUIREMENT'),('TEST_PLAN'),('TEST_RESULT'),('INSPECTION'),('INSPECTION_ATTEMPT'),
  ('ACCEPTANCE_PAYMENT_DECISION'),('ACCEPTANCE_PAYMENT_POLICY_VERSION')
on conflict do nothing;

insert into public.action_definition(action_id) values
  ('quality.requirement.manage'),('quality.test.manage'),('inspection.record.request'),('inspection.record.inspect'),
  ('inspection.record.decide'),('inspection.external.read'),('acceptance_payment.record.manage'),
  ('acceptance_payment.finance.read'),('acceptance_payment.record.release'),('acceptance_payment.approval.apply'),('quality.policy.manage'),
  ('approval.policy.publish')
on conflict do nothing;

insert into public.domain_event_definition(event_id,payload_schema_id,payload_schema_version) values
  ('EVT-INSPECTION-REQUEST','INSPECTION_EVENT_REF',1),('EVT-INSPECTION-SCHEDULE','INSPECTION_EVENT_REF',1),
  ('EVT-INSPECTION-START','INSPECTION_EVENT_REF',1),('EVT-INSPECTION-SUBMIT-DECISION','INSPECTION_EVENT_REF',1),
  ('EVT-INSPECTION-ACCEPT','INSPECTION_EVENT_REF',1),('EVT-INSPECTION-REQUEST-CORRECTION','INSPECTION_EVENT_REF',1),
  ('EVT-INSPECTION-REJECT','INSPECTION_EVENT_REF',1),('EVT-INSPECTION-CORRECTION-SUBMITTED','INSPECTION_EVENT_REF',1),
  ('EVT-INSPECTION-REINSPECT','INSPECTION_EVENT_REF',1),('EVT-INSPECTION-CANCEL','INSPECTION_EVENT_REF',1),
  ('EVT-ACCEPTANCE-PAYMENT-CALCULATE','ACCEPTANCE_PAYMENT_EVENT_REF',1),
  ('EVT-ACCEPTANCE-PAYMENT-ADJUST','ACCEPTANCE_PAYMENT_EVENT_REF',1),
  ('EVT-ACCEPTANCE-PAYMENT-SUBMIT','ACCEPTANCE_PAYMENT_EVENT_REF',1),
  ('EVT-ACCEPTANCE-PAYMENT-APPROVE','ACCEPTANCE_PAYMENT_EVENT_REF',1),
  ('EVT-ACCEPTANCE-PAYMENT-HOLD','ACCEPTANCE_PAYMENT_EVENT_REF',1),
  ('EVT-ACCEPTANCE-PAYMENT-CONDITION-SATISFY','ACCEPTANCE_PAYMENT_EVENT_REF',1),
  ('EVT-ACCEPTANCE-PAYMENT-ELIGIBLE','ACCEPTANCE_PAYMENT_EVENT_REF',1),
  ('EVT-ACCEPTANCE-PAYMENT-CANCEL','ACCEPTANCE_PAYMENT_EVENT_REF',1)
on conflict do nothing;

insert into public.state_machine_definition(machine_id,aggregate_type) values
  ('SM-INSPECTION-V1','INSPECTION'),('SM-ACCEPTANCE-PAYMENT-V1','ACCEPTANCE_PAYMENT_DECISION')
on conflict do nothing;

insert into public.state_definition(machine_id,state_id,is_terminal) values
  ('SM-INSPECTION-V1','REQUESTED',false),('SM-INSPECTION-V1','SCHEDULED',false),
  ('SM-INSPECTION-V1','IN_PROGRESS',false),('SM-INSPECTION-V1','DECISION_PENDING',false),
  ('SM-INSPECTION-V1','CORRECTION_REQUIRED',false),('SM-INSPECTION-V1','REINSPECTION_PENDING',false),
  ('SM-INSPECTION-V1','COMPLETED',true),('SM-INSPECTION-V1','CANCELLED',true),
  ('SM-ACCEPTANCE-PAYMENT-V1','CALCULATED',false),('SM-ACCEPTANCE-PAYMENT-V1','ADJUSTMENT_PROPOSED',false),
  ('SM-ACCEPTANCE-PAYMENT-V1','APPROVAL_PENDING',false),('SM-ACCEPTANCE-PAYMENT-V1','APPROVED',false),
  ('SM-ACCEPTANCE-PAYMENT-V1','HELD_FOR_CONDITIONS',false),('SM-ACCEPTANCE-PAYMENT-V1','ELIGIBLE_FOR_EXTERNAL_PAYMENT',true),
  ('SM-ACCEPTANCE-PAYMENT-V1','CANCELLED',true)
on conflict do nothing;

insert into public.transition_definition(machine_id,event_id,from_state,to_state) values
  ('SM-INSPECTION-V1','EVT-INSPECTION-REQUEST',null,'REQUESTED'),
  ('SM-INSPECTION-V1','EVT-INSPECTION-SCHEDULE','REQUESTED','SCHEDULED'),
  ('SM-INSPECTION-V1','EVT-INSPECTION-START','SCHEDULED','IN_PROGRESS'),
  ('SM-INSPECTION-V1','EVT-INSPECTION-SUBMIT-DECISION','IN_PROGRESS','DECISION_PENDING'),
  ('SM-INSPECTION-V1','EVT-INSPECTION-ACCEPT','DECISION_PENDING','COMPLETED'),
  ('SM-INSPECTION-V1','EVT-INSPECTION-REQUEST-CORRECTION','DECISION_PENDING','CORRECTION_REQUIRED'),
  ('SM-INSPECTION-V1','EVT-INSPECTION-REJECT','DECISION_PENDING','COMPLETED'),
  ('SM-INSPECTION-V1','EVT-INSPECTION-CORRECTION-SUBMITTED','CORRECTION_REQUIRED','REINSPECTION_PENDING'),
  ('SM-INSPECTION-V1','EVT-INSPECTION-REINSPECT','REINSPECTION_PENDING','IN_PROGRESS'),
  ('SM-INSPECTION-V1','EVT-INSPECTION-CANCEL','REQUESTED','CANCELLED'),
  ('SM-INSPECTION-V1','EVT-INSPECTION-CANCEL','SCHEDULED','CANCELLED'),
  ('SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-CALCULATE',null,'CALCULATED'),
  ('SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-ADJUST','CALCULATED','ADJUSTMENT_PROPOSED'),
  ('SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-SUBMIT','CALCULATED','APPROVAL_PENDING'),
  ('SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-SUBMIT','ADJUSTMENT_PROPOSED','APPROVAL_PENDING'),
  ('SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-APPROVE','APPROVAL_PENDING','APPROVED'),
  ('SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-CANCEL','APPROVAL_PENDING','CANCELLED'),
  ('SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-HOLD','APPROVED','HELD_FOR_CONDITIONS'),
  ('SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-CONDITION-SATISFY','HELD_FOR_CONDITIONS','HELD_FOR_CONDITIONS'),
  ('SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-ELIGIBLE','APPROVED','ELIGIBLE_FOR_EXTERNAL_PAYMENT'),
  ('SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-ELIGIBLE','HELD_FOR_CONDITIONS','ELIGIBLE_FOR_EXTERNAL_PAYMENT')
on conflict do nothing;

create table public.requirement (
  id uuid primary key,
  project_id uuid not null references public.project(id),
  requirement_code text not null check(length(requirement_code) between 1 and 100),
  title text not null check(length(title) between 1 and 500),
  state text not null check(state in ('ACTIVE','RETIRED')),
  current_revision_id uuid not null,
  current_revision_no bigint not null check(current_revision_no>0),
  version_no bigint not null check(version_no>0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(project_id,requirement_code),
  unique(id,current_revision_id,current_revision_no),
  unique(id,project_id)
);

create table public.requirement_revision (
  id uuid primary key,
  requirement_id uuid not null references public.requirement(id) deferrable initially deferred,
  revision_no bigint not null check(revision_no>0),
  previous_revision_id uuid unique,
  criticality text not null check(criticality in ('NORMAL','IMPORTANT','CRITICAL')),
  target_value text not null check(length(target_value) between 1 and 2000),
  tolerance text,
  unit text,
  acceptance_rule text not null check(length(acceptance_rule) between 1 and 5000),
  change_reason text not null check(length(change_reason) between 1 and 2000),
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null,
  unique(requirement_id,revision_no),
  unique(id,requirement_id,revision_no),
  unique(id,requirement_id)
);
alter table public.requirement_revision add constraint requirement_revision_previous_fk
  foreign key(previous_revision_id,requirement_id)
  references public.requirement_revision(id,requirement_id) deferrable initially deferred;
alter table public.requirement add constraint requirement_current_revision_fk
  foreign key(current_revision_id,id,current_revision_no)
  references public.requirement_revision(id,requirement_id,revision_no) deferrable initially deferred;

create table public.test_plan (
  id uuid primary key,
  project_id uuid not null references public.project(id),
  test_plan_no text not null check(length(test_plan_no) between 1 and 100),
  state text not null check(state in ('ACTIVE','RETIRED')),
  current_version_id uuid not null,
  current_version_no bigint not null check(current_version_no>0),
  row_version bigint not null check(row_version>0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(project_id,test_plan_no),
  unique(id,current_version_id,current_version_no),
  unique(id,project_id)
);

create table public.test_plan_version (
  id uuid primary key,
  test_plan_id uuid not null references public.test_plan(id) deferrable initially deferred,
  version_no bigint not null check(version_no>0),
  previous_version_id uuid unique,
  conditions text not null check(length(conditions) between 1 and 10000),
  method text not null check(length(method) between 1 and 10000),
  repetitions integer not null check(repetitions>0),
  state text not null check(state in ('DRAFT','SEALED')),
  manifest_checksum text check(manifest_checksum is null or app_private.is_sha256(manifest_checksum)),
  sealed_at timestamptz,
  sealed_by_user_id uuid references public.user_account(id),
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null,
  unique(test_plan_id,version_no),
  unique(id,test_plan_id,version_no),
  unique(id,test_plan_id),
  check((state='DRAFT' and manifest_checksum is null and sealed_at is null and sealed_by_user_id is null)
    or (state='SEALED' and manifest_checksum is not null and sealed_at is not null and sealed_by_user_id is not null))
);
alter table public.test_plan_version add constraint test_plan_version_previous_fk
  foreign key(previous_version_id,test_plan_id) references public.test_plan_version(id,test_plan_id) deferrable initially deferred;
alter table public.test_plan add constraint test_plan_current_version_fk
  foreign key(current_version_id,id,current_version_no) references public.test_plan_version(id,test_plan_id,version_no) deferrable initially deferred;

create table public.test_plan_equipment (
  test_plan_version_id uuid not null references public.test_plan_version(id),
  sequence_no integer not null check(sequence_no>0),
  equipment_name text not null check(length(equipment_name) between 1 and 500),
  primary key(test_plan_version_id,sequence_no)
);
create table public.test_plan_evidence_requirement (
  test_plan_version_id uuid not null references public.test_plan_version(id),
  evidence_type_code text not null check(app_private.is_stable_code(evidence_type_code)),
  primary key(test_plan_version_id,evidence_type_code)
);
create table public.test_plan_requirement_coverage (
  test_plan_version_id uuid not null references public.test_plan_version(id),
  requirement_id uuid not null,
  requirement_revision_id uuid not null,
  coverage_kind text not null check(coverage_kind in ('FULL','PARTIAL')),
  primary key(test_plan_version_id,requirement_revision_id),
  foreign key(requirement_revision_id,requirement_id) references public.requirement_revision(id,requirement_id)
);

create table public.test_result (
  id uuid primary key,
  test_plan_id uuid not null,
  test_plan_version_id uuid not null,
  test_plan_version_no bigint not null check(test_plan_version_no>0),
  execution_no integer not null check(execution_no>0),
  tested_deliverable_version_id uuid references public.deliverable_version(id),
  state text not null check(state in ('DRAFT','SEALED')),
  verdict text check(verdict in ('PASS','FAIL','INCONCLUSIVE','UNABLE_TO_VERIFY')),
  evidence_manifest_checksum text check(evidence_manifest_checksum is null or app_private.is_sha256(evidence_manifest_checksum)),
  executed_by_user_id uuid not null references public.user_account(id),
  executed_at timestamptz not null,
  sealed_at timestamptz,
  unique(test_plan_id,execution_no),
  unique(id,test_plan_version_id),
  foreign key(test_plan_version_id,test_plan_id,test_plan_version_no) references public.test_plan_version(id,test_plan_id,version_no),
  check((state='DRAFT' and verdict is null and evidence_manifest_checksum is null and sealed_at is null)
    or (state='SEALED' and verdict is not null and evidence_manifest_checksum is not null and sealed_at is not null))
);
create table public.test_measurement (
  id uuid primary key,
  test_result_id uuid not null references public.test_result(id),
  test_plan_version_id uuid not null,
  requirement_id uuid not null,
  requirement_revision_id uuid not null,
  sequence_no integer not null check(sequence_no>0),
  observed_value text not null check(length(observed_value) between 1 and 5000),
  unit text,
  verdict text not null check(verdict in ('PASS','FAIL','INCONCLUSIVE','UNABLE_TO_VERIFY')),
  unique(test_result_id,sequence_no),
  unique(test_result_id,requirement_revision_id),
  foreign key(test_result_id,test_plan_version_id) references public.test_result(id,test_plan_version_id),
  foreign key(test_plan_version_id,requirement_revision_id)
    references public.test_plan_requirement_coverage(test_plan_version_id,requirement_revision_id),
  foreign key(requirement_revision_id,requirement_id) references public.requirement_revision(id,requirement_id)
);
alter table public.attachment add constraint attachment_m08_exact_evidence_unique unique(id,row_version,detected_sha256);
create table public.test_result_evidence (
  test_result_id uuid not null references public.test_result(id),
  attachment_id uuid not null,
  attachment_row_version bigint not null check(attachment_row_version>=0),
  content_checksum text not null check(app_private.is_sha256(content_checksum)),
  evidence_type_code text not null check(app_private.is_stable_code(evidence_type_code)),
  primary key(test_result_id,attachment_id,evidence_type_code),
  foreign key(attachment_id,attachment_row_version,content_checksum) references public.attachment(id,row_version,detected_sha256)
);

create table public.acceptance_score_policy (
  id uuid primary key,
  stable_code text not null unique check(app_private.is_stable_code(stable_code)),
  status text not null check(status in ('ACTIVE','DISABLED')),
  created_at timestamptz not null
);
create table public.acceptance_score_policy_version (
  id uuid primary key,
  policy_id uuid not null references public.acceptance_score_policy(id),
  version_no bigint not null check(version_no>0),
  state text not null check(state in ('DRAFT','PUBLISHED','RETIRED')),
  basis_kind text not null check(basis_kind in ('INTERNAL_PRESET','CONTRACT_OVERRIDE','GOVERNMENT_AGREEMENT','MANDATORY_LAW')),
  basis_reference_id text not null check(app_private.is_stable_code(basis_reference_id)),
  basis_version bigint not null check(basis_version>0),
  rounding_decimal_places integer not null check(rounding_decimal_places between 0 and 6),
  rounding_mode text not null check(rounding_mode in ('HALF_UP','DOWN')),
  checksum text not null check(app_private.is_sha256(checksum)),
  valid_from timestamptz not null,
  valid_until timestamptz,
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null,
  unique(policy_id,version_no),
  unique(id,policy_id,version_no,checksum),
  check(valid_until is null or valid_until>valid_from)
);
create table public.acceptance_score_policy_band (
  id uuid primary key,
  policy_version_id uuid not null references public.acceptance_score_policy_version(id),
  sequence_no integer not null check(sequence_no>0),
  minimum_achievement_inclusive numeric(9,6) not null check(minimum_achievement_inclusive between 0 and 100),
  maximum_achievement_exclusive numeric(9,6) check(maximum_achievement_exclusive>minimum_achievement_inclusive and maximum_achievement_exclusive<=100),
  disposition text not null check(disposition in ('ACCEPTED','CONDITIONAL_ACCEPTANCE','PARTIAL_ACCEPTANCE','REJECTED')),
  proposed_rate_kind text not null check(proposed_rate_kind in ('ZERO','ACHIEVEMENT_PERCENT','FIXED')),
  proposed_fixed_rate numeric(9,6) check(proposed_fixed_rate between 0 and 100),
  unique(policy_version_id,sequence_no),
  check((proposed_rate_kind='FIXED')=(proposed_fixed_rate is not null))
);

alter table public.contract_milestone add constraint contract_milestone_m08_exact_unique unique(id,contract_version_id);
alter table public.deliverable add constraint deliverable_m08_exact_unique unique(id,contract_id,contract_milestone_id,assigned_vendor_id);
alter table public.deliverable_version add constraint deliverable_version_m08_exact_unique unique(id,deliverable_id);

create table public.inspection (
  id uuid primary key,
  inspection_no text not null unique check(length(inspection_no) between 1 and 100),
  inspection_type_code text not null check(app_private.is_stable_code(inspection_type_code)),
  contract_id uuid not null,
  contract_milestone_id uuid not null,
  deliverable_id uuid not null,
  deliverable_version_id uuid not null,
  assigned_vendor_id uuid not null,
  inspection_checklist_version_id uuid not null,
  state text not null check(state in ('REQUESTED','SCHEDULED','IN_PROGRESS','DECISION_PENDING','CORRECTION_REQUIRED','REINSPECTION_PENDING','COMPLETED','CANCELLED')),
  scheduled_at timestamptz,
  open_attempt_id uuid,
  open_attempt_no integer check(open_attempt_no>0),
  latest_sealed_attempt_id uuid,
  latest_attempt_no integer not null default 0 check(latest_attempt_no>=0),
  final_disposition text check(final_disposition in ('ACCEPTED','PARTIAL_ACCEPTANCE','CONDITIONAL_ACCEPTANCE','CORRECTION_REQUESTED','REJECTED','UNABLE_TO_VERIFY')),
  version_no bigint not null check(version_no>0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(id,contract_id,contract_milestone_id,deliverable_id,deliverable_version_id),
  unique(id,contract_id,contract_milestone_id,deliverable_id,deliverable_version_id,assigned_vendor_id,inspection_checklist_version_id),
  foreign key(deliverable_id,contract_id,contract_milestone_id,assigned_vendor_id)
    references public.deliverable(id,contract_id,contract_milestone_id,assigned_vendor_id),
  foreign key(deliverable_version_id,deliverable_id) references public.deliverable_version(id,deliverable_id),
  check((open_attempt_id is null)=(open_attempt_no is null))
);

create table public.inspection_checklist_version (
  id uuid primary key,
  inspection_id uuid not null references public.inspection(id) deferrable initially deferred,
  version_no bigint not null check(version_no>0),
  previous_version_id uuid unique,
  policy_version_id uuid not null,
  policy_id uuid not null,
  policy_version_no bigint not null check(policy_version_no>0),
  policy_checksum text not null check(app_private.is_sha256(policy_checksum)),
  state text not null check(state in ('DRAFT','SEALED')),
  total_weight_percent numeric(9,6),
  checksum text check(checksum is null or app_private.is_sha256(checksum)),
  sealed_at timestamptz,
  sealed_by_user_id uuid references public.user_account(id),
  unique(inspection_id,version_no),
  unique(id,inspection_id,version_no),
  unique(id,inspection_id),
  unique(id,inspection_id,policy_version_id),
  foreign key(policy_version_id,policy_id,policy_version_no,policy_checksum)
    references public.acceptance_score_policy_version(id,policy_id,version_no,checksum),
  check((state='DRAFT' and total_weight_percent is null and checksum is null and sealed_at is null and sealed_by_user_id is null)
    or (state='SEALED' and total_weight_percent=100 and checksum is not null and sealed_at is not null and sealed_by_user_id is not null))
);
alter table public.inspection_checklist_version add constraint inspection_checklist_previous_fk
  foreign key(previous_version_id,inspection_id) references public.inspection_checklist_version(id,inspection_id) deferrable initially deferred;
alter table public.inspection add constraint inspection_exact_checklist_fk
  foreign key(inspection_checklist_version_id,id) references public.inspection_checklist_version(id,inspection_id) deferrable initially deferred;

create table public.inspection_criterion (
  id uuid primary key,
  inspection_checklist_version_id uuid not null references public.inspection_checklist_version(id),
  sequence_no integer not null check(sequence_no>0),
  criterion_code text not null check(app_private.is_stable_code(criterion_code)),
  title text not null check(length(title) between 1 and 500),
  requirement_id uuid,
  requirement_revision_id uuid,
  weight_percent numeric(9,6) not null check(weight_percent>0 and weight_percent<=100),
  critical boolean not null,
  measurement_rule text not null check(length(measurement_rule) between 1 and 5000),
  pass_rule text not null check(length(pass_rule) between 1 and 5000),
  unique(inspection_checklist_version_id,sequence_no),
  unique(inspection_checklist_version_id,criterion_code),
  unique(id,inspection_checklist_version_id),
  foreign key(requirement_revision_id,requirement_id) references public.requirement_revision(id,requirement_id),
  check((requirement_id is null)=(requirement_revision_id is null))
);
create table public.inspection_criterion_evidence_requirement (
  inspection_criterion_id uuid not null references public.inspection_criterion(id),
  evidence_type_code text not null check(app_private.is_stable_code(evidence_type_code)),
  primary key(inspection_criterion_id,evidence_type_code)
);

create table public.inspection_attempt (
  id uuid primary key,
  inspection_id uuid not null references public.inspection(id),
  attempt_no integer not null check(attempt_no>0),
  state text not null check(state in ('DRAFT','SEALED')),
  inspection_checklist_version_id uuid not null,
  policy_version_id uuid not null,
  contract_id uuid not null,
  contract_milestone_id uuid not null,
  deliverable_id uuid not null,
  deliverable_version_id uuid not null,
  assigned_vendor_id uuid not null,
  disposition text check(disposition in ('ACCEPTED','PARTIAL_ACCEPTANCE','CONDITIONAL_ACCEPTANCE','CORRECTION_REQUESTED','REJECTED','UNABLE_TO_VERIFY')),
  achievement_percent numeric(9,6) check(achievement_percent between 0 and 100),
  checksum text check(checksum is null or app_private.is_sha256(checksum)),
  inspector_user_id uuid not null references public.user_account(id),
  sealed_at timestamptz,
  created_at timestamptz not null,
  unique(inspection_id,attempt_no),
  unique(id,inspection_id,attempt_no),
  unique(id,inspection_id,attempt_no,checksum),
  unique(id,inspection_id),
  unique(id,inspection_checklist_version_id),
  unique(id,deliverable_version_id),
  unique(id,checksum),
  foreign key(inspection_id,contract_id,contract_milestone_id,deliverable_id,deliverable_version_id,assigned_vendor_id,inspection_checklist_version_id)
    references public.inspection(id,contract_id,contract_milestone_id,deliverable_id,deliverable_version_id,assigned_vendor_id,inspection_checklist_version_id),
  foreign key(inspection_checklist_version_id,inspection_id) references public.inspection_checklist_version(id,inspection_id),
  foreign key(inspection_checklist_version_id,inspection_id,policy_version_id)
    references public.inspection_checklist_version(id,inspection_id,policy_version_id),
  foreign key(deliverable_version_id,deliverable_id) references public.deliverable_version(id,deliverable_id),
  check((state='DRAFT' and disposition is null and achievement_percent is null and checksum is null and sealed_at is null)
    or (state='SEALED' and disposition is not null and achievement_percent is not null and checksum is not null and sealed_at is not null))
);
alter table public.inspection add constraint inspection_latest_attempt_fk
  foreign key(latest_sealed_attempt_id,id,latest_attempt_no) references public.inspection_attempt(id,inspection_id,attempt_no) deferrable initially deferred;

create table public.inspection_criterion_result (
  id uuid primary key,
  inspection_attempt_id uuid not null references public.inspection_attempt(id),
  inspection_checklist_version_id uuid not null,
  inspection_criterion_id uuid not null,
  requirement_id uuid,
  requirement_revision_id uuid,
  achieved_percent numeric(9,6) not null check(achieved_percent between 0 and 100),
  verdict text not null check(verdict in ('PASS','FAIL','PARTIAL','UNABLE_TO_VERIFY')),
  observed_value text not null check(length(observed_value) between 1 and 5000),
  unique(inspection_attempt_id,inspection_criterion_id),
  unique(id,inspection_attempt_id),
  foreign key(inspection_attempt_id,inspection_checklist_version_id)
    references public.inspection_attempt(id,inspection_checklist_version_id),
  foreign key(inspection_criterion_id,inspection_checklist_version_id) references public.inspection_criterion(id,inspection_checklist_version_id),
  foreign key(requirement_revision_id,requirement_id) references public.requirement_revision(id,requirement_id),
  check((requirement_id is null)=(requirement_revision_id is null))
);

create table public.inspection_evidence (
  id uuid primary key,
  inspection_id uuid not null references public.inspection(id),
  attachment_id uuid not null,
  attachment_row_version bigint not null check(attachment_row_version>=0),
  content_checksum text not null check(app_private.is_sha256(content_checksum)),
  evidence_type_code text not null check(app_private.is_stable_code(evidence_type_code)),
  created_at timestamptz not null,
  unique(id,inspection_id),
  foreign key(attachment_id,attachment_row_version,content_checksum) references public.attachment(id,row_version,detected_sha256)
);
create table public.inspection_attempt_evidence (
  inspection_attempt_id uuid not null references public.inspection_attempt(id),
  inspection_id uuid not null,
  inspection_evidence_id uuid not null,
  primary key(inspection_attempt_id,inspection_evidence_id)
  ,foreign key(inspection_attempt_id,inspection_id) references public.inspection_attempt(id,inspection_id)
  ,foreign key(inspection_evidence_id,inspection_id) references public.inspection_evidence(id,inspection_id)
);
create table public.inspection_criterion_result_evidence (
  inspection_criterion_result_id uuid not null,
  inspection_attempt_id uuid not null,
  inspection_id uuid not null,
  inspection_evidence_id uuid not null,
  primary key(inspection_criterion_result_id,inspection_evidence_id)
  ,foreign key(inspection_criterion_result_id,inspection_attempt_id) references public.inspection_criterion_result(id,inspection_attempt_id)
  ,foreign key(inspection_attempt_id,inspection_id) references public.inspection_attempt(id,inspection_id)
  ,foreign key(inspection_evidence_id,inspection_id) references public.inspection_evidence(id,inspection_id)
  ,foreign key(inspection_attempt_id,inspection_evidence_id) references public.inspection_attempt_evidence(inspection_attempt_id,inspection_evidence_id)
);
create table public.inspection_partial_usable_portion (
  id uuid primary key,
  inspection_attempt_id uuid not null references public.inspection_attempt(id),
  portion_code text not null check(app_private.is_stable_code(portion_code)),
  description text not null check(length(description) between 1 and 5000),
  deliverable_version_id uuid not null,
  unique(inspection_attempt_id,portion_code),
  unique(id,inspection_attempt_id),
  foreign key(inspection_attempt_id,deliverable_version_id) references public.inspection_attempt(id,deliverable_version_id)
);
create table public.inspection_partial_usable_portion_evidence (
  usable_portion_id uuid not null,
  inspection_attempt_id uuid not null,
  inspection_id uuid not null,
  inspection_evidence_id uuid not null,
  primary key(usable_portion_id,inspection_evidence_id),
  foreign key(usable_portion_id,inspection_attempt_id) references public.inspection_partial_usable_portion(id,inspection_attempt_id),
  foreign key(inspection_attempt_id,inspection_id) references public.inspection_attempt(id,inspection_id),
  foreign key(inspection_evidence_id,inspection_id) references public.inspection_evidence(id,inspection_id),
  foreign key(inspection_attempt_id,inspection_evidence_id) references public.inspection_attempt_evidence(inspection_attempt_id,inspection_evidence_id)
);
create table public.inspection_residual_condition (
  id uuid primary key,
  inspection_attempt_id uuid not null references public.inspection_attempt(id),
  condition_code text not null check(app_private.is_stable_code(condition_code)),
  description text not null check(length(description) between 1 and 5000),
  due_at timestamptz,
  unique(inspection_attempt_id,condition_code),
  unique(id,inspection_attempt_id)
);
create table public.inspection_residual_condition_evidence (
  residual_condition_id uuid not null,
  inspection_attempt_id uuid not null,
  inspection_id uuid not null,
  inspection_evidence_id uuid not null,
  primary key(residual_condition_id,inspection_evidence_id),
  foreign key(residual_condition_id,inspection_attempt_id) references public.inspection_residual_condition(id,inspection_attempt_id),
  foreign key(inspection_attempt_id,inspection_id) references public.inspection_attempt(id,inspection_id),
  foreign key(inspection_evidence_id,inspection_id) references public.inspection_evidence(id,inspection_id),
  foreign key(inspection_attempt_id,inspection_evidence_id) references public.inspection_attempt_evidence(inspection_attempt_id,inspection_evidence_id)
);
create table public.inspection_attempt_critical_failure (
  inspection_attempt_id uuid not null references public.inspection_attempt(id),
  inspection_checklist_version_id uuid not null,
  inspection_criterion_id uuid not null,
  primary key(inspection_attempt_id,inspection_criterion_id),
  foreign key(inspection_attempt_id,inspection_checklist_version_id) references public.inspection_attempt(id,inspection_checklist_version_id),
  foreign key(inspection_criterion_id,inspection_checklist_version_id) references public.inspection_criterion(id,inspection_checklist_version_id)
);

create table public.acceptance_payment_policy (
  id uuid primary key,
  stable_code text not null unique check(app_private.is_stable_code(stable_code)),
  status text not null check(status in ('ACTIVE','DISABLED')),
  created_at timestamptz not null
);
create table public.acceptance_payment_policy_version (
  id uuid primary key,
  policy_id uuid not null references public.acceptance_payment_policy(id),
  version_no bigint not null check(version_no>0),
  score_policy_version_id uuid not null,
  score_policy_id uuid not null,
  score_policy_version_no bigint not null check(score_policy_version_no>0),
  score_policy_checksum text not null check(app_private.is_sha256(score_policy_checksum)),
  state text not null check(state in ('DRAFT','PUBLISHED','RETIRED')),
  basis_kind text not null check(basis_kind in ('INTERNAL_PRESET','CONTRACT_OVERRIDE','GOVERNMENT_AGREEMENT','MANDATORY_LAW')),
  basis_reference_id text not null check(app_private.is_stable_code(basis_reference_id)),
  basis_version bigint not null check(basis_version>0),
  amount_rounding_decimal_places integer not null check(amount_rounding_decimal_places between 0 and 2),
  amount_rounding_mode text not null check(amount_rounding_mode in ('HALF_UP','DOWN')),
  checksum text not null check(app_private.is_sha256(checksum)),
  valid_from timestamptz not null,
  valid_until timestamptz,
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null,
  unique(policy_id,version_no),
  unique(id,policy_id,version_no,checksum),
  foreign key(score_policy_version_id,score_policy_id,score_policy_version_no,score_policy_checksum)
    references public.acceptance_score_policy_version(id,policy_id,version_no,checksum),
  check(valid_until is null or valid_until>valid_from)
);
create table public.acceptance_payment_rate_rule (
  id uuid primary key,
  policy_version_id uuid not null references public.acceptance_payment_policy_version(id),
  sequence_no integer not null check(sequence_no>0),
  minimum_achievement_inclusive numeric(9,6) not null check(minimum_achievement_inclusive between 0 and 100),
  maximum_achievement_exclusive numeric(9,6) check(maximum_achievement_exclusive>minimum_achievement_inclusive and maximum_achievement_exclusive<=100),
  disposition text not null check(disposition in ('ACCEPTED','CONDITIONAL_ACCEPTANCE','PARTIAL_ACCEPTANCE','REJECTED')),
  proposed_rate_kind text not null check(proposed_rate_kind in ('ZERO','ACHIEVEMENT_PERCENT','FIXED')),
  proposed_fixed_rate numeric(9,6) check(proposed_fixed_rate between 0 and 100),
  unique(policy_version_id,sequence_no),
  check((proposed_rate_kind='FIXED')=(proposed_fixed_rate is not null))
);

create table public.acceptance_payment_decision (
  id uuid primary key,
  decision_root_id uuid not null,
  revision_no bigint not null check(revision_no>0),
  previous_decision_id uuid unique,
  inspection_attempt_id uuid not null,
  inspection_id uuid not null,
  inspection_attempt_no integer not null check(inspection_attempt_no>0),
  inspection_attempt_checksum text not null check(app_private.is_sha256(inspection_attempt_checksum)),
  inspection_attempt_sealed_at timestamptz not null,
  contract_id uuid not null references public.vendor_contract(id),
  contract_milestone_id uuid not null references public.contract_milestone(id),
  deliverable_id uuid not null references public.deliverable(id),
  deliverable_version_id uuid not null references public.deliverable_version(id),
  disposition text not null check(disposition in ('ACCEPTED','CONDITIONAL_ACCEPTANCE','PARTIAL_ACCEPTANCE','REJECTED')),
  achievement_percent numeric(9,6) not null check(achievement_percent between 0 and 100),
  policy_version_id uuid not null,
  policy_id uuid not null,
  policy_version_no bigint not null check(policy_version_no>0),
  policy_checksum text not null check(app_private.is_sha256(policy_checksum)),
  strengthened_risk_snapshot boolean not null,
  risk_basis_reference text not null check(app_private.is_stable_code(risk_basis_reference)),
  milestone_amount numeric(20,2) not null check(milestone_amount>=0),
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  held_amount numeric(20,2) not null default 0 check(held_amount>=0),
  unpaid_remainder numeric(20,2) not null default 0 check(unpaid_remainder>=0),
  calculated_proposed_rate numeric(9,6) not null check(calculated_proposed_rate between 0 and 100),
  adjusted_requested_rate numeric(9,6) check(adjusted_requested_rate between 0 and 100),
  final_approved_rate numeric(9,6) check(final_approved_rate between 0 and 100),
  approved_payable_amount numeric(20,2) check(approved_payable_amount>=0),
  approval_instance_id uuid unique references public.approval_instance(id),
  approval_subject_version bigint,
  sealed_snapshot_checksum text check(sealed_snapshot_checksum is null or app_private.is_sha256(sealed_snapshot_checksum)),
  sealed_at timestamptz,
  state text not null check(state in ('CALCULATED','ADJUSTMENT_PROPOSED','APPROVAL_PENDING','APPROVED','HELD_FOR_CONDITIONS','ELIGIBLE_FOR_EXTERNAL_PAYMENT','CANCELLED')),
  approval_terminal_outcome text check(approval_terminal_outcome in ('REJECTED','RECALLED','CANCELLED')),
  cancellation_reason text,
  acceptance_waives_vendor_responsibility boolean not null default false check(not acceptance_waives_vendor_responsibility),
  payment_eligibility_waives_vendor_responsibility boolean not null default false check(not payment_eligibility_waives_vendor_responsibility),
  warranty_responsibility_survives boolean not null default true check(warranty_responsibility_survives),
  professional_responsibility_survives boolean not null default true check(professional_responsibility_survives),
  external_transfer_executed boolean not null default false check(not external_transfer_executed),
  version_no bigint not null check(version_no>0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(decision_root_id,revision_no),
  unique(id,decision_root_id),
  unique(id,decision_root_id,revision_no),
  unique(id,inspection_attempt_id,inspection_id),
  unique(id,inspection_attempt_id),
  unique(id,inspection_id),
  unique(id,decision_root_id,revision_no,version_no,sealed_snapshot_checksum,sealed_at),
  foreign key(previous_decision_id,decision_root_id) references public.acceptance_payment_decision(id,decision_root_id) deferrable initially deferred,
  foreign key(inspection_attempt_id,inspection_id,inspection_attempt_no,inspection_attempt_checksum)
    references public.inspection_attempt(id,inspection_id,attempt_no,checksum),
  foreign key(inspection_id,contract_id,contract_milestone_id,deliverable_id,deliverable_version_id)
    references public.inspection(id,contract_id,contract_milestone_id,deliverable_id,deliverable_version_id),
  foreign key(policy_version_id,policy_id,policy_version_no,policy_checksum) references public.acceptance_payment_policy_version(id,policy_id,version_no,checksum),
  check((revision_no=1)=(previous_decision_id is null)),
  check((approval_instance_id is null)=(approval_subject_version is null)),
  check((sealed_snapshot_checksum is null)=(sealed_at is null)),
  check(state not in ('APPROVAL_PENDING','APPROVED','HELD_FOR_CONDITIONS','ELIGIBLE_FOR_EXTERNAL_PAYMENT') or approval_instance_id is not null),
  check(state not in ('APPROVAL_PENDING','APPROVED','HELD_FOR_CONDITIONS','ELIGIBLE_FOR_EXTERNAL_PAYMENT') or sealed_snapshot_checksum is not null),
  check(state not in ('APPROVED','HELD_FOR_CONDITIONS','ELIGIBLE_FOR_EXTERNAL_PAYMENT') or final_approved_rate is not null),
  check((state in ('APPROVED','HELD_FOR_CONDITIONS','ELIGIBLE_FOR_EXTERNAL_PAYMENT'))=(approved_payable_amount is not null)),
  check(approved_payable_amount is null or approved_payable_amount<=milestone_amount),
  check(state<>'HELD_FOR_CONDITIONS' or (held_amount=unpaid_remainder and held_amount<=approved_payable_amount)),
  check(state<>'CANCELLED' or nullif(btrim(cancellation_reason),'') is not null)
);
create table public.payment_rate_adjustment (
  id uuid primary key,
  acceptance_payment_decision_id uuid not null references public.acceptance_payment_decision(id),
  requested_rate numeric(9,6) not null check(requested_rate between 0 and 100),
  direction text not null check(direction in ('UPWARD','DOWNWARD','UNCHANGED')),
  reason text not null check(length(reason) between 1 and 5000),
  proposed_by_user_id uuid not null references public.user_account(id),
  proposed_at timestamptz not null,
  unique(acceptance_payment_decision_id,id),
  unique(id,acceptance_payment_decision_id)
);
create table public.payment_rate_adjustment_evidence (
  adjustment_id uuid not null,
  acceptance_payment_decision_id uuid not null,
  inspection_id uuid not null,
  inspection_evidence_id uuid not null,
  primary key(adjustment_id,inspection_evidence_id),
  foreign key(adjustment_id,acceptance_payment_decision_id) references public.payment_rate_adjustment(id,acceptance_payment_decision_id),
  foreign key(acceptance_payment_decision_id,inspection_id) references public.acceptance_payment_decision(id,inspection_id),
  foreign key(inspection_evidence_id,inspection_id) references public.inspection_evidence(id,inspection_id)
);
create table public.acceptance_payment_residual_condition (
  id uuid primary key,
  acceptance_payment_decision_id uuid not null references public.acceptance_payment_decision(id),
  inspection_residual_condition_id uuid not null references public.inspection_residual_condition(id),
  inspection_attempt_id uuid not null,
  state text not null check(state in ('OPEN','SATISFIED')),
  satisfied_at timestamptz,
  satisfied_by_user_id uuid references public.user_account(id),
  unique(acceptance_payment_decision_id,inspection_residual_condition_id),
  unique(id,acceptance_payment_decision_id),
  foreign key(acceptance_payment_decision_id,inspection_attempt_id) references public.acceptance_payment_decision(id,inspection_attempt_id),
  foreign key(inspection_residual_condition_id,inspection_attempt_id) references public.inspection_residual_condition(id,inspection_attempt_id),
  check((state='SATISFIED')=(satisfied_at is not null)),
  check((state='SATISFIED')=(satisfied_by_user_id is not null))
);
create table public.acceptance_payment_residual_condition_evidence (
  acceptance_payment_residual_condition_id uuid not null,
  acceptance_payment_decision_id uuid not null,
  inspection_id uuid not null,
  inspection_evidence_id uuid not null,
  primary key(acceptance_payment_residual_condition_id,inspection_evidence_id),
  foreign key(acceptance_payment_residual_condition_id,acceptance_payment_decision_id)
    references public.acceptance_payment_residual_condition(id,acceptance_payment_decision_id),
  foreign key(acceptance_payment_decision_id,inspection_id) references public.acceptance_payment_decision(id,inspection_id),
  foreign key(inspection_evidence_id,inspection_id) references public.inspection_evidence(id,inspection_id)
);
create table public.acceptance_payment_usable_portion (
  id uuid primary key,
  acceptance_payment_decision_id uuid not null references public.acceptance_payment_decision(id),
  inspection_usable_portion_id uuid not null references public.inspection_partial_usable_portion(id),
  inspection_attempt_id uuid not null,
  release_eligible boolean not null,
  unique(acceptance_payment_decision_id,inspection_usable_portion_id),
  foreign key(acceptance_payment_decision_id,inspection_attempt_id) references public.acceptance_payment_decision(id,inspection_attempt_id),
  foreign key(inspection_usable_portion_id,inspection_attempt_id) references public.inspection_partial_usable_portion(id,inspection_attempt_id)
);

create table public.approval_policy_acceptance_payment_selector (
  policy_version_id uuid primary key references public.approval_policy_version(id),
  minimum_milestone_amount_inclusive numeric(20,2) not null check(minimum_milestone_amount_inclusive>=0),
  maximum_milestone_amount_exclusive numeric(20,2),
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  strengthened_risk_required boolean not null,
  representative_step_required boolean not null,
  representative_completion_mode text not null check(representative_completion_mode in ('NONE','ANY_ONE','ALL')),
  covers_upward_adjustment boolean not null,
  selector_checksum text not null check(app_private.is_sha256(selector_checksum)),
  check(representative_step_required=(representative_completion_mode<>'NONE')),
  check(maximum_milestone_amount_exclusive is null or maximum_milestone_amount_exclusive>minimum_milestone_amount_inclusive)
);

alter table public.approval_subject_binding drop constraint approval_subject_binding_subject_kind_check;
alter table public.approval_subject_binding add constraint approval_subject_binding_subject_kind_check
  check(subject_kind in ('APPROVAL_POLICY_VERSION','DOCUMENT_VERSION','RESEARCH_PROJECT_APPLICATION','CONTRACT_VERSION','ACCEPTANCE_PAYMENT_DECISION'));

create table public.approval_subject_acceptance_payment_decision (
  instance_id uuid primary key references public.approval_instance(id),
  subject_kind text not null default 'ACCEPTANCE_PAYMENT_DECISION' check(subject_kind='ACCEPTANCE_PAYMENT_DECISION'),
  acceptance_payment_decision_id uuid not null,
  decision_root_id uuid not null,
  decision_revision_no bigint not null check(decision_revision_no>0),
  subject_version_no bigint not null check(subject_version_no>0),
  subject_checksum text not null check(app_private.is_sha256(subject_checksum)),
  subject_sealed_at timestamptz not null,
  inspection_attempt_id uuid not null,
  inspection_attempt_checksum text not null check(app_private.is_sha256(inspection_attempt_checksum)),
  unique(acceptance_payment_decision_id,instance_id),
  unique(instance_id,acceptance_payment_decision_id,subject_version_no,subject_checksum),
  foreign key(instance_id,subject_kind) references public.approval_subject_binding(instance_id,subject_kind) deferrable initially deferred,
  foreign key(acceptance_payment_decision_id,decision_root_id,decision_revision_no,subject_version_no,subject_checksum,subject_sealed_at)
    references public.acceptance_payment_decision(id,decision_root_id,revision_no,version_no,sealed_snapshot_checksum,sealed_at),
  foreign key(inspection_attempt_id,inspection_attempt_checksum) references public.inspection_attempt(id,checksum)
);
alter table public.approval_action add constraint approval_action_m08_exact_unique unique(id,instance_id);
create table public.acceptance_payment_approval_outcome (
  acceptance_payment_decision_id uuid primary key references public.acceptance_payment_decision(id),
  approval_instance_id uuid not null references public.approval_instance(id),
  approval_version bigint not null check(approval_version>0),
  terminal_action_id uuid not null unique,
  outcome text not null check(outcome in ('APPROVED','REJECTED','RECALLED','CANCELLED')),
  actor_kind text not null check(actor_kind in ('USER','SYSTEM')),
  authenticated_actor_user_id uuid references public.user_account(id),
  effective_actor_user_id uuid references public.user_account(id),
  system_actor_id text,
  acting_authority_id uuid,
  acting_authority_evidence_id uuid,
  action_occurred_at timestamptz not null,
  approval_terminal_at timestamptz not null,
  correlation_id text not null check(app_private.is_opaque_key(correlation_id)),
  created_at timestamptz not null,
  foreign key(terminal_action_id,approval_instance_id) references public.approval_action(id,instance_id),
  foreign key(acting_authority_id,acting_authority_evidence_id) references public.acting_authority_assignment(id,evidence_id),
  check((actor_kind='USER' and authenticated_actor_user_id is not null and effective_actor_user_id is not null and system_actor_id is null)
    or (actor_kind='SYSTEM' and authenticated_actor_user_id is null and effective_actor_user_id is null and system_actor_id is not null)),
  check((acting_authority_id is null)=(acting_authority_evidence_id is null)),
  check(action_occurred_at=approval_terminal_at)
);
create trigger approval_acceptance_payment_subject_bind before insert on public.approval_subject_acceptance_payment_decision
  for each row execute function app_private.bind_approval_subject();

create or replace function app_private.assert_exactly_one_approval_subject()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare target_instance uuid:=coalesce(new.instance_id,old.instance_id); subject_count integer; begin
  select (select count(*) from public.approval_subject_policy_version p where p.instance_id=target_instance)
    +(select count(*) from public.approval_subject_document_version d where d.instance_id=target_instance)
    +(select count(*) from public.approval_subject_research_project_application r where r.instance_id=target_instance)
    +(select count(*) from public.approval_subject_contract_version c where c.instance_id=target_instance)
    +(select count(*) from public.approval_subject_acceptance_payment_decision a where a.instance_id=target_instance) into subject_count;
  if subject_count<>1 then raise exception 'approval instance requires exactly one typed subject' using errcode='23514'; end if;
  return coalesce(new,old);
end $$;

create or replace function app_private.approval_subject_snapshot(target_instance_id uuid)
returns table(subject_kind text,subject_version_id uuid,subject_version_no bigint,subject_checksum text,subject_state text)
language sql stable security definer set search_path=pg_catalog,public
as $$
  select 'APPROVAL_POLICY_VERSION',l.subject_policy_version_id,l.subject_version_no,l.subject_checksum,v.state
  from public.approval_subject_policy_version l join public.approval_policy_version v on v.id=l.subject_policy_version_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.checksum=l.subject_checksum
  union all
  select 'DOCUMENT_VERSION',l.document_version_id,l.subject_version_no,l.subject_checksum,v.state
  from public.approval_subject_document_version l join public.document_version v on v.id=l.document_version_id and v.document_id=l.document_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum
  union all
  select 'RESEARCH_PROJECT_APPLICATION',l.application_version_id,l.subject_version_no,l.subject_checksum,
    case when v.state='APPLICATION_DRAFT' and v.sealed_at is not null then 'SEALED' else v.state end
  from public.approval_subject_research_project_application l join public.research_project_application_version v
    on v.id=l.application_version_id and v.application_id=l.application_id and v.project_id=l.project_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum and v.sealed_at=l.subject_sealed_at
  union all
  select 'CONTRACT_VERSION',l.contract_version_id,l.subject_version_no,l.subject_checksum,v.state
  from public.approval_subject_contract_version l join public.contract_version v on v.id=l.contract_version_id and v.contract_id=l.contract_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum and v.sealed_at=l.subject_sealed_at
  union all
  select 'ACCEPTANCE_PAYMENT_DECISION',l.acceptance_payment_decision_id,l.subject_version_no,l.subject_checksum,d.state
  from public.approval_subject_acceptance_payment_decision l join public.acceptance_payment_decision d
    on d.id=l.acceptance_payment_decision_id and d.decision_root_id=l.decision_root_id and d.revision_no=l.decision_revision_no
  where l.instance_id=target_instance_id and d.version_no=l.subject_version_no and d.sealed_snapshot_checksum=l.subject_checksum and d.sealed_at=l.subject_sealed_at
$$;

create or replace function app_private.m08_assert_direct_internal(target_occurred_at timestamptz,target_permission text)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if target_occurred_at is distinct from app_private.request_time()
    or app_private.required_setting('app.actor_kind')<>'USER'
    or app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id()
    or app_private.current_acting_authority_id() is not null
    or not exists(select 1 from public.user_account u where u.id=app_private.current_actor_user_id()
      and u.account_kind='INTERNAL' and u.status='ACTIVE' and u.valid_from<=target_occurred_at
      and (u.valid_until is null or u.valid_until>target_occurred_at))
    or not app_private.actor_has_permission(target_permission,target_occurred_at) then
    raise exception 'active authorized direct internal actor required' using errcode='42501';
  end if;
end $$;

-- M07's exact Contract Scope is necessary but a direct manager match alone did
-- not re-check account status/validity. Downstream quality/payment reads and
-- commands must lose access immediately when that internal account is disabled
-- or expired.
create or replace function app_private.actor_has_contract_internal_scope(target_contract_id uuid,target_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$ select exists(select 1 from public.user_account u where u.id=app_private.current_effective_actor_user_id()
    and u.account_kind='INTERNAL' and u.status='ACTIVE' and u.valid_from<=target_time
    and (u.valid_until is null or u.valid_until>target_time))
  and exists(select 1 from public.vendor_contract c where c.id=target_contract_id and
    (c.manager_user_id=app_private.current_effective_actor_user_id() or exists(select 1 from public.contract_project cp
      where cp.contract_id=c.id and app_private.actor_has_project_internal_scope(cp.project_id,target_time)))) $$;

create or replace function app_private.m08_assert_inspection_requester(target_inspection_id uuid,target_contract_id uuid,target_vendor_id uuid,target_occurred_at timestamptz)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ declare account_type text; begin
  if target_occurred_at is distinct from app_private.request_time() then raise exception 'trusted request time required' using errcode='42501'; end if;
  if app_private.required_setting('app.actor_kind')<>'USER'
    or app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id()
    or app_private.current_acting_authority_id() is not null then
    raise exception 'direct user requester required' using errcode='42501';
  end if;
  select u.account_kind into strict account_type from public.user_account u
    where u.id=app_private.current_actor_user_id() and u.status='ACTIVE' and u.valid_from<=target_occurred_at
      and (u.valid_until is null or u.valid_until>target_occurred_at);
  if account_type='INTERNAL' then
    if not app_private.actor_has_contract_internal_scope(target_contract_id,target_occurred_at)
      or not app_private.actor_has_permission('inspection.record.request',target_occurred_at) then
      raise exception 'internal inspection request scope denied' using errcode='42501';
    end if;
  elsif account_type='VENDOR' then
    if not app_private.actor_has_contract_vendor_scope(target_contract_id,'inspection.record.request',target_occurred_at)
      or not exists(select 1 from public.vendor_user vu where vu.user_id=app_private.current_actor_user_id() and vu.vendor_id=target_vendor_id
      and app_private.actor_has_vendor_membership(vu.id,target_vendor_id,target_occurred_at)) then
      raise exception 'exact active VendorMembership and ContractScope required' using errcode='42501';
    end if;
  else
    raise exception 'unsupported requester account kind' using errcode='42501';
  end if;
end $$;

create or replace function app_private.append_m08_transition(
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_action text,target_aggregate_type text,target_aggregate_id uuid,
  target_machine text,target_event text,target_payload_schema text,target_from_state text,target_to_state text,target_from_version bigint,
  target_to_version bigint,target_reason text,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.append_audit(target_audit_id,target_action,target_aggregate_type,target_aggregate_id,target_to_version,'SUCCEEDED',coalesce(target_reason,target_event),null,null,null,null,target_occurred_at);
  perform app_private.append_state_transition(target_transition_id,target_audit_id,target_aggregate_type,target_aggregate_id,target_machine,target_event,
    target_from_state,target_to_state,target_from_version,target_to_version,coalesce(target_reason,target_event),null,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_occurred_at);
  perform app_private.enqueue_outbox(target_outbox_id,target_audit_id,target_event,target_aggregate_type,target_aggregate_id,target_to_version,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_payload_schema,1,
    jsonb_build_object('aggregateId',target_aggregate_id,'resourceVersion',target_to_version,'state',target_to_state),
    lower(target_aggregate_type)||':'||target_aggregate_id::text||':'||target_to_version::text,target_occurred_at,target_occurred_at);
end $$;

create or replace function app_private.guard_requirement_revision_lineage()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare prior_row public.requirement_revision%rowtype; begin
  if new.revision_no=1 then
    if new.previous_revision_id is not null then raise exception 'first RequirementRevision cannot have predecessor' using errcode='23514'; end if;
  else
    select * into strict prior_row from public.requirement_revision where id=new.previous_revision_id for share;
    if prior_row.requirement_id<>new.requirement_id or prior_row.revision_no+1<>new.revision_no then
      raise exception 'RequirementRevision must be direct-next on the same Requirement' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger requirement_revision_lineage before insert on public.requirement_revision
  for each row execute function app_private.guard_requirement_revision_lineage();

create or replace function app_private.guard_test_plan_version_lineage()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare prior_row public.test_plan_version%rowtype; begin
  if new.version_no=1 then
    if new.previous_version_id is not null then raise exception 'first TestPlanVersion cannot have predecessor' using errcode='23514'; end if;
  else
    select * into strict prior_row from public.test_plan_version where id=new.previous_version_id for share;
    if prior_row.test_plan_id<>new.test_plan_id or prior_row.version_no+1<>new.version_no then
      raise exception 'TestPlanVersion must be direct-next on the same TestPlan' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger test_plan_version_lineage before insert on public.test_plan_version
  for each row execute function app_private.guard_test_plan_version_lineage();

create or replace function app_private.guard_checklist_version_lineage()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare prior_row public.inspection_checklist_version%rowtype; begin
  if new.version_no=1 then
    if new.previous_version_id is not null then raise exception 'first checklist version cannot have predecessor' using errcode='23514'; end if;
  else
    select * into strict prior_row from public.inspection_checklist_version where id=new.previous_version_id for share;
    if prior_row.inspection_id<>new.inspection_id or prior_row.version_no+1<>new.version_no then
      raise exception 'checklist must be direct-next for the same Inspection' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger inspection_checklist_lineage before insert on public.inspection_checklist_version
  for each row execute function app_private.guard_checklist_version_lineage();

create or replace function app_private.guard_payment_decision_lineage()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare prior_row public.acceptance_payment_decision%rowtype; begin
  if new.revision_no=1 then return new; end if;
  select * into strict prior_row from public.acceptance_payment_decision where id=new.previous_decision_id for share;
  if prior_row.decision_root_id<>new.decision_root_id or prior_row.revision_no+1<>new.revision_no or prior_row.state<>'CANCELLED'
    or prior_row.approval_terminal_outcome not in ('REJECTED','RECALLED') then
    raise exception 'payment decision resubmission must be direct-next after a terminal negative outcome' using errcode='23514';
  end if;
  return new;
end $$;
create trigger acceptance_payment_lineage before insert on public.acceptance_payment_decision
  for each row execute function app_private.guard_payment_decision_lineage();

create or replace function app_private.reject_m08_immutable()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin raise exception '% is immutable evidence',tg_table_name using errcode='55000'; end $$;

create trigger requirement_revision_immutable before update or delete on public.requirement_revision for each row execute function app_private.reject_m08_immutable();
create trigger test_measurement_immutable before update or delete on public.test_measurement for each row execute function app_private.reject_m08_immutable();
create trigger test_result_evidence_immutable before update or delete on public.test_result_evidence for each row execute function app_private.reject_m08_immutable();
create trigger payment_adjustment_immutable before update or delete on public.payment_rate_adjustment for each row execute function app_private.reject_m08_immutable();
create trigger payment_adjustment_evidence_immutable before update or delete on public.payment_rate_adjustment_evidence for each row execute function app_private.reject_m08_immutable();

create or replace function app_private.protect_test_result()
returns trigger language plpgsql set search_path=pg_catalog,app_private
as $$ begin
  if tg_op='DELETE' then raise exception 'TestResult is immutable' using errcode='55000'; end if;
  if old.state='DRAFT' and new.state='SEALED' and app_private.optional_setting('app.m08_test_result_command')=old.id::text
    and new.id=old.id and new.test_plan_id=old.test_plan_id and new.test_plan_version_id=old.test_plan_version_id
    and new.test_plan_version_no=old.test_plan_version_no and new.execution_no=old.execution_no
    and new.tested_deliverable_version_id is not distinct from old.tested_deliverable_version_id
    and new.executed_by_user_id=old.executed_by_user_id and new.executed_at=old.executed_at then return new; end if;
  raise exception 'TestResult is immutable except trusted sealing' using errcode='55000';
end $$;
create trigger test_result_immutable before update or delete on public.test_result for each row execute function app_private.protect_test_result();

create or replace function app_private.protect_test_result_children()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare result_id uuid:=coalesce(new.test_result_id,old.test_result_id); begin
  if tg_op<>'INSERT' or app_private.optional_setting('app.m08_test_result_command') is distinct from result_id::text
    or not exists(select 1 from public.test_result r where r.id=result_id and r.state='DRAFT') then
    raise exception 'TestResult children require exact trusted DRAFT command' using errcode='55000';
  end if;
  return new;
end $$;
create trigger test_measurement_insert_guard before insert on public.test_measurement for each row execute function app_private.protect_test_result_children();
create trigger test_result_evidence_insert_guard before insert on public.test_result_evidence for each row execute function app_private.protect_test_result_children();

create or replace function app_private.protect_test_plan_version()
returns trigger language plpgsql set search_path=pg_catalog,app_private
as $$ begin
  if tg_op='DELETE' then raise exception 'TestPlanVersion is immutable' using errcode='55000'; end if;
  if old.state='DRAFT' and new.state='SEALED' and app_private.optional_setting('app.m08_seal_test_plan')=old.id::text
    and new.id=old.id and new.test_plan_id=old.test_plan_id and new.version_no=old.version_no
    and new.previous_version_id is not distinct from old.previous_version_id and new.conditions=old.conditions
    and new.method=old.method and new.repetitions=old.repetitions and new.created_by_user_id=old.created_by_user_id
    and new.created_at=old.created_at then return new; end if;
  raise exception 'TestPlanVersion is immutable except trusted sealing' using errcode='55000';
end $$;
create trigger test_plan_version_immutable before update or delete on public.test_plan_version
  for each row execute function app_private.protect_test_plan_version();

create or replace function app_private.protect_test_plan_children()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare version_id uuid:=coalesce(new.test_plan_version_id,old.test_plan_version_id); begin
  if tg_op<>'INSERT' or exists(select 1 from public.test_plan_version v where v.id=version_id and v.state='SEALED') then
    raise exception 'sealed TestPlanVersion children are immutable' using errcode='55000';
  end if;
  return new;
end $$;
create trigger test_plan_equipment_protected before insert or update or delete on public.test_plan_equipment for each row execute function app_private.protect_test_plan_children();
create trigger test_plan_evidence_requirement_protected before insert or update or delete on public.test_plan_evidence_requirement for each row execute function app_private.protect_test_plan_children();
create trigger test_plan_coverage_protected before insert or update or delete on public.test_plan_requirement_coverage for each row execute function app_private.protect_test_plan_children();

create or replace function app_private.protect_inspection_checklist_version()
returns trigger language plpgsql set search_path=pg_catalog,app_private
as $$ begin
  if tg_op='DELETE' then raise exception 'InspectionChecklistVersion is immutable' using errcode='55000'; end if;
  if old.state='DRAFT' and new.state='SEALED' and app_private.optional_setting('app.m08_seal_checklist')=old.id::text
    and new.id=old.id and new.inspection_id=old.inspection_id and new.version_no=old.version_no
    and new.previous_version_id is not distinct from old.previous_version_id and new.policy_version_id=old.policy_version_id
    and new.policy_id=old.policy_id and new.policy_version_no=old.policy_version_no and new.policy_checksum=old.policy_checksum
    then return new; end if;
  raise exception 'InspectionChecklistVersion is immutable except trusted sealing' using errcode='55000';
end $$;
create trigger inspection_checklist_version_immutable before update or delete on public.inspection_checklist_version
  for each row execute function app_private.protect_inspection_checklist_version();

create or replace function app_private.protect_versioned_policy_children()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare published boolean; begin
  if tg_table_name='acceptance_score_policy_band' then
    select v.state='PUBLISHED' into published from public.acceptance_score_policy_version v where v.id=coalesce(new.policy_version_id,old.policy_version_id);
  else
    select v.state='PUBLISHED' into published from public.acceptance_payment_policy_version v where v.id=coalesce(new.policy_version_id,old.policy_version_id);
  end if;
  if tg_op<>'INSERT' or published then raise exception 'published policy rules are immutable' using errcode='55000'; end if;
  return new;
end $$;
create trigger acceptance_score_band_protected before insert or update or delete on public.acceptance_score_policy_band for each row execute function app_private.protect_versioned_policy_children();
create trigger acceptance_payment_rate_rule_protected before insert or update or delete on public.acceptance_payment_rate_rule for each row execute function app_private.protect_versioned_policy_children();
create or replace function app_private.protect_acceptance_approval_selector()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare policy_version uuid:=coalesce(new.policy_version_id,old.policy_version_id); begin
  if tg_op<>'INSERT' or exists(select 1 from public.approval_policy_version v where v.id=policy_version and v.state in ('PUBLISHED','RETIRED')) then
    raise exception 'published acceptance-payment approval selector is immutable' using errcode='55000';
  end if;
  return new;
end $$;
create trigger acceptance_approval_selector_protected before insert or update or delete on public.approval_policy_acceptance_payment_selector
  for each row execute function app_private.protect_acceptance_approval_selector();

create or replace function app_private.acceptance_payment_approval_policy_checksum(target_policy_version_id uuid)
returns text language sql stable security definer set search_path=pg_catalog,public,app_private
as $$ select app_private.canonical_json_sha256(jsonb_build_object('schema','ACCEPTANCE_PAYMENT_APPROVAL_POLICY_V1',
  'policyId',v.policy_id,'versionNo',v.version_no,'subjectKind',v.subject_kind,'recallAllowed',v.recall_allowed,
  'validFrom',v.valid_from,'validUntil',v.valid_until,
  'selector',jsonb_build_object('minimumAmount',s.minimum_milestone_amount_inclusive,'maximumAmount',s.maximum_milestone_amount_exclusive,
    'currency',s.currency,'strengthenedRiskRequired',s.strengthened_risk_required,
    'representativeMode',s.representative_completion_mode,'coversUpwardAdjustment',s.covers_upward_adjustment,
    'checksum',s.selector_checksum),
  'steps',(select jsonb_agg(jsonb_build_object('stepKey',sr.step_key,'sequenceNo',sr.sequence_no,'role',sr.step_role,
    'completionMode',sr.completion_mode,'required',sr.required,'participants',(select jsonb_agg(jsonb_build_object(
      'selectorKind',pr.selector_kind,'positionCode',p.stable_code,'order',pr.participant_order,'required',pr.required_for_completion)
      order by pr.participant_order) from public.approval_policy_participant_rule pr left join public.position p on p.id=pr.position_id
      where pr.step_rule_id=sr.id)) order by sr.sequence_no,sr.step_key)
    from public.approval_policy_step_rule sr where sr.policy_version_id=v.id)))
  from public.approval_policy_version v join public.approval_policy_acceptance_payment_selector s on s.policy_version_id=v.id
  where v.id=target_policy_version_id $$;

create or replace function app_private.guard_acceptance_payment_approval_policy_publish()
returns trigger language plpgsql set search_path=pg_catalog,app_private
as $$ begin
  if old.subject_kind='ACCEPTANCE_PAYMENT_DECISION' and old.state='DRAFT' and new.state<>'DRAFT' then
    if new.state<>'PUBLISHED' or app_private.optional_setting('app.m08_publish_payment_approval_policy') is distinct from old.id::text
      or (to_jsonb(new)-'state'-'lock_version')<>(to_jsonb(old)-'state'-'lock_version') or new.lock_version<>old.lock_version+1 then
      raise exception 'acceptance-payment Approval policy requires trusted validated publish' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger approval_policy_acceptance_payment_publish_guard before update on public.approval_policy_version
  for each row execute function app_private.guard_acceptance_payment_approval_policy_publish();

create or replace function public.publish_acceptance_payment_approval_policy(
  target_policy_version_id uuid,target_expected_checksum text,target_audit_id uuid,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare v public.approval_policy_version%rowtype; s public.approval_policy_acceptance_payment_selector%rowtype; actual_checksum text; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'approval.policy.manage');
  select * into strict v from public.approval_policy_version where id=target_policy_version_id for update;
  select * into strict s from public.approval_policy_acceptance_payment_selector where policy_version_id=v.id for share;
  if v.state<>'DRAFT' or v.subject_kind<>'ACCEPTANCE_PAYMENT_DECISION' or v.checksum<>target_expected_checksum
    or s.selector_checksum<>app_private.canonical_json_sha256(jsonb_build_object('schema','ACCEPTANCE_PAYMENT_APPROVAL_SELECTOR_V1',
      'policyVersionId',s.policy_version_id,'minimumAmount',s.minimum_milestone_amount_inclusive,
      'maximumAmount',s.maximum_milestone_amount_exclusive,'currency',s.currency,
      'strengthenedRiskRequired',s.strengthened_risk_required,'representativeMode',s.representative_completion_mode,
      'coversUpwardAdjustment',s.covers_upward_adjustment))
    or (select count(*) from public.approval_policy_step_rule sr where sr.policy_version_id=v.id)
      <>(case s.representative_completion_mode when 'NONE' then 1 else 2 end)
    or not exists(select 1 from public.approval_policy_step_rule sr where sr.policy_version_id=v.id and sr.sequence_no=1
      and sr.step_role='APPROVAL' and sr.completion_mode='SEQUENTIAL' and sr.required
      and (select count(*) from public.approval_policy_participant_rule pr join public.position p on p.id=pr.position_id
        where pr.step_rule_id=sr.id and pr.selector_kind='POSITION' and pr.required_for_completion
          and p.stable_code='POSITION_LAB_DIRECTOR')=1
      and (select count(*) from public.approval_policy_participant_rule pr where pr.step_rule_id=sr.id)=1)
    or (s.representative_completion_mode<>'NONE' and not exists(select 1 from public.approval_policy_step_rule sr
      where sr.policy_version_id=v.id and sr.sequence_no=2 and sr.step_role='APPROVAL'
        and sr.completion_mode=s.representative_completion_mode and sr.required
        and (select count(*) from public.approval_policy_participant_rule pr join public.position p on p.id=pr.position_id
          where pr.step_rule_id=sr.id and pr.selector_kind='POSITION' and pr.required_for_completion
            and p.stable_code='POSITION_REPRESENTATIVE')=1
        and (select count(*) from public.approval_policy_participant_rule pr where pr.step_rule_id=sr.id)=1)) then
    raise exception 'canonical Lab Director/Representative Approval policy and selector required' using errcode='23514';
  end if;
  actual_checksum:=app_private.acceptance_payment_approval_policy_checksum(v.id);
  if actual_checksum<>target_expected_checksum then raise exception 'acceptance-payment Approval policy checksum mismatch' using errcode='23514'; end if;
  if exists(select 1 from public.approval_policy_version other join public.approval_policy_acceptance_payment_selector os on os.policy_version_id=other.id
    where other.id<>v.id and other.state='PUBLISHED' and other.subject_kind=v.subject_kind and os.currency=s.currency
      and os.strengthened_risk_required=s.strengthened_risk_required
      and (other.valid_until is null or other.valid_until>v.valid_from) and (v.valid_until is null or v.valid_until>other.valid_from)
      and (os.maximum_milestone_amount_exclusive is null or s.minimum_milestone_amount_inclusive<os.maximum_milestone_amount_exclusive)
      and (s.maximum_milestone_amount_exclusive is null or os.minimum_milestone_amount_inclusive<s.maximum_milestone_amount_exclusive)) then
    raise exception 'overlapping effective acceptance-payment Approval selector' using errcode='23514';
  end if;
  perform set_config('app.m08_publish_payment_approval_policy',v.id::text,true);
  update public.approval_policy_version set state='PUBLISHED',lock_version=lock_version+1 where id=v.id;
  perform app_private.append_audit(target_audit_id,'approval.policy.publish','APPROVAL_POLICY_VERSION',v.id,v.version_no,
    'SUCCEEDED','ACCEPTANCE-PAYMENT-POLICY-PUBLISHED',null,null,actual_checksum,null,target_occurred_at);
end $$;

create or replace function app_private.protect_checklist_children()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare checklist_id uuid; begin
  if tg_table_name='inspection_criterion' then checklist_id:=coalesce(new.inspection_checklist_version_id,old.inspection_checklist_version_id);
  else select inspection_checklist_version_id into checklist_id from public.inspection_criterion where id=coalesce(new.inspection_criterion_id,old.inspection_criterion_id); end if;
  if exists(select 1 from public.inspection_checklist_version v where v.id=checklist_id and v.state='SEALED') then
    raise exception 'sealed checklist and criteria are immutable' using errcode='55000';
  end if;
  return coalesce(new,old);
end $$;
create trigger inspection_criterion_protected before insert or update or delete on public.inspection_criterion for each row execute function app_private.protect_checklist_children();
create trigger inspection_criterion_evidence_protected before insert or update or delete on public.inspection_criterion_evidence_requirement for each row execute function app_private.protect_checklist_children();

create or replace function app_private.protect_attempt_children()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare attempt_id uuid; begin
  if tg_table_name='inspection_criterion_result' then attempt_id:=coalesce(new.inspection_attempt_id,old.inspection_attempt_id);
  elsif tg_table_name='inspection_attempt_evidence' then attempt_id:=coalesce(new.inspection_attempt_id,old.inspection_attempt_id);
  elsif tg_table_name='inspection_partial_usable_portion' then attempt_id:=coalesce(new.inspection_attempt_id,old.inspection_attempt_id);
  elsif tg_table_name='inspection_residual_condition' then attempt_id:=coalesce(new.inspection_attempt_id,old.inspection_attempt_id);
  elsif tg_table_name='inspection_attempt_critical_failure' then attempt_id:=coalesce(new.inspection_attempt_id,old.inspection_attempt_id);
  elsif tg_table_name='inspection_criterion_result_evidence' then
    select inspection_attempt_id into attempt_id from public.inspection_criterion_result where id=coalesce(new.inspection_criterion_result_id,old.inspection_criterion_result_id);
  elsif tg_table_name='inspection_partial_usable_portion_evidence' then
    select inspection_attempt_id into attempt_id from public.inspection_partial_usable_portion where id=coalesce(new.usable_portion_id,old.usable_portion_id);
  else select inspection_attempt_id into attempt_id from public.inspection_residual_condition where id=coalesce(new.residual_condition_id,old.residual_condition_id); end if;
  if exists(select 1 from public.inspection_attempt a where a.id=attempt_id and a.state='SEALED') then
    raise exception 'sealed InspectionAttempt evidence is immutable' using errcode='55000';
  end if;
  return coalesce(new,old);
end $$;
create trigger inspection_result_protected before insert or update or delete on public.inspection_criterion_result for each row execute function app_private.protect_attempt_children();
create trigger inspection_attempt_evidence_protected before insert or update or delete on public.inspection_attempt_evidence for each row execute function app_private.protect_attempt_children();
create trigger inspection_result_evidence_protected before insert or update or delete on public.inspection_criterion_result_evidence for each row execute function app_private.protect_attempt_children();
create trigger inspection_portion_protected before insert or update or delete on public.inspection_partial_usable_portion for each row execute function app_private.protect_attempt_children();
create trigger inspection_portion_evidence_protected before insert or update or delete on public.inspection_partial_usable_portion_evidence for each row execute function app_private.protect_attempt_children();
create trigger inspection_residual_protected before insert or update or delete on public.inspection_residual_condition for each row execute function app_private.protect_attempt_children();
create trigger inspection_residual_evidence_protected before insert or update or delete on public.inspection_residual_condition_evidence for each row execute function app_private.protect_attempt_children();
create trigger inspection_critical_failure_protected before insert or update or delete on public.inspection_attempt_critical_failure for each row execute function app_private.protect_attempt_children();

create or replace function app_private.protect_inspection_attempt()
returns trigger language plpgsql set search_path=pg_catalog,app_private
as $$ begin
  if tg_op='DELETE' then raise exception 'InspectionAttempt is retained' using errcode='55000'; end if;
  if old.state='DRAFT' and new.state='SEALED' and app_private.optional_setting('app.m08_seal_attempt')=old.id::text
    and new.id=old.id and new.inspection_id=old.inspection_id and new.attempt_no=old.attempt_no
    and new.inspection_checklist_version_id=old.inspection_checklist_version_id and new.contract_id=old.contract_id
    and new.contract_milestone_id=old.contract_milestone_id and new.deliverable_id=old.deliverable_id
    and new.deliverable_version_id=old.deliverable_version_id and new.assigned_vendor_id=old.assigned_vendor_id
    and new.inspector_user_id=old.inspector_user_id then return new; end if;
  raise exception 'InspectionAttempt identity is immutable and only the trusted seal transition is allowed' using errcode='55000';
end $$;
create trigger inspection_attempt_immutable before update or delete on public.inspection_attempt for each row execute function app_private.protect_inspection_attempt();
create trigger inspection_evidence_immutable before update or delete on public.inspection_evidence
  for each row execute function app_private.reject_m08_immutable();

create or replace function app_private.guard_acceptance_payment_subject_active()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  perform pg_advisory_xact_lock(hashtextextended(new.acceptance_payment_decision_id::text,0));
  if exists(select 1 from public.approval_subject_acceptance_payment_decision s join public.approval_instance i on i.id=s.instance_id
    where s.acceptance_payment_decision_id=new.acceptance_payment_decision_id and i.state not in ('REJECTED','RECALLED','CANCELLED')) then
    raise exception 'exact AcceptancePaymentDecision already has an active approval generation' using errcode='23505';
  end if;
  return new;
end $$;
create trigger acceptance_payment_subject_active before insert on public.approval_subject_acceptance_payment_decision
  for each row execute function app_private.guard_acceptance_payment_subject_active();
create trigger acceptance_payment_subject_immutable before update or delete on public.approval_subject_acceptance_payment_decision
  for each row execute function app_private.reject_m08_immutable();
create trigger acceptance_payment_approval_outcome_immutable before update or delete on public.acceptance_payment_approval_outcome
  for each row execute function app_private.reject_m08_immutable();

create or replace function app_private.guard_acceptance_payment_approval_path()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if new.event_id in ('REVIEW','AGREE','APPROVE','REJECT','REFERENCE_RECEIPT','REQUEST_RECALL','RECALL')
    and exists(select 1 from public.approval_subject_acceptance_payment_decision p where p.instance_id=new.instance_id)
    and app_private.optional_setting('app.acceptance_payment_approval_instance') is distinct from new.instance_id::text then
    raise exception 'AcceptancePaymentDecision approval actions require the exact typed command path' using errcode='42501';
  end if;
  return new;
end $$;
create trigger approval_action_acceptance_payment_path_guard before insert on public.approval_action
  for each row execute function app_private.guard_acceptance_payment_approval_path();

create or replace function app_private.protect_published_policy_version()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin
  if tg_op='DELETE' or old.state='PUBLISHED' then
    raise exception 'published policy version is immutable' using errcode='55000';
  end if;
  if (to_jsonb(new)-'state')<>(to_jsonb(old)-'state') or old.state<>'DRAFT' or new.state<>'PUBLISHED'
    or app_private.optional_setting('app.m08_publish_policy') is distinct from old.id::text then
    raise exception 'policy version allows only trusted DRAFT to PUBLISHED transition' using errcode='55000';
  end if;
  return new;
end $$;
create trigger acceptance_score_policy_version_protected before update or delete on public.acceptance_score_policy_version
  for each row execute function app_private.protect_published_policy_version();
create trigger acceptance_payment_policy_version_protected before update or delete on public.acceptance_payment_policy_version
  for each row execute function app_private.protect_published_policy_version();

create or replace function app_private.guard_available_evidence()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare target_attachment uuid:=new.attachment_id; begin
  if not exists(select 1 from public.attachment a where a.id=target_attachment and a.state='AVAILABLE'
    and a.row_version=new.attachment_row_version and a.detected_sha256=new.content_checksum) then
    raise exception 'evidence requires exact AVAILABLE attachment snapshot' using errcode='23514';
  end if;
  return new;
end $$;
create trigger test_result_evidence_available before insert on public.test_result_evidence for each row execute function app_private.guard_available_evidence();
create trigger inspection_evidence_available before insert on public.inspection_evidence for each row execute function app_private.guard_available_evidence();

create or replace function app_private.guard_test_result_snapshot()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if not exists(select 1 from public.test_plan_version v where v.id=new.test_plan_version_id and v.test_plan_id=new.test_plan_id
    and v.version_no=new.test_plan_version_no and v.state='SEALED') then
    raise exception 'TestResult requires exact sealed TestPlanVersion' using errcode='23514';
  end if;
  return new;
end $$;
create trigger test_result_exact_plan before insert on public.test_result for each row execute function app_private.guard_test_result_snapshot();

create or replace function app_private.protect_acceptance_payment_decision()
returns trigger language plpgsql set search_path=pg_catalog,app_private
as $$ begin
  if tg_op='DELETE' then raise exception 'AcceptancePaymentDecision is retained' using errcode='55000'; end if;
  if app_private.optional_setting('app.m08_payment_command') is distinct from old.id::text then
    raise exception 'AcceptancePaymentDecision changes require trusted command path' using errcode='42501';
  end if;
  if old.state in ('APPROVED','HELD_FOR_CONDITIONS','ELIGIBLE_FOR_EXTERNAL_PAYMENT') and (
    new.final_approved_rate is distinct from old.final_approved_rate or new.calculated_proposed_rate<>old.calculated_proposed_rate
    or new.approved_payable_amount is distinct from old.approved_payable_amount
    or new.adjusted_requested_rate is distinct from old.adjusted_requested_rate or new.policy_version_id<>old.policy_version_id
    or new.inspection_attempt_id<>old.inspection_attempt_id or new.inspection_attempt_checksum<>old.inspection_attempt_checksum
    or new.contract_id<>old.contract_id or new.contract_milestone_id<>old.contract_milestone_id
    or new.deliverable_id<>old.deliverable_id or new.deliverable_version_id<>old.deliverable_version_id
    or new.disposition<>old.disposition or new.achievement_percent<>old.achievement_percent
    or new.strengthened_risk_snapshot<>old.strengthened_risk_snapshot or new.risk_basis_reference<>old.risk_basis_reference
    or new.milestone_amount<>old.milestone_amount or new.currency<>old.currency
    or new.sealed_snapshot_checksum is distinct from old.sealed_snapshot_checksum or new.sealed_at is distinct from old.sealed_at) then
    raise exception 'approved payment basis and final rate are frozen' using errcode='55000';
  end if;
  if new.external_transfer_executed then raise exception 'M08 never executes external transfer or accounting' using errcode='42501'; end if;
  return new;
end $$;
create trigger acceptance_payment_decision_protected before update or delete on public.acceptance_payment_decision
  for each row execute function app_private.protect_acceptance_payment_decision();

create or replace function public.publish_m08_policy_version(
  target_policy_kind text,target_policy_version_id uuid,target_expected_checksum text,target_audit_id uuid,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare actual_checksum text; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'quality.policy.manage');
  if not app_private.is_sha256(target_expected_checksum) then raise exception 'exact policy checksum required' using errcode='23514'; end if;
  if target_policy_kind='ACCEPTANCE_SCORE' then
    if not exists(select 1 from public.acceptance_score_policy_version v where v.id=target_policy_version_id and v.state='DRAFT'
      and v.checksum=target_expected_checksum and exists(select 1 from public.acceptance_score_policy_band b where b.policy_version_id=v.id)) then
      raise exception 'draft score policy and at least one versioned band required' using errcode='23514';
    end if;
    if (select min(b.minimum_achievement_inclusive) from public.acceptance_score_policy_band b where b.policy_version_id=target_policy_version_id)<>0
      or (select count(*) from public.acceptance_score_policy_band b where b.policy_version_id=target_policy_version_id and b.maximum_achievement_exclusive is null)<>1
      or (select count(distinct b.disposition) from public.acceptance_score_policy_band b where b.policy_version_id=target_policy_version_id)<>4
      or exists(select 1 from public.acceptance_score_policy_band a join public.acceptance_score_policy_band b
        on b.policy_version_id=a.policy_version_id and b.id<>a.id where a.policy_version_id=target_policy_version_id
          and (a.maximum_achievement_exclusive is null or b.minimum_achievement_inclusive<a.maximum_achievement_exclusive)
          and (b.maximum_achievement_exclusive is null or a.minimum_achievement_inclusive<b.maximum_achievement_exclusive))
      or exists(select 1 from (select b.minimum_achievement_inclusive,
          lag(b.maximum_achievement_exclusive) over(order by b.minimum_achievement_inclusive) previous_maximum
        from public.acceptance_score_policy_band b where b.policy_version_id=target_policy_version_id) ordered
        where ordered.previous_maximum is not null and ordered.minimum_achievement_inclusive<>ordered.previous_maximum) then
      raise exception 'score policy bands must be non-overlapping and cover all four dispositions from zero upward' using errcode='23514';
    end if;
    select app_private.canonical_json_sha256(jsonb_build_object('schema','ACCEPTANCE_SCORE_POLICY_V1','policyId',v.policy_id,
      'versionNo',v.version_no,'basisKind',v.basis_kind,'basisReferenceId',v.basis_reference_id,'basisVersion',v.basis_version,
      'roundingDecimalPlaces',v.rounding_decimal_places,'roundingMode',v.rounding_mode,'validFrom',v.valid_from,'validUntil',v.valid_until,
      'bands',(select jsonb_agg(jsonb_build_object('sequenceNo',b.sequence_no,'minimum',b.minimum_achievement_inclusive,
        'maximum',b.maximum_achievement_exclusive,'disposition',b.disposition,'rateKind',b.proposed_rate_kind,'fixedRate',b.proposed_fixed_rate)
        order by b.sequence_no) from public.acceptance_score_policy_band b where b.policy_version_id=v.id))) into actual_checksum
      from public.acceptance_score_policy_version v where v.id=target_policy_version_id;
    if actual_checksum<>target_expected_checksum then raise exception 'score policy canonical checksum mismatch' using errcode='23514'; end if;
    perform set_config('app.m08_publish_policy',target_policy_version_id::text,true);
    update public.acceptance_score_policy_version set state='PUBLISHED' where id=target_policy_version_id;
  elsif target_policy_kind='ACCEPTANCE_PAYMENT' then
    if not exists(select 1 from public.acceptance_payment_policy_version v where v.id=target_policy_version_id and v.state='DRAFT'
      and v.checksum=target_expected_checksum and exists(select 1 from public.acceptance_payment_rate_rule r where r.policy_version_id=v.id)) then
      raise exception 'draft payment policy and at least one versioned rule required' using errcode='23514';
    end if;
    if (select min(r.minimum_achievement_inclusive) from public.acceptance_payment_rate_rule r where r.policy_version_id=target_policy_version_id)<>0
      or (select count(*) from public.acceptance_payment_rate_rule r where r.policy_version_id=target_policy_version_id and r.maximum_achievement_exclusive is null)<>1
      or (select count(distinct r.disposition) from public.acceptance_payment_rate_rule r where r.policy_version_id=target_policy_version_id)<>4
      or exists(select 1 from public.acceptance_payment_rate_rule a join public.acceptance_payment_rate_rule b
        on b.policy_version_id=a.policy_version_id and b.id<>a.id where a.policy_version_id=target_policy_version_id
          and (a.maximum_achievement_exclusive is null or b.minimum_achievement_inclusive<a.maximum_achievement_exclusive)
          and (b.maximum_achievement_exclusive is null or a.minimum_achievement_inclusive<b.maximum_achievement_exclusive))
      or exists(select 1 from (select r.minimum_achievement_inclusive,
          lag(r.maximum_achievement_exclusive) over(order by r.minimum_achievement_inclusive) previous_maximum
        from public.acceptance_payment_rate_rule r where r.policy_version_id=target_policy_version_id) ordered
        where ordered.previous_maximum is not null and ordered.minimum_achievement_inclusive<>ordered.previous_maximum) then
      raise exception 'payment rules must be non-overlapping and cover all four dispositions from zero upward' using errcode='23514';
    end if;
    select app_private.canonical_json_sha256(jsonb_build_object('schema','ACCEPTANCE_PAYMENT_POLICY_V1','policyId',v.policy_id,
      'versionNo',v.version_no,'scorePolicyVersionId',v.score_policy_version_id,'scorePolicyChecksum',v.score_policy_checksum,
      'basisKind',v.basis_kind,'basisReferenceId',v.basis_reference_id,'basisVersion',v.basis_version,
      'amountRoundingDecimalPlaces',v.amount_rounding_decimal_places,'amountRoundingMode',v.amount_rounding_mode,
      'validFrom',v.valid_from,'validUntil',v.valid_until,
      'rules',(select jsonb_agg(jsonb_build_object('sequenceNo',r.sequence_no,'minimum',r.minimum_achievement_inclusive,
        'maximum',r.maximum_achievement_exclusive,'disposition',r.disposition,'rateKind',r.proposed_rate_kind,'fixedRate',r.proposed_fixed_rate)
        order by r.sequence_no) from public.acceptance_payment_rate_rule r where r.policy_version_id=v.id))) into actual_checksum
      from public.acceptance_payment_policy_version v where v.id=target_policy_version_id;
    if actual_checksum<>target_expected_checksum then raise exception 'payment policy canonical checksum mismatch' using errcode='23514'; end if;
    perform set_config('app.m08_publish_policy',target_policy_version_id::text,true);
    update public.acceptance_payment_policy_version set state='PUBLISHED' where id=target_policy_version_id;
  else raise exception 'unsupported policy kind' using errcode='22023'; end if;
  perform app_private.append_audit(target_audit_id,'quality.policy.manage',target_policy_kind,target_policy_version_id,null,'SUCCEEDED',
    'VERSIONED-POLICY-PUBLISHED',null,null,null,null,target_occurred_at);
end $$;

create or replace function public.seal_test_plan_version(
  target_test_plan_version_id uuid,target_expected_manifest_checksum text,target_audit_id uuid,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare version_row public.test_plan_version%rowtype; target_project_id uuid; actual_checksum text; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'quality.test.manage');
  select * into strict version_row from public.test_plan_version where id=target_test_plan_version_id for update;
  select p.project_id into strict target_project_id from public.test_plan p where p.id=version_row.test_plan_id;
  if version_row.state<>'DRAFT' or not app_private.actor_has_project_internal_scope(target_project_id,target_occurred_at)
    or not exists(select 1 from public.test_plan_requirement_coverage c where c.test_plan_version_id=version_row.id)
    or not exists(select 1 from public.test_plan_evidence_requirement e where e.test_plan_version_id=version_row.id)
    or not exists(select 1 from public.test_plan_equipment e where e.test_plan_version_id=version_row.id) then
    raise exception 'scoped draft TestPlanVersion with equipment, coverage and evidence requirements required' using errcode='23514';
  end if;
  select app_private.canonical_json_sha256(jsonb_build_object('schema','TEST_PLAN_MANIFEST_V1','id',version_row.id,
    'conditions',version_row.conditions,'method',version_row.method,'repetitions',version_row.repetitions,
    'equipment',coalesce((select jsonb_agg(jsonb_build_object('sequenceNo',e.sequence_no,'name',e.equipment_name) order by e.sequence_no)
      from public.test_plan_equipment e where e.test_plan_version_id=version_row.id),'[]'::jsonb),
    'coverage',coalesce((select jsonb_agg(jsonb_build_object('requirementId',c.requirement_id,'revisionId',c.requirement_revision_id,'kind',c.coverage_kind)
      order by c.requirement_revision_id) from public.test_plan_requirement_coverage c where c.test_plan_version_id=version_row.id),'[]'::jsonb),
    'evidenceTypes',coalesce((select jsonb_agg(e.evidence_type_code order by e.evidence_type_code) from public.test_plan_evidence_requirement e
      where e.test_plan_version_id=version_row.id),'[]'::jsonb))) into actual_checksum;
  if actual_checksum<>target_expected_manifest_checksum then raise exception 'TestPlanVersion manifest checksum mismatch' using errcode='23514'; end if;
  perform set_config('app.m08_seal_test_plan',version_row.id::text,true);
  update public.test_plan_version set state='SEALED',manifest_checksum=actual_checksum,sealed_at=target_occurred_at,
    sealed_by_user_id=app_private.current_effective_actor_user_id() where id=version_row.id;
  perform app_private.append_audit(target_audit_id,'quality.test.manage','TEST_PLAN',version_row.test_plan_id,version_row.version_no,'SUCCEEDED',
    'TEST-PLAN-VERSION-SEALED',null,null,null,null,target_occurred_at);
end $$;

create or replace function public.seal_inspection_checklist_version(
  target_checklist_version_id uuid,target_expected_checksum text,target_audit_id uuid,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare checklist_row public.inspection_checklist_version%rowtype; inspection_row public.inspection%rowtype; weight_sum numeric; actual_checksum text; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'inspection.record.inspect');
  select * into strict checklist_row from public.inspection_checklist_version where id=target_checklist_version_id for update;
  select * into strict inspection_row from public.inspection where id=checklist_row.inspection_id for share;
  if checklist_row.state<>'DRAFT' or not app_private.actor_has_contract_internal_scope(inspection_row.contract_id,target_occurred_at)
    or not exists(select 1 from public.acceptance_score_policy_version p where p.id=checklist_row.policy_version_id and p.state='PUBLISHED'
      and p.valid_from<=target_occurred_at and (p.valid_until is null or p.valid_until>target_occurred_at)) then
    raise exception 'scoped DRAFT checklist and effective published policy required' using errcode='23514';
  end if;
  select sum(c.weight_percent) into weight_sum from public.inspection_criterion c where c.inspection_checklist_version_id=checklist_row.id;
  if weight_sum is distinct from 100::numeric or exists(select 1 from public.inspection_criterion c where c.inspection_checklist_version_id=checklist_row.id
    and not exists(select 1 from public.inspection_criterion_evidence_requirement e where e.inspection_criterion_id=c.id)) then
    raise exception 'checklist weights must equal 100 and every criterion requires typed evidence' using errcode='23514';
  end if;
  select app_private.canonical_json_sha256(jsonb_build_object('schema','INSPECTION_CHECKLIST_V1','id',checklist_row.id,
    'policyVersionId',checklist_row.policy_version_id,'policyChecksum',checklist_row.policy_checksum,
    'criteria',(select jsonb_agg(jsonb_build_object('id',c.id,'code',c.criterion_code,'weight',c.weight_percent,'critical',c.critical,
      'requirementRevisionId',c.requirement_revision_id,'measurementRule',c.measurement_rule,'passRule',c.pass_rule,
      'evidenceTypes',(select jsonb_agg(e.evidence_type_code order by e.evidence_type_code) from public.inspection_criterion_evidence_requirement e
        where e.inspection_criterion_id=c.id)) order by c.sequence_no) from public.inspection_criterion c where c.inspection_checklist_version_id=checklist_row.id)))
    into actual_checksum;
  if actual_checksum<>target_expected_checksum then raise exception 'checklist checksum mismatch' using errcode='23514'; end if;
  perform set_config('app.m08_seal_checklist',checklist_row.id::text,true);
  update public.inspection_checklist_version set state='SEALED',total_weight_percent=weight_sum,checksum=actual_checksum,sealed_at=target_occurred_at,
    sealed_by_user_id=app_private.current_effective_actor_user_id() where id=checklist_row.id;
  perform app_private.append_audit(target_audit_id,'inspection.record.inspect','INSPECTION',checklist_row.inspection_id,checklist_row.version_no,'SUCCEEDED',
    'INSPECTION-CHECKLIST-SEALED',null,null,null,null,target_occurred_at);
end $$;

create or replace function public.record_sealed_test_result(
  target_result_id uuid,target_test_plan_version_id uuid,target_execution_no integer,target_deliverable_version_id uuid,
  target_measurements jsonb,target_evidence jsonb,target_verdict text,target_expected_manifest_checksum text,target_audit_id uuid,target_occurred_at timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare plan_version public.test_plan_version%rowtype; target_project_id uuid; actual_checksum text; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'quality.test.manage');
  select * into strict plan_version from public.test_plan_version where id=target_test_plan_version_id and state='SEALED' for share;
  select p.project_id into strict target_project_id from public.test_plan p where p.id=plan_version.test_plan_id;
  if not app_private.actor_has_project_internal_scope(target_project_id,target_occurred_at)
    or target_verdict not in ('PASS','FAIL','INCONCLUSIVE','UNABLE_TO_VERIFY')
    or jsonb_typeof(target_measurements)<>'array' or jsonb_array_length(target_measurements)=0
    or jsonb_typeof(target_evidence)<>'array' or jsonb_array_length(target_evidence)=0 then
    raise exception 'scoped exact measurements and evidence are required' using errcode='23514';
  end if;
  insert into public.test_result(id,test_plan_id,test_plan_version_id,test_plan_version_no,execution_no,tested_deliverable_version_id,
    state,executed_by_user_id,executed_at)
  values(target_result_id,plan_version.test_plan_id,plan_version.id,plan_version.version_no,target_execution_no,target_deliverable_version_id,
    'DRAFT',app_private.current_effective_actor_user_id(),target_occurred_at);
  perform set_config('app.m08_test_result_command',target_result_id::text,true);
  insert into public.test_measurement(id,test_result_id,test_plan_version_id,requirement_id,requirement_revision_id,sequence_no,observed_value,unit,verdict)
    select x.id,target_result_id,plan_version.id,x.requirement_id,x.requirement_revision_id,x.sequence_no,x.observed_value,x.unit,x.verdict
    from jsonb_to_recordset(target_measurements) x(id uuid,requirement_id uuid,requirement_revision_id uuid,sequence_no integer,
      observed_value text,unit text,verdict text);
  insert into public.test_result_evidence(test_result_id,attachment_id,attachment_row_version,content_checksum,evidence_type_code)
    select target_result_id,x.attachment_id,x.attachment_row_version,x.content_checksum,x.evidence_type_code
    from jsonb_to_recordset(target_evidence) x(attachment_id uuid,attachment_row_version bigint,content_checksum text,evidence_type_code text);
  if exists(select 1 from public.test_plan_requirement_coverage c where c.test_plan_version_id=plan_version.id
      and not exists(select 1 from public.test_measurement m where m.test_result_id=target_result_id and m.requirement_revision_id=c.requirement_revision_id))
    or exists(select 1 from public.test_plan_evidence_requirement e where e.test_plan_version_id=plan_version.id
      and not exists(select 1 from public.test_result_evidence r where r.test_result_id=target_result_id and r.evidence_type_code=e.evidence_type_code)) then
    raise exception 'every exact coverage revision and required evidence type must be recorded' using errcode='23514';
  end if;
  select app_private.canonical_json_sha256(jsonb_build_object('schema','TEST_RESULT_MANIFEST_V1','resultId',target_result_id,
    'testPlanVersionId',plan_version.id,'testPlanChecksum',plan_version.manifest_checksum,'executionNo',target_execution_no,
    'deliverableVersionId',target_deliverable_version_id,'verdict',target_verdict,
    'measurements',(select jsonb_agg(jsonb_build_object('id',m.id,'revisionId',m.requirement_revision_id,'sequenceNo',m.sequence_no,
      'observedValue',m.observed_value,'unit',m.unit,'verdict',m.verdict) order by m.sequence_no) from public.test_measurement m where m.test_result_id=target_result_id),
    'evidence',(select jsonb_agg(jsonb_build_object('attachmentId',e.attachment_id,'rowVersion',e.attachment_row_version,
      'checksum',e.content_checksum,'type',e.evidence_type_code) order by e.attachment_id,e.evidence_type_code)
      from public.test_result_evidence e where e.test_result_id=target_result_id))) into actual_checksum;
  if actual_checksum<>target_expected_manifest_checksum then raise exception 'TestResult canonical manifest checksum mismatch' using errcode='23514'; end if;
  update public.test_result set state='SEALED',verdict=target_verdict,evidence_manifest_checksum=actual_checksum,sealed_at=target_occurred_at
    where id=target_result_id;
  perform app_private.append_audit(target_audit_id,'quality.test.manage','TEST_RESULT',target_result_id,1,'SUCCEEDED','TEST-RESULT-SEALED',
    null,null,actual_checksum,null,target_occurred_at);
  return target_result_id;
end $$;

create or replace function public.begin_inspection_attempt(
  target_inspection_id uuid,target_attempt_id uuid,target_expected_inspection_version bigint,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare inspection_row public.inspection%rowtype; checklist_row public.inspection_checklist_version%rowtype; next_version bigint; next_attempt integer; target_event text; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'inspection.record.inspect');
  select * into strict inspection_row from public.inspection where id=target_inspection_id for update;
  select * into strict checklist_row from public.inspection_checklist_version where id=inspection_row.inspection_checklist_version_id
    and inspection_id=inspection_row.id and state='SEALED' for share;
  if inspection_row.state not in ('SCHEDULED','REINSPECTION_PENDING')
    or not app_private.actor_has_contract_internal_scope(inspection_row.contract_id,target_occurred_at) then
    raise exception 'scheduled scoped Inspection with exact sealed checklist required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(inspection_row.version_no,target_expected_inspection_version);
  next_attempt:=inspection_row.latest_attempt_no+1;
  insert into public.inspection_attempt(id,inspection_id,attempt_no,state,inspection_checklist_version_id,policy_version_id,contract_id,
    contract_milestone_id,deliverable_id,deliverable_version_id,assigned_vendor_id,inspector_user_id,created_at)
  values(target_attempt_id,inspection_row.id,next_attempt,'DRAFT',checklist_row.id,checklist_row.policy_version_id,inspection_row.contract_id,
    inspection_row.contract_milestone_id,inspection_row.deliverable_id,inspection_row.deliverable_version_id,inspection_row.assigned_vendor_id,
    app_private.current_effective_actor_user_id(),target_occurred_at);
  target_event:=case inspection_row.state when 'SCHEDULED' then 'EVT-INSPECTION-START' else 'EVT-INSPECTION-REINSPECT' end;
  update public.inspection set state='IN_PROGRESS',open_attempt_id=target_attempt_id,open_attempt_no=next_attempt,
    version_no=next_version,updated_at=target_occurred_at where id=inspection_row.id;
  perform app_private.append_m08_transition(target_audit_id,target_transition_id,target_outbox_id,'inspection.record.inspect','INSPECTION',inspection_row.id,
    'SM-INSPECTION-V1',target_event,'INSPECTION_EVENT_REF',inspection_row.state,'IN_PROGRESS',inspection_row.version_no,next_version,null,target_occurred_at);
  return next_version;
end $$;

create or replace function public.request_inspection(
  target_inspection_id uuid,target_inspection_no text,target_inspection_type_code text,target_contract_id uuid,target_milestone_id uuid,
  target_deliverable_id uuid,target_deliverable_version_id uuid,target_checklist_version_id uuid,target_score_policy_version_id uuid,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare deliverable_row public.deliverable%rowtype; policy_row public.acceptance_score_policy_version%rowtype; begin
  select * into strict deliverable_row from public.deliverable where id=target_deliverable_id and contract_id=target_contract_id
    and contract_milestone_id=target_milestone_id for share;
  perform app_private.m08_assert_inspection_requester(target_inspection_id,target_contract_id,deliverable_row.assigned_vendor_id,target_occurred_at);
  select * into strict policy_row from public.acceptance_score_policy_version where id=target_score_policy_version_id and state='PUBLISHED'
    and valid_from<=target_occurred_at and (valid_until is null or valid_until>target_occurred_at) for share;
  if not exists(select 1 from public.deliverable_version v where v.id=target_deliverable_version_id and v.deliverable_id=deliverable_row.id) then
    raise exception 'exact DeliverableVersion required' using errcode='23514';
  end if;
  insert into public.inspection(id,inspection_no,inspection_type_code,contract_id,contract_milestone_id,deliverable_id,deliverable_version_id,
    assigned_vendor_id,inspection_checklist_version_id,state,version_no,created_at,updated_at)
  values(target_inspection_id,target_inspection_no,target_inspection_type_code,target_contract_id,target_milestone_id,target_deliverable_id,
    target_deliverable_version_id,deliverable_row.assigned_vendor_id,target_checklist_version_id,'REQUESTED',1,target_occurred_at,target_occurred_at);
  insert into public.inspection_checklist_version(id,inspection_id,version_no,policy_version_id,policy_id,policy_version_no,policy_checksum,state)
  values(target_checklist_version_id,target_inspection_id,1,policy_row.id,policy_row.policy_id,policy_row.version_no,policy_row.checksum,'DRAFT');
  perform app_private.append_m08_transition(target_audit_id,target_transition_id,target_outbox_id,'inspection.record.request','INSPECTION',target_inspection_id,
    'SM-INSPECTION-V1','EVT-INSPECTION-REQUEST','INSPECTION_EVENT_REF',null,'REQUESTED',null,1,null,target_occurred_at);
  return target_inspection_id;
end $$;

create or replace function public.schedule_inspection(
  target_inspection_id uuid,target_scheduled_at timestamptz,target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare inspection_row public.inspection%rowtype; next_version bigint; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'inspection.record.inspect');
  select * into strict inspection_row from public.inspection where id=target_inspection_id for update;
  if inspection_row.state<>'REQUESTED' or target_scheduled_at is null
    or not app_private.actor_has_contract_internal_scope(inspection_row.contract_id,target_occurred_at)
    or not exists(select 1 from public.inspection_checklist_version c where c.id=inspection_row.inspection_checklist_version_id and c.state='SEALED') then
    raise exception 'REQUESTED scoped Inspection with sealed checklist and future schedule required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(inspection_row.version_no,target_expected_version);
  update public.inspection set state='SCHEDULED',scheduled_at=target_scheduled_at,version_no=next_version,updated_at=target_occurred_at where id=inspection_row.id;
  perform app_private.append_m08_transition(target_audit_id,target_transition_id,target_outbox_id,'inspection.record.inspect','INSPECTION',inspection_row.id,
    'SM-INSPECTION-V1','EVT-INSPECTION-SCHEDULE','INSPECTION_EVENT_REF','REQUESTED','SCHEDULED',inspection_row.version_no,next_version,null,target_occurred_at);
  return next_version;
end $$;

create or replace function public.submit_inspection_decision(
  target_inspection_id uuid,target_attempt_id uuid,target_expected_inspection_version bigint,target_evidence jsonb,target_results jsonb,
  target_portions jsonb,target_residuals jsonb,target_expected_checksum text,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare inspection_row public.inspection%rowtype; attempt_row public.inspection_attempt%rowtype; checklist_row public.inspection_checklist_version%rowtype;
  policy_row public.acceptance_score_policy_version%rowtype; weighted_score numeric; rounded_score numeric; final_disposition text; actual_checksum text; next_version bigint; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'inspection.record.inspect');
  select * into strict inspection_row from public.inspection where id=target_inspection_id for update;
  select * into strict attempt_row from public.inspection_attempt where id=target_attempt_id and inspection_id=inspection_row.id for update;
  select * into strict checklist_row from public.inspection_checklist_version where id=attempt_row.inspection_checklist_version_id and state='SEALED' for share;
  select * into strict policy_row from public.acceptance_score_policy_version where id=checklist_row.policy_version_id and state='PUBLISHED' for share;
  if inspection_row.state<>'IN_PROGRESS' or inspection_row.open_attempt_id<>attempt_row.id or attempt_row.state<>'DRAFT'
    or attempt_row.inspector_user_id<>app_private.current_effective_actor_user_id()
    or not app_private.actor_has_contract_internal_scope(inspection_row.contract_id,target_occurred_at)
    or jsonb_typeof(target_evidence)<>'array' or jsonb_array_length(target_evidence)=0 or jsonb_typeof(target_results)<>'array' then
    raise exception 'exact open DRAFT attempt, inspector and evidence payload required' using errcode='23514';
  end if;
  insert into public.inspection_evidence(id,inspection_id,attachment_id,attachment_row_version,content_checksum,evidence_type_code,created_at)
    select x.id,inspection_row.id,x.attachment_id,x.attachment_row_version,x.content_checksum,x.evidence_type_code,target_occurred_at
    from jsonb_to_recordset(target_evidence) x(id uuid,attachment_id uuid,attachment_row_version bigint,content_checksum text,evidence_type_code text);
  insert into public.inspection_attempt_evidence(inspection_attempt_id,inspection_id,inspection_evidence_id)
    select attempt_row.id,inspection_row.id,x.id from jsonb_to_recordset(target_evidence) x(id uuid);
  insert into public.inspection_criterion_result(id,inspection_attempt_id,inspection_checklist_version_id,inspection_criterion_id,
    requirement_id,requirement_revision_id,achieved_percent,verdict,observed_value)
    select (item->>'id')::uuid,attempt_row.id,checklist_row.id,c.id,c.requirement_id,c.requirement_revision_id,
      (item->>'achieved_percent')::numeric,item->>'verdict',item->>'observed_value'
    from jsonb_array_elements(target_results) item join public.inspection_criterion c on c.id=(item->>'criterion_id')::uuid
      and c.inspection_checklist_version_id=checklist_row.id;
  insert into public.inspection_criterion_result_evidence(inspection_criterion_result_id,inspection_attempt_id,inspection_id,inspection_evidence_id)
    select (item->>'id')::uuid,attempt_row.id,inspection_row.id,(e.value#>>'{}')::uuid
    from jsonb_array_elements(target_results) item cross join lateral jsonb_array_elements(item->'evidence_ids') e;
  insert into public.inspection_partial_usable_portion(id,inspection_attempt_id,portion_code,description,deliverable_version_id)
    select (item->>'id')::uuid,attempt_row.id,item->>'portion_code',item->>'description',attempt_row.deliverable_version_id
    from jsonb_array_elements(coalesce(target_portions,'[]'::jsonb)) item;
  insert into public.inspection_partial_usable_portion_evidence(usable_portion_id,inspection_attempt_id,inspection_id,inspection_evidence_id)
    select (item->>'id')::uuid,attempt_row.id,inspection_row.id,(e.value#>>'{}')::uuid
    from jsonb_array_elements(coalesce(target_portions,'[]'::jsonb)) item cross join lateral jsonb_array_elements(item->'evidence_ids') e;
  insert into public.inspection_residual_condition(id,inspection_attempt_id,condition_code,description,due_at)
    select (item->>'id')::uuid,attempt_row.id,item->>'condition_code',item->>'description',(item->>'due_at')::timestamptz
    from jsonb_array_elements(coalesce(target_residuals,'[]'::jsonb)) item;
  insert into public.inspection_residual_condition_evidence(residual_condition_id,inspection_attempt_id,inspection_id,inspection_evidence_id)
    select (item->>'id')::uuid,attempt_row.id,inspection_row.id,(e.value#>>'{}')::uuid
    from jsonb_array_elements(coalesce(target_residuals,'[]'::jsonb)) item cross join lateral jsonb_array_elements(item->'evidence_ids') e;
  if (select count(*) from public.inspection_criterion c where c.inspection_checklist_version_id=checklist_row.id)<>
      (select count(*) from public.inspection_criterion_result r where r.inspection_attempt_id=attempt_row.id)
    or exists(select 1 from public.inspection_criterion c where c.inspection_checklist_version_id=checklist_row.id and not exists(
      select 1 from public.inspection_criterion_result r where r.inspection_attempt_id=attempt_row.id and r.inspection_criterion_id=c.id))
    or exists(select 1 from public.inspection_criterion_result r join public.inspection_criterion_evidence_requirement q
      on q.inspection_criterion_id=r.inspection_criterion_id where r.inspection_attempt_id=attempt_row.id and not exists(
        select 1 from public.inspection_criterion_result_evidence re join public.inspection_evidence e on e.id=re.inspection_evidence_id
        where re.inspection_criterion_result_id=r.id and e.evidence_type_code=q.evidence_type_code)) then
    raise exception 'every exact criterion and required evidence type must be satisfied' using errcode='23514';
  end if;
  select sum(c.weight_percent*r.achieved_percent/100) into weighted_score from public.inspection_criterion_result r
    join public.inspection_criterion c on c.id=r.inspection_criterion_id where r.inspection_attempt_id=attempt_row.id;
  rounded_score:=case policy_row.rounding_mode when 'DOWN' then trunc(weighted_score,policy_row.rounding_decimal_places)
    else round(weighted_score,policy_row.rounding_decimal_places) end;
  if exists(select 1 from public.inspection_criterion_result r where r.inspection_attempt_id=attempt_row.id and r.verdict='UNABLE_TO_VERIFY') then
    final_disposition:='UNABLE_TO_VERIFY';
  else
    select b.disposition into strict final_disposition from public.acceptance_score_policy_band b where b.policy_version_id=policy_row.id
      and rounded_score>=b.minimum_achievement_inclusive and (b.maximum_achievement_exclusive is null or rounded_score<b.maximum_achievement_exclusive);
  end if;
  insert into public.inspection_attempt_critical_failure(inspection_attempt_id,inspection_checklist_version_id,inspection_criterion_id)
    select attempt_row.id,checklist_row.id,c.id from public.inspection_criterion c join public.inspection_criterion_result r
      on r.inspection_criterion_id=c.id and r.inspection_attempt_id=attempt_row.id where c.critical and r.verdict<>'PASS';
  if exists(select 1 from public.inspection_attempt_critical_failure f where f.inspection_attempt_id=attempt_row.id)
    and final_disposition not in ('REJECTED','UNABLE_TO_VERIFY') then
    final_disposition:=case when exists(select 1 from public.inspection_partial_usable_portion p where p.inspection_attempt_id=attempt_row.id)
      then 'PARTIAL_ACCEPTANCE' else 'CORRECTION_REQUESTED' end;
  end if;
  if (final_disposition='PARTIAL_ACCEPTANCE' and not exists(select 1 from public.inspection_partial_usable_portion p where p.inspection_attempt_id=attempt_row.id))
    or (final_disposition='CONDITIONAL_ACCEPTANCE' and not exists(select 1 from public.inspection_residual_condition c where c.inspection_attempt_id=attempt_row.id))
    or (final_disposition='CONDITIONAL_ACCEPTANCE' and exists(select 1 from public.inspection_residual_condition c
      where c.inspection_attempt_id=attempt_row.id and c.due_at is null))
    or exists(select 1 from public.inspection_partial_usable_portion p where p.inspection_attempt_id=attempt_row.id and not exists(
      select 1 from public.inspection_partial_usable_portion_evidence e where e.usable_portion_id=p.id))
    or exists(select 1 from public.inspection_residual_condition c where c.inspection_attempt_id=attempt_row.id and not exists(
      select 1 from public.inspection_residual_condition_evidence e where e.residual_condition_id=c.id)) then
    raise exception 'partial/residual acceptance basis and exact evidence are incomplete' using errcode='23514';
  end if;
  select app_private.canonical_json_sha256(jsonb_build_object('schema','INSPECTION_ATTEMPT_V1','attemptId',attempt_row.id,
    'inspectionId',inspection_row.id,'attemptNo',attempt_row.attempt_no,'checklistId',checklist_row.id,'checklistChecksum',checklist_row.checksum,
    'policyVersionId',policy_row.id,'contractId',attempt_row.contract_id,'milestoneId',attempt_row.contract_milestone_id,
    'deliverableVersionId',attempt_row.deliverable_version_id,'disposition',final_disposition,'achievement',rounded_score,
    'results',(select jsonb_agg(jsonb_build_object('id',r.id,'criterionId',r.inspection_criterion_id,'revisionId',r.requirement_revision_id,
      'achievement',r.achieved_percent,'verdict',r.verdict,'observed',r.observed_value,
      'evidenceIds',(select jsonb_agg(re.inspection_evidence_id order by re.inspection_evidence_id)
        from public.inspection_criterion_result_evidence re where re.inspection_criterion_result_id=r.id)) order by c.sequence_no)
      from public.inspection_criterion_result r join public.inspection_criterion c on c.id=r.inspection_criterion_id where r.inspection_attempt_id=attempt_row.id),
    'evidence',(select jsonb_agg(jsonb_build_object('id',e.id,'attachmentId',e.attachment_id,'rowVersion',e.attachment_row_version,
      'checksum',e.content_checksum,'type',e.evidence_type_code) order by e.id) from public.inspection_evidence e join public.inspection_attempt_evidence ae
      on ae.inspection_evidence_id=e.id where ae.inspection_attempt_id=attempt_row.id),
    'portions',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'code',p.portion_code,'description',p.description,
      'deliverableVersionId',p.deliverable_version_id,'evidenceIds',(select jsonb_agg(pe.inspection_evidence_id order by pe.inspection_evidence_id)
        from public.inspection_partial_usable_portion_evidence pe where pe.usable_portion_id=p.id)) order by p.id)
      from public.inspection_partial_usable_portion p where p.inspection_attempt_id=attempt_row.id),'[]'::jsonb),
    'residuals',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'code',c.condition_code,'description',c.description,'dueAt',c.due_at,
      'evidenceIds',(select jsonb_agg(ce.inspection_evidence_id order by ce.inspection_evidence_id)
        from public.inspection_residual_condition_evidence ce where ce.residual_condition_id=c.id)) order by c.id)
      from public.inspection_residual_condition c where c.inspection_attempt_id=attempt_row.id),'[]'::jsonb))) into actual_checksum;
  if actual_checksum<>target_expected_checksum then raise exception 'InspectionAttempt canonical checksum mismatch' using errcode='23514'; end if;
  perform set_config('app.m08_seal_attempt',attempt_row.id::text,true);
  update public.inspection_attempt set state='SEALED',disposition=final_disposition,achievement_percent=rounded_score,
    checksum=actual_checksum,sealed_at=target_occurred_at where id=attempt_row.id;
  next_version:=app_private.next_version(inspection_row.version_no,target_expected_inspection_version);
  update public.inspection set state='DECISION_PENDING',open_attempt_id=null,open_attempt_no=null,latest_sealed_attempt_id=attempt_row.id,
    latest_attempt_no=attempt_row.attempt_no,version_no=next_version,updated_at=target_occurred_at where id=inspection_row.id;
  perform app_private.append_m08_transition(target_audit_id,target_transition_id,target_outbox_id,'inspection.record.inspect','INSPECTION',inspection_row.id,
    'SM-INSPECTION-V1','EVT-INSPECTION-SUBMIT-DECISION','INSPECTION_EVENT_REF','IN_PROGRESS','DECISION_PENDING',
    inspection_row.version_no,next_version,null,target_occurred_at);
  return next_version;
end $$;

create or replace function app_private.m08_assert_worker(target_occurred_at timestamptz,target_system_actor text)
returns void language plpgsql stable security definer set search_path=pg_catalog,app_private
as $$ begin
  if target_occurred_at is distinct from app_private.request_time()
    or app_private.required_setting('app.actor_kind')<>'SYSTEM'
    or app_private.required_setting('app.system_actor_id')<>target_system_actor then
    raise exception 'exact trusted M08 worker required' using errcode='42501';
  end if;
end $$;

create or replace function public.calculate_acceptance_payment_decision(
  target_decision_id uuid,target_decision_root_id uuid,target_revision_no bigint,target_previous_decision_id uuid,
  target_inspection_attempt_id uuid,target_policy_version_id uuid,target_strengthened_risk boolean,target_risk_basis_reference text,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions
as $$ declare attempt_row public.inspection_attempt%rowtype; inspection_row public.inspection%rowtype; policy_row public.acceptance_payment_policy_version%rowtype;
  milestone_row public.contract_milestone%rowtype; rate_rule public.acceptance_payment_rate_rule%rowtype; proposed_rate numeric(9,6); begin
  perform app_private.m08_assert_worker(target_occurred_at,'QUALITY_PAYMENT_ENGINE');
  select * into strict attempt_row from public.inspection_attempt where id=target_inspection_attempt_id and state='SEALED' for share;
  select * into strict inspection_row from public.inspection where id=attempt_row.inspection_id and state='COMPLETED'
    and latest_sealed_attempt_id=attempt_row.id and latest_attempt_no=attempt_row.attempt_no for share;
  if attempt_row.disposition not in ('ACCEPTED','CONDITIONAL_ACCEPTANCE','PARTIAL_ACCEPTANCE','REJECTED') then
    raise exception 'terminal acceptance disposition required' using errcode='23514';
  end if;
  select * into strict policy_row from public.acceptance_payment_policy_version where id=target_policy_version_id and state='PUBLISHED'
    and score_policy_version_id=attempt_row.policy_version_id
    and valid_from<=target_occurred_at and (valid_until is null or valid_until>target_occurred_at) for share;
  select * into strict milestone_row from public.contract_milestone where id=attempt_row.contract_milestone_id for share;
  select * into strict rate_rule from public.acceptance_payment_rate_rule r where r.policy_version_id=policy_row.id
    and r.disposition=attempt_row.disposition and attempt_row.achievement_percent>=r.minimum_achievement_inclusive
    and (r.maximum_achievement_exclusive is null or attempt_row.achievement_percent<r.maximum_achievement_exclusive);
  proposed_rate:=case rate_rule.proposed_rate_kind when 'ZERO' then 0 when 'ACHIEVEMENT_PERCENT' then attempt_row.achievement_percent else rate_rule.proposed_fixed_rate end;
  insert into public.acceptance_payment_decision(id,decision_root_id,revision_no,previous_decision_id,inspection_attempt_id,inspection_id,
    inspection_attempt_no,inspection_attempt_checksum,inspection_attempt_sealed_at,contract_id,contract_milestone_id,deliverable_id,deliverable_version_id,
    disposition,achievement_percent,policy_version_id,policy_id,policy_version_no,policy_checksum,strengthened_risk_snapshot,risk_basis_reference,milestone_amount,currency,
    calculated_proposed_rate,state,version_no,created_at,updated_at)
  values(target_decision_id,target_decision_root_id,target_revision_no,target_previous_decision_id,attempt_row.id,attempt_row.inspection_id,
    attempt_row.attempt_no,attempt_row.checksum,attempt_row.sealed_at,attempt_row.contract_id,attempt_row.contract_milestone_id,
    attempt_row.deliverable_id,attempt_row.deliverable_version_id,attempt_row.disposition,attempt_row.achievement_percent,
    policy_row.id,policy_row.policy_id,policy_row.version_no,policy_row.checksum,target_strengthened_risk,target_risk_basis_reference,
    milestone_row.planned_amount,milestone_row.currency,
    proposed_rate,'CALCULATED',1,target_occurred_at,target_occurred_at);
  insert into public.acceptance_payment_residual_condition(id,acceptance_payment_decision_id,inspection_residual_condition_id,inspection_attempt_id,state)
    select extensions.gen_random_uuid(),target_decision_id,c.id,attempt_row.id,'OPEN' from public.inspection_residual_condition c where c.inspection_attempt_id=attempt_row.id;
  insert into public.acceptance_payment_usable_portion(id,acceptance_payment_decision_id,inspection_usable_portion_id,inspection_attempt_id,release_eligible)
    select extensions.gen_random_uuid(),target_decision_id,p.id,attempt_row.id,false from public.inspection_partial_usable_portion p where p.inspection_attempt_id=attempt_row.id;
  perform app_private.append_m08_transition(target_audit_id,target_transition_id,target_outbox_id,'acceptance_payment.record.manage',
    'ACCEPTANCE_PAYMENT_DECISION',target_decision_id,'SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-CALCULATE',
    'ACCEPTANCE_PAYMENT_EVENT_REF',null,'CALCULATED',null,1,'VERSIONED-POLICY-CALCULATION',target_occurred_at);
end $$;

create or replace function app_private.protect_residual_condition_satisfaction()
returns trigger language plpgsql set search_path=pg_catalog,app_private
as $$ begin
  if tg_op='DELETE' or app_private.optional_setting('app.m08_residual_command') is distinct from old.id::text
    or old.state<>'OPEN' or new.state<>'SATISFIED' or new.id<>old.id or new.acceptance_payment_decision_id<>old.acceptance_payment_decision_id
    or new.inspection_residual_condition_id<>old.inspection_residual_condition_id or new.inspection_attempt_id<>old.inspection_attempt_id then
    raise exception 'residual condition is immutable except exact evidence-backed satisfaction' using errcode='55000';
  end if;
  return new;
end $$;
create trigger acceptance_payment_residual_protected before update or delete on public.acceptance_payment_residual_condition
  for each row execute function app_private.protect_residual_condition_satisfaction();
create trigger acceptance_payment_residual_evidence_immutable before update or delete on public.acceptance_payment_residual_condition_evidence
  for each row execute function app_private.reject_m08_immutable();
create or replace function app_private.protect_payment_usable_portion()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if tg_op='DELETE' or app_private.optional_setting('app.m08_payment_command') is distinct from old.acceptance_payment_decision_id::text
    or new.id<>old.id or new.acceptance_payment_decision_id<>old.acceptance_payment_decision_id
    or new.inspection_usable_portion_id<>old.inspection_usable_portion_id or new.inspection_attempt_id<>old.inspection_attempt_id
    or not exists(select 1 from public.acceptance_payment_decision d where d.id=old.acceptance_payment_decision_id and d.state='APPROVED') then
    raise exception 'usable portion basis is immutable except trusted release assessment' using errcode='55000';
  end if;
  return new;
end $$;
create trigger acceptance_payment_usable_portion_protected before update or delete on public.acceptance_payment_usable_portion
  for each row execute function app_private.protect_payment_usable_portion();

create or replace function public.satisfy_acceptance_payment_condition(
  target_condition_id uuid,target_expected_decision_version bigint,target_evidence_ids uuid[],target_reason text,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare condition_row public.acceptance_payment_residual_condition%rowtype; decision_row public.acceptance_payment_decision%rowtype; next_version bigint; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'acceptance_payment.record.release');
  select * into strict condition_row from public.acceptance_payment_residual_condition where id=target_condition_id for update;
  select * into strict decision_row from public.acceptance_payment_decision where id=condition_row.acceptance_payment_decision_id for update;
  if condition_row.state<>'OPEN' or decision_row.state<>'HELD_FOR_CONDITIONS'
    or not app_private.actor_has_contract_internal_scope(decision_row.contract_id,target_occurred_at)
    or target_evidence_ids is null or cardinality(target_evidence_ids)=0 then
    raise exception 'open scoped held condition and satisfaction evidence required' using errcode='23514';
  end if;
  if exists(select 1 from unnest(target_evidence_ids) e(id) where not exists(select 1 from public.inspection_evidence i
      where i.id=e.id and i.inspection_id=decision_row.inspection_id)) then
    raise exception 'satisfaction evidence must belong to the exact Inspection' using errcode='23514';
  end if;
  next_version:=app_private.next_version(decision_row.version_no,target_expected_decision_version);
  insert into public.acceptance_payment_residual_condition_evidence(acceptance_payment_residual_condition_id,acceptance_payment_decision_id,inspection_id,inspection_evidence_id)
    select condition_row.id,decision_row.id,decision_row.inspection_id,e.id from unnest(target_evidence_ids) e(id);
  perform set_config('app.m08_residual_command',condition_row.id::text,true);
  update public.acceptance_payment_residual_condition set state='SATISFIED',satisfied_at=target_occurred_at,
    satisfied_by_user_id=app_private.current_effective_actor_user_id() where id=condition_row.id;
  perform set_config('app.m08_payment_command',decision_row.id::text,true);
  update public.acceptance_payment_decision set version_no=next_version,updated_at=target_occurred_at where id=decision_row.id;
  perform app_private.append_m08_transition(target_audit_id,target_transition_id,target_outbox_id,'acceptance_payment.record.release',
    'ACCEPTANCE_PAYMENT_DECISION',decision_row.id,'SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-CONDITION-SATISFY',
    'ACCEPTANCE_PAYMENT_EVENT_REF','HELD_FOR_CONDITIONS','HELD_FOR_CONDITIONS',decision_row.version_no,next_version,target_reason,target_occurred_at);
  return next_version;
end $$;

create or replace function public.append_inspection_evidence(
  target_inspection_id uuid,target_evidence_id uuid,target_attachment_id uuid,target_attachment_row_version bigint,
  target_content_checksum text,target_evidence_type_code text,target_audit_id uuid,target_occurred_at timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare inspection_row public.inspection%rowtype; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'acceptance_payment.record.release');
  select * into strict inspection_row from public.inspection where id=target_inspection_id for share;
  if not app_private.actor_has_contract_internal_scope(inspection_row.contract_id,target_occurred_at) then
    raise exception 'exact internal Contract Scope required for post-seal evidence' using errcode='42501';
  end if;
  perform 1 from public.attachment a where a.id=target_attachment_id and a.state='AVAILABLE'
    and a.row_version=target_attachment_row_version and a.detected_sha256=target_content_checksum
    and a.verified_at is not null and a.scanned_at is not null and a.scan_verdict='CLEAN'
    and a.signature_validation='MATCH' for share;
  if not found then
    raise exception 'post-seal evidence requires exact AVAILABLE scanned Attachment snapshot' using errcode='23514';
  end if;
  insert into public.inspection_evidence(id,inspection_id,attachment_id,attachment_row_version,content_checksum,evidence_type_code,created_at)
    values(target_evidence_id,target_inspection_id,target_attachment_id,target_attachment_row_version,target_content_checksum,target_evidence_type_code,target_occurred_at);
  perform app_private.append_audit(target_audit_id,'acceptance_payment.record.release','INSPECTION',target_inspection_id,null,'SUCCEEDED',
    'POST-SEAL-RESIDUAL-EVIDENCE-APPENDED',null,null,target_content_checksum,null,target_occurred_at);
  return target_evidence_id;
end $$;

create or replace function public.mark_acceptance_payment_eligible(
  target_decision_id uuid,target_expected_version bigint,target_reason text,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare decision_row public.acceptance_payment_decision%rowtype; next_version bigint; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'acceptance_payment.record.release');
  if not app_private.actor_has_permission('contract.detail.finance.read',target_occurred_at)
    or not app_private.actor_has_permission('acceptance_payment.finance.read',target_occurred_at) then
    raise exception 'separate finance permissions required' using errcode='42501';
  end if;
  select * into strict decision_row from public.acceptance_payment_decision where id=target_decision_id for update;
  if decision_row.state not in ('APPROVED','HELD_FOR_CONDITIONS')
    or not app_private.actor_has_contract_internal_scope(decision_row.contract_id,target_occurred_at)
    or exists(select 1 from public.acceptance_payment_residual_condition c where c.acceptance_payment_decision_id=decision_row.id and c.state='OPEN')
    or (decision_row.disposition='PARTIAL_ACCEPTANCE' and exists(select 1 from public.acceptance_payment_usable_portion p
      where p.acceptance_payment_decision_id=decision_row.id and not p.release_eligible)) then
    raise exception 'approved scoped decision with all residual conditions satisfied required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(decision_row.version_no,target_expected_version);
  perform set_config('app.m08_payment_command',decision_row.id::text,true);
  update public.acceptance_payment_decision set state='ELIGIBLE_FOR_EXTERNAL_PAYMENT',held_amount=0,unpaid_remainder=0,
    version_no=next_version,updated_at=target_occurred_at
    where id=decision_row.id;
  perform app_private.append_m08_transition(target_audit_id,target_transition_id,target_outbox_id,'acceptance_payment.record.release',
    'ACCEPTANCE_PAYMENT_DECISION',decision_row.id,'SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-ELIGIBLE',
    'ACCEPTANCE_PAYMENT_EVENT_REF',decision_row.state,'ELIGIBLE_FOR_EXTERNAL_PAYMENT',decision_row.version_no,next_version,target_reason,target_occurred_at);
  return next_version;
end $$;

create or replace function public.hold_acceptance_payment_for_conditions(
  target_decision_id uuid,target_expected_version bigint,target_held_amount numeric,target_unpaid_remainder numeric,
  target_release_eligible_portion_ids uuid[],target_reason text,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare decision_row public.acceptance_payment_decision%rowtype; next_version bigint; begin
  perform app_private.m08_assert_worker(target_occurred_at,'QUALITY_PAYMENT_ENGINE');
  select * into strict decision_row from public.acceptance_payment_decision where id=target_decision_id for update;
  if decision_row.state<>'APPROVED' or decision_row.disposition not in ('CONDITIONAL_ACCEPTANCE','PARTIAL_ACCEPTANCE')
    or target_held_amount<0 or target_held_amount>decision_row.approved_payable_amount or target_unpaid_remainder<>target_held_amount
    or (decision_row.disposition='CONDITIONAL_ACCEPTANCE' and not exists(select 1 from public.acceptance_payment_residual_condition c
      where c.acceptance_payment_decision_id=decision_row.id))
    or (decision_row.disposition='PARTIAL_ACCEPTANCE' and not exists(select 1 from public.acceptance_payment_usable_portion p
      where p.acceptance_payment_decision_id=decision_row.id)) then
    raise exception 'exact conditional/partial basis and same-currency held remainder required' using errcode='23514';
  end if;
  if exists(select 1 from unnest(coalesce(target_release_eligible_portion_ids,array[]::uuid[])) p(id) where not exists(
    select 1 from public.acceptance_payment_usable_portion u where u.id=p.id and u.acceptance_payment_decision_id=decision_row.id)) then
    raise exception 'release portion must belong to exact decision and sealed attempt' using errcode='23514';
  end if;
  next_version:=app_private.next_version(decision_row.version_no,target_expected_version);
  perform set_config('app.m08_payment_command',decision_row.id::text,true);
  update public.acceptance_payment_usable_portion set release_eligible=(id=any(coalesce(target_release_eligible_portion_ids,array[]::uuid[])))
    where acceptance_payment_decision_id=decision_row.id;
  update public.acceptance_payment_decision set state='HELD_FOR_CONDITIONS',held_amount=target_held_amount,
    unpaid_remainder=target_unpaid_remainder,version_no=next_version,updated_at=target_occurred_at where id=decision_row.id;
  perform app_private.append_m08_transition(target_audit_id,target_transition_id,target_outbox_id,'acceptance_payment.record.release',
    'ACCEPTANCE_PAYMENT_DECISION',decision_row.id,'SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-HOLD',
    'ACCEPTANCE_PAYMENT_EVENT_REF','APPROVED','HELD_FOR_CONDITIONS',decision_row.version_no,next_version,target_reason,target_occurred_at);
  return next_version;
end $$;

create or replace function public.bind_acceptance_payment_approval_subject(
  target_decision_id uuid,target_instance_id uuid,target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare decision_row public.acceptance_payment_decision%rowtype; next_version bigint; snapshot_checksum text; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'acceptance_payment.record.manage');
  select * into strict decision_row from public.acceptance_payment_decision where id=target_decision_id for update;
  if decision_row.state not in ('CALCULATED','ADJUSTMENT_PROPOSED')
    or not app_private.actor_has_contract_internal_scope(decision_row.contract_id,target_occurred_at)
    or not exists(select 1 from public.vendor_contract c where c.id=decision_row.contract_id and c.manager_user_id=app_private.current_effective_actor_user_id())
    or not exists(select 1 from public.approval_instance i where i.id=target_instance_id and i.state='DRAFT'
      and i.submitter_user_id=app_private.current_effective_actor_user_id()
      and exists(select 1 from public.approval_policy_version pv join public.approval_policy_acceptance_payment_selector s
        on s.policy_version_id=pv.id where pv.id=i.policy_version_id and pv.version_no=i.policy_version_no
          and pv.checksum=i.policy_checksum_snapshot and pv.state='PUBLISHED' and pv.subject_kind='ACCEPTANCE_PAYMENT_DECISION'
          and s.currency=decision_row.currency and decision_row.milestone_amount>=s.minimum_milestone_amount_inclusive
          and (s.maximum_milestone_amount_exclusive is null or decision_row.milestone_amount<s.maximum_milestone_amount_exclusive)
          and s.strengthened_risk_required=decision_row.strengthened_risk_snapshot
          and (not exists(select 1 from public.payment_rate_adjustment a where a.acceptance_payment_decision_id=decision_row.id and a.direction='UPWARD')
            or s.covers_upward_adjustment)
          and s.selector_checksum=app_private.canonical_json_sha256(jsonb_build_object('schema','ACCEPTANCE_PAYMENT_APPROVAL_SELECTOR_V1',
            'policyVersionId',s.policy_version_id,'minimumAmount',s.minimum_milestone_amount_inclusive,
            'maximumAmount',s.maximum_milestone_amount_exclusive,'currency',s.currency,
            'strengthenedRiskRequired',s.strengthened_risk_required,'representativeMode',s.representative_completion_mode,
            'coversUpwardAdjustment',s.covers_upward_adjustment))
          and (select count(*) from public.approval_policy_step_rule sr where sr.policy_version_id=pv.id)
            =(case s.representative_completion_mode when 'NONE' then 1 else 2 end)
          and exists(select 1 from public.approval_policy_step_rule sr
            where sr.policy_version_id=pv.id and sr.sequence_no=1 and sr.step_role='APPROVAL'
              and sr.completion_mode='SEQUENTIAL' and sr.required
              and (select count(*) from public.approval_policy_participant_rule pr join public.position p on p.id=pr.position_id
                where pr.step_rule_id=sr.id and pr.selector_kind='POSITION' and pr.required_for_completion
                  and p.stable_code='POSITION_LAB_DIRECTOR')=1
              and (select count(*) from public.approval_policy_participant_rule pr where pr.step_rule_id=sr.id)=1)
          and ((s.representative_completion_mode='NONE' and not exists(select 1 from public.approval_policy_step_rule sr
                  join public.approval_policy_participant_rule pr on pr.step_rule_id=sr.id
                  join public.position p on p.id=pr.position_id and p.stable_code='POSITION_REPRESENTATIVE'
                  where sr.policy_version_id=pv.id))
            or (s.representative_completion_mode in ('ANY_ONE','ALL') and exists(select 1 from public.approval_policy_step_rule sr
                  where sr.policy_version_id=pv.id and sr.sequence_no=2 and sr.step_role='APPROVAL'
                    and sr.completion_mode=s.representative_completion_mode and sr.required
                    and (select count(*) from public.approval_policy_participant_rule pr join public.position p on p.id=pr.position_id
                      where pr.step_rule_id=sr.id and pr.selector_kind='POSITION' and pr.required_for_completion
                        and p.stable_code='POSITION_REPRESENTATIVE')=1
                    and (select count(*) from public.approval_policy_participant_rule pr where pr.step_rule_id=sr.id)=1))))) then
    raise exception 'owned DRAFT Approval and scoped payment decision required' using errcode='42501';
  end if;
  if (select count(*) from public.approval_policy_version candidate
      join public.approval_policy candidate_policy on candidate_policy.id=candidate.policy_id and candidate_policy.status='ACTIVE'
      join public.approval_policy_acceptance_payment_selector selector on selector.policy_version_id=candidate.id
      where candidate.state='PUBLISHED' and candidate.subject_kind='ACCEPTANCE_PAYMENT_DECISION'
        and candidate.valid_from<=target_occurred_at and (candidate.valid_until is null or candidate.valid_until>target_occurred_at)
        and selector.currency=decision_row.currency
        and decision_row.milestone_amount>=selector.minimum_milestone_amount_inclusive
        and (selector.maximum_milestone_amount_exclusive is null or decision_row.milestone_amount<selector.maximum_milestone_amount_exclusive)
        and selector.strengthened_risk_required=decision_row.strengthened_risk_snapshot
        and (not exists(select 1 from public.payment_rate_adjustment a where a.acceptance_payment_decision_id=decision_row.id and a.direction='UPWARD')
          or selector.covers_upward_adjustment))<>1 then
    raise exception 'amount/risk/upward-adjustment Approval selector must resolve exactly one effective policy' using errcode='23514';
  end if;
  next_version:=app_private.next_version(decision_row.version_no,target_expected_version);
  select app_private.canonical_json_sha256(jsonb_build_object('schema','ACCEPTANCE_PAYMENT_DECISION_V1','decisionId',decision_row.id,
    'decisionRootId',decision_row.decision_root_id,'revisionNo',decision_row.revision_no,'inspectionAttemptId',decision_row.inspection_attempt_id,
    'inspectionAttemptChecksum',decision_row.inspection_attempt_checksum,'contractId',decision_row.contract_id,'milestoneId',decision_row.contract_milestone_id,
    'deliverableVersionId',decision_row.deliverable_version_id,'disposition',decision_row.disposition,'achievement',decision_row.achievement_percent,
    'policyVersionId',decision_row.policy_version_id,'policyChecksum',decision_row.policy_checksum,'milestoneAmount',decision_row.milestone_amount,
    'strengthenedRisk',decision_row.strengthened_risk_snapshot,'riskBasisReference',decision_row.risk_basis_reference,
    'approvalPolicyVersionId',(select i.policy_version_id from public.approval_instance i where i.id=target_instance_id),
    'approvalPolicyVersionNo',(select i.policy_version_no from public.approval_instance i where i.id=target_instance_id),
    'approvalPolicyChecksum',(select i.policy_checksum_snapshot from public.approval_instance i where i.id=target_instance_id),
    'approvalSelectorChecksum',(select s.selector_checksum from public.approval_instance i
      join public.approval_policy_acceptance_payment_selector s on s.policy_version_id=i.policy_version_id where i.id=target_instance_id),
    'currency',decision_row.currency,'calculatedRate',decision_row.calculated_proposed_rate,'adjustedRate',decision_row.adjusted_requested_rate,
    'adjustments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'rate',a.requested_rate,'direction',a.direction,'reason',a.reason,
      'proposedByUserId',a.proposed_by_user_id,'proposedAt',a.proposed_at,
      'evidence',(select jsonb_agg(jsonb_build_object('id',e.inspection_evidence_id,'attachmentId',ie.attachment_id,
        'attachmentRowVersion',ie.attachment_row_version,'checksum',ie.content_checksum,'type',ie.evidence_type_code)
        order by e.inspection_evidence_id) from public.payment_rate_adjustment_evidence e
        join public.inspection_evidence ie on ie.id=e.inspection_evidence_id where e.adjustment_id=a.id))
      order by a.proposed_at,a.id) from public.payment_rate_adjustment a where a.acceptance_payment_decision_id=decision_row.id),'[]'::jsonb),
    'residualConditionIds',coalesce((select jsonb_agg(c.inspection_residual_condition_id order by c.inspection_residual_condition_id)
      from public.acceptance_payment_residual_condition c where c.acceptance_payment_decision_id=decision_row.id),'[]'::jsonb),
    'usablePortionIds',coalesce((select jsonb_agg(p.inspection_usable_portion_id order by p.inspection_usable_portion_id)
      from public.acceptance_payment_usable_portion p where p.acceptance_payment_decision_id=decision_row.id),'[]'::jsonb))) into snapshot_checksum;
  perform set_config('app.m08_payment_command',decision_row.id::text,true);
  update public.acceptance_payment_decision set approval_instance_id=target_instance_id,approval_subject_version=next_version,
    sealed_snapshot_checksum=snapshot_checksum,sealed_at=target_occurred_at,state='APPROVAL_PENDING',version_no=next_version,updated_at=target_occurred_at
    where id=decision_row.id;
  insert into public.approval_subject_acceptance_payment_decision(instance_id,acceptance_payment_decision_id,decision_root_id,decision_revision_no,
    subject_version_no,subject_checksum,subject_sealed_at,inspection_attempt_id,inspection_attempt_checksum)
  values(target_instance_id,decision_row.id,decision_row.decision_root_id,decision_row.revision_no,next_version,snapshot_checksum,target_occurred_at,
    decision_row.inspection_attempt_id,decision_row.inspection_attempt_checksum);
  perform app_private.append_m08_transition(target_audit_id,target_transition_id,target_outbox_id,'acceptance_payment.record.manage',
    'ACCEPTANCE_PAYMENT_DECISION',decision_row.id,'SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-SUBMIT',
    'ACCEPTANCE_PAYMENT_EVENT_REF',decision_row.state,'APPROVAL_PENDING',decision_row.version_no,next_version,'EXACT-APPROVAL-SUBJECT-BOUND',target_occurred_at);
  return next_version;
end $$;

-- Acceptance-payment approval cannot start through the M04 generic policy-version
-- subject creator. This command creates the typed ApprovalInstance and binds the
-- immutable payment snapshot in the same transaction; request roles never receive
-- direct INSERT privileges on Approval tables.
create or replace function public.create_acceptance_payment_approval_instance(
  target_decision_id uuid,target_expected_decision_version bigint,target_instance_id uuid,
  target_policy_version_id uuid,target_policy_checksum text,target_prior_instance_id uuid,target_generation integer,
  target_create_action_id uuid,target_create_audit_id uuid,target_create_transition_id uuid,
  target_payment_audit_id uuid,target_payment_transition_id uuid,target_payment_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare policy_row public.approval_policy_version%rowtype; decision_row public.acceptance_payment_decision%rowtype; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'approval.instance.submit');
  select * into strict decision_row from public.acceptance_payment_decision where id=target_decision_id for update;
  if decision_row.version_no<>target_expected_decision_version or decision_row.state not in ('CALCULATED','ADJUSTMENT_PROPOSED')
    or not app_private.actor_has_contract_internal_scope(decision_row.contract_id,target_occurred_at)
    or not exists(select 1 from public.vendor_contract c where c.id=decision_row.contract_id
      and c.manager_user_id=app_private.current_effective_actor_user_id()) then
    raise exception 'current scoped payment decision owned by Contract manager required' using errcode='42501';
  end if;
  select v.* into strict policy_row from public.approval_policy_version v join public.approval_policy p on p.id=v.policy_id
    where v.id=target_policy_version_id and v.checksum=target_policy_checksum and v.state='PUBLISHED'
      and v.subject_kind='ACCEPTANCE_PAYMENT_DECISION' and p.status='ACTIVE' and v.valid_from<=target_occurred_at
      and (v.valid_until is null or v.valid_until>target_occurred_at) for share of v;
  if (decision_row.revision_no=1 and (target_prior_instance_id is not null or target_generation<>1))
    or (decision_row.revision_no>1 and not exists(
      select 1 from public.acceptance_payment_decision previous_decision
      join public.approval_instance previous_instance on previous_instance.id=previous_decision.approval_instance_id
      join public.acceptance_payment_approval_outcome previous_outcome
        on previous_outcome.acceptance_payment_decision_id=previous_decision.id and previous_outcome.approval_instance_id=previous_instance.id
      where previous_decision.id=decision_row.previous_decision_id and previous_decision.decision_root_id=decision_row.decision_root_id
        and previous_decision.revision_no+1=decision_row.revision_no and previous_instance.id=target_prior_instance_id
        and previous_instance.state in ('REJECTED','RECALLED','CANCELLED') and previous_instance.generation+1=target_generation
        and previous_outcome.outcome in ('REJECTED','RECALLED','CANCELLED')) then
    raise exception 'invalid payment Approval resubmission lineage' using errcode='23514';
  end if;
  insert into public.approval_instance(id,policy_version_id,policy_version_no,policy_checksum_snapshot,submitter_user_id,
    prior_instance_id,generation,state,version_no,created_at)
  values(target_instance_id,policy_row.id,policy_row.version_no,policy_row.checksum,app_private.current_effective_actor_user_id(),
    target_prior_instance_id,target_generation,'DRAFT',1,target_occurred_at);
  perform app_private.append_approval_audit_transition(target_create_audit_id,target_create_transition_id,'approval.instance.create',
    target_instance_id,1,'EVT-APPROVAL-CREATE',null,'DRAFT',null,target_occurred_at);
  insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,occurred_at)
    values(target_create_action_id,target_instance_id,target_create_audit_id,'CREATE','USER',app_private.current_actor_user_id(),
      app_private.current_effective_actor_user_id(),target_occurred_at);
  return public.bind_acceptance_payment_approval_subject(target_decision_id,target_instance_id,target_expected_decision_version,
    target_payment_audit_id,target_payment_transition_id,target_payment_outbox_id,target_occurred_at);
end $$;

create or replace function public.propose_payment_rate_adjustment(
  target_decision_id uuid,target_adjustment_id uuid,target_requested_rate numeric,target_reason text,target_evidence_ids uuid[],
  target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare decision_row public.acceptance_payment_decision%rowtype; next_version bigint; target_direction text; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'acceptance_payment.record.manage');
  select * into strict decision_row from public.acceptance_payment_decision where id=target_decision_id for update;
  if decision_row.state<>'CALCULATED' or target_requested_rate<0 or target_requested_rate>100
    or nullif(btrim(target_reason),'') is null or target_evidence_ids is null or cardinality(target_evidence_ids)=0
    or not app_private.actor_has_contract_internal_scope(decision_row.contract_id,target_occurred_at)
    or not exists(select 1 from public.vendor_contract c where c.id=decision_row.contract_id and c.manager_user_id=app_private.current_effective_actor_user_id())
    or exists(select 1 from unnest(target_evidence_ids) e(id) where not exists(select 1 from public.inspection_evidence i
      where i.id=e.id and i.inspection_id=decision_row.inspection_id)) then
    raise exception 'scoped CALCULATED decision, reason and exact Inspection evidence required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(decision_row.version_no,target_expected_version);
  target_direction:=case when target_requested_rate>decision_row.calculated_proposed_rate then 'UPWARD'
    when target_requested_rate<decision_row.calculated_proposed_rate then 'DOWNWARD' else 'UNCHANGED' end;
  insert into public.payment_rate_adjustment(id,acceptance_payment_decision_id,requested_rate,direction,reason,proposed_by_user_id,proposed_at)
    values(target_adjustment_id,decision_row.id,target_requested_rate,target_direction,target_reason,app_private.current_effective_actor_user_id(),target_occurred_at);
  insert into public.payment_rate_adjustment_evidence(adjustment_id,acceptance_payment_decision_id,inspection_id,inspection_evidence_id)
    select target_adjustment_id,decision_row.id,decision_row.inspection_id,e.id from unnest(target_evidence_ids) e(id);
  perform set_config('app.m08_payment_command',decision_row.id::text,true);
  update public.acceptance_payment_decision set adjusted_requested_rate=target_requested_rate,state='ADJUSTMENT_PROPOSED',
    version_no=next_version,updated_at=target_occurred_at where id=decision_row.id;
  perform app_private.append_m08_transition(target_audit_id,target_transition_id,target_outbox_id,'acceptance_payment.record.manage',
    'ACCEPTANCE_PAYMENT_DECISION',decision_row.id,'SM-ACCEPTANCE-PAYMENT-V1','EVT-ACCEPTANCE-PAYMENT-ADJUST',
    'ACCEPTANCE_PAYMENT_EVENT_REF','CALCULATED','ADJUSTMENT_PROPOSED',decision_row.version_no,next_version,target_reason,target_occurred_at);
  return next_version;
end $$;

create or replace function public.submit_acceptance_payment_approval_instance(
  target_instance_id uuid,target_expected_version bigint,target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions
as $$ declare instance_row public.approval_instance%rowtype; next_version bigint; computed_line_checksum text; begin
  perform app_private.assert_approval_request(target_occurred_at,'approval.instance.submit');
  if app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id() or app_private.current_acting_authority_id() is not null then
    raise exception 'delegated submission is not allowed' using errcode='42501';
  end if;
  select * into strict instance_row from public.approval_instance where id=target_instance_id for update;
  if instance_row.state<>'DRAFT' or instance_row.submitter_user_id<>app_private.current_effective_actor_user_id()
    or not exists(select 1 from public.approval_subject_acceptance_payment_decision s join public.acceptance_payment_decision d
      on d.id=s.acceptance_payment_decision_id where s.instance_id=instance_row.id and d.state='APPROVAL_PENDING'
        and d.approval_instance_id=instance_row.id and d.version_no=s.subject_version_no and d.sealed_snapshot_checksum=s.subject_checksum
        and d.sealed_at=s.subject_sealed_at)
    or not exists(select 1 from public.approval_policy_version v join public.approval_policy p on p.id=v.policy_id
      where v.id=instance_row.policy_version_id and p.status='ACTIVE' and v.state='PUBLISHED' and v.subject_kind='ACCEPTANCE_PAYMENT_DECISION'
        and v.checksum=instance_row.policy_checksum_snapshot and v.valid_from<=target_occurred_at
        and (v.valid_until is null or v.valid_until>target_occurred_at)) then
    raise exception 'owned DRAFT Approval with exact pending payment subject and effective policy required' using errcode='42501';
  end if;
  next_version:=app_private.next_version(instance_row.version_no,target_expected_version);
  if not exists(select 1 from public.approval_policy_step_rule s where s.policy_version_id=instance_row.policy_version_id and s.required)
    or exists(select 1 from public.approval_policy_step_rule s where s.policy_version_id=instance_row.policy_version_id and s.required
      and not exists(select 1 from public.approval_policy_participant_rule p where p.step_rule_id=s.id and p.required_for_completion)) then
    raise exception 'every required payment Approval step needs required participants' using errcode='23514';
  end if;
  insert into public.approval_step(id,instance_id,policy_step_rule_id,step_key,sequence_no,step_role,completion_mode,required,state,version_no)
    select extensions.gen_random_uuid(),instance_row.id,r.id,r.step_key,r.sequence_no,r.step_role,r.completion_mode,r.required,'WAITING',0
    from public.approval_policy_step_rule r where r.policy_version_id=instance_row.policy_version_id order by r.sequence_no,r.step_key;
  insert into public.approval_participant(id,step_id,policy_participant_rule_id,participant_user_id,position_id_snapshot,role_id_snapshot,
    assignment_evidence_id,participant_order,required_for_completion,state,version_no)
    select extensions.gen_random_uuid(),s.id,pr.id,pa.user_id,pa.position_id,null,pa.id,pr.participant_order,pr.required_for_completion,'WAITING',0
    from public.approval_step s join public.approval_policy_participant_rule pr on pr.step_rule_id=s.policy_step_rule_id and pr.selector_kind='POSITION'
    join public.user_position_assignment pa on pa.position_id=pr.position_id and pa.is_primary and pa.revoked_at is null
    join public.position pos on pos.id=pa.position_id and pos.status='ACTIVE'
    join public.user_account u on u.id=pa.user_id and u.account_kind='INTERNAL' and u.status='ACTIVE'
    where s.instance_id=instance_row.id and pa.valid_from<=target_occurred_at and (pa.valid_until is null or pa.valid_until>target_occurred_at)
      and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at);
  if exists(select 1 from public.approval_step s where s.instance_id=instance_row.id and s.required and not exists(
      select 1 from public.approval_participant p where p.step_id=s.id))
    or exists(select 1 from public.approval_step s join public.approval_participant ap on ap.step_id=s.id
      left join public.position p on p.id=ap.position_id_snapshot and p.status='ACTIVE'
      where s.instance_id=instance_row.id and s.step_role='APPROVAL' and coalesce(p.approval_capability,'NONE') not in ('OFFICIAL','REPRESENTATIVE')) then
    raise exception 'required payment Approval line lacks active official position participants' using errcode='42501';
  end if;
  select encode(extensions.digest(convert_to(string_agg(concat_ws(':',s.sequence_no,s.step_key,s.step_role,s.completion_mode,s.required,
    ap.participant_user_id,coalesce(ap.position_id_snapshot::text,''),ap.assignment_evidence_id,ap.participant_order,ap.required_for_completion),
    '|' order by s.sequence_no,s.step_key,ap.participant_order),'UTF8'),'sha256'),'hex') into computed_line_checksum
    from public.approval_step s join public.approval_participant ap on ap.step_id=s.id where s.instance_id=instance_row.id;
  update public.approval_instance set state='SUBMITTED',line_checksum=computed_line_checksum,version_no=next_version,submitted_at=target_occurred_at
    where id=instance_row.id;
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,'approval.instance.submit',instance_row.id,next_version,
    'EVT-APPROVAL-SUBMIT','DRAFT','SUBMITTED',null,target_occurred_at);
  insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,occurred_at)
    values(target_action_record_id,instance_row.id,target_audit_id,'SUBMIT','USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),target_occurred_at);
  perform app_private.enqueue_approval_event(target_outbox_id,target_audit_id,'EVT-APPROVAL-SUBMITTED',instance_row.id,next_version,'SUBMITTED',target_occurred_at);
  return next_version;
end $$;

create or replace function public.perform_acceptance_payment_approval_action(
  target_instance_id uuid,target_step_id uuid,target_participant_id uuid,target_event text,
  target_expected_instance_version bigint,target_expected_step_version bigint,target_expected_participant_version bigint,
  target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_reason_code text,target_opinion text,
  target_expected_payment_version bigint,target_payment_audit_id uuid,target_payment_transition_id uuid,target_payment_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare instance_row public.approval_instance%rowtype; step_row public.approval_step%rowtype; participant_row public.approval_participant%rowtype;
  decision_row public.acceptance_payment_decision%rowtype; authority_row public.acting_authority_assignment%rowtype;
  permission_code text; transition_event text; outbox_event text; step_terminal text; target_instance_state text:='IN_PROGRESS';
  step_is_complete boolean; next_sequence integer; next_version bigint; payment_next_version bigint; selected_authority uuid:=app_private.current_acting_authority_id(); begin
  if target_event not in ('REVIEW','AGREE','APPROVE','REJECT','REFERENCE_RECEIPT') then raise exception 'unsupported approval action' using errcode='22023'; end if;
  permission_code:=case target_event when 'REVIEW' then 'approval.step.review' when 'AGREE' then 'approval.step.agree'
    when 'APPROVE' then 'approval.step.approve' when 'REFERENCE_RECEIPT' then 'approval.step.reference' else 'approval.step.reject' end;
  transition_event:=case when target_event='REFERENCE_RECEIPT' then 'EVT-APPROVAL-REFERENCE' else 'EVT-APPROVAL-'||target_event end;
  outbox_event:=case target_event when 'REVIEW' then 'EVT-APPROVAL-REVIEWED' when 'AGREE' then 'EVT-APPROVAL-AGREED'
    when 'APPROVE' then 'EVT-APPROVAL-APPROVED' when 'REFERENCE_RECEIPT' then 'EVT-APPROVAL-REFERENCE-RECEIVED' else 'EVT-APPROVAL-REJECTED' end;
  step_terminal:=case target_event when 'REVIEW' then 'REVIEWED' when 'AGREE' then 'AGREED' when 'APPROVE' then 'APPROVED'
    when 'REFERENCE_RECEIPT' then 'REVIEWED' else 'REJECTED' end;
  perform app_private.assert_approval_request(target_occurred_at,permission_code);
  if target_event='REJECT' and nullif(btrim(target_reason_code),'') is null then raise exception 'rejection reason required' using errcode='23514'; end if;
  select * into strict instance_row from public.approval_instance where id=target_instance_id for update;
  if not exists(select 1 from public.approval_subject_acceptance_payment_decision where instance_id=instance_row.id) then
    raise exception 'exact acceptance-payment subject required' using errcode='23514';
  end if;
  perform set_config('app.acceptance_payment_approval_instance',instance_row.id::text,true);
  select * into strict step_row from public.approval_step where id=target_step_id and instance_id=instance_row.id for update;
  select * into strict participant_row from public.approval_participant where id=target_participant_id and step_id=step_row.id for update;
  next_version:=app_private.next_version(instance_row.version_no,target_expected_instance_version);
  perform app_private.next_version(step_row.version_no,target_expected_step_version);
  perform app_private.next_version(participant_row.version_no,target_expected_participant_version);
  if instance_row.state<>'IN_PROGRESS' or step_row.state<>'ACTIVE' or participant_row.state<>'ACTIVE'
    or participant_row.participant_user_id<>app_private.current_effective_actor_user_id() then raise exception 'active exact participant required' using errcode='42501'; end if;
  if (target_event='REVIEW' and step_row.step_role<>'REVIEW') or (target_event='AGREE' and step_row.step_role<>'AGREEMENT')
    or (target_event='APPROVE' and step_row.step_role<>'APPROVAL') or (target_event='REFERENCE_RECEIPT' and step_row.step_role<>'REFERENCE') then
    raise exception 'action does not match step role' using errcode='23514';
  end if;
  if target_event='APPROVE' and not exists(select 1 from public.user_position_assignment pa join public.position p on p.id=pa.position_id
    where pa.user_id=app_private.current_effective_actor_user_id() and pa.position_id=participant_row.position_id_snapshot and pa.is_primary
      and pa.revoked_at is null and pa.valid_from<=target_occurred_at and (pa.valid_until is null or pa.valid_until>target_occurred_at)
      and p.status='ACTIVE' and p.approval_capability in ('OFFICIAL','REPRESENTATIVE')) then raise exception 'official position required' using errcode='42501'; end if;
  if app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id() then
    if selected_authority is null or not app_private.acting_authority_allows(permission_code,target_occurred_at) then raise exception 'active acting authority required' using errcode='42501'; end if;
    select * into strict authority_row from public.acting_authority_assignment a where a.id=selected_authority
      and a.authenticated_user_id=app_private.current_actor_user_id() and a.effective_actor_user_id=app_private.current_effective_actor_user_id()
      and a.revoked_at is null and a.valid_from<=target_occurred_at and a.valid_until>target_occurred_at for share;
  elsif selected_authority is not null then raise exception 'direct action cannot attach acting authority' using errcode='42501'; end if;
  update public.approval_participant set state='ACTED',version_no=version_no+1 where id=participant_row.id;
  if target_event='REJECT' then
    update public.approval_step set state=case when id=step_row.id then 'REJECTED' else 'CANCELLED' end,version_no=version_no+1
      where instance_id=instance_row.id and state in ('WAITING','ACTIVE');
    update public.approval_participant set state='CANCELLED',version_no=version_no+1 where step_id in(
      select id from public.approval_step where instance_id=instance_row.id) and state in ('WAITING','ACTIVE');
    target_instance_state:='REJECTED';
  else
    select case when step_row.completion_mode='ANY_ONE' then true
      when step_row.completion_mode='SEQUENTIAL' then not exists(select 1 from public.approval_participant p where p.step_id=step_row.id and p.state='WAITING')
      when step_row.completion_mode='SPECIFIC' then not exists(select 1 from public.approval_participant p where p.step_id=step_row.id and p.required_for_completion and p.state<>'ACTED')
      else not exists(select 1 from public.approval_participant p where p.step_id=step_row.id and p.state<>'ACTED') end into step_is_complete;
    if step_row.completion_mode='SEQUENTIAL' and not step_is_complete then update public.approval_participant set state='ACTIVE',version_no=version_no+1
      where id=(select id from public.approval_participant where step_id=step_row.id and state='WAITING' order by participant_order limit 1); end if;
    if step_is_complete then
      update public.approval_step set state=step_terminal,version_no=version_no+1 where id=step_row.id;
      update public.approval_participant set state='CANCELLED',version_no=version_no+1 where step_id=step_row.id and state='ACTIVE';
      if exists(select 1 from public.approval_step where instance_id=instance_row.id and sequence_no=step_row.sequence_no and state='ACTIVE') then next_sequence:=null;
      else select min(sequence_no) into next_sequence from public.approval_step where instance_id=instance_row.id and state='WAITING'; end if;
      if next_sequence is not null then
        update public.approval_step set state='ACTIVE',version_no=version_no+1 where instance_id=instance_row.id and sequence_no=next_sequence and state='WAITING';
        update public.approval_participant p set state='ACTIVE',version_no=p.version_no+1 from public.approval_step s
          where s.id=p.step_id and s.instance_id=instance_row.id and s.sequence_no=next_sequence and s.state='ACTIVE' and p.state='WAITING'
            and (s.completion_mode<>'SEQUENTIAL' or p.participant_order=(select min(p2.participant_order) from public.approval_participant p2 where p2.step_id=s.id and p2.state='WAITING'));
      elsif not exists(select 1 from public.approval_step where instance_id=instance_row.id and required and state not in ('REVIEWED','AGREED','APPROVED','SKIPPED_BY_POLICY')) then
        target_instance_state:='COMPLETED'; transition_event:='EVT-APPROVAL-APPROVE'; outbox_event:='EVT-APPROVAL-COMPLETED';
      end if;
    end if;
  end if;
  update public.approval_instance set state=target_instance_state,version_no=next_version,
    completed_at=case when target_instance_state='COMPLETED' then target_occurred_at else completed_at end where id=instance_row.id;
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,permission_code,instance_row.id,next_version,
    transition_event,'IN_PROGRESS',target_instance_state,target_reason_code,target_occurred_at);
  insert into public.approval_action(id,instance_id,step_id,participant_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,
    acting_authority_id,acting_authority_evidence_id,reason_code,opinion,occurred_at)
  values(target_action_record_id,instance_row.id,step_row.id,participant_row.id,target_audit_id,target_event,'USER',app_private.current_actor_user_id(),
    app_private.current_effective_actor_user_id(),selected_authority,case when selected_authority is null then null else authority_row.evidence_id end,
    target_reason_code,target_opinion,target_occurred_at);
  perform app_private.enqueue_approval_event(target_outbox_id,target_audit_id,outbox_event,instance_row.id,next_version,target_instance_state,target_occurred_at);
  if target_instance_state in ('COMPLETED','REJECTED') then
    select d.* into strict decision_row from public.acceptance_payment_decision d join public.approval_subject_acceptance_payment_decision s
      on s.acceptance_payment_decision_id=d.id where s.instance_id=instance_row.id for update of d;
    payment_next_version:=app_private.next_version(decision_row.version_no,target_expected_payment_version);
    perform set_config('app.m08_payment_command',decision_row.id::text,true);
    update public.acceptance_payment_decision set state=case target_instance_state when 'COMPLETED' then 'APPROVED' else 'CANCELLED' end,
      final_approved_rate=case when target_instance_state='COMPLETED' then coalesce(adjusted_requested_rate,calculated_proposed_rate) end,
      approved_payable_amount=case when target_instance_state='COMPLETED' then (select case p.amount_rounding_mode
        when 'DOWN' then trunc(decision_row.milestone_amount*coalesce(decision_row.adjusted_requested_rate,decision_row.calculated_proposed_rate)/100,
          p.amount_rounding_decimal_places)
        else round(decision_row.milestone_amount*coalesce(decision_row.adjusted_requested_rate,decision_row.calculated_proposed_rate)/100,
          p.amount_rounding_decimal_places) end from public.acceptance_payment_policy_version p where p.id=decision_row.policy_version_id) end,
      approval_terminal_outcome=case when target_instance_state='REJECTED' then 'REJECTED' end,
      cancellation_reason=case when target_instance_state='REJECTED' then target_reason_code end,version_no=payment_next_version,updated_at=target_occurred_at
      where id=decision_row.id;
    insert into public.acceptance_payment_approval_outcome(acceptance_payment_decision_id,approval_instance_id,approval_version,terminal_action_id,
      outcome,actor_kind,authenticated_actor_user_id,effective_actor_user_id,acting_authority_id,acting_authority_evidence_id,
      action_occurred_at,approval_terminal_at,correlation_id,created_at)
    values(decision_row.id,instance_row.id,next_version,target_action_record_id,case target_instance_state when 'COMPLETED' then 'APPROVED' else 'REJECTED' end,
      'USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),selected_authority,
      case when selected_authority is null then null else authority_row.evidence_id end,target_occurred_at,target_occurred_at,
      app_private.required_setting('app.correlation_id'),target_occurred_at);
    perform app_private.append_m08_transition(target_payment_audit_id,target_payment_transition_id,target_payment_outbox_id,
      'acceptance_payment.approval.apply','ACCEPTANCE_PAYMENT_DECISION',decision_row.id,'SM-ACCEPTANCE-PAYMENT-V1',
      case target_instance_state when 'COMPLETED' then 'EVT-ACCEPTANCE-PAYMENT-APPROVE' else 'EVT-ACCEPTANCE-PAYMENT-CANCEL' end,
      'ACCEPTANCE_PAYMENT_EVENT_REF','APPROVAL_PENDING',case target_instance_state when 'COMPLETED' then 'APPROVED' else 'CANCELLED' end,
      decision_row.version_no,payment_next_version,target_reason_code,target_occurred_at);
  end if;
  return next_version;
end $$;

create or replace function public.apply_acceptance_payment_approval_outcome(
  target_decision_id uuid,target_instance_id uuid,target_expected_version bigint,target_outcome text,target_terminal_action_id uuid,
  target_reason text,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare decision_row public.acceptance_payment_decision%rowtype; action_row public.approval_action%rowtype; instance_row public.approval_instance%rowtype;
  next_version bigint; next_state text; target_event text; final_rate numeric(9,6); action_correlation text; begin
  perform app_private.m08_assert_worker(target_occurred_at,'APPROVAL_ENGINE');
  select * into strict decision_row from public.acceptance_payment_decision where id=target_decision_id for update;
  select * into strict instance_row from public.approval_instance where id=target_instance_id for share;
  select * into strict action_row from public.approval_action where id=target_terminal_action_id and instance_id=target_instance_id for share;
  select a.correlation_id into strict action_correlation from public.audit_log a where a.id=action_row.audit_log_id;
  if decision_row.state<>'APPROVAL_PENDING' or decision_row.approval_instance_id<>target_instance_id
    or not exists(select 1 from public.approval_subject_acceptance_payment_decision s where s.instance_id=target_instance_id
      and s.acceptance_payment_decision_id=decision_row.id and s.subject_version_no=decision_row.version_no
      and s.subject_checksum=decision_row.sealed_snapshot_checksum and s.subject_sealed_at=decision_row.sealed_at
      and s.inspection_attempt_id=decision_row.inspection_attempt_id and s.inspection_attempt_checksum=decision_row.inspection_attempt_checksum)
    or not ((target_outcome='APPROVED' and action_row.event_id='APPROVE' and instance_row.completed_at=action_row.occurred_at)
      or (target_outcome='REJECTED' and action_row.event_id='REJECT') or (target_outcome='RECALLED' and action_row.event_id='RECALL')
      or (target_outcome='CANCELLED' and action_row.event_id='CANCEL')) then
    raise exception 'exact terminal Approval action and immutable subject snapshot required' using errcode='23514';
  end if;
  if target_outcome='APPROVED' and exists(select 1 from public.approval_instance i where i.id=target_instance_id and i.state='COMPLETED') then
    next_state:='APPROVED'; target_event:='EVT-ACCEPTANCE-PAYMENT-APPROVE'; final_rate:=coalesce(decision_row.adjusted_requested_rate,decision_row.calculated_proposed_rate);
  elsif target_outcome in ('REJECTED','RECALLED','CANCELLED') and exists(select 1 from public.approval_instance i where i.id=target_instance_id
      and i.state=target_outcome) then
    next_state:='CANCELLED'; target_event:='EVT-ACCEPTANCE-PAYMENT-CANCEL';
    if nullif(btrim(target_reason),'') is null then raise exception 'terminal negative outcome reason required' using errcode='23514'; end if;
  else raise exception 'Approval terminal state and outcome mismatch' using errcode='23514'; end if;
  next_version:=app_private.next_version(decision_row.version_no,target_expected_version);
  perform set_config('app.m08_payment_command',decision_row.id::text,true);
  update public.acceptance_payment_decision set state=next_state,final_approved_rate=final_rate,
    approved_payable_amount=case when next_state='APPROVED' then (select case p.amount_rounding_mode
      when 'DOWN' then trunc(decision_row.milestone_amount*final_rate/100,p.amount_rounding_decimal_places)
      else round(decision_row.milestone_amount*final_rate/100,p.amount_rounding_decimal_places) end
      from public.acceptance_payment_policy_version p where p.id=decision_row.policy_version_id) end,
    approval_terminal_outcome=case when next_state='CANCELLED' then target_outcome else null end,
    cancellation_reason=case when next_state='CANCELLED' then target_reason else null end,version_no=next_version,updated_at=target_occurred_at
    where id=decision_row.id;
  insert into public.acceptance_payment_approval_outcome(acceptance_payment_decision_id,approval_instance_id,approval_version,terminal_action_id,
    outcome,actor_kind,authenticated_actor_user_id,effective_actor_user_id,system_actor_id,acting_authority_id,acting_authority_evidence_id,
    action_occurred_at,approval_terminal_at,correlation_id,created_at)
  values(decision_row.id,instance_row.id,instance_row.version_no,action_row.id,target_outcome,action_row.actor_kind,
    action_row.authenticated_actor_user_id,action_row.effective_actor_user_id,action_row.system_actor_id,action_row.acting_authority_id,
    action_row.acting_authority_evidence_id,action_row.occurred_at,action_row.occurred_at,action_correlation,target_occurred_at);
  perform app_private.append_m08_transition(target_audit_id,target_transition_id,target_outbox_id,'acceptance_payment.approval.apply',
    'ACCEPTANCE_PAYMENT_DECISION',decision_row.id,'SM-ACCEPTANCE-PAYMENT-V1',target_event,'ACCEPTANCE_PAYMENT_EVENT_REF',
    'APPROVAL_PENDING',next_state,decision_row.version_no,next_version,target_reason,target_occurred_at);
  return next_version;
end $$;

create or replace function public.request_acceptance_payment_approval_recall(
  target_instance_id uuid,target_expected_version bigint,target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_reason_code text,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if not exists(select 1 from public.approval_subject_acceptance_payment_decision s
      join public.acceptance_payment_decision d on d.id=s.acceptance_payment_decision_id
      where s.instance_id=target_instance_id and d.approval_instance_id=target_instance_id and d.state='APPROVAL_PENDING') then
    raise exception 'exact pending acceptance-payment Approval required' using errcode='23514';
  end if;
  perform set_config('app.acceptance_payment_approval_instance',target_instance_id::text,true);
  return public.request_approval_recall(target_instance_id,target_expected_version,target_action_record_id,target_audit_id,target_transition_id,
    target_outbox_id,target_reason_code,target_occurred_at);
end $$;

create or replace function public.complete_acceptance_payment_approval_recall(
  target_instance_id uuid,target_expected_instance_version bigint,target_expected_payment_version bigint,
  target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_reason_code text,
  target_payment_audit_id uuid,target_payment_transition_id uuid,target_payment_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare target_decision_id uuid; next_instance_version bigint; begin
  select s.acceptance_payment_decision_id into strict target_decision_id
    from public.approval_subject_acceptance_payment_decision s where s.instance_id=target_instance_id;
  perform set_config('app.acceptance_payment_approval_instance',target_instance_id::text,true);
  next_instance_version:=public.complete_approval_recall(target_instance_id,target_expected_instance_version,target_action_record_id,
    target_audit_id,target_transition_id,target_outbox_id,target_reason_code,target_occurred_at);
  perform public.apply_acceptance_payment_approval_outcome(target_decision_id,target_instance_id,target_expected_payment_version,'RECALLED',
    target_action_record_id,target_reason_code,target_payment_audit_id,target_payment_transition_id,target_payment_outbox_id,target_occurred_at);
  return next_instance_version;
end $$;

create or replace function public.decide_inspection(
  target_inspection_id uuid,target_expected_version bigint,target_reason text,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare inspection_row public.inspection%rowtype; attempt_row public.inspection_attempt%rowtype; next_state text; target_event text; next_version bigint; begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,'inspection.record.decide');
  select * into strict inspection_row from public.inspection where id=target_inspection_id for update;
  select * into strict attempt_row from public.inspection_attempt where id=inspection_row.latest_sealed_attempt_id
    and inspection_id=inspection_row.id and attempt_no=inspection_row.latest_attempt_no and state='SEALED' for share;
  if inspection_row.state<>'DECISION_PENDING' or not app_private.actor_has_contract_internal_scope(inspection_row.contract_id,target_occurred_at) then
    raise exception 'authorized internal decider and exact sealed attempt required; Vendor self-accept is forbidden' using errcode='42501';
  end if;
  if attempt_row.disposition in ('ACCEPTED','PARTIAL_ACCEPTANCE','CONDITIONAL_ACCEPTANCE') then next_state:='COMPLETED'; target_event:='EVT-INSPECTION-ACCEPT';
  elsif attempt_row.disposition='REJECTED' then next_state:='COMPLETED'; target_event:='EVT-INSPECTION-REJECT';
  else next_state:='CORRECTION_REQUIRED'; target_event:='EVT-INSPECTION-REQUEST-CORRECTION'; end if;
  if attempt_row.disposition in ('REJECTED','CORRECTION_REQUESTED','UNABLE_TO_VERIFY') and nullif(btrim(target_reason),'') is null then
    raise exception 'reject/correction decision reason is required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(inspection_row.version_no,target_expected_version);
  update public.inspection set state=next_state,final_disposition=attempt_row.disposition,version_no=next_version,updated_at=target_occurred_at
    where id=inspection_row.id;
  perform app_private.append_m08_transition(target_audit_id,target_transition_id,target_outbox_id,'inspection.record.decide','INSPECTION',inspection_row.id,
    'SM-INSPECTION-V1',target_event,'INSPECTION_EVENT_REF','DECISION_PENDING',next_state,inspection_row.version_no,next_version,target_reason,target_occurred_at);
  return next_version;
end $$;

create or replace function public.read_inspection_external(target_contract_id uuid,target_occurred_at timestamptz)
returns table(inspection_id uuid,inspection_no text,inspection_type_code text,contract_id uuid,deliverable_id uuid,deliverable_version_id uuid,
  state text,scheduled_at timestamptz,latest_attempt_no integer,disposition text,achievement_percent numeric)
language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select i.id,i.inspection_no,i.inspection_type_code,i.contract_id,i.deliverable_id,i.deliverable_version_id,i.state,i.scheduled_at,
    i.latest_attempt_no,a.disposition,a.achievement_percent
  from public.inspection i left join public.inspection_attempt a on a.id=i.latest_sealed_attempt_id
  where i.contract_id=target_contract_id and target_occurred_at=app_private.request_time()
    and (app_private.actor_has_contract_internal_scope(i.contract_id,target_occurred_at)
      or (app_private.actor_has_contract_vendor_scope(i.contract_id,'inspection.external.read',target_occurred_at)
        and exists(select 1 from public.vendor_user vu where vu.user_id=app_private.current_actor_user_id()
          and vu.vendor_id=i.assigned_vendor_id and app_private.actor_has_vendor_membership(vu.id,i.assigned_vendor_id,target_occurred_at))))
$$;
comment on function public.read_inspection_external(uuid,timestamptz) is
  'INSPECTION_EXTERNAL_V1: exact ContractScope and active VendorMembership; excludes amounts, rates, payment, internal notes, inspector/decider identity and raw evidence.';

create or replace function public.read_acceptance_payment_finance(target_decision_id uuid,target_occurred_at timestamptz)
returns table(decision_id uuid,contract_id uuid,contract_milestone_id uuid,state text,disposition text,achievement_percent numeric,
  milestone_amount numeric,currency character,calculated_proposed_rate numeric,adjusted_requested_rate numeric,final_approved_rate numeric,
  approved_payable_amount numeric,held_amount numeric,unpaid_remainder numeric,policy_version_id uuid,approval_instance_id uuid,resource_version bigint)
language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select d.id,d.contract_id,d.contract_milestone_id,d.state,d.disposition,d.achievement_percent,d.milestone_amount,d.currency,
    d.calculated_proposed_rate,d.adjusted_requested_rate,d.final_approved_rate,d.approved_payable_amount,d.held_amount,d.unpaid_remainder,
    d.policy_version_id,d.approval_instance_id,d.version_no
  from public.acceptance_payment_decision d
  where d.id=target_decision_id and target_occurred_at=app_private.request_time()
    and app_private.actor_has_contract_internal_scope(d.contract_id,target_occurred_at)
    and app_private.actor_has_permission('contract.detail.finance.read',target_occurred_at)
    and app_private.actor_has_permission('acceptance_payment.finance.read',target_occurred_at)
$$;
comment on function public.read_acceptance_payment_finance(uuid,timestamptz) is
  'INTERNAL_FINANCE_V1: requires exact Contract Scope plus both contract.detail.finance.read and acceptance_payment.finance.read; Vendor is always denied.';

do $rls$ declare table_name text; begin
  foreach table_name in array array[
    'requirement','requirement_revision','test_plan','test_plan_version','test_plan_equipment','test_plan_evidence_requirement',
    'test_plan_requirement_coverage','test_result','test_measurement','test_result_evidence','acceptance_score_policy','acceptance_score_policy_version',
    'acceptance_score_policy_band','inspection','inspection_checklist_version','inspection_criterion','inspection_criterion_evidence_requirement',
    'inspection_attempt','inspection_criterion_result','inspection_evidence','inspection_attempt_evidence','inspection_criterion_result_evidence',
    'inspection_partial_usable_portion','inspection_partial_usable_portion_evidence','inspection_residual_condition','inspection_residual_condition_evidence',
    'inspection_attempt_critical_failure','acceptance_payment_policy','acceptance_payment_policy_version','acceptance_payment_rate_rule',
    'acceptance_payment_decision','payment_rate_adjustment','payment_rate_adjustment_evidence','acceptance_payment_residual_condition',
    'acceptance_payment_residual_condition_evidence','acceptance_payment_usable_portion','approval_policy_acceptance_payment_selector',
    'approval_subject_acceptance_payment_decision','acceptance_payment_approval_outcome'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
  end loop;
end $rls$;

create policy requirement_internal_read on public.requirement for select to youone_request
  using(app_private.actor_has_project_internal_scope(project_id,app_private.request_time()));
create policy requirement_revision_internal_read on public.requirement_revision for select to youone_request
  using(exists(select 1 from public.requirement r where r.id=requirement_id and app_private.actor_has_project_internal_scope(r.project_id,app_private.request_time())));
create policy test_plan_internal_read on public.test_plan for select to youone_request
  using(app_private.actor_has_project_internal_scope(project_id,app_private.request_time()));
create policy test_plan_version_internal_read on public.test_plan_version for select to youone_request
  using(exists(select 1 from public.test_plan p where p.id=test_plan_id and app_private.actor_has_project_internal_scope(p.project_id,app_private.request_time())));
create policy test_result_internal_read on public.test_result for select to youone_request
  using(exists(select 1 from public.test_plan p where p.id=test_plan_id and app_private.actor_has_project_internal_scope(p.project_id,app_private.request_time())));
create policy inspection_internal_read on public.inspection for select to youone_request
  using(app_private.actor_has_contract_internal_scope(contract_id,app_private.request_time()));
create policy inspection_attempt_internal_read on public.inspection_attempt for select to youone_request
  using(app_private.actor_has_contract_internal_scope(contract_id,app_private.request_time()));
create policy inspection_evidence_internal_read on public.inspection_evidence for select to youone_request
  using(exists(select 1 from public.inspection i where i.id=inspection_id and app_private.actor_has_contract_internal_scope(i.contract_id,app_private.request_time())));
create policy acceptance_payment_internal_read on public.acceptance_payment_decision for select to youone_request
  using(app_private.actor_has_contract_internal_scope(contract_id,app_private.request_time())
    and app_private.actor_has_permission('contract.detail.finance.read',app_private.request_time())
    and app_private.actor_has_permission('acceptance_payment.finance.read',app_private.request_time()));
create policy acceptance_payment_subject_participant_read on public.approval_subject_acceptance_payment_decision for select to youone_request
  using(app_private.can_read_approval_instance(instance_id,app_private.request_time()));

revoke all on public.requirement,public.requirement_revision,public.test_plan,public.test_plan_version,public.test_plan_equipment,
  public.test_plan_evidence_requirement,public.test_plan_requirement_coverage,public.test_result,public.test_measurement,public.test_result_evidence,
  public.acceptance_score_policy,public.acceptance_score_policy_version,public.acceptance_score_policy_band,public.inspection,
  public.inspection_checklist_version,public.inspection_criterion,public.inspection_criterion_evidence_requirement,public.inspection_attempt,
  public.inspection_criterion_result,public.inspection_evidence,public.inspection_attempt_evidence,public.inspection_criterion_result_evidence,
  public.inspection_partial_usable_portion,public.inspection_partial_usable_portion_evidence,public.inspection_residual_condition,
  public.inspection_residual_condition_evidence,public.inspection_attempt_critical_failure,public.acceptance_payment_policy,
  public.acceptance_payment_policy_version,public.acceptance_payment_rate_rule,public.acceptance_payment_decision,public.payment_rate_adjustment,
  public.payment_rate_adjustment_evidence,public.acceptance_payment_residual_condition,public.acceptance_payment_residual_condition_evidence,
  public.acceptance_payment_usable_portion,public.approval_policy_acceptance_payment_selector,public.approval_subject_acceptance_payment_decision,
  public.acceptance_payment_approval_outcome
from public,youone_request,youone_privileged_writer;

grant select on public.requirement,public.requirement_revision,public.test_plan,public.test_plan_version,public.test_result,
  public.inspection,public.inspection_attempt,public.inspection_evidence,public.approval_subject_acceptance_payment_decision to youone_request;

revoke all on function public.publish_m08_policy_version(text,uuid,text,uuid,timestamptz),
  public.publish_acceptance_payment_approval_policy(uuid,text,uuid,timestamptz),
  public.seal_test_plan_version(uuid,text,uuid,timestamptz),public.seal_inspection_checklist_version(uuid,text,uuid,timestamptz),
  public.record_sealed_test_result(uuid,uuid,integer,uuid,jsonb,jsonb,text,text,uuid,timestamptz),
  public.request_inspection(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz),
  public.schedule_inspection(uuid,timestamptz,bigint,uuid,uuid,uuid,timestamptz),
  public.begin_inspection_attempt(uuid,uuid,bigint,uuid,uuid,uuid,timestamptz),
  public.submit_inspection_decision(uuid,uuid,bigint,jsonb,jsonb,jsonb,jsonb,text,uuid,uuid,uuid,timestamptz),
  public.satisfy_acceptance_payment_condition(uuid,bigint,uuid[],text,uuid,uuid,uuid,timestamptz),
  public.append_inspection_evidence(uuid,uuid,uuid,bigint,text,text,uuid,timestamptz),
  public.mark_acceptance_payment_eligible(uuid,bigint,text,uuid,uuid,uuid,timestamptz),
  public.bind_acceptance_payment_approval_subject(uuid,uuid,bigint,uuid,uuid,uuid,timestamptz),
  public.create_acceptance_payment_approval_instance(uuid,bigint,uuid,uuid,text,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz),
  public.propose_payment_rate_adjustment(uuid,uuid,numeric,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.submit_acceptance_payment_approval_instance(uuid,bigint,uuid,uuid,uuid,uuid,timestamptz),
  public.perform_acceptance_payment_approval_action(uuid,uuid,uuid,text,bigint,bigint,bigint,uuid,uuid,uuid,uuid,text,text,bigint,uuid,uuid,uuid,timestamptz),
  public.request_acceptance_payment_approval_recall(uuid,bigint,uuid,uuid,uuid,uuid,text,timestamptz),
  public.decide_inspection(uuid,bigint,text,uuid,uuid,uuid,timestamptz),
  public.read_inspection_external(uuid,timestamptz),public.read_acceptance_payment_finance(uuid,timestamptz)
from public,youone_privileged_writer;
grant execute on function public.publish_m08_policy_version(text,uuid,text,uuid,timestamptz),
  public.publish_acceptance_payment_approval_policy(uuid,text,uuid,timestamptz),
  public.seal_test_plan_version(uuid,text,uuid,timestamptz),public.seal_inspection_checklist_version(uuid,text,uuid,timestamptz),
  public.record_sealed_test_result(uuid,uuid,integer,uuid,jsonb,jsonb,text,text,uuid,timestamptz),
  public.request_inspection(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz),
  public.schedule_inspection(uuid,timestamptz,bigint,uuid,uuid,uuid,timestamptz),
  public.begin_inspection_attempt(uuid,uuid,bigint,uuid,uuid,uuid,timestamptz),
  public.submit_inspection_decision(uuid,uuid,bigint,jsonb,jsonb,jsonb,jsonb,text,uuid,uuid,uuid,timestamptz),
  public.satisfy_acceptance_payment_condition(uuid,bigint,uuid[],text,uuid,uuid,uuid,timestamptz),
  public.append_inspection_evidence(uuid,uuid,uuid,bigint,text,text,uuid,timestamptz),
  public.mark_acceptance_payment_eligible(uuid,bigint,text,uuid,uuid,uuid,timestamptz),
  public.bind_acceptance_payment_approval_subject(uuid,uuid,bigint,uuid,uuid,uuid,timestamptz),
  public.create_acceptance_payment_approval_instance(uuid,bigint,uuid,uuid,text,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz),
  public.propose_payment_rate_adjustment(uuid,uuid,numeric,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.submit_acceptance_payment_approval_instance(uuid,bigint,uuid,uuid,uuid,uuid,timestamptz),
  public.perform_acceptance_payment_approval_action(uuid,uuid,uuid,text,bigint,bigint,bigint,uuid,uuid,uuid,uuid,text,text,bigint,uuid,uuid,uuid,timestamptz),
  public.request_acceptance_payment_approval_recall(uuid,bigint,uuid,uuid,uuid,uuid,text,timestamptz),
  public.decide_inspection(uuid,bigint,text,uuid,uuid,uuid,timestamptz),
  public.read_inspection_external(uuid,timestamptz),public.read_acceptance_payment_finance(uuid,timestamptz)
to youone_request;

revoke all on function public.calculate_acceptance_payment_decision(uuid,uuid,bigint,uuid,uuid,uuid,boolean,text,uuid,uuid,uuid,timestamptz),
  public.hold_acceptance_payment_for_conditions(uuid,bigint,numeric,numeric,uuid[],text,uuid,uuid,uuid,timestamptz),
  public.complete_acceptance_payment_approval_recall(uuid,bigint,bigint,uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,timestamptz),
  public.apply_acceptance_payment_approval_outcome(uuid,uuid,bigint,text,uuid,text,uuid,uuid,uuid,timestamptz)
from public,youone_request;
grant execute on function public.calculate_acceptance_payment_decision(uuid,uuid,bigint,uuid,uuid,uuid,boolean,text,uuid,uuid,uuid,timestamptz),
  public.hold_acceptance_payment_for_conditions(uuid,bigint,numeric,numeric,uuid[],text,uuid,uuid,uuid,timestamptz),
  public.complete_acceptance_payment_approval_recall(uuid,bigint,bigint,uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,timestamptz),
  public.apply_acceptance_payment_approval_outcome(uuid,uuid,bigint,text,uuid,text,uuid,uuid,uuid,timestamptz)
to youone_privileged_writer;

revoke all on function app_private.m08_assert_direct_internal(timestamptz,text),app_private.m08_assert_inspection_requester(uuid,uuid,uuid,timestamptz),
  app_private.m08_assert_worker(timestamptz,text),app_private.append_m08_transition(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text,bigint,bigint,text,timestamptz)
from public,youone_request,youone_privileged_writer;

comment on table public.acceptance_payment_decision is
  'Approval freezes the final rate only. Eligibility is a separate evidence-backed transition; M08 records no transfer or accounting execution.';
comment on table public.inspection_attempt is 'SEALED attempts and all exact evidence joins are immutable; acceptance never waives Vendor responsibility.';
