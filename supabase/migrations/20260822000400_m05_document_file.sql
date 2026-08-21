-- M05 Document/File Engine
-- Forward-fix only after merge. Business bytes remain in private object storage;
-- PostgreSQL stores typed metadata, hashes, immutable snapshots and guarded intents.

insert into public.aggregate_type_definition(aggregate_type) values
  ('TEMPLATE_VERSION'),('DOCUMENT'),('DOCUMENT_VERSION'),('DOCUMENT_VALIDATION'),('ATTACHMENT')
on conflict do nothing;

insert into public.action_definition(action_id) values
  ('template.record.create'),('template.version.seal'),
  ('document.record.create'),('document.record.security.change'),('document.version.edit'),('document.version.seal'),('document.version.submit'),
  ('document.version.approve'),('document.version.reject'),('document.version.recall'),('document.version.supersede'),
  ('document.content.validate'),('technical_document.content.preview'),('technical_document.content.download'),
  ('file.attachment.intent'),('file.attachment.remove'),('file.attachment.verify'),('file.attachment.quarantine'),('file.attachment.delivery')
on conflict do nothing;

insert into public.permission(id,stable_code) values
  ('35000000-0000-4000-8000-000000000001','document.template.manage'),
  ('35000000-0000-4000-8000-000000000002','document.version.create'),
  ('35000000-0000-4000-8000-000000000003','document.version.edit'),
  ('35000000-0000-4000-8000-000000000004','document.version.seal'),
  ('35000000-0000-4000-8000-000000000005','document.version.submit'),
  ('35000000-0000-4000-8000-000000000006','technical_document.content.preview'),
  ('35000000-0000-4000-8000-000000000007','file.attachment.upload'),
  ('35000000-0000-4000-8000-000000000008','technical_document.content.download')
on conflict(stable_code) do nothing;

insert into public.security_entitlement(id,stable_code) values
  ('35100000-0000-4000-8000-000000000001','ENTITLEMENT_L3_SOURCE_READ'),
  ('35100000-0000-4000-8000-000000000002','ENTITLEMENT_L4_SOURCE_READ')
on conflict(stable_code) do nothing;

insert into public.domain_event_definition(event_id,payload_schema_id,payload_schema_version) values
  ('EVT-DOCUMENT-SEALED','DOCUMENT_EVENT_REF',1),('EVT-DOCUMENT-SUBMITTED','DOCUMENT_EVENT_REF',1),
  ('EVT-DOCUMENT-APPROVED','DOCUMENT_EVENT_REF',1),('EVT-DOCUMENT-REJECTED','DOCUMENT_EVENT_REF',1),
  ('EVT-DOCUMENT-RECALLED','DOCUMENT_EVENT_REF',1),('EVT-DOCUMENT-SUPERSEDED','DOCUMENT_EVENT_REF',1),
  ('EVT-ATTACHMENT-AVAILABLE','ATTACHMENT_EVENT_REF',1),('EVT-ATTACHMENT-QUARANTINED','ATTACHMENT_EVENT_REF',1)
on conflict do nothing;

insert into public.state_machine_definition(machine_id,aggregate_type) values
  ('SM-DOCUMENT-V1','DOCUMENT_VERSION'),('SM-ATTACHMENT-V1','ATTACHMENT')
on conflict do nothing;

insert into public.state_definition(machine_id,state_id,is_terminal) values
  ('SM-DOCUMENT-V1','DRAFT',false),('SM-DOCUMENT-V1','REVIEW_READY',false),('SM-DOCUMENT-V1','APPROVAL_PENDING',false),
  ('SM-DOCUMENT-V1','APPROVED',false),('SM-DOCUMENT-V1','REJECTED',true),('SM-DOCUMENT-V1','RECALLED',true),
  ('SM-DOCUMENT-V1','SUPERSEDED',true),('SM-DOCUMENT-V1','RETENTION_HOLD',false),('SM-DOCUMENT-V1','DISPOSAL_REQUESTED',false),
  ('SM-DOCUMENT-V1','QUARANTINED',false),('SM-DOCUMENT-V1','DISPOSED',true),
  ('SM-ATTACHMENT-V1','UPLOAD_INTENDED',false),('SM-ATTACHMENT-V1','UPLOADED',false),('SM-ATTACHMENT-V1','SCANNING',false),
  ('SM-ATTACHMENT-V1','AVAILABLE',false),('SM-ATTACHMENT-V1','QUARANTINED',false),('SM-ATTACHMENT-V1','REJECTED',true)
on conflict do nothing;

insert into public.transition_definition(machine_id,event_id,from_state,to_state) values
  ('SM-DOCUMENT-V1','EVT-DOCUMENT-CREATE',null,'DRAFT'),
  ('SM-DOCUMENT-V1','EVT-DOCUMENT-SEAL','DRAFT','REVIEW_READY'),
  ('SM-DOCUMENT-V1','EVT-DOCUMENT-SUBMIT','REVIEW_READY','APPROVAL_PENDING'),
  ('SM-DOCUMENT-V1','EVT-DOCUMENT-APPROVE','APPROVAL_PENDING','APPROVED'),
  ('SM-DOCUMENT-V1','EVT-DOCUMENT-REJECT','APPROVAL_PENDING','REJECTED'),
  ('SM-DOCUMENT-V1','EVT-DOCUMENT-RECALL','APPROVAL_PENDING','RECALLED'),
  ('SM-DOCUMENT-V1','EVT-DOCUMENT-REVISE','APPROVED','SUPERSEDED'),
  ('SM-ATTACHMENT-V1','EVT-ATTACHMENT-INTEND',null,'UPLOAD_INTENDED'),
  ('SM-ATTACHMENT-V1','EVT-ATTACHMENT-UPLOADED','UPLOAD_INTENDED','UPLOADED'),
  ('SM-ATTACHMENT-V1','EVT-ATTACHMENT-SCAN','UPLOADED','SCANNING'),
  ('SM-ATTACHMENT-V1','EVT-ATTACHMENT-AVAILABLE','SCANNING','AVAILABLE'),
  ('SM-ATTACHMENT-V1','EVT-ATTACHMENT-QUARANTINE','UPLOADED','QUARANTINED'),
  ('SM-ATTACHMENT-V1','EVT-ATTACHMENT-QUARANTINE','SCANNING','QUARANTINED'),
  ('SM-ATTACHMENT-V1','EVT-ATTACHMENT-REJECT','UPLOAD_INTENDED','REJECTED'),
  ('SM-ATTACHMENT-V1','EVT-ATTACHMENT-REJECT','UPLOADED','REJECTED'),
  ('SM-ATTACHMENT-V1','EVT-ATTACHMENT-REJECT','SCANNING','REJECTED')
on conflict do nothing;

create table public.document_type_definition (
  stable_code text primary key check(app_private.is_stable_code(stable_code)),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','DISABLED')),
  registered_at timestamptz not null default statement_timestamp()
);

create table public.retention_policy_definition (
  stable_code text primary key check(app_private.is_stable_code(stable_code)),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','DISABLED')),
  registered_at timestamptz not null default statement_timestamp()
);

create table public.editor_schema_definition (
  stable_code text primary key check(app_private.is_stable_code(stable_code)),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','RETIRED')),
  registered_at timestamptz not null default statement_timestamp()
);

create table public.file_mime_type_definition (
  mime_type text primary key check(length(mime_type) between 3 and 255 and mime_type=lower(mime_type)),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','DISABLED')),
  registered_at timestamptz not null default statement_timestamp()
);

-- Technical bootstrap codes only. Retention periods and business document types
-- remain versioned company policy and are not presented as statutory values.
insert into public.document_type_definition(stable_code) values ('DOC_GENERAL');
insert into public.retention_policy_definition(stable_code) values ('RETENTION_COMPANY_POLICY');
insert into public.editor_schema_definition(stable_code) values ('EDITOR_SCHEMA_V1');
insert into public.file_mime_type_definition(mime_type) values
  ('application/pdf'),('image/png'),('image/jpeg'),('text/plain'),
  ('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

create table public.template (
  id uuid primary key,
  template_code text not null unique check(app_private.is_stable_code(template_code)),
  document_type_id text not null references public.document_type_definition(stable_code),
  status text not null check(status in ('ACTIVE','DISABLED')),
  row_version bigint not null default 0 check(row_version>=0),
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null default statement_timestamp()
);

create table public.template_version (
  id uuid primary key,
  template_id uuid not null references public.template(id),
  version_no bigint not null check(version_no>0),
  state text not null check(state in ('DRAFT','SEALED','RETIRED')),
  editor_schema_version text not null references public.editor_schema_definition(stable_code),
  content_schema jsonb not null check(jsonb_typeof(content_schema)='object' and pg_column_size(content_schema)<=1048576),
  template_content jsonb not null check(jsonb_typeof(template_content)='object' and pg_column_size(template_content)<=4194304),
  checksum text not null check(app_private.is_sha256(checksum)),
  row_version bigint not null default 0 check(row_version>=0),
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null default statement_timestamp(),
  unique(template_id,version_no),
  unique(id,template_id,version_no,checksum)
);

create table public.document (
  id uuid primary key,
  document_no text not null unique check(length(document_no) between 1 and 80),
  document_type_id text not null references public.document_type_definition(stable_code),
  title text not null check(length(title) between 1 and 500),
  owner_organization_id uuid not null references public.organization(id),
  owner_user_id uuid not null references public.user_account(id),
  security_level text not null check(security_level in ('SEC_L1_PUBLIC_GENERAL','SEC_L2_INTERNAL','SEC_L3_CONFIDENTIAL','SEC_L4_CORE_SECRET')),
  retention_policy_id text not null references public.retention_policy_definition(stable_code),
  current_version_id uuid not null,
  current_version_no bigint not null check(current_version_no>0),
  lifecycle_state text not null check(lifecycle_state in ('DRAFT','REVIEW_READY','APPROVAL_PENDING','APPROVED','REJECTED','RECALLED','SUPERSEDED','RETENTION_HOLD','DISPOSAL_REQUESTED','QUARANTINED','DISPOSED')),
  row_version bigint not null default 0 check(row_version>=0),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table public.document_version (
  id uuid primary key,
  document_id uuid not null references public.document(id),
  version_no bigint not null check(version_no>0),
  prior_version_id uuid,
  prior_version_no bigint,
  superseded_by_version_id uuid,
  approval_instance_id uuid unique references public.approval_instance(id),
  template_source text not null check(template_source in ('FREE_FORM','TEMPLATE_VERSION')),
  template_version_id uuid,
  template_id_snapshot uuid,
  template_version_no bigint check(template_version_no is null or template_version_no>0),
  template_checksum text check(template_checksum is null or app_private.is_sha256(template_checksum)),
  editor_schema_version text not null references public.editor_schema_definition(stable_code),
  content_validation_evidence_id uuid not null,
  content_validation_outcome text not null default 'VALID' check(content_validation_outcome='VALID'),
  renderer_id text not null check(app_private.is_stable_code(renderer_id)),
  renderer_version text not null check(app_private.is_stable_code(renderer_version)),
  security_level_snapshot text not null check(security_level_snapshot in ('SEC_L1_PUBLIC_GENERAL','SEC_L2_INTERNAL','SEC_L3_CONFIDENTIAL','SEC_L4_CORE_SECRET')),
  editor_content jsonb not null check(jsonb_typeof(editor_content)='object' and pg_column_size(editor_content)<=4194304),
  content_checksum text not null check(app_private.is_sha256(content_checksum)),
  sealed_manifest_schema text check(sealed_manifest_schema is null or app_private.is_stable_code(sealed_manifest_schema)),
  sealed_manifest_version bigint check(sealed_manifest_version is null or sealed_manifest_version>0),
  sealed_snapshot_checksum text check(sealed_snapshot_checksum is null or app_private.is_sha256(sealed_snapshot_checksum)),
  sealed_manifest_evidence_id uuid,
  creation_reason_code text not null check(app_private.is_stable_code(creation_reason_code)),
  author_user_id uuid not null references public.user_account(id),
  state text not null check(state in ('DRAFT','REVIEW_READY','APPROVAL_PENDING','APPROVED','REJECTED','RECALLED','SUPERSEDED','RETENTION_HOLD','DISPOSAL_REQUESTED','QUARANTINED','DISPOSED')),
  row_version bigint not null default 0 check(row_version>=0),
  created_at timestamptz not null,
  sealed_at timestamptz,
  decided_at timestamptz,
  unique(document_id,version_no),
  unique(document_id,id),
  unique(document_id,id,version_no),
  unique(id,document_id,version_no,sealed_snapshot_checksum),
  unique(id,document_id,version_no,sealed_snapshot_checksum,sealed_at),
  check((prior_version_id is null and prior_version_no is null and version_no=1)
    or (prior_version_id is not null and prior_version_no is not null and prior_version_no<version_no)),
  foreign key(document_id,prior_version_id,prior_version_no) references public.document_version(document_id,id,version_no),
  foreign key(document_id,superseded_by_version_id) references public.document_version(document_id,id),
  foreign key(template_version_id,template_id_snapshot,template_version_no,template_checksum)
    references public.template_version(id,template_id,version_no,checksum),
  check((template_source='FREE_FORM' and template_version_id is null and template_id_snapshot is null and template_version_no is null and template_checksum is null)
    or (template_source='TEMPLATE_VERSION' and template_version_id is not null and template_id_snapshot is not null and template_version_no is not null and template_checksum is not null)),
  check((state='DRAFT' and sealed_manifest_schema is null and sealed_manifest_version is null and sealed_snapshot_checksum is null and sealed_manifest_evidence_id is null)
    or (state<>'DRAFT' and sealed_manifest_schema is not null and sealed_manifest_version is not null and sealed_snapshot_checksum is not null and sealed_manifest_evidence_id is not null))
);

alter table public.document add constraint document_current_version_exact_fk
  foreign key(id,current_version_id,current_version_no)
  references public.document_version(document_id,id,version_no)
  deferrable initially deferred;

create table public.attachment (
  id uuid primary key,
  storage_provider text not null check(storage_provider='SUPABASE_PRIVATE'),
  bucket_code text not null check(bucket_code='PRIVATE_BUSINESS'),
  storage_key text not null unique check(
    length(storage_key) between 20 and 500
    and storage_key !~* '^(https?|data|file):'
    and storage_key !~* '(token|signature|signed|[?&#])'
  ),
  declared_mime_type text not null check(length(declared_mime_type) between 3 and 255),
  declared_size_bytes bigint not null check(declared_size_bytes between 1 and 50000000),
  expected_sha256 text not null check(app_private.is_sha256(expected_sha256)),
  detected_mime_type text check(detected_mime_type is null or length(detected_mime_type) between 3 and 255),
  detected_size_bytes bigint check(detected_size_bytes is null or detected_size_bytes between 1 and 50000000),
  detected_sha256 text check(detected_sha256 is null or app_private.is_sha256(detected_sha256)),
  signature_validation text check(signature_validation is null or signature_validation in ('MATCH','MISMATCH','UNKNOWN')),
  scanner_id text check(scanner_id is null or app_private.is_stable_code(scanner_id)),
  scanner_version text check(scanner_version is null or app_private.is_stable_code(scanner_version)),
  scan_evidence_id uuid,
  scan_verdict text check(scan_verdict is null or scan_verdict in ('CLEAN','MALICIOUS','UNSUPPORTED','ERROR')),
  quarantine_reason_code text check(quarantine_reason_code is null or app_private.is_stable_code(quarantine_reason_code)),
  security_level text not null check(security_level in ('SEC_L1_PUBLIC_GENERAL','SEC_L2_INTERNAL','SEC_L3_CONFIDENTIAL','SEC_L4_CORE_SECRET')),
  uploader_user_id uuid not null references public.user_account(id),
  state text not null check(state in ('UPLOAD_INTENDED','UPLOADED','SCANNING','AVAILABLE','QUARANTINED','REJECTED')),
  row_version bigint not null default 0 check(row_version>=0),
  intent_expires_at timestamptz not null,
  created_at timestamptz not null,
  verified_at timestamptz,
  scanned_at timestamptz,
  foreign key(declared_mime_type) references public.file_mime_type_definition(mime_type),
  foreign key(detected_mime_type) references public.file_mime_type_definition(mime_type),
  check(intent_expires_at>created_at),
  check((state='UPLOAD_INTENDED' and detected_mime_type is null and detected_size_bytes is null and detected_sha256 is null and verified_at is null)
    or (state in ('UPLOADED','SCANNING') and detected_mime_type is not null and detected_size_bytes is not null and detected_sha256 is not null and verified_at is not null)
    or (state='AVAILABLE' and detected_mime_type is not null and detected_size_bytes is not null and detected_sha256 is not null and verified_at is not null
      and signature_validation='MATCH' and scanner_id is not null and scanner_version is not null and scan_evidence_id is not null and scan_verdict='CLEAN' and scanned_at is not null and quarantine_reason_code is null)
    or (state='QUARANTINED' and detected_mime_type is not null and detected_size_bytes is not null and detected_sha256 is not null and verified_at is not null
      and scanner_version is not null and scan_evidence_id is not null and scanned_at is not null and quarantine_reason_code is not null)
    or (state='REJECTED' and ((detected_mime_type is null and detected_size_bytes is null and detected_sha256 is null and verified_at is null)
      or (detected_mime_type is not null and detected_size_bytes is not null and detected_sha256 is not null and verified_at is not null)))),
  unique(id,security_level)
);

create table public.document_attachment (
  document_version_id uuid not null references public.document_version(id),
  attachment_id uuid not null references public.attachment(id),
  purpose_code text not null check(app_private.is_stable_code(purpose_code)),
  linked_by_user_id uuid not null references public.user_account(id),
  linked_at timestamptz not null,
  link_state text not null default 'ACTIVE' check(link_state in ('ACTIVE','REMOVED')),
  row_version bigint not null default 1 check(row_version>0),
  removed_by_user_id uuid references public.user_account(id),
  removed_at timestamptz,
  removal_reason_code text check(removal_reason_code is null or app_private.is_stable_code(removal_reason_code)),
  primary key(document_version_id,attachment_id),
  unique(document_version_id,purpose_code,attachment_id),
  check((link_state='ACTIVE' and removed_by_user_id is null and removed_at is null and removal_reason_code is null)
    or (link_state='REMOVED' and removed_by_user_id is not null and removed_at is not null and removal_reason_code is not null))
);

create table public.document_content_validation_evidence (
  id uuid primary key,
  editor_schema_version text not null references public.editor_schema_definition(stable_code),
  content_checksum text not null check(app_private.is_sha256(content_checksum)),
  validator_id text not null check(app_private.is_stable_code(validator_id)),
  validator_version text not null check(app_private.is_stable_code(validator_version)),
  outcome text not null check(outcome in ('VALID','INVALID')),
  validated_at timestamptz not null,
  unique(id,editor_schema_version,content_checksum,outcome)
);
alter table public.document_version add constraint document_content_validation_evidence_fk
  foreign key(content_validation_evidence_id,editor_schema_version,content_checksum,content_validation_outcome)
  references public.document_content_validation_evidence(id,editor_schema_version,content_checksum,outcome);

create table public.document_seal_evidence (
  id uuid primary key,
  document_version_id uuid not null,
  document_id uuid not null,
  version_no bigint not null check(version_no>0),
  manifest_schema text not null check(app_private.is_stable_code(manifest_schema)),
  manifest_version bigint not null check(manifest_version>0),
  manifest_checksum text not null check(app_private.is_sha256(manifest_checksum)),
  sealed_at timestamptz not null,
  unique(id,document_version_id,document_id,version_no,manifest_schema,manifest_version,manifest_checksum),
  foreign key(document_version_id,document_id,version_no,manifest_checksum)
    references public.document_version(id,document_id,version_no,sealed_snapshot_checksum)
    deferrable initially deferred
);
alter table public.document_version add constraint document_seal_evidence_exact_fk
  foreign key(sealed_manifest_evidence_id,id,document_id,version_no,sealed_manifest_schema,sealed_manifest_version,sealed_snapshot_checksum)
  references public.document_seal_evidence(id,document_version_id,document_id,version_no,manifest_schema,manifest_version,manifest_checksum)
  deferrable initially deferred;

create table public.file_scan_evidence (
  id uuid primary key,
  attachment_id uuid not null references public.attachment(id),
  detected_sha256 text not null check(app_private.is_sha256(detected_sha256)),
  scanner_id text not null check(app_private.is_stable_code(scanner_id)),
  scanner_version text not null check(app_private.is_stable_code(scanner_version)),
  verdict text not null check(verdict in ('CLEAN','MALICIOUS','UNSUPPORTED','ERROR')),
  scanned_at timestamptz not null,
  unique(id,attachment_id,detected_sha256,scanner_id,scanner_version,verdict)
);
alter table public.attachment add constraint attachment_scan_evidence_fk
  foreign key(scan_evidence_id,id,detected_sha256,scanner_id,scanner_version,scan_verdict)
  references public.file_scan_evidence(id,attachment_id,detected_sha256,scanner_id,scanner_version,verdict)
  deferrable initially deferred;

create index document_owner_scope_idx on public.document(owner_organization_id,owner_user_id,lifecycle_state);
create index document_security_state_idx on public.document(security_level,lifecycle_state);
create index document_version_state_idx on public.document_version(document_id,state,version_no desc);
create index attachment_state_expiry_idx on public.attachment(state,intent_expires_at);
create index document_attachment_attachment_idx on public.document_attachment(attachment_id,document_version_id);

-- One ApprovalInstance owns exactly one FK-backed subject family. Future subject
-- migrations extend this registry and the deferred checker, never a generic UUID pair.
create table public.approval_subject_binding (
  instance_id uuid primary key references public.approval_instance(id),
  subject_kind text not null check(subject_kind in ('APPROVAL_POLICY_VERSION','DOCUMENT_VERSION')),
  bound_at timestamptz not null default statement_timestamp(),
  unique(instance_id,subject_kind)
);

insert into public.approval_subject_binding(instance_id,subject_kind)
select instance_id,'APPROVAL_POLICY_VERSION' from public.approval_subject_policy_version;

alter table public.approval_subject_policy_version add column subject_kind text not null default 'APPROVAL_POLICY_VERSION'
  check(subject_kind='APPROVAL_POLICY_VERSION');
alter table public.approval_subject_policy_version add constraint approval_policy_subject_binding_fk
  foreign key(instance_id,subject_kind) references public.approval_subject_binding(instance_id,subject_kind)
  deferrable initially deferred;

create table public.approval_subject_document_version (
  instance_id uuid primary key references public.approval_instance(id),
  subject_kind text not null default 'DOCUMENT_VERSION' check(subject_kind='DOCUMENT_VERSION'),
  document_version_id uuid not null,
  document_id uuid not null,
  subject_version_no bigint not null check(subject_version_no>0),
  subject_checksum text not null check(app_private.is_sha256(subject_checksum)),
  subject_sealed_at timestamptz not null,
  unique(document_version_id,instance_id),
  foreign key(instance_id,subject_kind) references public.approval_subject_binding(instance_id,subject_kind) deferrable initially deferred,
  foreign key(document_version_id,document_id,subject_version_no,subject_checksum,subject_sealed_at)
    references public.document_version(id,document_id,version_no,sealed_snapshot_checksum,sealed_at)
);

create or replace function app_private.bind_approval_subject()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  insert into public.approval_subject_binding(instance_id,subject_kind) values(new.instance_id,new.subject_kind)
  on conflict(instance_id) do nothing;
  if not exists(select 1 from public.approval_subject_binding b where b.instance_id=new.instance_id and b.subject_kind=new.subject_kind) then
    raise exception 'approval instance already has another typed subject' using errcode='23514';
  end if;
  return new;
end $$;
create trigger approval_policy_subject_bind before insert on public.approval_subject_policy_version for each row execute function app_private.bind_approval_subject();
create trigger approval_document_subject_bind before insert on public.approval_subject_document_version for each row execute function app_private.bind_approval_subject();

create or replace function app_private.reject_approval_document_subject_mutation()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin raise exception 'document approval subject snapshot is immutable' using errcode='55000'; end $$;
create trigger approval_document_subject_immutable before update or delete on public.approval_subject_document_version for each row execute function app_private.reject_approval_document_subject_mutation();

create or replace function app_private.guard_document_approval_subject()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  perform pg_advisory_xact_lock(hashtextextended(new.document_version_id::text,0));
  if exists(select 1 from public.approval_subject_document_version l join public.approval_instance i on i.id=l.instance_id
    where l.document_version_id=new.document_version_id and i.state not in ('REJECTED','RECALLED','CANCELLED')) then
    raise exception 'exact document version already has an active approval generation' using errcode='23505';
  end if;
  return new;
end $$;
create trigger approval_document_subject_active_guard before insert on public.approval_subject_document_version
  for each row execute function app_private.guard_document_approval_subject();

create or replace function app_private.assert_exactly_one_approval_subject()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare target_instance uuid:=coalesce(new.instance_id,old.instance_id); subject_count integer; begin
  select (select count(*) from public.approval_subject_policy_version p where p.instance_id=target_instance)
    +(select count(*) from public.approval_subject_document_version d where d.instance_id=target_instance) into subject_count;
  if subject_count<>1 then raise exception 'approval instance requires exactly one typed subject' using errcode='23514'; end if;
  return coalesce(new,old);
end $$;
create constraint trigger approval_binding_exactly_one after insert or update on public.approval_subject_binding
  deferrable initially deferred for each row execute function app_private.assert_exactly_one_approval_subject();

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
$$;

create or replace function app_private.assert_document_head_consistency()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare target_document uuid; begin
  if tg_table_name='document' then
    target_document:=coalesce(new.id,old.id);
  elsif tg_table_name='document_version' then
    target_document:=coalesce(new.document_id,old.document_id);
  else
    raise exception 'unsupported document head consistency trigger table: %',tg_table_name using errcode='23514';
  end if;
  if not exists(select 1 from public.document d join public.document_version v on v.id=d.current_version_id and v.document_id=d.id and v.version_no=d.current_version_no
    where d.id=target_document and d.lifecycle_state=v.state) then
    raise exception 'document head and lifecycle state diverged' using errcode='23514';
  end if;
  return coalesce(new,old);
end $$;
create constraint trigger document_head_consistency after insert or update on public.document
  deferrable initially deferred for each row execute function app_private.assert_document_head_consistency();
create constraint trigger document_version_head_consistency after insert or update on public.document_version
  deferrable initially deferred for each row execute function app_private.assert_document_head_consistency();

create or replace function app_private.reject_m05_delete()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin raise exception '% is immutable evidence and cannot be deleted',tg_table_name using errcode='55000'; end $$;

create or replace function app_private.protect_template_version()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ begin
  if tg_op='DELETE' then raise exception 'template version cannot be deleted' using errcode='55000'; end if;
  if old.state in ('SEALED','RETIRED') then raise exception 'sealed template version is immutable' using errcode='55000'; end if;
  if new.template_id<>old.template_id or new.version_no<>old.version_no or new.created_by_user_id<>old.created_by_user_id or new.created_at<>old.created_at then
    raise exception 'template version identity is immutable' using errcode='55000';
  end if;
  if new.row_version<>old.row_version+1 then raise exception 'template version optimistic version required' using errcode='40001'; end if;
  return new;
end $$;
create trigger template_version_immutable before update or delete on public.template_version for each row execute function app_private.protect_template_version();

create or replace function app_private.protect_document_version()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ begin
  if tg_op='DELETE' then raise exception 'document version cannot be deleted' using errcode='55000'; end if;
  if new.document_id<>old.document_id or new.version_no<>old.version_no or new.author_user_id<>old.author_user_id or new.created_at<>old.created_at
    or new.prior_version_id is distinct from old.prior_version_id or new.prior_version_no is distinct from old.prior_version_no
    or new.approval_instance_id is distinct from old.approval_instance_id and app_private.optional_setting('app.document_transition')<>'SUBMIT' then
    raise exception 'document version identity is immutable' using errcode='55000';
  end if;
  if new.superseded_by_version_id is distinct from old.superseded_by_version_id and app_private.optional_setting('app.document_transition')<>'SUPERSEDE' then
    raise exception 'supersede lineage requires guarded revision command' using errcode='42501';
  end if;
  if old.state<>'DRAFT' and (new.template_source<>old.template_source or new.template_version_id is distinct from old.template_version_id
    or new.template_id_snapshot is distinct from old.template_id_snapshot or new.template_version_no is distinct from old.template_version_no
    or new.template_checksum is distinct from old.template_checksum or new.editor_schema_version<>old.editor_schema_version
    or new.content_validation_evidence_id<>old.content_validation_evidence_id or new.renderer_id<>old.renderer_id or new.renderer_version<>old.renderer_version
    or new.security_level_snapshot<>old.security_level_snapshot
    or new.editor_content<>old.editor_content or new.content_checksum<>old.content_checksum
    or new.sealed_manifest_schema is distinct from old.sealed_manifest_schema or new.sealed_manifest_version is distinct from old.sealed_manifest_version
    or new.sealed_snapshot_checksum is distinct from old.sealed_snapshot_checksum or new.sealed_manifest_evidence_id is distinct from old.sealed_manifest_evidence_id
    or new.creation_reason_code<>old.creation_reason_code) then
    raise exception 'sealed document content/template/checksum snapshot is immutable' using errcode='55000';
  end if;
  if old.state in ('REJECTED','RECALLED','SUPERSEDED','DISPOSED') then raise exception 'historical document version is immutable; create a newer version' using errcode='55000'; end if;
  if old.state='APPROVED' and not (new.state='SUPERSEDED' and app_private.optional_setting('app.document_transition')='SUPERSEDE') then
    raise exception 'approved document version is immutable' using errcode='55000';
  end if;
  if new.state<>old.state and app_private.optional_setting('app.document_transition') is null then
    raise exception 'document state changes require guarded command' using errcode='42501';
  end if;
  if new.row_version<>old.row_version+1 then raise exception 'document version optimistic version required' using errcode='40001'; end if;
  return new;
end $$;
create trigger document_version_immutable before update or delete on public.document_version for each row execute function app_private.protect_document_version();

create or replace function app_private.protect_document_identity()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ begin
  if tg_op='DELETE' then raise exception 'document identity cannot be deleted' using errcode='55000'; end if;
  if new.document_no<>old.document_no or new.document_type_id<>old.document_type_id or new.owner_organization_id<>old.owner_organization_id
    or new.owner_user_id<>old.owner_user_id or (new.security_level<>old.security_level and app_private.optional_setting('app.document_transition')<>'SECURITY_UPDATE') or new.retention_policy_id<>old.retention_policy_id
    or new.created_at<>old.created_at then raise exception 'document identity and policy snapshot are immutable' using errcode='55000'; end if;
  if app_private.optional_setting('app.document_transition') is null then raise exception 'document head changes require guarded command' using errcode='42501'; end if;
  if new.row_version<>old.row_version+1 then raise exception 'document optimistic version required' using errcode='40001'; end if;
  return new;
end $$;
create trigger document_identity_guard before update or delete on public.document for each row execute function app_private.protect_document_identity();

create or replace function app_private.protect_attachment()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ begin
  if tg_op='DELETE' then raise exception 'attachment evidence cannot be deleted' using errcode='55000'; end if;
  if new.storage_provider<>old.storage_provider or new.bucket_code<>old.bucket_code or new.storage_key<>old.storage_key
    or new.declared_mime_type<>old.declared_mime_type or new.declared_size_bytes<>old.declared_size_bytes
    or new.security_level<>old.security_level or new.uploader_user_id<>old.uploader_user_id or new.created_at<>old.created_at then
    raise exception 'attachment intent identity is immutable' using errcode='55000';
  end if;
  if old.state in ('AVAILABLE','QUARANTINED','REJECTED') then raise exception 'verified attachment evidence is immutable' using errcode='55000'; end if;
  if app_private.optional_setting('app.attachment_transition') is null then raise exception 'attachment changes require guarded command' using errcode='42501'; end if;
  if new.row_version<>old.row_version+1 then raise exception 'attachment optimistic version required' using errcode='40001'; end if;
  return new;
end $$;
create trigger attachment_immutable before update or delete on public.attachment for each row execute function app_private.protect_attachment();

create or replace function app_private.protect_document_attachment()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare version_state text; begin
  if tg_op='DELETE' then raise exception 'document attachment evidence cannot be deleted' using errcode='55000'; end if;
  select state into strict version_state from public.document_version where id=old.document_version_id;
  if version_state<>'DRAFT' or app_private.optional_setting('app.document_attachment_transition')<>'REMOVE'
    or old.link_state<>'ACTIVE' or new.link_state<>'REMOVED'
    or new.document_version_id<>old.document_version_id or new.attachment_id<>old.attachment_id or new.purpose_code<>old.purpose_code
    or new.linked_by_user_id<>old.linked_by_user_id or new.linked_at<>old.linked_at or new.row_version<>old.row_version+1 then
    raise exception 'document attachment snapshot is immutable outside guarded draft removal' using errcode='55000';
  end if;
  return new;
end $$;
create trigger document_attachment_no_update before update or delete on public.document_attachment for each row execute function app_private.protect_document_attachment();
create trigger document_validation_evidence_no_update before update or delete on public.document_content_validation_evidence for each row execute function app_private.reject_m05_delete();
create trigger document_seal_evidence_no_update before update or delete on public.document_seal_evidence for each row execute function app_private.reject_m05_delete();
create trigger file_scan_evidence_no_update before update or delete on public.file_scan_evidence for each row execute function app_private.reject_m05_delete();

create or replace function app_private.validate_document_attachment()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare version_state text; document_security text; attachment_security text; begin
  select v.state,v.security_level_snapshot into strict version_state,document_security
  from public.document_version v join public.document d on d.id=v.document_id where v.id=new.document_version_id;
  select a.security_level into strict attachment_security from public.attachment a where a.id=new.attachment_id;
  if version_state<>'DRAFT' or new.link_state<>'ACTIVE' then raise exception 'attachments may only link to draft document versions' using errcode='23514'; end if;
  if document_security<>attachment_security then raise exception 'attachment security must equal document security' using errcode='23514'; end if;
  return new;
end $$;
create trigger document_attachment_validate before insert on public.document_attachment for each row execute function app_private.validate_document_attachment();

create or replace function app_private.m05_assert_user_command(target_occurred_at timestamptz,target_permission text)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if target_occurred_at is distinct from app_private.request_time() then raise exception 'command time must equal trusted request time' using errcode='22023'; end if;
  if app_private.required_setting('app.actor_kind')<>'USER' or not app_private.approval_actor_is_internal(target_occurred_at)
    or not app_private.actor_has_permission(target_permission,target_occurred_at) then
    raise exception 'document/file command denied' using errcode='42501';
  end if;
end $$;

create or replace function app_private.canonical_json_sha256(target_content jsonb)
returns text language sql immutable security definer set search_path=pg_catalog,extensions
as $$ select encode(extensions.digest(convert_to(target_content::text,'UTF8'),'sha256'),'hex') $$;

create or replace function app_private.m05_assert_worker(target_occurred_at timestamptz,target_system_actor text)
returns void language plpgsql stable security definer set search_path=pg_catalog,app_private
as $$ begin
  if target_occurred_at is distinct from app_private.request_time() or app_private.required_setting('app.actor_kind')<>'SYSTEM'
    or app_private.required_setting('app.system_actor_id')<>target_system_actor then
    raise exception 'trusted document/file worker required' using errcode='42501';
  end if;
end $$;

create or replace function public.record_document_content_validation(
  target_evidence_id uuid,target_editor_schema_version text,target_content_checksum text,target_validator_id text,target_validator_version text,
  target_outcome text,target_audit_id uuid,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.m05_assert_worker(target_occurred_at,'DOCUMENT_VALIDATOR');
  insert into public.document_content_validation_evidence(id,editor_schema_version,content_checksum,validator_id,validator_version,outcome,validated_at)
    values(target_evidence_id,target_editor_schema_version,target_content_checksum,target_validator_id,target_validator_version,target_outcome,target_occurred_at);
  perform app_private.append_audit(target_audit_id,'document.content.validate','DOCUMENT_VALIDATION',target_evidence_id,0,
    case when target_outcome='VALID' then 'SUCCEEDED' else 'FAILED' end,target_outcome,null,null,target_content_checksum,null,target_occurred_at);
end $$;

create or replace function public.create_template_draft(
  target_template_id uuid,target_template_version_id uuid,target_template_code text,target_document_type text,target_editor_schema_version text,
  target_content_schema jsonb,target_template_content jsonb,target_checksum text,target_audit_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions
as $$ declare computed_checksum text; begin
  perform app_private.m05_assert_user_command(target_occurred_at,'document.template.manage');
  computed_checksum:=encode(extensions.digest(convert_to(target_content_schema::text||'|'||target_template_content::text,'UTF8'),'sha256'),'hex');
  if computed_checksum<>target_checksum then raise exception 'template checksum must match canonical schema and content' using errcode='23514'; end if;
  insert into public.template(id,template_code,document_type_id,status,row_version,created_by_user_id,created_at)
    values(target_template_id,target_template_code,target_document_type,'ACTIVE',1,app_private.current_effective_actor_user_id(),target_occurred_at);
  insert into public.template_version(id,template_id,version_no,state,editor_schema_version,content_schema,template_content,checksum,row_version,created_by_user_id,created_at)
    values(target_template_version_id,target_template_id,1,'DRAFT',target_editor_schema_version,target_content_schema,target_template_content,target_checksum,1,
      app_private.current_effective_actor_user_id(),target_occurred_at);
  perform app_private.append_audit(target_audit_id,'template.record.create','TEMPLATE_VERSION',target_template_version_id,1,'SUCCEEDED',null,null,null,target_checksum,null,target_occurred_at);
  return 1;
end $$;

create or replace function public.seal_template_version(
  target_template_version_id uuid,target_expected_version bigint,target_audit_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions
as $$ declare version_row public.template_version%rowtype; computed_checksum text; next_version bigint; begin
  perform app_private.m05_assert_user_command(target_occurred_at,'document.template.manage');
  select * into strict version_row from public.template_version where id=target_template_version_id for update;
  if version_row.state<>'DRAFT' then raise exception 'template version is not draft' using errcode='23514'; end if;
  computed_checksum:=encode(extensions.digest(convert_to(version_row.content_schema::text||'|'||version_row.template_content::text,'UTF8'),'sha256'),'hex');
  if computed_checksum<>version_row.checksum then raise exception 'template checksum mismatch' using errcode='23514'; end if;
  next_version:=app_private.next_version(version_row.row_version,target_expected_version);
  update public.template_version set state='SEALED',row_version=next_version where id=target_template_version_id;
  perform app_private.append_audit(target_audit_id,'template.version.seal','TEMPLATE_VERSION',target_template_version_id,next_version,'SUCCEEDED',null,null,null,computed_checksum,null,target_occurred_at);
  return next_version;
end $$;

create or replace function app_private.actor_has_document_scope(target_document_id uuid,target_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select app_private.approval_actor_is_internal(target_time) and exists(
    select 1 from public.document d where d.id=target_document_id and d.owner_user_id=app_private.current_effective_actor_user_id()
  )
$$;

create or replace function app_private.actor_can_read_document_version(target_document_version_id uuid,target_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select app_private.approval_actor_is_internal(target_time) and exists(
    select 1 from public.document_version v join public.document d on d.id=v.document_id
    where v.id=target_document_version_id and (
      d.owner_user_id=app_private.current_effective_actor_user_id() or exists(
        select 1 from public.approval_subject_document_version subject_link
        where subject_link.document_version_id=v.id and app_private.can_read_approval_instance(subject_link.instance_id,target_time)
      )
    )
  )
$$;

create or replace function app_private.actor_can_review_document_version(target_document_version_id uuid,target_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select app_private.approval_actor_is_internal(target_time) and exists(
    select 1 from public.document_version v join public.document d on d.id=v.document_id
    where v.id=target_document_version_id and (
      d.owner_user_id=app_private.current_effective_actor_user_id() or exists(
        select 1 from public.approval_subject_document_version subject_link
        join public.approval_step step on step.instance_id=subject_link.instance_id and step.state='ACTIVE'
        join public.approval_participant participant on participant.step_id=step.id
          and participant.participant_user_id=app_private.current_effective_actor_user_id() and participant.state='ACTIVE'
        join public.user_account actor_account on actor_account.id=participant.participant_user_id
          and actor_account.account_kind='INTERNAL' and actor_account.status='ACTIVE'
          and actor_account.valid_from<=target_time and (actor_account.valid_until is null or actor_account.valid_until>target_time)
        where subject_link.document_version_id=v.id
      )
    )
  )
$$;

create or replace function app_private.actor_has_security_entitlement(target_entitlement text,target_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select exists(select 1 from public.user_security_entitlement_assignment a join public.security_entitlement e on e.id=a.entitlement_id and e.status='ACTIVE'
    where a.user_id=app_private.current_effective_actor_user_id() and e.stable_code=target_entitlement and a.revoked_at is null
      and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time))
$$;

create or replace function app_private.actor_can_read_document_source(target_document_version_id uuid,target_permission text,target_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select app_private.actor_can_review_document_version(target_document_version_id,target_time)
    and app_private.actor_has_permission(target_permission,target_time)
    and exists(select 1 from public.document_version v where v.id=target_document_version_id and case v.security_level_snapshot
      when 'SEC_L3_CONFIDENTIAL' then app_private.actor_has_security_entitlement('ENTITLEMENT_L3_SOURCE_READ',target_time) or app_private.actor_has_security_entitlement('ENTITLEMENT_L4_SOURCE_READ',target_time)
      when 'SEC_L4_CORE_SECRET' then app_private.actor_has_security_entitlement('ENTITLEMENT_L4_SOURCE_READ',target_time)
      else true end)
$$;

create or replace function app_private.append_document_transition(
  target_audit_id uuid,target_transition_id uuid,target_action_id text,target_version_id uuid,target_resource_version bigint,
  target_event_id text,target_from_state text,target_to_state text,target_reason_code text,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.append_audit(target_audit_id,target_action_id,'DOCUMENT_VERSION',target_version_id,target_resource_version,'SUCCEEDED',target_reason_code,null,null,null,null,target_occurred_at);
  perform app_private.append_state_transition(target_transition_id,target_audit_id,'DOCUMENT_VERSION',target_version_id,'SM-DOCUMENT-V1',target_event_id,
    target_from_state,target_to_state,target_resource_version-1,target_resource_version,target_reason_code,null,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_occurred_at);
end $$;

create or replace function app_private.enqueue_document_event(
  target_outbox_id uuid,target_audit_id uuid,target_event_id text,target_version_id uuid,target_resource_version bigint,target_state text,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.enqueue_outbox(target_outbox_id,target_audit_id,target_event_id,'DOCUMENT_VERSION',target_version_id,target_resource_version,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),'DOCUMENT_EVENT_REF',1,
    jsonb_build_object('documentVersionId',target_version_id,'resourceVersion',target_resource_version,'state',target_state),
    'document:'||target_version_id::text||':'||target_resource_version::text,target_occurred_at,target_occurred_at);
end $$;

create or replace function app_private.append_attachment_transition(
  target_audit_id uuid,target_transition_id uuid,target_action_id text,target_attachment_id uuid,target_resource_version bigint,
  target_event_id text,target_from_state text,target_to_state text,target_reason_code text,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.append_audit(target_audit_id,target_action_id,'ATTACHMENT',target_attachment_id,target_resource_version,'SUCCEEDED',target_reason_code,null,null,null,null,target_occurred_at);
  perform app_private.append_state_transition(target_transition_id,target_audit_id,'ATTACHMENT',target_attachment_id,'SM-ATTACHMENT-V1',target_event_id,
    target_from_state,target_to_state,target_resource_version-1,target_resource_version,target_reason_code,null,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_occurred_at);
end $$;

create or replace function app_private.enqueue_attachment_event(
  target_outbox_id uuid,target_audit_id uuid,target_event_id text,target_attachment_id uuid,target_resource_version bigint,target_state text,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.enqueue_outbox(target_outbox_id,target_audit_id,target_event_id,'ATTACHMENT',target_attachment_id,target_resource_version,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),'ATTACHMENT_EVENT_REF',1,
    jsonb_build_object('attachmentId',target_attachment_id,'resourceVersion',target_resource_version,'state',target_state),
    'attachment:'||target_attachment_id::text||':'||target_resource_version::text,target_occurred_at,target_occurred_at);
end $$;

create or replace function public.create_document_approval_instance(
  target_instance_id uuid,target_policy_version_id uuid,target_policy_checksum text,target_document_version_id uuid,
  target_prior_instance_id uuid,target_generation bigint,target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare policy_row public.approval_policy_version%rowtype; version_row public.document_version%rowtype; begin
  perform app_private.assert_approval_request(target_occurred_at,'approval.instance.submit');
  perform app_private.m05_assert_user_command(target_occurred_at,'document.version.submit');
  if app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id() or app_private.current_acting_authority_id() is not null then
    raise exception 'delegated document submission is not allowed' using errcode='42501';
  end if;
  select v.* into strict policy_row from public.approval_policy_version v join public.approval_policy p on p.id=v.policy_id
    where v.id=target_policy_version_id and p.status='ACTIVE' and v.state='PUBLISHED' and v.subject_kind='DOCUMENT_VERSION'
      and v.checksum=target_policy_checksum and v.valid_from<=target_occurred_at and (v.valid_until is null or v.valid_until>target_occurred_at) for share;
  select * into strict version_row from public.document_version where id=target_document_version_id for update;
  if version_row.state<>'REVIEW_READY' or version_row.sealed_snapshot_checksum is null or version_row.sealed_at is null
    or not app_private.actor_has_document_scope(version_row.document_id,target_occurred_at) then
    raise exception 'exact sealed document version submission denied' using errcode='42501';
  end if;
  if (target_prior_instance_id is null and target_generation<>1) or (target_prior_instance_id is not null and not exists(
    select 1 from public.approval_instance previous_instance
    join public.approval_subject_document_version previous_subject on previous_subject.instance_id=previous_instance.id
    where previous_instance.id=target_prior_instance_id and previous_instance.state in ('REJECTED','RECALLED')
      and previous_instance.generation+1=target_generation and previous_subject.document_id=version_row.document_id
      and previous_subject.document_version_id=version_row.prior_version_id and previous_subject.subject_version_no=version_row.prior_version_no
      and previous_subject.subject_version_no<version_row.version_no
  )) then raise exception 'invalid document approval generation chain' using errcode='23514'; end if;
  insert into public.approval_instance(id,policy_version_id,policy_version_no,policy_checksum_snapshot,submitter_user_id,prior_instance_id,generation,state,version_no,created_at)
    values(target_instance_id,target_policy_version_id,policy_row.version_no,target_policy_checksum,app_private.current_effective_actor_user_id(),
      target_prior_instance_id,target_generation,'DRAFT',1,target_occurred_at);
  insert into public.approval_subject_document_version(instance_id,document_version_id,document_id,subject_version_no,subject_checksum,subject_sealed_at)
    values(target_instance_id,version_row.id,version_row.document_id,version_row.version_no,version_row.sealed_snapshot_checksum,version_row.sealed_at);
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,'approval.instance.create',target_instance_id,1,
    'EVT-APPROVAL-CREATE',null,'DRAFT',null,target_occurred_at);
  insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,occurred_at)
    values(target_action_record_id,target_instance_id,target_audit_id,'CREATE','USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),target_occurred_at);
  return 1;
end $$;

create or replace function public.create_document_draft(
  target_document_id uuid,target_version_id uuid,target_document_no text,target_document_type text,target_title text,target_organization_id uuid,
  target_security_level text,target_retention_policy text,target_template_source text,target_template_version_id uuid,target_editor_schema_version text,
  target_content_validation_evidence_id uuid,target_renderer_id text,target_renderer_version text,target_editor_content jsonb,target_content_checksum text,
  target_reason_code text,target_audit_id uuid,target_transition_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare template_row public.template_version%rowtype; begin
  perform app_private.m05_assert_user_command(target_occurred_at,'document.version.create');
  if app_private.canonical_json_sha256(target_editor_content)<>target_content_checksum then
    raise exception 'content checksum must match canonical JSON bytes' using errcode='23514';
  end if;
  if app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id() or not exists(
    select 1 from public.user_organization_assignment a where a.user_id=app_private.current_effective_actor_user_id() and a.organization_id=target_organization_id
      and a.revoked_at is null and a.valid_from<=target_occurred_at and (a.valid_until is null or a.valid_until>target_occurred_at)) then
    raise exception 'document owner organization scope denied' using errcode='42501';
  end if;
  if target_template_source='TEMPLATE_VERSION' then
    select v.* into strict template_row from public.template_version v join public.template t on t.id=v.template_id
      where v.id=target_template_version_id and v.state='SEALED' and t.status='ACTIVE' and t.document_type_id=target_document_type;
    if template_row.editor_schema_version<>target_editor_schema_version then raise exception 'editor schema must match sealed template snapshot' using errcode='23514'; end if;
  elsif target_template_source='FREE_FORM' and target_template_version_id is null then null;
  else raise exception 'invalid template source' using errcode='23514'; end if;
  insert into public.document(id,document_no,document_type_id,title,owner_organization_id,owner_user_id,security_level,retention_policy_id,
    current_version_id,current_version_no,lifecycle_state,row_version,created_at,updated_at)
  values(target_document_id,target_document_no,target_document_type,target_title,target_organization_id,app_private.current_effective_actor_user_id(),target_security_level,
    target_retention_policy,target_version_id,1,'DRAFT',1,target_occurred_at,target_occurred_at);
  insert into public.document_version(id,document_id,version_no,template_source,template_version_id,template_id_snapshot,template_version_no,template_checksum,
    editor_schema_version,content_validation_evidence_id,renderer_id,renderer_version,security_level_snapshot,editor_content,content_checksum,creation_reason_code,author_user_id,state,row_version,created_at)
  values(target_version_id,target_document_id,1,target_template_source,case when target_template_source='TEMPLATE_VERSION' then template_row.id end,
    case when target_template_source='TEMPLATE_VERSION' then template_row.template_id end,case when target_template_source='TEMPLATE_VERSION' then template_row.version_no end,
    case when target_template_source='TEMPLATE_VERSION' then template_row.checksum end,target_editor_schema_version,target_content_validation_evidence_id,
    target_renderer_id,target_renderer_version,target_security_level,target_editor_content,target_content_checksum,target_reason_code,
    app_private.current_effective_actor_user_id(),'DRAFT',1,target_occurred_at);
  perform app_private.append_document_transition(target_audit_id,target_transition_id,'document.record.create',target_version_id,1,'EVT-DOCUMENT-CREATE',null,'DRAFT',target_reason_code,target_occurred_at);
  return 1;
end $$;

create or replace function public.edit_document_draft(
  target_version_id uuid,target_expected_version bigint,target_editor_content jsonb,target_content_checksum text,target_content_validation_evidence_id uuid,target_renderer_version text,
  target_audit_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare version_row public.document_version%rowtype; next_version bigint; begin
  perform app_private.m05_assert_user_command(target_occurred_at,'document.version.edit');
  if app_private.canonical_json_sha256(target_editor_content)<>target_content_checksum then
    raise exception 'content checksum must match canonical JSON bytes' using errcode='23514';
  end if;
  select * into strict version_row from public.document_version where id=target_version_id for update;
  if version_row.state<>'DRAFT' or version_row.author_user_id<>app_private.current_effective_actor_user_id()
    or not app_private.actor_has_document_scope(version_row.document_id,target_occurred_at) then raise exception 'editable document draft denied' using errcode='42501'; end if;
  next_version:=app_private.next_version(version_row.row_version,target_expected_version);
  update public.document_version set editor_content=target_editor_content,content_checksum=target_content_checksum,
    content_validation_evidence_id=target_content_validation_evidence_id,renderer_version=target_renderer_version,row_version=next_version
    where id=target_version_id;
  perform app_private.append_audit(target_audit_id,'document.version.edit','DOCUMENT_VERSION',target_version_id,next_version,'SUCCEEDED',null,null,null,target_content_checksum,null,target_occurred_at);
  return next_version;
end $$;

create or replace function public.update_document_draft_security(
  target_version_id uuid,target_expected_version bigint,target_expected_document_version bigint,target_security_level text,target_audit_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare version_row public.document_version%rowtype; document_row public.document%rowtype; next_version bigint; next_document_version bigint; begin
  perform app_private.m05_assert_user_command(target_occurred_at,'document.version.edit');
  select * into strict version_row from public.document_version where id=target_version_id for update;
  select * into strict document_row from public.document where id=version_row.document_id for update;
  if version_row.state<>'DRAFT' or document_row.current_version_id<>version_row.id
    or not app_private.actor_has_document_scope(document_row.id,target_occurred_at) then raise exception 'draft security update denied' using errcode='42501'; end if;
  if exists(select 1 from public.document_attachment l where l.document_version_id=version_row.id and l.link_state='ACTIVE') then
    raise exception 'remove active attachments before changing draft security' using errcode='23514';
  end if;
  next_version:=app_private.next_version(version_row.row_version,target_expected_version);
  next_document_version:=app_private.next_version(document_row.row_version,target_expected_document_version);
  perform set_config('app.document_transition','SECURITY_UPDATE',true);
  update public.document_version set security_level_snapshot=target_security_level,row_version=next_version where id=version_row.id;
  update public.document set security_level=target_security_level,row_version=next_document_version,updated_at=target_occurred_at where id=document_row.id;
  perform app_private.append_audit(target_audit_id,'document.record.security.change','DOCUMENT_VERSION',version_row.id,next_version,'SUCCEEDED',target_security_level,
    null,null,null,null,target_occurred_at);
  return next_version;
end $$;

create or replace function public.create_document_revision(
  target_prior_version_id uuid,target_new_version_id uuid,target_new_version_no bigint,target_expected_document_version bigint,
  target_content_validation_evidence_id uuid,target_renderer_version text,target_editor_content jsonb,target_content_checksum text,
  target_reason_code text,target_audit_id uuid,target_transition_id uuid,target_supersede_audit_id uuid,target_supersede_transition_id uuid,
  target_supersede_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare prior_row public.document_version%rowtype; document_row public.document%rowtype; begin
  perform app_private.m05_assert_user_command(target_occurred_at,'document.version.edit');
  if app_private.canonical_json_sha256(target_editor_content)<>target_content_checksum then
    raise exception 'content checksum must match canonical JSON bytes' using errcode='23514';
  end if;
  if target_reason_code is null then raise exception 'revision reason required' using errcode='23514'; end if;
  select * into strict prior_row from public.document_version where id=target_prior_version_id for update;
  select * into strict document_row from public.document where id=prior_row.document_id for update;
  if prior_row.state not in ('REJECTED','RECALLED','APPROVED') or document_row.current_version_id<>prior_row.id
    or target_new_version_no<>prior_row.version_no+1 or not app_private.actor_has_document_scope(prior_row.document_id,target_occurred_at) then
    raise exception 'revision must be a strictly newer version of the exact current rejected, recalled or approved version' using errcode='23514';
  end if;
  perform app_private.next_version(document_row.row_version,target_expected_document_version);
  insert into public.document_version(id,document_id,version_no,prior_version_id,prior_version_no,template_source,template_version_id,template_id_snapshot,
    template_version_no,template_checksum,editor_schema_version,content_validation_evidence_id,renderer_id,renderer_version,security_level_snapshot,editor_content,content_checksum,
    creation_reason_code,author_user_id,state,row_version,created_at)
  values(target_new_version_id,prior_row.document_id,target_new_version_no,prior_row.id,prior_row.version_no,prior_row.template_source,prior_row.template_version_id,
    prior_row.template_id_snapshot,prior_row.template_version_no,prior_row.template_checksum,prior_row.editor_schema_version,target_content_validation_evidence_id,
    prior_row.renderer_id,target_renderer_version,prior_row.security_level_snapshot,target_editor_content,target_content_checksum,target_reason_code,app_private.current_effective_actor_user_id(),'DRAFT',1,target_occurred_at);
  if prior_row.state='APPROVED' then
    perform set_config('app.document_transition','SUPERSEDE',true);
    update public.document_version set state='SUPERSEDED',superseded_by_version_id=target_new_version_id,row_version=row_version+1,decided_at=target_occurred_at
      where id=prior_row.id;
    perform app_private.append_document_transition(target_supersede_audit_id,target_supersede_transition_id,'document.version.supersede',prior_row.id,
      prior_row.row_version+1,'EVT-DOCUMENT-REVISE','APPROVED','SUPERSEDED',target_reason_code,target_occurred_at);
    perform app_private.enqueue_document_event(target_supersede_outbox_id,target_supersede_audit_id,'EVT-DOCUMENT-SUPERSEDED',prior_row.id,
      prior_row.row_version+1,'SUPERSEDED',target_occurred_at);
  end if;
  perform set_config('app.document_transition','REVISE',true);
  update public.document set current_version_id=target_new_version_id,current_version_no=target_new_version_no,lifecycle_state='DRAFT',
    row_version=row_version+1,updated_at=target_occurred_at where id=prior_row.document_id;
  perform app_private.append_document_transition(target_audit_id,target_transition_id,'document.record.create',target_new_version_id,1,
    'EVT-DOCUMENT-CREATE',null,'DRAFT',target_reason_code,target_occurred_at);
  return 1;
end $$;

create or replace function public.remove_document_attachment(
  target_document_version_id uuid,target_attachment_id uuid,target_expected_link_version bigint,target_reason_code text,target_audit_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare link_row public.document_attachment%rowtype; version_row public.document_version%rowtype; begin
  perform app_private.m05_assert_user_command(target_occurred_at,'file.attachment.upload');
  if target_reason_code is null then raise exception 'attachment removal reason required' using errcode='23514'; end if;
  select * into strict version_row from public.document_version where id=target_document_version_id for update;
  select * into strict link_row from public.document_attachment l
    where l.document_version_id=target_document_version_id and l.attachment_id=target_attachment_id for update;
  if link_row.link_state<>'ACTIVE' or link_row.row_version<>target_expected_link_version
    or version_row.state<>'DRAFT' or not app_private.actor_has_document_scope(version_row.document_id,target_occurred_at) then raise exception 'active draft attachment removal denied' using errcode='42501'; end if;
  perform set_config('app.document_attachment_transition','REMOVE',true);
  update public.document_attachment set link_state='REMOVED',row_version=row_version+1,removed_by_user_id=app_private.current_effective_actor_user_id(),
    removed_at=target_occurred_at,removal_reason_code=target_reason_code
    where document_version_id=target_document_version_id and attachment_id=target_attachment_id;
  perform app_private.append_audit(target_audit_id,'file.attachment.remove','DOCUMENT_VERSION',target_document_version_id,link_row.row_version+1,
    'SUCCEEDED',target_reason_code,null,null,null,null,target_occurred_at);
  return link_row.row_version+1;
end $$;

create or replace function public.seal_document_version(
  target_version_id uuid,target_expected_version bigint,target_expected_document_version bigint,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_sealed_manifest_evidence_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions
as $$ declare version_row public.document_version%rowtype; document_row public.document%rowtype; next_version bigint; manifest_hash text; begin
  perform app_private.m05_assert_user_command(target_occurred_at,'document.version.seal');
  select * into strict version_row from public.document_version where id=target_version_id for update;
  select * into strict document_row from public.document where id=version_row.document_id for update;
  if version_row.state<>'DRAFT' or document_row.current_version_id<>target_version_id or version_row.security_level_snapshot<>document_row.security_level
    or version_row.author_user_id<>app_private.current_effective_actor_user_id()
    or not app_private.actor_has_document_scope(version_row.document_id,target_occurred_at) then raise exception 'document seal denied' using errcode='42501'; end if;
  perform 1 from public.document_attachment l where l.document_version_id=target_version_id and l.link_state='ACTIVE' for update;
  perform 1 from public.attachment a join public.document_attachment l on l.attachment_id=a.id
    where l.document_version_id=target_version_id and l.link_state='ACTIVE' for update of a;
  if exists(select 1 from public.document_attachment l join public.attachment a on a.id=l.attachment_id
    where l.document_version_id=target_version_id and l.link_state='ACTIVE' and a.state<>'AVAILABLE') then
    raise exception 'all linked attachments must be verified AVAILABLE before seal' using errcode='23514';
  end if;
  select encode(extensions.digest(convert_to(concat_ws('|','DOCUMENT_SEALED_MANIFEST','1',version_row.content_checksum,version_row.editor_schema_version,
    version_row.template_source,coalesce(version_row.template_version_id::text,''),coalesce(version_row.template_checksum,''),version_row.renderer_id,version_row.renderer_version,
    version_row.security_level_snapshot,
    coalesce(string_agg(l.purpose_code||':'||a.id::text||':'||a.detected_mime_type||':'||a.detected_size_bytes::text||':'||a.security_level||':'||a.detected_sha256||':'||a.scan_evidence_id::text,
      '|' order by l.purpose_code,a.id) filter(where l.link_state='ACTIVE'),'EMPTY')),'UTF8'),'sha256'),'hex')
    into manifest_hash from public.document_attachment l join public.attachment a on a.id=l.attachment_id where l.document_version_id=target_version_id;
  next_version:=app_private.next_version(version_row.row_version,target_expected_version);
  perform app_private.next_version(document_row.row_version,target_expected_document_version);
  perform set_config('app.document_transition','SEAL',true);
  insert into public.document_seal_evidence(id,document_version_id,document_id,version_no,manifest_schema,manifest_version,manifest_checksum,sealed_at)
    values(target_sealed_manifest_evidence_id,target_version_id,version_row.document_id,version_row.version_no,'DOCUMENT_SEALED_MANIFEST',1,manifest_hash,target_occurred_at);
  update public.document_version set state='REVIEW_READY',sealed_manifest_schema='DOCUMENT_SEALED_MANIFEST',sealed_manifest_version=1,
    sealed_snapshot_checksum=manifest_hash,sealed_manifest_evidence_id=target_sealed_manifest_evidence_id,sealed_at=target_occurred_at,row_version=next_version where id=target_version_id;
  update public.document set lifecycle_state='REVIEW_READY',row_version=row_version+1,updated_at=target_occurred_at where id=document_row.id;
  perform app_private.append_document_transition(target_audit_id,target_transition_id,'document.version.seal',target_version_id,next_version,
    'EVT-DOCUMENT-SEAL','DRAFT','REVIEW_READY',null,target_occurred_at);
  perform app_private.enqueue_document_event(target_outbox_id,target_audit_id,'EVT-DOCUMENT-SEALED',target_version_id,next_version,'REVIEW_READY',target_occurred_at);
  return next_version;
end $$;

create or replace function public.create_attachment_upload_intent(
  target_attachment_id uuid,target_document_version_id uuid,target_purpose_code text,target_declared_mime_type text,target_declared_size_bytes bigint,
  target_expected_sha256 text,target_ttl_seconds integer,target_audit_id uuid,target_transition_id uuid,target_occurred_at timestamptz
) returns table(attachment_id uuid,storage_provider text,bucket_code text,storage_key text,intent_expires_at timestamptz,resource_version bigint)
language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare version_row public.document_version%rowtype; document_row public.document%rowtype; generated_key text; expires_at timestamptz; begin
  perform app_private.m05_assert_user_command(target_occurred_at,'file.attachment.upload');
  select * into strict version_row from public.document_version where id=target_document_version_id for update;
  select * into strict document_row from public.document where id=version_row.document_id for share;
  if version_row.state<>'DRAFT' or not app_private.actor_has_document_scope(document_row.id,target_occurred_at) then raise exception 'attachment upload target denied' using errcode='42501'; end if;
  if target_ttl_seconds not between 30 and 300 then raise exception 'upload intent TTL out of range' using errcode='22023'; end if;
  if not exists(select 1 from public.file_mime_type_definition m where m.mime_type=lower(target_declared_mime_type) and m.status='ACTIVE') then raise exception 'declared MIME type is not allowed' using errcode='23514'; end if;
  generated_key:='private/documents/'||document_row.id::text||'/'||version_row.id::text||'/'||target_attachment_id::text;
  expires_at:=target_occurred_at+make_interval(secs=>target_ttl_seconds);
  insert into public.attachment(id,storage_provider,bucket_code,storage_key,declared_mime_type,declared_size_bytes,expected_sha256,
    security_level,uploader_user_id,state,row_version,intent_expires_at,created_at)
  values(target_attachment_id,'SUPABASE_PRIVATE','PRIVATE_BUSINESS',generated_key,lower(target_declared_mime_type),target_declared_size_bytes,target_expected_sha256,
    version_row.security_level_snapshot,app_private.current_effective_actor_user_id(),'UPLOAD_INTENDED',1,expires_at,target_occurred_at);
  insert into public.document_attachment(document_version_id,attachment_id,purpose_code,linked_by_user_id,linked_at)
    values(target_document_version_id,target_attachment_id,target_purpose_code,app_private.current_effective_actor_user_id(),target_occurred_at);
  perform app_private.append_attachment_transition(target_audit_id,target_transition_id,'file.attachment.intent',target_attachment_id,1,
    'EVT-ATTACHMENT-INTEND',null,'UPLOAD_INTENDED',null,target_occurred_at);
  return query select target_attachment_id,'SUPABASE_PRIVATE'::text,'PRIVATE_BUSINESS'::text,generated_key,expires_at,1::bigint;
end $$;

create or replace function public.record_attachment_uploaded(
  target_attachment_id uuid,target_expected_version bigint,target_detected_mime_type text,target_detected_size_bytes bigint,target_detected_sha256 text,
  target_audit_id uuid,target_transition_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare attachment_row public.attachment%rowtype; next_version bigint; begin
  perform app_private.m05_assert_worker(target_occurred_at,'FILE_INGEST');
  select * into strict attachment_row from public.attachment where id=target_attachment_id for update;
  if attachment_row.state<>'UPLOAD_INTENDED' or attachment_row.intent_expires_at<=target_occurred_at then raise exception 'upload intent missing or expired' using errcode='23514'; end if;
  next_version:=app_private.next_version(attachment_row.row_version,target_expected_version);
  perform set_config('app.attachment_transition','UPLOADED',true);
  update public.attachment set state='UPLOADED',detected_mime_type=lower(target_detected_mime_type),detected_size_bytes=target_detected_size_bytes,
    detected_sha256=target_detected_sha256,verified_at=target_occurred_at,row_version=next_version where id=target_attachment_id;
  perform app_private.append_attachment_transition(target_audit_id,target_transition_id,'file.attachment.verify',target_attachment_id,next_version,
    'EVT-ATTACHMENT-UPLOADED','UPLOAD_INTENDED','UPLOADED',null,target_occurred_at);
  return next_version;
end $$;

create or replace function public.start_attachment_scan(
  target_attachment_id uuid,target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare attachment_row public.attachment%rowtype; next_version bigint; begin
  perform app_private.m05_assert_worker(target_occurred_at,'FILE_SCANNER');
  select * into strict attachment_row from public.attachment where id=target_attachment_id for update;
  if attachment_row.state<>'UPLOADED' then raise exception 'attachment is not uploaded' using errcode='23514'; end if;
  next_version:=app_private.next_version(attachment_row.row_version,target_expected_version);
  perform set_config('app.attachment_transition','SCANNING',true);
  update public.attachment set state='SCANNING',row_version=next_version where id=target_attachment_id;
  perform app_private.append_attachment_transition(target_audit_id,target_transition_id,'file.attachment.verify',target_attachment_id,next_version,
    'EVT-ATTACHMENT-SCAN','UPLOADED','SCANNING',null,target_occurred_at);
  return next_version;
end $$;

create or replace function public.complete_attachment_scan(
  target_attachment_id uuid,target_expected_version bigint,target_signature_validation text,target_scanner_id text,target_scanner_version text,target_scanner_evidence_id uuid,target_scan_verdict text,
  target_quarantine_reason_code text,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare attachment_row public.attachment%rowtype; next_version bigint; target_state text; target_event text; target_domain_event text; begin
  perform app_private.m05_assert_worker(target_occurred_at,'FILE_SCANNER');
  select * into strict attachment_row from public.attachment where id=target_attachment_id for update;
  if attachment_row.state<>'SCANNING' then raise exception 'attachment is not scanning' using errcode='23514'; end if;
  next_version:=app_private.next_version(attachment_row.row_version,target_expected_version);
  if target_signature_validation='MATCH' and target_scan_verdict='CLEAN' and attachment_row.declared_mime_type=attachment_row.detected_mime_type
    and attachment_row.declared_size_bytes=attachment_row.detected_size_bytes and attachment_row.expected_sha256=attachment_row.detected_sha256
    and target_quarantine_reason_code is null then
    target_state:='AVAILABLE'; target_event:='EVT-ATTACHMENT-AVAILABLE'; target_domain_event:='EVT-ATTACHMENT-AVAILABLE';
  else
    target_state:='QUARANTINED'; target_event:='EVT-ATTACHMENT-QUARANTINE'; target_domain_event:='EVT-ATTACHMENT-QUARANTINED';
    if target_quarantine_reason_code is null then raise exception 'quarantine reason required' using errcode='23514'; end if;
  end if;
  insert into public.file_scan_evidence(id,attachment_id,detected_sha256,scanner_id,scanner_version,verdict,scanned_at)
    values(target_scanner_evidence_id,target_attachment_id,attachment_row.detected_sha256,target_scanner_id,target_scanner_version,target_scan_verdict,target_occurred_at);
  perform set_config('app.attachment_transition',target_state,true);
  update public.attachment set state=target_state,signature_validation=target_signature_validation,scanner_id=target_scanner_id,scanner_version=target_scanner_version,
    scan_evidence_id=target_scanner_evidence_id,scan_verdict=target_scan_verdict,quarantine_reason_code=target_quarantine_reason_code,scanned_at=target_occurred_at,row_version=next_version
    where id=target_attachment_id;
  perform app_private.append_attachment_transition(target_audit_id,target_transition_id,
    case when target_state='AVAILABLE' then 'file.attachment.verify' else 'file.attachment.quarantine' end,target_attachment_id,next_version,
    target_event,'SCANNING',target_state,target_quarantine_reason_code,target_occurred_at);
  perform app_private.enqueue_attachment_event(target_outbox_id,target_audit_id,target_domain_event,target_attachment_id,next_version,target_state,target_occurred_at);
  return next_version;
end $$;

create or replace function public.request_document_content(
  target_document_version_id uuid,target_audit_id uuid,target_occurred_at timestamptz
) returns table(allowed boolean,reason_code text,editor_schema_version text,renderer_version text,editor_content jsonb,content_checksum text)
language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare version_row public.document_version%rowtype; denial text; begin
  if target_occurred_at is distinct from app_private.request_time() or app_private.required_setting('app.actor_kind')<>'USER' then raise exception 'trusted request context required' using errcode='42501'; end if;
  select * into version_row from public.document_version where id=target_document_version_id;
  if not found then denial:='DOCUMENT_VERSION_NOT_FOUND';
  elsif version_row.state not in ('DRAFT','REVIEW_READY','APPROVAL_PENDING','APPROVED','RETENTION_HOLD') then denial:='DOCUMENT_CONTENT_STATE_DENIED';
  elsif not app_private.actor_can_read_document_source(version_row.id,'technical_document.content.preview',target_occurred_at) then denial:='DOCUMENT_CONTENT_AUTHZ_DENIED';
  end if;
  if denial is not null then
    perform app_private.append_audit(target_audit_id,'technical_document.content.preview','DOCUMENT_VERSION',target_document_version_id,coalesce(version_row.row_version,0),'FAILED',denial,null,null,null,null,target_occurred_at);
    return query select false,denial,null::text,null::text,null::jsonb,null::text;
  else
    perform app_private.append_audit(target_audit_id,'technical_document.content.preview','DOCUMENT_VERSION',target_document_version_id,version_row.row_version,'SUCCEEDED',null,null,null,version_row.content_checksum,null,target_occurred_at);
    return query select true,null::text,version_row.editor_schema_version,version_row.renderer_version,version_row.editor_content,version_row.content_checksum;
  end if;
end $$;

create or replace function public.request_attachment_delivery(
  target_attachment_id uuid,target_document_version_id uuid,target_operation text,target_ttl_seconds integer,target_audit_id uuid,target_occurred_at timestamptz
) returns table(allowed boolean,reason_code text,storage_provider text,bucket_code text,storage_key text,mime_type text,size_bytes bigint,sha256 text,expires_at timestamptz)
language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare attachment_row public.attachment%rowtype; document_id_value uuid; denial text; begin
  if target_occurred_at is distinct from app_private.request_time() or app_private.required_setting('app.actor_kind')<>'USER' then raise exception 'trusted request context required' using errcode='42501'; end if;
  select a.* into attachment_row from public.attachment a where a.id=target_attachment_id;
  select v.document_id into document_id_value from public.document_attachment l join public.document_version v on v.id=l.document_version_id
    where l.attachment_id=target_attachment_id and l.document_version_id=target_document_version_id;
  if attachment_row.id is null or document_id_value is null then denial:='ATTACHMENT_VERSION_NOT_FOUND';
  elsif target_operation not in ('PREVIEW','DOWNLOAD') then denial:='ATTACHMENT_OPERATION_DENIED';
  elsif target_ttl_seconds not between 1 and 300 then denial:='ATTACHMENT_TTL_DENIED';
  elsif attachment_row.state<>'AVAILABLE' then denial:='ATTACHMENT_NOT_AVAILABLE';
  elsif not app_private.actor_can_read_document_source(target_document_version_id,'technical_document.content.download',target_occurred_at) then denial:='ATTACHMENT_AUTHZ_DENIED';
  end if;
  if denial is not null then
    perform app_private.append_audit(target_audit_id,'file.attachment.delivery','ATTACHMENT',target_attachment_id,coalesce(attachment_row.row_version,0),'FAILED',denial,null,null,null,null,target_occurred_at);
    return query select false,denial,null::text,null::text,null::text,null::text,null::bigint,null::text,null::timestamptz;
  else
    perform app_private.append_audit(target_audit_id,'file.attachment.delivery','ATTACHMENT',target_attachment_id,attachment_row.row_version,'SUCCEEDED',target_operation,null,null,attachment_row.detected_sha256,null,target_occurred_at);
    return query select true,null::text,attachment_row.storage_provider,attachment_row.bucket_code,attachment_row.storage_key,attachment_row.detected_mime_type,
      attachment_row.detected_size_bytes,attachment_row.detected_sha256,target_occurred_at+make_interval(secs=>target_ttl_seconds);
  end if;
end $$;

-- Approval remains the process aggregate; this adapter applies the exact typed
-- DocumentVersion snapshot in the same transaction as the ApprovalInstance
-- transition. Any later failure (including Approval outbox) rolls both back.
create or replace function app_private.apply_document_approval_transition()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions
as $$ declare link_row public.approval_subject_document_version%rowtype; version_row public.document_version%rowtype;
  target_state text; target_action text; target_transition text; target_outbox text; next_version bigint; begin
  if new.state=old.state then return new; end if;
  select * into link_row from public.approval_subject_document_version where instance_id=new.id;
  if not found then return new; end if;
  select * into strict version_row from public.document_version where id=link_row.document_version_id for update;
  if version_row.version_no<>link_row.subject_version_no or version_row.sealed_snapshot_checksum<>link_row.subject_checksum
    or version_row.sealed_at<>link_row.subject_sealed_at then raise exception 'exact document approval subject changed' using errcode='23514'; end if;
  if old.state='DRAFT' and new.state='SUBMITTED' then
    if version_row.state<>'REVIEW_READY' or version_row.approval_instance_id is not null then raise exception 'document is not review-ready for exact approval submission' using errcode='23514'; end if;
    target_state:='APPROVAL_PENDING'; target_action:='document.version.submit'; target_transition:='EVT-DOCUMENT-SUBMIT'; target_outbox:='EVT-DOCUMENT-SUBMITTED';
    perform set_config('app.document_transition','SUBMIT',true);
    update public.document_version set state=target_state,approval_instance_id=new.id,row_version=row_version+1 where id=version_row.id;
  elsif old.state='IN_PROGRESS' and new.state in ('COMPLETED','REJECTED') then
    if version_row.state<>'APPROVAL_PENDING' or version_row.approval_instance_id<>new.id then raise exception 'document approval outcome does not match pending instance' using errcode='23514'; end if;
    if new.state='COMPLETED' then target_state:='APPROVED'; target_action:='document.version.approve'; target_transition:='EVT-DOCUMENT-APPROVE'; target_outbox:='EVT-DOCUMENT-APPROVED';
    else target_state:='REJECTED'; target_action:='document.version.reject'; target_transition:='EVT-DOCUMENT-REJECT'; target_outbox:='EVT-DOCUMENT-REJECTED'; end if;
    perform set_config('app.document_transition',target_state,true);
    update public.document_version set state=target_state,decided_at=app_private.request_time(),row_version=row_version+1 where id=version_row.id;
  elsif old.state='RECALL_REQUESTED' and new.state='RECALLED' then
    if version_row.state<>'APPROVAL_PENDING' or version_row.approval_instance_id<>new.id then raise exception 'document recall does not match pending instance' using errcode='23514'; end if;
    target_state:='RECALLED'; target_action:='document.version.recall'; target_transition:='EVT-DOCUMENT-RECALL'; target_outbox:='EVT-DOCUMENT-RECALLED';
    perform set_config('app.document_transition','RECALLED',true);
    update public.document_version set state=target_state,decided_at=app_private.request_time(),row_version=row_version+1 where id=version_row.id;
  else
    return new;
  end if;
  next_version:=version_row.row_version+1;
  update public.document set lifecycle_state=target_state,row_version=row_version+1,updated_at=app_private.request_time()
    where id=version_row.document_id and current_version_id=version_row.id;
  if not found then raise exception 'document approval subject is not current exact version' using errcode='23514'; end if;
  perform app_private.append_document_transition(extensions.gen_random_uuid(),extensions.gen_random_uuid(),target_action,version_row.id,next_version,
    target_transition,version_row.state,target_state,null,app_private.request_time());
  perform app_private.enqueue_document_event(extensions.gen_random_uuid(),
    (select audit_log_id from public.state_transition_history where aggregate_type='DOCUMENT_VERSION' and aggregate_id=version_row.id and to_version=next_version),
    target_outbox,version_row.id,next_version,target_state,app_private.request_time());
  return new;
end $$;
create trigger approval_instance_document_subject_apply after update of state on public.approval_instance
  for each row execute function app_private.apply_document_approval_transition();

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
       or (s.subject_kind='DOCUMENT_VERSION' and s.subject_state='REVIEW_READY')) then
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

create or replace function public.perform_document_approval_action(
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
  if not exists(select 1 from public.approval_subject_document_version where instance_id=target_instance_id) then raise exception 'document approval command requires exact document subject' using errcode='23514'; end if;
  perform set_config('app.document_approval_command_instance',target_instance_id::text,true);
  select * into strict step_row from public.approval_step where id=target_step_id and instance_id=target_instance_id for update;
  select * into strict participant_row from public.approval_participant where id=target_participant_id and step_id=target_step_id for update;
  next_version:=app_private.next_version(instance_row.version_no,target_expected_instance_version);
  perform app_private.next_version(step_row.version_no,target_expected_step_version);
  perform app_private.next_version(participant_row.version_no,target_expected_participant_version);
  if instance_row.state<>'IN_PROGRESS' or step_row.state<>'ACTIVE' or participant_row.state<>'ACTIVE'
    or participant_row.participant_user_id<>app_private.current_effective_actor_user_id() then raise exception 'actor is not the active exact participant' using errcode='42501'; end if;
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
  elsif selected_authority is not null then raise exception 'acting authority cannot be attached to a direct action' using errcode='42501'; end if;
  update public.approval_participant set state='ACTED',version_no=version_no+1 where id=target_participant_id;
  if target_event='REJECT' then
    update public.approval_step set state=case when id=target_step_id then 'REJECTED' else 'CANCELLED' end,version_no=version_no+1
      where instance_id=target_instance_id and state in ('WAITING','ACTIVE');
    update public.approval_participant set state='CANCELLED',version_no=version_no+1
      where step_id in(select id from public.approval_step where instance_id=target_instance_id) and state in ('WAITING','ACTIVE');
    target_instance_state:='REJECTED';
  else
    select case when step_row.completion_mode='ANY_ONE' then true
      when step_row.completion_mode='SEQUENTIAL' then not exists(select 1 from public.approval_participant p where p.step_id=target_step_id and p.state='WAITING')
      when step_row.completion_mode='SPECIFIC' then not exists(select 1 from public.approval_participant p where p.step_id=target_step_id and p.required_for_completion and p.state<>'ACTED')
      else not exists(select 1 from public.approval_participant p where p.step_id=target_step_id and p.state<>'ACTED') end into step_is_complete;
    if step_row.completion_mode='SEQUENTIAL' and not step_is_complete then
      update public.approval_participant set state='ACTIVE',version_no=version_no+1 where id=(select id from public.approval_participant where step_id=target_step_id and state='WAITING' order by participant_order limit 1);
    end if;
    if step_is_complete then
      update public.approval_step set state=step_terminal,version_no=version_no+1 where id=target_step_id;
      update public.approval_participant set state='CANCELLED',version_no=version_no+1 where step_id=target_step_id and state='ACTIVE';
      if exists(select 1 from public.approval_step where instance_id=target_instance_id and sequence_no=step_row.sequence_no and state='ACTIVE') then next_sequence:=null;
      else select min(sequence_no) into next_sequence from public.approval_step where instance_id=target_instance_id and state='WAITING'; end if;
      if next_sequence is not null then
        update public.approval_step set state='ACTIVE',version_no=version_no+1 where instance_id=target_instance_id and sequence_no=next_sequence and state='WAITING';
        update public.approval_participant p set state='ACTIVE',version_no=p.version_no+1 from public.approval_step s
          where s.id=p.step_id and s.instance_id=target_instance_id and s.sequence_no=next_sequence and s.state='ACTIVE' and p.state='WAITING'
            and (s.completion_mode<>'SEQUENTIAL' or p.participant_order=(select min(p2.participant_order) from public.approval_participant p2 where p2.step_id=s.id and p2.state='WAITING'));
      elsif not exists(select 1 from public.approval_step where instance_id=target_instance_id and required and state not in ('REVIEWED','AGREED','APPROVED','SKIPPED_BY_POLICY')) then
        if not exists(select 1 from app_private.approval_subject_snapshot(target_instance_id) s where s.subject_kind='DOCUMENT_VERSION' and s.subject_state='APPROVAL_PENDING') then
          raise exception 'exact document subject version changed before completion' using errcode='23514';
        end if;
        target_instance_state:='COMPLETED'; transition_event:='EVT-APPROVAL-APPROVE'; outbox_event:='EVT-APPROVAL-COMPLETED';
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

create or replace function app_private.guard_document_approval_action_path()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if new.event_id in ('REVIEW','AGREE','APPROVE','REJECT','REFERENCE_RECEIPT')
    and exists(select 1 from public.approval_subject_document_version d where d.instance_id=new.instance_id)
    and app_private.optional_setting('app.document_approval_command_instance') is distinct from new.instance_id::text then
    raise exception 'document approval actions require the typed document command path' using errcode='42501';
  end if;
  return new;
end $$;
create trigger approval_action_document_path_guard before insert on public.approval_action
  for each row execute function app_private.guard_document_approval_action_path();

create or replace function app_private.reject_approval_subject_binding_mutation()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin raise exception 'approval subject binding is append-only' using errcode='55000'; end $$;
create trigger approval_subject_binding_no_update before update or delete on public.approval_subject_binding for each row execute function app_private.reject_approval_subject_binding_mutation();

alter table public.document_type_definition enable row level security;
alter table public.document_type_definition force row level security;
alter table public.retention_policy_definition enable row level security;
alter table public.retention_policy_definition force row level security;
alter table public.editor_schema_definition enable row level security;
alter table public.editor_schema_definition force row level security;
alter table public.file_mime_type_definition enable row level security;
alter table public.file_mime_type_definition force row level security;
alter table public.template enable row level security;
alter table public.template force row level security;
alter table public.template_version enable row level security;
alter table public.template_version force row level security;
alter table public.document enable row level security;
alter table public.document force row level security;
alter table public.document_version enable row level security;
alter table public.document_version force row level security;
alter table public.attachment enable row level security;
alter table public.attachment force row level security;
alter table public.document_attachment enable row level security;
alter table public.document_attachment force row level security;
alter table public.document_content_validation_evidence enable row level security;
alter table public.document_content_validation_evidence force row level security;
alter table public.document_seal_evidence enable row level security;
alter table public.document_seal_evidence force row level security;
alter table public.file_scan_evidence enable row level security;
alter table public.file_scan_evidence force row level security;
alter table public.approval_subject_binding enable row level security;
alter table public.approval_subject_binding force row level security;
alter table public.approval_subject_document_version enable row level security;
alter table public.approval_subject_document_version force row level security;

create policy document_type_internal_read on public.document_type_definition for select to youone_request using(app_private.approval_actor_is_internal());
create policy retention_policy_internal_read on public.retention_policy_definition for select to youone_request using(app_private.approval_actor_is_internal());
create policy editor_schema_internal_read on public.editor_schema_definition for select to youone_request using(app_private.approval_actor_is_internal());
create policy file_mime_internal_read on public.file_mime_type_definition for select to youone_request using(app_private.approval_actor_is_internal());
create policy template_internal_read on public.template for select to youone_request using(app_private.approval_actor_is_internal());
create policy template_version_internal_read on public.template_version for select to youone_request using(app_private.approval_actor_is_internal());
create policy document_owner_read on public.document for select to youone_request using(app_private.actor_has_document_scope(id) or exists(
  select 1 from public.document_version v where v.document_id=document.id and app_private.actor_can_read_document_version(v.id)));
create policy document_version_owner_read on public.document_version for select to youone_request using(app_private.actor_can_read_document_version(id));
create policy attachment_owner_read on public.attachment for select to youone_request using(exists(
  select 1 from public.document_attachment l join public.document_version v on v.id=l.document_version_id
  where l.attachment_id=attachment.id and l.link_state='ACTIVE' and app_private.actor_can_read_document_version(v.id)));
create policy document_attachment_owner_read on public.document_attachment for select to youone_request using(exists(
  select 1 from public.document_version v where v.id=document_version_id and app_private.actor_can_read_document_version(v.id)));
create policy approval_binding_participant_read on public.approval_subject_binding for select to youone_request using(app_private.can_read_approval_instance(instance_id));
create policy approval_document_subject_participant_read on public.approval_subject_document_version for select to youone_request using(
  app_private.can_read_approval_instance(instance_id) and app_private.actor_can_read_document_version(document_version_id));

revoke all on table public.document_type_definition,public.retention_policy_definition,public.editor_schema_definition,public.file_mime_type_definition,
  public.template,public.template_version,public.document,public.document_version,public.attachment,public.document_attachment,
  public.document_content_validation_evidence,public.document_seal_evidence,public.file_scan_evidence,public.approval_subject_binding,public.approval_subject_document_version
  from public,youone_request,youone_privileged_writer;
grant select on table public.document_type_definition,public.retention_policy_definition,public.editor_schema_definition,public.file_mime_type_definition,
  public.template,public.template_version,public.document,public.document_attachment,public.approval_subject_binding,public.approval_subject_document_version to youone_request;
grant select(id,document_id,version_no,prior_version_id,prior_version_no,superseded_by_version_id,approval_instance_id,template_source,template_version_id,
  template_id_snapshot,template_version_no,template_checksum,editor_schema_version,content_validation_evidence_id,renderer_id,renderer_version,security_level_snapshot,
  content_checksum,sealed_manifest_schema,sealed_manifest_version,sealed_snapshot_checksum,sealed_manifest_evidence_id,creation_reason_code,author_user_id,
  state,row_version,created_at,sealed_at,decided_at) on public.document_version to youone_request;
grant select(id,declared_mime_type,declared_size_bytes,expected_sha256,detected_mime_type,detected_size_bytes,detected_sha256,signature_validation,
  security_level,uploader_user_id,state,row_version,intent_expires_at,created_at,verified_at,scanned_at) on public.attachment to youone_request;

revoke all on function public.create_document_draft(uuid,uuid,text,text,text,uuid,text,text,text,uuid,text,uuid,text,text,jsonb,text,text,uuid,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.create_template_draft(uuid,uuid,text,text,text,jsonb,jsonb,text,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.seal_template_version(uuid,bigint,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.edit_document_draft(uuid,bigint,jsonb,text,uuid,text,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.update_document_draft_security(uuid,bigint,bigint,text,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.create_document_revision(uuid,uuid,bigint,bigint,uuid,text,jsonb,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.remove_document_attachment(uuid,uuid,bigint,text,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.seal_document_version(uuid,bigint,bigint,uuid,uuid,uuid,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.create_document_approval_instance(uuid,uuid,text,uuid,uuid,bigint,uuid,uuid,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.perform_document_approval_action(uuid,uuid,uuid,text,bigint,bigint,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz) from public,youone_privileged_writer;
revoke all on function public.submit_approval_instance(uuid,bigint,uuid,uuid,uuid,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.create_attachment_upload_intent(uuid,uuid,text,text,bigint,text,integer,uuid,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.request_document_content(uuid,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.request_attachment_delivery(uuid,uuid,text,integer,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.record_document_content_validation(uuid,text,text,text,text,text,uuid,timestamptz) from public,youone_request;
revoke all on function public.record_attachment_uploaded(uuid,bigint,text,bigint,text,uuid,uuid,timestamptz) from public,youone_request;
revoke all on function public.start_attachment_scan(uuid,bigint,uuid,uuid,timestamptz) from public,youone_request;
revoke all on function public.complete_attachment_scan(uuid,bigint,text,text,text,uuid,text,text,uuid,uuid,uuid,timestamptz) from public,youone_request;

grant execute on function public.create_document_draft(uuid,uuid,text,text,text,uuid,text,text,text,uuid,text,uuid,text,text,jsonb,text,text,uuid,uuid,timestamptz) to youone_request;
grant execute on function public.create_template_draft(uuid,uuid,text,text,text,jsonb,jsonb,text,uuid,timestamptz) to youone_request;
grant execute on function public.seal_template_version(uuid,bigint,uuid,timestamptz) to youone_request;
grant execute on function public.edit_document_draft(uuid,bigint,jsonb,text,uuid,text,uuid,timestamptz) to youone_request;
grant execute on function public.update_document_draft_security(uuid,bigint,bigint,text,uuid,timestamptz) to youone_request;
grant execute on function public.create_document_revision(uuid,uuid,bigint,bigint,uuid,text,jsonb,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz) to youone_request;
grant execute on function public.remove_document_attachment(uuid,uuid,bigint,text,uuid,timestamptz) to youone_request;
grant execute on function public.seal_document_version(uuid,bigint,bigint,uuid,uuid,uuid,uuid,timestamptz) to youone_request;
grant execute on function public.create_document_approval_instance(uuid,uuid,text,uuid,uuid,bigint,uuid,uuid,uuid,timestamptz) to youone_request;
grant execute on function public.perform_document_approval_action(uuid,uuid,uuid,text,bigint,bigint,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz) to youone_request;
grant execute on function public.submit_approval_instance(uuid,bigint,uuid,uuid,uuid,uuid,timestamptz) to youone_request;
grant execute on function public.create_attachment_upload_intent(uuid,uuid,text,text,bigint,text,integer,uuid,uuid,timestamptz) to youone_request;
grant execute on function public.request_document_content(uuid,uuid,timestamptz) to youone_request;
grant execute on function public.request_attachment_delivery(uuid,uuid,text,integer,uuid,timestamptz) to youone_request;
grant execute on function public.record_document_content_validation(uuid,text,text,text,text,text,uuid,timestamptz) to youone_privileged_writer;
grant execute on function public.record_attachment_uploaded(uuid,bigint,text,bigint,text,uuid,uuid,timestamptz) to youone_privileged_writer;
grant execute on function public.start_attachment_scan(uuid,bigint,uuid,uuid,timestamptz) to youone_privileged_writer;
grant execute on function public.complete_attachment_scan(uuid,bigint,text,text,text,uuid,text,text,uuid,uuid,uuid,timestamptz) to youone_privileged_writer;

revoke all on function app_private.m05_assert_user_command(timestamptz,text),app_private.m05_assert_worker(timestamptz,text),
  app_private.canonical_json_sha256(jsonb),app_private.actor_has_document_scope(uuid,timestamptz),app_private.actor_can_read_document_version(uuid,timestamptz),
  app_private.actor_can_review_document_version(uuid,timestamptz),app_private.actor_has_security_entitlement(text,timestamptz),
  app_private.actor_can_read_document_source(uuid,text,timestamptz),app_private.append_document_transition(uuid,uuid,text,uuid,bigint,text,text,text,text,timestamptz),
  app_private.enqueue_document_event(uuid,uuid,text,uuid,bigint,text,timestamptz),
  app_private.append_attachment_transition(uuid,uuid,text,uuid,bigint,text,text,text,text,timestamptz),
  app_private.enqueue_attachment_event(uuid,uuid,text,uuid,bigint,text,timestamptz),app_private.approval_subject_snapshot(uuid),app_private.apply_document_approval_transition(),
  app_private.guard_document_approval_action_path()
  from public,youone_request,youone_privileged_writer;
grant execute on function app_private.actor_has_document_scope(uuid,timestamptz),app_private.actor_can_read_document_version(uuid,timestamptz),app_private.actor_has_security_entitlement(text,timestamptz),
  app_private.actor_can_read_document_source(uuid,text,timestamptz) to youone_request;

-- Supabase Storage is optional in the plain PostgreSQL verification image. When
-- present, bootstrap an explicitly private bucket and install restrictive client
-- policies. Storage service credentials remain behind the authorized broker and
-- are never resolvable from the request container.
do $storage$
begin
  if to_regclass('storage.buckets') is not null then
    execute $sql$
      insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values('PRIVATE_BUSINESS','PRIVATE_BUSINESS',false,50000000,
        array['application/pdf','image/png','image/jpeg','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
      on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types
    $sql$;
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'alter table storage.objects enable row level security';
    execute 'revoke all on table storage.objects from youone_request,youone_privileged_writer';
    if exists(select 1 from pg_roles where rolname='authenticated') then
      execute $sql$create policy m05_private_business_client_select on storage.objects as restrictive for select to authenticated using(bucket_id<>'PRIVATE_BUSINESS')$sql$;
      execute $sql$create policy m05_private_business_client_insert on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'PRIVATE_BUSINESS')$sql$;
      execute $sql$create policy m05_private_business_client_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'PRIVATE_BUSINESS') with check(bucket_id<>'PRIVATE_BUSINESS')$sql$;
      execute $sql$create policy m05_private_business_client_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'PRIVATE_BUSINESS')$sql$;
    end if;
    if exists(select 1 from pg_roles where rolname='anon') then
      execute $sql$create policy m05_private_business_anon_select on storage.objects as restrictive for select to anon using(bucket_id<>'PRIVATE_BUSINESS')$sql$;
      execute $sql$create policy m05_private_business_anon_insert on storage.objects as restrictive for insert to anon with check(bucket_id<>'PRIVATE_BUSINESS')$sql$;
      execute $sql$create policy m05_private_business_anon_update on storage.objects as restrictive for update to anon using(bucket_id<>'PRIVATE_BUSINESS') with check(bucket_id<>'PRIVATE_BUSINESS')$sql$;
      execute $sql$create policy m05_private_business_anon_delete on storage.objects as restrictive for delete to anon using(bucket_id<>'PRIVATE_BUSINESS')$sql$;
    end if;
  end if;
end
$storage$;

comment on table public.document_version is 'Editor content is never directly granted. REVIEW_READY and later snapshots use sealed_snapshot_checksum over content, template/renderer, security and exact AVAILABLE attachment hashes.';
comment on table public.attachment is 'Private object metadata only. Public URLs, signed URLs, tokens and client-selected object keys are forbidden.';
comment on function public.request_attachment_delivery(uuid,uuid,text,integer,uuid,timestamptz) is 'Returns server-only private object coordinates for immediate reauthorized streaming; never a signed/public URL.';
