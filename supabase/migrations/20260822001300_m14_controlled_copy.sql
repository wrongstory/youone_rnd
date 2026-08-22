-- M14 L3/L4 controlled technical-document copies. There is no Vendor source download or self-print path.

insert into public.permission(id,stable_code,status) values
 ('3e000000-0000-4000-8000-000000000001','technical_document.copy.request','ACTIVE'),
 ('3e000000-0000-4000-8000-000000000002','technical_document.copy.print','ACTIVE'),
 ('3e000000-0000-4000-8000-000000000003','technical_document.copy.custody','ACTIVE'),
 ('3e000000-0000-4000-8000-000000000004','technical_document.copy.return','ACTIVE'),
 ('3e000000-0000-4000-8000-000000000005','technical_document.copy.destroy','ACTIVE')
on conflict(stable_code) do nothing;
insert into public.action_definition(action_id) values
 ('technical_document.copy.request'),('technical_document.copy.render'),('technical_document.copy.print'),('technical_document.copy.custody'),
 ('technical_document.copy.return'),('technical_document.copy.destroy'),('technical_document.copy.overdue')
on conflict do nothing;
insert into public.aggregate_type_definition(aggregate_type) values ('TECHNICAL_DOCUMENT_COPY') on conflict do nothing;
insert into public.domain_event_definition(event_id,payload_schema_id,payload_schema_version) values
 ('EVT-TECHCOPY-REQUEST','TECHCOPY_EVENT_REF',1),('EVT-TECHCOPY-SUBMIT','TECHCOPY_EVENT_REF',1),
 ('EVT-TECHCOPY-APPROVE','TECHCOPY_EVENT_REF',1),('EVT-TECHCOPY-RENDER','TECHCOPY_EVENT_REF',1),
 ('EVT-TECHCOPY-PRINT','TECHCOPY_EVENT_REF',1),('EVT-TECHCOPY-HANDOVER','TECHCOPY_EVENT_REF',1),
 ('EVT-TECHCOPY-RETURN-DUE','TECHCOPY_EVENT_REF',1),('EVT-TECHCOPY-RETURN','TECHCOPY_EVENT_REF',1),
 ('EVT-TECHCOPY-DESTROY','TECHCOPY_EVENT_REF',1),('EVT-TECHCOPY-OVERDUE','TECHCOPY_EVENT_REF',1)
on conflict do nothing;
insert into public.state_machine_definition(machine_id,aggregate_type) values('SM-TECHDOC-COPY-V1','TECHNICAL_DOCUMENT_COPY') on conflict do nothing;
insert into public.state_definition(machine_id,state_id,is_terminal) values
 ('SM-TECHDOC-COPY-V1','REQUESTED',false),('SM-TECHDOC-COPY-V1','APPROVAL_PENDING',false),('SM-TECHDOC-COPY-V1','APPROVED',false),
 ('SM-TECHDOC-COPY-V1','RENDERED',false),('SM-TECHDOC-COPY-V1','PRINTED',false),('SM-TECHDOC-COPY-V1','HANDED_OVER',false),
 ('SM-TECHDOC-COPY-V1','RETURN_DUE',false),('SM-TECHDOC-COPY-V1','RETURNED',false),('SM-TECHDOC-COPY-V1','DESTROYED',true),
 ('SM-TECHDOC-COPY-V1','OVERDUE',false),('SM-TECHDOC-COPY-V1','CANCELLED',true)
on conflict do nothing;
insert into public.transition_definition(machine_id,event_id,from_state,to_state) values
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-REQUEST',null,'REQUESTED'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-SUBMIT','REQUESTED','APPROVAL_PENDING'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-APPROVE','APPROVAL_PENDING','APPROVED'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-RENDER','APPROVED','RENDERED'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-PRINT','RENDERED','PRINTED'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-HANDOVER','PRINTED','HANDED_OVER'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-RETURN-DUE','HANDED_OVER','RETURN_DUE'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-RETURN','HANDED_OVER','RETURNED'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-RETURN','RETURN_DUE','RETURNED'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-RETURN','OVERDUE','RETURNED'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-DESTROY','HANDED_OVER','DESTROYED'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-DESTROY','RETURN_DUE','DESTROYED'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-DESTROY','RETURNED','DESTROYED'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-DESTROY','OVERDUE','DESTROYED'),
 ('SM-TECHDOC-COPY-V1','EVT-TECHCOPY-OVERDUE','RETURN_DUE','OVERDUE')
on conflict do nothing;

create sequence public.technical_copy_number_sequence;
revoke all on sequence public.technical_copy_number_sequence from public,youone_request,youone_privileged_writer;

-- A controlled-copy recipient is the exact VendorUser/account/Vendor tuple. The
-- VendorUser primary key makes this logically unique; the explicit composite
-- key lets PostgreSQL enforce the complete relationship through one FK.
alter table public.vendor_user add constraint vendor_user_m14_exact_recipient_unique unique(id,user_id,vendor_id);

create table public.technical_document_copy (
 id uuid primary key,
 document_version_id uuid not null,
 document_id uuid not null,
 document_version_no bigint not null check(document_version_no>0),
 source_snapshot_checksum text not null check(app_private.is_sha256(source_snapshot_checksum)),
 source_sealed_at timestamptz not null,
 source_attachment_id uuid not null,source_attachment_row_version bigint not null,source_file_checksum text not null check(app_private.is_sha256(source_file_checksum)),
 security_level text not null check(security_level in ('SEC_L3_CONFIDENTIAL','SEC_L4_CORE_SECRET')),
 approval_instance_id uuid references public.approval_instance(id),
 project_id uuid not null references public.project(id),
 contract_id uuid,
 recipient_user_id uuid not null references public.user_account(id),
 recipient_vendor_user_id uuid not null references public.vendor_user(id),
 recipient_vendor_id uuid not null references public.vendor(id),
 recipient_identity_snapshot text not null check(length(recipient_identity_snapshot) between 1 and 500),
 purpose_code text not null check(app_private.is_stable_code(purpose_code)),
 purpose_text text not null check(length(purpose_text) between 1 and 4000),
 purpose_checksum text not null check(app_private.is_sha256(purpose_checksum)),
 request_snapshot_checksum text not null check(app_private.is_sha256(request_snapshot_checksum)),
 request_sealed_at timestamptz not null,
 reprint_of_copy_id uuid unique references public.technical_document_copy(id),
 reprint_reason_code text check(reprint_reason_code is null or app_private.is_stable_code(reprint_reason_code)),
 requested_by_user_id uuid not null references public.user_account(id),
 return_destroy_due_at timestamptz not null,
 copy_no text not null unique,
 output_attachment_id uuid,
 output_attachment_row_version bigint,
 output_checksum text check(output_checksum is null or app_private.is_sha256(output_checksum)),
 watermark_manifest_checksum text check(watermark_manifest_checksum is null or app_private.is_sha256(watermark_manifest_checksum)),
 renderer_id text check(renderer_id is null or app_private.is_stable_code(renderer_id)),
 renderer_version text check(renderer_version is null or app_private.is_stable_code(renderer_version)),
 printed_by_user_id uuid references public.user_account(id),
 printer_device_code text check(printer_device_code is null or app_private.is_stable_code(printer_device_code)),
 page_count integer check(page_count is null or page_count>0),
 printed_at timestamptz,
 handed_over_by_user_id uuid references public.user_account(id),
 handed_over_at timestamptz,
 state text not null check(state in ('REQUESTED','APPROVAL_PENDING','APPROVED','RENDERED','PRINTED','HANDED_OVER','RETURN_DUE','RETURNED','DESTROYED','OVERDUE','CANCELLED')),
 version_no bigint not null check(version_no>0),
 created_at timestamptz not null,
 updated_at timestamptz not null,
 unique(id,document_version_id,approval_instance_id),unique(id,document_version_id,project_id),unique(id,document_version_id,contract_id,project_id),
 unique(id,approval_instance_id,copy_no,document_version_id,document_id,document_version_no,source_snapshot_checksum,source_sealed_at,source_attachment_id,
  source_attachment_row_version,source_file_checksum,purpose_checksum,
  request_snapshot_checksum,request_sealed_at),
 foreign key(document_version_id,document_id,document_version_no,source_snapshot_checksum,source_sealed_at)
 references public.document_version(id,document_id,version_no,sealed_snapshot_checksum,sealed_at),
 foreign key(document_version_id,source_attachment_id) references public.document_attachment(document_version_id,attachment_id),
 foreign key(source_attachment_id,source_attachment_row_version,source_file_checksum) references public.attachment(id,row_version,detected_sha256),
 foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id),
 foreign key(recipient_vendor_user_id,recipient_user_id,recipient_vendor_id) references public.vendor_user(id,user_id,vendor_id),
 foreign key(output_attachment_id,output_attachment_row_version,output_checksum) references public.attachment(id,row_version,detected_sha256),
 check((reprint_of_copy_id is null)=(reprint_reason_code is null)),
 check(num_nonnulls(output_attachment_id,output_attachment_row_version,output_checksum) in (0,3)),
 check((state in ('REQUESTED','APPROVAL_PENDING','APPROVED') and output_attachment_id is null and printed_at is null)
  or (state='RENDERED' and output_attachment_id is not null and printed_at is null)
  or (state in ('PRINTED','HANDED_OVER','RETURN_DUE','RETURNED','DESTROYED','OVERDUE') and copy_no is not null and output_attachment_id is not null
    and printed_by_user_id is not null and printer_device_code is not null and page_count is not null and printed_at is not null)),
 check(handed_over_at is null or handed_over_by_user_id is not null),
 check(state not in ('HANDED_OVER','RETURN_DUE','RETURNED','DESTROYED','OVERDUE') or handed_over_at is not null),
 check(return_destroy_due_at>created_at)
);
create unique index technical_copy_original_approval_unique on public.technical_document_copy(approval_instance_id) where reprint_of_copy_id is null;
create index technical_copy_due_idx on public.technical_document_copy(return_destroy_due_at,state) where state in ('HANDED_OVER','RETURN_DUE','OVERDUE');

create table public.technical_copy_document_project_scope (
 copy_id uuid primary key,document_version_id uuid not null,project_id uuid not null,
 foreign key(copy_id,document_version_id,project_id) references public.technical_document_copy(id,document_version_id,project_id)
);
create table public.technical_copy_document_contract_scope (
 copy_id uuid primary key,document_version_id uuid not null,contract_id uuid not null,project_id uuid not null,
 foreign key(copy_id,document_version_id,contract_id,project_id) references public.technical_document_copy(id,document_version_id,contract_id,project_id),
 foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id)
);

alter table public.approval_subject_binding drop constraint approval_subject_binding_subject_kind_check;
alter table public.approval_subject_binding add constraint approval_subject_binding_subject_kind_check check(subject_kind in
 ('APPROVAL_POLICY_VERSION','DOCUMENT_VERSION','RESEARCH_PROJECT_APPLICATION','CONTRACT_VERSION','ACCEPTANCE_PAYMENT_DECISION',
  'CHANGE_REQUEST_VERSION','CHANGE_ORDER_VERSION','PURCHASE_REQUEST_VERSION','TECHNICAL_DOCUMENT_COPY_REQUEST'));
create table public.approval_subject_technical_copy_request (
 instance_id uuid primary key references public.approval_instance(id),subject_kind text not null default 'TECHNICAL_DOCUMENT_COPY_REQUEST'
  check(subject_kind='TECHNICAL_DOCUMENT_COPY_REQUEST'),copy_id uuid not null,copy_no text not null,document_version_id uuid not null,document_id uuid not null,
 document_version_no bigint not null,source_snapshot_checksum text not null,source_sealed_at timestamptz not null,
 source_attachment_id uuid not null,source_attachment_row_version bigint not null,source_file_checksum text not null,
 recipient_user_id uuid not null,recipient_vendor_user_id uuid not null,recipient_vendor_id uuid not null,recipient_identity_snapshot text not null,purpose_code text not null,purpose_checksum text not null,
 return_destroy_due_at timestamptz not null,subject_version_no bigint not null default 1 check(subject_version_no=1),
 subject_checksum text not null check(app_private.is_sha256(subject_checksum)),subject_sealed_at timestamptz not null,
 unique(copy_id,instance_id),foreign key(instance_id,subject_kind) references public.approval_subject_binding(instance_id,subject_kind) deferrable initially deferred,
 foreign key(copy_id,instance_id,copy_no,document_version_id,document_id,document_version_no,source_snapshot_checksum,source_sealed_at,source_attachment_id,
  source_attachment_row_version,source_file_checksum,purpose_checksum,
  subject_checksum,subject_sealed_at) references public.technical_document_copy(id,approval_instance_id,copy_no,document_version_id,document_id,document_version_no,
  source_snapshot_checksum,source_sealed_at,source_attachment_id,source_attachment_row_version,source_file_checksum,purpose_checksum,request_snapshot_checksum,request_sealed_at),
 check(length(recipient_identity_snapshot) between 1 and 500)
);
create trigger approval_technical_copy_subject_bind before insert on public.approval_subject_technical_copy_request for each row execute function app_private.bind_approval_subject();

create table public.technical_copy_custody_event (
 id uuid primary key,copy_id uuid not null references public.technical_document_copy(id),sequence_no integer not null check(sequence_no>0),
 event_id text not null check(app_private.is_stable_code(event_id)),payload_schema_id text not null default 'TECHCOPY_EVENT_REF',payload_schema_version bigint not null default 1,
 from_state text,to_state text not null,
 actor_kind text not null check(actor_kind in ('USER','SYSTEM')),actor_user_id uuid references public.user_account(id),system_actor_id text,
 evidence_attachment_id uuid,evidence_attachment_row_version bigint,evidence_attachment_checksum text check(evidence_attachment_checksum is null or app_private.is_sha256(evidence_attachment_checksum)),
 reconciled_page_count integer check(reconciled_page_count is null or reconciled_page_count>=0),reason_code text not null check(app_private.is_stable_code(reason_code)),
 occurred_at timestamptz not null,unique(copy_id,sequence_no),unique(copy_id,event_id,sequence_no),
 foreign key(event_id,payload_schema_id,payload_schema_version) references public.domain_event_definition(event_id,payload_schema_id,payload_schema_version),
 foreign key(evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum) references public.attachment(id,row_version,detected_sha256),
 check(num_nonnulls(evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum) in (0,3)),
 check((actor_kind='USER' and actor_user_id is not null and system_actor_id is null) or (actor_kind='SYSTEM' and actor_user_id is null and system_actor_id is not null))
);
create table public.technical_copy_vendor_projection_allowlist (
 id uuid primary key,copy_id uuid not null unique references public.technical_document_copy(id),vendor_user_id uuid not null references public.vendor_user(id),
 project_id uuid not null references public.project(id),contract_id uuid,valid_from timestamptz not null,valid_until timestamptz not null,
 granted_by_user_id uuid not null references public.user_account(id),reason_code text not null check(app_private.is_stable_code(reason_code)),
 foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id),check(valid_until>valid_from)
);
create table public.technical_copy_overdue_alert (
 id uuid primary key,copy_id uuid not null references public.technical_document_copy(id),idempotency_key text not null unique check(app_private.is_opaque_key(idempotency_key)),
 detected_at timestamptz not null
);

create or replace function app_private.m14_reject_append_only() returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'controlled-copy custody/evidence is append-only' using errcode='55000';end $$;
create trigger approval_technical_copy_subject_immutable before update or delete on public.approval_subject_technical_copy_request for each row execute function app_private.m14_reject_append_only();
create or replace function app_private.m14_guard_subject() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$ begin
 if not exists(select 1 from public.technical_document_copy c where c.id=new.copy_id and c.approval_instance_id=new.instance_id and c.copy_no=new.copy_no
  and c.document_version_id=new.document_version_id and c.document_id=new.document_id and c.document_version_no=new.document_version_no
  and c.source_snapshot_checksum=new.source_snapshot_checksum and c.source_sealed_at=new.source_sealed_at and c.source_attachment_id=new.source_attachment_id
  and c.source_attachment_row_version=new.source_attachment_row_version and c.source_file_checksum=new.source_file_checksum
  and c.recipient_user_id is not distinct from new.recipient_user_id and c.recipient_vendor_user_id is not distinct from new.recipient_vendor_user_id
  and c.recipient_vendor_id is not distinct from new.recipient_vendor_id and c.recipient_identity_snapshot=new.recipient_identity_snapshot
  and c.purpose_code=new.purpose_code and c.purpose_checksum=new.purpose_checksum
  and c.return_destroy_due_at=new.return_destroy_due_at and c.request_snapshot_checksum=new.subject_checksum and c.request_sealed_at=new.subject_sealed_at) then
  raise exception 'exact sealed controlled-copy request subject mismatch' using errcode='23514';end if;return new;end $$;
create trigger approval_technical_copy_subject_exact before insert on public.approval_subject_technical_copy_request for each row execute function app_private.m14_guard_subject();
create or replace function app_private.assert_exactly_one_approval_subject() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare target_instance uuid:=coalesce(new.instance_id,old.instance_id);link_count integer;begin select
 (select count(*) from public.approval_subject_policy_version p where p.instance_id=target_instance)
 +(select count(*) from public.approval_subject_document_version d where d.instance_id=target_instance)
 +(select count(*) from public.approval_subject_research_project_application r where r.instance_id=target_instance)
 +(select count(*) from public.approval_subject_contract_version c where c.instance_id=target_instance)
 +(select count(*) from public.approval_subject_acceptance_payment_decision a where a.instance_id=target_instance)
 +(select count(*) from public.approval_subject_change_request_version e where e.instance_id=target_instance)
 +(select count(*) from public.approval_subject_change_order_version o where o.instance_id=target_instance)
 +(select count(*) from public.approval_subject_purchase_request_version p where p.instance_id=target_instance)
 +(select count(*) from public.approval_subject_technical_copy_request t where t.instance_id=target_instance) into link_count;
 if link_count<>1 then raise exception 'approval instance requires exactly one typed subject link' using errcode='23514';end if;return coalesce(new,old);end $$;
create or replace function app_private.approval_subject_snapshot(target_instance_id uuid)
returns table(subject_kind text,subject_version_id uuid,subject_version_no bigint,subject_checksum text,subject_state text)
language sql stable security definer set search_path=pg_catalog,public as $$
 select 'APPROVAL_POLICY_VERSION',l.subject_policy_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_policy_version l join public.approval_policy_version v on v.id=l.subject_policy_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.checksum=l.subject_checksum
 union all select 'DOCUMENT_VERSION',l.document_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_document_version l join public.document_version v on v.id=l.document_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum
 union all select 'RESEARCH_PROJECT_APPLICATION',l.application_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_research_project_application l join public.research_project_application_version v on v.id=l.application_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum
 union all select 'CONTRACT_VERSION',l.contract_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_contract_version l join public.contract_version v on v.id=l.contract_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum
 union all select 'ACCEPTANCE_PAYMENT_DECISION',l.acceptance_payment_decision_id,l.subject_version_no,l.subject_checksum,d.state from public.approval_subject_acceptance_payment_decision l join public.acceptance_payment_decision d on d.id=l.acceptance_payment_decision_id where l.instance_id=target_instance_id and d.version_no=l.subject_version_no and d.sealed_snapshot_checksum=l.subject_checksum
 union all select 'CHANGE_REQUEST_VERSION',l.change_request_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_change_request_version l join public.change_request_version v on v.id=l.change_request_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.snapshot_checksum=l.subject_checksum
 union all select 'CHANGE_ORDER_VERSION',l.change_order_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_change_order_version l join public.change_order_version v on v.id=l.change_order_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.snapshot_checksum=l.subject_checksum
 union all select 'PURCHASE_REQUEST_VERSION',l.purchase_request_version_id,l.subject_version_no,l.subject_checksum,v.state from public.approval_subject_purchase_request_version l join public.purchase_request_version v on v.id=l.purchase_request_version_id where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum and v.sealed_at=l.subject_sealed_at
 union all select 'TECHNICAL_DOCUMENT_COPY_REQUEST',l.copy_id,l.subject_version_no,l.subject_checksum,'SEALED' from public.approval_subject_technical_copy_request l join public.technical_document_copy c on c.id=l.copy_id and c.request_snapshot_checksum=l.subject_checksum and c.request_sealed_at=l.subject_sealed_at where l.instance_id=target_instance_id
$$;
create trigger technical_copy_custody_immutable before update or delete on public.technical_copy_custody_event for each row execute function app_private.m14_reject_append_only();
create trigger technical_copy_project_scope_immutable before update or delete on public.technical_copy_document_project_scope for each row execute function app_private.m14_reject_append_only();
create trigger technical_copy_contract_scope_immutable before update or delete on public.technical_copy_document_contract_scope for each row execute function app_private.m14_reject_append_only();
create trigger technical_copy_projection_allowlist_immutable before update or delete on public.technical_copy_vendor_projection_allowlist for each row execute function app_private.m14_reject_append_only();
create trigger technical_copy_alert_immutable before update or delete on public.technical_copy_overdue_alert for each row execute function app_private.m14_reject_append_only();
create or replace function app_private.m14_guard_copy() returns trigger language plpgsql set search_path=pg_catalog,app_private as $$ begin
 if tg_op='DELETE' then raise exception 'controlled-copy record is retained' using errcode='55000';end if;
 if app_private.optional_setting('app.m14_command') is distinct from old.id::text then raise exception 'controlled-copy update requires trusted command' using errcode='42501';end if;
 if old.approval_instance_id is not null and new.approval_instance_id is distinct from old.approval_instance_id then raise exception 'controlled-copy Approval binding is immutable' using errcode='55000';end if;
 if old.approval_instance_id is null and new.approval_instance_id is not null and old.state<>'REQUESTED' then raise exception 'Approval binds only to requested copy' using errcode='55000';end if;
 if (new.copy_no,new.document_version_id,new.document_id,new.document_version_no,new.source_snapshot_checksum,new.source_sealed_at,new.source_attachment_id,
  new.source_attachment_row_version,new.source_file_checksum,new.security_level,
  new.project_id,new.contract_id,new.recipient_user_id,new.recipient_vendor_user_id,new.recipient_vendor_id,new.recipient_identity_snapshot,new.purpose_code,
  new.purpose_text,new.purpose_checksum,new.request_snapshot_checksum,new.request_sealed_at,new.reprint_of_copy_id,new.reprint_reason_code,new.requested_by_user_id,new.return_destroy_due_at,new.created_at)
  is distinct from (old.copy_no,old.document_version_id,old.document_id,old.document_version_no,old.source_snapshot_checksum,old.source_sealed_at,old.source_attachment_id,
  old.source_attachment_row_version,old.source_file_checksum,old.security_level,
  old.project_id,old.contract_id,old.recipient_user_id,old.recipient_vendor_user_id,old.recipient_vendor_id,old.recipient_identity_snapshot,old.purpose_code,
  old.purpose_text,old.purpose_checksum,old.request_snapshot_checksum,old.request_sealed_at,old.reprint_of_copy_id,old.reprint_reason_code,old.requested_by_user_id,old.return_destroy_due_at,old.created_at) then
  raise exception 'controlled-copy request snapshot is immutable' using errcode='55000';end if;return new;end $$;
create trigger technical_copy_guard before update or delete on public.technical_document_copy for each row execute function app_private.m14_guard_copy();

create or replace function app_private.m14_is_admin(target_user uuid,target_time timestamptz) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.user_role_assignment a join public.role r on r.id=a.role_id and r.stable_code in ('ADMIN_SYSTEM','ADMIN_SECURITY') and r.status='ACTIVE'
  where a.user_id=target_user and a.revoked_at is null and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time)) $$;
create or replace function app_private.m14_assert_internal(target_permission text,target_project uuid,target_time timestamptz) returns void
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$ begin perform app_private.m08_assert_direct_internal(target_time,target_permission);
 if app_private.m14_is_admin(app_private.current_effective_actor_user_id(),target_time) or not app_private.actor_has_project_internal_scope(target_project,target_time) then
  raise exception 'scoped non-admin internal controlled-copy actor required' using errcode='42501';end if;end $$;
create or replace function app_private.m14_policy_matrix_valid(target_policy uuid,target_level text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$ select case when target_level='SEC_L3_CONFIDENTIAL' then
 (select count(*)=1 from public.approval_policy_step_rule s where s.policy_version_id=target_policy)
 and exists(select 1 from public.approval_policy_step_rule s where s.policy_version_id=target_policy and s.sequence_no=1 and s.step_role='APPROVAL'
  and s.completion_mode='SEQUENTIAL' and s.required and (select count(*) from public.approval_policy_participant_rule r where r.step_rule_id=s.id)=1
  and not exists(select 1 from public.approval_policy_participant_rule r left join public.position p on p.id=r.position_id where r.step_rule_id=s.id
   and (r.selector_kind<>'POSITION' or p.stable_code<>'POSITION_LAB_DIRECTOR' or not r.required_for_completion)))
 when target_level='SEC_L4_CORE_SECRET' then
 (select count(*)=2 from public.approval_policy_step_rule s where s.policy_version_id=target_policy)
 and exists(select 1 from public.approval_policy_step_rule s where s.policy_version_id=target_policy and s.sequence_no=1 and s.step_role='APPROVAL'
  and s.completion_mode='SEQUENTIAL' and s.required and (select count(*) from public.approval_policy_participant_rule r where r.step_rule_id=s.id)=1
  and not exists(select 1 from public.approval_policy_participant_rule r left join public.position p on p.id=r.position_id where r.step_rule_id=s.id
   and (r.selector_kind<>'POSITION' or p.stable_code<>'POSITION_LAB_DIRECTOR' or not r.required_for_completion)))
 and exists(select 1 from public.approval_policy_step_rule s where s.policy_version_id=target_policy and s.sequence_no=2 and s.step_role='APPROVAL'
  and s.completion_mode='ANY_ONE' and s.required and (select count(*) from public.approval_policy_participant_rule r where r.step_rule_id=s.id)=1
  and not exists(select 1 from public.approval_policy_participant_rule r left join public.position p on p.id=r.position_id where r.step_rule_id=s.id
   and (r.selector_kind<>'POSITION' or p.stable_code<>'POSITION_REPRESENTATIVE' or not r.required_for_completion))) else false end $$;
create or replace function app_private.m14_approval_valid(target_instance uuid,target_version uuid,target_level text) returns boolean
language sql stable security definer set search_path=pg_catalog,public,app_private as $$ select exists(
 select 1 from public.approval_instance i join public.approval_subject_technical_copy_request l on l.instance_id=i.id
 join public.technical_document_copy c on c.id=l.copy_id and c.approval_instance_id=i.id and c.document_version_id=l.document_version_id
  and c.request_snapshot_checksum=l.subject_checksum and c.request_sealed_at=l.subject_sealed_at
 join public.document_version v on v.id=l.document_version_id and v.document_id=l.document_id and v.version_no=l.document_version_no
  and v.sealed_snapshot_checksum=l.source_snapshot_checksum and v.sealed_at=l.source_sealed_at
 where i.id=target_instance and i.state='COMPLETED' and l.document_version_id=target_version and v.state='APPROVED'
  and app_private.m14_policy_matrix_valid(i.policy_version_id,target_level))
 and ((target_level='SEC_L3_CONFIDENTIAL' and (select count(*) from public.approval_step s where s.instance_id=target_instance)=1
  and exists(select 1 from public.approval_step s join public.approval_participant ap on ap.step_id=s.id
   join public.position p on p.id=ap.position_id_snapshot left join public.approval_action a on a.participant_id=ap.id and a.event_id='APPROVE'
   where s.instance_id=target_instance and s.sequence_no=1 and s.step_role='APPROVAL' and s.completion_mode='SEQUENTIAL' and s.required
   group by s.id having count(distinct ap.id)=1 and count(distinct a.id)=1 and bool_and(p.stable_code='POSITION_LAB_DIRECTOR')))
 or (target_level='SEC_L4_CORE_SECRET' and (select count(*) from public.approval_step s where s.instance_id=target_instance)=2
  and exists(select 1 from public.approval_step s join public.approval_participant ap on ap.step_id=s.id join public.position p on p.id=ap.position_id_snapshot
   left join public.approval_action a on a.participant_id=ap.id and a.event_id='APPROVE' where s.instance_id=target_instance and s.sequence_no=1
    and s.step_role='APPROVAL' and s.completion_mode='SEQUENTIAL' and s.required group by s.id
   having count(distinct ap.id)=1 and count(distinct a.id)=1 and bool_and(p.stable_code='POSITION_LAB_DIRECTOR'))
  and exists(select 1 from public.approval_step s join public.approval_participant ap on ap.step_id=s.id join public.position p on p.id=ap.position_id_snapshot
   left join public.approval_action a on a.participant_id=ap.id and a.event_id='APPROVE' where s.instance_id=target_instance and s.sequence_no=2
    and s.step_role='APPROVAL' and s.completion_mode='ANY_ONE' and s.required group by s.id
   having count(distinct ap.id)=2 and count(distinct a.id)=1 and bool_and(p.stable_code='POSITION_REPRESENTATIVE')))) $$;
create or replace function app_private.m14_recipient_vendor_scope_valid(target_vendor_user uuid,target_project uuid,target_contract uuid,target_time timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select exists(
 select 1 from public.vendor_user vu join public.vendor v on v.id=vu.vendor_id and v.status='ACTIVE'
 join public.user_account u on u.id=vu.user_id and u.account_kind='VENDOR' and u.status='ACTIVE'
 where vu.id=target_vendor_user and vu.status='ACTIVE' and vu.revoked_at is null and vu.valid_from<=target_time and (vu.valid_until is null or vu.valid_until>target_time)
  and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time))
 and exists(select 1 from public.project_vendor_grant g join public.project_vendor_grant_action ga on ga.grant_id=g.id
  join public.permission p on p.id=ga.permission_id and p.stable_code='technical_document.copy.custody' and p.status='ACTIVE'
  where g.vendor_user_id=target_vendor_user and g.project_id=target_project and g.status='ACTIVE' and g.revoked_at is null and g.valid_from<=target_time
   and (g.valid_until is null or g.valid_until>target_time))
 and (target_contract is null or exists(select 1 from public.contract_vendor_grant g join public.contract_vendor_grant_action ga on ga.grant_id=g.id
  join public.permission p on p.id=ga.permission_id and p.stable_code='technical_document.copy.custody' and p.status='ACTIVE'
  where g.vendor_user_id=target_vendor_user and g.project_id=target_project and g.contract_id=target_contract and g.status='ACTIVE' and g.revoked_at is null
   and g.valid_from<=target_time and (g.valid_until is null or g.valid_until>target_time))) $$;
create or replace function app_private.m14_append(target_custody uuid,target_audit uuid,target_transition uuid,target_outbox uuid,target_action text,target_copy uuid,
 target_event text,target_from text,target_to text,target_from_version bigint,target_to_version bigint,target_reason text,target_evidence uuid,
 target_reconciled_pages integer,target_time timestamptz) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 seq integer;a public.attachment%rowtype;kind text:=app_private.required_setting('app.actor_kind');begin
 if target_evidence is not null then select * into strict a from public.attachment where id=target_evidence and state='AVAILABLE';end if;
 select coalesce(max(sequence_no),0)+1 into seq from public.technical_copy_custody_event where copy_id=target_copy;
 insert into public.technical_copy_custody_event(id,copy_id,sequence_no,event_id,from_state,to_state,actor_kind,actor_user_id,system_actor_id,
  evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum,reconciled_page_count,reason_code,occurred_at)
 values(target_custody,target_copy,seq,target_event,target_from,target_to,kind,case when kind='USER' then app_private.current_effective_actor_user_id() end,
  case when kind='SYSTEM' then app_private.required_setting('app.system_actor_id') end,a.id,a.row_version,a.detected_sha256,target_reconciled_pages,target_reason,target_time);
 perform app_private.append_audit(target_audit,target_action,'TECHNICAL_DOCUMENT_COPY',target_copy,target_to_version,'SUCCEEDED',target_reason,target_evidence,null,null,null,target_time);
 perform app_private.append_state_transition(target_transition,target_audit,'TECHNICAL_DOCUMENT_COPY',target_copy,'SM-TECHDOC-COPY-V1',target_event,target_from,target_to,
  target_from_version,target_to_version,target_reason,target_evidence,app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_time);
 perform app_private.enqueue_outbox(target_outbox,target_audit,target_event,'TECHNICAL_DOCUMENT_COPY',target_copy,target_to_version,
  app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),'TECHCOPY_EVENT_REF',1,
  jsonb_build_object('copyId',target_copy,'resourceVersion',target_to_version,'eventId',target_event),target_event||':'||target_copy::text||':'||target_to_version::text,target_time,target_time);end $$;

create or replace function public.request_technical_document_copy(target_copy uuid,target_version uuid,target_source_attachment uuid,target_project uuid,target_contract uuid,
 target_recipient_user uuid,target_recipient_vendor_user uuid,target_recipient_identity text,target_purpose_code text,target_purpose text,target_due timestamptz,
 target_reprint uuid,target_reprint_reason text,target_custody uuid,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare v public.document_version%rowtype;d public.document%rowtype;
 vu public.vendor_user%rowtype;p public.technical_document_copy%rowtype;a public.attachment%rowtype;purpose_hash text;request_hash text;number text;begin
 perform app_private.m14_assert_internal('technical_document.copy.request',target_project,target_time);select * into strict v from public.document_version where id=target_version for share;
 select * into strict d from public.document where id=v.document_id;if v.state<>'APPROVED' or v.sealed_snapshot_checksum is null
  or v.security_level_snapshot not in ('SEC_L3_CONFIDENTIAL','SEC_L4_CORE_SECRET') then raise exception 'exact approved L3/L4 DocumentVersion required' using errcode='23514';end if;
 select at.* into strict a from public.document_attachment da join public.attachment at on at.id=da.attachment_id where da.document_version_id=v.id
  and da.attachment_id=target_source_attachment and da.link_state='ACTIVE' and at.state='AVAILABLE' and at.security_level=v.security_level_snapshot;
 select * into strict vu from public.vendor_user where id=target_recipient_vendor_user and user_id=target_recipient_user and status='ACTIVE' and revoked_at is null
  and valid_from<=target_time and (valid_until is null or valid_until>target_time);
 if target_contract is not null and not exists(select 1 from public.vendor_contract c join public.contract_project cp on cp.contract_id=c.id and cp.project_id=target_project
   where c.id=target_contract and c.vendor_id=vu.vendor_id) then raise exception 'exact recipient Vendor Contract/Project required' using errcode='23514';end if;
 if not app_private.m14_recipient_vendor_scope_valid(vu.id,target_project,target_contract,target_time) then raise exception 'active recipient Vendor Project/Contract grants required' using errcode='23514';end if;
 if target_reprint is not null then select * into strict p from public.technical_document_copy where id=target_reprint for share;
  if target_reprint_reason is null or p.copy_no is null or p.state not in ('RENDERED','PRINTED','HANDED_OVER','RETURN_DUE','RETURNED','DESTROYED','OVERDUE')
   or (p.document_version_id,p.project_id,p.contract_id,p.recipient_user_id,p.recipient_vendor_user_id,p.recipient_identity_snapshot,p.purpose_code,p.purpose_text)
   is distinct from (v.id,target_project,target_contract,target_recipient_user,target_recipient_vendor_user,target_recipient_identity,target_purpose_code,target_purpose) then raise exception 'reprint exact predecessor and reason required' using errcode='23514';end if;end if;
 number:='TC-'||to_char(target_time at time zone 'UTC','YYYY')||'-'||lpad(nextval('public.technical_copy_number_sequence')::text,8,'0');
 purpose_hash:=app_private.canonical_json_sha256(jsonb_build_object('purposeCode',target_purpose_code,'purposeText',target_purpose));
 request_hash:=app_private.canonical_json_sha256(jsonb_build_object('copyNo',number,'documentVersionId',v.id,'documentVersionNo',v.version_no,
  'documentSnapshotChecksum',v.sealed_snapshot_checksum,'sourceAttachmentId',a.id,'sourceAttachmentVersion',a.row_version,'sourceFileChecksum',a.detected_sha256,
  'securityLevel',v.security_level_snapshot,'projectId',target_project,'contractId',target_contract,'recipientUserId',target_recipient_user,
  'recipientVendorUserId',target_recipient_vendor_user,'recipientVendorId',vu.vendor_id,'recipientIdentity',target_recipient_identity,
  'purposeChecksum',purpose_hash,'returnDestroyDueAt',target_due,'reprintOfCopyId',target_reprint,'reprintReasonCode',target_reprint_reason));
 insert into public.technical_document_copy(id,document_version_id,document_id,document_version_no,source_snapshot_checksum,source_sealed_at,source_attachment_id,
  source_attachment_row_version,source_file_checksum,security_level,
  approval_instance_id,project_id,contract_id,recipient_user_id,recipient_vendor_user_id,recipient_vendor_id,recipient_identity_snapshot,purpose_code,purpose_text,
  purpose_checksum,request_snapshot_checksum,request_sealed_at,reprint_of_copy_id,reprint_reason_code,requested_by_user_id,return_destroy_due_at,copy_no,state,version_no,created_at,updated_at)
 values(target_copy,v.id,v.document_id,v.version_no,v.sealed_snapshot_checksum,v.sealed_at,a.id,a.row_version,a.detected_sha256,v.security_level_snapshot,null,target_project,target_contract,
  target_recipient_user,target_recipient_vendor_user,vu.vendor_id,target_recipient_identity,target_purpose_code,target_purpose,purpose_hash,request_hash,target_time,
  target_reprint,target_reprint_reason,app_private.current_effective_actor_user_id(),target_due,number,'REQUESTED',1,target_time,target_time);
 insert into public.technical_copy_document_project_scope(copy_id,document_version_id,project_id) values(target_copy,v.id,target_project);
 if target_contract is not null then insert into public.technical_copy_document_contract_scope(copy_id,document_version_id,contract_id,project_id)
  values(target_copy,v.id,target_contract,target_project);end if;
 perform app_private.m14_append(target_custody,target_audit,target_transition,target_outbox,'technical_document.copy.request',target_copy,'EVT-TECHCOPY-REQUEST',null,
  'REQUESTED',0,1,coalesce(target_reprint_reason,target_purpose_code),a.id,null,target_time);return target_copy;end $$;
create or replace function public.create_technical_copy_approval_instance(target_copy uuid,target_instance uuid,target_policy_version uuid,target_policy_checksum text,
 target_prior_instance uuid,target_generation integer,target_action uuid,target_audit uuid,target_transition uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare c public.technical_document_copy%rowtype;pv public.approval_policy_version%rowtype;begin
 select * into strict c from public.technical_document_copy where id=target_copy for update;perform app_private.m14_assert_internal('technical_document.copy.request',c.project_id,target_time);
 if c.state<>'REQUESTED' or c.approval_instance_id is not null or c.requested_by_user_id<>app_private.current_effective_actor_user_id() then raise exception 'unbound request owner required' using errcode='42501';end if;
 select * into strict pv from public.approval_policy_version where id=target_policy_version and checksum=target_policy_checksum and state='PUBLISHED'
  and subject_kind='TECHNICAL_DOCUMENT_COPY_REQUEST' and valid_from<=target_time and (valid_until is null or valid_until>target_time);
 if (c.reprint_of_copy_id is null and (target_prior_instance is not null or target_generation<>1))
  or (c.reprint_of_copy_id is not null and not exists(select 1 from public.technical_document_copy prior_copy join public.approval_instance prior_instance
   on prior_instance.id=prior_copy.approval_instance_id where prior_copy.id=c.reprint_of_copy_id and prior_instance.id=target_prior_instance
    and prior_instance.state='COMPLETED' and target_generation=prior_instance.generation+1)) then
  raise exception 'exact reprint Approval generation lineage required' using errcode='23514';end if;
 if not app_private.m14_policy_matrix_valid(pv.id,c.security_level) then
  raise exception 'L3 Director or L4 Director plus Representative policy required' using errcode='23514';end if;
 insert into public.approval_instance(id,policy_version_id,policy_version_no,policy_checksum_snapshot,submitter_user_id,prior_instance_id,generation,state,version_no,created_at)
 values(target_instance,pv.id,pv.version_no,pv.checksum,app_private.current_effective_actor_user_id(),target_prior_instance,target_generation,'DRAFT',1,target_time);
 perform set_config('app.m14_command',c.id::text,true);update public.technical_document_copy set approval_instance_id=target_instance,updated_at=target_time where id=c.id;
 insert into public.approval_subject_technical_copy_request(instance_id,copy_id,copy_no,document_version_id,document_id,document_version_no,source_snapshot_checksum,
  source_sealed_at,source_attachment_id,source_attachment_row_version,source_file_checksum,recipient_user_id,recipient_vendor_user_id,recipient_vendor_id,recipient_identity_snapshot,purpose_code,
  purpose_checksum,return_destroy_due_at,subject_checksum,subject_sealed_at)
 values(target_instance,c.id,c.copy_no,c.document_version_id,c.document_id,c.document_version_no,c.source_snapshot_checksum,c.source_sealed_at,c.source_attachment_id,
  c.source_attachment_row_version,c.source_file_checksum,c.recipient_user_id,c.recipient_vendor_user_id,c.recipient_vendor_id,c.recipient_identity_snapshot,c.purpose_code,c.purpose_checksum,
  c.return_destroy_due_at,c.request_snapshot_checksum,c.request_sealed_at);
 perform app_private.append_approval_audit_transition(target_audit,target_transition,'approval.instance.create',target_instance,1,'EVT-APPROVAL-CREATE',null,'DRAFT',null,target_time);
 insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,occurred_at)
 values(target_action,target_instance,target_audit,'CREATE','USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),target_time);
 return target_instance;end $$;
create or replace function public.submit_technical_document_copy(target_copy uuid,target_expected bigint,target_approval_action uuid,target_approval_audit uuid,
 target_approval_transition uuid,target_approval_outbox uuid,target_custody uuid,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions as $$ declare c public.technical_document_copy%rowtype;
 i public.approval_instance%rowtype;nv bigint;approval_nv bigint;line_hash text;begin
 select * into strict c from public.technical_document_copy where id=target_copy for update;perform app_private.m14_assert_internal('technical_document.copy.request',c.project_id,target_time);
 select * into strict i from public.approval_instance where id=c.approval_instance_id for update;
 if c.requested_by_user_id<>app_private.current_effective_actor_user_id() or c.state<>'REQUESTED' or i.state<>'DRAFT' or i.submitter_user_id<>c.requested_by_user_id
  or not exists(select 1 from public.approval_subject_technical_copy_request l where l.instance_id=i.id and l.copy_id=c.id
   and l.subject_checksum=c.request_snapshot_checksum and l.subject_sealed_at=c.request_sealed_at) then raise exception 'request owner and exact sealed copy Approval required' using errcode='42501';end if;
 insert into public.approval_step(id,instance_id,policy_step_rule_id,step_key,sequence_no,step_role,completion_mode,required,state,version_no)
  select extensions.gen_random_uuid(),i.id,r.id,r.step_key,r.sequence_no,r.step_role,r.completion_mode,r.required,'WAITING',0
  from public.approval_policy_step_rule r where r.policy_version_id=i.policy_version_id order by r.sequence_no,r.step_key;
 insert into public.approval_participant(id,step_id,policy_participant_rule_id,participant_user_id,position_id_snapshot,assignment_evidence_id,
  participant_order,required_for_completion,state,version_no)
  select extensions.gen_random_uuid(),s.id,r.id,pa.user_id,pa.position_id,pa.id,r.participant_order,r.required_for_completion,'WAITING',0
  from public.approval_step s join public.approval_policy_participant_rule r on r.step_rule_id=s.policy_step_rule_id and r.selector_kind='POSITION'
  join public.user_position_assignment pa on pa.position_id=r.position_id and pa.is_primary and pa.revoked_at is null and pa.valid_from<=target_time
   and (pa.valid_until is null or pa.valid_until>target_time)
  join public.user_account u on u.id=pa.user_id and u.account_kind='INTERNAL' and u.status='ACTIVE' and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time)
 where s.instance_id=i.id;
 if exists(select 1 from public.approval_step s where s.instance_id=i.id and (not s.required or s.step_role<>'APPROVAL'
  or not exists(select 1 from public.approval_participant p where p.step_id=s.id))) then raise exception 'exact official copy approval line resolution failed' using errcode='23514';end if;
 if (c.security_level='SEC_L3_CONFIDENTIAL' and ((select count(*) from public.approval_step s where s.instance_id=i.id)<>1
   or (select count(*) from public.approval_step s join public.approval_participant p on p.step_id=s.id join public.position pos on pos.id=p.position_id_snapshot
       where s.instance_id=i.id and s.sequence_no=1 and s.completion_mode='SEQUENTIAL' and pos.stable_code='POSITION_LAB_DIRECTOR')<>1))
  or (c.security_level='SEC_L4_CORE_SECRET' and ((select count(*) from public.approval_step s where s.instance_id=i.id)<>2
   or (select count(*) from public.approval_step s join public.approval_participant p on p.step_id=s.id join public.position pos on pos.id=p.position_id_snapshot
       where s.instance_id=i.id and s.sequence_no=1 and s.completion_mode='SEQUENTIAL' and pos.stable_code='POSITION_LAB_DIRECTOR')<>1
   or (select count(*) from public.approval_step s join public.approval_participant p on p.step_id=s.id join public.position pos on pos.id=p.position_id_snapshot
       where s.instance_id=i.id and s.sequence_no=2 and s.completion_mode='ANY_ONE' and pos.stable_code='POSITION_REPRESENTATIVE')<>2)) then
  raise exception 'exact resolved L3/L4 official participant cardinality required' using errcode='23514';end if;
 select encode(extensions.digest(convert_to(string_agg(concat_ws(':',s.sequence_no,s.step_key,s.step_role,s.completion_mode,s.required,
  p.participant_user_id,p.position_id_snapshot,p.assignment_evidence_id,p.participant_order,p.required_for_completion),'|' order by s.sequence_no,s.step_key,p.participant_order),'UTF8'),'sha256'),'hex')
  into strict line_hash from public.approval_step s join public.approval_participant p on p.step_id=s.id where s.instance_id=i.id;
 approval_nv:=app_private.next_version(i.version_no,1);update public.approval_instance set state='SUBMITTED',line_checksum=line_hash,version_no=approval_nv,submitted_at=target_time where id=i.id;
 perform app_private.append_approval_audit_transition(target_approval_audit,target_approval_transition,'approval.instance.submit',i.id,approval_nv,
  'EVT-APPROVAL-SUBMIT','DRAFT','SUBMITTED',null,target_time);
 insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,occurred_at)
 values(target_approval_action,i.id,target_approval_audit,'SUBMIT','USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),target_time);
 perform app_private.enqueue_approval_event(target_approval_outbox,target_approval_audit,'EVT-APPROVAL-SUBMITTED',i.id,approval_nv,'SUBMITTED',target_time);
 nv:=app_private.next_version(c.version_no,target_expected);perform set_config('app.m14_command',c.id::text,true);update public.technical_document_copy set state='APPROVAL_PENDING',version_no=nv,updated_at=target_time where id=c.id;
 perform app_private.m14_append(target_custody,target_audit,target_transition,target_outbox,'technical_document.copy.request',c.id,'EVT-TECHCOPY-SUBMIT','REQUESTED','APPROVAL_PENDING',c.version_no,nv,'CONTROLLED-COPY-SUBMITTED',null,null,target_time);return nv;end $$;
create or replace function public.perform_technical_copy_approval_action(target_instance uuid,target_step uuid,target_participant uuid,target_event text,
 target_expected_instance bigint,target_expected_step bigint,target_expected_participant bigint,target_action uuid,target_audit uuid,target_transition uuid,
 target_outbox uuid,target_reason text,target_opinion text,target_time timestamptz) returns bigint
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare i public.approval_instance%rowtype;s public.approval_step%rowtype;
 p public.approval_participant%rowtype;permission_code text;next_version bigint;complete boolean;next_sequence integer;instance_state text:='IN_PROGRESS';
 transition_event text:='EVT-APPROVAL-APPROVE';outbox_event text:='EVT-APPROVAL-APPROVED';begin
 if target_event not in ('APPROVE','REJECT') then raise exception 'controlled-copy route permits only official approve or reject' using errcode='22023';end if;
 permission_code:=case when target_event='APPROVE' then 'approval.step.approve' else 'approval.step.reject' end;
 perform app_private.assert_approval_request(target_time,permission_code);
 if target_event='REJECT' and target_reason is null then raise exception 'rejection reason required' using errcode='23514';end if;
 select * into strict i from public.approval_instance where id=target_instance for update;
 if not exists(select 1 from public.approval_subject_technical_copy_request l where l.instance_id=i.id) then raise exception 'exact controlled-copy request subject required' using errcode='23514';end if;
 select * into strict s from public.approval_step where id=target_step and instance_id=i.id for update;
 select * into strict p from public.approval_participant where id=target_participant and step_id=s.id for update;
 next_version:=app_private.next_version(i.version_no,target_expected_instance);perform app_private.next_version(s.version_no,target_expected_step);perform app_private.next_version(p.version_no,target_expected_participant);
 if i.state<>'IN_PROGRESS' or s.state<>'ACTIVE' or p.state<>'ACTIVE' or p.participant_user_id<>app_private.current_effective_actor_user_id()
  or s.step_role<>'APPROVAL' then raise exception 'active exact official participant required' using errcode='42501';end if;
 if not exists(select 1 from public.user_position_assignment pa join public.position pos on pos.id=pa.position_id and pos.status='ACTIVE'
  where pa.user_id=app_private.current_effective_actor_user_id() and pa.position_id=p.position_id_snapshot and pa.is_primary and pa.revoked_at is null
   and pa.valid_from<=target_time and (pa.valid_until is null or pa.valid_until>target_time) and pos.stable_code in ('POSITION_LAB_DIRECTOR','POSITION_REPRESENTATIVE')) then
  raise exception 'current exact Director/Representative position required' using errcode='42501';end if;
 if app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id() or app_private.current_acting_authority_id() is not null then
  raise exception 'controlled-copy official action requires direct participant' using errcode='42501';end if;
 perform set_config('app.m14_approval_command_instance',i.id::text,true);update public.approval_participant set state='ACTED',version_no=version_no+1 where id=p.id;
 if target_event='REJECT' then update public.approval_step set state=case when id=s.id then 'REJECTED' else 'CANCELLED' end,version_no=version_no+1
   where instance_id=i.id and state in ('WAITING','ACTIVE');update public.approval_participant set state='CANCELLED',version_no=version_no+1
   where step_id in(select id from public.approval_step where instance_id=i.id) and state in ('WAITING','ACTIVE');instance_state:='REJECTED';
   transition_event:='EVT-APPROVAL-REJECT';outbox_event:='EVT-APPROVAL-REJECTED';
 else select case when s.completion_mode='ANY_ONE' then true when s.completion_mode='SEQUENTIAL' then not exists(select 1 from public.approval_participant q where q.step_id=s.id and q.state='WAITING')
   else false end into complete;
  if s.completion_mode='SEQUENTIAL' and not complete then update public.approval_participant set state='ACTIVE',version_no=version_no+1 where id=(select id from public.approval_participant where step_id=s.id and state='WAITING' order by participant_order limit 1);end if;
  if complete then update public.approval_step set state='APPROVED',version_no=version_no+1 where id=s.id;update public.approval_participant set state='CANCELLED',version_no=version_no+1 where step_id=s.id and state='ACTIVE';
   select min(sequence_no) into next_sequence from public.approval_step where instance_id=i.id and state='WAITING';
   if next_sequence is not null then update public.approval_step set state='ACTIVE',version_no=version_no+1 where instance_id=i.id and sequence_no=next_sequence and state='WAITING';
    update public.approval_participant q set state='ACTIVE',version_no=q.version_no+1 from public.approval_step ns where ns.id=q.step_id and ns.instance_id=i.id
     and ns.sequence_no=next_sequence and ns.state='ACTIVE' and q.state='WAITING' and (ns.completion_mode<>'SEQUENTIAL' or q.participant_order=(select min(q2.participant_order) from public.approval_participant q2 where q2.step_id=ns.id and q2.state='WAITING'));
   elsif not exists(select 1 from public.approval_step rs where rs.instance_id=i.id and rs.required and rs.state<>'APPROVED') then
    if not exists(select 1 from app_private.approval_subject_snapshot(i.id) x where x.subject_kind='TECHNICAL_DOCUMENT_COPY_REQUEST' and x.subject_state='SEALED') then
     raise exception 'exact sealed controlled-copy subject changed before completion' using errcode='23514';end if;instance_state:='COMPLETED';transition_event:='EVT-APPROVAL-APPROVE';outbox_event:='EVT-APPROVAL-COMPLETED';end if;
  end if;
 end if;
 update public.approval_instance set state=instance_state,version_no=next_version,completed_at=case when instance_state='COMPLETED' then target_time else completed_at end where id=i.id;
 perform app_private.append_approval_audit_transition(target_audit,target_transition,permission_code,i.id,next_version,transition_event,'IN_PROGRESS',instance_state,target_reason,target_time);
 insert into public.approval_action(id,instance_id,step_id,participant_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,reason_code,opinion,occurred_at)
 values(target_action,i.id,s.id,p.id,target_audit,target_event,'USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),target_reason,target_opinion,target_time);
 perform app_private.enqueue_approval_event(target_outbox,target_audit,outbox_event,i.id,next_version,instance_state,target_time);return next_version;end $$;
create or replace function app_private.m14_guard_approval_action_path() returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 if new.event_id in ('APPROVE','REJECT') and exists(select 1 from public.approval_subject_technical_copy_request l where l.instance_id=new.instance_id)
  and app_private.optional_setting('app.m14_approval_command_instance') is distinct from new.instance_id::text then
  raise exception 'controlled-copy approval actions require typed command path' using errcode='42501';end if;return new;end $$;
create trigger approval_action_m14_typed_path before insert on public.approval_action for each row execute function app_private.m14_guard_approval_action_path();
create or replace function public.approve_technical_document_copy(target_copy uuid,target_expected bigint,target_custody uuid,target_audit uuid,target_transition uuid,
 target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare c public.technical_document_copy%rowtype;nv bigint;begin
 perform app_private.m05_assert_worker(target_time,'APPROVAL_ENGINE');select * into strict c from public.technical_document_copy where id=target_copy for update;
 if c.state<>'APPROVAL_PENDING' or not app_private.m14_approval_valid(c.approval_instance_id,c.document_version_id,c.security_level) then raise exception 'completed exact L3/L4 Approval route required' using errcode='23514';end if;
 nv:=app_private.next_version(c.version_no,target_expected);perform set_config('app.m14_command',c.id::text,true);update public.technical_document_copy set state='APPROVED',version_no=nv,updated_at=target_time where id=c.id;
 perform app_private.m14_append(target_custody,target_audit,target_transition,target_outbox,'technical_document.copy.request',c.id,'EVT-TECHCOPY-APPROVE','APPROVAL_PENDING','APPROVED',c.version_no,nv,'EXACT-APPROVAL-COMPLETED',null,null,target_time);return nv;end $$;
create or replace function public.render_technical_document_copy(target_copy uuid,target_expected bigint,target_output_attachment uuid,target_watermark_checksum text,
 target_renderer text,target_renderer_version text,target_custody uuid,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns text
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare c public.technical_document_copy%rowtype;a public.attachment%rowtype;nv bigint;number text;begin
 perform app_private.m05_assert_worker(target_time,'DOCUMENT_ENGINE');select * into strict c from public.technical_document_copy where id=target_copy for update;
 if c.state<>'APPROVED' or not app_private.m14_approval_valid(c.approval_instance_id,c.document_version_id,c.security_level)
  or not exists(select 1 from public.document_attachment da join public.attachment sa on sa.id=da.attachment_id where da.document_version_id=c.document_version_id
   and da.attachment_id=c.source_attachment_id and da.link_state='ACTIVE' and sa.row_version=c.source_attachment_row_version
   and sa.detected_sha256=c.source_file_checksum and sa.state='AVAILABLE') then raise exception 'approved exact request and immutable renderer input required' using errcode='23514';end if;
 select * into strict a from public.attachment where id=target_output_attachment and state='AVAILABLE' and security_level=c.security_level;
 number:=c.copy_no;nv:=app_private.next_version(c.version_no,target_expected);
 perform set_config('app.m14_command',c.id::text,true);update public.technical_document_copy set state='RENDERED',version_no=nv,updated_at=target_time,
  output_attachment_id=a.id,output_attachment_row_version=a.row_version,output_checksum=a.detected_sha256,watermark_manifest_checksum=target_watermark_checksum,
  renderer_id=target_renderer,renderer_version=target_renderer_version where id=c.id;
 perform app_private.m14_append(target_custody,target_audit,target_transition,target_outbox,'technical_document.copy.render',c.id,'EVT-TECHCOPY-RENDER','APPROVED','RENDERED',c.version_no,nv,
  'INTERNAL-WATERMARKED-RENDER',a.id,null,target_time);return number;end $$;
create or replace function public.print_technical_document_copy(target_copy uuid,target_expected bigint,target_pages integer,target_printer text,target_custody uuid,
 target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare c public.technical_document_copy%rowtype;nv bigint;begin
 select * into strict c from public.technical_document_copy where id=target_copy for update;perform app_private.m14_assert_internal('technical_document.copy.print',c.project_id,target_time);
 if c.state<>'RENDERED' or target_pages<1 then raise exception 'internally rendered copy and page count required' using errcode='23514';end if;nv:=app_private.next_version(c.version_no,target_expected);
 perform set_config('app.m14_command',c.id::text,true);update public.technical_document_copy set state='PRINTED',version_no=nv,updated_at=target_time,
  printed_by_user_id=app_private.current_effective_actor_user_id(),printer_device_code=target_printer,page_count=target_pages,printed_at=target_time where id=c.id;
 perform app_private.m14_append(target_custody,target_audit,target_transition,target_outbox,'technical_document.copy.print',c.id,'EVT-TECHCOPY-PRINT','RENDERED','PRINTED',c.version_no,nv,
  'INTERNAL-DIRECT-PRINT',c.output_attachment_id,target_pages,target_time);return nv;end $$;
create or replace function public.handover_technical_document_copy(target_copy uuid,target_expected bigint,target_ack_attachment uuid,target_custody uuid,target_allowlist uuid,
 target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare c public.technical_document_copy%rowtype;nv bigint;begin
 select * into strict c from public.technical_document_copy where id=target_copy for update;perform app_private.m14_assert_internal('technical_document.copy.custody',c.project_id,target_time);
 if c.state<>'PRINTED' then raise exception 'printed controlled copy required' using errcode='23514';end if;
 if c.recipient_vendor_user_id is not null and not app_private.m14_recipient_vendor_scope_valid(c.recipient_vendor_user_id,c.project_id,c.contract_id,target_time) then
  perform app_private.append_audit(target_audit,'technical_document.copy.custody','TECHNICAL_DOCUMENT_COPY',c.id,c.version_no,'FAILED',
   'VENDOR-SCOPE-LOST-HANDOVER-DENIED',c.recipient_vendor_user_id,null,null,null,target_time);return null;end if;
 perform 1 from public.attachment where id=target_ack_attachment and state='AVAILABLE';nv:=app_private.next_version(c.version_no,target_expected);
 perform set_config('app.m14_command',c.id::text,true);update public.technical_document_copy set state='HANDED_OVER',version_no=nv,updated_at=target_time,
  handed_over_by_user_id=app_private.current_effective_actor_user_id(),handed_over_at=target_time where id=c.id;
 if c.recipient_vendor_user_id is not null then insert into public.technical_copy_vendor_projection_allowlist(id,copy_id,vendor_user_id,project_id,contract_id,valid_from,valid_until,granted_by_user_id,reason_code)
  values(target_allowlist,c.id,c.recipient_vendor_user_id,c.project_id,c.contract_id,target_time,c.return_destroy_due_at,app_private.current_effective_actor_user_id(),'CONTROLLED-COPY-HANDOVER');end if;
 perform app_private.m14_append(target_custody,target_audit,target_transition,target_outbox,'technical_document.copy.custody',c.id,'EVT-TECHCOPY-HANDOVER','PRINTED','HANDED_OVER',c.version_no,nv,
  'RECIPIENT-ACKNOWLEDGED-HANDOVER',target_ack_attachment,c.page_count,target_time);return nv;end $$;
create or replace function public.mark_technical_copy_return_due(target_copy uuid,target_expected bigint,target_custody uuid,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare c public.technical_document_copy%rowtype;nv bigint;begin perform app_private.m05_assert_worker(target_time,'TECHCOPY_CUSTODY_MONITOR');
 select * into strict c from public.technical_document_copy where id=target_copy for update;if c.state<>'HANDED_OVER' or target_time<c.return_destroy_due_at then raise exception 'handed-over due copy required' using errcode='23514';end if;
 nv:=app_private.next_version(c.version_no,target_expected);perform set_config('app.m14_command',c.id::text,true);update public.technical_document_copy set state='RETURN_DUE',version_no=nv,updated_at=target_time where id=c.id;
 perform app_private.m14_append(target_custody,target_audit,target_transition,target_outbox,'technical_document.copy.overdue',c.id,'EVT-TECHCOPY-RETURN-DUE','HANDED_OVER','RETURN_DUE',c.version_no,nv,
  'CONTROLLED-COPY-RETURN-DUE',null,null,target_time);return nv;end $$;
create or replace function public.mark_technical_copy_overdue(target_alert uuid,target_copy uuid,target_key text,target_expected bigint,target_custody uuid,target_audit uuid,
 target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare c public.technical_document_copy%rowtype;nv bigint;begin
 perform app_private.m05_assert_worker(target_time,'TECHCOPY_CUSTODY_MONITOR');select * into strict c from public.technical_document_copy where id=target_copy for update;
 if c.state='OVERDUE' and exists(select 1 from public.technical_copy_overdue_alert a where a.copy_id=c.id and a.idempotency_key=target_key) then return c.version_no;end if;
 if c.state<>'RETURN_DUE' or target_time<=c.return_destroy_due_at then raise exception 'return-due overdue copy required' using errcode='23514';end if;
 insert into public.technical_copy_overdue_alert(id,copy_id,idempotency_key,detected_at) values(target_alert,c.id,target_key,target_time);
 nv:=app_private.next_version(c.version_no,target_expected);perform set_config('app.m14_command',c.id::text,true);update public.technical_document_copy set state='OVERDUE',version_no=nv,updated_at=target_time where id=c.id;
 perform app_private.m14_append(target_custody,target_audit,target_transition,target_outbox,'technical_document.copy.overdue',c.id,'EVT-TECHCOPY-OVERDUE','RETURN_DUE','OVERDUE',c.version_no,nv,
  'CONTROLLED-COPY-OVERDUE',null,null,target_time);return nv;end $$;
create or replace function public.close_technical_document_copy(target_copy uuid,target_event text,target_expected bigint,target_evidence uuid,target_pages integer,target_reason text,
 target_custody uuid,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 c public.technical_document_copy%rowtype;to_state text;nv bigint;begin select * into strict c from public.technical_document_copy where id=target_copy for update;
 perform app_private.m14_assert_internal(case when target_event='EVT-TECHCOPY-RETURN' then 'technical_document.copy.return' else 'technical_document.copy.destroy' end,c.project_id,target_time);
 to_state:=case when target_event='EVT-TECHCOPY-RETURN' and c.state in ('HANDED_OVER','RETURN_DUE','OVERDUE') then 'RETURNED'
  when target_event='EVT-TECHCOPY-DESTROY' and c.state in ('HANDED_OVER','RETURN_DUE','RETURNED','OVERDUE') then 'DESTROYED' end;
 if to_state is null or target_evidence is null or target_pages<>c.page_count or nullif(btrim(target_reason),'') is null then raise exception 'exact custody evidence and all numbered pages required' using errcode='23514';end if;
 nv:=app_private.next_version(c.version_no,target_expected);perform set_config('app.m14_command',c.id::text,true);update public.technical_document_copy set state=to_state,version_no=nv,updated_at=target_time where id=c.id;
 perform app_private.m14_append(target_custody,target_audit,target_transition,target_outbox,
  case when target_event='EVT-TECHCOPY-RETURN' then 'technical_document.copy.return' else 'technical_document.copy.destroy' end,
  c.id,target_event,c.state,to_state,c.version_no,nv,target_reason,target_evidence,target_pages,target_time);return nv;end $$;

create or replace function app_private.m14_vendor_can_view(target_copy uuid,target_time timestamptz) returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private as $$
 select exists(select 1 from public.technical_document_copy c join public.technical_copy_vendor_projection_allowlist a on a.copy_id=c.id
  join public.vendor_user vu on vu.id=a.vendor_user_id and vu.id=c.recipient_vendor_user_id and vu.status='ACTIVE' and vu.revoked_at is null
  join public.vendor v on v.id=vu.vendor_id and v.status='ACTIVE' join public.user_account u on u.id=vu.user_id and u.account_kind='VENDOR' and u.status='ACTIVE'
  where c.id=target_copy and vu.user_id=app_private.current_effective_actor_user_id() and a.valid_from<=target_time and a.valid_until>target_time
   and vu.valid_from<=target_time and (vu.valid_until is null or vu.valid_until>target_time) and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time)
   and app_private.actor_has_project_vendor_scope(c.project_id,'technical_document.copy.custody',target_time)
   and (c.contract_id is null or app_private.actor_has_contract_vendor_scope(c.contract_id,'technical_document.copy.custody',target_time))) $$;
create or replace function public.read_vendor_controlled_copy(target_copy uuid,target_time timestamptz)
returns table(copy_no text,state text,purpose_code text,handed_over_at timestamptz,return_destroy_due_at timestamptz,page_count integer)
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$ begin if target_time is distinct from app_private.request_time()
 or not app_private.m14_vendor_can_view(target_copy,target_time) then raise exception 'exact Vendor controlled-copy projection denied' using errcode='42501';end if;
 return query select c.copy_no,c.state,c.purpose_code,c.handed_over_at,c.return_destroy_due_at,c.page_count from public.technical_document_copy c where c.id=target_copy;end $$;
create or replace function app_private.m14_can_read_internal(target_copy uuid,target_time timestamptz) returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private as $$
 select exists(select 1 from public.technical_document_copy c where c.id=target_copy and not app_private.m14_is_admin(app_private.current_effective_actor_user_id(),target_time)
  and app_private.actor_has_project_internal_scope(c.project_id,target_time) and exists(select 1 from public.user_account u where u.id=app_private.current_effective_actor_user_id()
   and u.account_kind='INTERNAL' and u.status='ACTIVE' and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time))) $$;
create or replace function public.read_internal_controlled_copy(target_copy uuid,target_time timestamptz)
returns table(copy_id uuid,document_version_id uuid,copy_no text,security_level text,state text,recipient_identity text,purpose_code text,page_count integer,return_destroy_due_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$ begin if target_time is distinct from app_private.request_time()
 or not app_private.m14_can_read_internal(target_copy,target_time) then raise exception 'internal controlled-copy projection denied' using errcode='42501';end if;
 return query select c.id,c.document_version_id,c.copy_no,c.security_level,c.state,c.recipient_identity_snapshot,c.purpose_code,c.page_count,c.return_destroy_due_at
 from public.technical_document_copy c where c.id=target_copy;end $$;

alter table public.technical_document_copy enable row level security;alter table public.technical_document_copy force row level security;
alter table public.approval_subject_technical_copy_request enable row level security;alter table public.approval_subject_technical_copy_request force row level security;
alter table public.technical_copy_document_project_scope enable row level security;alter table public.technical_copy_document_project_scope force row level security;
alter table public.technical_copy_document_contract_scope enable row level security;alter table public.technical_copy_document_contract_scope force row level security;
alter table public.technical_copy_custody_event enable row level security;alter table public.technical_copy_custody_event force row level security;
alter table public.technical_copy_vendor_projection_allowlist enable row level security;alter table public.technical_copy_vendor_projection_allowlist force row level security;
alter table public.technical_copy_overdue_alert enable row level security;alter table public.technical_copy_overdue_alert force row level security;
create policy technical_copy_internal_read on public.technical_document_copy for select to youone_request using(app_private.m14_can_read_internal(id,app_private.request_time()));
create policy technical_copy_custody_internal_read on public.technical_copy_custody_event for select to youone_request using(app_private.m14_can_read_internal(copy_id,app_private.request_time()));
revoke all on table public.technical_document_copy,public.approval_subject_technical_copy_request,public.technical_copy_document_project_scope,public.technical_copy_document_contract_scope,
 public.technical_copy_custody_event,public.technical_copy_vendor_projection_allowlist,public.technical_copy_overdue_alert
 from public,youone_request,youone_privileged_writer;
grant select on public.technical_document_copy,public.technical_copy_custody_event to youone_request;
do $commands$ declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('request_technical_document_copy','create_technical_copy_approval_instance','submit_technical_document_copy','perform_technical_copy_approval_action','print_technical_document_copy','handover_technical_document_copy',
 'close_technical_document_copy','read_vendor_controlled_copy','read_internal_controlled_copy') loop
 execute format('revoke all on function %s from public,youone_request,youone_privileged_writer',f.signature);execute format('grant execute on function %s to youone_request',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('approve_technical_document_copy','render_technical_document_copy','mark_technical_copy_return_due','mark_technical_copy_overdue') loop
 execute format('revoke all on function %s from public,youone_request,youone_privileged_writer',f.signature);execute format('grant execute on function %s to youone_privileged_writer',f.signature);end loop;end $commands$;
revoke all on function app_private.m14_reject_append_only(),app_private.m14_guard_subject(),app_private.m14_guard_copy(),app_private.m14_is_admin(uuid,timestamptz),
 app_private.m14_assert_internal(text,uuid,timestamptz),app_private.m14_approval_valid(uuid,uuid,text),
 app_private.m14_policy_matrix_valid(uuid,text),
 app_private.m14_recipient_vendor_scope_valid(uuid,uuid,uuid,timestamptz),
 app_private.m14_append(uuid,uuid,uuid,uuid,text,uuid,text,text,text,bigint,bigint,text,uuid,integer,timestamptz),
 app_private.m14_vendor_can_view(uuid,timestamptz),app_private.m14_can_read_internal(uuid,timestamptz),app_private.m14_guard_approval_action_path()
from public,youone_request,youone_privileged_writer;
grant execute on function app_private.m14_can_read_internal(uuid,timestamptz) to youone_request;

comment on table public.technical_document_copy is 'L3/L4 exact-version internally rendered, numbered and watermarked controlled copy; no Vendor self-print or source download.';
comment on table public.technical_copy_custody_event is 'Append-only print, handover, return/destruction and overdue custody history.';
