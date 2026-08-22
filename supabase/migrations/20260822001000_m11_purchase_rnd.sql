-- M11 Purchase/R&D. RND_PROGRAM lifecycle is deliberately absent while OD-030 is open.
-- This migration records R&D agreement/budget/expenditure/deadline facts only; it exposes no payment, journal, bank, or RCMS command.

insert into public.permission(id,stable_code,status) values
 ('3b000000-0000-4000-8000-000000000001','purchase.request.create','ACTIVE'),
 ('3b000000-0000-4000-8000-000000000002','purchase.request.manage','ACTIVE'),
 ('3b000000-0000-4000-8000-000000000003','purchase.resolution.manage','ACTIVE'),
 ('3b000000-0000-4000-8000-000000000004','purchase.payment.record','ACTIVE'),
 ('3b000000-0000-4000-8000-000000000005','purchase.receipt.record','ACTIVE'),
 ('3b000000-0000-4000-8000-000000000006','purchase.inspection.record','ACTIVE'),
 ('3b000000-0000-4000-8000-000000000007','purchase.request.read','ACTIVE'),
 ('3b000000-0000-4000-8000-000000000008','rnd.program.manage','ACTIVE'),
 ('3b000000-0000-4000-8000-000000000009','rnd.budget.manage','ACTIVE'),
 ('3b000000-0000-4000-8000-000000000010','rnd.expenditure.record','ACTIVE'),
 ('3b000000-0000-4000-8000-000000000011','rnd.deadline.manage','ACTIVE'),
 ('3b000000-0000-4000-8000-000000000012','rnd.program.read','ACTIVE'),
 ('3b000000-0000-4000-8000-000000000013','rnd.program.register','ACTIVE'),
 ('3b000000-0000-4000-8000-000000000014','rnd.evidence.record','ACTIVE')
on conflict do nothing;

insert into public.action_definition(action_id) values
 ('purchase.request.create'),('purchase.request.manage'),('purchase.resolution.manage'),('purchase.payment.record'),
 ('purchase.receipt.record'),('purchase.inspection.record'),('purchase.request.read'),('rnd.program.manage'),
 ('rnd.budget.manage'),('rnd.expenditure.record'),('rnd.deadline.manage'),('rnd.program.read'),('rnd.program.register'),('rnd.evidence.record')
on conflict do nothing;

insert into public.aggregate_type_definition(aggregate_type) values
 ('PURCHASE_REQUEST'),('PURCHASE_RESOLUTION'),('RECEIPT'),('PURCHASE_INSPECTION'),
 ('RND_PROGRAM'),('RND_BUDGET'),('RND_EXPENDITURE'),('RND_REPORT_DEADLINE')
on conflict do nothing;

insert into public.domain_event_definition(event_id,payload_schema_id,payload_schema_version) values
 ('EVT-PURCHASE-CREATE','PURCHASE_EVENT_REF',1),('EVT-PURCHASE-DRAFT-REQUEST','PURCHASE_EVENT_REF',1),
 ('EVT-PURCHASE-REVISE-AFTER-NEGATIVE-APPROVAL','PURCHASE_EVENT_REF',1),
 ('EVT-PURCHASE-SUBMIT','PURCHASE_EVENT_REF',1),('EVT-PURCHASE-APPROVED','PURCHASE_EVENT_REF',1),
 ('EVT-PURCHASE-CREATE-RESOLUTION','PURCHASE_EVENT_REF',1),('EVT-PURCHASE-RESOLVE','PURCHASE_EVENT_REF',1),
 ('EVT-PURCHASE-AWAIT-PAYMENT','PURCHASE_EVENT_REF',1),('EVT-PURCHASE-CONFIRM-PAYMENT','PURCHASE_EVENT_REF',1),
 ('EVT-PURCHASE-RECEIVE-PART','PURCHASE_EVENT_REF',1),('EVT-PURCHASE-RECEIVE','PURCHASE_EVENT_REF',1),
 ('EVT-PURCHASE-REQUEST-INSPECTION','PURCHASE_EVENT_REF',1),('EVT-PURCHASE-INSPECTION-FAIL','PURCHASE_EVENT_REF',1),
 ('EVT-PURCHASE-INSPECTION-PASS','PURCHASE_EVENT_REF',1),('EVT-PURCHASE-RESOLVE-CORRECTION','PURCHASE_EVENT_REF',1),
 ('EVT-RND-REGISTER','RND_FACT_REF',1),('EVT-RND-LINK-PROJECT','RND_FACT_REF',1),
 ('EVT-RND-ADD-BUDGET-VERSION','RND_FACT_REF',1),('EVT-RND-RECORD-EXPENDITURE','RND_FACT_REF',1),
 ('EVT-RND-ADD-EVIDENCE','RND_FACT_REF',1),('EVT-RND-REGISTER-DEADLINE','RND_FACT_REF',1),('EVT-RND-DEADLINE-ALERTED','RND_FACT_REF',1)
on conflict do nothing;

insert into public.state_machine_definition(machine_id,aggregate_type) values ('SM-PURCHASE-V1','PURCHASE_REQUEST') on conflict do nothing;
insert into public.state_definition(machine_id,state_id,is_terminal) values
 ('SM-PURCHASE-V1','QUOTE_COLLECTION',false),('SM-PURCHASE-V1','REQUEST_DRAFT',false),
 ('SM-PURCHASE-V1','APPROVAL_PENDING',false),('SM-PURCHASE-V1','REQUEST_APPROVED',false),
 ('SM-PURCHASE-V1','RESOLUTION_DRAFT',false),('SM-PURCHASE-V1','RESOLVED',false),
 ('SM-PURCHASE-V1','PAYMENT_PENDING_EXTERNAL',false),('SM-PURCHASE-V1','PAYMENT_CONFIRMED',false),
 ('SM-PURCHASE-V1','PARTIALLY_RECEIVED',false),('SM-PURCHASE-V1','RECEIVED',false),
 ('SM-PURCHASE-V1','INSPECTION_PENDING',false),('SM-PURCHASE-V1','CORRECTION_REQUIRED',false),
 ('SM-PURCHASE-V1','COMPLETED',true),('SM-PURCHASE-V1','CANCELLED',true)
on conflict do nothing;
insert into public.transition_definition(machine_id,event_id,from_state,to_state) values
 ('SM-PURCHASE-V1','EVT-PURCHASE-CREATE',null,'QUOTE_COLLECTION'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-DRAFT-REQUEST','QUOTE_COLLECTION','REQUEST_DRAFT'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-REVISE-AFTER-NEGATIVE-APPROVAL','APPROVAL_PENDING','REQUEST_DRAFT'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-SUBMIT','REQUEST_DRAFT','APPROVAL_PENDING'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-APPROVED','APPROVAL_PENDING','REQUEST_APPROVED'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-CREATE-RESOLUTION','REQUEST_APPROVED','RESOLUTION_DRAFT'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-RESOLVE','RESOLUTION_DRAFT','RESOLVED'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-AWAIT-PAYMENT','RESOLVED','PAYMENT_PENDING_EXTERNAL'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-CONFIRM-PAYMENT','PAYMENT_PENDING_EXTERNAL','PAYMENT_CONFIRMED'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-RECEIVE-PART','PAYMENT_CONFIRMED','PARTIALLY_RECEIVED'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-RECEIVE-PART','PARTIALLY_RECEIVED','PARTIALLY_RECEIVED'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-RECEIVE','PAYMENT_CONFIRMED','RECEIVED'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-RECEIVE','PARTIALLY_RECEIVED','RECEIVED'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-REQUEST-INSPECTION','RECEIVED','INSPECTION_PENDING'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-INSPECTION-FAIL','INSPECTION_PENDING','CORRECTION_REQUIRED'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-INSPECTION-PASS','INSPECTION_PENDING','COMPLETED'),
 ('SM-PURCHASE-V1','EVT-PURCHASE-RESOLVE-CORRECTION','CORRECTION_REQUIRED','INSPECTION_PENDING')
on conflict do nothing;

create table public.supplier (
 id uuid primary key,supplier_code text not null unique check(length(supplier_code) between 1 and 100),
 legal_name text not null check(length(legal_name) between 1 and 500),business_registration_no text,
 state text not null check(state in ('ACTIVE','INACTIVE')),version_no bigint not null default 1 check(version_no>0),
 created_at timestamptz not null,updated_at timestamptz not null
);
create table public.supplier_vendor_link (
 id uuid primary key,supplier_id uuid not null references public.supplier(id),vendor_id uuid not null references public.vendor(id),
 review_state text not null check(review_state in ('REVIEWED','REVOKED')),reviewed_by_user_id uuid not null references public.user_account(id),
 reviewed_at timestamptz not null,reason_code text not null check(app_private.is_stable_code(reason_code)),
 unique(supplier_id),unique(vendor_id)
);
create table public.item (
 id uuid primary key,item_code text not null unique check(length(item_code) between 1 and 100),name text not null check(length(name) between 1 and 500),
 specification text not null check(length(specification) between 1 and 5000),manufacturer text,unit_code text not null check(app_private.is_stable_code(unit_code)),
 state text not null check(state in ('ACTIVE','INACTIVE')),version_no bigint not null default 1 check(version_no>0),created_at timestamptz not null,updated_at timestamptz not null
);
create table public.supplier_item (
 supplier_id uuid not null references public.supplier(id),item_id uuid not null references public.item(id),supplier_item_code text,
 latest_observed_price numeric(20,2) check(latest_observed_price is null or latest_observed_price>=0),currency char(3) check(currency is null or currency~'^[A-Z]{3}$'),
 observed_at timestamptz,primary key(supplier_id,item_id),check((latest_observed_price is null)=(currency is null) and (currency is null)=(observed_at is null))
);

create table public.purchase_request (
 id uuid primary key,request_no text not null unique check(length(request_no) between 1 and 100),requester_user_id uuid not null references public.user_account(id),
 owner_organization_id uuid not null references public.organization(id),current_version_id uuid not null,current_version_no bigint not null check(current_version_no>0),
 state text not null check(state in ('QUOTE_COLLECTION','REQUEST_DRAFT','APPROVAL_PENDING','REQUEST_APPROVED','RESOLUTION_DRAFT','RESOLVED',
   'PAYMENT_PENDING_EXTERNAL','PAYMENT_CONFIRMED','PARTIALLY_RECEIVED','RECEIVED','INSPECTION_PENDING','CORRECTION_REQUIRED','COMPLETED','CANCELLED')),
 version_no bigint not null check(version_no>0),created_at timestamptz not null,updated_at timestamptz not null,
 unique(id,current_version_id,current_version_no)
);
create table public.purchase_request_version (
 id uuid primary key,purchase_request_id uuid not null references public.purchase_request(id) deferrable initially deferred,
 version_no bigint not null check(version_no>0),prior_version_id uuid unique,purpose text not null check(length(purpose) between 1 and 10000),
 requested_on date not null,currency char(3) not null check(currency~'^[A-Z]{3}$'),vat_included_total numeric(20,2) not null check(vat_included_total>=0),
 anti_split_window_start date not null,anti_split_window_end date not null,effective_policy_amount numeric(20,2) not null check(effective_policy_amount>=vat_included_total),
 approval_policy_version_id uuid references public.approval_policy_version(id),approval_policy_version_no bigint,approval_policy_checksum text,
 policy_facts_checksum text check(policy_facts_checksum is null or app_private.is_sha256(policy_facts_checksum)),
 state text not null check(state in ('DRAFT','SEALED','APPROVED','REJECTED','RECALLED','SUPERSEDED')),
 sealed_snapshot_checksum text check(sealed_snapshot_checksum is null or app_private.is_sha256(sealed_snapshot_checksum)),sealed_at timestamptz,
 approval_instance_id uuid references public.approval_instance(id),created_by_user_id uuid not null references public.user_account(id),created_at timestamptz not null,
 unique(purchase_request_id,version_no),unique(id,purchase_request_id),unique(id,purchase_request_id,version_no),
 unique(id,purchase_request_id,version_no,sealed_snapshot_checksum,sealed_at),
 foreign key(prior_version_id,purchase_request_id) references public.purchase_request_version(id,purchase_request_id),
 foreign key(approval_policy_version_id,approval_policy_version_no,approval_policy_checksum)
   references public.approval_policy_version(id,version_no,checksum),
 check(anti_split_window_end>=anti_split_window_start),
 check((version_no=1 and prior_version_id is null) or (version_no>1 and prior_version_id is not null)),
 check((state='DRAFT' and sealed_snapshot_checksum is null and sealed_at is null and approval_instance_id is null)
   or (state<>'DRAFT' and sealed_snapshot_checksum is not null and sealed_at is not null))
);
alter table public.purchase_request add constraint purchase_request_current_version_fk foreign key(current_version_id,id,current_version_no)
 references public.purchase_request_version(id,purchase_request_id,version_no) deferrable initially deferred;

create table public.purchase_request_line (
 id uuid primary key,purchase_request_version_id uuid not null references public.purchase_request_version(id),sequence_no integer not null check(sequence_no>0),
 item_id uuid not null references public.item(id),specification_snapshot text not null check(length(specification_snapshot) between 1 and 5000),
 quantity numeric(20,6) not null check(quantity>0),unit_code text not null check(app_private.is_stable_code(unit_code)),
 unit_price numeric(20,2) not null check(unit_price>=0),line_amount numeric(20,2) not null check(line_amount>=0),currency char(3) not null check(currency~'^[A-Z]{3}$'),
 unique(purchase_request_version_id,sequence_no),unique(id,purchase_request_version_id),check(line_amount=round(quantity*unit_price,2))
);
create table public.purchase_quotation (
 id uuid primary key,purchase_request_version_id uuid not null references public.purchase_request_version(id),supplier_id uuid not null references public.supplier(id),
 quotation_no text not null,total_amount numeric(20,2) not null check(total_amount>=0),currency char(3) not null check(currency~'^[A-Z]{3}$'),valid_until date,
 attachment_id uuid not null,attachment_row_version bigint not null,attachment_checksum text not null check(app_private.is_sha256(attachment_checksum)),
 received_at timestamptz not null,unique(purchase_request_version_id,supplier_id,quotation_no),
 unique(id,purchase_request_version_id,supplier_id,total_amount,currency),
 foreign key(attachment_id,attachment_row_version,attachment_checksum) references public.attachment(id,row_version,detected_sha256)
);

-- These bands are company policy presets, not statutory thresholds.  Selection is
-- persisted and revalidated in the database so a caller cannot pair a high-value
-- request with a low-value ApprovalPolicyVersion.
create table public.purchase_approval_preset_version (
 id uuid primary key,preset_code text not null check(app_private.is_stable_code(preset_code)),version_no bigint not null check(version_no>0),
 classification text not null default 'INTERNAL_PRESET_NOT_STATUTORY' check(classification='INTERNAL_PRESET_NOT_STATUTORY'),
 currency char(3) not null check(currency~'^[A-Z]{3}$'),strengthened_legal_check_from numeric(20,2) not null check(strengthened_legal_check_from>=0),
 checksum text not null check(app_private.is_sha256(checksum)),
 valid_from timestamptz not null,valid_until timestamptz,sealed_at timestamptz not null,
 unique(preset_code,version_no),unique(id,version_no,checksum),check(valid_until is null or valid_until>valid_from)
);
create table public.purchase_approval_tier (
 id uuid primary key,preset_version_id uuid not null references public.purchase_approval_preset_version(id),tier_no integer not null check(tier_no between 1 and 3),
 lower_amount numeric(20,2) not null check(lower_amount>=0),upper_amount numeric(20,2),
 approval_policy_version_id uuid not null,approval_policy_version_no bigint not null,approval_policy_checksum text not null check(app_private.is_sha256(approval_policy_checksum)),
 unique(preset_version_id,tier_no),unique(preset_version_id,approval_policy_version_id),unique(id,preset_version_id),
 foreign key(approval_policy_version_id,approval_policy_version_no,approval_policy_checksum) references public.approval_policy_version(id,version_no,checksum),
 check(upper_amount is null or upper_amount>lower_amount),check((tier_no=3)=(upper_amount is null))
);
create table public.purchase_approval_policy_snapshot (
 purchase_request_version_id uuid primary key references public.purchase_request_version(id),preset_version_id uuid not null,preset_version_no bigint not null,
 preset_checksum text not null check(app_private.is_sha256(preset_checksum)),tier_id uuid not null,effective_policy_amount numeric(20,2) not null check(effective_policy_amount>=0),
 vat_included_total numeric(20,2) not null check(vat_included_total>=0),anti_split_cumulative_exposure numeric(20,2) not null check(anti_split_cumulative_exposure>=0),
 amount_facts_checksum text not null check(app_private.is_sha256(amount_facts_checksum)),strengthened_legal_check_required boolean not null,selected_at timestamptz not null,
 foreign key(preset_version_id,preset_version_no,preset_checksum) references public.purchase_approval_preset_version(id,version_no,checksum),
 foreign key(tier_id,preset_version_id) references public.purchase_approval_tier(id,preset_version_id),
 check(effective_policy_amount=greatest(vat_included_total,anti_split_cumulative_exposure))
);
create table public.purchase_request_project (
 purchase_request_version_id uuid not null references public.purchase_request_version(id),project_id uuid not null references public.project(id),
 primary key(purchase_request_version_id,project_id)
);

create table public.rnd_program (
 id uuid primary key,program_code text not null unique check(length(program_code) between 1 and 100),name text not null check(length(name) between 1 and 500),
 sponsor_agency text not null check(length(sponsor_agency) between 1 and 500),managing_agency text,agreement_no text,
 agreement_start date not null,agreement_end date not null,total_budget numeric(20,2) not null check(total_budget>=0),
 currency char(3) not null check(currency~'^[A-Z]{3}$'),record_version bigint not null default 1 check(record_version>0),
 created_by_user_id uuid not null references public.user_account(id),created_at timestamptz not null,updated_at timestamptz not null,
 check(agreement_end>=agreement_start)
);
create table public.project_rnd_program (
 project_id uuid not null references public.project(id),rnd_program_id uuid not null references public.rnd_program(id),
 relation_type text not null check(relation_type in ('PRIMARY','PARTICIPATING','SUPPORTING')),valid_from date not null,valid_until date,
 primary key(project_id,rnd_program_id),check(valid_until is null or valid_until>=valid_from)
);
create table public.purchase_request_rnd_program (
 purchase_request_version_id uuid not null references public.purchase_request_version(id),rnd_program_id uuid not null references public.rnd_program(id),
 primary key(purchase_request_version_id,rnd_program_id)
);

create table public.purchase_resolution (
 id uuid primary key,purchase_request_id uuid not null references public.purchase_request(id),purchase_request_version_id uuid not null,
 request_version_no bigint not null,request_checksum text not null check(app_private.is_sha256(request_checksum)),request_sealed_at timestamptz not null,
 selected_quotation_id uuid not null,selected_supplier_id uuid not null references public.supplier(id),resolution_reason text not null check(length(resolution_reason) between 1 and 10000),
 resolved_amount numeric(20,2) not null check(resolved_amount>=0),currency char(3) not null check(currency~'^[A-Z]{3}$'),
 state text not null check(state in ('DRAFT','RESOLVED','AWAITING_EXTERNAL_PAYMENT','EXTERNAL_PAYMENT_CONFIRMED')),
 version_no bigint not null check(version_no>0),created_by_user_id uuid not null references public.user_account(id),created_at timestamptz not null,resolved_at timestamptz,
 unique(purchase_request_id),unique(id,purchase_request_id),
 foreign key(purchase_request_version_id,purchase_request_id,request_version_no,request_checksum,request_sealed_at)
   references public.purchase_request_version(id,purchase_request_id,version_no,sealed_snapshot_checksum,sealed_at),
 foreign key(selected_quotation_id,purchase_request_version_id,selected_supplier_id,resolved_amount,currency)
   references public.purchase_quotation(id,purchase_request_version_id,supplier_id,total_amount,currency)
);
create table public.purchase_external_payment_fact (
 id uuid primary key,purchase_resolution_id uuid not null unique references public.purchase_resolution(id),external_system_code text not null check(app_private.is_stable_code(external_system_code)),
 external_reference text not null,confirmed_amount numeric(20,2) not null check(confirmed_amount>=0),currency char(3) not null check(currency~'^[A-Z]{3}$'),
 paid_on date not null,recorded_by_user_id uuid not null references public.user_account(id),recorded_at timestamptz not null,
 unique(external_system_code,external_reference)
);
create table public.receipt (
 id uuid primary key,receipt_no text not null unique,purchase_resolution_id uuid not null references public.purchase_resolution(id),
 purchase_request_id uuid not null references public.purchase_request(id),received_on date not null,received_by_user_id uuid not null references public.user_account(id),
 state text not null check(state in ('RECORDED','INSPECTION_PENDING','INSPECTED','CORRECTION_REQUIRED')),version_no bigint not null check(version_no>0),created_at timestamptz not null,
 unique(id,purchase_resolution_id),foreign key(purchase_resolution_id,purchase_request_id) references public.purchase_resolution(id,purchase_request_id)
);
create table public.receipt_line (
 id uuid primary key,receipt_id uuid not null references public.receipt(id),purchase_request_line_id uuid not null,
 purchase_request_version_id uuid not null,received_quantity numeric(20,6) not null check(received_quantity>0),
 condition_note text,unique(receipt_id,purchase_request_line_id),
 foreign key(purchase_request_line_id,purchase_request_version_id) references public.purchase_request_line(id,purchase_request_version_id)
);
create table public.receipt_overage_discrepancy (
 id uuid primary key,receipt_id uuid not null,purchase_request_line_id uuid not null,purchase_request_version_id uuid not null,
 observed_quantity numeric(20,6) not null check(observed_quantity>0),accepted_quantity numeric(20,6) not null check(accepted_quantity>=0),
 excess_quantity numeric(20,6) not null check(excess_quantity>0),reason text not null check(length(reason) between 1 and 5000),
 evidence_attachment_id uuid not null,evidence_attachment_row_version bigint not null,evidence_attachment_checksum text not null check(app_private.is_sha256(evidence_attachment_checksum)),
 quarantined boolean not null default true check(quarantined),
 resolution_status text not null default 'PENDING' check(resolution_status in ('PENDING','ACCEPTED_AS_CORRECTION','RETURNED','DISPOSED')),
 recorded_by_user_id uuid not null references public.user_account(id),recorded_at timestamptz not null,resolved_at timestamptz,
 unique(receipt_id,purchase_request_line_id),
 foreign key(receipt_id,purchase_request_line_id) references public.receipt_line(receipt_id,purchase_request_line_id) deferrable initially deferred,
 foreign key(purchase_request_line_id,purchase_request_version_id) references public.purchase_request_line(id,purchase_request_version_id),
 foreign key(evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum) references public.attachment(id,row_version,detected_sha256),
 check(observed_quantity=accepted_quantity+excess_quantity),check(resolved_at is null or resolved_at>=recorded_at)
);
create table public.purchase_inspection (
 id uuid primary key,receipt_id uuid not null unique references public.receipt(id),purchase_resolution_id uuid not null,
 inspection_id uuid not null references public.inspection(id),inspection_attempt_id uuid not null,inspection_attempt_no integer not null,
 inspection_attempt_checksum text not null check(app_private.is_sha256(inspection_attempt_checksum)),
 inspector_user_id uuid not null references public.user_account(id),quantity_verdict text not null check(quantity_verdict in ('PASS','FAIL')),
 specification_verdict text not null check(specification_verdict in ('PASS','FAIL')),appearance_verdict text not null check(appearance_verdict in ('PASS','FAIL')),
 performance_verdict text not null check(performance_verdict in ('PASS','FAIL','NOT_APPLICABLE')),overall_verdict text not null check(overall_verdict in ('PASS','FAIL')),
 summary text not null check(length(summary) between 1 and 10000),evidence_attachment_id uuid not null,evidence_attachment_row_version bigint not null,
 evidence_attachment_checksum text not null check(app_private.is_sha256(evidence_attachment_checksum)),inspected_at timestamptz not null,
 foreign key(receipt_id,purchase_resolution_id) references public.receipt(id,purchase_resolution_id),
 foreign key(inspection_attempt_id,inspection_id,inspection_attempt_no,inspection_attempt_checksum)
  references public.inspection_attempt(id,inspection_id,attempt_no,checksum),
 foreign key(evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum) references public.attachment(id,row_version,detected_sha256)
);

create table public.rnd_budget (
 id uuid primary key,rnd_program_id uuid not null references public.rnd_program(id),budget_code text not null,
 current_version_id uuid not null,current_version_no bigint not null check(current_version_no>0),created_at timestamptz not null,
 unique(rnd_program_id,budget_code),unique(id,rnd_program_id),unique(id,current_version_id,current_version_no)
);
create table public.rnd_budget_version (
 id uuid primary key,rnd_budget_id uuid not null references public.rnd_budget(id) deferrable initially deferred,rnd_program_id uuid not null,
 version_no bigint not null check(version_no>0),prior_version_id uuid unique,state text not null check(state in ('DRAFT','SEALED','SUPERSEDED')),
 total_amount numeric(20,2) not null check(total_amount>=0),currency char(3) not null check(currency~'^[A-Z]{3}$'),
 checksum text check(checksum is null or app_private.is_sha256(checksum)),sealed_at timestamptz,created_by_user_id uuid not null references public.user_account(id),created_at timestamptz not null,
 unique(rnd_budget_id,version_no),unique(id,rnd_budget_id),unique(id,rnd_budget_id,version_no),unique(id,rnd_budget_id,rnd_program_id,version_no),unique(id,checksum,sealed_at),
 foreign key(rnd_budget_id,rnd_program_id) references public.rnd_budget(id,rnd_program_id),
 foreign key(prior_version_id,rnd_budget_id) references public.rnd_budget_version(id,rnd_budget_id),
 check((version_no=1 and prior_version_id is null) or (version_no>1 and prior_version_id is not null)),
 check((state='DRAFT' and checksum is null and sealed_at is null) or (state<>'DRAFT' and checksum is not null and sealed_at is not null))
);
alter table public.rnd_budget add constraint rnd_budget_current_version_fk foreign key(current_version_id,id,current_version_no)
 references public.rnd_budget_version(id,rnd_budget_id,version_no) deferrable initially deferred;
create table public.rnd_budget_line (
 id uuid primary key,rnd_budget_version_id uuid not null references public.rnd_budget_version(id),category_code text not null check(app_private.is_stable_code(category_code)),
 allocated_amount numeric(20,2) not null check(allocated_amount>=0),purpose text not null check(length(purpose) between 1 and 5000),
 unique(rnd_budget_version_id,category_code),unique(id,rnd_budget_version_id)
);
create table public.rnd_expenditure (
 id uuid primary key,expenditure_no text not null unique,rnd_program_id uuid not null references public.rnd_program(id),
 budget_version_id uuid not null references public.rnd_budget_version(id),budget_line_id uuid not null,
 supplier_id uuid references public.supplier(id),counterparty_name text not null,spent_on date not null,amount numeric(20,2) not null check(amount>0),
 currency char(3) not null check(currency~'^[A-Z]{3}$'),purpose text not null check(length(purpose) between 1 and 10000),
 recorded_by_user_id uuid not null references public.user_account(id),recorded_at timestamptz not null,
 foreign key(budget_line_id,budget_version_id) references public.rnd_budget_line(id,rnd_budget_version_id)
);
create table public.rnd_expenditure_project (
 expenditure_id uuid primary key references public.rnd_expenditure(id),project_id uuid not null references public.project(id)
);
create table public.rnd_expenditure_contract (
 expenditure_id uuid primary key references public.rnd_expenditure(id),contract_id uuid not null references public.vendor_contract(id),
 contract_version_id uuid not null,contract_version_no bigint not null,contract_version_checksum text not null check(app_private.is_sha256(contract_version_checksum)),
 contract_version_sealed_at timestamptz not null,
 foreign key(contract_version_id,contract_id,contract_version_no,contract_version_checksum,contract_version_sealed_at)
  references public.contract_version(id,contract_id,version_no,sealed_snapshot_checksum,sealed_at)
);
create table public.rnd_expenditure_purchase (
 expenditure_id uuid primary key references public.rnd_expenditure(id),purchase_resolution_id uuid not null references public.purchase_resolution(id)
);
create table public.rnd_evidence (
 id uuid primary key,evidence_type_code text not null check(app_private.is_stable_code(evidence_type_code)),
 attachment_id uuid not null,attachment_row_version bigint not null,attachment_checksum text not null check(app_private.is_sha256(attachment_checksum)),
 recorded_by_user_id uuid not null references public.user_account(id),recorded_at timestamptz not null,
 unique(evidence_type_code,attachment_id,attachment_row_version,attachment_checksum),
 foreign key(attachment_id,attachment_row_version,attachment_checksum) references public.attachment(id,row_version,detected_sha256)
);
create table public.rnd_evidence_expenditure (
 evidence_id uuid primary key references public.rnd_evidence(id),expenditure_id uuid not null references public.rnd_expenditure(id),
 unique(expenditure_id,evidence_id)
);
create table public.rnd_evidence_budget_version (
 evidence_id uuid primary key references public.rnd_evidence(id),budget_version_id uuid not null,budget_checksum text not null check(app_private.is_sha256(budget_checksum)),
 budget_sealed_at timestamptz not null,
 foreign key(budget_version_id,budget_checksum,budget_sealed_at) references public.rnd_budget_version(id,checksum,sealed_at)
);
create table public.rnd_report_deadline (
 id uuid primary key,rnd_program_id uuid not null references public.rnd_program(id),deadline_type text not null check(deadline_type in ('REPORT','EVALUATION','SETTLEMENT','OTHER')),
 due_at timestamptz not null,required_evidence_type_code text check(required_evidence_type_code is null or app_private.is_stable_code(required_evidence_type_code)),
 completed_at timestamptz,created_at timestamptz not null,
 unique(rnd_program_id,deadline_type,due_at),unique(id,due_at),check(completed_at is null or completed_at>=created_at)
);
create table public.rnd_evidence_deadline (
 evidence_id uuid primary key references public.rnd_evidence(id),deadline_id uuid not null,deadline_due_at timestamptz not null,
 foreign key(deadline_id,deadline_due_at) references public.rnd_report_deadline(id,due_at)
);
create or replace function app_private.assert_exactly_one_rnd_evidence_subject()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$ declare target_id uuid:=coalesce(new.id,old.id);n integer;begin
 select (select count(*) from public.rnd_evidence_expenditure where evidence_id=target_id)
  +(select count(*) from public.rnd_evidence_budget_version where evidence_id=target_id)
  +(select count(*) from public.rnd_evidence_deadline where evidence_id=target_id) into n;
 if n<>1 then raise exception 'R&D evidence requires exactly one typed subject' using errcode='23514';end if;return coalesce(new,old);
end $$;
create constraint trigger rnd_evidence_exactly_one_subject after insert on public.rnd_evidence deferrable initially deferred
 for each row execute function app_private.assert_exactly_one_rnd_evidence_subject();
create table public.rnd_alert (
 id uuid primary key,rnd_program_id uuid not null references public.rnd_program(id),alert_kind text not null check(alert_kind in ('BUDGET_OVERRUN','MISSING_EVIDENCE','DEADLINE_DUE','DEADLINE_OVERDUE')),
 source_expenditure_id uuid references public.rnd_expenditure(id),source_deadline_id uuid references public.rnd_report_deadline(id),
 idempotency_key text not null unique check(app_private.is_opaque_key(idempotency_key)),reason_code text not null check(app_private.is_stable_code(reason_code)),
 detected_at timestamptz not null,resolved_at timestamptz,check(num_nonnulls(source_expenditure_id,source_deadline_id)=1),check(resolved_at is null or resolved_at>=detected_at)
);

alter table public.approval_subject_binding drop constraint approval_subject_binding_subject_kind_check;
alter table public.approval_subject_binding add constraint approval_subject_binding_subject_kind_check check(subject_kind in
 ('APPROVAL_POLICY_VERSION','DOCUMENT_VERSION','RESEARCH_PROJECT_APPLICATION','CONTRACT_VERSION','ACCEPTANCE_PAYMENT_DECISION',
  'CHANGE_REQUEST_VERSION','CHANGE_ORDER_VERSION','PURCHASE_REQUEST_VERSION'));
create table public.approval_subject_purchase_request_version (
 instance_id uuid primary key references public.approval_instance(id),
 subject_kind text not null default 'PURCHASE_REQUEST_VERSION' check(subject_kind='PURCHASE_REQUEST_VERSION'),
 purchase_request_version_id uuid not null,purchase_request_id uuid not null,subject_version_no bigint not null,
 subject_checksum text not null check(app_private.is_sha256(subject_checksum)),subject_sealed_at timestamptz not null,
 unique(instance_id,purchase_request_version_id),unique(purchase_request_version_id,instance_id),
 foreign key(instance_id,subject_kind) references public.approval_subject_binding(instance_id,subject_kind) deferrable initially deferred,
 foreign key(purchase_request_version_id,purchase_request_id,subject_version_no,subject_checksum,subject_sealed_at)
   references public.purchase_request_version(id,purchase_request_id,version_no,sealed_snapshot_checksum,sealed_at)
);
create trigger approval_purchase_request_subject_bind before insert on public.approval_subject_purchase_request_version
 for each row execute function app_private.bind_approval_subject();
create table public.purchase_request_approval_outcome (
 purchase_request_version_id uuid primary key references public.purchase_request_version(id),purchase_request_id uuid not null references public.purchase_request(id),
 approval_instance_id uuid not null unique references public.approval_instance(id),approval_version bigint not null check(approval_version>0),
 policy_version_id uuid not null,policy_version_no bigint not null,policy_checksum text not null check(app_private.is_sha256(policy_checksum)),
 official_approver_user_id uuid not null references public.user_account(id),official_approver_position_id uuid not null references public.position(id),
 terminal_action_id uuid not null,completed_at timestamptz not null,
 foreign key(terminal_action_id,approval_instance_id) references public.approval_action(id,instance_id),
 foreign key(policy_version_id,policy_version_no,policy_checksum) references public.approval_policy_version(id,version_no,checksum),
 foreign key(purchase_request_version_id,purchase_request_id) references public.purchase_request_version(id,purchase_request_id)
);
create table public.purchase_approval_negative_outcome (
 approval_instance_id uuid primary key,purchase_request_version_id uuid not null,outcome text not null check(outcome in ('REJECTED','RECALLED','CANCELLED')),
 approval_version bigint not null check(approval_version>0),terminal_action_id uuid not null,reason_code text not null check(app_private.is_stable_code(reason_code)),recorded_at timestamptz not null,
 foreign key(approval_instance_id,purchase_request_version_id) references public.approval_subject_purchase_request_version(instance_id,purchase_request_version_id),
 foreign key(terminal_action_id,approval_instance_id) references public.approval_action(id,instance_id)
);

create or replace function app_private.assert_exactly_one_approval_subject()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare target_instance uuid:=coalesce(new.id,old.id); link_count integer; begin
 select (select count(*) from public.approval_subject_policy_version p where p.instance_id=target_instance)
  +(select count(*) from public.approval_subject_document_version d where d.instance_id=target_instance)
  +(select count(*) from public.approval_subject_research_project_application r where r.instance_id=target_instance)
  +(select count(*) from public.approval_subject_contract_version c where c.instance_id=target_instance)
  +(select count(*) from public.approval_subject_acceptance_payment_decision a where a.instance_id=target_instance)
  +(select count(*) from public.approval_subject_change_request_version e where e.instance_id=target_instance)
  +(select count(*) from public.approval_subject_change_order_version o where o.instance_id=target_instance)
  +(select count(*) from public.approval_subject_purchase_request_version p where p.instance_id=target_instance) into link_count;
 if link_count<>1 then raise exception 'approval instance requires exactly one typed subject link' using errcode='23514'; end if;
 return coalesce(new,old);
end $$;
create or replace function app_private.approval_subject_snapshot(target_instance_id uuid)
returns table(subject_kind text,subject_version_id uuid,subject_version_no bigint,subject_checksum text,subject_state text)
language sql stable security definer set search_path=pg_catalog,public as $$
 select 'APPROVAL_POLICY_VERSION',l.subject_policy_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_policy_version l
  join public.approval_policy_version v on v.id=l.subject_policy_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.checksum=l.subject_checksum
 union all select 'DOCUMENT_VERSION',l.document_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_document_version l
  join public.document_version v on v.id=l.document_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum
 union all select 'RESEARCH_PROJECT_APPLICATION',l.application_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_research_project_application l
  join public.research_project_application_version v on v.id=l.application_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum
 union all select 'CONTRACT_VERSION',l.contract_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_contract_version l
  join public.contract_version v on v.id=l.contract_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum
 union all select 'ACCEPTANCE_PAYMENT_DECISION',l.acceptance_payment_decision_id,l.subject_version_no,l.subject_checksum,d.state from public.approval_subject_acceptance_payment_decision l
  join public.acceptance_payment_decision d on d.id=l.acceptance_payment_decision_id where l.instance_id=target_instance_id and d.version_no=l.subject_version_no and d.sealed_snapshot_checksum=l.subject_checksum
 union all select 'CHANGE_REQUEST_VERSION',l.change_request_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_change_request_version l
  join public.change_request_version v on v.id=l.change_request_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.snapshot_checksum=l.subject_checksum
 union all select 'CHANGE_ORDER_VERSION',l.change_order_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_change_order_version l
  join public.change_order_version v on v.id=l.change_order_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.snapshot_checksum=l.subject_checksum
 union all select 'PURCHASE_REQUEST_VERSION',l.purchase_request_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_purchase_request_version l
  join public.purchase_request_version v on v.id=l.purchase_request_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no
    and v.sealed_snapshot_checksum=l.subject_checksum and v.sealed_at=l.subject_sealed_at
$$;

create or replace function app_private.reject_m11_append_only()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin raise exception 'M11 immutable evidence/version row is append-only' using errcode='55000'; end $$;
create or replace function app_private.protect_m11_purchase()
returns trigger language plpgsql set search_path=pg_catalog,app_private as $$ begin
 if tg_op='DELETE' then raise exception 'Purchase aggregate/version is retained' using errcode='55000'; end if;
 if app_private.optional_setting('app.m11_purchase_command') is distinct from
   case tg_table_name when 'purchase_request' then old.id::text else old.purchase_request_id::text end then
  raise exception 'Purchase update requires trusted command' using errcode='42501'; end if;
 if tg_table_name='purchase_request_version' and old.state<>'DRAFT' and
   (to_jsonb(new)-array['state','approval_instance_id']::text[]) is distinct from (to_jsonb(old)-array['state','approval_instance_id']::text[]) then
  raise exception 'sealed PurchaseRequestVersion snapshot is immutable' using errcode='55000'; end if;
 return new;
end $$;
create trigger purchase_request_guard before update or delete on public.purchase_request for each row execute function app_private.protect_m11_purchase();
create trigger purchase_request_version_guard before update or delete on public.purchase_request_version for each row execute function app_private.protect_m11_purchase();
do $immutable$ declare table_name text; begin foreach table_name in array array[
 'purchase_approval_preset_version','purchase_approval_tier','purchase_approval_policy_snapshot',
 'supplier_vendor_link','purchase_request_line','purchase_quotation','purchase_request_project','purchase_request_rnd_program',
 'purchase_external_payment_fact','receipt_line','receipt_overage_discrepancy','purchase_inspection','rnd_budget_line','rnd_expenditure','rnd_expenditure_project',
 'rnd_expenditure_contract','rnd_expenditure_purchase','rnd_evidence','rnd_evidence_expenditure','rnd_evidence_budget_version','rnd_evidence_deadline','purchase_request_approval_outcome',
 'purchase_approval_negative_outcome','approval_subject_purchase_request_version'] loop
 execute format('create trigger %I before update or delete on public.%I for each row execute function app_private.reject_m11_append_only()',
  'm11_'||table_name||'_append_only',table_name); end loop; end $immutable$;

create or replace function app_private.m11_actor_is_hq(target_time timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private as $$ select exists(
 select 1 from public.user_role_assignment a join public.role r on r.id=a.role_id and r.stable_code='ROLE_HQ_VIEWER' and r.status='ACTIVE'
 where a.user_id=app_private.current_actor_user_id() and a.revoked_at is null and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time)) $$;
create or replace function app_private.m11_assert_internal_mutator(target_permission text,target_time timestamptz)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m08_assert_direct_internal(target_time,target_permission);
 if app_private.m11_actor_is_hq(target_time) then raise exception 'HQ Viewer is read-only for Purchase and R&D' using errcode='42501'; end if;
end $$;
create or replace function app_private.assert_purchase_policy_selection(target_version uuid,target_policy uuid,target_time timestamptz)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$ declare
 v public.purchase_request_version%rowtype;s public.purchase_approval_policy_snapshot%rowtype;t public.purchase_approval_tier%rowtype;
 preset public.purchase_approval_preset_version%rowtype;line_ok boolean;begin
 select * into strict v from public.purchase_request_version where id=target_version;
 select * into strict s from public.purchase_approval_policy_snapshot where purchase_request_version_id=v.id;
 select * into strict t from public.purchase_approval_tier where id=s.tier_id and preset_version_id=s.preset_version_id;
 select * into strict preset from public.purchase_approval_preset_version where id=s.preset_version_id and version_no=s.preset_version_no
  and checksum=s.preset_checksum and valid_from<=target_time and (valid_until is null or valid_until>target_time);
 if preset.currency<>v.currency or s.effective_policy_amount<>v.effective_policy_amount or s.vat_included_total<>v.vat_included_total
  or s.amount_facts_checksum<>v.policy_facts_checksum or t.approval_policy_version_id<>target_policy
  or s.effective_policy_amount<t.lower_amount or (t.upper_amount is not null and s.effective_policy_amount>=t.upper_amount)
  or s.strengthened_legal_check_required is distinct from (s.effective_policy_amount>=preset.strengthened_legal_check_from)
  or (select count(*) from public.purchase_approval_tier x where x.preset_version_id=preset.id)<>3
  or not exists(select 1 from public.purchase_approval_tier a join public.purchase_approval_tier b on b.preset_version_id=a.preset_version_id and b.tier_no=2
    join public.purchase_approval_tier c on c.preset_version_id=a.preset_version_id and c.tier_no=3
    where a.preset_version_id=preset.id and a.tier_no=1 and a.lower_amount=0 and a.upper_amount=b.lower_amount and b.upper_amount=c.lower_amount)
 then raise exception 'Purchase amount band and versioned internal policy preset do not match' using errcode='23514';end if;
 select case when t.tier_no=1 then
   (select count(*)=1 and bool_and(sr.sequence_no=1 and sr.step_role='APPROVAL' and sr.completion_mode='SEQUENTIAL'
      and pr.selector_kind='POSITION' and pos.stable_code='POSITION_LAB_DIRECTOR')
    from public.approval_policy_step_rule sr join public.approval_policy_participant_rule pr on pr.step_rule_id=sr.id
    left join public.position pos on pos.id=pr.position_id where sr.policy_version_id=target_policy)
  else
   (select count(*)=2 and count(*) filter(where sr.sequence_no=1 and sr.step_role='APPROVAL' and sr.completion_mode='SEQUENTIAL'
      and pr.selector_kind='POSITION' and pos.stable_code='POSITION_LAB_DIRECTOR')=1
      and count(*) filter(where sr.sequence_no=2 and sr.step_role='APPROVAL' and sr.completion_mode='ANY_ONE'
      and pr.selector_kind='POSITION' and pos.stable_code='POSITION_REPRESENTATIVE')=1
    from public.approval_policy_step_rule sr join public.approval_policy_participant_rule pr on pr.step_rule_id=sr.id
    left join public.position pos on pos.id=pr.position_id where sr.policy_version_id=target_policy) end into line_ok;
 if not coalesce(line_ok,false) then raise exception 'Purchase ApprovalPolicy line does not match selected amount tier' using errcode='23514';end if;
end $$;
create or replace function app_private.append_m11_transition(target_audit uuid,target_transition uuid,target_outbox uuid,target_action text,
 target_type text,target_id uuid,target_event text,target_from text,target_to text,target_from_version bigint,target_to_version bigint,target_reason text,target_time timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.append_audit(target_audit,target_action,target_type,target_id,target_to_version,'SUCCEEDED',coalesce(target_reason,target_event),null,null,null,null,target_time);
 perform app_private.append_state_transition(target_transition,target_audit,target_type,target_id,'SM-PURCHASE-V1',target_event,target_from,target_to,
  target_from_version,target_to_version,coalesce(target_reason,target_event),null,app_private.required_setting('app.correlation_id'),
  app_private.optional_setting('app.causation_id'),target_time);
 perform app_private.enqueue_outbox(target_outbox,target_audit,target_event,target_type,target_id,target_to_version,
  app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),'PURCHASE_EVENT_REF',1,
  jsonb_build_object('aggregateId',target_id,'resourceVersion',target_to_version,'eventId',target_event),target_event||':'||target_id::text||':'||target_to_version::text,target_time,target_time);
end $$;

create or replace function public.create_supplier(target_id uuid,target_code text,target_name text,target_business_no text,target_audit uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m11_assert_internal_mutator('purchase.request.manage',target_time);
 insert into public.supplier(id,supplier_code,legal_name,business_registration_no,state,created_at,updated_at)
 values(target_id,target_code,target_name,target_business_no,'ACTIVE',target_time,target_time);
 perform app_private.append_audit(target_audit,'purchase.request.manage','SUPPLIER',target_id,1,'SUCCEEDED','SUPPLIER-CREATED',null,null,null,null,target_time);
 return target_id;
end $$;
create or replace function public.create_item(target_id uuid,target_code text,target_name text,target_specification text,target_manufacturer text,target_unit text,
 target_audit uuid,target_time timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m11_assert_internal_mutator('purchase.request.manage',target_time);
 insert into public.item(id,item_code,name,specification,manufacturer,unit_code,state,created_at,updated_at)
 values(target_id,target_code,target_name,target_specification,target_manufacturer,target_unit,'ACTIVE',target_time,target_time);
 perform app_private.append_audit(target_audit,'purchase.request.manage','ITEM',target_id,1,'SUCCEEDED','ITEM-CREATED',null,null,null,null,target_time);
 return target_id;
end $$;
create or replace function public.link_supplier_vendor(target_id uuid,target_supplier uuid,target_vendor uuid,target_reason text,target_audit uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m11_assert_internal_mutator('purchase.request.manage',target_time);
 insert into public.supplier_vendor_link(id,supplier_id,vendor_id,review_state,reviewed_by_user_id,reviewed_at,reason_code)
 values(target_id,target_supplier,target_vendor,'REVIEWED',app_private.current_effective_actor_user_id(),target_time,target_reason);
 perform app_private.append_audit(target_audit,'purchase.request.manage','SUPPLIER_VENDOR_LINK',target_id,1,'SUCCEEDED',target_reason,null,null,null,null,target_time);
 return target_id;
end $$;

create or replace function public.create_purchase_request(target_id uuid,target_version_id uuid,target_request_no text,target_organization uuid,
 target_purpose text,target_requested_on date,target_currency char(3),target_vat_total numeric,target_window_start date,target_window_end date,
 target_effective_policy_amount numeric,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m11_assert_internal_mutator('purchase.request.create',target_time);
 if not exists(select 1 from public.user_organization_assignment a where a.user_id=app_private.current_effective_actor_user_id()
  and a.organization_id=target_organization and a.revoked_at is null and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time)) then
  raise exception 'active organization scope required' using errcode='42501'; end if;
 insert into public.purchase_request(id,request_no,requester_user_id,owner_organization_id,current_version_id,current_version_no,state,version_no,created_at,updated_at)
 values(target_id,target_request_no,app_private.current_effective_actor_user_id(),target_organization,target_version_id,1,'QUOTE_COLLECTION',1,target_time,target_time);
 insert into public.purchase_request_version(id,purchase_request_id,version_no,purpose,requested_on,currency,vat_included_total,
  anti_split_window_start,anti_split_window_end,effective_policy_amount,state,created_by_user_id,created_at)
 values(target_version_id,target_id,1,target_purpose,target_requested_on,target_currency,target_vat_total,target_window_start,target_window_end,
  target_effective_policy_amount,'DRAFT',app_private.current_effective_actor_user_id(),target_time);
 perform app_private.append_m11_transition(target_audit,target_transition,target_outbox,'purchase.request.create','PURCHASE_REQUEST',target_id,
  'EVT-PURCHASE-CREATE',null,'QUOTE_COLLECTION',0,1,'PURCHASE-REQUEST-CREATED',target_time); return target_id;
end $$;
create or replace function public.create_purchase_request_revision(target_request uuid,target_prior_version uuid,target_new_version uuid,
 target_purpose text,target_requested_on date,target_currency char(3),target_vat_total numeric,target_window_start date,target_window_end date,
 target_effective_policy_amount numeric,target_expected bigint,target_reason text,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 r public.purchase_request%rowtype;prior public.purchase_request_version%rowtype;next bigint;begin
 perform app_private.m11_assert_internal_mutator('purchase.request.create',target_time);
 select * into strict r from public.purchase_request where id=target_request for update;
 select * into strict prior from public.purchase_request_version where id=target_prior_version and purchase_request_id=r.id for update;
 if r.requester_user_id<>app_private.current_effective_actor_user_id() or r.current_version_id<>prior.id or r.state<>'APPROVAL_PENDING'
  or prior.state not in ('REJECTED','RECALLED') or nullif(btrim(target_reason),'') is null
  or not exists(select 1 from public.purchase_approval_negative_outcome n where n.purchase_request_version_id=prior.id and n.outcome=prior.state)
 then raise exception 'exact rejected/recalled PurchaseRequestVersion predecessor required' using errcode='23514';end if;
 next:=app_private.next_version(r.version_no,target_expected);
 insert into public.purchase_request_version(id,purchase_request_id,version_no,prior_version_id,purpose,requested_on,currency,vat_included_total,
  anti_split_window_start,anti_split_window_end,effective_policy_amount,state,created_by_user_id,created_at)
 values(target_new_version,r.id,prior.version_no+1,prior.id,target_purpose,target_requested_on,target_currency,target_vat_total,
  target_window_start,target_window_end,target_effective_policy_amount,'DRAFT',app_private.current_effective_actor_user_id(),target_time);
 perform set_config('app.m11_purchase_command',r.id::text,true);
 update public.purchase_request set current_version_id=target_new_version,current_version_no=prior.version_no+1,state='REQUEST_DRAFT',version_no=next,updated_at=target_time where id=r.id;
 perform app_private.append_m11_transition(target_audit,target_transition,target_outbox,'purchase.request.create','PURCHASE_REQUEST',r.id,
  'EVT-PURCHASE-REVISE-AFTER-NEGATIVE-APPROVAL','APPROVAL_PENDING','REQUEST_DRAFT',r.version_no,next,target_reason,target_time);return target_new_version;
end $$;
create or replace function public.add_purchase_request_line(target_request uuid,target_line uuid,target_item uuid,target_spec text,target_quantity numeric,
 target_unit text,target_unit_price numeric,target_line_amount numeric,target_currency char(3),target_audit uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare r public.purchase_request%rowtype; seq integer; begin
 perform app_private.m11_assert_internal_mutator('purchase.request.create',target_time); select * into strict r from public.purchase_request where id=target_request for update;
 if r.state not in ('QUOTE_COLLECTION','REQUEST_DRAFT') or r.requester_user_id<>app_private.current_effective_actor_user_id() then raise exception 'editable Purchase request denied' using errcode='42501'; end if;
 select coalesce(max(sequence_no),0)+1 into seq from public.purchase_request_line where purchase_request_version_id=r.current_version_id;
 insert into public.purchase_request_line(id,purchase_request_version_id,sequence_no,item_id,specification_snapshot,quantity,unit_code,unit_price,line_amount,currency)
 values(target_line,r.current_version_id,seq,target_item,target_spec,target_quantity,target_unit,target_unit_price,target_line_amount,target_currency);
 perform app_private.append_audit(target_audit,'purchase.request.create','PURCHASE_REQUEST',r.id,r.version_no,'SUCCEEDED','PURCHASE-LINE-ADDED',target_line,null,null,null,target_time); return target_line;
end $$;
create or replace function public.add_purchase_quotation(target_request uuid,target_quote uuid,target_supplier uuid,target_quote_no text,target_amount numeric,
 target_currency char(3),target_valid_until date,target_attachment uuid,target_audit uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare r public.purchase_request%rowtype; a public.attachment%rowtype; begin
 perform app_private.m11_assert_internal_mutator('purchase.request.create',target_time); select * into strict r from public.purchase_request where id=target_request for update;
 select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE';
 if r.state not in ('QUOTE_COLLECTION','REQUEST_DRAFT') or r.requester_user_id<>app_private.current_effective_actor_user_id() then raise exception 'quotation collection denied' using errcode='42501'; end if;
 insert into public.purchase_quotation(id,purchase_request_version_id,supplier_id,quotation_no,total_amount,currency,valid_until,
  attachment_id,attachment_row_version,attachment_checksum,received_at)
 values(target_quote,r.current_version_id,target_supplier,target_quote_no,target_amount,target_currency,target_valid_until,a.id,a.row_version,a.detected_sha256,target_time);
 perform app_private.append_audit(target_audit,'purchase.request.create','PURCHASE_REQUEST',r.id,r.version_no,'SUCCEEDED','QUOTATION-EVIDENCE-ADDED',a.id,null,a.detected_sha256,null,target_time); return target_quote;
end $$;
create or replace function public.draft_purchase_request(target_request uuid,target_expected bigint,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare r public.purchase_request%rowtype; v public.purchase_request_version%rowtype; next bigint; begin
 perform app_private.m11_assert_internal_mutator('purchase.request.create',target_time); select * into strict r from public.purchase_request where id=target_request for update;
 select * into strict v from public.purchase_request_version where id=r.current_version_id for update;
 if r.state<>'QUOTE_COLLECTION' or r.requester_user_id<>app_private.current_effective_actor_user_id()
  or not exists(select 1 from public.purchase_request_line where purchase_request_version_id=v.id)
  or not exists(select 1 from public.purchase_quotation where purchase_request_version_id=v.id)
  or (select coalesce(sum(line_amount),0) from public.purchase_request_line where purchase_request_version_id=v.id)<>v.vat_included_total then
  raise exception 'complete lines, exact amount and quotation evidence required' using errcode='23514'; end if;
 next:=app_private.next_version(r.version_no,target_expected); perform set_config('app.m11_purchase_command',r.id::text,true);
 update public.purchase_request set state='REQUEST_DRAFT',version_no=next,updated_at=target_time where id=r.id;
 perform app_private.append_m11_transition(target_audit,target_transition,target_outbox,'purchase.request.create','PURCHASE_REQUEST',r.id,
  'EVT-PURCHASE-DRAFT-REQUEST','QUOTE_COLLECTION','REQUEST_DRAFT',r.version_no,next,'PURCHASE-REQUEST-DRAFT-COMPLETE',target_time); return next;
end $$;
create or replace function public.seal_purchase_request(target_request uuid,target_policy uuid,target_policy_checksum text,target_preset_version uuid,
 target_tier uuid,target_anti_split_exposure numeric,target_facts_checksum text,target_expected bigint,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions as $$ declare r public.purchase_request%rowtype;
 v public.purchase_request_version%rowtype;p public.approval_policy_version%rowtype;next bigint;checksum text;begin
 perform app_private.m11_assert_internal_mutator('purchase.request.create',target_time); select * into strict r from public.purchase_request where id=target_request for update;
 select * into strict v from public.purchase_request_version where id=r.current_version_id for update;
 select * into strict p from public.approval_policy_version where id=target_policy and subject_kind='PURCHASE_REQUEST_VERSION'
  and state='PUBLISHED' and checksum=target_policy_checksum and valid_from<=target_time and (valid_until is null or valid_until>target_time) for share;
 if r.state<>'REQUEST_DRAFT' or v.state<>'DRAFT' or r.requester_user_id<>app_private.current_effective_actor_user_id() then raise exception 'exact draft request required' using errcode='23514'; end if;
 checksum:=app_private.canonical_json_sha256(jsonb_build_object('schema','PURCHASE_REQUEST_VERSION_V1','id',v.id,'versionNo',v.version_no,
  'purpose',v.purpose,'requestedOn',v.requested_on,'currency',v.currency,'vatIncludedTotal',v.vat_included_total,
  'antiSplitStart',v.anti_split_window_start,'antiSplitEnd',v.anti_split_window_end,'effectivePolicyAmount',v.effective_policy_amount,
  'policyId',p.id,'policyChecksum',p.checksum,'factsChecksum',target_facts_checksum,
  'lines',(select jsonb_agg(jsonb_build_object('id',l.id,'sequence',l.sequence_no,'itemId',l.item_id,'specification',l.specification_snapshot,
   'quantity',l.quantity,'unit',l.unit_code,'unitPrice',l.unit_price,'lineAmount',l.line_amount,'currency',l.currency) order by l.sequence_no)
   from public.purchase_request_line l where l.purchase_request_version_id=v.id),
  'quotations',(select jsonb_agg(jsonb_build_object('id',q.id,'supplierId',q.supplier_id,'amount',q.total_amount,'currency',q.currency,
   'attachmentId',q.attachment_id,'rowVersion',q.attachment_row_version,'checksum',q.attachment_checksum) order by q.id)
   from public.purchase_quotation q where q.purchase_request_version_id=v.id)));
 next:=app_private.next_version(r.version_no,target_expected); perform set_config('app.m11_purchase_command',r.id::text,true);
 update public.purchase_request_version set state='SEALED',sealed_snapshot_checksum=checksum,sealed_at=target_time,approval_policy_version_id=p.id,
  approval_policy_version_no=p.version_no,approval_policy_checksum=p.checksum,policy_facts_checksum=target_facts_checksum where id=v.id;
 insert into public.purchase_approval_policy_snapshot(purchase_request_version_id,preset_version_id,preset_version_no,preset_checksum,tier_id,
  effective_policy_amount,vat_included_total,anti_split_cumulative_exposure,amount_facts_checksum,strengthened_legal_check_required,selected_at)
 select v.id,preset.id,preset.version_no,preset.checksum,t.id,v.effective_policy_amount,v.vat_included_total,target_anti_split_exposure,target_facts_checksum,
  v.effective_policy_amount>=preset.strengthened_legal_check_from,target_time
 from public.purchase_approval_preset_version preset join public.purchase_approval_tier t on t.preset_version_id=preset.id
 where preset.id=target_preset_version and t.id=target_tier and t.approval_policy_version_id=p.id;
 if not found then raise exception 'versioned Purchase policy preset/tier required' using errcode='23514';end if;
 perform app_private.assert_purchase_policy_selection(v.id,p.id,target_time);
 update public.purchase_request set state='APPROVAL_PENDING',version_no=next,updated_at=target_time where id=r.id;
 perform app_private.append_m11_transition(target_audit,target_transition,target_outbox,'purchase.request.create','PURCHASE_REQUEST',r.id,
  'EVT-PURCHASE-SUBMIT','REQUEST_DRAFT','APPROVAL_PENDING',r.version_no,next,'PURCHASE-EXACT-SNAPSHOT-SEALED',target_time); return next;
end $$;

create or replace function public.create_purchase_approval_instance(target_instance uuid,target_policy uuid,target_policy_checksum text,target_version uuid,
 target_prior_instance uuid,target_generation bigint,target_action uuid,target_audit uuid,target_transition uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare p public.approval_policy_version%rowtype;
 v public.purchase_request_version%rowtype;r public.purchase_request%rowtype;begin
 perform app_private.assert_approval_request(target_time,'approval.instance.submit');
 if app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id() or app_private.current_acting_authority_id() is not null then raise exception 'direct Purchase Approval creation required' using errcode='42501'; end if;
 select * into strict p from public.approval_policy_version where id=target_policy and subject_kind='PURCHASE_REQUEST_VERSION' and state='PUBLISHED'
  and checksum=target_policy_checksum and valid_from<=target_time and (valid_until is null or valid_until>target_time) for share;
 select * into strict v from public.purchase_request_version where id=target_version for update; select * into strict r from public.purchase_request where id=v.purchase_request_id for update;
 perform app_private.m11_assert_internal_mutator('purchase.request.create',target_time);
 if r.state<>'APPROVAL_PENDING' or r.current_version_id<>v.id or v.state<>'SEALED' or v.approval_instance_id is not null
  or v.approval_policy_version_id<>p.id or v.approval_policy_checksum<>p.checksum then raise exception 'exact sealed PurchaseRequestVersion required' using errcode='23514'; end if;
 perform app_private.assert_purchase_policy_selection(v.id,p.id,target_time);
 if (target_prior_instance is null and target_generation<>1) or (target_prior_instance is not null and not exists(
  select 1 from public.approval_instance prior join public.approval_subject_purchase_request_version link on link.instance_id=prior.id
  join public.purchase_request_version previous on previous.id=link.purchase_request_version_id where prior.id=target_prior_instance
   and prior.state in ('REJECTED','RECALLED') and prior.generation+1=target_generation and previous.purchase_request_id=v.purchase_request_id
   and previous.id=v.prior_version_id and previous.version_no<v.version_no)) then raise exception 'invalid Purchase Approval generation chain' using errcode='23514'; end if;
 insert into public.approval_instance(id,policy_version_id,policy_version_no,policy_checksum_snapshot,submitter_user_id,prior_instance_id,generation,state,version_no,created_at)
 values(target_instance,p.id,p.version_no,p.checksum,app_private.current_effective_actor_user_id(),target_prior_instance,target_generation,'DRAFT',1,target_time);
 insert into public.approval_subject_purchase_request_version(instance_id,purchase_request_version_id,purchase_request_id,subject_version_no,subject_checksum,subject_sealed_at)
 values(target_instance,v.id,v.purchase_request_id,v.version_no,v.sealed_snapshot_checksum,v.sealed_at);
 perform app_private.append_approval_audit_transition(target_audit,target_transition,'approval.instance.create',target_instance,1,'EVT-APPROVAL-CREATE',null,'DRAFT','PURCHASE_REQUEST_VERSION',target_time);
 insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,occurred_at)
 values(target_action,target_instance,target_audit,'CREATE','USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),target_time);return 1;
end $$;

create or replace function app_private.apply_purchase_approval_outcome()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions as $$ declare
 link public.approval_subject_purchase_request_version%rowtype;v public.purchase_request_version%rowtype;r public.purchase_request%rowtype;
 terminal public.approval_action%rowtype;position_id uuid;next bigint;begin
 if new.state=old.state then return new; end if; select * into link from public.approval_subject_purchase_request_version where instance_id=new.id;
 if not found then return new; end if;
 if old.state='DRAFT' and new.state='SUBMITTED' then
  select * into strict v from public.purchase_request_version where id=link.purchase_request_version_id for update;
  select * into strict r from public.purchase_request where id=v.purchase_request_id for update;
  if r.state<>'APPROVAL_PENDING' or r.current_version_id<>v.id or v.state<>'SEALED' or v.approval_instance_id is not null then raise exception 'submitted Approval is not exact Purchase subject' using errcode='23514'; end if;
  perform set_config('app.m11_purchase_command',r.id::text,true); update public.purchase_request_version set approval_instance_id=new.id where id=v.id; return new;
 end if;
 if new.state in ('REJECTED','RECALLED','CANCELLED') then
  select * into strict terminal from public.approval_action where instance_id=new.id and event_id=case new.state when 'REJECTED' then 'REJECT' when 'RECALLED' then 'RECALL' else 'CANCEL' end order by occurred_at desc,id desc limit 1;
  insert into public.purchase_approval_negative_outcome(approval_instance_id,purchase_request_version_id,outcome,approval_version,terminal_action_id,reason_code,recorded_at)
  values(new.id,link.purchase_request_version_id,new.state,new.version_no,terminal.id,coalesce(terminal.reason_code,'PURCHASE-APPROVAL-'||new.state),terminal.occurred_at);
  select * into strict v from public.purchase_request_version where id=link.purchase_request_version_id for update;
  select * into strict r from public.purchase_request where id=v.purchase_request_id for update; perform set_config('app.m11_purchase_command',r.id::text,true);
  update public.purchase_request_version set state=case new.state when 'RECALLED' then 'RECALLED' else 'REJECTED' end where id=v.id; return new;
 end if;
 if old.state='IN_PROGRESS' and new.state='COMPLETED' then
  select * into strict terminal from public.approval_action where instance_id=new.id and event_id='APPROVE' order by occurred_at desc,id desc limit 1;
  select ap.position_id_snapshot into strict position_id from public.approval_participant ap join public.position p on p.id=ap.position_id_snapshot
   and p.status='ACTIVE' and p.approval_capability in ('OFFICIAL','REPRESENTATIVE') and p.stable_code<>'POSITION_SENIOR_RESEARCHER' where ap.id=terminal.participant_id;
  select * into strict v from public.purchase_request_version where id=link.purchase_request_version_id for update;
  select * into strict r from public.purchase_request where id=v.purchase_request_id for update;
  if r.state<>'APPROVAL_PENDING' or r.current_version_id<>v.id or v.approval_instance_id<>new.id then raise exception 'Purchase approval completion snapshot mismatch' using errcode='23514'; end if;
  next:=r.version_no+1;perform set_config('app.m11_purchase_command',r.id::text,true);
  update public.purchase_request_version set state='APPROVED' where id=v.id;
  update public.purchase_request set state='REQUEST_APPROVED',version_no=next,updated_at=terminal.occurred_at where id=r.id;
  insert into public.purchase_request_approval_outcome(purchase_request_version_id,purchase_request_id,approval_instance_id,approval_version,
   policy_version_id,policy_version_no,policy_checksum,official_approver_user_id,official_approver_position_id,terminal_action_id,completed_at)
  values(v.id,r.id,new.id,new.version_no,new.policy_version_id,new.policy_version_no,new.policy_checksum_snapshot,terminal.effective_actor_user_id,position_id,terminal.id,terminal.occurred_at);
  perform app_private.append_m11_transition(extensions.gen_random_uuid(),extensions.gen_random_uuid(),extensions.gen_random_uuid(),'purchase.request.manage',
   'PURCHASE_REQUEST',r.id,'EVT-PURCHASE-APPROVED','APPROVAL_PENDING','REQUEST_APPROVED',r.version_no,next,'PURCHASE-EXACT-APPROVAL-COMPLETED',terminal.occurred_at);
 end if;return new;
end $$;
create constraint trigger approval_instance_purchase_subject_apply after update on public.approval_instance deferrable initially deferred
 for each row execute function app_private.apply_purchase_approval_outcome();

create or replace function public.create_purchase_resolution(target_id uuid,target_request uuid,target_quote uuid,target_reason text,
 target_expected bigint,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare r public.purchase_request%rowtype;
 v public.purchase_request_version%rowtype;q public.purchase_quotation%rowtype;next bigint;begin
 perform app_private.m11_assert_internal_mutator('purchase.resolution.manage',target_time);select * into strict r from public.purchase_request where id=target_request for update;
 select * into strict v from public.purchase_request_version where id=r.current_version_id for share;select * into strict q from public.purchase_quotation where id=target_quote and purchase_request_version_id=v.id for share;
 if r.state<>'REQUEST_APPROVED' or v.state<>'APPROVED' or not exists(select 1 from public.purchase_request_approval_outcome o where o.purchase_request_version_id=v.id) then raise exception 'exact approved PurchaseRequestVersion required' using errcode='23514';end if;
 next:=app_private.next_version(r.version_no,target_expected);
 insert into public.purchase_resolution(id,purchase_request_id,purchase_request_version_id,request_version_no,request_checksum,request_sealed_at,
  selected_quotation_id,selected_supplier_id,resolution_reason,resolved_amount,currency,state,version_no,created_by_user_id,created_at)
 values(target_id,r.id,v.id,v.version_no,v.sealed_snapshot_checksum,v.sealed_at,q.id,q.supplier_id,target_reason,q.total_amount,q.currency,'DRAFT',1,
  app_private.current_effective_actor_user_id(),target_time);
 perform set_config('app.m11_purchase_command',r.id::text,true);update public.purchase_request set state='RESOLUTION_DRAFT',version_no=next,updated_at=target_time where id=r.id;
 perform app_private.append_m11_transition(target_audit,target_transition,target_outbox,'purchase.resolution.manage','PURCHASE_REQUEST',r.id,
  'EVT-PURCHASE-CREATE-RESOLUTION','REQUEST_APPROVED','RESOLUTION_DRAFT',r.version_no,next,target_reason,target_time);return target_id;
end $$;
create or replace function public.transition_purchase_resolution(target_resolution uuid,target_event text,target_expected_request bigint,target_expected_resolution bigint,
 target_reason text,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare x public.purchase_resolution%rowtype;r public.purchase_request%rowtype;
 next bigint;next_resolution bigint;from_state text;to_state text;action text;begin select * into strict x from public.purchase_resolution where id=target_resolution for update;
 select * into strict r from public.purchase_request where id=x.purchase_request_id for update;
 action:=case when target_event='EVT-PURCHASE-AWAIT-PAYMENT' then 'purchase.payment.record' else 'purchase.resolution.manage' end;
 perform app_private.m11_assert_internal_mutator(action,target_time);
 from_state:=r.state;to_state:=case when target_event='EVT-PURCHASE-RESOLVE' and r.state='RESOLUTION_DRAFT' and x.state='DRAFT' then 'RESOLVED'
  when target_event='EVT-PURCHASE-AWAIT-PAYMENT' and r.state='RESOLVED' and x.state='RESOLVED' then 'PAYMENT_PENDING_EXTERNAL' else null end;
 if to_state is null then raise exception 'invalid Purchase resolution transition' using errcode='23514';end if;
 next:=app_private.next_version(r.version_no,target_expected_request);next_resolution:=app_private.next_version(x.version_no,target_expected_resolution);
 update public.purchase_resolution set state=case when to_state='RESOLVED' then 'RESOLVED' else 'AWAITING_EXTERNAL_PAYMENT' end,
  version_no=next_resolution,resolved_at=case when to_state='RESOLVED' then target_time else resolved_at end where id=x.id;
 perform set_config('app.m11_purchase_command',r.id::text,true);update public.purchase_request set state=to_state,version_no=next,updated_at=target_time where id=r.id;
 perform app_private.append_m11_transition(target_audit,target_transition,target_outbox,action,'PURCHASE_REQUEST',r.id,target_event,from_state,to_state,
  r.version_no,next,target_reason,target_time);return next;
end $$;
create or replace function public.record_external_payment_fact(target_id uuid,target_resolution uuid,target_system text,target_reference text,
 target_amount numeric,target_currency char(3),target_paid_on date,target_expected_request bigint,target_expected_resolution bigint,
 target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare x public.purchase_resolution%rowtype;r public.purchase_request%rowtype;next bigint;begin
 perform app_private.m11_assert_internal_mutator('purchase.payment.record',target_time);select * into strict x from public.purchase_resolution where id=target_resolution for update;
 select * into strict r from public.purchase_request where id=x.purchase_request_id for update;
 if r.state<>'PAYMENT_PENDING_EXTERNAL' or x.state<>'AWAITING_EXTERNAL_PAYMENT' or target_amount<>x.resolved_amount or target_currency<>x.currency then raise exception 'exact external payment readback required; no transfer command exists' using errcode='23514';end if;
 next:=app_private.next_version(r.version_no,target_expected_request);perform app_private.next_version(x.version_no,target_expected_resolution);
 insert into public.purchase_external_payment_fact(id,purchase_resolution_id,external_system_code,external_reference,confirmed_amount,currency,paid_on,recorded_by_user_id,recorded_at)
 values(target_id,x.id,target_system,target_reference,target_amount,target_currency,target_paid_on,app_private.current_effective_actor_user_id(),target_time);
 update public.purchase_resolution set state='EXTERNAL_PAYMENT_CONFIRMED',version_no=version_no+1 where id=x.id;
 perform set_config('app.m11_purchase_command',r.id::text,true);update public.purchase_request set state='PAYMENT_CONFIRMED',version_no=next,updated_at=target_time where id=r.id;
 perform app_private.append_m11_transition(target_audit,target_transition,target_outbox,'purchase.payment.record','PURCHASE_REQUEST',r.id,
  'EVT-PURCHASE-CONFIRM-PAYMENT','PAYMENT_PENDING_EXTERNAL','PAYMENT_CONFIRMED',r.version_no,next,'EXTERNAL-PAYMENT-FACT-RECORDED',target_time);return next;
end $$;
create or replace function public.create_receipt(target_id uuid,target_no text,target_resolution uuid,target_received_on date,target_audit uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare x public.purchase_resolution%rowtype;r public.purchase_request%rowtype;begin
 perform app_private.m11_assert_internal_mutator('purchase.receipt.record',target_time);select * into strict x from public.purchase_resolution where id=target_resolution for share;
 select * into strict r from public.purchase_request where id=x.purchase_request_id for update;
 if r.state not in ('PAYMENT_CONFIRMED','PARTIALLY_RECEIVED') or x.state<>'EXTERNAL_PAYMENT_CONFIRMED' then raise exception 'payment fact required before receipt' using errcode='23514';end if;
 insert into public.receipt(id,receipt_no,purchase_resolution_id,purchase_request_id,received_on,received_by_user_id,state,version_no,created_at)
 values(target_id,target_no,x.id,r.id,target_received_on,app_private.current_effective_actor_user_id(),'RECORDED',1,target_time);
 perform app_private.append_audit(target_audit,'purchase.receipt.record','RECEIPT',target_id,1,'SUCCEEDED','RECEIPT-CREATED',x.id,null,null,null,target_time);return target_id;
end $$;
create or replace function public.add_receipt_line(target_receipt uuid,target_line uuid,target_request_line uuid,target_observed_quantity numeric,
 target_accepted_quantity numeric,target_note text,target_discrepancy_id uuid,target_discrepancy_reason text,target_discrepancy_attachment uuid,
 target_audit uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare rc public.receipt%rowtype;pl public.purchase_request_line%rowtype;
 received numeric;a public.attachment%rowtype;excess numeric;begin
 perform app_private.m11_assert_internal_mutator('purchase.receipt.record',target_time);select * into strict rc from public.receipt where id=target_receipt for update;
 select * into strict pl from public.purchase_request_line where id=target_request_line for update;
 if rc.state<>'RECORDED' or not exists(select 1 from public.purchase_resolution x where x.id=rc.purchase_resolution_id and x.purchase_request_version_id=pl.purchase_request_version_id) then raise exception 'receipt line subject mismatch' using errcode='23514';end if;
 select coalesce(sum(l.received_quantity),0) into received from public.receipt_line l join public.receipt r on r.id=l.receipt_id
  where r.purchase_request_id=rc.purchase_request_id and l.purchase_request_line_id=pl.id;
 if target_observed_quantity<target_accepted_quantity or received+target_accepted_quantity>pl.quantity then
  raise exception 'accepted Receipt quantity exceeds exact requested remainder' using errcode='23514';end if;
 excess:=target_observed_quantity-target_accepted_quantity;
 if (excess>0)<>(target_discrepancy_id is not null) then raise exception 'observed overage requires one quarantined discrepancy' using errcode='23514';end if;
 insert into public.receipt_line(id,receipt_id,purchase_request_line_id,purchase_request_version_id,received_quantity,condition_note)
 values(target_line,rc.id,pl.id,pl.purchase_request_version_id,target_accepted_quantity,target_note);
 if excess>0 then
  if nullif(btrim(target_discrepancy_reason),'') is null then raise exception 'overage discrepancy reason required' using errcode='23514';end if;
  select * into strict a from public.attachment where id=target_discrepancy_attachment and state='AVAILABLE';
  insert into public.receipt_overage_discrepancy(id,receipt_id,purchase_request_line_id,purchase_request_version_id,observed_quantity,accepted_quantity,
   excess_quantity,reason,evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum,recorded_by_user_id,recorded_at)
  values(target_discrepancy_id,rc.id,pl.id,pl.purchase_request_version_id,target_observed_quantity,target_accepted_quantity,excess,
   target_discrepancy_reason,a.id,a.row_version,a.detected_sha256,app_private.current_effective_actor_user_id(),target_time);
 end if;
 perform app_private.append_audit(target_audit,'purchase.receipt.record','RECEIPT',rc.id,rc.version_no,'SUCCEEDED','RECEIPT-LINE-ADDED',target_line,null,null,null,target_time);return target_line;
end $$;
create or replace function public.finalize_receipt(target_receipt uuid,target_expected bigint,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare rc public.receipt%rowtype;r public.purchase_request%rowtype;complete boolean;next bigint;begin
 perform app_private.m11_assert_internal_mutator('purchase.receipt.record',target_time);select * into strict rc from public.receipt where id=target_receipt for update;
 select * into strict r from public.purchase_request where id=rc.purchase_request_id for update;
 if rc.state<>'RECORDED' or not exists(select 1 from public.receipt_line where receipt_id=rc.id) then raise exception 'nonempty unfinalized Receipt required' using errcode='23514';end if;
 select not exists(select 1 from public.purchase_request_line pl where pl.purchase_request_version_id=r.current_version_id and pl.quantity<>
  (select coalesce(sum(rl.received_quantity),0) from public.receipt_line rl join public.receipt x on x.id=rl.receipt_id where x.purchase_request_id=r.id and rl.purchase_request_line_id=pl.id)) into complete;
 next:=app_private.next_version(r.version_no,target_expected);perform set_config('app.m11_purchase_command',r.id::text,true);
 update public.purchase_request set state=case when complete then 'RECEIVED' else 'PARTIALLY_RECEIVED' end,version_no=next,updated_at=target_time where id=r.id;
 perform app_private.append_m11_transition(target_audit,target_transition,target_outbox,'purchase.receipt.record','PURCHASE_REQUEST',r.id,
  case when complete then 'EVT-PURCHASE-RECEIVE' else 'EVT-PURCHASE-RECEIVE-PART' end,r.state,case when complete then 'RECEIVED' else 'PARTIALLY_RECEIVED' end,
  r.version_no,next,'RECEIPT-QUANTITIES-FINALIZED',target_time);return next;
end $$;
create or replace function public.request_purchase_inspection(target_receipt uuid,target_expected bigint,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare rc public.receipt%rowtype;r public.purchase_request%rowtype;next bigint;begin
 perform app_private.m11_assert_internal_mutator('purchase.inspection.record',target_time);select * into strict rc from public.receipt where id=target_receipt for update;
 select * into strict r from public.purchase_request where id=rc.purchase_request_id for update;
 if r.state<>'RECEIVED' or rc.state<>'RECORDED' then raise exception 'fully received purchase required' using errcode='23514';end if;
 next:=app_private.next_version(r.version_no,target_expected);update public.receipt set state='INSPECTION_PENDING',version_no=version_no+1 where id=rc.id;
 perform set_config('app.m11_purchase_command',r.id::text,true);update public.purchase_request set state='INSPECTION_PENDING',version_no=next,updated_at=target_time where id=r.id;
 perform app_private.append_m11_transition(target_audit,target_transition,target_outbox,'purchase.inspection.record','PURCHASE_REQUEST',r.id,
  'EVT-PURCHASE-REQUEST-INSPECTION','RECEIVED','INSPECTION_PENDING',r.version_no,next,'PURCHASE-INSPECTION-REQUESTED',target_time);return next;
end $$;
create or replace function public.record_purchase_inspection(target_id uuid,target_receipt uuid,target_inspection uuid,target_inspection_attempt uuid,
 target_inspection_attempt_no integer,target_inspection_checksum text,target_quantity text,target_spec text,target_appearance text,
 target_performance text,target_overall text,target_summary text,target_attachment uuid,target_expected bigint,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare rc public.receipt%rowtype;r public.purchase_request%rowtype;a public.attachment%rowtype;next bigint;begin
 perform app_private.m11_assert_internal_mutator('purchase.inspection.record',target_time);select * into strict rc from public.receipt where id=target_receipt for update;
 select * into strict r from public.purchase_request where id=rc.purchase_request_id for update;select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE';
 if r.state<>'INSPECTION_PENDING' or rc.state<>'INSPECTION_PENDING' or not exists(select 1 from public.inspection_attempt i
   where i.id=target_inspection_attempt and i.inspection_id=target_inspection and i.attempt_no=target_inspection_attempt_no
    and i.checksum=target_inspection_checksum and i.state='SEALED')
  or (target_overall='PASS' and (target_quantity<>'PASS' or target_spec<>'PASS' or target_appearance<>'PASS' or target_performance='FAIL')) then raise exception 'exact pending receipt, sealed InspectionAttempt and consistent verdict required' using errcode='23514';end if;
 next:=app_private.next_version(r.version_no,target_expected);
 insert into public.purchase_inspection(id,receipt_id,purchase_resolution_id,inspection_id,inspection_attempt_id,inspection_attempt_no,inspection_attempt_checksum,
  inspector_user_id,quantity_verdict,specification_verdict,appearance_verdict,performance_verdict,
  overall_verdict,summary,evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum,inspected_at)
 values(target_id,rc.id,rc.purchase_resolution_id,target_inspection,target_inspection_attempt,target_inspection_attempt_no,target_inspection_checksum,
  app_private.current_effective_actor_user_id(),target_quantity,target_spec,target_appearance,target_performance,
  target_overall,target_summary,a.id,a.row_version,a.detected_sha256,target_time);
 update public.receipt set state=case when target_overall='PASS' then 'INSPECTED' else 'CORRECTION_REQUIRED' end,version_no=version_no+1 where id=rc.id;
 perform set_config('app.m11_purchase_command',r.id::text,true);update public.purchase_request set state=case when target_overall='PASS' then 'COMPLETED' else 'CORRECTION_REQUIRED' end,
  version_no=next,updated_at=target_time where id=r.id;
 perform app_private.append_m11_transition(target_audit,target_transition,target_outbox,'purchase.inspection.record','PURCHASE_REQUEST',r.id,
  case when target_overall='PASS' then 'EVT-PURCHASE-INSPECTION-PASS' else 'EVT-PURCHASE-INSPECTION-FAIL' end,'INSPECTION_PENDING',
  case when target_overall='PASS' then 'COMPLETED' else 'CORRECTION_REQUIRED' end,r.version_no,next,'PURCHASE-INSPECTION-EVIDENCE-RECORDED',target_time);return next;
end $$;

create or replace function public.resolve_purchase_correction(target_receipt uuid,target_expected bigint,target_reason text,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare rc public.receipt%rowtype;r public.purchase_request%rowtype;next bigint;begin
 perform app_private.m11_assert_internal_mutator('purchase.inspection.record',target_time);select * into strict rc from public.receipt where id=target_receipt for update;
 select * into strict r from public.purchase_request where id=rc.purchase_request_id for update;
 if r.state<>'CORRECTION_REQUIRED' or rc.state<>'CORRECTION_REQUIRED' or nullif(btrim(target_reason),'') is null then raise exception 'evidenced correction reason required' using errcode='23514';end if;
 next:=app_private.next_version(r.version_no,target_expected);update public.receipt set state='INSPECTION_PENDING',version_no=version_no+1 where id=rc.id;
 perform set_config('app.m11_purchase_command',r.id::text,true);update public.purchase_request set state='INSPECTION_PENDING',version_no=next,updated_at=target_time where id=r.id;
 perform app_private.append_m11_transition(target_audit,target_transition,target_outbox,'purchase.inspection.record','PURCHASE_REQUEST',r.id,
  'EVT-PURCHASE-RESOLVE-CORRECTION','CORRECTION_REQUIRED','INSPECTION_PENDING',r.version_no,next,target_reason,target_time);return next;
end $$;

create or replace function app_private.append_rnd_fact(target_audit uuid,target_outbox uuid,target_action text,target_type text,target_id uuid,
 target_version bigint,target_event text,target_reason text,target_time timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.append_audit(target_audit,target_action,target_type,target_id,target_version,'SUCCEEDED',target_reason,null,null,null,null,target_time);
 perform app_private.enqueue_outbox(target_outbox,target_audit,target_event,target_type,target_id,target_version,
  app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),'RND_FACT_REF',1,
  jsonb_build_object('aggregateId',target_id,'resourceVersion',target_version,'eventId',target_event),target_event||':'||target_id::text||':'||target_version::text,target_time,target_time);
end $$;
create or replace function public.create_rnd_program(target_id uuid,target_code text,target_name text,target_sponsor text,target_manager text,target_agreement_no text,
 target_start date,target_end date,target_budget numeric,target_currency char(3),target_audit uuid,target_outbox uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m11_assert_internal_mutator('rnd.program.register',target_time);
 insert into public.rnd_program(id,program_code,name,sponsor_agency,managing_agency,agreement_no,agreement_start,agreement_end,total_budget,currency,
  created_by_user_id,created_at,updated_at) values(target_id,target_code,target_name,target_sponsor,target_manager,target_agreement_no,target_start,target_end,
  target_budget,target_currency,app_private.current_effective_actor_user_id(),target_time,target_time);
 perform app_private.append_rnd_fact(target_audit,target_outbox,'rnd.program.register','RND_PROGRAM',target_id,1,'EVT-RND-REGISTER',
  'RND-PROGRAM-AGREEMENT-FACT-RECORDED',target_time);return target_id;
end $$;
create or replace function public.link_project_rnd_program(target_project uuid,target_program uuid,target_relation text,target_from date,target_until date,
 target_audit uuid,target_outbox uuid,target_time timestamptz) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m11_assert_internal_mutator('rnd.program.manage',target_time);
 if not app_private.actor_has_project_internal_scope(target_project,target_time) then raise exception 'Project scope required' using errcode='42501';end if;
 insert into public.project_rnd_program(project_id,rnd_program_id,relation_type,valid_from,valid_until) values(target_project,target_program,target_relation,target_from,target_until);
 perform app_private.append_rnd_fact(target_audit,target_outbox,'rnd.program.manage','RND_PROGRAM',target_program,1,'EVT-RND-LINK-PROJECT','RND-PROJECT-LINKED',target_time);
end $$;
create or replace function public.create_rnd_budget(target_budget_id uuid,target_version_id uuid,target_program uuid,target_code text,target_total numeric,
 target_currency char(3),target_audit uuid,target_time timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m11_assert_internal_mutator('rnd.budget.manage',target_time);
 if not exists(select 1 from public.rnd_program p where p.id=target_program and p.currency=target_currency and target_total<=p.total_budget) then raise exception 'Budget must fit exact Program agreement facts' using errcode='23514';end if;
 insert into public.rnd_budget(id,rnd_program_id,budget_code,current_version_id,current_version_no,created_at) values(target_budget_id,target_program,target_code,target_version_id,1,target_time);
 insert into public.rnd_budget_version(id,rnd_budget_id,rnd_program_id,version_no,state,total_amount,currency,created_by_user_id,created_at)
 values(target_version_id,target_budget_id,target_program,1,'DRAFT',target_total,target_currency,app_private.current_effective_actor_user_id(),target_time);
 perform app_private.append_audit(target_audit,'rnd.budget.manage','RND_BUDGET',target_budget_id,1,'SUCCEEDED','RND-BUDGET-DRAFT-CREATED',target_version_id,null,null,null,target_time);return target_budget_id;
end $$;
create or replace function public.add_rnd_budget_line(target_budget uuid,target_line uuid,target_category text,target_amount numeric,target_purpose text,target_audit uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare b public.rnd_budget%rowtype;v public.rnd_budget_version%rowtype;begin
 perform app_private.m11_assert_internal_mutator('rnd.budget.manage',target_time);select * into strict b from public.rnd_budget where id=target_budget for update;
 select * into strict v from public.rnd_budget_version where id=b.current_version_id for update;if v.state<>'DRAFT' then raise exception 'BudgetVersion is sealed' using errcode='55000';end if;
 if (select coalesce(sum(allocated_amount),0) from public.rnd_budget_line where rnd_budget_version_id=v.id)+target_amount>v.total_amount then raise exception 'Budget line allocation exceeds version total' using errcode='23514';end if;
 insert into public.rnd_budget_line(id,rnd_budget_version_id,category_code,allocated_amount,purpose) values(target_line,v.id,target_category,target_amount,target_purpose);
 perform app_private.append_audit(target_audit,'rnd.budget.manage','RND_BUDGET',b.id,v.version_no,'SUCCEEDED','RND-BUDGET-LINE-ADDED',target_line,null,null,null,target_time);return target_line;
end $$;
create or replace function public.seal_rnd_budget(target_budget uuid,target_audit uuid,target_outbox uuid,target_time timestamptz)
returns text language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare b public.rnd_budget%rowtype;v public.rnd_budget_version%rowtype;checksum text;begin
 perform app_private.m11_assert_internal_mutator('rnd.budget.manage',target_time);select * into strict b from public.rnd_budget where id=target_budget for update;
 select * into strict v from public.rnd_budget_version where id=b.current_version_id for update;
 if v.state<>'DRAFT' or (select coalesce(sum(allocated_amount),0) from public.rnd_budget_line where rnd_budget_version_id=v.id)<>v.total_amount then raise exception 'complete exact BudgetLine allocation required' using errcode='23514';end if;
 checksum:=app_private.canonical_json_sha256(jsonb_build_object('schema','RND_BUDGET_VERSION_V1','id',v.id,'programId',v.rnd_program_id,
  'versionNo',v.version_no,'total',v.total_amount,'currency',v.currency,'lines',(select jsonb_agg(jsonb_build_object('id',l.id,'category',l.category_code,
  'amount',l.allocated_amount,'purpose',l.purpose) order by l.category_code) from public.rnd_budget_line l where l.rnd_budget_version_id=v.id)));
 update public.rnd_budget_version set state='SEALED',checksum=checksum,sealed_at=target_time where id=v.id;
 perform app_private.append_rnd_fact(target_audit,target_outbox,'rnd.budget.manage','RND_BUDGET',b.id,v.version_no,'EVT-RND-ADD-BUDGET-VERSION','RND-BUDGET-EXACT-VERSION-SEALED',target_time);return checksum;
end $$;
create or replace function public.record_rnd_expenditure(target_id uuid,target_no text,target_program uuid,target_budget_version uuid,target_budget_line uuid,
 target_supplier uuid,target_counterparty text,target_spent_on date,target_amount numeric,target_currency char(3),target_purpose text,
 target_project uuid,target_contract uuid,target_contract_version uuid,target_resolution uuid,target_evidence_id uuid,target_evidence_type text,target_attachment uuid,
 target_audit uuid,target_outbox uuid,target_time timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 v public.rnd_budget_version%rowtype;l public.rnd_budget_line%rowtype;a public.attachment%rowtype;spent numeric;begin
 perform app_private.m11_assert_internal_mutator('rnd.expenditure.record',target_time);select * into strict v from public.rnd_budget_version where id=target_budget_version and rnd_program_id=target_program and state='SEALED' for share;
 select * into strict l from public.rnd_budget_line where id=target_budget_line and rnd_budget_version_id=v.id for update;
 select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE';
 select coalesce(sum(e.amount),0) into spent from public.rnd_expenditure e where e.budget_line_id=l.id and e.budget_version_id=v.id;
 if target_currency<>v.currency or spent+target_amount>l.allocated_amount then raise exception 'budget overrun is forbidden' using errcode='23514';end if;
 if target_project is not null and not exists(select 1 from public.project_rnd_program x where x.project_id=target_project and x.rnd_program_id=target_program
  and x.valid_from<=target_spent_on and (x.valid_until is null or x.valid_until>=target_spent_on)) then raise exception 'exact active Project/R&D link required' using errcode='23514';end if;
 insert into public.rnd_expenditure(id,expenditure_no,rnd_program_id,budget_version_id,budget_line_id,supplier_id,counterparty_name,spent_on,amount,currency,purpose,recorded_by_user_id,recorded_at)
 values(target_id,target_no,target_program,v.id,l.id,target_supplier,target_counterparty,target_spent_on,target_amount,target_currency,target_purpose,app_private.current_effective_actor_user_id(),target_time);
 if target_project is not null then insert into public.rnd_expenditure_project values(target_id,target_project);end if;
 if target_contract is not null then insert into public.rnd_expenditure_contract(expenditure_id,contract_id,contract_version_id,contract_version_no,
  contract_version_checksum,contract_version_sealed_at) select target_id,target_contract,v.id,v.version_no,v.sealed_snapshot_checksum,v.sealed_at
  from public.contract_version v where v.id=target_contract_version and v.contract_id=target_contract and v.state in ('SIGNED','SUPERSEDED');
  if not found then raise exception 'exact signed ContractVersion expenditure link required' using errcode='23514';end if;end if;
 if target_resolution is not null then insert into public.rnd_expenditure_purchase values(target_id,target_resolution);end if;
 insert into public.rnd_evidence(id,evidence_type_code,attachment_id,attachment_row_version,attachment_checksum,recorded_by_user_id,recorded_at)
 values(target_evidence_id,target_evidence_type,a.id,a.row_version,a.detected_sha256,app_private.current_effective_actor_user_id(),target_time);
 insert into public.rnd_evidence_expenditure(evidence_id,expenditure_id) values(target_evidence_id,target_id);
 perform app_private.append_rnd_fact(target_audit,target_outbox,'rnd.expenditure.record','RND_EXPENDITURE',target_id,1,
  'EVT-RND-RECORD-EXPENDITURE','RND-EXPENDITURE-WITH-EXACT-EVIDENCE',target_time);
 perform app_private.enqueue_outbox(extensions.gen_random_uuid(),target_audit,'EVT-RND-ADD-EVIDENCE','RND_EXPENDITURE',target_id,1,
  app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),'RND_FACT_REF',1,
  jsonb_build_object('aggregateId',target_id,'resourceVersion',1,'eventId','EVT-RND-ADD-EVIDENCE'),
  'EVT-RND-ADD-EVIDENCE:'||target_id::text||':1',target_time,target_time);return target_id;
end $$;
create or replace function public.add_rnd_budget_evidence(target_id uuid,target_budget_version uuid,target_type text,target_attachment uuid,
 target_audit uuid,target_outbox uuid,target_time timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 v public.rnd_budget_version%rowtype;a public.attachment%rowtype;begin
 perform app_private.m11_assert_internal_mutator('rnd.evidence.record',target_time);
 select * into strict v from public.rnd_budget_version where id=target_budget_version and state='SEALED' for share;
 select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE';
 insert into public.rnd_evidence(id,evidence_type_code,attachment_id,attachment_row_version,attachment_checksum,recorded_by_user_id,recorded_at)
 values(target_id,target_type,a.id,a.row_version,a.detected_sha256,app_private.current_effective_actor_user_id(),target_time);
 insert into public.rnd_evidence_budget_version(evidence_id,budget_version_id,budget_checksum,budget_sealed_at) values(target_id,v.id,v.checksum,v.sealed_at);
 perform app_private.append_rnd_fact(target_audit,target_outbox,'rnd.evidence.record','RND_BUDGET',v.rnd_budget_id,v.version_no,
  'EVT-RND-ADD-EVIDENCE','RND-BUDGET-EXACT-EVIDENCE',target_time);return target_id;
end $$;
create or replace function public.record_rnd_deadline(target_id uuid,target_program uuid,target_type text,target_due timestamptz,target_required_evidence text,
 target_audit uuid,target_outbox uuid,target_time timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m11_assert_internal_mutator('rnd.deadline.manage',target_time);
 insert into public.rnd_report_deadline(id,rnd_program_id,deadline_type,due_at,required_evidence_type_code,created_at)
 values(target_id,target_program,target_type,target_due,target_required_evidence,target_time);
 perform app_private.append_rnd_fact(target_audit,target_outbox,'rnd.deadline.manage','RND_REPORT_DEADLINE',target_id,1,
  'EVT-RND-REGISTER-DEADLINE','RND-DEADLINE-RECORDED',target_time);return target_id;
end $$;
create or replace function public.record_rnd_deadline_evidence(target_id uuid,target_deadline uuid,target_type text,target_attachment uuid,
 target_audit uuid,target_outbox uuid,target_time timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 d public.rnd_report_deadline%rowtype;a public.attachment%rowtype;begin
 perform app_private.m11_assert_internal_mutator('rnd.evidence.record',target_time);
 select * into strict d from public.rnd_report_deadline where id=target_deadline and completed_at is null for update;
 select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE';
 if d.required_evidence_type_code is not null and d.required_evidence_type_code<>target_type then raise exception 'deadline evidence type mismatch' using errcode='23514';end if;
 insert into public.rnd_evidence(id,evidence_type_code,attachment_id,attachment_row_version,attachment_checksum,recorded_by_user_id,recorded_at)
 values(target_id,target_type,a.id,a.row_version,a.detected_sha256,app_private.current_effective_actor_user_id(),target_time);
 insert into public.rnd_evidence_deadline(evidence_id,deadline_id,deadline_due_at) values(target_id,d.id,d.due_at);
 update public.rnd_report_deadline set completed_at=target_time where id=d.id;
 perform app_private.append_rnd_fact(target_audit,target_outbox,'rnd.evidence.record','RND_REPORT_DEADLINE',d.id,1,
  'EVT-RND-ADD-EVIDENCE','RND-DEADLINE-EXACT-EVIDENCE',target_time);return target_id;
end $$;
create or replace function public.emit_rnd_alert(target_id uuid,target_program uuid,target_kind text,target_expenditure uuid,target_deadline uuid,
 target_key text,target_reason text,target_audit uuid,target_outbox uuid,target_time timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m11_assert_internal_mutator('rnd.deadline.manage',target_time);
 if target_kind in ('DEADLINE_DUE','DEADLINE_OVERDUE') and not exists(select 1 from public.rnd_report_deadline d where d.id=target_deadline and d.rnd_program_id=target_program
  and d.completed_at is null and ((target_kind='DEADLINE_DUE' and d.due_at>=target_time) or (target_kind='DEADLINE_OVERDUE' and d.due_at<target_time))) then raise exception 'deadline alert facts do not match' using errcode='23514';end if;
 if target_kind='MISSING_EVIDENCE' and not exists(select 1 from public.rnd_expenditure e where e.id=target_expenditure and e.rnd_program_id=target_program
  and not exists(select 1 from public.rnd_evidence_expenditure x where x.expenditure_id=e.id)) then raise exception 'missing evidence alert facts do not match' using errcode='23514';end if;
 if target_kind='BUDGET_OVERRUN' and not exists(select 1 from public.rnd_expenditure e join public.rnd_budget_line l on l.id=e.budget_line_id
  where e.id=target_expenditure and e.rnd_program_id=target_program and (select sum(x.amount) from public.rnd_expenditure x where x.budget_line_id=l.id)>l.allocated_amount) then raise exception 'budget alert facts do not match' using errcode='23514';end if;
 insert into public.rnd_alert(id,rnd_program_id,alert_kind,source_expenditure_id,source_deadline_id,idempotency_key,reason_code,detected_at)
 values(target_id,target_program,target_kind,target_expenditure,target_deadline,target_key,target_reason,target_time) on conflict(idempotency_key) do nothing;
 if not found then return (select id from public.rnd_alert where idempotency_key=target_key);end if;
 perform app_private.append_rnd_fact(target_audit,target_outbox,'rnd.deadline.manage','RND_REPORT_DEADLINE',coalesce(target_deadline,target_expenditure),1,
  'EVT-RND-DEADLINE-ALERTED',target_reason,target_time);return target_id;
end $$;

create or replace function app_private.assert_receipt_quantity()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$ declare allowed numeric;received numeric;begin
 select quantity into strict allowed from public.purchase_request_line where id=new.purchase_request_line_id and purchase_request_version_id=new.purchase_request_version_id;
 select coalesce(sum(l.received_quantity),0) into received from public.receipt_line l join public.receipt r on r.id=l.receipt_id
  where r.purchase_request_id=(select purchase_request_id from public.receipt where id=new.receipt_id) and l.purchase_request_line_id=new.purchase_request_line_id;
 if received>allowed then raise exception 'accepted Receipt quantity exceeds exact request quantity' using errcode='23514';end if;return new;
end $$;
create constraint trigger receipt_line_over_receipt after insert on public.receipt_line deferrable initially deferred
 for each row execute function app_private.assert_receipt_quantity();
create or replace function app_private.assert_rnd_expenditure_complete()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$ declare allocated numeric;spent numeric;begin
 select allocated_amount into strict allocated from public.rnd_budget_line where id=new.budget_line_id and rnd_budget_version_id=new.budget_version_id;
 select coalesce(sum(amount),0) into spent from public.rnd_expenditure where budget_line_id=new.budget_line_id and budget_version_id=new.budget_version_id;
 if spent>allocated or not exists(select 1 from public.rnd_evidence_expenditure where expenditure_id=new.id) then
  raise exception 'R&D expenditure requires available evidence and cannot exceed sealed BudgetLine' using errcode='23514';end if;return new;
end $$;
create constraint trigger rnd_expenditure_budget_evidence after insert on public.rnd_expenditure deferrable initially deferred
 for each row execute function app_private.assert_rnd_expenditure_complete();
create or replace function app_private.protect_rnd_budget_snapshot()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin
 if tg_op='DELETE' or old.state<>'DRAFT' then raise exception 'sealed BudgetVersion is immutable' using errcode='55000';end if;return new;
end $$;
create trigger rnd_budget_version_guard before update or delete on public.rnd_budget_version for each row execute function app_private.protect_rnd_budget_snapshot();

create or replace function public.read_purchase_hq(target_id uuid,target_time timestamptz)
returns table(purchase_request_id uuid,request_no text,state text,vat_included_total numeric,currency char(3),payment_confirmed boolean,version_no bigint)
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$ begin
 if target_time<>app_private.request_time() or app_private.required_setting('app.actor_kind')<>'USER'
  or (not app_private.m11_actor_is_hq(target_time) and not app_private.actor_has_permission('purchase.request.read',target_time)) then return;end if;
 return query select r.id,r.request_no,r.state,v.vat_included_total,v.currency,
  exists(select 1 from public.purchase_resolution x join public.purchase_external_payment_fact f on f.purchase_resolution_id=x.id where x.purchase_request_id=r.id),r.version_no
 from public.purchase_request r join public.purchase_request_version v on v.id=r.current_version_id where r.id=target_id;
end $$;
create or replace function public.read_rnd_program_summary(target_id uuid,target_time timestamptz)
returns table(rnd_program_id uuid,program_code text,name text,agreement_start date,agreement_end date,total_budget numeric,recorded_expenditure numeric,balance numeric,currency char(3))
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$ begin
 if target_time<>app_private.request_time() or app_private.required_setting('app.actor_kind')<>'USER'
  or not app_private.actor_has_permission('rnd.program.read',target_time)
  or not exists(select 1 from public.user_account u where u.id=app_private.current_actor_user_id() and u.account_kind='INTERNAL' and u.status='ACTIVE'
    and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time)) then return;end if;
 return query select p.id,p.program_code,p.name,p.agreement_start,p.agreement_end,p.total_budget,coalesce(sum(e.amount),0),p.total_budget-coalesce(sum(e.amount),0),p.currency
  from public.rnd_program p left join public.rnd_expenditure e on e.rnd_program_id=p.id where p.id=target_id group by p.id;
end $$;

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
       or (s.subject_kind in ('CHANGE_REQUEST_VERSION','CHANGE_ORDER_VERSION','PURCHASE_REQUEST_VERSION') and s.subject_state='SEALED')) then
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

create or replace function public.perform_purchase_approval_action(
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
  if not exists(select 1 from public.approval_subject_purchase_request_version where instance_id=target_instance_id) then
    raise exception 'Purchase Approval command requires an exact PurchaseRequestVersion subject' using errcode='23514';
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
          where s.subject_kind='PURCHASE_REQUEST_VERSION' and s.subject_state='SEALED') then
          raise exception 'exact PurchaseRequestVersion changed before completion' using errcode='23514';
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

create index purchase_request_state_idx on public.purchase_request(owner_organization_id,state,updated_at);
create index purchase_line_version_idx on public.purchase_request_line(purchase_request_version_id,sequence_no);
create index receipt_request_idx on public.receipt(purchase_request_id,created_at);
create index rnd_expenditure_program_idx on public.rnd_expenditure(rnd_program_id,spent_on);
create index rnd_deadline_due_idx on public.rnd_report_deadline(due_at) where completed_at is null;

do $rls$ declare table_name text;begin foreach table_name in array array[
 'supplier','supplier_vendor_link','item','supplier_item','purchase_request','purchase_request_version','purchase_request_line','purchase_quotation',
 'purchase_request_project','purchase_request_rnd_program','purchase_resolution','purchase_external_payment_fact','receipt','receipt_line','receipt_overage_discrepancy','purchase_inspection',
 'purchase_approval_preset_version','purchase_approval_tier','purchase_approval_policy_snapshot',
 'rnd_program','project_rnd_program','rnd_budget','rnd_budget_version','rnd_budget_line','rnd_expenditure','rnd_expenditure_project','rnd_expenditure_contract',
 'rnd_expenditure_purchase','rnd_evidence','rnd_evidence_expenditure','rnd_evidence_budget_version','rnd_evidence_deadline','rnd_report_deadline','rnd_alert','approval_subject_purchase_request_version',
 'purchase_request_approval_outcome','purchase_approval_negative_outcome'] loop
 execute format('alter table public.%I enable row level security',table_name);execute format('alter table public.%I force row level security',table_name);end loop;end $rls$;

create policy purchase_request_internal_read on public.purchase_request for select to youone_request using(
 exists(select 1 from public.user_account u where u.id=app_private.current_actor_user_id() and u.account_kind='INTERNAL' and u.status='ACTIVE'
  and u.valid_from<=app_private.request_time() and (u.valid_until is null or u.valid_until>app_private.request_time()))
 and (requester_user_id=app_private.current_effective_actor_user_id() or app_private.m11_actor_is_hq(app_private.request_time())
  or app_private.actor_has_permission('purchase.request.read',app_private.request_time())));
create policy purchase_version_internal_read on public.purchase_request_version for select to youone_request using(exists(
 select 1 from public.purchase_request r where r.id=purchase_request_id and (r.requester_user_id=app_private.current_effective_actor_user_id()
  or app_private.m11_actor_is_hq(app_private.request_time()) or app_private.actor_has_permission('purchase.request.read',app_private.request_time()))));
create policy approval_purchase_subject_read on public.approval_subject_purchase_request_version for select to youone_request using(
 app_private.can_read_approval_instance(instance_id,app_private.request_time()));
create policy rnd_program_internal_read on public.rnd_program for select to youone_request using(
 app_private.required_setting('app.actor_kind')='USER' and app_private.actor_has_permission('rnd.program.read',app_private.request_time())
 and exists(select 1 from public.user_account u where u.id=app_private.current_actor_user_id() and u.account_kind='INTERNAL' and u.status='ACTIVE'));

do $revoke$ declare table_name text;begin foreach table_name in array array[
 'supplier','supplier_vendor_link','item','supplier_item','purchase_request','purchase_request_version','purchase_request_line','purchase_quotation',
 'purchase_request_project','purchase_request_rnd_program','purchase_resolution','purchase_external_payment_fact','receipt','receipt_line','receipt_overage_discrepancy','purchase_inspection',
 'purchase_approval_preset_version','purchase_approval_tier','purchase_approval_policy_snapshot',
 'rnd_program','project_rnd_program','rnd_budget','rnd_budget_version','rnd_budget_line','rnd_expenditure','rnd_expenditure_project','rnd_expenditure_contract',
 'rnd_expenditure_purchase','rnd_evidence','rnd_evidence_expenditure','rnd_evidence_budget_version','rnd_evidence_deadline','rnd_report_deadline','rnd_alert','approval_subject_purchase_request_version',
 'purchase_request_approval_outcome','purchase_approval_negative_outcome'] loop
 execute format('revoke all on table public.%I from public,youone_request,youone_privileged_writer',table_name);end loop;end $revoke$;
grant select on public.purchase_request,public.purchase_request_version,public.rnd_program,public.approval_subject_purchase_request_version to youone_request;

do $commands$ declare fn record;begin for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in('create_supplier','create_item','link_supplier_vendor','create_purchase_request','create_purchase_request_revision','add_purchase_request_line',
 'add_purchase_quotation','draft_purchase_request','seal_purchase_request','create_purchase_approval_instance','submit_approval_instance',
 'perform_purchase_approval_action','create_purchase_resolution','transition_purchase_resolution','record_external_payment_fact','create_receipt','add_receipt_line',
 'finalize_receipt','request_purchase_inspection','record_purchase_inspection','resolve_purchase_correction','create_rnd_program','link_project_rnd_program',
 'create_rnd_budget','add_rnd_budget_line','seal_rnd_budget','record_rnd_expenditure','add_rnd_budget_evidence','record_rnd_deadline','record_rnd_deadline_evidence',
 'emit_rnd_alert','read_purchase_hq','read_rnd_program_summary') loop
 execute format('revoke all on function %s from public,youone_request,youone_privileged_writer',fn.signature);
 execute format('grant execute on function %s to youone_request',fn.signature);end loop;end $commands$;
revoke all on function app_private.reject_m11_append_only(),app_private.protect_m11_purchase(),app_private.m11_actor_is_hq(timestamptz),
 app_private.m11_assert_internal_mutator(text,timestamptz),app_private.append_m11_transition(uuid,uuid,uuid,text,text,uuid,text,text,text,bigint,bigint,text,timestamptz),
 app_private.append_rnd_fact(uuid,uuid,text,text,uuid,bigint,text,text,timestamptz),app_private.apply_purchase_approval_outcome(),
 app_private.assert_receipt_quantity(),app_private.assert_rnd_expenditure_complete(),app_private.protect_rnd_budget_snapshot(),
 app_private.assert_purchase_policy_selection(uuid,uuid,timestamptz),app_private.assert_exactly_one_rnd_evidence_subject()
from public,youone_request,youone_privileged_writer;

comment on table public.rnd_program is 'OD-030: agreement facts only. No lifecycle state, transition registry, close, reopen, payment, journal, or RCMS command.';
comment on table public.purchase_external_payment_fact is 'External payment readback evidence only; this system does not issue a transfer or accounting journal.';
comment on function public.read_purchase_hq(uuid,timestamptz) is 'Explicit read-only HQ projection; quotation files, internal Approval lines and evidence keys are omitted.';
