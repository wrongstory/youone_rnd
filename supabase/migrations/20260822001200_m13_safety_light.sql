-- M13 Safety Light. MSDS, waste and emergency-drill persistence remain P1 and are deliberately absent.

insert into public.permission(id,stable_code,status) values
 ('3d000000-0000-4000-8000-000000000001','safety.assignment.manage','ACTIVE'),
 ('3d000000-0000-4000-8000-000000000002','safety.inspection.manage','ACTIVE'),
 ('3d000000-0000-4000-8000-000000000003','safety.inspection.perform','ACTIVE'),
 ('3d000000-0000-4000-8000-000000000004','safety.finding.correct','ACTIVE'),
 ('3d000000-0000-4000-8000-000000000005','safety.training.manage','ACTIVE'),
 ('3d000000-0000-4000-8000-000000000006','safety.training.acknowledge','ACTIVE'),
 ('3d000000-0000-4000-8000-000000000007','safety.incident.report','ACTIVE'),
 ('3d000000-0000-4000-8000-000000000008','safety.incident.investigate','ACTIVE'),
 ('3d000000-0000-4000-8000-000000000009','safety.incident.close','ACTIVE'),
 ('3d000000-0000-4000-8000-000000000010','safety.record.read','ACTIVE'),
 ('3d000000-0000-4000-8000-000000000011','safety.recurrence.submit','ACTIVE')
on conflict do nothing;
insert into public.action_definition(action_id) values
 ('safety.assignment.manage'),('safety.inspection.manage'),('safety.inspection.perform'),('safety.finding.correct'),
 ('safety.training.manage'),('safety.training.acknowledge'),('safety.incident.report'),('safety.incident.investigate'),
 ('safety.incident.close'),('safety.record.read'),('safety.recurrence.submit'),('safety.alert.emit')
on conflict do nothing;
insert into public.aggregate_type_definition(aggregate_type) values ('SAFETY_ASSIGNMENT'),('SAFETY_INSPECTION'),('SAFETY_INCIDENT'),('SAFETY_TRAINING') on conflict do nothing;
insert into public.domain_event_definition(event_id,payload_schema_id,payload_schema_version) values
 ('EVT-SAFETY-MANAGER-ASSIGN','SAFETY_EVENT_REF',1),('EVT-SAFETY-INSPECTION-PLAN','SAFETY_EVENT_REF',1),('EVT-SAFETY-INSPECTION-START','SAFETY_EVENT_REF',1),
 ('EVT-SAFETY-INSPECTION-CLOSE-CLEAR','SAFETY_EVENT_REF',1),('EVT-SAFETY-INSPECTION-CANCEL','SAFETY_EVENT_REF',1),
 ('EVT-SAFETY-FINDINGS-ISSUE','SAFETY_EVENT_REF',1),('EVT-SAFETY-STOP-WORK','SAFETY_EVENT_REF',1),
 ('EVT-SAFETY-CORRECTION-ASSIGN','SAFETY_EVENT_REF',1),('EVT-SAFETY-SUBMIT-VERIFY','SAFETY_EVENT_REF',1),
 ('EVT-SAFETY-VERIFY-CLOSE','SAFETY_EVENT_REF',1),('EVT-SAFETY-VERIFY-FAIL','SAFETY_EVENT_REF',1),
 ('EVT-SAFETY-INCIDENT-REPORT','SAFETY_EVENT_REF',1),('EVT-SAFETY-EMERGENCY-RESPOND','SAFETY_EVENT_REF',1),
 ('EVT-SAFETY-SECURE-SITE','SAFETY_EVENT_REF',1),('EVT-SAFETY-START-INVESTIGATION','SAFETY_EVENT_REF',1),
 ('EVT-SAFETY-SET-RECURRENCE-ACTION','SAFETY_EVENT_REF',1),('EVT-SAFETY-CLOSE','SAFETY_EVENT_REF',1),
 ('EVT-SAFETY-INCIDENT-SLA-ALERT','SAFETY_EVENT_REF',1),
 ('EVT-SAFETY-TRAINING-RECORD','SAFETY_EVENT_REF',1),('EVT-SAFETY-TRAINING-ATTENDANCE','SAFETY_EVENT_REF',1)
on conflict do nothing;
insert into public.state_machine_definition(machine_id,aggregate_type) values
 ('SM-SAFETY-INSPECTION-V1','SAFETY_INSPECTION'),('SM-SAFETY-INCIDENT-V1','SAFETY_INCIDENT') on conflict do nothing;
insert into public.state_definition(machine_id,state_id,is_terminal) values
 ('SM-SAFETY-INSPECTION-V1','PLANNED',false),('SM-SAFETY-INSPECTION-V1','IN_PROGRESS',false),
 ('SM-SAFETY-INSPECTION-V1','FINDINGS_OPEN',false),('SM-SAFETY-INSPECTION-V1','STOP_WORK',false),
 ('SM-SAFETY-INSPECTION-V1','CORRECTION_PENDING',false),('SM-SAFETY-INSPECTION-V1','VERIFICATION',false),
 ('SM-SAFETY-INSPECTION-V1','CLOSED',true),('SM-SAFETY-INSPECTION-V1','CANCELLED',true),
 ('SM-SAFETY-INCIDENT-V1','REPORTED',false),('SM-SAFETY-INCIDENT-V1','EMERGENCY_RESPONSE',false),
 ('SM-SAFETY-INCIDENT-V1','SITE_SECURED',false),('SM-SAFETY-INCIDENT-V1','INVESTIGATION',false),
 ('SM-SAFETY-INCIDENT-V1','RECURRENCE_ACTION',false),('SM-SAFETY-INCIDENT-V1','VERIFICATION',false),
 ('SM-SAFETY-INCIDENT-V1','CLOSED',true)
on conflict do nothing;
insert into public.transition_definition(machine_id,event_id,from_state,to_state) values
 ('SM-SAFETY-INSPECTION-V1','EVT-SAFETY-INSPECTION-PLAN',null,'PLANNED'),
 ('SM-SAFETY-INSPECTION-V1','EVT-SAFETY-INSPECTION-START','PLANNED','IN_PROGRESS'),
 ('SM-SAFETY-INSPECTION-V1','EVT-SAFETY-INSPECTION-CLOSE-CLEAR','IN_PROGRESS','CLOSED'),
 ('SM-SAFETY-INSPECTION-V1','EVT-SAFETY-INSPECTION-CANCEL','PLANNED','CANCELLED'),
 ('SM-SAFETY-INSPECTION-V1','EVT-SAFETY-FINDINGS-ISSUE','IN_PROGRESS','FINDINGS_OPEN'),
 ('SM-SAFETY-INSPECTION-V1','EVT-SAFETY-STOP-WORK','IN_PROGRESS','STOP_WORK'),
 ('SM-SAFETY-INSPECTION-V1','EVT-SAFETY-STOP-WORK','FINDINGS_OPEN','STOP_WORK'),
 ('SM-SAFETY-INSPECTION-V1','EVT-SAFETY-CORRECTION-ASSIGN','FINDINGS_OPEN','CORRECTION_PENDING'),
 ('SM-SAFETY-INSPECTION-V1','EVT-SAFETY-CORRECTION-ASSIGN','STOP_WORK','CORRECTION_PENDING'),
 ('SM-SAFETY-INSPECTION-V1','EVT-SAFETY-SUBMIT-VERIFY','CORRECTION_PENDING','VERIFICATION'),
 ('SM-SAFETY-INSPECTION-V1','EVT-SAFETY-VERIFY-CLOSE','VERIFICATION','CLOSED'),
 ('SM-SAFETY-INSPECTION-V1','EVT-SAFETY-VERIFY-FAIL','VERIFICATION','CORRECTION_PENDING'),
 ('SM-SAFETY-INCIDENT-V1','EVT-SAFETY-INCIDENT-REPORT',null,'REPORTED'),
 ('SM-SAFETY-INCIDENT-V1','EVT-SAFETY-EMERGENCY-RESPOND','REPORTED','EMERGENCY_RESPONSE'),
 ('SM-SAFETY-INCIDENT-V1','EVT-SAFETY-SECURE-SITE','EMERGENCY_RESPONSE','SITE_SECURED'),
 ('SM-SAFETY-INCIDENT-V1','EVT-SAFETY-START-INVESTIGATION','SITE_SECURED','INVESTIGATION'),
 ('SM-SAFETY-INCIDENT-V1','EVT-SAFETY-SET-RECURRENCE-ACTION','INVESTIGATION','RECURRENCE_ACTION'),
 ('SM-SAFETY-INCIDENT-V1','EVT-SAFETY-SUBMIT-VERIFY','RECURRENCE_ACTION','VERIFICATION'),
 ('SM-SAFETY-INCIDENT-V1','EVT-SAFETY-CLOSE','VERIFICATION','CLOSED')
on conflict do nothing;

create table public.safety_manager_assignment (
 id uuid primary key,user_id uuid not null references public.user_account(id),assignment_type text not null check(assignment_type in ('SAFETY_MANAGER','TEAM_COORDINATOR')),
 project_id uuid references public.project(id),valid_from timestamptz not null,valid_until timestamptz,designated_by_user_id uuid not null references public.user_account(id),
 director_position_assignment_id uuid not null references public.user_position_assignment(id),reason_code text not null check(app_private.is_stable_code(reason_code)),
 evidence_attachment_id uuid not null,evidence_attachment_row_version bigint not null,evidence_attachment_checksum text not null check(app_private.is_sha256(evidence_attachment_checksum)),
 revoked_at timestamptz,revoked_by_user_id uuid references public.user_account(id),revoke_reason_code text,version_no bigint not null default 1 check(version_no>0),
 unique(id,user_id),foreign key(evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum) references public.attachment(id,row_version,detected_sha256),
 check((assignment_type='SAFETY_MANAGER' and project_id is null) or (assignment_type='TEAM_COORDINATOR' and project_id is not null)),
 check(valid_until is null or valid_until>valid_from),check((revoked_at is null)=(revoked_by_user_id is null))
);
create unique index safety_assignment_active_unique on public.safety_manager_assignment(user_id,assignment_type,coalesce(project_id,'00000000-0000-0000-0000-000000000000'::uuid))
 where revoked_at is null;

create table public.safety_vendor_project_allowlist (
 id uuid primary key,vendor_user_id uuid not null references public.vendor_user(id),project_id uuid not null references public.project(id),
 action_id text not null references public.action_definition(action_id),valid_from timestamptz not null,valid_until timestamptz,granted_by_user_id uuid not null references public.user_account(id),
 reason_code text not null check(app_private.is_stable_code(reason_code)),unique(vendor_user_id,project_id,action_id),check(action_id in ('safety.training.acknowledge','safety.finding.correct','safety.incident.report','safety.recurrence.submit')),
 check(valid_until is null or valid_until>valid_from)
);
create table public.safety_vendor_contract_allowlist (
 id uuid primary key,vendor_user_id uuid not null references public.vendor_user(id),vendor_id uuid not null references public.vendor(id),contract_id uuid not null,project_id uuid not null,
 action_id text not null references public.action_definition(action_id),valid_from timestamptz not null,valid_until timestamptz,granted_by_user_id uuid not null references public.user_account(id),
 reason_code text not null check(app_private.is_stable_code(reason_code)),unique(vendor_user_id,contract_id,project_id,action_id),
 foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id),
 foreign key(contract_id,vendor_id) references public.vendor_contract(id,vendor_id),
 check(action_id in ('safety.training.acknowledge','safety.finding.correct','safety.incident.report','safety.recurrence.submit')),check(valid_until is null or valid_until>valid_from)
);

create table public.safety_inspection (
 id uuid primary key,inspection_no text not null unique,project_id uuid not null references public.project(id),contract_id uuid,assigned_vendor_id uuid references public.vendor(id),
 manager_assignment_id uuid not null references public.safety_manager_assignment(id),inspection_type text not null check(inspection_type in ('MONTHLY_REGULAR','WEEKLY_TEAM_SELF','AD_HOC','SPECIAL')),
 scheduled_at timestamptz not null,inspector_user_id uuid not null references public.user_account(id),state text not null check(state in ('PLANNED','IN_PROGRESS','FINDINGS_OPEN','STOP_WORK','CORRECTION_PENDING','VERIFICATION','CLOSED','CANCELLED')),
 stop_work_active boolean not null default false,version_no bigint not null check(version_no>0),retain_until date not null,legal_hold boolean not null default false,
 created_at timestamptz not null,updated_at timestamptz not null,
 foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id),
 check(contract_id is not null or assigned_vendor_id is null),check(retain_until>=(created_at+interval '5 years')::date),
 check((state='STOP_WORK' and stop_work_active) or state<>'STOP_WORK')
);
create table public.safety_inspection_item (
 id uuid primary key,inspection_id uuid not null references public.safety_inspection(id),sequence_no integer not null check(sequence_no>0),
 criterion_code text not null check(app_private.is_stable_code(criterion_code)),criterion_text text not null check(length(criterion_text) between 1 and 5000),
 verdict text not null check(verdict in ('PASS','FAIL','NOT_APPLICABLE','NOT_CHECKED')),observation text,
 evidence_attachment_id uuid,evidence_attachment_row_version bigint,evidence_attachment_checksum text check(evidence_attachment_checksum is null or app_private.is_sha256(evidence_attachment_checksum)),
 recorded_by_user_id uuid not null references public.user_account(id),recorded_at timestamptz not null,unique(inspection_id,sequence_no),unique(inspection_id,criterion_code),
 foreign key(evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum) references public.attachment(id,row_version,detected_sha256),
 check(num_nonnulls(evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum) in (0,3)),
 check(verdict<>'FAIL' or evidence_attachment_id is not null)
);
create table public.safety_finding (
 id uuid primary key,inspection_id uuid not null references public.safety_inspection(id),inspection_item_id uuid not null references public.safety_inspection_item(id),
 finding_no integer not null check(finding_no>0),severity text not null check(severity in ('LOW','MEDIUM','HIGH','CRITICAL')),description text not null check(length(description) between 1 and 10000),
 imminent_risk boolean not null,stop_work_required boolean not null,correction_owner_user_id uuid references public.user_account(id),correction_owner_vendor_user_id uuid references public.vendor_user(id),
 due_at timestamptz not null,state text not null check(state in ('OPEN','ASSIGNED','CORRECTION_SUBMITTED','VERIFIED','CLOSED')),
 retain_until date not null,legal_hold boolean not null default false,created_at timestamptz not null,
 unique(inspection_id,finding_no),unique(id,inspection_id),check(num_nonnulls(correction_owner_user_id,correction_owner_vendor_user_id)=1),
 check(stop_work_required=imminent_risk),check(retain_until>=(created_at+interval '5 years')::date)
);
create table public.safety_correction_evidence (
 id uuid primary key,finding_id uuid not null references public.safety_finding(id),submission_no integer not null check(submission_no>0),
 submitted_by_user_id uuid references public.user_account(id),submitted_by_vendor_user_id uuid references public.vendor_user(id),summary text not null check(length(summary) between 1 and 10000),
 attachment_id uuid not null,attachment_row_version bigint not null,attachment_checksum text not null check(app_private.is_sha256(attachment_checksum)),submitted_at timestamptz not null,
 unique(finding_id,submission_no),unique(id,finding_id),check(num_nonnulls(submitted_by_user_id,submitted_by_vendor_user_id)=1),
 foreign key(attachment_id,attachment_row_version,attachment_checksum) references public.attachment(id,row_version,detected_sha256)
);
create table public.safety_correction_verification (
 id uuid primary key,finding_id uuid not null references public.safety_finding(id),correction_evidence_id uuid not null,
 verifier_user_id uuid not null references public.user_account(id),verdict text not null check(verdict in ('EFFECTIVE','INEFFECTIVE')),
 summary text not null check(length(summary) between 1 and 10000),attachment_id uuid not null,attachment_row_version bigint not null,
 attachment_checksum text not null check(app_private.is_sha256(attachment_checksum)),verified_at timestamptz not null,unique(finding_id,correction_evidence_id),
 foreign key(correction_evidence_id,finding_id) references public.safety_correction_evidence(id,finding_id),
 foreign key(attachment_id,attachment_row_version,attachment_checksum) references public.attachment(id,row_version,detected_sha256)
);

create table public.safety_training_session (
 id uuid primary key,training_no text not null unique,project_id uuid not null references public.project(id),contract_id uuid,assigned_vendor_id uuid references public.vendor(id),
 training_type text not null check(training_type in ('NEW_JOINER','SEMIANNUAL_REGULAR','EVENT_SPECIAL')),title text not null,scheduled_at timestamptz not null,
 held_at timestamptz,state text not null check(state in ('PLANNED','COMPLETED','CANCELLED')),version_no bigint not null check(version_no>0),
 retain_until date not null,legal_hold boolean not null default false,created_by_user_id uuid not null references public.user_account(id),created_at timestamptz not null,
 foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id),
 foreign key(contract_id,assigned_vendor_id) references public.vendor_contract(id,vendor_id),check(contract_id is not null or assigned_vendor_id is null),
 check(retain_until>=(created_at+interval '5 years')::date)
);
create table public.safety_training_attendance (
 id uuid primary key,training_session_id uuid not null references public.safety_training_session(id),user_id uuid not null references public.user_account(id),
 vendor_user_id uuid references public.vendor_user(id),completion_state text not null check(completion_state in ('SCHEDULED','ATTENDED','ABSENT','REMEDIAL_REQUIRED','REMEDIAL_COMPLETED')),
 acknowledged_at timestamptz,recorded_at timestamptz not null,unique(training_session_id,user_id),unique(id,training_session_id)
);
create table public.safety_training_remedial (
 id uuid primary key,attendance_id uuid not null references public.safety_training_attendance(id),due_at timestamptz not null,completed_at timestamptz,
 attachment_id uuid,attachment_row_version bigint,attachment_checksum text check(attachment_checksum is null or app_private.is_sha256(attachment_checksum)),
 recorded_by_user_id uuid not null references public.user_account(id),recorded_at timestamptz not null,unique(attendance_id),
 foreign key(attachment_id,attachment_row_version,attachment_checksum) references public.attachment(id,row_version,detected_sha256),
 check(num_nonnulls(attachment_id,attachment_row_version,attachment_checksum) in (0,3)),check(completed_at is null or attachment_id is not null)
);

create table public.safety_incident (
 id uuid primary key,incident_no text not null unique,project_id uuid not null references public.project(id),contract_id uuid,assigned_vendor_id uuid references public.vendor(id),
 reported_by_user_id uuid references public.user_account(id),reported_by_vendor_user_id uuid references public.vendor_user(id),occurred_at timestamptz not null,reported_at timestamptz not null,
 severity text not null check(severity in ('NEAR_MISS','MINOR','MAJOR','CRITICAL')),summary text not null check(length(summary) between 1 and 10000),
 immediate_response text not null check(length(immediate_response) between 1 and 10000),site_preservation_required boolean not null,
 investigation_due_at timestamptz not null,state text not null check(state in ('REPORTED','EMERGENCY_RESPONSE','SITE_SECURED','INVESTIGATION','RECURRENCE_ACTION','VERIFICATION','CLOSED')),
 version_no bigint not null check(version_no>0),retain_until date not null,legal_hold boolean not null default false,created_at timestamptz not null,updated_at timestamptz not null,
 foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id),
 foreign key(contract_id,assigned_vendor_id) references public.vendor_contract(id,vendor_id),check(contract_id is not null or assigned_vendor_id is null),
 check(num_nonnulls(reported_by_user_id,reported_by_vendor_user_id)=1),check(reported_at>=occurred_at),check(investigation_due_at=reported_at+interval '48 hours'),
 check(retain_until>=(created_at+interval '5 years')::date)
);
create table public.safety_incident_investigation (
 id uuid primary key,incident_id uuid not null unique references public.safety_incident(id),started_at timestamptz not null,completed_at timestamptz,
 investigator_user_id uuid not null references public.user_account(id),root_cause text,contributing_factors text,site_preservation_summary text not null,
 evidence_attachment_id uuid not null,evidence_attachment_row_version bigint not null,evidence_attachment_checksum text not null check(app_private.is_sha256(evidence_attachment_checksum)),
 foreign key(evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum) references public.attachment(id,row_version,detected_sha256),
 check(completed_at is null or (root_cause is not null and contributing_factors is not null and completed_at>=started_at))
);
create table public.safety_recurrence_action (
 id uuid primary key,incident_id uuid not null references public.safety_incident(id),sequence_no integer not null check(sequence_no>0),
 action_text text not null check(length(action_text) between 1 and 10000),owner_user_id uuid references public.user_account(id),owner_vendor_user_id uuid references public.vendor_user(id),
 due_at timestamptz not null,state text not null check(state in ('PLANNED','IN_PROGRESS','SUBMITTED','VERIFIED','INEFFECTIVE')),
 completion_evidence_attachment_id uuid,completion_evidence_row_version bigint,completion_evidence_checksum text check(completion_evidence_checksum is null or app_private.is_sha256(completion_evidence_checksum)),
 unique(incident_id,sequence_no),unique(id,incident_id),check(num_nonnulls(owner_user_id,owner_vendor_user_id)=1),
 foreign key(completion_evidence_attachment_id,completion_evidence_row_version,completion_evidence_checksum) references public.attachment(id,row_version,detected_sha256),
 check(num_nonnulls(completion_evidence_attachment_id,completion_evidence_row_version,completion_evidence_checksum) in (0,3))
);
create table public.safety_recurrence_verification (
 id uuid primary key,action_id uuid not null unique references public.safety_recurrence_action(id),verifier_user_id uuid not null references public.user_account(id),
 verdict text not null check(verdict in ('EFFECTIVE','INEFFECTIVE')),summary text not null,attachment_id uuid not null,attachment_row_version bigint not null,
 attachment_checksum text not null check(app_private.is_sha256(attachment_checksum)),verified_at timestamptz not null,
 foreign key(attachment_id,attachment_row_version,attachment_checksum) references public.attachment(id,row_version,detected_sha256)
);
create table public.safety_alert (
 id uuid primary key,incident_id uuid not null references public.safety_incident(id),alert_kind text not null check(alert_kind='INVESTIGATION_48H_OVERDUE'),
 idempotency_key text not null unique check(app_private.is_opaque_key(idempotency_key)),detected_at timestamptz not null,acknowledged_at timestamptz,
 check(acknowledged_at is null or acknowledged_at>=detected_at)
);

create index safety_inspection_schedule_idx on public.safety_inspection(scheduled_at,state);
create index safety_finding_due_idx on public.safety_finding(due_at,state);
create index safety_training_schedule_idx on public.safety_training_session(scheduled_at,state);
create index safety_incident_sla_idx on public.safety_incident(investigation_due_at,state) where state<>'CLOSED';

create or replace function app_private.m13_reject_append_only()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin raise exception 'Safety evidence/history is append-only' using errcode='55000';end $$;
do $immutable$ declare t text;begin foreach t in array array['safety_manager_assignment','safety_vendor_project_allowlist','safety_vendor_contract_allowlist',
 'safety_inspection_item','safety_correction_evidence','safety_correction_verification','safety_training_remedial',
 'safety_recurrence_verification','safety_alert'] loop execute format('create trigger %I before update or delete on public.%I for each row execute function app_private.m13_reject_append_only()',
 'm13_'||t||'_immutable',t);end loop;end $immutable$;
create or replace function app_private.m13_guard_retention()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin
 if tg_op='DELETE' then raise exception 'Safety record retention forbids deletion' using errcode='55000';end if;
 if new.retain_until<old.retain_until or (old.legal_hold and not new.legal_hold) then raise exception 'Safety retention/legal hold cannot be shortened' using errcode='55000';end if;
 return new;end $$;
create trigger safety_inspection_retention before update or delete on public.safety_inspection for each row execute function app_private.m13_guard_retention();
create trigger safety_finding_retention before update or delete on public.safety_finding for each row execute function app_private.m13_guard_retention();
create trigger safety_training_retention before update or delete on public.safety_training_session for each row execute function app_private.m13_guard_retention();
create trigger safety_incident_retention before update or delete on public.safety_incident for each row execute function app_private.m13_guard_retention();
create or replace function app_private.m13_guard_command()
returns trigger language plpgsql set search_path=pg_catalog,app_private as $$ declare target_id text:=old.id::text;begin
 if app_private.optional_setting('app.m13_command') is distinct from target_id then raise exception 'Safety update requires trusted command' using errcode='42501';end if;return new;end $$;
create trigger safety_inspection_command before update on public.safety_inspection for each row execute function app_private.m13_guard_command();
create trigger safety_incident_command before update on public.safety_incident for each row execute function app_private.m13_guard_command();

create or replace function app_private.m13_has_position(target_user uuid,target_code text,target_time timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select exists(
 select 1 from public.user_position_assignment a join public.position p on p.id=a.position_id and p.stable_code=target_code and p.status='ACTIVE'
 where a.user_id=target_user and a.revoked_at is null and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time)) $$;
create or replace function app_private.m13_is_admin(target_user uuid,target_time timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select exists(
 select 1 from public.user_role_assignment a join public.role r on r.id=a.role_id and r.stable_code in ('ADMIN_SYSTEM','ADMIN_SECURITY') and r.status='ACTIVE'
 where a.user_id=target_user and a.revoked_at is null and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time)) $$;
create or replace function app_private.m13_is_safety_actor(target_user uuid,target_project uuid,target_time timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select app_private.m13_has_position(target_user,'POSITION_LAB_DIRECTOR',target_time) or exists(
 select 1 from public.safety_manager_assignment a where a.user_id=target_user and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time)
  and a.revoked_at is null and (a.assignment_type='SAFETY_MANAGER' or (a.assignment_type='TEAM_COORDINATOR' and a.project_id=target_project))) $$;
create or replace function app_private.m13_is_release_authority(target_user uuid,target_time timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private as $$
 select app_private.m13_has_position(target_user,'POSITION_LAB_DIRECTOR',target_time) or exists(select 1 from public.safety_manager_assignment a
  where a.user_id=target_user and a.assignment_type='SAFETY_MANAGER' and a.revoked_at is null and a.valid_from<=target_time
   and (a.valid_until is null or a.valid_until>target_time)) $$;
create or replace function app_private.m13_assert_internal(target_permission text,target_project uuid,target_time timestamptz,target_require_safety boolean default true)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m08_assert_direct_internal(target_time,target_permission);
 if app_private.m13_is_admin(app_private.current_effective_actor_user_id(),target_time)
  or not app_private.actor_has_project_internal_scope(target_project,target_time)
  or (target_require_safety and not app_private.m13_is_safety_actor(app_private.current_effective_actor_user_id(),target_project,target_time)) then
  raise exception 'scoped non-admin Safety actor required' using errcode='42501';end if;end $$;
create or replace function app_private.m13_vendor_scope(target_project uuid,target_contract uuid,target_vendor uuid,target_action text,target_time timestamptz)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$ declare vu uuid;begin
 if target_time is distinct from app_private.request_time() or app_private.required_setting('app.actor_kind')<>'USER' then return null;end if;
 select x.id into vu from public.vendor_user x join public.vendor v on v.id=x.vendor_id and v.status='ACTIVE'
  join public.user_account u on u.id=x.user_id and u.account_kind='VENDOR' and u.status='ACTIVE'
  where x.user_id=app_private.current_effective_actor_user_id() and x.vendor_id=target_vendor and x.status='ACTIVE' and x.revoked_at is null
   and x.valid_from<=target_time and (x.valid_until is null or x.valid_until>target_time)
   and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time) limit 1;
 if vu is null or not exists(select 1 from public.project_vendor_grant g where g.vendor_user_id=vu and g.project_id=target_project
   and g.status='ACTIVE' and g.revoked_at is null and g.valid_from<=target_time and (g.valid_until is null or g.valid_until>target_time))
  or not exists(select 1 from public.safety_vendor_project_allowlist a where a.vendor_user_id=vu and a.project_id=target_project and a.action_id=target_action
   and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time)) then return null;end if;
 if target_contract is not null and (not exists(select 1 from public.contract_vendor_grant g where g.vendor_user_id=vu and g.contract_id=target_contract
   and g.project_id=target_project and g.status='ACTIVE' and g.revoked_at is null and g.valid_from<=target_time and (g.valid_until is null or g.valid_until>target_time))
  or not exists(select 1 from public.safety_vendor_contract_allowlist a where a.vendor_user_id=vu and a.contract_id=target_contract and a.project_id=target_project
   and a.action_id=target_action and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time))) then return null;end if;
 return vu;end $$;
create or replace function app_private.m13_append_transition(target_audit uuid,target_transition uuid,target_outbox uuid,target_action text,target_type text,
 target_id uuid,target_machine text,target_event text,target_from text,target_to text,target_from_version bigint,target_to_version bigint,target_reason text,target_time timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.append_audit(target_audit,target_action,target_type,target_id,target_to_version,'SUCCEEDED',coalesce(target_reason,target_event),null,null,null,null,target_time);
 perform app_private.append_state_transition(target_transition,target_audit,target_type,target_id,target_machine,target_event,target_from,target_to,
  target_from_version,target_to_version,coalesce(target_reason,target_event),null,app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_time);
 perform app_private.enqueue_outbox(target_outbox,target_audit,target_event,target_type,target_id,target_to_version,
  app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),'SAFETY_EVENT_REF',1,
  jsonb_build_object('aggregateId',target_id,'resourceVersion',target_to_version,'eventId',target_event),target_event||':'||target_id::text||':'||target_to_version::text,target_time,target_time);
end $$;
create or replace function app_private.m13_append_fact(target_audit uuid,target_outbox uuid,target_action text,target_type text,target_id uuid,target_version bigint,
 target_event text,target_reason text,target_time timestamptz) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.append_audit(target_audit,target_action,target_type,target_id,target_version,'SUCCEEDED',target_reason,null,null,null,null,target_time);
 perform app_private.enqueue_outbox(target_outbox,target_audit,target_event,target_type,target_id,target_version,app_private.required_setting('app.correlation_id'),
  app_private.optional_setting('app.causation_id'),'SAFETY_EVENT_REF',1,jsonb_build_object('aggregateId',target_id,'resourceVersion',target_version,'eventId',target_event),
  target_event||':'||target_id::text||':'||target_version::text||':'||target_outbox::text,target_time,target_time);end $$;

create or replace function public.designate_safety_manager(target_id uuid,target_user uuid,target_type text,target_project uuid,target_from timestamptz,
 target_until timestamptz,target_reason text,target_attachment uuid,target_audit uuid,target_outbox uuid,target_time timestamptz) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare pa uuid;a public.attachment%rowtype;begin
 perform app_private.m08_assert_direct_internal(target_time,'safety.assignment.manage');
 select x.id into strict pa from public.user_position_assignment x join public.position p on p.id=x.position_id and p.stable_code='POSITION_LAB_DIRECTOR' and p.status='ACTIVE'
  where x.user_id=app_private.current_effective_actor_user_id() and x.revoked_at is null and x.valid_from<=target_time and (x.valid_until is null or x.valid_until>target_time) limit 1;
 if not exists(select 1 from public.user_account u where u.id=target_user and u.account_kind='INTERNAL' and u.status='ACTIVE'
  and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time)) then raise exception 'Safety assignee must be active INTERNAL' using errcode='23514';end if;
 if target_project is not null and not app_private.actor_has_project_internal_scope(target_project,target_time) then raise exception 'Director Project scope required' using errcode='42501';end if;
 select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE';
 insert into public.safety_manager_assignment(id,user_id,assignment_type,project_id,valid_from,valid_until,designated_by_user_id,director_position_assignment_id,
  reason_code,evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum)
 values(target_id,target_user,target_type,target_project,target_from,target_until,app_private.current_effective_actor_user_id(),pa,target_reason,a.id,a.row_version,a.detected_sha256);
 perform app_private.m13_append_fact(target_audit,target_outbox,'safety.assignment.manage','SAFETY_ASSIGNMENT',target_id,1,'EVT-SAFETY-MANAGER-ASSIGN',target_reason,target_time);return target_id;end $$;

create or replace function public.create_safety_inspection(target_id uuid,target_no text,target_project uuid,target_contract uuid,target_vendor uuid,
 target_assignment uuid,target_type text,target_scheduled timestamptz,target_retain_until date,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m13_assert_internal('safety.inspection.manage',target_project,target_time,true);
 if not exists(select 1 from public.safety_manager_assignment a where a.id=target_assignment and a.revoked_at is null and a.valid_from<=target_time
  and (a.valid_until is null or a.valid_until>target_time) and (a.user_id=app_private.current_effective_actor_user_id()
   or app_private.m13_has_position(app_private.current_effective_actor_user_id(),'POSITION_LAB_DIRECTOR',target_time))
  and (a.assignment_type='SAFETY_MANAGER' or (a.assignment_type='TEAM_COORDINATOR' and a.project_id=target_project))) then
  raise exception 'active compatible manager assignment required' using errcode='42501';end if;
 insert into public.safety_inspection(id,inspection_no,project_id,contract_id,assigned_vendor_id,manager_assignment_id,inspection_type,scheduled_at,inspector_user_id,
  state,version_no,retain_until,created_at,updated_at) values(target_id,target_no,target_project,target_contract,target_vendor,target_assignment,target_type,target_scheduled,
  (select a.user_id from public.safety_manager_assignment a where a.id=target_assignment),'PLANNED',1,target_retain_until,target_time,target_time);
 perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.inspection.manage','SAFETY_INSPECTION',target_id,
  'SM-SAFETY-INSPECTION-V1','EVT-SAFETY-INSPECTION-PLAN',null,'PLANNED',0,1,'SAFETY-INSPECTION-PLANNED',target_time);return target_id;end $$;
create or replace function public.add_safety_inspection_item(target_inspection uuid,target_item uuid,target_criterion text,target_text text,target_verdict text,
 target_observation text,target_attachment uuid,target_audit uuid,target_time timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 i public.safety_inspection%rowtype;a public.attachment%rowtype;seq integer;begin select * into strict i from public.safety_inspection where id=target_inspection for update;
 perform app_private.m13_assert_internal('safety.inspection.perform',i.project_id,target_time,true);if i.state not in ('PLANNED','IN_PROGRESS') then raise exception 'editable inspection required' using errcode='23514';end if;
 if target_attachment is not null then select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE';end if;
 select coalesce(max(sequence_no),0)+1 into seq from public.safety_inspection_item where inspection_id=i.id;
 insert into public.safety_inspection_item(id,inspection_id,sequence_no,criterion_code,criterion_text,verdict,observation,evidence_attachment_id,evidence_attachment_row_version,
  evidence_attachment_checksum,recorded_by_user_id,recorded_at) values(target_item,i.id,seq,target_criterion,target_text,target_verdict,target_observation,
  a.id,a.row_version,a.detected_sha256,app_private.current_effective_actor_user_id(),target_time);
 perform app_private.append_audit(target_audit,'safety.inspection.perform','SAFETY_INSPECTION',i.id,i.version_no,'SUCCEEDED','SAFETY-CHECKLIST-ITEM-RECORDED',target_item,null,null,null,target_time);return target_item;end $$;
create or replace function public.start_safety_inspection(target_inspection uuid,target_expected bigint,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare i public.safety_inspection%rowtype;next_version bigint;begin
 select * into strict i from public.safety_inspection where id=target_inspection for update;perform app_private.m13_assert_internal('safety.inspection.perform',i.project_id,target_time,true);
 if i.state<>'PLANNED' or not exists(select 1 from public.safety_inspection_item x where x.inspection_id=i.id) then raise exception 'planned inspection checklist required' using errcode='23514';end if;
 next_version:=app_private.next_version(i.version_no,target_expected);perform set_config('app.m13_command',i.id::text,true);update public.safety_inspection set state='IN_PROGRESS',version_no=next_version,updated_at=target_time where id=i.id;
 perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.inspection.perform','SAFETY_INSPECTION',i.id,'SM-SAFETY-INSPECTION-V1',
  'EVT-SAFETY-INSPECTION-START','PLANNED','IN_PROGRESS',i.version_no,next_version,'SAFETY-INSPECTION-STARTED',target_time);return next_version;end $$;
create or replace function public.close_clear_safety_inspection(target_inspection uuid,target_expected bigint,target_reason text,target_audit uuid,
 target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 i public.safety_inspection%rowtype;new_version bigint;begin select * into strict i from public.safety_inspection where id=target_inspection for update;
 perform app_private.m13_assert_internal('safety.inspection.perform',i.project_id,target_time,true);
 if i.state<>'IN_PROGRESS' or nullif(btrim(target_reason),'') is null or not exists(select 1 from public.safety_inspection_item x where x.inspection_id=i.id)
  or exists(select 1 from public.safety_inspection_item x where x.inspection_id=i.id and x.verdict in ('FAIL','NOT_CHECKED'))
  or exists(select 1 from public.safety_finding f where f.inspection_id=i.id and f.state<>'CLOSED') then
  raise exception 'completed clear checklist and no open finding required' using errcode='23514';end if;
 new_version:=app_private.next_version(i.version_no,target_expected);perform set_config('app.m13_command',i.id::text,true);
 update public.safety_inspection set state='CLOSED',version_no=new_version,updated_at=target_time where id=i.id;
 perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.inspection.perform','SAFETY_INSPECTION',i.id,'SM-SAFETY-INSPECTION-V1',
  'EVT-SAFETY-INSPECTION-CLOSE-CLEAR','IN_PROGRESS','CLOSED',i.version_no,new_version,target_reason,target_time);return new_version;end $$;
create or replace function public.cancel_safety_inspection(target_inspection uuid,target_expected bigint,target_reason text,target_audit uuid,
 target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 i public.safety_inspection%rowtype;new_version bigint;begin select * into strict i from public.safety_inspection where id=target_inspection for update;
 perform app_private.m13_assert_internal('safety.inspection.manage',i.project_id,target_time,true);
 if i.state<>'PLANNED' or nullif(btrim(target_reason),'') is null then raise exception 'planned inspection and cancellation reason required' using errcode='23514';end if;
 new_version:=app_private.next_version(i.version_no,target_expected);perform set_config('app.m13_command',i.id::text,true);
 update public.safety_inspection set state='CANCELLED',version_no=new_version,updated_at=target_time where id=i.id;
 perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.inspection.manage','SAFETY_INSPECTION',i.id,'SM-SAFETY-INSPECTION-V1',
  'EVT-SAFETY-INSPECTION-CANCEL','PLANNED','CANCELLED',i.version_no,new_version,target_reason,target_time);return new_version;end $$;
create or replace function public.issue_safety_finding(target_inspection uuid,target_item uuid,target_finding uuid,target_severity text,target_description text,
 target_imminent boolean,target_owner_user uuid,target_owner_vendor_user uuid,target_due timestamptz,target_retain_until date,target_expected bigint,
 target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 i public.safety_inspection%rowtype;seq integer;next_version bigint;to_state text;event text;begin select * into strict i from public.safety_inspection where id=target_inspection for update;
 perform app_private.m13_assert_internal('safety.inspection.perform',i.project_id,target_time,true);
 if i.state not in ('IN_PROGRESS','FINDINGS_OPEN') or (i.state='FINDINGS_OPEN' and not target_imminent)
  or not exists(select 1 from public.safety_inspection_item x where x.id=target_item and x.inspection_id=i.id and x.verdict='FAIL')
  or (target_owner_vendor_user is not null and not exists(select 1 from public.vendor_user vu where vu.id=target_owner_vendor_user and vu.vendor_id=i.assigned_vendor_id)) then
  raise exception 'failed exact checklist item and correction owner required' using errcode='23514';end if;
 select coalesce(max(finding_no),0)+1 into seq from public.safety_finding where inspection_id=i.id;
 insert into public.safety_finding(id,inspection_id,inspection_item_id,finding_no,severity,description,imminent_risk,stop_work_required,correction_owner_user_id,
  correction_owner_vendor_user_id,due_at,state,retain_until,created_at) values(target_finding,i.id,target_item,seq,target_severity,target_description,target_imminent,
  target_imminent,target_owner_user,target_owner_vendor_user,target_due,'OPEN',target_retain_until,target_time);
 next_version:=app_private.next_version(i.version_no,target_expected);to_state:=case when target_imminent then 'STOP_WORK' else 'FINDINGS_OPEN' end;
 event:=case when target_imminent then 'EVT-SAFETY-STOP-WORK' else 'EVT-SAFETY-FINDINGS-ISSUE' end;
 perform set_config('app.m13_command',i.id::text,true);update public.safety_inspection set state=to_state,stop_work_active=target_imminent or stop_work_active,
  version_no=next_version,updated_at=target_time where id=i.id;
 perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.inspection.perform','SAFETY_INSPECTION',i.id,'SM-SAFETY-INSPECTION-V1',
  event,i.state,to_state,i.version_no,next_version,case when target_imminent then 'IMMINENT-RISK-STOP-WORK' else 'SAFETY-FINDING-ISSUED' end,target_time);return next_version;end $$;
create or replace function public.assign_safety_corrections(target_inspection uuid,target_expected bigint,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare i public.safety_inspection%rowtype;next_version bigint;begin
 select * into strict i from public.safety_inspection where id=target_inspection for update;perform app_private.m13_assert_internal('safety.inspection.manage',i.project_id,target_time,true);
 if i.state not in ('FINDINGS_OPEN','STOP_WORK') or not exists(select 1 from public.safety_finding where inspection_id=i.id) then raise exception 'open findings required' using errcode='23514';end if;
 update public.safety_finding set state='ASSIGNED' where inspection_id=i.id and state='OPEN';next_version:=app_private.next_version(i.version_no,target_expected);
 perform set_config('app.m13_command',i.id::text,true);update public.safety_inspection set state='CORRECTION_PENDING',version_no=next_version,updated_at=target_time where id=i.id;
 perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.inspection.manage','SAFETY_INSPECTION',i.id,'SM-SAFETY-INSPECTION-V1',
  'EVT-SAFETY-CORRECTION-ASSIGN',i.state,'CORRECTION_PENDING',i.version_no,next_version,'SAFETY-CORRECTIONS-ASSIGNED',target_time);return next_version;end $$;
create or replace function public.submit_safety_correction(target_finding uuid,target_evidence uuid,target_summary text,target_attachment uuid,target_expected bigint,
 target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 f public.safety_finding%rowtype;i public.safety_inspection%rowtype;a public.attachment%rowtype;vu uuid;next_version bigint;seq integer;begin
 select * into strict f from public.safety_finding where id=target_finding for update;select * into strict i from public.safety_inspection where id=f.inspection_id for update;
 if app_private.required_setting('app.actor_kind')='USER' and exists(select 1 from public.user_account u where u.id=app_private.current_effective_actor_user_id() and u.account_kind='INTERNAL') then
  perform app_private.m13_assert_internal('safety.finding.correct',i.project_id,target_time,false);
  if f.correction_owner_user_id<>app_private.current_effective_actor_user_id() and not app_private.m13_is_safety_actor(app_private.current_effective_actor_user_id(),i.project_id,target_time) then raise exception 'correction owner required' using errcode='42501';end if;
 else vu:=app_private.m13_vendor_scope(i.project_id,i.contract_id,i.assigned_vendor_id,'safety.finding.correct',target_time);
  if vu is null or f.correction_owner_vendor_user_id<>vu then raise exception 'exact Vendor correction scope denied' using errcode='42501';end if;end if;
 if i.state<>'CORRECTION_PENDING' or f.state not in ('ASSIGNED','CORRECTION_SUBMITTED') then raise exception 'assigned correction required' using errcode='23514';end if;
 select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE';select coalesce(max(submission_no),0)+1 into seq from public.safety_correction_evidence where finding_id=f.id;
 insert into public.safety_correction_evidence(id,finding_id,submission_no,submitted_by_user_id,submitted_by_vendor_user_id,summary,attachment_id,attachment_row_version,
  attachment_checksum,submitted_at) values(target_evidence,f.id,seq,case when vu is null then app_private.current_effective_actor_user_id() end,vu,target_summary,a.id,a.row_version,a.detected_sha256,target_time);
 update public.safety_finding set state='CORRECTION_SUBMITTED' where id=f.id;
 if not exists(select 1 from public.safety_finding x where x.inspection_id=i.id and x.state not in ('CORRECTION_SUBMITTED','CLOSED')) then
  next_version:=app_private.next_version(i.version_no,target_expected);perform set_config('app.m13_command',i.id::text,true);
  update public.safety_inspection set state='VERIFICATION',version_no=next_version,updated_at=target_time where id=i.id;
  perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.finding.correct','SAFETY_INSPECTION',i.id,'SM-SAFETY-INSPECTION-V1',
   'EVT-SAFETY-SUBMIT-VERIFY','CORRECTION_PENDING','VERIFICATION',i.version_no,next_version,'ALL-CORRECTIONS-SUBMITTED',target_time);return next_version;
 else perform app_private.append_audit(target_audit,'safety.finding.correct','SAFETY_INSPECTION',i.id,i.version_no,'SUCCEEDED','SAFETY-CORRECTION-EVIDENCE-SUBMITTED',target_evidence,null,null,null,target_time);return i.version_no;end if;end $$;
create or replace function public.verify_safety_correction(target_finding uuid,target_evidence uuid,target_verification uuid,target_verdict text,target_summary text,
 target_attachment uuid,target_expected bigint,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare f public.safety_finding%rowtype;i public.safety_inspection%rowtype;
 a public.attachment%rowtype;next_version bigint;target_state text;event text;begin select * into strict f from public.safety_finding where id=target_finding for update;
 select * into strict i from public.safety_inspection where id=f.inspection_id for update;perform app_private.m13_assert_internal('safety.inspection.manage',i.project_id,target_time,true);
 if i.stop_work_active and not app_private.m13_is_release_authority(app_private.current_effective_actor_user_id(),target_time) then
  raise exception 'stop-work release requires Safety Manager or Lab Director' using errcode='42501';end if;
 if i.state<>'VERIFICATION' or f.state<>'CORRECTION_SUBMITTED' or not exists(select 1 from public.safety_correction_evidence e where e.id=target_evidence and e.finding_id=f.id)
  or exists(select 1 from public.safety_correction_evidence e left join public.vendor_user vu on vu.id=e.submitted_by_vendor_user_id
   where e.id=target_evidence and coalesce(e.submitted_by_user_id,vu.user_id)=app_private.current_effective_actor_user_id()) then
   raise exception 'exact submitted correction required' using errcode='23514';end if;
 select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE';
 insert into public.safety_correction_verification(id,finding_id,correction_evidence_id,verifier_user_id,verdict,summary,attachment_id,attachment_row_version,
  attachment_checksum,verified_at) values(target_verification,f.id,target_evidence,app_private.current_effective_actor_user_id(),target_verdict,target_summary,a.id,a.row_version,a.detected_sha256,target_time);
 update public.safety_finding set state=case when target_verdict='EFFECTIVE' then 'CLOSED' else 'ASSIGNED' end where id=f.id;
 if target_verdict='INEFFECTIVE' then target_state:='CORRECTION_PENDING';event:='EVT-SAFETY-VERIFY-FAIL';
 elsif exists(select 1 from public.safety_finding x where x.inspection_id=i.id and x.state<>'CLOSED') then
  perform app_private.append_audit(target_audit,'safety.inspection.manage','SAFETY_INSPECTION',i.id,i.version_no,'SUCCEEDED','SAFETY-CORRECTION-VERIFIED',target_verification,null,null,null,target_time);return i.version_no;
 else target_state:='CLOSED';event:='EVT-SAFETY-VERIFY-CLOSE';end if;
 next_version:=app_private.next_version(i.version_no,target_expected);perform set_config('app.m13_command',i.id::text,true);
 update public.safety_inspection set state=target_state,stop_work_active=case when target_state='CLOSED' then false else stop_work_active end,
  version_no=next_version,updated_at=target_time where id=i.id;
 perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.inspection.manage','SAFETY_INSPECTION',i.id,'SM-SAFETY-INSPECTION-V1',
  event,'VERIFICATION',target_state,i.version_no,next_version,case when target_state='CLOSED' then 'STOP-WORK-RELEASE-EXACT-VERIFICATION' else 'CORRECTION-INEFFECTIVE' end,target_time);return next_version;end $$;

create or replace function public.schedule_safety_training(target_id uuid,target_no text,target_project uuid,target_contract uuid,target_vendor uuid,
 target_type text,target_title text,target_scheduled timestamptz,target_retain_until date,target_audit uuid,target_outbox uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m13_assert_internal('safety.training.manage',target_project,target_time,true);
 insert into public.safety_training_session(id,training_no,project_id,contract_id,assigned_vendor_id,training_type,title,scheduled_at,state,version_no,
  retain_until,created_by_user_id,created_at) values(target_id,target_no,target_project,target_contract,target_vendor,target_type,target_title,target_scheduled,
  'PLANNED',1,target_retain_until,app_private.current_effective_actor_user_id(),target_time);
 perform app_private.m13_append_fact(target_audit,target_outbox,'safety.training.manage','SAFETY_TRAINING',target_id,1,'EVT-SAFETY-TRAINING-RECORD',
  'SAFETY-TRAINING-SCHEDULED',target_time);return target_id;end $$;
create or replace function public.record_safety_training_attendance(target_session uuid,target_attendance uuid,target_user uuid,target_vendor_user uuid,
 target_completion text,target_audit uuid,target_outbox uuid,target_time timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 s public.safety_training_session%rowtype;begin select * into strict s from public.safety_training_session where id=target_session for update;
 perform app_private.m13_assert_internal('safety.training.manage',s.project_id,target_time,true);
 if target_vendor_user is not null and not exists(select 1 from public.vendor_user vu where vu.id=target_vendor_user and vu.user_id=target_user and vu.vendor_id=s.assigned_vendor_id
  and vu.status='ACTIVE' and vu.revoked_at is null) then raise exception 'exact active Vendor attendee required' using errcode='23514';end if;
 insert into public.safety_training_attendance(id,training_session_id,user_id,vendor_user_id,completion_state,acknowledged_at,recorded_at)
 values(target_attendance,s.id,target_user,target_vendor_user,target_completion,case when target_vendor_user is null then target_time end,target_time);
 perform app_private.m13_append_fact(target_audit,target_outbox,'safety.training.manage','SAFETY_TRAINING',s.id,s.version_no,'EVT-SAFETY-TRAINING-ATTENDANCE',
  'SAFETY-TRAINING-ATTENDANCE-RECORDED',target_time);return target_attendance;end $$;
create or replace function public.acknowledge_vendor_safety_training(target_attendance uuid,target_audit uuid,target_time timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare atn public.safety_training_attendance%rowtype;s public.safety_training_session%rowtype;vu uuid;begin
 select * into strict atn from public.safety_training_attendance where id=target_attendance for update;select * into strict s from public.safety_training_session where id=atn.training_session_id;
 vu:=app_private.m13_vendor_scope(s.project_id,s.contract_id,s.assigned_vendor_id,'safety.training.acknowledge',target_time);
 if vu is null or atn.vendor_user_id<>vu or atn.user_id<>app_private.current_effective_actor_user_id() then raise exception 'exact Vendor training acknowledgement denied' using errcode='42501';end if;
 update public.safety_training_attendance set acknowledged_at=target_time where id=atn.id;
 perform app_private.append_audit(target_audit,'safety.training.acknowledge','SAFETY_TRAINING',s.id,s.version_no,'SUCCEEDED','VENDOR-SAFETY-TRAINING-ACKNOWLEDGED',atn.id,null,null,null,target_time);end $$;
create or replace function public.record_safety_training_remedial(target_id uuid,target_attendance uuid,target_due timestamptz,target_completed timestamptz,
 target_attachment uuid,target_audit uuid,target_time timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 atn public.safety_training_attendance%rowtype;s public.safety_training_session%rowtype;a public.attachment%rowtype;begin
 select * into strict atn from public.safety_training_attendance where id=target_attendance for update;select * into strict s from public.safety_training_session where id=atn.training_session_id;
 perform app_private.m13_assert_internal('safety.training.manage',s.project_id,target_time,true);if target_attachment is not null then select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE';end if;
 insert into public.safety_training_remedial(id,attendance_id,due_at,completed_at,attachment_id,attachment_row_version,attachment_checksum,recorded_by_user_id,recorded_at)
 values(target_id,atn.id,target_due,target_completed,a.id,a.row_version,a.detected_sha256,app_private.current_effective_actor_user_id(),target_time);
 update public.safety_training_attendance set completion_state=case when target_completed is null then 'REMEDIAL_REQUIRED' else 'REMEDIAL_COMPLETED' end where id=atn.id;
 perform app_private.append_audit(target_audit,'safety.training.manage','SAFETY_TRAINING',s.id,s.version_no,'SUCCEEDED','SAFETY-REMEDIAL-RECORDED',target_id,null,null,null,target_time);return target_id;end $$;

create or replace function public.report_safety_incident(target_id uuid,target_no text,target_project uuid,target_contract uuid,target_vendor uuid,
 target_occurred timestamptz,target_severity text,target_summary text,target_response text,target_site_preservation boolean,target_retain_until date,
 target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare vu uuid;begin
 if exists(select 1 from public.user_account u where u.id=app_private.current_effective_actor_user_id() and u.account_kind='INTERNAL') then
  perform app_private.m13_assert_internal('safety.incident.report',target_project,target_time,false);
 else vu:=app_private.m13_vendor_scope(target_project,target_contract,target_vendor,'safety.incident.report',target_time);
  if vu is null then raise exception 'exact Vendor incident report scope denied' using errcode='42501';end if;end if;
 insert into public.safety_incident(id,incident_no,project_id,contract_id,assigned_vendor_id,reported_by_user_id,reported_by_vendor_user_id,occurred_at,reported_at,
  severity,summary,immediate_response,site_preservation_required,investigation_due_at,state,version_no,retain_until,created_at,updated_at)
 values(target_id,target_no,target_project,target_contract,target_vendor,case when vu is null then app_private.current_effective_actor_user_id() end,vu,target_occurred,target_time,
  target_severity,target_summary,target_response,target_site_preservation,target_time+interval '48 hours','REPORTED',1,target_retain_until,target_time,target_time);
 perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.incident.report','SAFETY_INCIDENT',target_id,'SM-SAFETY-INCIDENT-V1',
  'EVT-SAFETY-INCIDENT-REPORT',null,'REPORTED',0,1,'SAFETY-INCIDENT-REPORTED',target_time);return target_id;end $$;
create or replace function public.advance_safety_incident(target_incident uuid,target_event text,target_expected bigint,target_reason text,
 target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 i public.safety_incident%rowtype;to_state text;next_version bigint;begin select * into strict i from public.safety_incident where id=target_incident for update;
 perform app_private.m13_assert_internal('safety.incident.investigate',i.project_id,target_time,true);
 to_state:=case when target_event='EVT-SAFETY-EMERGENCY-RESPOND' and i.state='REPORTED' then 'EMERGENCY_RESPONSE'
  when target_event='EVT-SAFETY-SECURE-SITE' and i.state='EMERGENCY_RESPONSE' then 'SITE_SECURED' end;
 if to_state is null or nullif(btrim(target_reason),'') is null then raise exception 'invalid direct Incident transition/evidence reason' using errcode='23514';end if;
 next_version:=app_private.next_version(i.version_no,target_expected);perform set_config('app.m13_command',i.id::text,true);
 update public.safety_incident set state=to_state,version_no=next_version,updated_at=target_time where id=i.id;
 perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.incident.investigate','SAFETY_INCIDENT',i.id,'SM-SAFETY-INCIDENT-V1',
  target_event,i.state,to_state,i.version_no,next_version,target_reason,target_time);return next_version;end $$;
create or replace function public.start_safety_incident_investigation(target_incident uuid,target_investigation uuid,target_attachment uuid,target_expected bigint,
 target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 i public.safety_incident%rowtype;a public.attachment%rowtype;next_version bigint;begin select * into strict i from public.safety_incident where id=target_incident for update;
 perform app_private.m13_assert_internal('safety.incident.investigate',i.project_id,target_time,true);if i.state<>'SITE_SECURED' then raise exception 'secured exact Incident required' using errcode='23514';end if;
 select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE';insert into public.safety_incident_investigation(id,incident_id,started_at,
  investigator_user_id,site_preservation_summary,evidence_attachment_id,evidence_attachment_row_version,evidence_attachment_checksum)
 values(target_investigation,i.id,target_time,app_private.current_effective_actor_user_id(),'SITE-PRESERVATION-EVIDENCED',a.id,a.row_version,a.detected_sha256);
 next_version:=app_private.next_version(i.version_no,target_expected);perform set_config('app.m13_command',i.id::text,true);update public.safety_incident set state='INVESTIGATION',version_no=next_version,updated_at=target_time where id=i.id;
 perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.incident.investigate','SAFETY_INCIDENT',i.id,'SM-SAFETY-INCIDENT-V1',
  'EVT-SAFETY-START-INVESTIGATION','SITE_SECURED','INVESTIGATION',i.version_no,next_version,'SAFETY-INVESTIGATION-STARTED',target_time);return next_version;end $$;
create or replace function public.set_safety_recurrence_action(target_incident uuid,target_action_id uuid,target_action_text text,target_owner_user uuid,
 target_owner_vendor_user uuid,target_due timestamptz,target_root_cause text,target_factors text,target_expected bigint,target_audit uuid,target_transition uuid,
 target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 i public.safety_incident%rowtype;inv public.safety_incident_investigation%rowtype;seq integer;next_version bigint;begin select * into strict i from public.safety_incident where id=target_incident for update;
 perform app_private.m13_assert_internal('safety.incident.investigate',i.project_id,target_time,true);select * into strict inv from public.safety_incident_investigation where incident_id=i.id for update;
 if i.state<>'INVESTIGATION' or (target_owner_vendor_user is not null and not exists(select 1 from public.vendor_user vu where vu.id=target_owner_vendor_user and vu.vendor_id=i.assigned_vendor_id)) then
  raise exception 'exact investigated Incident/owner required' using errcode='23514';end if;
 update public.safety_incident_investigation set completed_at=target_time,root_cause=target_root_cause,contributing_factors=target_factors where id=inv.id;
 select coalesce(max(sequence_no),0)+1 into seq from public.safety_recurrence_action where incident_id=i.id;
 insert into public.safety_recurrence_action(id,incident_id,sequence_no,action_text,owner_user_id,owner_vendor_user_id,due_at,state)
 values(target_action_id,i.id,seq,target_action_text,target_owner_user,target_owner_vendor_user,target_due,'PLANNED');
 next_version:=app_private.next_version(i.version_no,target_expected);perform set_config('app.m13_command',i.id::text,true);update public.safety_incident set state='RECURRENCE_ACTION',version_no=next_version,updated_at=target_time where id=i.id;
 perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.incident.investigate','SAFETY_INCIDENT',i.id,'SM-SAFETY-INCIDENT-V1',
  'EVT-SAFETY-SET-RECURRENCE-ACTION','INVESTIGATION','RECURRENCE_ACTION',i.version_no,next_version,'RECURRENCE-ACTION-SET',target_time);return next_version;end $$;
create or replace function public.submit_safety_recurrence_action(target_action uuid,target_attachment uuid,target_expected bigint,target_audit uuid,
 target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 arow public.safety_recurrence_action%rowtype;i public.safety_incident%rowtype;a public.attachment%rowtype;vu uuid;next_version bigint;begin
 select * into strict arow from public.safety_recurrence_action where id=target_action for update;select * into strict i from public.safety_incident where id=arow.incident_id for update;
 if exists(select 1 from public.user_account u where u.id=app_private.current_effective_actor_user_id() and u.account_kind='INTERNAL') then
  perform app_private.m13_assert_internal('safety.recurrence.submit',i.project_id,target_time,false);
  if arow.owner_user_id<>app_private.current_effective_actor_user_id() and not app_private.m13_is_safety_actor(app_private.current_effective_actor_user_id(),i.project_id,target_time) then raise exception 'recurrence owner required' using errcode='42501';end if;
 else vu:=app_private.m13_vendor_scope(i.project_id,i.contract_id,i.assigned_vendor_id,'safety.recurrence.submit',target_time);
  if vu is null or arow.owner_vendor_user_id<>vu then raise exception 'exact Vendor recurrence scope denied' using errcode='42501';end if;end if;
 if i.state<>'RECURRENCE_ACTION' or arow.state not in ('PLANNED','IN_PROGRESS') then raise exception 'active recurrence action required' using errcode='23514';end if;
 select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE';update public.safety_recurrence_action set state='SUBMITTED',
  completion_evidence_attachment_id=a.id,completion_evidence_row_version=a.row_version,completion_evidence_checksum=a.detected_sha256 where id=arow.id;
 if not exists(select 1 from public.safety_recurrence_action x where x.incident_id=i.id and x.state<>'SUBMITTED') then
  next_version:=app_private.next_version(i.version_no,target_expected);perform set_config('app.m13_command',i.id::text,true);update public.safety_incident set state='VERIFICATION',version_no=next_version,updated_at=target_time where id=i.id;
  perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.recurrence.submit','SAFETY_INCIDENT',i.id,'SM-SAFETY-INCIDENT-V1',
   'EVT-SAFETY-SUBMIT-VERIFY','RECURRENCE_ACTION','VERIFICATION',i.version_no,next_version,'RECURRENCE-ACTIONS-SUBMITTED',target_time);return next_version;
 else perform app_private.append_audit(target_audit,'safety.recurrence.submit','SAFETY_INCIDENT',i.id,i.version_no,'SUCCEEDED','RECURRENCE-EVIDENCE-SUBMITTED',a.id,null,null,null,target_time);return i.version_no;end if;end $$;
create or replace function public.verify_safety_recurrence_action(target_action uuid,target_verification uuid,target_verdict text,target_summary text,
 target_attachment uuid,target_audit uuid,target_time timestamptz) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 arow public.safety_recurrence_action%rowtype;i public.safety_incident%rowtype;a public.attachment%rowtype;begin select * into strict arow from public.safety_recurrence_action where id=target_action for update;
 select * into strict i from public.safety_incident where id=arow.incident_id;perform app_private.m13_assert_internal('safety.incident.investigate',i.project_id,target_time,true);
 if i.state<>'VERIFICATION' or arow.state<>'SUBMITTED' then raise exception 'submitted recurrence action required' using errcode='23514';end if;
 select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE';insert into public.safety_recurrence_verification(id,action_id,verifier_user_id,
  verdict,summary,attachment_id,attachment_row_version,attachment_checksum,verified_at) values(target_verification,arow.id,app_private.current_effective_actor_user_id(),
  target_verdict,target_summary,a.id,a.row_version,a.detected_sha256,target_time);update public.safety_recurrence_action set state=case when target_verdict='EFFECTIVE' then 'VERIFIED' else 'INEFFECTIVE' end where id=arow.id;
 perform app_private.append_audit(target_audit,'safety.incident.investigate','SAFETY_INCIDENT',i.id,i.version_no,'SUCCEEDED','RECURRENCE-ACTION-VERIFIED',target_verification,null,null,null,target_time);return target_verification;end $$;
create or replace function public.close_safety_incident(target_incident uuid,target_expected bigint,target_reason text,target_audit uuid,target_transition uuid,
 target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare i public.safety_incident%rowtype;next_version bigint;begin
 select * into strict i from public.safety_incident where id=target_incident for update;perform app_private.m13_assert_internal('safety.incident.close',i.project_id,target_time,true);
 if not app_private.m13_has_position(app_private.current_effective_actor_user_id(),'POSITION_LAB_DIRECTOR',target_time) or i.state<>'VERIFICATION'
  or not exists(select 1 from public.safety_recurrence_action x where x.incident_id=i.id)
  or exists(select 1 from public.safety_recurrence_action x where x.incident_id=i.id and x.state<>'VERIFIED') then raise exception 'Director and all effective recurrence verification required' using errcode='42501';end if;
 next_version:=app_private.next_version(i.version_no,target_expected);perform set_config('app.m13_command',i.id::text,true);update public.safety_incident set state='CLOSED',version_no=next_version,updated_at=target_time where id=i.id;
 perform app_private.m13_append_transition(target_audit,target_transition,target_outbox,'safety.incident.close','SAFETY_INCIDENT',i.id,'SM-SAFETY-INCIDENT-V1',
  'EVT-SAFETY-CLOSE','VERIFICATION','CLOSED',i.version_no,next_version,target_reason,target_time);return next_version;end $$;
create or replace function public.emit_safety_48h_alert(target_id uuid,target_incident uuid,target_key text,target_audit uuid,target_outbox uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare i public.safety_incident%rowtype;begin
 perform app_private.m05_assert_worker(target_time,'SAFETY_SLA_MONITOR');select * into strict i from public.safety_incident where id=target_incident for share;
 if i.state='CLOSED' or i.investigation_due_at>=target_time or exists(select 1 from public.safety_incident_investigation x where x.incident_id=i.id and x.completed_at is not null) then
  raise exception '48-hour overdue facts do not match' using errcode='23514';end if;
 insert into public.safety_alert(id,incident_id,alert_kind,idempotency_key,detected_at) values(target_id,i.id,'INVESTIGATION_48H_OVERDUE',target_key,target_time)
 on conflict(idempotency_key) do nothing;if not found then return (select id from public.safety_alert where idempotency_key=target_key);end if;
 perform app_private.m13_append_fact(target_audit,target_outbox,'safety.alert.emit','SAFETY_INCIDENT',i.id,i.version_no,'EVT-SAFETY-INCIDENT-SLA-ALERT',
 'SAFETY-INVESTIGATION-48H-OVERDUE',target_time);return target_id;end $$;
create or replace function public.grant_vendor_safety_action(target_project_allowlist uuid,target_contract_allowlist uuid,target_vendor_user uuid,
 target_project uuid,target_contract uuid,target_action text,target_from timestamptz,target_until timestamptz,target_reason text,target_audit uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare target_vendor uuid;begin
 perform app_private.m13_assert_internal('safety.assignment.manage',target_project,target_time,true);
 if not exists(select 1 from public.permission p where p.stable_code=target_action and p.status='ACTIVE') then raise exception 'active Safety action required' using errcode='23514';end if;
 select vu.vendor_id into strict target_vendor from public.vendor_user vu join public.vendor v on v.id=vu.vendor_id and v.status='ACTIVE'
  where vu.id=target_vendor_user and vu.status='ACTIVE' and vu.revoked_at is null and vu.valid_from<=target_from
   and (vu.valid_until is null or vu.valid_until>target_from);
 if not exists(select 1 from public.project_vendor_grant g
  where g.project_id=target_project and g.vendor_user_id=target_vendor_user and g.status='ACTIVE' and g.revoked_at is null and g.valid_from<=target_from
   and (g.valid_until is null or g.valid_until>target_from)) then raise exception 'base exact Project grant required' using errcode='23514';end if;
 insert into public.safety_vendor_project_allowlist(id,vendor_user_id,project_id,action_id,valid_from,valid_until,granted_by_user_id,reason_code)
 values(target_project_allowlist,target_vendor_user,target_project,target_action,target_from,target_until,app_private.current_effective_actor_user_id(),target_reason);
 if target_contract is not null then
  if target_contract_allowlist is null or not exists(select 1 from public.contract_vendor_grant g
   where g.contract_id=target_contract and g.project_id=target_project and g.vendor_user_id=target_vendor_user and g.status='ACTIVE' and g.revoked_at is null
    and g.valid_from<=target_from and (g.valid_until is null or g.valid_until>target_from)) then raise exception 'base exact Contract grant required' using errcode='23514';end if;
   insert into public.safety_vendor_contract_allowlist(id,vendor_user_id,vendor_id,contract_id,project_id,action_id,valid_from,valid_until,granted_by_user_id,reason_code)
   values(target_contract_allowlist,target_vendor_user,target_vendor,target_contract,target_project,target_action,target_from,target_until,app_private.current_effective_actor_user_id(),target_reason);
 end if;
 perform app_private.append_audit(target_audit,'safety.assignment.manage','SAFETY_VENDOR_ALLOWLIST',target_project_allowlist,1,'SUCCEEDED',target_reason,target_vendor_user,null,null,null,target_time);
 return target_project_allowlist;end $$;

create or replace function app_private.m13_can_read_internal(target_project uuid,target_time timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private as $$ select exists(
 select 1 from public.user_account u where u.id=app_private.current_actor_user_id() and u.account_kind='INTERNAL' and u.status='ACTIVE'
  and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time))
 and not app_private.m13_is_admin(app_private.current_actor_user_id(),target_time)
 and app_private.actor_has_project_internal_scope(target_project,target_time)
 and app_private.m13_is_safety_actor(app_private.current_effective_actor_user_id(),target_project,target_time) $$;
create or replace function public.read_safety_internal_summary(target_project uuid,target_time timestamptz)
returns table(record_kind text,record_id uuid,record_no text,state text,due_at timestamptz,severity text,version_no bigint)
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$ begin
 if target_time is distinct from app_private.request_time() or not app_private.m13_can_read_internal(target_project,target_time) then raise exception 'Safety internal summary denied' using errcode='42501';end if;
 return query select 'INSPECTION',i.id,i.inspection_no,i.state,i.scheduled_at,null::text,i.version_no from public.safety_inspection i where i.project_id=target_project
 union all select 'INCIDENT',x.id,x.incident_no,x.state,x.investigation_due_at,x.severity,x.version_no from public.safety_incident x where x.project_id=target_project
 union all select 'TRAINING',t.id,t.training_no,t.state,t.scheduled_at,null::text,t.version_no from public.safety_training_session t where t.project_id=target_project;end $$;
create or replace function public.read_vendor_safety_tasks(target_project uuid,target_time timestamptz)
returns table(task_kind text,task_id uuid,contract_id uuid,state text,due_at timestamptz,instruction text)
language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$ begin
 if target_time is distinct from app_private.request_time() then raise exception 'trusted request time required' using errcode='22023';end if;
 return query select 'CORRECTION',f.id,i.contract_id,f.state,f.due_at,f.description from public.safety_finding f join public.safety_inspection i on i.id=f.inspection_id
  where i.project_id=target_project and f.correction_owner_vendor_user_id=app_private.m13_vendor_scope(i.project_id,i.contract_id,i.assigned_vendor_id,'safety.finding.correct',target_time)
 union all select 'TRAINING',a.id,s.contract_id,a.completion_state,s.scheduled_at,s.title from public.safety_training_attendance a join public.safety_training_session s on s.id=a.training_session_id
  where s.project_id=target_project and a.vendor_user_id=app_private.m13_vendor_scope(s.project_id,s.contract_id,s.assigned_vendor_id,'safety.training.acknowledge',target_time)
 union all select 'RECURRENCE',r.id,x.contract_id,r.state,r.due_at,r.action_text from public.safety_recurrence_action r join public.safety_incident x on x.id=r.incident_id
  where x.project_id=target_project and r.owner_vendor_user_id=app_private.m13_vendor_scope(x.project_id,x.contract_id,x.assigned_vendor_id,'safety.recurrence.submit',target_time);end $$;

do $rls$ declare t text;begin foreach t in array array['safety_manager_assignment','safety_vendor_project_allowlist','safety_vendor_contract_allowlist',
 'safety_inspection','safety_inspection_item','safety_finding','safety_correction_evidence','safety_correction_verification','safety_training_session',
 'safety_training_attendance','safety_training_remedial','safety_incident','safety_incident_investigation','safety_recurrence_action','safety_recurrence_verification','safety_alert'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);end loop;end $rls$;
create policy safety_inspection_internal_read on public.safety_inspection for select to youone_request using(app_private.m13_can_read_internal(project_id,app_private.request_time()));
create policy safety_item_internal_read on public.safety_inspection_item for select to youone_request using(exists(select 1 from public.safety_inspection i where i.id=inspection_id and app_private.m13_can_read_internal(i.project_id,app_private.request_time())));
create policy safety_finding_internal_read on public.safety_finding for select to youone_request using(exists(select 1 from public.safety_inspection i where i.id=inspection_id and app_private.m13_can_read_internal(i.project_id,app_private.request_time())));
create policy safety_training_internal_read on public.safety_training_session for select to youone_request using(app_private.m13_can_read_internal(project_id,app_private.request_time()));
create policy safety_incident_internal_read on public.safety_incident for select to youone_request using(app_private.m13_can_read_internal(project_id,app_private.request_time()));
do $revoke$ declare t text;begin foreach t in array array['safety_manager_assignment','safety_vendor_project_allowlist','safety_vendor_contract_allowlist',
 'safety_inspection','safety_inspection_item','safety_finding','safety_correction_evidence','safety_correction_verification','safety_training_session',
 'safety_training_attendance','safety_training_remedial','safety_incident','safety_incident_investigation','safety_recurrence_action','safety_recurrence_verification','safety_alert'] loop
 execute format('revoke all on table public.%I from public,youone_request,youone_privileged_writer',t);end loop;end $revoke$;
grant select on public.safety_inspection,public.safety_inspection_item,public.safety_finding,public.safety_training_session,public.safety_incident to youone_request;
do $commands$ declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in(
 'designate_safety_manager','grant_vendor_safety_action','create_safety_inspection','add_safety_inspection_item','start_safety_inspection','issue_safety_finding',
 'close_clear_safety_inspection','cancel_safety_inspection',
 'assign_safety_corrections','submit_safety_correction','verify_safety_correction','schedule_safety_training','record_safety_training_attendance',
 'acknowledge_vendor_safety_training','record_safety_training_remedial','report_safety_incident','advance_safety_incident','start_safety_incident_investigation',
 'set_safety_recurrence_action','submit_safety_recurrence_action','verify_safety_recurrence_action','close_safety_incident','read_safety_internal_summary','read_vendor_safety_tasks') loop
 execute format('revoke all on function %s from public,youone_request,youone_privileged_writer',f.signature);execute format('grant execute on function %s to youone_request',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='emit_safety_48h_alert' loop
 execute format('revoke all on function %s from public,youone_request,youone_privileged_writer',f.signature);execute format('grant execute on function %s to youone_privileged_writer',f.signature);end loop;end $commands$;
revoke all on function app_private.m13_reject_append_only(),app_private.m13_guard_retention(),app_private.m13_guard_command(),
 app_private.m13_has_position(uuid,text,timestamptz),app_private.m13_is_admin(uuid,timestamptz),app_private.m13_is_safety_actor(uuid,uuid,timestamptz),
 app_private.m13_is_release_authority(uuid,timestamptz),
 app_private.m13_assert_internal(text,uuid,timestamptz,boolean),app_private.m13_vendor_scope(uuid,uuid,uuid,text,timestamptz),
 app_private.m13_append_transition(uuid,uuid,uuid,text,text,uuid,text,text,text,text,bigint,bigint,text,timestamptz),
 app_private.m13_append_fact(uuid,uuid,text,text,uuid,bigint,text,text,timestamptz),app_private.m13_can_read_internal(uuid,timestamptz)
from public,youone_request,youone_privileged_writer;
grant execute on function app_private.m13_can_read_internal(uuid,timestamptz) to youone_request;

comment on table public.safety_incident is '48-hour investigation SLA is an internal-regulation deadline; alerts never fabricate investigation completion.';
comment on table public.safety_manager_assignment is 'Only an active POSITION_LAB_DIRECTOR designation command may create this effective-dated assignment.';
