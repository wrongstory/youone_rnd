-- M10 ECR/ECO: immutable version snapshots, typed targets, implementation and independent verification.
-- BOM is P1. A BOM target may be added only by a later migration that owns the real BOM revision FK.

insert into public.permission(id,stable_code,status) values
  ('3a000000-0000-4000-8000-000000000001','change.request.create','ACTIVE'),
  ('3a000000-0000-4000-8000-000000000002','change.impact.analyze','ACTIVE'),
  ('3a000000-0000-4000-8000-000000000003','change.request.review','ACTIVE'),
  ('3a000000-0000-4000-8000-000000000004','change.request.approve','ACTIVE'),
  ('3a000000-0000-4000-8000-000000000005','change.order.manage','ACTIVE'),
  ('3a000000-0000-4000-8000-000000000006','change.order.implement','ACTIVE'),
  ('3a000000-0000-4000-8000-000000000007','change.order.verify','ACTIVE'),
  ('3a000000-0000-4000-8000-000000000008','change.order.emergency_release','ACTIVE'),
  ('3a000000-0000-4000-8000-000000000009','change.request.read','ACTIVE'),
  ('3a000000-0000-4000-8000-000000000010','change.order.read','ACTIVE'),
  ('3a000000-0000-4000-8000-000000000011','change.request.manage','ACTIVE')
on conflict do nothing;

insert into public.action_definition(action_id) values
  ('change.request.create'),('change.impact.analyze'),('change.request.review'),('change.request.approve'),
  ('change.order.manage'),('change.order.implement'),('change.order.verify'),
  ('change.order.emergency_release'),('change.request.read'),('change.order.read')
  ,('change.request.manage')
on conflict do nothing;

insert into public.aggregate_type_definition(aggregate_type) values
  ('CHANGE_REQUEST'),('CHANGE_ORDER'),('EMERGENCY_CHANGE_EXCEPTION')
on conflict do nothing;

insert into public.domain_event_definition(event_id,payload_schema_id,payload_schema_version) values
  ('EVT-ECR-CREATE','ECR_EVENT_REF',1),('EVT-ECR-START-ANALYSIS','ECR_EVENT_REF',1),('EVT-ECR-SUBMIT-REVIEW','ECR_EVENT_REF',1),
  ('EVT-ECR-REVIEWED','ECR_EVENT_REF',1),('EVT-ECR-APPROVE','ECR_EVENT_REF',1),
  ('EVT-ECR-REJECT','ECR_EVENT_REF',1),('EVT-ECR-CREATE-ECO','ECR_EVENT_REF',1),
  ('EVT-ECO-CREATE','ECO_EVENT_REF',1),('EVT-ECO-SUBMIT','ECO_EVENT_REF',1),('EVT-ECO-RELEASE','ECO_EVENT_REF',1),
  ('EVT-ECO-START','ECO_EVENT_REF',1),('EVT-ECO-SUBMIT-VERIFY','ECO_EVENT_REF',1),
  ('EVT-ECO-VERIFY','ECO_EVENT_REF',1),('EVT-ECO-CLOSE','ECO_EVENT_REF',1),
  ('EVT-ECO-SUSPEND','ECO_EVENT_REF',1),('EVT-ECO-IMPLEMENT-TARGET','ECO_EVENT_REF',1),
  ('EVT-ECO-RECORD-RETROSPECTIVE-APPROVAL','ECO_EVENT_REF',1),('EVT-ECO-EMERGENCY-AUTHORIZED','ECO_EMERGENCY_EVENT_REF',1)
on conflict do nothing;

insert into public.state_machine_definition(machine_id,aggregate_type) values
  ('SM-ECR-V1','CHANGE_REQUEST'),('SM-ECO-V1','CHANGE_ORDER')
on conflict do nothing;

insert into public.state_definition(machine_id,state_id,is_terminal) values
  ('SM-ECR-V1','DRAFT',false),('SM-ECR-V1','IMPACT_ANALYSIS',false),('SM-ECR-V1','REVIEW_PENDING',false),
  ('SM-ECR-V1','APPROVAL_PENDING',false),('SM-ECR-V1','APPROVED',false),('SM-ECR-V1','REJECTED',true),
  ('SM-ECR-V1','CANCELLED',true),('SM-ECR-V1','CONVERTED_TO_ECO',true),
  ('SM-ECO-V1','DRAFT',false),('SM-ECO-V1','APPROVAL_PENDING',false),('SM-ECO-V1','RELEASED',false),
  ('SM-ECO-V1','IMPLEMENTING',false),('SM-ECO-V1','VERIFICATION_PENDING',false),('SM-ECO-V1','EFFECTIVE',false),
  ('SM-ECO-V1','CLOSED',true),('SM-ECO-V1','SUSPENDED',false),('SM-ECO-V1','CANCELLED',true)
on conflict do nothing;

insert into public.transition_definition(machine_id,event_id,from_state,to_state) values
  ('SM-ECR-V1','EVT-ECR-CREATE',null,'DRAFT'),
  ('SM-ECR-V1','EVT-ECR-START-ANALYSIS','DRAFT','IMPACT_ANALYSIS'),
  ('SM-ECR-V1','EVT-ECR-SUBMIT-REVIEW','IMPACT_ANALYSIS','REVIEW_PENDING'),
  ('SM-ECR-V1','EVT-ECR-REVIEWED','REVIEW_PENDING','APPROVAL_PENDING'),
  ('SM-ECR-V1','EVT-ECR-APPROVE','APPROVAL_PENDING','APPROVED'),
  ('SM-ECR-V1','EVT-ECR-REJECT','REVIEW_PENDING','REJECTED'),
  ('SM-ECR-V1','EVT-ECR-REJECT','APPROVAL_PENDING','REJECTED'),
  ('SM-ECR-V1','EVT-ECR-CREATE-ECO','APPROVED','CONVERTED_TO_ECO'),
  ('SM-ECO-V1','EVT-ECO-CREATE',null,'DRAFT'),
  ('SM-ECO-V1','EVT-ECO-SUBMIT','DRAFT','APPROVAL_PENDING'),
  ('SM-ECO-V1','EVT-ECO-RELEASE','APPROVAL_PENDING','RELEASED'),
  ('SM-ECO-V1','EVT-ECO-START','RELEASED','IMPLEMENTING'),
  ('SM-ECO-V1','EVT-ECO-SUBMIT-VERIFY','IMPLEMENTING','VERIFICATION_PENDING'),
  ('SM-ECO-V1','EVT-ECO-VERIFY','VERIFICATION_PENDING','EFFECTIVE'),
  ('SM-ECO-V1','EVT-ECO-CLOSE','EFFECTIVE','CLOSED'),
  ('SM-ECO-V1','EVT-ECO-SUSPEND','RELEASED','SUSPENDED'),
  ('SM-ECO-V1','EVT-ECO-SUSPEND','IMPLEMENTING','SUSPENDED'),
  ('SM-ECO-V1','EVT-ECO-IMPLEMENT-TARGET','IMPLEMENTING','IMPLEMENTING')
on conflict do nothing;

create table public.change_request (
  id uuid primary key,
  ecr_no text not null unique check(length(ecr_no) between 1 and 100),
  project_id uuid not null references public.project(id),
  contract_id uuid references public.vendor_contract(id),
  assigned_vendor_id uuid references public.vendor(id),
  originator_user_id uuid not null references public.user_account(id),
  owner_user_id uuid not null references public.user_account(id),
  current_version_id uuid not null,
  current_version_no bigint not null check(current_version_no>0),
  state text not null check(state in ('DRAFT','IMPACT_ANALYSIS','REVIEW_PENDING','APPROVAL_PENDING','APPROVED','REJECTED','CANCELLED','CONVERTED_TO_ECO')),
  version_no bigint not null check(version_no>0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(id,project_id),
  unique(id,current_version_id,current_version_no),
  foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id),
  check(contract_id is not null or assigned_vendor_id is null)
);

create table public.change_request_version (
  id uuid primary key,
  change_request_id uuid not null references public.change_request(id) deferrable initially deferred,
  version_no bigint not null check(version_no>0),
  prior_version_id uuid unique,
  title text not null check(length(title) between 1 and 500),
  rationale text not null check(length(rationale) between 1 and 10000),
  proposed_change_summary text not null check(length(proposed_change_summary) between 1 and 10000),
  priority text not null check(priority in ('LOW','NORMAL','HIGH','CRITICAL')),
  state text not null check(state in ('DRAFT','SEALED','APPROVED','REJECTED','SUPERSEDED')),
  snapshot_checksum text check(snapshot_checksum is null or app_private.is_sha256(snapshot_checksum)),
  sealed_at timestamptz,
  impact_analysis_id uuid,
  approval_instance_id uuid references public.approval_instance(id),
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null,
  unique(change_request_id,version_no),
  unique(id,change_request_id),
  unique(id,change_request_id,version_no),
  unique(id,change_request_id,version_no,snapshot_checksum,sealed_at),
  foreign key(prior_version_id,change_request_id) references public.change_request_version(id,change_request_id),
  check((version_no=1 and prior_version_id is null) or (version_no>1 and prior_version_id is not null)),
  check((state='DRAFT' and snapshot_checksum is null and sealed_at is null and approval_instance_id is null and impact_analysis_id is null)
    or (state<>'DRAFT' and snapshot_checksum is not null and sealed_at is not null and impact_analysis_id is not null))
);
alter table public.change_request add constraint change_request_current_version_fk
  foreign key(current_version_id,id,current_version_no)
  references public.change_request_version(id,change_request_id,version_no) deferrable initially deferred;

create table public.ecr_impact_analysis (
  id uuid primary key,
  change_request_version_id uuid not null unique references public.change_request_version(id),
  analysis_checksum text not null check(app_private.is_sha256(analysis_checksum)),
  completed_by_user_id uuid not null references public.user_account(id),
  completed_at timestamptz not null,
  unique(id,change_request_version_id,analysis_checksum,completed_at)
);
alter table public.change_request_version add constraint change_request_version_impact_analysis_fk
  foreign key(impact_analysis_id,id,snapshot_checksum,sealed_at)
  references public.ecr_impact_analysis(id,change_request_version_id,analysis_checksum,completed_at) deferrable initially deferred;

create table public.change_impact_assessment (
  id uuid primary key,
  change_request_version_id uuid not null references public.change_request_version(id),
  sequence_no integer not null check(sequence_no>0),
  impact_kind text not null check(impact_kind in ('COST','SCHEDULE','QUALITY','SAFETY','SECURITY','REGULATORY')),
  effect text not null check(effect in ('NO_IMPACT','AFFECTED')),
  severity text not null check(severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  analysis text not null check(length(analysis) between 1 and 10000),
  rationale text not null check(length(rationale) between 1 and 10000),
  cost_delta numeric(20,2),
  currency char(3) check(currency is null or currency ~ '^[A-Z]{3}$'),
  schedule_delta_days integer,
  contract_amendment_required boolean not null,
  acceptance_criteria_change boolean not null,
  assessed_by_user_id uuid not null references public.user_account(id),
  assessed_at timestamptz not null,
  unique(change_request_version_id,sequence_no),
  unique(change_request_version_id,impact_kind),
  check((cost_delta is null)=(currency is null)),
  check(impact_kind='COST' or cost_delta is null),
  check(impact_kind='SCHEDULE' or schedule_delta_days is null),
  check(effect='AFFECTED' or (cost_delta is null and schedule_delta_days is null))
);

create table public.change_impact_evidence (
  change_impact_assessment_id uuid not null references public.change_impact_assessment(id),
  attachment_id uuid not null,
  attachment_row_version bigint not null,
  attachment_checksum text not null check(app_private.is_sha256(attachment_checksum)),
  primary key(change_impact_assessment_id,attachment_id),
  foreign key(attachment_id,attachment_row_version,attachment_checksum)
    references public.attachment(id,row_version,detected_sha256)
);

create table public.change_request_ncr_link (
  change_request_version_id uuid not null references public.change_request_version(id),
  ncr_id uuid not null,
  contract_id uuid not null,
  project_id uuid not null,
  assigned_vendor_id uuid not null,
  primary key(change_request_version_id,ncr_id),
  foreign key(ncr_id,contract_id,project_id,assigned_vendor_id)
    references public.non_conformance(id,contract_id,project_id,assigned_vendor_id)
);

create table public.change_request_requirement_target (
  change_request_version_id uuid not null references public.change_request_version(id),
  requirement_id uuid not null,
  before_revision_id uuid not null,
  before_revision_no bigint not null,
  primary key(change_request_version_id,requirement_id),
  foreign key(before_revision_id,requirement_id,before_revision_no)
    references public.requirement_revision(id,requirement_id,revision_no)
);

create table public.change_request_document_target (
  change_request_version_id uuid not null references public.change_request_version(id),
  document_id uuid not null,
  before_document_version_id uuid not null,
  before_version_no bigint not null,
  before_checksum text not null check(app_private.is_sha256(before_checksum)),
  primary key(change_request_version_id,document_id),
  foreign key(before_document_version_id,document_id,before_version_no,before_checksum)
    references public.document_version(id,document_id,version_no,sealed_snapshot_checksum)
);

create table public.change_request_review (
  id uuid primary key,
  change_request_id uuid not null references public.change_request(id),
  change_request_version_id uuid not null references public.change_request_version(id),
  reviewer_user_id uuid not null references public.user_account(id),
  disposition text not null check(disposition in ('REVIEWED','RETURN_RECOMMENDED','REJECT_RECOMMENDED')),
  opinion text not null check(length(opinion) between 1 and 10000),
  reviewed_at timestamptz not null,
  unique(change_request_id,change_request_version_id,reviewer_user_id)
);

create table public.emergency_change_exception (
  id uuid primary key,
  exception_root_id uuid not null,
  version_no bigint not null check(version_no>0),
  project_id uuid not null references public.project(id),
  contract_id uuid references public.vendor_contract(id),
  assigned_vendor_id uuid references public.vendor(id),
  policy_version_id uuid not null references public.approval_policy_version(id),
  authority_code text not null check(app_private.is_stable_code(authority_code)),
  temporary_authority_assignment_id uuid not null references public.acting_authority_assignment(id),
  temporary_authority_user_id uuid not null references public.user_account(id),
  authorized_by_position_id uuid not null references public.position(id),
  reason_code text not null check(app_private.is_stable_code(reason_code)),
  justification text not null check(length(justification) between 1 and 10000),
  risk_summary text not null check(length(risk_summary) between 1 and 10000),
  evidence_attachment_id uuid not null references public.attachment(id),
  evidence_attachment_row_version bigint not null,
  evidence_attachment_checksum text not null check(app_private.is_sha256(evidence_attachment_checksum)),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  retrospective_approval_due_at timestamptz not null,
  sealed_snapshot_checksum text not null check(app_private.is_sha256(sealed_snapshot_checksum)),
  authorized_by_user_id uuid not null references public.user_account(id),
  authorized_at timestamptz not null,
  audit_log_id uuid not null unique references public.audit_log(id),
  unique(exception_root_id,version_no),
  unique(id,project_id,contract_id),
  unique(id,version_no,sealed_snapshot_checksum,authorized_at),
  foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id),
  foreign key(evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum)
    references public.attachment(id,row_version,detected_sha256),
  check(contract_id is not null or assigned_vendor_id is null),
  check(valid_from<valid_until and authorized_at>=valid_from and authorized_at<valid_until),
  check(retrospective_approval_due_at>authorized_at)
);

create table public.change_order (
  id uuid primary key,
  eco_no text not null unique check(length(eco_no) between 1 and 100),
  change_request_id uuid references public.change_request(id),
  approved_change_request_version_id uuid references public.change_request_version(id),
  emergency_exception_id uuid references public.emergency_change_exception(id),
  project_id uuid not null references public.project(id),
  contract_id uuid references public.vendor_contract(id),
  assigned_vendor_id uuid references public.vendor(id),
  owner_user_id uuid not null references public.user_account(id),
  current_version_id uuid not null,
  current_version_no bigint not null check(current_version_no>0),
  state text not null check(state in ('DRAFT','APPROVAL_PENDING','RELEASED','IMPLEMENTING','VERIFICATION_PENDING','EFFECTIVE','CLOSED','SUSPENDED','CANCELLED')),
  version_no bigint not null check(version_no>0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(id,project_id),
  unique(id,current_version_id,current_version_no),
  foreign key(change_request_id,project_id) references public.change_request(id,project_id),
  foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id),
  check((approved_change_request_version_id is null)<>(emergency_exception_id is null)),
  check((change_request_id is null)=(approved_change_request_version_id is null))
);

create table public.change_order_version (
  id uuid primary key,
  change_order_id uuid not null references public.change_order(id) deferrable initially deferred,
  version_no bigint not null check(version_no>0),
  prior_version_id uuid unique,
  origin_kind text not null check(origin_kind in ('APPROVED_ECR','EMERGENCY_EXCEPTION')),
  origin_change_request_version_id uuid references public.change_request_version(id),
  origin_emergency_exception_id uuid references public.emergency_change_exception(id),
  title text not null check(length(title) between 1 and 500),
  instruction_summary text not null check(length(instruction_summary) between 1 and 10000),
  implementation_plan text not null check(length(implementation_plan) between 1 and 20000),
  verification_plan text not null check(length(verification_plan) between 1 and 20000),
  retest_required boolean not null,
  reinspection_required boolean not null,
  changes_scope boolean not null,
  changes_amount boolean not null,
  changes_deadline boolean not null,
  changes_acceptance_criteria boolean not null,
  state text not null check(state in ('DRAFT','SEALED','RELEASED','SUPERSEDED')),
  snapshot_checksum text check(snapshot_checksum is null or app_private.is_sha256(snapshot_checksum)),
  sealed_at timestamptz,
  approval_instance_id uuid references public.approval_instance(id),
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null,
  unique(change_order_id,version_no),
  unique(id,change_order_id),
  unique(id,change_order_id,version_no),
  unique(id,change_order_id,version_no,snapshot_checksum,sealed_at),
  foreign key(prior_version_id,change_order_id) references public.change_order_version(id,change_order_id),
  check((version_no=1 and prior_version_id is null) or (version_no>1 and prior_version_id is not null)),
  check((origin_kind='APPROVED_ECR' and origin_change_request_version_id is not null and origin_emergency_exception_id is null)
    or (origin_kind='EMERGENCY_EXCEPTION' and origin_change_request_version_id is null and origin_emergency_exception_id is not null)),
  check((state='DRAFT' and snapshot_checksum is null and sealed_at is null and approval_instance_id is null)
    or (state<>'DRAFT' and snapshot_checksum is not null and sealed_at is not null))
);
alter table public.change_order add constraint change_order_current_version_fk
  foreign key(current_version_id,id,current_version_no)
  references public.change_order_version(id,change_order_id,version_no) deferrable initially deferred;

create table public.change_target (
  id uuid primary key,
  change_order_version_id uuid not null references public.change_order_version(id),
  target_kind text not null check(target_kind in ('REQUIREMENT_REVISION','DOCUMENT_VERSION','DELIVERABLE_VERSION',
    'INSPECTION_CHECKLIST_VERSION','TEST_PLAN','CONTRACT_VERSION')),
  unique(id,change_order_version_id),
  unique(id,change_order_version_id,target_kind)
);

create table public.change_order_requirement_target (
  target_id uuid primary key,
  change_order_version_id uuid not null references public.change_order_version(id),
  target_kind text not null default 'REQUIREMENT_REVISION' check(target_kind='REQUIREMENT_REVISION'),
  requirement_id uuid not null,
  before_revision_id uuid not null,
  before_revision_no bigint not null,
  after_revision_id uuid not null,
  after_revision_no bigint not null,
  unique(change_order_version_id,requirement_id),
  foreign key(target_id,change_order_version_id,target_kind)
    references public.change_target(id,change_order_version_id,target_kind),
  foreign key(before_revision_id,requirement_id,before_revision_no)
    references public.requirement_revision(id,requirement_id,revision_no),
  foreign key(after_revision_id,requirement_id,after_revision_no)
    references public.requirement_revision(id,requirement_id,revision_no),
  check(after_revision_id<>before_revision_id and after_revision_no>before_revision_no)
);

create table public.change_order_document_target (
  target_id uuid primary key,
  change_order_version_id uuid not null references public.change_order_version(id),
  target_kind text not null default 'DOCUMENT_VERSION' check(target_kind='DOCUMENT_VERSION'),
  document_id uuid not null,
  before_document_version_id uuid not null,
  before_version_no bigint not null,
  before_checksum text not null check(app_private.is_sha256(before_checksum)),
  after_document_version_id uuid not null,
  after_version_no bigint not null,
  after_checksum text not null check(app_private.is_sha256(after_checksum)),
  unique(change_order_version_id,document_id),
  foreign key(target_id,change_order_version_id,target_kind)
    references public.change_target(id,change_order_version_id,target_kind),
  foreign key(before_document_version_id,document_id,before_version_no,before_checksum)
    references public.document_version(id,document_id,version_no,sealed_snapshot_checksum),
  foreign key(after_document_version_id,document_id,after_version_no,after_checksum)
    references public.document_version(id,document_id,version_no,sealed_snapshot_checksum),
  check(after_document_version_id<>before_document_version_id and after_version_no>before_version_no)
);

create table public.change_order_deliverable_target (
  target_id uuid primary key,
  change_order_version_id uuid not null references public.change_order_version(id),
  target_kind text not null default 'DELIVERABLE_VERSION' check(target_kind='DELIVERABLE_VERSION'),
  deliverable_id uuid not null,
  before_deliverable_version_id uuid not null,
  before_version_no bigint not null,
  before_manifest_checksum text not null check(app_private.is_sha256(before_manifest_checksum)),
  after_deliverable_version_id uuid not null,
  after_version_no bigint not null,
  after_manifest_checksum text not null check(app_private.is_sha256(after_manifest_checksum)),
  unique(change_order_version_id,deliverable_id),
  foreign key(target_id,change_order_version_id,target_kind)
    references public.change_target(id,change_order_version_id,target_kind),
  foreign key(before_deliverable_version_id,deliverable_id,before_version_no,before_manifest_checksum)
    references public.deliverable_version(id,deliverable_id,version_no,manifest_checksum),
  foreign key(after_deliverable_version_id,deliverable_id,after_version_no,after_manifest_checksum)
    references public.deliverable_version(id,deliverable_id,version_no,manifest_checksum),
  check(after_deliverable_version_id<>before_deliverable_version_id and after_version_no>before_version_no)
);

alter table public.contract_signature_evidence add constraint contract_signature_m10_exact_unique
  unique(id,contract_version_id);
create table public.change_order_contract_target (
  target_id uuid primary key,
  change_order_version_id uuid not null unique references public.change_order_version(id),
  target_kind text not null default 'CONTRACT_VERSION' check(target_kind='CONTRACT_VERSION'),
  contract_id uuid not null,
  before_contract_version_id uuid not null,
  before_version_no bigint not null,
  before_checksum text not null check(app_private.is_sha256(before_checksum)),
  before_sealed_at timestamptz not null,
  after_contract_version_id uuid not null,
  after_version_no bigint not null,
  after_checksum text not null check(app_private.is_sha256(after_checksum)),
  after_sealed_at timestamptz not null,
  executed_signature_evidence_id uuid not null,
  foreign key(target_id,change_order_version_id,target_kind)
    references public.change_target(id,change_order_version_id,target_kind),
  foreign key(before_contract_version_id,contract_id,before_version_no,before_checksum,before_sealed_at)
    references public.contract_version(id,contract_id,version_no,sealed_snapshot_checksum,sealed_at),
  foreign key(after_contract_version_id,contract_id,after_version_no,after_checksum,after_sealed_at)
    references public.contract_version(id,contract_id,version_no,sealed_snapshot_checksum,sealed_at),
  foreign key(executed_signature_evidence_id,after_contract_version_id)
    references public.contract_signature_evidence(id,contract_version_id),
  check(after_contract_version_id<>before_contract_version_id and after_version_no>before_version_no)
);

alter table public.inspection_checklist_version add constraint inspection_checklist_m10_target_unique
  unique(id,inspection_id,version_no,checksum,sealed_at);
create table public.change_order_inspection_checklist_target (
  target_id uuid primary key,
  change_order_version_id uuid not null references public.change_order_version(id),
  target_kind text not null default 'INSPECTION_CHECKLIST_VERSION' check(target_kind='INSPECTION_CHECKLIST_VERSION'),
  inspection_id uuid not null,
  before_version_id uuid not null,
  before_version_no bigint not null,
  before_checksum text not null check(app_private.is_sha256(before_checksum)),
  before_sealed_at timestamptz not null,
  after_version_id uuid not null,
  after_version_no bigint not null,
  after_checksum text not null check(app_private.is_sha256(after_checksum)),
  after_sealed_at timestamptz not null,
  unique(change_order_version_id,inspection_id),
  foreign key(target_id,change_order_version_id,target_kind) references public.change_target(id,change_order_version_id,target_kind),
  foreign key(before_version_id,inspection_id,before_version_no,before_checksum,before_sealed_at)
    references public.inspection_checklist_version(id,inspection_id,version_no,checksum,sealed_at),
  foreign key(after_version_id,inspection_id,after_version_no,after_checksum,after_sealed_at)
    references public.inspection_checklist_version(id,inspection_id,version_no,checksum,sealed_at),
  check(after_version_id<>before_version_id and after_version_no>before_version_no)
);

alter table public.test_plan_version add constraint test_plan_version_m10_target_unique
  unique(id,test_plan_id,version_no,manifest_checksum,sealed_at);
create table public.change_order_test_plan_target (
  target_id uuid primary key,
  change_order_version_id uuid not null references public.change_order_version(id),
  target_kind text not null default 'TEST_PLAN' check(target_kind='TEST_PLAN'),
  test_plan_id uuid not null,
  before_version_id uuid not null,
  before_version_no bigint not null,
  before_checksum text not null check(app_private.is_sha256(before_checksum)),
  before_sealed_at timestamptz not null,
  after_version_id uuid not null,
  after_version_no bigint not null,
  after_checksum text not null check(app_private.is_sha256(after_checksum)),
  after_sealed_at timestamptz not null,
  unique(change_order_version_id,test_plan_id),
  foreign key(target_id,change_order_version_id,target_kind) references public.change_target(id,change_order_version_id,target_kind),
  foreign key(before_version_id,test_plan_id,before_version_no,before_checksum,before_sealed_at)
    references public.test_plan_version(id,test_plan_id,version_no,manifest_checksum,sealed_at),
  foreign key(after_version_id,test_plan_id,after_version_no,after_checksum,after_sealed_at)
    references public.test_plan_version(id,test_plan_id,version_no,manifest_checksum,sealed_at),
  check(after_version_id<>before_version_id and after_version_no>before_version_no)
);

create table public.change_order_applied_project_scope (
  change_order_version_id uuid not null references public.change_order_version(id),
  project_id uuid not null references public.project(id),
  primary key(change_order_version_id,project_id)
);

create table public.change_order_applied_contract_scope (
  change_order_version_id uuid not null references public.change_order_version(id),
  contract_id uuid not null references public.vendor_contract(id),
  project_id uuid not null,
  primary key(change_order_version_id,contract_id),
  foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id)
);

create table public.change_order_implementation (
  id uuid primary key,
  change_order_id uuid not null references public.change_order(id),
  change_order_version_id uuid not null references public.change_order_version(id),
  target_id uuid not null references public.change_target(id),
  sequence_no integer not null check(sequence_no>0),
  performed_by_user_id uuid not null references public.user_account(id),
  performed_for_vendor_id uuid references public.vendor(id),
  original_overwritten boolean not null default false check(not original_overwritten),
  result_summary text not null check(length(result_summary) between 1 and 10000),
  evidence_attachment_id uuid not null references public.attachment(id),
  evidence_attachment_row_version bigint not null,
  evidence_attachment_checksum text not null check(app_private.is_sha256(evidence_attachment_checksum)),
  performed_at timestamptz not null,
  unique(change_order_id,sequence_no),
  unique(change_order_id,target_id),
  unique(id,change_order_id),
  foreign key(change_order_version_id,change_order_id) references public.change_order_version(id,change_order_id),
  foreign key(target_id,change_order_version_id) references public.change_target(id,change_order_version_id),
  foreign key(evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum)
    references public.attachment(id,row_version,detected_sha256)
);

create table public.change_order_verification (
  id uuid primary key,
  change_order_id uuid not null unique references public.change_order(id),
  change_order_version_id uuid not null references public.change_order_version(id),
  verifier_user_id uuid not null references public.user_account(id),
  result text not null check(result in ('EFFECTIVE','INEFFECTIVE')),
  summary text not null check(length(summary) between 1 and 10000),
  evidence_attachment_id uuid not null references public.attachment(id),
  evidence_attachment_row_version bigint not null,
  evidence_attachment_checksum text not null check(app_private.is_sha256(evidence_attachment_checksum)),
  verified_at timestamptz not null,
  unique(id,change_order_id),
  foreign key(change_order_version_id,change_order_id) references public.change_order_version(id,change_order_id),
  foreign key(evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum)
    references public.attachment(id,row_version,detected_sha256)
);

create table public.change_order_applied_serial (
  change_order_verification_id uuid not null references public.change_order_verification(id),
  serial_number text not null check(length(serial_number) between 1 and 200),
  primary key(change_order_verification_id,serial_number)
);
create table public.change_order_applied_lot (
  change_order_verification_id uuid not null references public.change_order_verification(id),
  lot_number text not null check(length(lot_number) between 1 and 200),
  primary key(change_order_verification_id,lot_number)
);
create table public.change_order_verification_test_result (
  change_order_verification_id uuid primary key references public.change_order_verification(id),
  test_result_id uuid not null unique references public.test_result(id)
);
create table public.change_order_verification_inspection_attempt (
  change_order_verification_id uuid primary key references public.change_order_verification(id),
  inspection_attempt_id uuid not null unique references public.inspection_attempt(id)
);

create table public.change_order_retrospective_approval (
  change_order_version_id uuid primary key references public.change_order_version(id),
  change_order_id uuid not null references public.change_order(id),
  emergency_exception_id uuid not null references public.emergency_change_exception(id),
  approval_instance_id uuid not null unique references public.approval_instance(id),
  approval_version bigint not null check(approval_version>0),
  official_approver_user_id uuid not null references public.user_account(id),
  official_approver_position_id uuid not null references public.position(id),
  terminal_action_id uuid not null,
  completed_at timestamptz not null,
  foreign key(terminal_action_id,approval_instance_id) references public.approval_action(id,instance_id)
);

alter table public.approval_subject_binding drop constraint approval_subject_binding_subject_kind_check;
alter table public.approval_subject_binding add constraint approval_subject_binding_subject_kind_check check(subject_kind in
  ('APPROVAL_POLICY_VERSION','DOCUMENT_VERSION','RESEARCH_PROJECT_APPLICATION','CONTRACT_VERSION','ACCEPTANCE_PAYMENT_DECISION',
   'CHANGE_REQUEST_VERSION','CHANGE_ORDER_VERSION'));

create table public.approval_subject_change_request_version (
  instance_id uuid primary key references public.approval_instance(id),
  subject_kind text not null default 'CHANGE_REQUEST_VERSION' check(subject_kind='CHANGE_REQUEST_VERSION'),
  change_request_version_id uuid not null,
  change_request_id uuid not null,
  subject_version_no bigint not null,
  subject_checksum text not null check(app_private.is_sha256(subject_checksum)),
  subject_sealed_at timestamptz not null,
  unique(change_request_version_id,instance_id),
  unique(instance_id,change_request_version_id),
  foreign key(instance_id,subject_kind) references public.approval_subject_binding(instance_id,subject_kind) deferrable initially deferred,
  foreign key(change_request_version_id,change_request_id,subject_version_no,subject_checksum,subject_sealed_at)
    references public.change_request_version(id,change_request_id,version_no,snapshot_checksum,sealed_at)
);
create trigger approval_change_request_subject_bind before insert on public.approval_subject_change_request_version
  for each row execute function app_private.bind_approval_subject();

create table public.approval_subject_change_order_version (
  instance_id uuid primary key references public.approval_instance(id),
  subject_kind text not null default 'CHANGE_ORDER_VERSION' check(subject_kind='CHANGE_ORDER_VERSION'),
  change_order_version_id uuid not null,
  change_order_id uuid not null,
  subject_version_no bigint not null,
  subject_checksum text not null check(app_private.is_sha256(subject_checksum)),
  subject_sealed_at timestamptz not null,
  unique(change_order_version_id,instance_id),
  unique(instance_id,change_order_version_id),
  foreign key(instance_id,subject_kind) references public.approval_subject_binding(instance_id,subject_kind) deferrable initially deferred,
  foreign key(change_order_version_id,change_order_id,subject_version_no,subject_checksum,subject_sealed_at)
    references public.change_order_version(id,change_order_id,version_no,snapshot_checksum,sealed_at)
);
create trigger approval_change_order_subject_bind before insert on public.approval_subject_change_order_version
  for each row execute function app_private.bind_approval_subject();

create table public.change_request_approval_outcome (
  change_request_version_id uuid primary key references public.change_request_version(id),
  change_request_id uuid not null references public.change_request(id),
  approval_instance_id uuid not null unique references public.approval_instance(id),
  outcome text not null check(outcome in ('APPROVED','REJECTED')),
  approval_version bigint not null check(approval_version>0),
  policy_version_id uuid not null,
  policy_version_no bigint not null,
  policy_checksum text not null check(app_private.is_sha256(policy_checksum)),
  official_approver_user_id uuid not null references public.user_account(id),
  official_approver_position_id uuid not null references public.position(id),
  acting_authority_id uuid references public.acting_authority_assignment(id),
  acting_authority_evidence_id uuid,
  terminal_action_id uuid not null,
  recorded_at timestamptz not null,
  foreign key(terminal_action_id,approval_instance_id) references public.approval_action(id,instance_id),
  foreign key(policy_version_id,policy_version_no,policy_checksum) references public.approval_policy_version(id,version_no,checksum),
  foreign key(acting_authority_id,acting_authority_evidence_id) references public.acting_authority_assignment(id,evidence_id),
  check((acting_authority_id is null)=(acting_authority_evidence_id is null))
);

create table public.change_order_approval_outcome (
  change_order_version_id uuid primary key references public.change_order_version(id),
  change_order_id uuid not null references public.change_order(id),
  approval_instance_id uuid not null unique references public.approval_instance(id),
  outcome text not null check(outcome in ('APPROVED','REJECTED')),
  approval_version bigint not null check(approval_version>0),
  policy_version_id uuid not null,
  policy_version_no bigint not null,
  policy_checksum text not null check(app_private.is_sha256(policy_checksum)),
  official_approver_user_id uuid not null references public.user_account(id),
  official_approver_position_id uuid not null references public.position(id),
  acting_authority_id uuid references public.acting_authority_assignment(id),
  acting_authority_evidence_id uuid,
  terminal_action_id uuid not null,
  recorded_at timestamptz not null,
  foreign key(terminal_action_id,approval_instance_id) references public.approval_action(id,instance_id),
  foreign key(policy_version_id,policy_version_no,policy_checksum) references public.approval_policy_version(id,version_no,checksum),
  foreign key(acting_authority_id,acting_authority_evidence_id) references public.acting_authority_assignment(id,evidence_id),
  check((acting_authority_id is null)=(acting_authority_evidence_id is null))
);

create table public.change_approval_negative_outcome (
  approval_instance_id uuid primary key references public.approval_instance(id),
  subject_kind text not null check(subject_kind in ('CHANGE_REQUEST_VERSION','CHANGE_ORDER_VERSION')),
  change_request_version_id uuid,
  change_order_version_id uuid,
  outcome text not null check(outcome in ('REJECTED','RECALLED','CANCELLED')),
  approval_version bigint not null check(approval_version>0),
  terminal_action_id uuid not null,
  reason_code text not null check(app_private.is_stable_code(reason_code)),
  recorded_at timestamptz not null,
  foreign key(terminal_action_id,approval_instance_id) references public.approval_action(id,instance_id),
  foreign key(approval_instance_id,change_request_version_id)
    references public.approval_subject_change_request_version(instance_id,change_request_version_id),
  foreign key(approval_instance_id,change_order_version_id)
    references public.approval_subject_change_order_version(instance_id,change_order_version_id),
  check(num_nonnulls(change_request_version_id,change_order_version_id)=1),
  check((subject_kind='CHANGE_REQUEST_VERSION')=(change_request_version_id is not null))
);

create or replace function app_private.assert_exactly_one_approval_subject()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare target_instance uuid:=coalesce(new.instance_id,old.instance_id); subject_count integer; begin
  select (select count(*) from public.approval_subject_policy_version p where p.instance_id=target_instance)
    +(select count(*) from public.approval_subject_document_version d where d.instance_id=target_instance)
    +(select count(*) from public.approval_subject_research_project_application r where r.instance_id=target_instance)
    +(select count(*) from public.approval_subject_contract_version c where c.instance_id=target_instance)
    +(select count(*) from public.approval_subject_acceptance_payment_decision a where a.instance_id=target_instance)
    +(select count(*) from public.approval_subject_change_request_version e where e.instance_id=target_instance)
    +(select count(*) from public.approval_subject_change_order_version o where o.instance_id=target_instance)
    into subject_count;
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
  union all select 'DOCUMENT_VERSION',l.document_version_id,l.subject_version_no,l.subject_checksum,v.state
  from public.approval_subject_document_version l join public.document_version v on v.id=l.document_version_id and v.document_id=l.document_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum
  union all select 'RESEARCH_PROJECT_APPLICATION',l.application_version_id,l.subject_version_no,l.subject_checksum,
    case when v.state='APPLICATION_DRAFT' and v.sealed_at is not null then 'SEALED' else v.state end
  from public.approval_subject_research_project_application l join public.research_project_application_version v on v.id=l.application_version_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum
  union all select 'CONTRACT_VERSION',l.contract_version_id,l.subject_version_no,l.subject_checksum,v.state
  from public.approval_subject_contract_version l join public.contract_version v on v.id=l.contract_version_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum
  union all select 'ACCEPTANCE_PAYMENT_DECISION',l.acceptance_payment_decision_id,l.subject_version_no,l.subject_checksum,d.state
  from public.approval_subject_acceptance_payment_decision l join public.acceptance_payment_decision d on d.id=l.acceptance_payment_decision_id
  where l.instance_id=target_instance_id and d.version_no=l.subject_version_no and d.sealed_snapshot_checksum=l.subject_checksum
  union all select 'CHANGE_REQUEST_VERSION',l.change_request_version_id,l.subject_version_no,l.subject_checksum,v.state
  from public.approval_subject_change_request_version l join public.change_request_version v on v.id=l.change_request_version_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.snapshot_checksum=l.subject_checksum and v.sealed_at=l.subject_sealed_at
  union all select 'CHANGE_ORDER_VERSION',l.change_order_version_id,l.subject_version_no,l.subject_checksum,v.state
  from public.approval_subject_change_order_version l join public.change_order_version v on v.id=l.change_order_version_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.snapshot_checksum=l.subject_checksum and v.sealed_at=l.subject_sealed_at
$$;

create or replace function public.submit_approval_instance(
  target_instance_id uuid,target_expected_version bigint,target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions
as $$ declare instance_row public.approval_instance%rowtype; next_version bigint; computed_line_checksum text; begin
  perform app_private.assert_approval_request(target_occurred_at,'approval.instance.submit');
  if app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id() or app_private.current_acting_authority_id() is not null then
    raise exception 'delegated submission is not allowed' using errcode='42501';
  end if;
  select * into strict instance_row from public.approval_instance where id=target_instance_id for update;
  if instance_row.state<>'DRAFT' or instance_row.submitter_user_id<>app_private.current_effective_actor_user_id() then raise exception 'instance is not submitter draft' using errcode='42501'; end if;
  next_version:=app_private.next_version(instance_row.version_no,target_expected_version);
  if not exists(select 1 from public.approval_policy_version v join public.approval_policy p on p.id=v.policy_id
    where v.id=instance_row.policy_version_id and p.status='ACTIVE' and v.state='PUBLISHED' and v.checksum=instance_row.policy_checksum_snapshot
      and v.valid_from<=target_occurred_at and (v.valid_until is null or v.valid_until>target_occurred_at)) then
    raise exception 'governing policy snapshot is no longer valid' using errcode='23514';
  end if;
  if not exists(select 1 from app_private.approval_subject_snapshot(target_instance_id) s
    where (s.subject_kind='APPROVAL_POLICY_VERSION' and s.subject_state='SEALED')
       or (s.subject_kind='DOCUMENT_VERSION' and s.subject_state='REVIEW_READY')
       or (s.subject_kind in ('CHANGE_REQUEST_VERSION','CHANGE_ORDER_VERSION') and s.subject_state='SEALED')) then
    raise exception 'exact typed subject snapshot is not sealed or review-ready' using errcode='23514';
  end if;
  if exists(select 1 from public.approval_policy_step_rule s join public.approval_policy_participant_rule p on p.step_rule_id=s.id
    where s.policy_version_id=instance_row.policy_version_id and s.completion_mode='SEQUENTIAL' and p.selector_kind<>'USER') then
    raise exception 'SEQUENTIAL participants require exact USER rules' using errcode='23514';
  end if;
  if not exists(select 1 from public.approval_policy_step_rule s where s.policy_version_id=instance_row.policy_version_id and s.required) then
    raise exception 'approval policy requires at least one required step' using errcode='23514';
  end if;
  if exists(select 1 from public.approval_policy_step_rule s where s.policy_version_id=instance_row.policy_version_id and s.completion_mode='SPECIFIC'
    and not exists(select 1 from public.approval_policy_participant_rule p where p.step_rule_id=s.id and p.required_for_completion)) then
    raise exception 'SPECIFIC step requires designated completion participants' using errcode='23514';
  end if;
  if exists(select 1 from public.approval_policy_step_rule s where s.policy_version_id=instance_row.policy_version_id
    and s.sequence_no>=(select max(last_step.sequence_no) from public.approval_policy_step_rule last_step where last_step.policy_version_id=instance_row.policy_version_id and last_step.required)
    and (s.sequence_no>(select max(last_step.sequence_no) from public.approval_policy_step_rule last_step where last_step.policy_version_id=instance_row.policy_version_id and last_step.required) or s.step_role<>'APPROVAL')) then
    raise exception 'last required approval sequence must contain only approval steps' using errcode='23514';
  end if;
  insert into public.approval_step(id,instance_id,policy_step_rule_id,step_key,sequence_no,step_role,completion_mode,required,state,version_no)
    select extensions.gen_random_uuid(),target_instance_id,r.id,r.step_key,r.sequence_no,r.step_role,r.completion_mode,r.required,'WAITING',0
    from public.approval_policy_step_rule r where r.policy_version_id=instance_row.policy_version_id order by r.sequence_no,r.step_key;
  if not found then raise exception 'approval policy has no steps' using errcode='23514'; end if;
  insert into public.approval_participant(id,step_id,policy_participant_rule_id,participant_user_id,position_id_snapshot,role_id_snapshot,assignment_evidence_id,participant_order,required_for_completion,state,version_no)
  select extensions.gen_random_uuid(),s.id,pr.id,u.id,
    (select pa.position_id from public.user_position_assignment pa join public.position pos on pos.id=pa.position_id and pos.status='ACTIVE' where pa.user_id=u.id and pa.is_primary and pa.revoked_at is null and pa.valid_from<=target_occurred_at and (pa.valid_until is null or pa.valid_until>target_occurred_at) limit 1),
    null,pr.id,pr.participant_order,pr.required_for_completion,'WAITING',0
  from public.approval_step s join public.approval_policy_participant_rule pr on pr.step_rule_id=s.policy_step_rule_id and pr.selector_kind='USER'
  join public.user_account u on u.id=pr.participant_user_id and u.account_kind='INTERNAL' and u.status='ACTIVE'
  where s.instance_id=target_instance_id and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at);
  insert into public.approval_participant(id,step_id,policy_participant_rule_id,participant_user_id,position_id_snapshot,role_id_snapshot,assignment_evidence_id,participant_order,required_for_completion,state,version_no)
  select extensions.gen_random_uuid(),s.id,pr.id,pa.user_id,pa.position_id,null,pa.id,pr.participant_order,pr.required_for_completion,'WAITING',0
  from public.approval_step s join public.approval_policy_participant_rule pr on pr.step_rule_id=s.policy_step_rule_id and pr.selector_kind='POSITION'
  join public.user_position_assignment pa on pa.position_id=pr.position_id and pa.is_primary and pa.revoked_at is null
  join public.position pos on pos.id=pa.position_id and pos.status='ACTIVE'
  join public.user_account u on u.id=pa.user_id and u.account_kind='INTERNAL' and u.status='ACTIVE'
  where s.instance_id=target_instance_id and pa.valid_from<=target_occurred_at and (pa.valid_until is null or pa.valid_until>target_occurred_at)
    and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at);
  insert into public.approval_participant(id,step_id,policy_participant_rule_id,participant_user_id,position_id_snapshot,role_id_snapshot,assignment_evidence_id,participant_order,required_for_completion,state,version_no)
  select extensions.gen_random_uuid(),s.id,pr.id,ra.user_id,
    (select pa.position_id from public.user_position_assignment pa join public.position pos on pos.id=pa.position_id and pos.status='ACTIVE' where pa.user_id=ra.user_id and pa.is_primary and pa.revoked_at is null and pa.valid_from<=target_occurred_at and (pa.valid_until is null or pa.valid_until>target_occurred_at) limit 1),
    ra.role_id,ra.id,pr.participant_order,pr.required_for_completion,'WAITING',0
  from public.approval_step s join public.approval_policy_participant_rule pr on pr.step_rule_id=s.policy_step_rule_id and pr.selector_kind='ROLE'
  join public.user_role_assignment ra on ra.role_id=pr.role_id and ra.revoked_at is null
  join public.role selected_role on selected_role.id=ra.role_id and selected_role.status='ACTIVE'
  join public.user_account u on u.id=ra.user_id and u.account_kind='INTERNAL' and u.status='ACTIVE'
  where s.instance_id=target_instance_id and ra.valid_from<=target_occurred_at and (ra.valid_until is null or ra.valid_until>target_occurred_at)
    and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at);
  if exists(select 1 from public.approval_step s where s.instance_id=target_instance_id and s.required and not exists(select 1 from public.approval_participant p where p.step_id=s.id)) then
    raise exception 'required approval step has no active participant' using errcode='23514';
  end if;
  if exists(select 1 from public.approval_step s join public.approval_participant ap on ap.step_id=s.id left join public.position p on p.id=ap.position_id_snapshot and p.status='ACTIVE'
    where s.instance_id=target_instance_id and s.step_role='APPROVAL' and coalesce(p.approval_capability,'NONE') not in ('OFFICIAL','REPRESENTATIVE')) then
    raise exception 'approval participant is not an official position' using errcode='42501';
  end if;
  select encode(extensions.digest(convert_to(string_agg(concat_ws(':',s.sequence_no,s.step_key,s.step_role,s.completion_mode,s.required,ap.participant_user_id,coalesce(ap.position_id_snapshot::text,''),coalesce(ap.role_id_snapshot::text,''),ap.assignment_evidence_id,ap.participant_order,ap.required_for_completion),'|' order by s.sequence_no,s.step_key,ap.participant_order),'UTF8'),'sha256'),'hex')
    into computed_line_checksum from public.approval_step s left join public.approval_participant ap on ap.step_id=s.id where s.instance_id=target_instance_id;
  update public.approval_instance set state='SUBMITTED',line_checksum=computed_line_checksum,version_no=next_version,submitted_at=target_occurred_at where id=target_instance_id;
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,'approval.instance.submit',target_instance_id,next_version,
    'EVT-APPROVAL-SUBMIT','DRAFT','SUBMITTED',null,target_occurred_at);
  insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,occurred_at)
    values(target_action_record_id,target_instance_id,target_audit_id,'SUBMIT','USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),target_occurred_at);
  perform app_private.enqueue_approval_event(target_outbox_id,target_audit_id,'EVT-APPROVAL-SUBMITTED',target_instance_id,next_version,'SUBMITTED',target_occurred_at);
  return next_version;
end $$;

create or replace function public.perform_change_approval_action(
  target_instance_id uuid,target_step_id uuid,target_participant_id uuid,target_event text,
  target_expected_instance_version bigint,target_expected_step_version bigint,target_expected_participant_version bigint,
  target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,
  target_reason_code text,target_opinion text,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare
  instance_row public.approval_instance%rowtype; step_row public.approval_step%rowtype; participant_row public.approval_participant%rowtype;
  permission_code text; audit_action text; transition_event text; outbox_event text; step_terminal text;
  next_version bigint; target_instance_state text:='IN_PROGRESS'; step_is_complete boolean; next_sequence integer;
  authority_row public.acting_authority_assignment%rowtype; selected_authority uuid:=app_private.current_acting_authority_id();
begin
  if target_event not in ('REVIEW','AGREE','APPROVE','REJECT','REFERENCE_RECEIPT') then raise exception 'unsupported approval action' using errcode='22023'; end if;
  permission_code:=case target_event when 'REVIEW' then 'approval.step.review' when 'AGREE' then 'approval.step.agree' when 'APPROVE' then 'approval.step.approve' when 'REFERENCE_RECEIPT' then 'approval.step.reference' else 'approval.step.reject' end;
  audit_action:=permission_code;
  transition_event:=case when target_event='REFERENCE_RECEIPT' then 'EVT-APPROVAL-REFERENCE' else 'EVT-APPROVAL-'||target_event end;
  outbox_event:=case target_event when 'REVIEW' then 'EVT-APPROVAL-REVIEWED' when 'AGREE' then 'EVT-APPROVAL-AGREED' when 'APPROVE' then 'EVT-APPROVAL-APPROVED' when 'REFERENCE_RECEIPT' then 'EVT-APPROVAL-REFERENCE-RECEIVED' else 'EVT-APPROVAL-REJECTED' end;
  step_terminal:=case target_event when 'REVIEW' then 'REVIEWED' when 'AGREE' then 'AGREED' when 'APPROVE' then 'APPROVED' when 'REFERENCE_RECEIPT' then 'REVIEWED' else 'REJECTED' end;
  perform app_private.assert_approval_request(target_occurred_at,permission_code);
  if target_event='REJECT' and target_reason_code is null then raise exception 'rejection reason is required' using errcode='23514'; end if;

  select * into strict instance_row from public.approval_instance where id=target_instance_id for update;
  if not exists(select 1 from public.approval_subject_change_request_version where instance_id=target_instance_id)
    and not exists(select 1 from public.approval_subject_change_order_version where instance_id=target_instance_id) then
    raise exception 'change Approval command requires an exact ECR/ECO subject' using errcode='23514';
  end if;
  select * into strict step_row from public.approval_step where id=target_step_id and instance_id=target_instance_id for update;
  select * into strict participant_row from public.approval_participant where id=target_participant_id and step_id=target_step_id for update;
  next_version:=app_private.next_version(instance_row.version_no,target_expected_instance_version);
  perform app_private.next_version(step_row.version_no,target_expected_step_version);
  perform app_private.next_version(participant_row.version_no,target_expected_participant_version);
  if instance_row.state<>'IN_PROGRESS' or step_row.state<>'ACTIVE' or participant_row.state<>'ACTIVE'
    or participant_row.participant_user_id<>app_private.current_effective_actor_user_id() then
    raise exception 'actor is not the active exact participant' using errcode='42501';
  end if;
  if (target_event='REVIEW' and step_row.step_role<>'REVIEW') or (target_event='AGREE' and step_row.step_role<>'AGREEMENT')
    or (target_event='APPROVE' and step_row.step_role<>'APPROVAL') or (target_event='REFERENCE_RECEIPT' and step_row.step_role<>'REFERENCE') then
    raise exception 'action does not match approval step role' using errcode='23514';
  end if;
  if target_event='APPROVE' and not exists(select 1 from public.user_position_assignment pa join public.position p on p.id=pa.position_id and p.status='ACTIVE'
    where pa.user_id=app_private.current_effective_actor_user_id() and pa.position_id=participant_row.position_id_snapshot and pa.is_primary and pa.revoked_at is null
      and pa.valid_from<=target_occurred_at and (pa.valid_until is null or pa.valid_until>target_occurred_at) and p.approval_capability in ('OFFICIAL','REPRESENTATIVE')) then
    raise exception 'official approval position required' using errcode='42501';
  end if;

  if app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id() then
    if selected_authority is null or not app_private.acting_authority_allows(permission_code,target_occurred_at) then raise exception 'active selected acting authority required' using errcode='42501'; end if;
    select * into strict authority_row from public.acting_authority_assignment a where a.id=selected_authority
      and a.authenticated_user_id=app_private.current_actor_user_id() and a.effective_actor_user_id=app_private.current_effective_actor_user_id()
      and a.revoked_at is null and a.valid_from<=target_occurred_at and a.valid_until>target_occurred_at for share;
  elsif selected_authority is not null then
    raise exception 'acting authority cannot be attached to a direct action' using errcode='42501';
  end if;

  update public.approval_participant set state='ACTED',version_no=version_no+1 where id=target_participant_id;
  if target_event='REJECT' then
    update public.approval_step set state=case when id=target_step_id then 'REJECTED' else 'CANCELLED' end,version_no=version_no+1
      where instance_id=target_instance_id and state in ('WAITING','ACTIVE');
    update public.approval_participant set state='CANCELLED',version_no=version_no+1
      where step_id in(select id from public.approval_step where instance_id=target_instance_id) and state in ('WAITING','ACTIVE');
    target_instance_state:='REJECTED';
  else
    select case
      when step_row.completion_mode='ANY_ONE' then true
      when step_row.completion_mode='SEQUENTIAL' then not exists(select 1 from public.approval_participant p where p.step_id=target_step_id and p.state='WAITING')
      when step_row.completion_mode='SPECIFIC' then not exists(select 1 from public.approval_participant p where p.step_id=target_step_id and p.required_for_completion and p.state<>'ACTED')
      else not exists(select 1 from public.approval_participant p where p.step_id=target_step_id and p.state<>'ACTED') end into step_is_complete;
    if step_row.completion_mode='SEQUENTIAL' and not step_is_complete then
      update public.approval_participant set state='ACTIVE',version_no=version_no+1 where id=(select id from public.approval_participant where step_id=target_step_id and state='WAITING' order by participant_order limit 1);
    end if;
    if step_is_complete then
      update public.approval_step set state=step_terminal,version_no=version_no+1 where id=target_step_id;
      update public.approval_participant set state='CANCELLED',version_no=version_no+1 where step_id=target_step_id and state='ACTIVE';
      if exists(select 1 from public.approval_step where instance_id=target_instance_id and sequence_no=step_row.sequence_no and state='ACTIVE') then
        next_sequence:=null;
      else
        select min(sequence_no) into next_sequence from public.approval_step where instance_id=target_instance_id and state='WAITING';
      end if;
      if next_sequence is not null then
        update public.approval_step set state='ACTIVE',version_no=version_no+1 where instance_id=target_instance_id and sequence_no=next_sequence and state='WAITING';
        update public.approval_participant p set state='ACTIVE',version_no=p.version_no+1 from public.approval_step s
          where s.id=p.step_id and s.instance_id=target_instance_id and s.sequence_no=next_sequence and s.state='ACTIVE' and p.state='WAITING'
            and (s.completion_mode<>'SEQUENTIAL' or p.participant_order=(select min(p2.participant_order) from public.approval_participant p2 where p2.step_id=s.id and p2.state='WAITING'));
      elsif not exists(select 1 from public.approval_step where instance_id=target_instance_id and required and state not in ('REVIEWED','AGREED','APPROVED','SKIPPED_BY_POLICY')) then
        if not exists(select 1 from app_private.approval_subject_snapshot(target_instance_id) s
          where s.subject_kind in ('CHANGE_REQUEST_VERSION','CHANGE_ORDER_VERSION') and s.subject_state='SEALED') then
          raise exception 'exact ECR/ECO subject version changed before completion' using errcode='23514';
        end if;
        target_instance_state:='COMPLETED';
        transition_event:='EVT-APPROVAL-APPROVE';
        outbox_event:='EVT-APPROVAL-COMPLETED';
      end if;
    end if;
  end if;

  update public.approval_instance set state=target_instance_state,version_no=next_version,
    completed_at=case when target_instance_state='COMPLETED' then target_occurred_at else completed_at end where id=target_instance_id;
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,audit_action,target_instance_id,next_version,
    transition_event,'IN_PROGRESS',target_instance_state,target_reason_code,target_occurred_at);
  insert into public.approval_action(id,instance_id,step_id,participant_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,
    acting_authority_id,acting_authority_evidence_id,reason_code,opinion,occurred_at)
  values(target_action_record_id,target_instance_id,target_step_id,target_participant_id,target_audit_id,target_event,'USER',app_private.current_actor_user_id(),
    app_private.current_effective_actor_user_id(),selected_authority,case when selected_authority is null then null else authority_row.evidence_id end,target_reason_code,target_opinion,target_occurred_at);
  perform app_private.enqueue_approval_event(target_outbox_id,target_audit_id,outbox_event,target_instance_id,next_version,target_instance_state,target_occurred_at);
  return next_version;
end $$;

create or replace function app_private.reject_m10_append_only_change()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin raise exception 'M10 evidence, target and history rows are append-only' using errcode='55000'; end $$;

create or replace function app_private.assert_exactly_one_change_target()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare target_count integer; begin
  select (select count(*) from public.change_order_requirement_target x where x.target_id=new.id)
    +(select count(*) from public.change_order_document_target x where x.target_id=new.id)
    +(select count(*) from public.change_order_deliverable_target x where x.target_id=new.id)
    +(select count(*) from public.change_order_inspection_checklist_target x where x.target_id=new.id)
    +(select count(*) from public.change_order_test_plan_target x where x.target_id=new.id)
    +(select count(*) from public.change_order_contract_target x where x.target_id=new.id) into target_count;
  if target_count<>1 then raise exception 'change target requires exactly one typed FK relation' using errcode='23514'; end if;
  return new;
end $$;
create constraint trigger change_target_exactly_one after insert on public.change_target deferrable initially deferred
  for each row execute function app_private.assert_exactly_one_change_target();

do $triggers$ declare table_name text; begin
  foreach table_name in array array[
    'ecr_impact_analysis','change_impact_assessment','change_impact_evidence','change_request_ncr_link','change_request_requirement_target','change_request_document_target',
    'change_request_review','emergency_change_exception','change_order_requirement_target','change_order_document_target',
    'change_target','change_order_deliverable_target','change_order_contract_target','change_order_inspection_checklist_target',
    'change_order_test_plan_target','change_order_applied_project_scope',
    'change_order_applied_contract_scope','change_order_implementation','change_order_verification','change_order_applied_serial',
    'change_order_applied_lot','change_order_verification_test_result','change_order_verification_inspection_attempt','change_order_retrospective_approval',
    'approval_subject_change_request_version','approval_subject_change_order_version',
    'change_request_approval_outcome','change_order_approval_outcome','change_approval_negative_outcome'
  ] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function app_private.reject_m10_append_only_change()',
      'm10_'||table_name||'_append_only',table_name);
  end loop;
end $triggers$;

create or replace function app_private.protect_m10_aggregate()
returns trigger language plpgsql set search_path=pg_catalog,app_private
as $$ begin
  if tg_op='DELETE' then raise exception 'ECR/ECO aggregate and version are retained' using errcode='55000'; end if;
  if app_private.optional_setting('app.m10_command') is distinct from
      case tg_table_name when 'change_request' then old.id::text when 'change_order' then old.id::text
        when 'change_request_version' then old.change_request_id::text else old.change_order_id::text end then
    raise exception 'ECR/ECO updates require a trusted command' using errcode='42501';
  end if;
  if tg_table_name in ('change_request_version','change_order_version') and old.state<>'DRAFT'
    and new is distinct from old then
    if (to_jsonb(new)-array['state','approval_instance_id']::text[])
        is distinct from (to_jsonb(old)-array['state','approval_instance_id']::text[])
      or new.state not in ('SEALED','APPROVED','REJECTED','RELEASED','SUPERSEDED') then
      raise exception 'sealed ECR/ECO version snapshot is immutable' using errcode='55000';
    end if;
  end if;
  return new;
end $$;
create trigger change_request_guard before update or delete on public.change_request for each row execute function app_private.protect_m10_aggregate();
create trigger change_request_version_guard before update or delete on public.change_request_version for each row execute function app_private.protect_m10_aggregate();
create trigger change_order_guard before update or delete on public.change_order for each row execute function app_private.protect_m10_aggregate();
create trigger change_order_version_guard before update or delete on public.change_order_version for each row execute function app_private.protect_m10_aggregate();

create or replace function app_private.m10_assert_internal(target_project_id uuid,target_contract_id uuid,target_permission text,target_time timestamptz)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.m08_assert_direct_internal(target_time,target_permission);
  if not app_private.actor_has_project_internal_scope(target_project_id,target_time)
    or (target_contract_id is not null and not app_private.actor_has_contract_internal_scope(target_contract_id,target_time)) then
    raise exception 'exact active internal Project/Contract scope required' using errcode='42501';
  end if;
end $$;

create or replace function app_private.m10_vendor_has_scope(target_project_id uuid,target_contract_id uuid,target_vendor_id uuid,target_permission text,target_time timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$ select target_time=app_private.request_time()
  and app_private.actor_has_project_vendor_scope(target_project_id,target_permission,target_time)
  and (target_contract_id is null or app_private.actor_has_contract_vendor_scope(target_contract_id,target_permission,target_time))
  and exists(select 1 from public.vendor_user vu where vu.user_id=app_private.current_actor_user_id()
    and app_private.actor_has_vendor_membership(vu.id,target_vendor_id,target_time)) $$;

create or replace function app_private.append_m10_transition(
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_action text,target_aggregate_type text,
  target_aggregate_id uuid,target_machine text,target_event text,target_schema text,target_from_state text,target_to_state text,
  target_from_version bigint,target_to_version bigint,target_reason text,target_time timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.append_audit(target_audit_id,target_action,target_aggregate_type,target_aggregate_id,target_to_version,'SUCCEEDED',
    coalesce(target_reason,target_event),null,null,null,null,target_time);
  perform app_private.append_state_transition(target_transition_id,target_audit_id,target_aggregate_type,target_aggregate_id,target_machine,target_event,
    target_from_state,target_to_state,target_from_version,target_to_version,coalesce(target_reason,target_event),null,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_time);
  perform app_private.enqueue_outbox(target_outbox_id,target_audit_id,target_event,target_aggregate_type,target_aggregate_id,target_to_version,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_schema,1,
    jsonb_build_object('aggregateId',target_aggregate_id,'resourceVersion',target_to_version,'eventId',target_event),
    target_event||':'||target_aggregate_id::text||':'||target_to_version::text,target_time,target_time);
end $$;

create or replace function app_private.apply_m10_approval_outcome()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions
as $$ declare request_link public.approval_subject_change_request_version%rowtype;
  order_link public.approval_subject_change_order_version%rowtype; request_row public.change_request%rowtype;
  order_row public.change_order%rowtype; terminal_action public.approval_action%rowtype; target_state text; target_event text; next_version bigint;
  amendment_needed boolean; approver_position_id uuid; begin
  if new.state=old.state then return new; end if;
  if old.state='DRAFT' and new.state='SUBMITTED' then
    select * into request_link from public.approval_subject_change_request_version where instance_id=new.id;
    if found then
      select * into strict request_row from public.change_request where id=request_link.change_request_id for update;
      if request_row.state<>'APPROVAL_PENDING' or request_row.current_version_id<>request_link.change_request_version_id
        or not exists(select 1 from public.change_request_version v where v.id=request_link.change_request_version_id
          and v.state='SEALED' and v.approval_instance_id is null) then
        raise exception 'submitted Approval does not match current sealed ECR' using errcode='23514';
      end if;
      perform set_config('app.m10_command',request_row.id::text,true);
      update public.change_request_version set approval_instance_id=new.id where id=request_link.change_request_version_id;
      return new;
    end if;
    select * into order_link from public.approval_subject_change_order_version where instance_id=new.id;
    if found then
      select * into strict order_row from public.change_order where id=order_link.change_order_id for update;
      if order_row.state<>'APPROVAL_PENDING' or order_row.current_version_id<>order_link.change_order_version_id
        or not exists(select 1 from public.change_order_version v where v.id=order_link.change_order_version_id
          and v.state='SEALED' and v.approval_instance_id is null) then
        raise exception 'submitted Approval does not match current sealed ECO' using errcode='23514';
      end if;
      perform set_config('app.m10_command',order_row.id::text,true);
      update public.change_order_version set approval_instance_id=new.id where id=order_link.change_order_version_id;
      return new;
    end if;
    return new;
  end if;
  if new.state in ('RECALLED','CANCELLED') then
    select * into strict terminal_action from public.approval_action where instance_id=new.id
      and event_id=case when new.state='RECALLED' then 'RECALL' else 'CANCEL' end order by occurred_at desc,id desc limit 1;
    select * into request_link from public.approval_subject_change_request_version where instance_id=new.id;
    if found then
      insert into public.change_approval_negative_outcome(approval_instance_id,subject_kind,change_request_version_id,outcome,
        approval_version,terminal_action_id,reason_code,recorded_at)
      values(new.id,'CHANGE_REQUEST_VERSION',request_link.change_request_version_id,new.state,new.version_no,terminal_action.id,
        coalesce(terminal_action.reason_code,'APPROVAL-'||new.state),terminal_action.occurred_at);
      return new;
    end if;
    select * into order_link from public.approval_subject_change_order_version where instance_id=new.id;
    if found then
      insert into public.change_approval_negative_outcome(approval_instance_id,subject_kind,change_order_version_id,outcome,
        approval_version,terminal_action_id,reason_code,recorded_at)
      values(new.id,'CHANGE_ORDER_VERSION',order_link.change_order_version_id,new.state,new.version_no,terminal_action.id,
        coalesce(terminal_action.reason_code,'APPROVAL-'||new.state),terminal_action.occurred_at);
    end if;
    return new;
  end if;
  if new.state not in ('COMPLETED','REJECTED') then return new; end if;
  select * into request_link from public.approval_subject_change_request_version where instance_id=new.id;
  if found then
    select * into strict request_row from public.change_request where id=request_link.change_request_id for update;
    if request_row.state<>'APPROVAL_PENDING' or request_row.current_version_id<>request_link.change_request_version_id then
      raise exception 'Approval outcome does not match current exact ECR snapshot' using errcode='23514';
    end if;
    select * into strict terminal_action from public.approval_action where instance_id=new.id
      and event_id=case when new.state='COMPLETED' then 'APPROVE' else 'REJECT' end order by occurred_at desc,id desc limit 1;
    select ap.position_id_snapshot into strict approver_position_id from public.approval_participant ap join public.position p
      on p.id=ap.position_id_snapshot and p.status='ACTIVE' and p.approval_capability in ('OFFICIAL','REPRESENTATIVE')
      and p.stable_code<>'POSITION_SENIOR_RESEARCHER' where ap.id=terminal_action.participant_id;
    target_state:=case when new.state='COMPLETED' then 'APPROVED' else 'REJECTED' end;
    target_event:=case when new.state='COMPLETED' then 'EVT-ECR-APPROVE' else 'EVT-ECR-REJECT' end;
    next_version:=request_row.version_no+1;
    perform set_config('app.m10_command',request_row.id::text,true);
    update public.change_request_version set state=target_state where id=request_link.change_request_version_id;
    update public.change_request set state=target_state,version_no=next_version,updated_at=coalesce(new.completed_at,terminal_action.occurred_at)
      where id=request_row.id;
    insert into public.change_request_approval_outcome(change_request_version_id,change_request_id,approval_instance_id,outcome,
      approval_version,policy_version_id,policy_version_no,policy_checksum,official_approver_user_id,official_approver_position_id,
      acting_authority_id,acting_authority_evidence_id,terminal_action_id,recorded_at)
    values(request_link.change_request_version_id,request_row.id,new.id,target_state,new.version_no,new.policy_version_id,new.policy_version_no,
      new.policy_checksum_snapshot,terminal_action.effective_actor_user_id,approver_position_id,terminal_action.acting_authority_id,
      terminal_action.acting_authority_evidence_id,terminal_action.id,coalesce(new.completed_at,terminal_action.occurred_at));
    if new.state='REJECTED' then
      insert into public.change_approval_negative_outcome(approval_instance_id,subject_kind,change_request_version_id,outcome,
        approval_version,terminal_action_id,reason_code,recorded_at)
      values(new.id,'CHANGE_REQUEST_VERSION',request_link.change_request_version_id,'REJECTED',new.version_no,terminal_action.id,
        coalesce(terminal_action.reason_code,'APPROVAL-REJECTED'),terminal_action.occurred_at);
    end if;
    perform app_private.append_m10_transition(extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),
      'change.request.approve','CHANGE_REQUEST',request_row.id,'SM-ECR-V1',target_event,'ECR_EVENT_REF','APPROVAL_PENDING',target_state,
      request_row.version_no,next_version,'ECR-EXACT-APPROVAL-OUTCOME',coalesce(new.completed_at,terminal_action.occurred_at));
    return new;
  end if;
  select * into order_link from public.approval_subject_change_order_version where instance_id=new.id;
  if found then
    select * into strict order_row from public.change_order where id=order_link.change_order_id for update;
    if order_row.current_version_id<>order_link.change_order_version_id then
      raise exception 'Approval outcome does not match current exact ECO snapshot' using errcode='23514';
    end if;
    select * into strict terminal_action from public.approval_action where instance_id=new.id
      and event_id=case when new.state='COMPLETED' then 'APPROVE' else 'REJECT' end order by occurred_at desc,id desc limit 1;
    select ap.position_id_snapshot into strict approver_position_id from public.approval_participant ap join public.position p
      on p.id=ap.position_id_snapshot and p.status='ACTIVE' and p.approval_capability in ('OFFICIAL','REPRESENTATIVE')
      and p.stable_code<>'POSITION_SENIOR_RESEARCHER' where ap.id=terminal_action.participant_id;
    if new.state='REJECTED' then
      insert into public.change_order_approval_outcome(change_order_version_id,change_order_id,approval_instance_id,outcome,
        approval_version,policy_version_id,policy_version_no,policy_checksum,official_approver_user_id,official_approver_position_id,
        acting_authority_id,acting_authority_evidence_id,terminal_action_id,recorded_at)
      values(order_link.change_order_version_id,order_row.id,new.id,'REJECTED',new.version_no,new.policy_version_id,new.policy_version_no,
        new.policy_checksum_snapshot,terminal_action.effective_actor_user_id,approver_position_id,terminal_action.acting_authority_id,
        terminal_action.acting_authority_evidence_id,terminal_action.id,coalesce(new.completed_at,terminal_action.occurred_at));
      insert into public.change_approval_negative_outcome(approval_instance_id,subject_kind,change_order_version_id,outcome,
        approval_version,terminal_action_id,reason_code,recorded_at)
      values(new.id,'CHANGE_ORDER_VERSION',order_link.change_order_version_id,'REJECTED',new.version_no,terminal_action.id,
        coalesce(terminal_action.reason_code,'APPROVAL-REJECTED'),terminal_action.occurred_at);
      -- OD-033: no canonical ECO negative-outcome state transition exists; retain Approval evidence and fail closed.
      return new;
    end if;
    if order_row.emergency_exception_id is not null then
      insert into public.change_order_retrospective_approval(change_order_version_id,change_order_id,emergency_exception_id,
        approval_instance_id,approval_version,official_approver_user_id,official_approver_position_id,terminal_action_id,completed_at)
      values(order_link.change_order_version_id,order_row.id,order_row.emergency_exception_id,new.id,new.version_no,
        terminal_action.effective_actor_user_id,approver_position_id,terminal_action.id,coalesce(new.completed_at,terminal_action.occurred_at));
      return new;
    end if;
    if order_row.state<>'APPROVAL_PENDING' then raise exception 'standard ECO is not pending release Approval' using errcode='23514'; end if;
    target_state:='RELEASED'; target_event:='EVT-ECO-RELEASE';
    if new.state='COMPLETED' then
      select v.changes_scope or v.changes_amount or v.changes_deadline or v.changes_acceptance_criteria into amendment_needed
        from public.change_order_version v where v.id=order_link.change_order_version_id;
      if amendment_needed and not exists(select 1 from public.change_order_contract_target t
        join public.contract_version cv on cv.id=t.after_contract_version_id and cv.state='SIGNED' and cv.version_kind='AMENDMENT'
        join public.contract_signature_evidence s on s.id=t.executed_signature_evidence_id and s.contract_version_id=cv.id
        where t.change_order_version_id=order_link.change_order_version_id and t.contract_id=order_row.contract_id) then
        raise exception 'signed executed change-contract amendment required before ECO release' using errcode='23514';
      end if;
    end if;
    next_version:=order_row.version_no+1;
    perform set_config('app.m10_command',order_row.id::text,true);
    update public.change_order_version set state=case when new.state='COMPLETED' then 'RELEASED' else state end
      where id=order_link.change_order_version_id;
    update public.change_order set state=target_state,version_no=next_version,
      updated_at=coalesce(new.completed_at,terminal_action.occurred_at) where id=order_row.id;
    insert into public.change_order_approval_outcome(change_order_version_id,change_order_id,approval_instance_id,outcome,
      approval_version,policy_version_id,policy_version_no,policy_checksum,official_approver_user_id,official_approver_position_id,
      acting_authority_id,acting_authority_evidence_id,terminal_action_id,recorded_at)
    values(order_link.change_order_version_id,order_row.id,new.id,'APPROVED',new.version_no,new.policy_version_id,new.policy_version_no,
      new.policy_checksum_snapshot,terminal_action.effective_actor_user_id,approver_position_id,terminal_action.acting_authority_id,
      terminal_action.acting_authority_evidence_id,terminal_action.id,coalesce(new.completed_at,terminal_action.occurred_at));
    perform app_private.append_m10_transition(extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),
      'change.order.manage','CHANGE_ORDER',order_row.id,'SM-ECO-V1',target_event,'ECO_EVENT_REF','APPROVAL_PENDING',target_state,
      order_row.version_no,next_version,'ECO-EXACT-APPROVAL-OUTCOME',coalesce(new.completed_at,terminal_action.occurred_at));
  end if;
  return new;
end $$;
create constraint trigger approval_instance_m10_subject_apply after update on public.approval_instance
  deferrable initially deferred for each row execute function app_private.apply_m10_approval_outcome();

create or replace function public.create_change_approval_instance(
  target_instance_id uuid,target_policy_version_id uuid,target_policy_checksum text,target_subject_kind text,target_subject_version_id uuid,
  target_prior_instance_id uuid,target_generation bigint,target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare policy_row public.approval_policy_version%rowtype; request_version public.change_request_version%rowtype;
  order_version public.change_order_version%rowtype; request_row public.change_request%rowtype; order_row public.change_order%rowtype; begin
  perform app_private.assert_approval_request(target_occurred_at,'approval.instance.submit');
  if target_subject_kind not in ('CHANGE_REQUEST_VERSION','CHANGE_ORDER_VERSION')
    or app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id()
    or app_private.current_acting_authority_id() is not null then
    raise exception 'direct exact ECR/ECO Approval creation required' using errcode='42501';
  end if;
  select v.* into strict policy_row from public.approval_policy_version v join public.approval_policy p on p.id=v.policy_id
    where v.id=target_policy_version_id and p.status='ACTIVE' and v.state='PUBLISHED' and v.subject_kind=target_subject_kind
      and v.checksum=target_policy_checksum and v.valid_from<=target_occurred_at
      and (v.valid_until is null or v.valid_until>target_occurred_at) for share;
  if target_subject_kind='CHANGE_REQUEST_VERSION' then
    select * into strict request_version from public.change_request_version where id=target_subject_version_id for update;
    select * into strict request_row from public.change_request where id=request_version.change_request_id for update;
    perform app_private.m10_assert_internal(request_row.project_id,request_row.contract_id,'change.request.manage',target_occurred_at);
    if request_row.state<>'APPROVAL_PENDING' or request_row.current_version_id<>request_version.id or request_version.state<>'SEALED'
      or request_version.snapshot_checksum is null or request_version.approval_instance_id is not null then
      raise exception 'current exact sealed ECR subject required' using errcode='23514';
    end if;
    if (target_prior_instance_id is null and target_generation<>1) or (target_prior_instance_id is not null and not exists(
      select 1 from public.approval_instance prior join public.approval_subject_change_request_version link on link.instance_id=prior.id
      join public.change_request_version previous_version on previous_version.id=link.change_request_version_id
      where prior.id=target_prior_instance_id and prior.state in ('REJECTED','RECALLED') and prior.generation+1=target_generation
        and previous_version.change_request_id=request_version.change_request_id and previous_version.id=request_version.prior_version_id
        and previous_version.version_no<request_version.version_no)) then
      raise exception 'invalid ECR Approval generation chain' using errcode='23514';
    end if;
  else
    select * into strict order_version from public.change_order_version where id=target_subject_version_id for update;
    select * into strict order_row from public.change_order where id=order_version.change_order_id for update;
    perform app_private.m10_assert_internal(order_row.project_id,order_row.contract_id,'change.order.manage',target_occurred_at);
    if order_row.state<>'APPROVAL_PENDING' or order_row.current_version_id<>order_version.id or order_version.state<>'SEALED'
      or order_version.snapshot_checksum is null or order_version.approval_instance_id is not null then
      raise exception 'current exact sealed ECO subject required' using errcode='23514';
    end if;
    if (target_prior_instance_id is null and target_generation<>1) or (target_prior_instance_id is not null and not exists(
      select 1 from public.approval_instance prior join public.approval_subject_change_order_version link on link.instance_id=prior.id
      join public.change_order_version previous_version on previous_version.id=link.change_order_version_id
      where prior.id=target_prior_instance_id and prior.state in ('REJECTED','RECALLED') and prior.generation+1=target_generation
        and previous_version.change_order_id=order_version.change_order_id and previous_version.id=order_version.prior_version_id
        and previous_version.version_no<order_version.version_no)) then
      raise exception 'invalid ECO Approval generation chain' using errcode='23514';
    end if;
  end if;
  insert into public.approval_instance(id,policy_version_id,policy_version_no,policy_checksum_snapshot,submitter_user_id,prior_instance_id,generation,state,version_no,created_at)
  values(target_instance_id,target_policy_version_id,policy_row.version_no,target_policy_checksum,app_private.current_effective_actor_user_id(),
    target_prior_instance_id,target_generation,'DRAFT',1,target_occurred_at);
  if target_subject_kind='CHANGE_REQUEST_VERSION' then
    insert into public.approval_subject_change_request_version(instance_id,change_request_version_id,change_request_id,subject_version_no,subject_checksum,subject_sealed_at)
    values(target_instance_id,request_version.id,request_version.change_request_id,request_version.version_no,request_version.snapshot_checksum,request_version.sealed_at);
  else
    insert into public.approval_subject_change_order_version(instance_id,change_order_version_id,change_order_id,subject_version_no,subject_checksum,subject_sealed_at)
    values(target_instance_id,order_version.id,order_version.change_order_id,order_version.version_no,order_version.snapshot_checksum,order_version.sealed_at);
  end if;
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,'approval.instance.create',target_instance_id,1,
    'EVT-APPROVAL-CREATE',null,'DRAFT',target_subject_kind,target_occurred_at);
  insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,occurred_at)
  values(target_action_record_id,target_instance_id,target_audit_id,'CREATE','USER',app_private.current_actor_user_id(),
    app_private.current_effective_actor_user_id(),target_occurred_at);
  return 1;
end $$;

create or replace function public.create_change_request(
  target_id uuid,target_version_id uuid,target_ecr_no text,target_project_id uuid,target_contract_id uuid,target_assigned_vendor_id uuid,
  target_owner_user_id uuid,target_title text,target_rationale text,target_summary text,target_priority text,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_time timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare account_type text; begin
  select account_kind into strict account_type from public.user_account where id=app_private.current_actor_user_id() and status='ACTIVE'
    and valid_from<=target_time and (valid_until is null or valid_until>target_time);
  if account_type='INTERNAL' then
    perform app_private.m10_assert_internal(target_project_id,target_contract_id,'change.request.create',target_time);
  elsif account_type='VENDOR' then
    if target_assigned_vendor_id is null or not app_private.m10_vendor_has_scope(target_project_id,target_contract_id,target_assigned_vendor_id,
      'change.request.create',target_time) then raise exception 'exact active Vendor Project/Contract scope and assignment required' using errcode='42501'; end if;
  else raise exception 'active ECR originator required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_account u where u.id=target_owner_user_id and u.account_kind='INTERNAL' and u.status='ACTIVE'
    and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time)) then
    raise exception 'active internal ECR owner required' using errcode='42501';
  end if;
  insert into public.change_request(id,ecr_no,project_id,contract_id,assigned_vendor_id,originator_user_id,owner_user_id,
    current_version_id,current_version_no,state,version_no,created_at,updated_at)
  values(target_id,target_ecr_no,target_project_id,target_contract_id,target_assigned_vendor_id,app_private.current_effective_actor_user_id(),
    target_owner_user_id,target_version_id,1,'DRAFT',1,target_time,target_time);
  insert into public.change_request_version(id,change_request_id,version_no,title,rationale,proposed_change_summary,priority,state,
    created_by_user_id,created_at) values(target_version_id,target_id,1,target_title,target_rationale,target_summary,target_priority,'DRAFT',
    app_private.current_effective_actor_user_id(),target_time);
  perform app_private.append_m10_transition(target_audit_id,target_transition_id,target_outbox_id,'change.request.create','CHANGE_REQUEST',target_id,
    'SM-ECR-V1','EVT-ECR-CREATE','ECR_EVENT_REF',null,'DRAFT',0,1,'ECR-CREATED',target_time);
  return target_id;
end $$;

create or replace function public.start_change_request_analysis(
  target_change_request_id uuid,target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_time timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare r public.change_request%rowtype; next_version bigint; account_type text; begin
  select * into strict r from public.change_request where id=target_change_request_id for update;
  select account_kind into strict account_type from public.user_account where id=app_private.current_actor_user_id() and status='ACTIVE';
  if account_type='INTERNAL' then
    if app_private.current_effective_actor_user_id()=r.originator_user_id then
      perform app_private.m10_assert_internal(r.project_id,r.contract_id,'change.request.create',target_time);
    else perform app_private.m10_assert_internal(r.project_id,r.contract_id,'change.request.manage',target_time); end if;
  elsif account_type='VENDOR' then
    if r.originator_user_id<>app_private.current_effective_actor_user_id() or not app_private.m10_vendor_has_scope(r.project_id,r.contract_id,
      r.assigned_vendor_id,'change.request.create',target_time) then raise exception 'exact Vendor ECR originator required' using errcode='42501'; end if;
  else raise exception 'active ECR originator or manager required' using errcode='42501'; end if;
  if r.state<>'DRAFT' then raise exception 'ECR draft required' using errcode='23514'; end if;
  next_version:=app_private.next_version(r.version_no,target_expected_version);
  perform set_config('app.m10_command',r.id::text,true);
  update public.change_request set state='IMPACT_ANALYSIS',version_no=next_version,updated_at=target_time where id=r.id;
  perform app_private.append_m10_transition(target_audit_id,target_transition_id,target_outbox_id,'change.impact.analyze','CHANGE_REQUEST',r.id,
    'SM-ECR-V1','EVT-ECR-START-ANALYSIS','ECR_EVENT_REF','DRAFT','IMPACT_ANALYSIS',r.version_no,next_version,
    'ECR-IMPACT-ANALYSIS-STARTED',target_time);
  return next_version;
end $$;

create or replace function public.add_change_impact(
  target_change_request_id uuid,target_impact_id uuid,target_kind text,target_effect text,target_severity text,target_analysis text,target_rationale text,
  target_cost_delta numeric,target_currency char(3),target_schedule_days integer,target_contract_amendment_required boolean,target_acceptance_change boolean,
  target_evidence_attachment_id uuid,
  target_audit_id uuid,target_time timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare r public.change_request%rowtype; sequence_value integer; evidence_row public.attachment%rowtype; begin
  select * into strict r from public.change_request where id=target_change_request_id for update;
  perform app_private.m10_assert_internal(r.project_id,r.contract_id,'change.impact.analyze',target_time);
  if r.state<>'IMPACT_ANALYSIS' then raise exception 'active impact analysis required' using errcode='55000'; end if;
  select coalesce(max(sequence_no),0)+1 into sequence_value from public.change_impact_assessment where change_request_version_id=r.current_version_id;
  if target_effect='AFFECTED' then
    select * into strict evidence_row from public.attachment where id=target_evidence_attachment_id and state='AVAILABLE';
  elsif target_evidence_attachment_id is not null then
    select * into strict evidence_row from public.attachment where id=target_evidence_attachment_id and state='AVAILABLE';
  end if;
  insert into public.change_impact_assessment(id,change_request_version_id,sequence_no,impact_kind,effect,severity,analysis,rationale,cost_delta,currency,
    schedule_delta_days,contract_amendment_required,acceptance_criteria_change,assessed_by_user_id,assessed_at)
  values(target_impact_id,r.current_version_id,sequence_value,target_kind,target_effect,target_severity,target_analysis,target_rationale,target_cost_delta,target_currency,
    target_schedule_days,target_contract_amendment_required,target_acceptance_change,app_private.current_effective_actor_user_id(),target_time);
  if target_evidence_attachment_id is not null then
    insert into public.change_impact_evidence(change_impact_assessment_id,attachment_id,attachment_row_version,attachment_checksum)
      values(target_impact_id,evidence_row.id,evidence_row.row_version,evidence_row.detected_sha256);
  end if;
  perform app_private.append_audit(target_audit_id,'change.impact.analyze','CHANGE_REQUEST',r.id,
    (select version_no from public.change_request where id=r.id),'SUCCEEDED','ECR-IMPACT-APPENDED',target_impact_id,null,null,null,target_time);
  return target_impact_id;
end $$;

create or replace function public.seal_change_request_for_review(
  target_change_request_id uuid,target_impact_analysis_id uuid,target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_time timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare r public.change_request%rowtype; v public.change_request_version%rowtype; next_version bigint; checksum text; begin
  select * into strict r from public.change_request where id=target_change_request_id for update;
  select * into strict v from public.change_request_version where id=r.current_version_id for update;
  perform app_private.m10_assert_internal(r.project_id,r.contract_id,'change.impact.analyze',target_time);
  if r.state<>'IMPACT_ANALYSIS' or v.state<>'DRAFT'
    or (select count(*) from public.change_impact_assessment i where i.change_request_version_id=v.id)<>6
    or exists(select 1 from unnest(array['COST','SCHEDULE','QUALITY','SAFETY','SECURITY','REGULATORY']) required(kind)
      where not exists(select 1 from public.change_impact_assessment i where i.change_request_version_id=v.id and i.impact_kind=required.kind))
    or exists(select 1 from public.change_impact_assessment i where i.change_request_version_id=v.id and i.effect='AFFECTED'
      and not exists(select 1 from public.change_impact_evidence e where e.change_impact_assessment_id=i.id)) then
    raise exception 'all six impact dimensions require one assessment and affected dimensions require exact evidence' using errcode='23514';
  end if;
  next_version:=app_private.next_version(r.version_no,target_expected_version);
  checksum:=app_private.canonical_json_sha256(jsonb_build_object('schema','CHANGE_REQUEST_VERSION_V1','id',v.id,'versionNo',v.version_no,
    'title',v.title,'rationale',v.rationale,'summary',v.proposed_change_summary,'priority',v.priority,
    'impacts',(select jsonb_agg(jsonb_build_object('id',i.id,'sequence',i.sequence_no,'kind',i.impact_kind,'severity',i.severity,
      'effect',i.effect,'analysis',i.analysis,'rationale',i.rationale,'costDelta',i.cost_delta,'currency',i.currency,'scheduleDays',i.schedule_delta_days,
      'contractAmendmentRequired',i.contract_amendment_required,'acceptanceChange',i.acceptance_criteria_change,
      'evidence',coalesce((select jsonb_agg(jsonb_build_object('attachmentId',e.attachment_id,'rowVersion',e.attachment_row_version,
        'checksum',e.attachment_checksum) order by e.attachment_id) from public.change_impact_evidence e
        where e.change_impact_assessment_id=i.id),'[]'::jsonb)) order by i.sequence_no)
      from public.change_impact_assessment i where i.change_request_version_id=v.id)));
  insert into public.ecr_impact_analysis(id,change_request_version_id,analysis_checksum,completed_by_user_id,completed_at)
    values(target_impact_analysis_id,v.id,checksum,app_private.current_effective_actor_user_id(),target_time);
  perform set_config('app.m10_command',r.id::text,true);
  update public.change_request_version set state='SEALED',snapshot_checksum=checksum,sealed_at=target_time,impact_analysis_id=target_impact_analysis_id where id=v.id;
  update public.change_request set state='REVIEW_PENDING',version_no=next_version,updated_at=target_time where id=r.id;
  perform app_private.append_m10_transition(target_audit_id,target_transition_id,target_outbox_id,'change.request.review','CHANGE_REQUEST',r.id,
    'SM-ECR-V1','EVT-ECR-SUBMIT-REVIEW','ECR_EVENT_REF','IMPACT_ANALYSIS','REVIEW_PENDING',r.version_no,next_version,
    'ECR-EXACT-SNAPSHOT-SEALED',target_time);
  return next_version;
end $$;

create or replace function public.record_change_request_review(
  target_change_request_id uuid,target_review_id uuid,target_disposition text,target_opinion text,target_expected_version bigint,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_time timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare r public.change_request%rowtype; next_version bigint; begin
  select * into strict r from public.change_request where id=target_change_request_id for update;
  perform app_private.m10_assert_internal(r.project_id,r.contract_id,'change.request.review',target_time);
  if r.state<>'REVIEW_PENDING' then raise exception 'ECR is not pending technical review' using errcode='23514'; end if;
  next_version:=app_private.next_version(r.version_no,target_expected_version);
  insert into public.change_request_review(id,change_request_id,change_request_version_id,reviewer_user_id,disposition,opinion,reviewed_at)
    values(target_review_id,r.id,r.current_version_id,app_private.current_effective_actor_user_id(),target_disposition,target_opinion,target_time);
  perform set_config('app.m10_command',r.id::text,true);
  update public.change_request set state=case when target_disposition='REJECT_RECOMMENDED' then 'REJECTED' else 'APPROVAL_PENDING' end,
    version_no=next_version,updated_at=target_time where id=r.id;
  perform app_private.append_m10_transition(target_audit_id,target_transition_id,target_outbox_id,'change.request.review','CHANGE_REQUEST',r.id,
    'SM-ECR-V1',case when target_disposition='REJECT_RECOMMENDED' then 'EVT-ECR-REJECT' else 'EVT-ECR-REVIEWED' end,'ECR_EVENT_REF',
    'REVIEW_PENDING',case when target_disposition='REJECT_RECOMMENDED' then 'REJECTED' else 'APPROVAL_PENDING' end,
    r.version_no,next_version,'ECR-TECHNICAL-REVIEW-RECORDED',target_time);
  return next_version;
end $$;

create or replace function public.authorize_emergency_change(
  target_id uuid,target_exception_root_id uuid,target_exception_version bigint,target_project_id uuid,target_contract_id uuid,target_vendor_id uuid,
  target_policy_version_id uuid,target_authority_code text,target_temporary_assignment_id uuid,target_temporary_user_id uuid,
  target_authorized_position_id uuid,target_reason_code text,target_justification text,target_risk_summary text,target_attachment_id uuid,
  target_valid_from timestamptz,target_valid_until timestamptz,target_retrospective_due_at timestamptz,target_audit_id uuid,target_outbox_id uuid,target_time timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare evidence_row public.attachment%rowtype; snapshot_checksum text; begin
  perform app_private.m10_assert_internal(target_project_id,target_contract_id,'change.order.emergency_release',target_time);
  select * into strict evidence_row from public.attachment a where a.id=target_attachment_id and a.state='AVAILABLE';
  if not exists(select 1 from public.approval_policy_version p where p.id=target_policy_version_id and p.state='PUBLISHED')
    or not exists(select 1 from public.acting_authority_assignment a where a.id=target_temporary_assignment_id
      and a.effective_actor_user_id=target_temporary_user_id and a.revoked_at is null
      and a.valid_from<=target_valid_from and (a.valid_until is null or a.valid_until>=target_valid_until))
    or target_time<target_valid_from or target_time>=target_valid_until or target_retrospective_due_at<=target_time then
    raise exception 'versioned emergency policy, authority, period and retrospective deadline required' using errcode='23514';
  end if;
  snapshot_checksum:=app_private.canonical_json_sha256(jsonb_build_object('schema','EMERGENCY_CHANGE_EXCEPTION_V1','id',target_id,
    'rootId',target_exception_root_id,'versionNo',target_exception_version,'projectId',target_project_id,'contractId',target_contract_id,
    'policyVersionId',target_policy_version_id,'authorityCode',target_authority_code,'temporaryAssignmentId',target_temporary_assignment_id,
    'temporaryUserId',target_temporary_user_id,'authorizedPositionId',target_authorized_position_id,'reasonCode',target_reason_code,
    'justification',target_justification,'riskSummary',target_risk_summary,'evidenceAttachmentId',target_attachment_id,
    'evidenceChecksum',evidence_row.detected_sha256,'validFrom',target_valid_from,'validUntil',target_valid_until,
    'retrospectiveDueAt',target_retrospective_due_at));
  perform app_private.append_audit(target_audit_id,'change.order.emergency_release','EMERGENCY_CHANGE_EXCEPTION',target_id,1,'SUCCEEDED',
    target_reason_code,target_attachment_id,null,null,null,target_time);
  insert into public.emergency_change_exception(id,exception_root_id,version_no,project_id,contract_id,assigned_vendor_id,policy_version_id,
    authority_code,temporary_authority_assignment_id,temporary_authority_user_id,authorized_by_position_id,reason_code,justification,risk_summary,
    evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum,valid_from,valid_until,retrospective_approval_due_at,
    sealed_snapshot_checksum,authorized_by_user_id,authorized_at,audit_log_id)
  values(target_id,target_exception_root_id,target_exception_version,target_project_id,target_contract_id,target_vendor_id,target_policy_version_id,
    target_authority_code,target_temporary_assignment_id,target_temporary_user_id,target_authorized_position_id,target_reason_code,target_justification,
    target_risk_summary,target_attachment_id,evidence_row.row_version,evidence_row.detected_sha256,target_valid_from,target_valid_until,
    target_retrospective_due_at,snapshot_checksum,app_private.current_effective_actor_user_id(),target_time,target_audit_id);
  perform app_private.enqueue_outbox(target_outbox_id,target_audit_id,'EVT-ECO-EMERGENCY-AUTHORIZED','EMERGENCY_CHANGE_EXCEPTION',target_id,1,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),'ECO_EMERGENCY_EVENT_REF',1,
    jsonb_build_object('emergencyExceptionId',target_id,'resourceVersion',1,'eventId','EVT-ECO-EMERGENCY-AUTHORIZED'),
    'EVT-ECO-EMERGENCY-AUTHORIZED:'||target_id::text||':1',target_time,target_time);
  return target_id;
end $$;

create or replace function public.add_change_order_requirement_target(
  target_change_order_id uuid,target_target_id uuid,target_requirement_id uuid,target_before_id uuid,target_before_no bigint,target_after_id uuid,target_after_no bigint,
  target_audit_id uuid,target_time timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare o public.change_order%rowtype; begin
  select * into strict o from public.change_order where id=target_change_order_id for update;
  perform app_private.m10_assert_internal(o.project_id,o.contract_id,'change.order.manage',target_time);
  if o.state<>'DRAFT' then raise exception 'ECO typed targets are sealed' using errcode='55000'; end if;
  insert into public.change_target(id,change_order_version_id,target_kind) values(target_target_id,o.current_version_id,'REQUIREMENT_REVISION');
  insert into public.change_order_requirement_target(target_id,change_order_version_id,requirement_id,before_revision_id,before_revision_no,
    after_revision_id,after_revision_no) values(target_target_id,o.current_version_id,target_requirement_id,target_before_id,target_before_no,target_after_id,target_after_no);
  perform app_private.append_audit(target_audit_id,'change.order.manage','CHANGE_ORDER',o.id,o.version_no,'SUCCEEDED',
    'ECO-REQUIREMENT-TARGET-BOUND',target_after_id,null,null,null,target_time);
end $$;

create or replace function public.add_change_order_document_target(
  target_change_order_id uuid,target_target_id uuid,target_document_id uuid,target_before_id uuid,target_before_no bigint,target_before_checksum text,
  target_after_id uuid,target_after_no bigint,target_after_checksum text,target_audit_id uuid,target_time timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare o public.change_order%rowtype; begin
  select * into strict o from public.change_order where id=target_change_order_id for update;
  perform app_private.m10_assert_internal(o.project_id,o.contract_id,'change.order.manage',target_time);
  if o.state<>'DRAFT' then raise exception 'ECO typed targets are sealed' using errcode='55000'; end if;
  insert into public.change_target(id,change_order_version_id,target_kind) values(target_target_id,o.current_version_id,'DOCUMENT_VERSION');
  insert into public.change_order_document_target(target_id,change_order_version_id,document_id,before_document_version_id,before_version_no,before_checksum,
    after_document_version_id,after_version_no,after_checksum) values(target_target_id,o.current_version_id,target_document_id,target_before_id,target_before_no,
    target_before_checksum,target_after_id,target_after_no,target_after_checksum);
  perform app_private.append_audit(target_audit_id,'change.order.manage','CHANGE_ORDER',o.id,o.version_no,'SUCCEEDED',
    'ECO-DOCUMENT-TARGET-BOUND',target_after_id,null,null,null,target_time);
end $$;

create or replace function public.add_change_order_deliverable_target(
  target_change_order_id uuid,target_target_id uuid,target_deliverable_id uuid,target_before_id uuid,target_before_no bigint,target_before_checksum text,
  target_after_id uuid,target_after_no bigint,target_after_checksum text,target_audit_id uuid,target_time timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare o public.change_order%rowtype; begin
  select * into strict o from public.change_order where id=target_change_order_id for update;
  perform app_private.m10_assert_internal(o.project_id,o.contract_id,'change.order.manage',target_time);
  if o.state<>'DRAFT' then raise exception 'ECO typed targets are sealed' using errcode='55000'; end if;
  insert into public.change_target(id,change_order_version_id,target_kind) values(target_target_id,o.current_version_id,'DELIVERABLE_VERSION');
  insert into public.change_order_deliverable_target(target_id,change_order_version_id,deliverable_id,before_deliverable_version_id,before_version_no,
    before_manifest_checksum,after_deliverable_version_id,after_version_no,after_manifest_checksum)
  values(target_target_id,o.current_version_id,target_deliverable_id,target_before_id,target_before_no,target_before_checksum,target_after_id,target_after_no,target_after_checksum);
  perform app_private.append_audit(target_audit_id,'change.order.manage','CHANGE_ORDER',o.id,o.version_no,'SUCCEEDED',
    'ECO-DELIVERABLE-TARGET-BOUND',target_after_id,null,null,null,target_time);
end $$;

create or replace function public.add_change_order_contract_target(
  target_change_order_id uuid,target_target_id uuid,target_contract_id uuid,target_before_id uuid,target_before_no bigint,target_before_checksum text,target_before_sealed_at timestamptz,
  target_after_id uuid,target_after_no bigint,target_after_checksum text,target_after_sealed_at timestamptz,target_signature_evidence_id uuid,
  target_audit_id uuid,target_time timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare o public.change_order%rowtype; begin
  select * into strict o from public.change_order where id=target_change_order_id for update;
  perform app_private.m10_assert_internal(o.project_id,o.contract_id,'change.order.manage',target_time);
  if o.state<>'DRAFT' or o.contract_id<>target_contract_id then raise exception 'exact contractual ECO draft required' using errcode='55000'; end if;
  insert into public.change_target(id,change_order_version_id,target_kind) values(target_target_id,o.current_version_id,'CONTRACT_VERSION');
  insert into public.change_order_contract_target(target_id,change_order_version_id,contract_id,before_contract_version_id,before_version_no,before_checksum,
    before_sealed_at,after_contract_version_id,after_version_no,after_checksum,after_sealed_at,executed_signature_evidence_id)
  values(target_target_id,o.current_version_id,target_contract_id,target_before_id,target_before_no,target_before_checksum,target_before_sealed_at,
    target_after_id,target_after_no,target_after_checksum,target_after_sealed_at,target_signature_evidence_id);
  perform app_private.append_audit(target_audit_id,'change.order.manage','CHANGE_ORDER',o.id,o.version_no,'SUCCEEDED',
    'ECO-SIGNED-CONTRACT-AMENDMENT-BOUND',target_signature_evidence_id,null,null,null,target_time);
end $$;

create or replace function public.add_change_order_inspection_checklist_target(
  target_change_order_id uuid,target_target_id uuid,target_inspection_id uuid,
  target_before_id uuid,target_before_no bigint,target_before_checksum text,target_before_sealed_at timestamptz,
  target_after_id uuid,target_after_no bigint,target_after_checksum text,target_after_sealed_at timestamptz,
  target_audit_id uuid,target_time timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare o public.change_order%rowtype; begin
  select * into strict o from public.change_order where id=target_change_order_id for update;
  perform app_private.m10_assert_internal(o.project_id,o.contract_id,'change.order.manage',target_time);
  if o.state<>'DRAFT' then raise exception 'ECO typed targets are sealed' using errcode='55000'; end if;
  insert into public.change_target(id,change_order_version_id,target_kind) values(target_target_id,o.current_version_id,'INSPECTION_CHECKLIST_VERSION');
  insert into public.change_order_inspection_checklist_target(target_id,change_order_version_id,inspection_id,before_version_id,before_version_no,
    before_checksum,before_sealed_at,after_version_id,after_version_no,after_checksum,after_sealed_at)
  values(target_target_id,o.current_version_id,target_inspection_id,target_before_id,target_before_no,target_before_checksum,target_before_sealed_at,
    target_after_id,target_after_no,target_after_checksum,target_after_sealed_at);
  perform app_private.append_audit(target_audit_id,'change.order.manage','CHANGE_ORDER',o.id,o.version_no,'SUCCEEDED',
    'ECO-INSPECTION-CHECKLIST-TARGET-BOUND',target_after_id,null,null,null,target_time);
end $$;

create or replace function public.add_change_order_test_plan_target(
  target_change_order_id uuid,target_target_id uuid,target_test_plan_id uuid,
  target_before_id uuid,target_before_no bigint,target_before_checksum text,target_before_sealed_at timestamptz,
  target_after_id uuid,target_after_no bigint,target_after_checksum text,target_after_sealed_at timestamptz,
  target_audit_id uuid,target_time timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare o public.change_order%rowtype; begin
  select * into strict o from public.change_order where id=target_change_order_id for update;
  perform app_private.m10_assert_internal(o.project_id,o.contract_id,'change.order.manage',target_time);
  if o.state<>'DRAFT' then raise exception 'ECO typed targets are sealed' using errcode='55000'; end if;
  insert into public.change_target(id,change_order_version_id,target_kind) values(target_target_id,o.current_version_id,'TEST_PLAN');
  insert into public.change_order_test_plan_target(target_id,change_order_version_id,test_plan_id,before_version_id,before_version_no,
    before_checksum,before_sealed_at,after_version_id,after_version_no,after_checksum,after_sealed_at)
  values(target_target_id,o.current_version_id,target_test_plan_id,target_before_id,target_before_no,target_before_checksum,target_before_sealed_at,
    target_after_id,target_after_no,target_after_checksum,target_after_sealed_at);
  perform app_private.append_audit(target_audit_id,'change.order.manage','CHANGE_ORDER',o.id,o.version_no,'SUCCEEDED',
    'ECO-TEST-PLAN-TARGET-BOUND',target_after_id,null,null,null,target_time);
end $$;

create or replace function public.create_change_order(
  target_id uuid,target_version_id uuid,target_eco_no text,target_change_request_id uuid,target_emergency_exception_id uuid,
  target_project_id uuid,target_contract_id uuid,target_vendor_id uuid,target_owner_user_id uuid,target_title text,target_instruction text,
  target_implementation_plan text,target_verification_plan text,target_retest_required boolean,target_reinspection_required boolean,
  target_changes_scope boolean,target_changes_amount boolean,target_changes_deadline boolean,target_changes_acceptance boolean,target_expected_ecr_version bigint,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_ecr_audit_id uuid,target_ecr_transition_id uuid,target_ecr_outbox_id uuid,target_time timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare request_row public.change_request%rowtype; request_version uuid; request_version_no bigint; basis_count integer:=0; begin
  perform app_private.m10_assert_internal(target_project_id,target_contract_id,'change.order.manage',target_time);
  if target_change_request_id is not null then
    select * into strict request_row from public.change_request where id=target_change_request_id for update;
    if request_row.project_id<>target_project_id or request_row.contract_id is distinct from target_contract_id or request_row.state<>'APPROVED'
      or request_row.version_no<>target_expected_ecr_version or not exists(select 1 from public.change_request_approval_outcome o
        where o.change_request_id=request_row.id and o.change_request_version_id=request_row.current_version_id and o.outcome='APPROVED') then
      raise exception 'exact approved ECR required' using errcode='23514';
    end if;
    request_version:=request_row.current_version_id; request_version_no:=request_row.current_version_no; basis_count:=basis_count+1;
  end if;
  if target_emergency_exception_id is not null and exists(select 1 from public.emergency_change_exception e
    where e.id=target_emergency_exception_id and e.project_id=target_project_id and e.contract_id is not distinct from target_contract_id
      and e.valid_from<=target_time and e.valid_until>target_time and e.retrospective_approval_due_at>target_time) then
    basis_count:=basis_count+1;
  end if;
  if basis_count<>1 then raise exception 'exact approved ECR or audited emergency exception required' using errcode='23514'; end if;
  insert into public.change_order(id,eco_no,change_request_id,approved_change_request_version_id,emergency_exception_id,project_id,contract_id,
    assigned_vendor_id,owner_user_id,current_version_id,current_version_no,state,version_no,created_at,updated_at)
  values(target_id,target_eco_no,target_change_request_id,request_version,target_emergency_exception_id,target_project_id,target_contract_id,
    target_vendor_id,target_owner_user_id,target_version_id,1,'DRAFT',1,target_time,target_time);
  if (target_changes_scope or target_changes_amount or target_changes_deadline or target_changes_acceptance) and target_contract_id is null then
    raise exception 'contract-affecting ECO requires exact Contract scope' using errcode='23514'; end if;
  insert into public.change_order_version(id,change_order_id,version_no,origin_kind,origin_change_request_version_id,origin_emergency_exception_id,
    title,instruction_summary,implementation_plan,verification_plan,
    retest_required,reinspection_required,changes_scope,changes_amount,changes_deadline,changes_acceptance_criteria,state,created_by_user_id,created_at)
  values(target_version_id,target_id,1,case when request_version is not null then 'APPROVED_ECR' else 'EMERGENCY_EXCEPTION' end,
    request_version,target_emergency_exception_id,target_title,target_instruction,target_implementation_plan,target_verification_plan,target_retest_required,
    target_reinspection_required,target_changes_scope,target_changes_amount,target_changes_deadline,target_changes_acceptance,
    'DRAFT',app_private.current_effective_actor_user_id(),target_time);
  insert into public.change_order_applied_project_scope(change_order_version_id,project_id) values(target_version_id,target_project_id);
  if target_contract_id is not null then insert into public.change_order_applied_contract_scope(change_order_version_id,contract_id,project_id)
    values(target_version_id,target_contract_id,target_project_id); end if;
  perform app_private.append_m10_transition(target_audit_id,target_transition_id,target_outbox_id,'change.order.manage','CHANGE_ORDER',target_id,
    'SM-ECO-V1','EVT-ECO-CREATE','ECO_EVENT_REF',null,'DRAFT',0,1,'ECO-CREATED-WITH-EXACT-BASIS',target_time);
  if target_change_request_id is not null then
    perform set_config('app.m10_command',request_row.id::text,true);
    update public.change_request set state='CONVERTED_TO_ECO',version_no=version_no+1,updated_at=target_time where id=request_row.id;
    perform app_private.append_m10_transition(target_ecr_audit_id,target_ecr_transition_id,target_ecr_outbox_id,'change.order.manage','CHANGE_REQUEST',request_row.id,
      'SM-ECR-V1','EVT-ECR-CREATE-ECO','ECR_EVENT_REF','APPROVED','CONVERTED_TO_ECO',request_row.version_no,request_row.version_no+1,
      'ECR-CONVERTED-TO-EXACT-ECO',target_time);
  end if;
  return target_id;
end $$;

create or replace function public.seal_change_order_for_approval(
  target_change_order_id uuid,target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_time timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare o public.change_order%rowtype; v public.change_order_version%rowtype; next_version bigint; checksum text; amendment_needed boolean; begin
  select * into strict o from public.change_order where id=target_change_order_id for update;
  select * into strict v from public.change_order_version where id=o.current_version_id for update;
  perform app_private.m10_assert_internal(o.project_id,o.contract_id,'change.order.manage',target_time);
  if o.state<>'DRAFT' or v.state<>'DRAFT' then raise exception 'ECO draft required' using errcode='23514'; end if;
  if not exists(select 1 from public.change_target t where t.change_order_version_id=v.id) then
    raise exception 'at least one exact typed ECO target required' using errcode='23514';
  end if;
  amendment_needed:=v.changes_scope or v.changes_amount or v.changes_deadline or v.changes_acceptance_criteria;
  if amendment_needed and not exists(select 1 from public.change_order_contract_target t
    join public.contract_version cv on cv.id=t.after_contract_version_id and cv.state='SIGNED' and cv.version_kind='AMENDMENT'
    join public.contract_signature_evidence s on s.id=t.executed_signature_evidence_id and s.contract_version_id=cv.id
    where t.change_order_version_id=v.id and t.contract_id=o.contract_id) then
    raise exception 'signed executed change-contract amendment required' using errcode='23514';
  end if;
  if exists(select 1 from public.change_order_document_target t join public.document_version d on d.id=t.after_document_version_id
      where t.change_order_version_id=v.id and d.state not in ('APPROVED','SUPERSEDED'))
    or exists(select 1 from public.change_order_deliverable_target t join public.deliverable d on d.id=t.deliverable_id
      where t.change_order_version_id=v.id and d.state not in ('ACCEPTED','SUPERSEDED'))
    or exists(select 1 from public.change_order_inspection_checklist_target t join public.inspection_checklist_version x on x.id=t.after_version_id
      where t.change_order_version_id=v.id and x.state<>'SEALED')
    or exists(select 1 from public.change_order_test_plan_target t join public.test_plan_version x on x.id=t.after_version_id
      where t.change_order_version_id=v.id and x.state<>'SEALED') then
    raise exception 'ECO targets must be approved or finalized immutable revisions' using errcode='23514';
  end if;
  next_version:=app_private.next_version(o.version_no,target_expected_version);
  checksum:=app_private.canonical_json_sha256(jsonb_build_object('schema','CHANGE_ORDER_VERSION_V1','id',v.id,'versionNo',v.version_no,
    'title',v.title,'instruction',v.instruction_summary,'implementationPlan',v.implementation_plan,'verificationPlan',v.verification_plan,
    'retestRequired',v.retest_required,'reinspectionRequired',v.reinspection_required,'changesScope',v.changes_scope,
    'changesAmount',v.changes_amount,'changesDeadline',v.changes_deadline,'changesAcceptance',v.changes_acceptance_criteria,
    'targets',(select jsonb_agg(jsonb_build_object('targetId',t.id,'kind',t.target_kind,
      'beforeId',coalesce(r.before_revision_id,d.before_document_version_id,l.before_deliverable_version_id,
        c.before_contract_version_id,ic.before_version_id,tp.before_version_id),
      'afterId',coalesce(r.after_revision_id,d.after_document_version_id,l.after_deliverable_version_id,
        c.after_contract_version_id,ic.after_version_id,tp.after_version_id)) order by t.id)
      from public.change_target t
      left join public.change_order_requirement_target r on r.target_id=t.id
      left join public.change_order_document_target d on d.target_id=t.id
      left join public.change_order_deliverable_target l on l.target_id=t.id
      left join public.change_order_contract_target c on c.target_id=t.id
      left join public.change_order_inspection_checklist_target ic on ic.target_id=t.id
      left join public.change_order_test_plan_target tp on tp.target_id=t.id
      where t.change_order_version_id=v.id)));
  perform set_config('app.m10_command',o.id::text,true);
  update public.change_order_version set state='SEALED',snapshot_checksum=checksum,sealed_at=target_time where id=v.id;
  update public.change_order set state='APPROVAL_PENDING',version_no=next_version,updated_at=target_time where id=o.id;
  perform app_private.append_m10_transition(target_audit_id,target_transition_id,target_outbox_id,'change.order.manage','CHANGE_ORDER',o.id,
    'SM-ECO-V1','EVT-ECO-SUBMIT','ECO_EVENT_REF','DRAFT','APPROVAL_PENDING',o.version_no,next_version,'ECO-EXACT-SNAPSHOT-SEALED',target_time);
  return next_version;
end $$;

create or replace function public.release_emergency_change_order(
  target_change_order_id uuid,target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_time timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare o public.change_order%rowtype; e public.emergency_change_exception%rowtype; next_version bigint; begin
  select * into strict o from public.change_order where id=target_change_order_id for update;
  select * into strict e from public.emergency_change_exception where id=o.emergency_exception_id for share;
  perform app_private.m10_assert_internal(o.project_id,o.contract_id,'change.order.emergency_release',target_time);
  if o.state<>'APPROVAL_PENDING' or app_private.current_effective_actor_user_id()<>e.temporary_authority_user_id
    or target_time<e.valid_from or target_time>=e.valid_until then
    raise exception 'exact active emergency temporary authority required' using errcode='42501';
  end if;
  next_version:=app_private.next_version(o.version_no,target_expected_version);
  perform set_config('app.m10_command',o.id::text,true);
  update public.change_order_version set state='RELEASED' where id=o.current_version_id;
  update public.change_order set state='RELEASED',version_no=next_version,updated_at=target_time where id=o.id;
  perform app_private.append_m10_transition(target_audit_id,target_transition_id,target_outbox_id,'change.order.emergency_release','CHANGE_ORDER',o.id,
    'SM-ECO-V1','EVT-ECO-RELEASE','ECO_EVENT_REF','APPROVAL_PENDING','RELEASED',o.version_no,next_version,
    'ECO-EMERGENCY-TEMPORARY-AUTHORITY-RELEASE',target_time);
  return next_version;
end $$;

create or replace function public.record_change_order_implementation(
  target_change_order_id uuid,target_implementation_id uuid,target_target_id uuid,target_summary text,target_attachment_id uuid,target_expected_version bigint,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_time timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare o public.change_order%rowtype; next_version bigint; sequence_value integer; account_type text; vendor_id uuid;
  evidence_row public.attachment%rowtype; begin
  select * into strict o from public.change_order where id=target_change_order_id for update;
  select account_kind into strict account_type from public.user_account where id=app_private.current_actor_user_id() and status='ACTIVE';
  if account_type='INTERNAL' then perform app_private.m10_assert_internal(o.project_id,o.contract_id,'change.order.implement',target_time);
  elsif account_type='VENDOR' and app_private.m10_vendor_has_scope(o.project_id,o.contract_id,o.assigned_vendor_id,'change.order.implement',target_time)
    then vendor_id:=o.assigned_vendor_id;
  else raise exception 'exact active ECO implementer scope required' using errcode='42501'; end if;
  select * into evidence_row from public.attachment a where a.id=target_attachment_id and a.state='AVAILABLE';
  if o.state not in ('RELEASED','IMPLEMENTING') or evidence_row.id is null
    or not exists(select 1 from public.change_target t where t.id=target_target_id and t.change_order_version_id=o.current_version_id) then
    raise exception 'released ECO and available implementation evidence required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(o.version_no,target_expected_version);
  select coalesce(max(sequence_no),0)+1 into sequence_value from public.change_order_implementation where change_order_id=o.id;
  insert into public.change_order_implementation(id,change_order_id,change_order_version_id,target_id,sequence_no,performed_by_user_id,
    performed_for_vendor_id,result_summary,evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum,performed_at)
  values(target_implementation_id,o.id,o.current_version_id,target_target_id,sequence_value,app_private.current_effective_actor_user_id(),vendor_id,target_summary,
    target_attachment_id,evidence_row.row_version,evidence_row.detected_sha256,target_time);
  perform set_config('app.m10_command',o.id::text,true);
  update public.change_order set state='IMPLEMENTING',version_no=next_version,updated_at=target_time where id=o.id;
  perform app_private.append_m10_transition(target_audit_id,target_transition_id,target_outbox_id,'change.order.implement','CHANGE_ORDER',o.id,
    'SM-ECO-V1',case when o.state='RELEASED' then 'EVT-ECO-START' else 'EVT-ECO-IMPLEMENT-TARGET' end,'ECO_EVENT_REF',
    o.state,'IMPLEMENTING',o.version_no,next_version,'ECO-IMPLEMENTATION-EVIDENCE-APPENDED',target_time);
  return next_version;
end $$;

create or replace function public.transition_change_order(
  target_change_order_id uuid,target_event text,target_expected_version bigint,target_reason text,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_time timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare o public.change_order%rowtype; next_state text; action_code text; next_version bigint; begin
  select * into strict o from public.change_order where id=target_change_order_id for update;
  action_code:=case target_event when 'EVT-ECO-SUBMIT-VERIFY' then 'change.order.implement'
    when 'EVT-ECO-CLOSE' then 'change.order.manage' when 'EVT-ECO-SUSPEND' then 'change.order.manage' else 'change.order.manage' end;
  perform app_private.m10_assert_internal(o.project_id,o.contract_id,action_code,target_time);
  next_state:=case when target_event='EVT-ECO-SUBMIT-VERIFY' and o.state='IMPLEMENTING'
      and not exists(select 1 from public.change_target t where t.change_order_version_id=o.current_version_id
        and not exists(select 1 from public.change_order_implementation i where i.change_order_id=o.id and i.target_id=t.id)) then 'VERIFICATION_PENDING'
    when target_event='EVT-ECO-CLOSE' and o.state='EFFECTIVE' then 'CLOSED'
    when target_event='EVT-ECO-SUSPEND' and o.state in ('RELEASED','IMPLEMENTING') and nullif(btrim(target_reason),'') is not null then 'SUSPENDED'
    else null end;
  if next_state is null then raise exception 'unsupported ECO transition or missing evidence' using errcode='23514'; end if;
  next_version:=app_private.next_version(o.version_no,target_expected_version);
  perform set_config('app.m10_command',o.id::text,true);
  update public.change_order set state=next_state,version_no=next_version,updated_at=target_time where id=o.id;
  perform app_private.append_m10_transition(target_audit_id,target_transition_id,target_outbox_id,action_code,'CHANGE_ORDER',o.id,'SM-ECO-V1',
    target_event,'ECO_EVENT_REF',o.state,next_state,o.version_no,next_version,coalesce(target_reason,target_event),target_time);
  return next_version;
end $$;

create or replace function public.verify_change_order_effectiveness(
  target_change_order_id uuid,target_verification_id uuid,target_result text,target_summary text,target_attachment_id uuid,
  target_serial_numbers text[],target_lot_numbers text[],target_test_result_id uuid,target_inspection_attempt_id uuid,
  target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_time timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare o public.change_order%rowtype; v public.change_order_version%rowtype; next_version bigint; evidence_row public.attachment%rowtype; begin
  select * into strict o from public.change_order where id=target_change_order_id for update;
  select * into strict v from public.change_order_version where id=o.current_version_id for share;
  perform app_private.m10_assert_internal(o.project_id,o.contract_id,'change.order.verify',target_time);
  select * into evidence_row from public.attachment where id=target_attachment_id and state='AVAILABLE';
  if o.state<>'VERIFICATION_PENDING' or target_result<>'EFFECTIVE'
    or o.owner_user_id=app_private.current_effective_actor_user_id()
    or exists(select 1 from public.change_order_implementation i where i.change_order_id=o.id
      and i.performed_by_user_id=app_private.current_effective_actor_user_id())
    or evidence_row.id is null
    or cardinality(coalesce(target_serial_numbers,array[]::text[]))+cardinality(coalesce(target_lot_numbers,array[]::text[]))=0
    or exists(select 1 from public.change_target t where t.change_order_version_id=o.current_version_id
      and not exists(select 1 from public.change_order_implementation i where i.change_order_id=o.id and i.target_id=t.id))
    or (target_test_result_id is not null and not exists(select 1 from public.test_result t where t.id=target_test_result_id and t.state='SEALED'))
    or (target_inspection_attempt_id is not null and not exists(select 1 from public.inspection_attempt a where a.id=target_inspection_attempt_id and a.state='SEALED'))
    or (v.retest_required and target_test_result_id is null) or (v.reinspection_required and target_inspection_attempt_id is null)
    or ((v.changes_scope or v.changes_amount or v.changes_deadline or v.changes_acceptance_criteria)
      and not exists(select 1 from public.change_order_contract_target c join public.contract_version cv
        on cv.id=c.after_contract_version_id and cv.state='SIGNED' and cv.version_kind='AMENDMENT'
        where c.change_order_version_id=v.id))
    or (o.emergency_exception_id is not null and not exists(select 1 from public.change_order_retrospective_approval r
      where r.change_order_id=o.id and r.change_order_version_id=o.current_version_id
        and r.completed_at<=(select e.retrospective_approval_due_at from public.emergency_change_exception e where e.id=o.emergency_exception_id))) then
    raise exception 'independent verifier and effective evidence required' using errcode='42501';
  end if;
  next_version:=app_private.next_version(o.version_no,target_expected_version);
  insert into public.change_order_verification(id,change_order_id,change_order_version_id,verifier_user_id,result,summary,evidence_attachment_id,
    evidence_attachment_row_version,evidence_attachment_checksum,verified_at)
  values(target_verification_id,o.id,o.current_version_id,app_private.current_effective_actor_user_id(),target_result,target_summary,
    target_attachment_id,evidence_row.row_version,evidence_row.detected_sha256,target_time);
  insert into public.change_order_applied_serial(change_order_verification_id,serial_number)
    select target_verification_id,value from unnest(coalesce(target_serial_numbers,array[]::text[])) value;
  insert into public.change_order_applied_lot(change_order_verification_id,lot_number)
    select target_verification_id,value from unnest(coalesce(target_lot_numbers,array[]::text[])) value;
  if target_test_result_id is not null then insert into public.change_order_verification_test_result(change_order_verification_id,test_result_id)
    values(target_verification_id,target_test_result_id); end if;
  if target_inspection_attempt_id is not null then insert into public.change_order_verification_inspection_attempt(change_order_verification_id,inspection_attempt_id)
    values(target_verification_id,target_inspection_attempt_id); end if;
  perform set_config('app.m10_command',o.id::text,true);
  update public.change_order set state='EFFECTIVE',version_no=next_version,updated_at=target_time where id=o.id;
  perform app_private.append_m10_transition(target_audit_id,target_transition_id,target_outbox_id,'change.order.verify','CHANGE_ORDER',o.id,
    'SM-ECO-V1','EVT-ECO-VERIFY','ECO_EVENT_REF','VERIFICATION_PENDING','EFFECTIVE',o.version_no,next_version,
    'ECO-INDEPENDENT-VERIFICATION-EFFECTIVE',target_time);
  return next_version;
end $$;

create or replace function public.read_vendor_change_request(target_id uuid,target_time timestamptz)
returns table(change_request_id uuid,ecr_no text,project_id uuid,contract_id uuid,title text,state text,version_no bigint)
language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ declare r public.change_request%rowtype; begin
  select * into r from public.change_request where id=target_id;
  if not found or not app_private.m10_vendor_has_scope(r.project_id,r.contract_id,r.assigned_vendor_id,'change.request.read',target_time) then return; end if;
  return query select r.id,r.ecr_no,r.project_id,r.contract_id,v.title,r.state,r.version_no
    from public.change_request_version v where v.id=r.current_version_id;
end $$;

create or replace function public.read_vendor_change_order(target_id uuid,target_time timestamptz)
returns table(change_order_id uuid,eco_no text,project_id uuid,contract_id uuid,title text,state text,version_no bigint,instruction_summary text)
language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ declare o public.change_order%rowtype; begin
  select * into o from public.change_order where id=target_id;
  if not found or not app_private.m10_vendor_has_scope(o.project_id,o.contract_id,o.assigned_vendor_id,'change.order.read',target_time) then return; end if;
  return query select o.id,o.eco_no,o.project_id,o.contract_id,v.title,o.state,o.version_no,v.instruction_summary
    from public.change_order_version v where v.id=o.current_version_id and o.state in ('RELEASED','IMPLEMENTING','VERIFICATION_PENDING','EFFECTIVE','CLOSED','SUSPENDED');
end $$;

create index change_request_scope_idx on public.change_request(project_id,contract_id,assigned_vendor_id,state);
create index change_impact_kind_idx on public.change_impact_assessment(change_request_version_id,impact_kind);
create index change_order_scope_idx on public.change_order(project_id,contract_id,assigned_vendor_id,state);
create index change_order_implementation_idx on public.change_order_implementation(change_order_id,sequence_no);

do $rls$ declare table_name text; begin
  foreach table_name in array array[
    'change_request','change_request_version','ecr_impact_analysis','change_impact_assessment','change_impact_evidence','change_request_ncr_link','change_request_requirement_target',
    'change_request_document_target','change_request_review','emergency_change_exception','change_order','change_order_version',
    'change_target','change_order_requirement_target','change_order_document_target','change_order_deliverable_target','change_order_contract_target',
    'change_order_inspection_checklist_target','change_order_test_plan_target','change_order_applied_project_scope',
    'change_order_applied_contract_scope','change_order_implementation','change_order_verification','change_order_applied_serial',
    'change_order_applied_lot','change_order_verification_test_result','change_order_verification_inspection_attempt',
    'change_order_retrospective_approval','approval_subject_change_request_version','approval_subject_change_order_version',
    'change_request_approval_outcome','change_order_approval_outcome','change_approval_negative_outcome'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
  end loop;
end $rls$;

create policy change_request_internal_read on public.change_request for select to youone_request using(
  app_private.actor_has_project_internal_scope(project_id,app_private.request_time())
  and (contract_id is null or app_private.actor_has_contract_internal_scope(contract_id,app_private.request_time())));
create policy change_request_version_internal_read on public.change_request_version for select to youone_request using(exists(
  select 1 from public.change_request r where r.id=change_request_id and app_private.actor_has_project_internal_scope(r.project_id,app_private.request_time())
    and (r.contract_id is null or app_private.actor_has_contract_internal_scope(r.contract_id,app_private.request_time()))));
create policy change_order_internal_read on public.change_order for select to youone_request using(
  app_private.actor_has_project_internal_scope(project_id,app_private.request_time())
  and (contract_id is null or app_private.actor_has_contract_internal_scope(contract_id,app_private.request_time())));
create policy change_order_version_internal_read on public.change_order_version for select to youone_request using(exists(
  select 1 from public.change_order o where o.id=change_order_id and app_private.actor_has_project_internal_scope(o.project_id,app_private.request_time())
    and (o.contract_id is null or app_private.actor_has_contract_internal_scope(o.contract_id,app_private.request_time()))));
create policy approval_ecr_subject_participant_read on public.approval_subject_change_request_version for select to youone_request using(
  app_private.can_read_approval_instance(instance_id,app_private.request_time()));
create policy approval_eco_subject_participant_read on public.approval_subject_change_order_version for select to youone_request using(
  app_private.can_read_approval_instance(instance_id,app_private.request_time()));

revoke all on public.change_request,public.change_request_version,public.ecr_impact_analysis,public.change_impact_assessment,public.change_impact_evidence,public.change_request_ncr_link,
  public.change_request_requirement_target,public.change_request_document_target,public.change_request_review,public.emergency_change_exception,
  public.change_order,public.change_order_version,public.change_target,public.change_order_requirement_target,public.change_order_document_target,
  public.change_order_deliverable_target,public.change_order_contract_target,public.change_order_inspection_checklist_target,
  public.change_order_test_plan_target,public.change_order_applied_project_scope,public.change_order_applied_contract_scope,
  public.change_order_implementation,public.change_order_verification,public.change_order_applied_serial,public.change_order_applied_lot,
  public.change_order_verification_test_result,public.change_order_verification_inspection_attempt,public.change_order_retrospective_approval,
  public.approval_subject_change_request_version,public.approval_subject_change_order_version,
  public.change_request_approval_outcome,public.change_order_approval_outcome,public.change_approval_negative_outcome
from public,youone_request,youone_privileged_writer;

grant select on public.change_request,public.change_request_version,public.change_order,public.change_order_version,
  public.approval_subject_change_request_version,public.approval_subject_change_order_version to youone_request;

do $commands$ declare fn record; begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'create_change_approval_instance','submit_approval_instance','perform_change_approval_action',
      'create_change_request','start_change_request_analysis','add_change_impact','seal_change_request_for_review',
      'record_change_request_review','authorize_emergency_change','add_change_order_requirement_target',
      'add_change_order_document_target','add_change_order_deliverable_target','add_change_order_contract_target',
      'add_change_order_inspection_checklist_target','add_change_order_test_plan_target',
      'create_change_order','seal_change_order_for_approval','release_emergency_change_order','record_change_order_implementation','transition_change_order',
      'verify_change_order_effectiveness','read_vendor_change_request','read_vendor_change_order')
  loop
    execute format('revoke all on function %s from public,youone_request,youone_privileged_writer',fn.signature);
    execute format('grant execute on function %s to youone_request',fn.signature);
  end loop;
end $commands$;

revoke all on function app_private.m10_assert_internal(uuid,uuid,text,timestamptz),
  app_private.m10_vendor_has_scope(uuid,uuid,uuid,text,timestamptz),
  app_private.append_m10_transition(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text,bigint,bigint,text,timestamptz),
  app_private.reject_m10_append_only_change(),app_private.assert_exactly_one_change_target(),app_private.protect_m10_aggregate(),
  app_private.apply_m10_approval_outcome()
from public,youone_request,youone_privileged_writer;

comment on table public.change_impact_assessment is 'Normalized impact facts. COST fields are internal-only and absent from Vendor projections.';
comment on table public.change_order_contract_target is 'Contractual scope/price/deadline/acceptance changes require an exact signed amendment and signature evidence.';
comment on function public.read_vendor_change_request(uuid,timestamptz) is 'Named Vendor projection; omits finance, internal impact analysis, review and Approval data.';
