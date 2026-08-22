-- M12 Research Note light: dedicated Senior review and Lab Director finalization.
-- No generic Approval instance and no Representative step is part of this machine.

insert into public.permission(id,stable_code,status) values
 ('3c000000-0000-4000-8000-000000000001','research_note.record.create','ACTIVE'),
 ('3c000000-0000-4000-8000-000000000002','research_note.record.review','ACTIVE'),
 ('3c000000-0000-4000-8000-000000000003','research_note.record.finalize','ACTIVE'),
 ('3c000000-0000-4000-8000-000000000004','research_note.record.correct','ACTIVE'),
 ('3c000000-0000-4000-8000-000000000005','research_note.record.read','ACTIVE')
on conflict do nothing;
insert into public.action_definition(action_id) values
 ('research_note.record.create'),('research_note.record.review'),('research_note.record.finalize'),
 ('research_note.record.correct'),('research_note.record.read'),('research_note.pdf.render')
on conflict do nothing;
insert into public.aggregate_type_definition(aggregate_type) values ('RESEARCH_NOTE') on conflict do nothing;
insert into public.domain_event_definition(event_id,payload_schema_id,payload_schema_version) values
 ('EVT-NOTE-CREATE','RESEARCH_NOTE_EVENT_REF',1),('EVT-NOTE-SUBMIT-SENIOR','RESEARCH_NOTE_EVENT_REF',1),
 ('EVT-NOTE-SUBMIT-DIRECTOR','RESEARCH_NOTE_EVENT_REF',1),('EVT-NOTE-REQUEST-REVISION','RESEARCH_NOTE_EVENT_REF',1),
 ('EVT-NOTE-RESUBMIT','RESEARCH_NOTE_EVENT_REF',1),('EVT-NOTE-REVIEWED','RESEARCH_NOTE_EVENT_REF',1),
 ('EVT-NOTE-FINALIZE','RESEARCH_NOTE_EVENT_REF',1),('EVT-NOTE-ADD-CORRECTION','RESEARCH_NOTE_EVENT_REF',1),
 ('EVT-NOTE-PDF-RENDERED','RESEARCH_NOTE_EVENT_REF',1)
on conflict do nothing;
insert into public.state_machine_definition(machine_id,aggregate_type) values ('SM-RESEARCH-NOTE-V1','RESEARCH_NOTE') on conflict do nothing;
insert into public.state_definition(machine_id,state_id,is_terminal) values
 ('SM-RESEARCH-NOTE-V1','DRAFT',false),('SM-RESEARCH-NOTE-V1','SENIOR_REVIEW_PENDING',false),
 ('SM-RESEARCH-NOTE-V1','REVISION_REQUIRED',false),('SM-RESEARCH-NOTE-V1','DIRECTOR_FINALIZATION_PENDING',false),
 ('SM-RESEARCH-NOTE-V1','FINALIZED',false),('SM-RESEARCH-NOTE-V1','CORRECTED_BY_ADDENDUM',true),
 ('SM-RESEARCH-NOTE-V1','VOIDED_BY_POLICY',true)
on conflict do nothing;
insert into public.transition_definition(machine_id,event_id,from_state,to_state) values
 ('SM-RESEARCH-NOTE-V1','EVT-NOTE-CREATE',null,'DRAFT'),
 ('SM-RESEARCH-NOTE-V1','EVT-NOTE-SUBMIT-SENIOR','DRAFT','SENIOR_REVIEW_PENDING'),
 ('SM-RESEARCH-NOTE-V1','EVT-NOTE-SUBMIT-DIRECTOR','DRAFT','DIRECTOR_FINALIZATION_PENDING'),
 ('SM-RESEARCH-NOTE-V1','EVT-NOTE-REQUEST-REVISION','SENIOR_REVIEW_PENDING','REVISION_REQUIRED'),
 ('SM-RESEARCH-NOTE-V1','EVT-NOTE-RESUBMIT','REVISION_REQUIRED','SENIOR_REVIEW_PENDING'),
 ('SM-RESEARCH-NOTE-V1','EVT-NOTE-RESUBMIT','REVISION_REQUIRED','DIRECTOR_FINALIZATION_PENDING'),
 ('SM-RESEARCH-NOTE-V1','EVT-NOTE-REVIEWED','SENIOR_REVIEW_PENDING','DIRECTOR_FINALIZATION_PENDING'),
 ('SM-RESEARCH-NOTE-V1','EVT-NOTE-FINALIZE','DIRECTOR_FINALIZATION_PENDING','FINALIZED'),
 ('SM-RESEARCH-NOTE-V1','EVT-NOTE-ADD-CORRECTION','FINALIZED','CORRECTED_BY_ADDENDUM')
on conflict do nothing;

create table public.research_note (
 id uuid primary key,note_no text not null unique check(length(note_no) between 1 and 100),
 project_id uuid not null references public.project(id),rnd_program_id uuid references public.rnd_program(id),
 author_user_id uuid not null references public.user_account(id),assigned_senior_user_id uuid references public.user_account(id),
 current_entry_version_id uuid not null,current_entry_no bigint not null check(current_entry_no>0),
 security_level text not null check(security_level in ('SEC_L1_PUBLIC_GENERAL','SEC_L2_INTERNAL','SEC_L3_CONFIDENTIAL','SEC_L4_CORE_SECRET')),
 state text not null check(state in ('DRAFT','SENIOR_REVIEW_PENDING','REVISION_REQUIRED','DIRECTOR_FINALIZATION_PENDING','FINALIZED','CORRECTED_BY_ADDENDUM','VOIDED_BY_POLICY')),
 version_no bigint not null check(version_no>0),created_at timestamptz not null,updated_at timestamptz not null,
 unique(id,current_entry_version_id,current_entry_no)
);
create table public.research_note_entry_version (
 id uuid primary key,research_note_id uuid not null references public.research_note(id) deferrable initially deferred,
 entry_no bigint not null check(entry_no>0),entry_kind text not null check(entry_kind in ('ORIGINAL','CORRECTION','ADDENDUM')),
 prior_entry_version_id uuid unique,corrects_entry_version_id uuid,
 research_date date not null,title text not null check(length(title) between 1 and 500),
 objective text not null check(length(objective) between 1 and 10000),method text not null check(length(method) between 1 and 20000),
 observations text not null check(length(observations) between 1 and 40000),results text not null check(length(results) between 1 and 40000),
 conclusion text not null check(length(conclusion) between 1 and 20000),correction_reason text,
 content_checksum text not null check(app_private.is_sha256(content_checksum)),
 state text not null check(state in ('DRAFT','SEALED','FINALIZED','ADDENDUM_SEALED')),
 sealed_snapshot_checksum text check(sealed_snapshot_checksum is null or app_private.is_sha256(sealed_snapshot_checksum)),sealed_at timestamptz,
 created_by_user_id uuid not null references public.user_account(id),created_at timestamptz not null,
 unique(research_note_id,entry_no),unique(id,research_note_id),unique(id,research_note_id,entry_no),
 unique(id,research_note_id,entry_no,sealed_snapshot_checksum,sealed_at),
 foreign key(prior_entry_version_id,research_note_id) references public.research_note_entry_version(id,research_note_id),
 foreign key(corrects_entry_version_id,research_note_id) references public.research_note_entry_version(id,research_note_id),
 check((entry_no=1 and entry_kind='ORIGINAL' and prior_entry_version_id is null and corrects_entry_version_id is null)
   or (entry_no>1 and entry_kind='ORIGINAL' and prior_entry_version_id is not null and corrects_entry_version_id is null)
   or (entry_no>1 and entry_kind in ('CORRECTION','ADDENDUM') and prior_entry_version_id is not null and corrects_entry_version_id is not null)),
 check((entry_kind in ('CORRECTION','ADDENDUM'))=(correction_reason is not null)),
 check((state='DRAFT' and sealed_snapshot_checksum is null and sealed_at is null)
   or (state<>'DRAFT' and sealed_snapshot_checksum is not null and sealed_at is not null))
);
alter table public.research_note add constraint research_note_current_entry_fk
 foreign key(current_entry_version_id,id,current_entry_no) references public.research_note_entry_version(id,research_note_id,entry_no) deferrable initially deferred;

create table public.research_note_entry_attachment (
 entry_version_id uuid not null references public.research_note_entry_version(id),attachment_id uuid not null,
 attachment_row_version bigint not null,attachment_checksum text not null check(app_private.is_sha256(attachment_checksum)),
 purpose_code text not null check(app_private.is_stable_code(purpose_code)),linked_by_user_id uuid not null references public.user_account(id),linked_at timestamptz not null,
 primary key(entry_version_id,attachment_id),unique(entry_version_id,purpose_code,attachment_id),
 foreign key(attachment_id,attachment_row_version,attachment_checksum) references public.attachment(id,row_version,detected_sha256)
);
create table public.research_note_senior_review (
 id uuid primary key,research_note_id uuid not null,entry_version_id uuid not null,entry_no bigint not null,
 entry_checksum text not null check(app_private.is_sha256(entry_checksum)),entry_sealed_at timestamptz not null,
 reviewer_user_id uuid not null references public.user_account(id),position_assignment_id uuid not null references public.user_position_assignment(id),
 outcome text not null check(outcome in ('REVIEWED','REVISION_REQUESTED')),opinion text not null check(length(opinion) between 1 and 10000),reviewed_at timestamptz not null,
 unique(research_note_id,entry_version_id),
 foreign key(entry_version_id,research_note_id,entry_no,entry_checksum,entry_sealed_at)
  references public.research_note_entry_version(id,research_note_id,entry_no,sealed_snapshot_checksum,sealed_at)
);
alter table public.user_position_assignment add constraint user_position_assignment_m12_exact_unique unique(id,user_id);
alter table public.research_note_senior_review add constraint research_note_senior_assignment_exact_fk
 foreign key(position_assignment_id,reviewer_user_id) references public.user_position_assignment(id,user_id);
create table public.research_note_finalization (
 id uuid primary key,research_note_id uuid not null unique,entry_version_id uuid not null unique,entry_no bigint not null,
 entry_checksum text not null check(app_private.is_sha256(entry_checksum)),entry_sealed_at timestamptz not null,
 director_user_id uuid not null references public.user_account(id),director_position_assignment_id uuid not null references public.user_position_assignment(id),
 finalized_at timestamptz not null,unique(id,research_note_id),
 foreign key(entry_version_id,research_note_id,entry_no,entry_checksum,entry_sealed_at)
  references public.research_note_entry_version(id,research_note_id,entry_no,sealed_snapshot_checksum,sealed_at)
);
alter table public.research_note_finalization add constraint research_note_director_assignment_exact_fk
 foreign key(director_position_assignment_id,director_user_id) references public.user_position_assignment(id,user_id);
create table public.research_note_pdf_manifest (
 id uuid primary key,research_note_id uuid not null,finalization_id uuid not null,entry_version_id uuid not null,entry_no bigint not null,
 entry_checksum text not null check(app_private.is_sha256(entry_checksum)),entry_sealed_at timestamptz not null,
 manifest_schema text not null default 'RESEARCH_NOTE_PDF_MANIFEST_V1' check(manifest_schema='RESEARCH_NOTE_PDF_MANIFEST_V1'),
 renderer_id text not null check(app_private.is_stable_code(renderer_id)),renderer_version text not null check(app_private.is_stable_code(renderer_version)),
 page_count integer not null check(page_count>0),pdf_checksum text not null check(app_private.is_sha256(pdf_checksum)),
 manifest_checksum text not null check(app_private.is_sha256(manifest_checksum)),
 attachment_id uuid not null,attachment_row_version bigint not null,attachment_checksum text not null check(app_private.is_sha256(attachment_checksum)),
 rendered_at timestamptz not null,unique(entry_version_id),unique(id,entry_version_id),
 foreign key(finalization_id,research_note_id) references public.research_note_finalization(id,research_note_id),
 foreign key(entry_version_id,research_note_id,entry_no,entry_checksum,entry_sealed_at)
  references public.research_note_entry_version(id,research_note_id,entry_no,sealed_snapshot_checksum,sealed_at),
 foreign key(attachment_id,attachment_row_version,attachment_checksum) references public.attachment(id,row_version,detected_sha256),
 check(pdf_checksum=attachment_checksum)
);

create or replace function app_private.m12_reject_immutable()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin raise exception 'final ResearchNote evidence is append-only' using errcode='55000';end $$;
do $immutable$ declare t text;begin foreach t in array array['research_note_senior_review','research_note_pdf_manifest','research_note_finalization'] loop
 execute format('create trigger %I before update or delete on public.%I for each row execute function app_private.m12_reject_immutable()','m12_'||t||'_immutable',t);end loop;end $immutable$;
create or replace function app_private.m12_guard_note()
returns trigger language plpgsql set search_path=pg_catalog,app_private as $$ begin
 if tg_op='DELETE' then raise exception 'ResearchNote history is retained' using errcode='55000';end if;
 if app_private.optional_setting('app.m12_note_command') is distinct from old.id::text then raise exception 'ResearchNote update requires trusted command' using errcode='42501';end if;
 return new;end $$;
create trigger research_note_guard before update or delete on public.research_note for each row execute function app_private.m12_guard_note();
create or replace function app_private.m12_guard_entry()
returns trigger language plpgsql set search_path=pg_catalog,app_private as $$ begin
 if tg_op='DELETE' then raise exception 'ResearchNoteEntry history is retained' using errcode='55000';end if;
 if app_private.optional_setting('app.m12_entry_command') is distinct from old.id::text then raise exception 'ResearchNoteEntry update requires trusted command' using errcode='42501';end if;
 if old.state<>'DRAFT' and (to_jsonb(new)-array['state']::text[]) is distinct from (to_jsonb(old)-array['state']::text[]) then
  raise exception 'sealed ResearchNoteEntry is immutable' using errcode='55000';end if;return new;end $$;
create trigger research_note_entry_guard before update or delete on public.research_note_entry_version for each row execute function app_private.m12_guard_entry();
create or replace function app_private.m12_guard_entry_attachment()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare eid uuid:=coalesce(new.entry_version_id,old.entry_version_id);s text;begin
 select state into strict s from public.research_note_entry_version where id=eid;
 if s<>'DRAFT' or app_private.optional_setting('app.m12_entry_command') is distinct from eid::text then
  raise exception 'sealed ResearchNote attachment manifest is immutable' using errcode='55000';end if;return coalesce(new,old);end $$;
create trigger research_note_attachment_guard before insert or update or delete on public.research_note_entry_attachment
 for each row execute function app_private.m12_guard_entry_attachment();

create or replace function app_private.m12_has_position(target_user uuid,target_position text,target_time timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select exists(
 select 1 from public.user_position_assignment a join public.position p on p.id=a.position_id and p.stable_code=target_position and p.status='ACTIVE'
 where a.user_id=target_user and a.revoked_at is null and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time)) $$;
create or replace function app_private.m12_is_admin(target_user uuid,target_time timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select exists(
 select 1 from public.user_role_assignment a join public.role r on r.id=a.role_id and r.stable_code='ADMIN_SYSTEM' and r.status='ACTIVE'
 where a.user_id=target_user and a.revoked_at is null and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time)) $$;
create or replace function app_private.m12_assert_user(target_permission text,target_time timestamptz)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.m08_assert_direct_internal(target_time,target_permission);
 if app_private.m12_is_admin(app_private.current_effective_actor_user_id(),target_time)
  or app_private.m12_has_position(app_private.current_effective_actor_user_id(),'POSITION_REPRESENTATIVE',target_time) then
  raise exception 'Admin-System and Representative ResearchNote source command denied' using errcode='42501';end if;
end $$;
create or replace function app_private.m12_append_transition(target_audit uuid,target_transition uuid,target_outbox uuid,target_action text,
 target_id uuid,target_event text,target_from text,target_to text,target_from_version bigint,target_to_version bigint,target_reason text,target_time timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ begin
 perform app_private.append_audit(target_audit,target_action,'RESEARCH_NOTE',target_id,target_to_version,'SUCCEEDED',coalesce(target_reason,target_event),null,null,null,null,target_time);
 perform app_private.append_state_transition(target_transition,target_audit,'RESEARCH_NOTE',target_id,'SM-RESEARCH-NOTE-V1',target_event,target_from,target_to,
  target_from_version,target_to_version,coalesce(target_reason,target_event),null,app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_time);
 perform app_private.enqueue_outbox(target_outbox,target_audit,target_event,'RESEARCH_NOTE',target_id,target_to_version,
  app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),'RESEARCH_NOTE_EVENT_REF',1,
  jsonb_build_object('aggregateId',target_id,'resourceVersion',target_to_version,'eventId',target_event),target_event||':'||target_id::text||':'||target_to_version::text,target_time,target_time);
end $$;
create or replace function app_private.m12_compute_content_checksum(target_entry uuid)
returns text language sql stable security definer set search_path=pg_catalog,public,app_private as $$
 select app_private.canonical_json_sha256(jsonb_build_object('schema','RESEARCH_NOTE_ENTRY_CONTENT_V1','id',e.id,'noteId',e.research_note_id,
  'entryNo',e.entry_no,'kind',e.entry_kind,'priorId',e.prior_entry_version_id,'correctsId',e.corrects_entry_version_id,'researchDate',e.research_date,
  'title',e.title,'objective',e.objective,'method',e.method,'observations',e.observations,'results',e.results,'conclusion',e.conclusion,'reason',e.correction_reason))
 from public.research_note_entry_version e where e.id=target_entry $$;
create or replace function app_private.m12_compute_snapshot_checksum(target_entry uuid)
returns text language sql stable security definer set search_path=pg_catalog,public,app_private as $$
 select app_private.canonical_json_sha256(jsonb_build_object('schema','RESEARCH_NOTE_ENTRY_SNAPSHOT_V1','contentChecksum',e.content_checksum,
  'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.attachment_id,'rowVersion',a.attachment_row_version,'checksum',a.attachment_checksum,
   'purpose',a.purpose_code) order by a.purpose_code,a.attachment_id) from public.research_note_entry_attachment a where a.entry_version_id=e.id),'[]'::jsonb)))
 from public.research_note_entry_version e where e.id=target_entry $$;

create or replace function public.create_research_note(target_note uuid,target_entry uuid,target_note_no text,target_project uuid,target_rnd_program uuid,
 target_assigned_senior uuid,target_security text,target_research_date date,target_title text,target_objective text,target_method text,
 target_observations text,target_results text,target_conclusion text,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare checksum text;begin
 perform app_private.m12_assert_user('research_note.record.create',target_time);
 if not app_private.actor_has_project_internal_scope(target_project,target_time) then raise exception 'exact Project scope required' using errcode='42501';end if;
 if target_rnd_program is not null and not exists(select 1 from public.project_rnd_program x where x.project_id=target_project and x.rnd_program_id=target_rnd_program
  and x.valid_from<=target_research_date and (x.valid_until is null or x.valid_until>=target_research_date)) then raise exception 'exact Project/RndProgram link required' using errcode='23514';end if;
 if target_assigned_senior is not null and not app_private.m12_has_position(target_assigned_senior,'POSITION_SENIOR_RESEARCHER',target_time) then
  raise exception 'assigned Senior position must be active' using errcode='23514';end if;
 insert into public.research_note(id,note_no,project_id,rnd_program_id,author_user_id,assigned_senior_user_id,current_entry_version_id,current_entry_no,
  security_level,state,version_no,created_at,updated_at) values(target_note,target_note_no,target_project,target_rnd_program,
  app_private.current_effective_actor_user_id(),target_assigned_senior,target_entry,1,target_security,'DRAFT',1,target_time,target_time);
 insert into public.research_note_entry_version(id,research_note_id,entry_no,entry_kind,research_date,title,objective,method,observations,results,conclusion,
  content_checksum,state,created_by_user_id,created_at) values(target_entry,target_note,1,'ORIGINAL',target_research_date,target_title,target_objective,target_method,
  target_observations,target_results,target_conclusion,repeat('0',64),'DRAFT',app_private.current_effective_actor_user_id(),target_time);
 checksum:=app_private.m12_compute_content_checksum(target_entry);perform set_config('app.m12_entry_command',target_entry::text,true);
 update public.research_note_entry_version set content_checksum=checksum where id=target_entry;
 perform app_private.m12_append_transition(target_audit,target_transition,target_outbox,'research_note.record.create',target_note,'EVT-NOTE-CREATE',null,'DRAFT',0,1,'RESEARCH-NOTE-CREATED',target_time);return target_note;
end $$;
create or replace function public.add_research_note_attachment(target_note uuid,target_attachment uuid,target_purpose text,target_audit uuid,target_time timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare n public.research_note%rowtype;a public.attachment%rowtype;begin
 perform app_private.m12_assert_user('research_note.record.create',target_time);select * into strict n from public.research_note where id=target_note for update;
 if n.author_user_id<>app_private.current_effective_actor_user_id() or n.state<>'DRAFT' then raise exception 'author Draft required' using errcode='42501';end if;
 select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE' and security_level=n.security_level;
 perform set_config('app.m12_entry_command',n.current_entry_version_id::text,true);
 insert into public.research_note_entry_attachment(entry_version_id,attachment_id,attachment_row_version,attachment_checksum,purpose_code,linked_by_user_id,linked_at)
 values(n.current_entry_version_id,a.id,a.row_version,a.detected_sha256,target_purpose,app_private.current_effective_actor_user_id(),target_time);
 perform app_private.append_audit(target_audit,'research_note.record.create','RESEARCH_NOTE',n.id,n.version_no,'SUCCEEDED','RESEARCH-NOTE-ATTACHMENT-ADDED',a.id,null,null,null,target_time);return a.id;
end $$;
create or replace function public.edit_research_note_draft(target_note uuid,target_expected bigint,target_research_date date,target_title text,target_objective text,
 target_method text,target_observations text,target_results text,target_conclusion text,target_audit uuid,target_time timestamptz)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare n public.research_note%rowtype;next_version bigint;checksum text;begin
 perform app_private.m12_assert_user('research_note.record.create',target_time);select * into strict n from public.research_note where id=target_note for update;
 if n.state<>'DRAFT' or n.author_user_id<>app_private.current_effective_actor_user_id() then raise exception 'author Draft required' using errcode='42501';end if;
 next_version:=app_private.next_version(n.version_no,target_expected);perform set_config('app.m12_entry_command',n.current_entry_version_id::text,true);
 update public.research_note_entry_version set research_date=target_research_date,title=target_title,objective=target_objective,method=target_method,
  observations=target_observations,results=target_results,conclusion=target_conclusion where id=n.current_entry_version_id;
 checksum:=app_private.m12_compute_content_checksum(n.current_entry_version_id);update public.research_note_entry_version set content_checksum=checksum where id=n.current_entry_version_id;
 perform set_config('app.m12_note_command',n.id::text,true);update public.research_note set version_no=next_version,updated_at=target_time where id=n.id;
 perform app_private.append_audit(target_audit,'research_note.record.create','RESEARCH_NOTE',n.id,next_version,'SUCCEEDED','RESEARCH-NOTE-DRAFT-EDITED',null,null,null,null,target_time);return next_version;
end $$;
create or replace function public.submit_research_note(target_note uuid,target_expected bigint,target_use_senior boolean,target_audit uuid,target_transition uuid,
 target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 n public.research_note%rowtype;e public.research_note_entry_version%rowtype;next_version bigint;checksum text;to_state text;event text;begin
 perform app_private.m12_assert_user('research_note.record.create',target_time);select * into strict n from public.research_note where id=target_note for update;
 select * into strict e from public.research_note_entry_version where id=n.current_entry_version_id for update;
 if n.state<>'DRAFT' or e.state<>'DRAFT' or n.author_user_id<>app_private.current_effective_actor_user_id()
  or (target_use_senior and n.assigned_senior_user_id is null) then raise exception 'exact author Draft and optional assigned Senior required' using errcode='23514';end if;
 perform 1 from public.research_note_entry_attachment where entry_version_id=e.id for update;
 checksum:=app_private.m12_compute_snapshot_checksum(e.id);next_version:=app_private.next_version(n.version_no,target_expected);
 perform set_config('app.m12_entry_command',e.id::text,true);update public.research_note_entry_version set state='SEALED',sealed_snapshot_checksum=checksum,sealed_at=target_time where id=e.id;
 to_state:=case when target_use_senior then 'SENIOR_REVIEW_PENDING' else 'DIRECTOR_FINALIZATION_PENDING' end;
 event:=case when target_use_senior then 'EVT-NOTE-SUBMIT-SENIOR' else 'EVT-NOTE-SUBMIT-DIRECTOR' end;
 perform set_config('app.m12_note_command',n.id::text,true);update public.research_note set state=to_state,version_no=next_version,updated_at=target_time where id=n.id;
 perform app_private.m12_append_transition(target_audit,target_transition,target_outbox,'research_note.record.create',n.id,event,'DRAFT',to_state,n.version_no,next_version,
  'RESEARCH-NOTE-EXACT-ENTRY-SEALED',target_time);return next_version;
end $$;
create or replace function public.review_research_note(target_note uuid,target_expected bigint,target_outcome text,target_opinion text,target_review uuid,
 target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 n public.research_note%rowtype;e public.research_note_entry_version%rowtype;assignment uuid;next_version bigint;to_state text;event text;begin
 perform app_private.m12_assert_user('research_note.record.review',target_time);select * into strict n from public.research_note where id=target_note for update;
 select * into strict e from public.research_note_entry_version where id=n.current_entry_version_id for share;
 select a.id into strict assignment from public.user_position_assignment a join public.position p on p.id=a.position_id and p.stable_code='POSITION_SENIOR_RESEARCHER' and p.status='ACTIVE'
  where a.user_id=app_private.current_effective_actor_user_id() and a.revoked_at is null and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time) order by a.is_primary desc,a.id limit 1;
 if n.state<>'SENIOR_REVIEW_PENDING' or n.assigned_senior_user_id<>app_private.current_effective_actor_user_id() or target_outcome not in ('REVIEWED','REVISION_REQUESTED') then
  raise exception 'assigned active Senior review required' using errcode='42501';end if;
 next_version:=app_private.next_version(n.version_no,target_expected);insert into public.research_note_senior_review(id,research_note_id,entry_version_id,entry_no,entry_checksum,
  entry_sealed_at,reviewer_user_id,position_assignment_id,outcome,opinion,reviewed_at) values(target_review,n.id,e.id,e.entry_no,e.sealed_snapshot_checksum,e.sealed_at,
  app_private.current_effective_actor_user_id(),assignment,target_outcome,target_opinion,target_time);
 to_state:=case when target_outcome='REVIEWED' then 'DIRECTOR_FINALIZATION_PENDING' else 'REVISION_REQUIRED' end;
 event:=case when target_outcome='REVIEWED' then 'EVT-NOTE-REVIEWED' else 'EVT-NOTE-REQUEST-REVISION' end;
 perform set_config('app.m12_note_command',n.id::text,true);update public.research_note set state=to_state,version_no=next_version,updated_at=target_time where id=n.id;
 perform app_private.m12_append_transition(target_audit,target_transition,target_outbox,'research_note.record.review',n.id,event,'SENIOR_REVIEW_PENDING',to_state,
  n.version_no,next_version,target_outcome,target_time);return next_version;
end $$;
create or replace function public.resubmit_research_note(target_note uuid,target_new_entry uuid,target_expected bigint,target_use_senior boolean,
 target_research_date date,target_title text,target_objective text,target_method text,target_observations text,target_results text,target_conclusion text,
 target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 n public.research_note%rowtype;prior public.research_note_entry_version%rowtype;next_version bigint;content_hash text;snapshot_hash text;to_state text;begin
 perform app_private.m12_assert_user('research_note.record.create',target_time);select * into strict n from public.research_note where id=target_note for update;
 select * into strict prior from public.research_note_entry_version where id=n.current_entry_version_id for update;
 if n.state<>'REVISION_REQUIRED' or n.author_user_id<>app_private.current_effective_actor_user_id() or (target_use_senior and n.assigned_senior_user_id is null)
  or not exists(select 1 from public.research_note_senior_review r where r.entry_version_id=prior.id and r.outcome='REVISION_REQUESTED') then
  raise exception 'exact revision-required predecessor required' using errcode='23514';end if;
 next_version:=app_private.next_version(n.version_no,target_expected);
 insert into public.research_note_entry_version(id,research_note_id,entry_no,entry_kind,prior_entry_version_id,research_date,title,objective,method,observations,results,conclusion,
  content_checksum,state,created_by_user_id,created_at) values(target_new_entry,n.id,prior.entry_no+1,'ORIGINAL',prior.id,target_research_date,target_title,target_objective,
  target_method,target_observations,target_results,target_conclusion,repeat('0',64),'DRAFT',app_private.current_effective_actor_user_id(),target_time);
 content_hash:=app_private.m12_compute_content_checksum(target_new_entry);perform set_config('app.m12_entry_command',target_new_entry::text,true);
 update public.research_note_entry_version set content_checksum=content_hash where id=target_new_entry;snapshot_hash:=app_private.m12_compute_snapshot_checksum(target_new_entry);
 update public.research_note_entry_version set state='SEALED',sealed_snapshot_checksum=snapshot_hash,sealed_at=target_time where id=target_new_entry;
 to_state:=case when target_use_senior then 'SENIOR_REVIEW_PENDING' else 'DIRECTOR_FINALIZATION_PENDING' end;
 perform set_config('app.m12_note_command',n.id::text,true);update public.research_note set current_entry_version_id=target_new_entry,current_entry_no=prior.entry_no+1,
  state=to_state,version_no=next_version,updated_at=target_time where id=n.id;
 perform app_private.m12_append_transition(target_audit,target_transition,target_outbox,'research_note.record.create',n.id,'EVT-NOTE-RESUBMIT','REVISION_REQUIRED',to_state,
  n.version_no,next_version,'RESEARCH-NOTE-DIRECT-REVISION-SEALED',target_time);return next_version;
end $$;
create or replace function public.record_research_note_pdf(target_manifest uuid,target_note uuid,target_renderer text,target_renderer_version text,
 target_page_count integer,target_attachment uuid,target_audit uuid,target_outbox uuid,target_time timestamptz) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare n public.research_note%rowtype;e public.research_note_entry_version%rowtype;
 f public.research_note_finalization%rowtype;a public.attachment%rowtype;manifest_hash text;entries_manifest jsonb;files_manifest jsonb;begin
 perform app_private.m05_assert_worker(target_time,'DOCUMENT_ENGINE');select * into strict n from public.research_note where id=target_note for share;
 select * into strict e from public.research_note_entry_version where id=n.current_entry_version_id and state in ('FINALIZED','ADDENDUM_SEALED') for share;
 select * into strict f from public.research_note_finalization where research_note_id=n.id for share;
 select * into strict a from public.attachment where id=target_attachment and state='AVAILABLE' and detected_mime_type='application/pdf' and security_level=n.security_level;
 if not ((n.state='FINALIZED' and e.state='FINALIZED') or (n.state='CORRECTED_BY_ADDENDUM' and e.state='ADDENDUM_SEALED')) then
  raise exception 'finalized ResearchNote exact entry required for PDF rendering' using errcode='23514';end if;
 select coalesce(jsonb_agg(jsonb_build_object('entryId',x.id,'entryNo',x.entry_no,'kind',x.entry_kind,'checksum',x.sealed_snapshot_checksum,
  'sealedAt',x.sealed_at) order by x.entry_no),'[]'::jsonb) into entries_manifest from public.research_note_entry_version x
 where x.research_note_id=n.id and x.state<>'DRAFT';
 select coalesce(jsonb_agg(jsonb_build_object('entryId',x.id,'attachmentId',ra.attachment_id,'rowVersion',ra.attachment_row_version,
  'checksum',ra.attachment_checksum) order by x.entry_no,ra.purpose_code,ra.attachment_id),'[]'::jsonb) into files_manifest
 from public.research_note_entry_version x join public.research_note_entry_attachment ra on ra.entry_version_id=x.id
 where x.research_note_id=n.id and x.state<>'DRAFT';
 manifest_hash:=app_private.canonical_json_sha256(jsonb_build_object('schema','RESEARCH_NOTE_PDF_MANIFEST_V1','noteId',n.id,
  'finalizationId',f.id,'finalizedEntryId',f.entry_version_id,'finalizedEntryChecksum',f.entry_checksum,'entries',entries_manifest,'files',files_manifest,
  'entryId',e.id,'entryNo',e.entry_no,'entryChecksum',e.sealed_snapshot_checksum,'entrySealedAt',e.sealed_at,
  'rendererId',target_renderer,'rendererVersion',target_renderer_version,'pageCount',target_page_count,
  'pdfChecksum',a.detected_sha256,'attachmentId',a.id,'attachmentRowVersion',a.row_version,'renderedAt',target_time));
 insert into public.research_note_pdf_manifest(id,research_note_id,finalization_id,entry_version_id,entry_no,entry_checksum,entry_sealed_at,renderer_id,renderer_version,page_count,
  pdf_checksum,manifest_checksum,attachment_id,attachment_row_version,attachment_checksum,rendered_at) values(target_manifest,n.id,f.id,e.id,e.entry_no,e.sealed_snapshot_checksum,e.sealed_at,
  target_renderer,target_renderer_version,target_page_count,a.detected_sha256,manifest_hash,a.id,a.row_version,a.detected_sha256,target_time);
 perform app_private.append_audit(target_audit,'research_note.pdf.render','RESEARCH_NOTE',n.id,n.version_no,'SUCCEEDED','RESEARCH-NOTE-PDF-RENDERED',target_manifest,null,null,null,target_time);
 perform app_private.enqueue_outbox(target_outbox,target_audit,'EVT-NOTE-PDF-RENDERED','RESEARCH_NOTE',n.id,n.version_no,
  app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),'RESEARCH_NOTE_EVENT_REF',1,
  jsonb_build_object('aggregateId',n.id,'resourceVersion',n.version_no,'eventId','EVT-NOTE-PDF-RENDERED'),'EVT-NOTE-PDF-RENDERED:'||n.id::text||':'||n.version_no::text,target_time,target_time);return target_manifest;
end $$;
create or replace function public.finalize_research_note(target_note uuid,target_expected bigint,target_finalization uuid,
 target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare
 n public.research_note%rowtype;e public.research_note_entry_version%rowtype;assignment uuid;next_version bigint;begin
 perform app_private.m12_assert_user('research_note.record.finalize',target_time);select * into strict n from public.research_note where id=target_note for update;
 select * into strict e from public.research_note_entry_version where id=n.current_entry_version_id for update;
 select a.id into strict assignment from public.user_position_assignment a join public.position p on p.id=a.position_id and p.stable_code='POSITION_LAB_DIRECTOR' and p.status='ACTIVE'
  where a.user_id=app_private.current_effective_actor_user_id() and a.revoked_at is null and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time)
  order by a.is_primary desc,a.id limit 1;
 if n.state<>'DIRECTOR_FINALIZATION_PENDING' or not app_private.actor_has_project_internal_scope(n.project_id,target_time) then
  raise exception 'Lab Director exact entry finalization required' using errcode='42501';end if;
 next_version:=app_private.next_version(n.version_no,target_expected);
 insert into public.research_note_finalization(id,research_note_id,entry_version_id,entry_no,entry_checksum,entry_sealed_at,director_user_id,
  director_position_assignment_id,finalized_at) values(target_finalization,n.id,e.id,e.entry_no,e.sealed_snapshot_checksum,e.sealed_at,
  app_private.current_effective_actor_user_id(),assignment,target_time);
 perform set_config('app.m12_entry_command',e.id::text,true);update public.research_note_entry_version set state='FINALIZED' where id=e.id;
 perform set_config('app.m12_note_command',n.id::text,true);update public.research_note set state='FINALIZED',version_no=next_version,updated_at=target_time where id=n.id;
 perform app_private.m12_append_transition(target_audit,target_transition,target_outbox,'research_note.record.finalize',n.id,'EVT-NOTE-FINALIZE',
  'DIRECTOR_FINALIZATION_PENDING','FINALIZED',n.version_no,next_version,'LAB-DIRECTOR-EXACT-FINALIZATION',target_time);return next_version;
end $$;
create or replace function public.add_research_note_correction(target_note uuid,target_new_entry uuid,target_kind text,target_reason text,
 target_research_date date,target_title text,target_objective text,target_method text,target_observations text,target_results text,target_conclusion text,
 target_expected bigint,target_audit uuid,target_transition uuid,target_outbox uuid,target_time timestamptz) returns bigint
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare n public.research_note%rowtype;prior public.research_note_entry_version%rowtype;
 next_version bigint;content_hash text;snapshot_hash text;begin
 perform app_private.m12_assert_user('research_note.record.correct',target_time);select * into strict n from public.research_note where id=target_note for update;
 select * into strict prior from public.research_note_entry_version where id=n.current_entry_version_id for update;
 if n.state<>'FINALIZED' or prior.state<>'FINALIZED' or target_kind not in ('CORRECTION','ADDENDUM')
  or (n.author_user_id<>app_private.current_effective_actor_user_id() and not app_private.m12_has_position(app_private.current_effective_actor_user_id(),'POSITION_LAB_DIRECTOR',target_time))
  or not exists(select 1 from public.research_note_finalization f where f.entry_version_id=prior.id) then raise exception 'exact direct finalized predecessor required' using errcode='23514';end if;
 next_version:=app_private.next_version(n.version_no,target_expected);
 insert into public.research_note_entry_version(id,research_note_id,entry_no,entry_kind,prior_entry_version_id,corrects_entry_version_id,research_date,title,objective,
  method,observations,results,conclusion,correction_reason,content_checksum,state,created_by_user_id,created_at)
 values(target_new_entry,n.id,prior.entry_no+1,target_kind,prior.id,prior.id,target_research_date,target_title,target_objective,target_method,target_observations,
  target_results,target_conclusion,target_reason,repeat('0',64),'DRAFT',app_private.current_effective_actor_user_id(),target_time);
 content_hash:=app_private.m12_compute_content_checksum(target_new_entry);perform set_config('app.m12_entry_command',target_new_entry::text,true);
 update public.research_note_entry_version set content_checksum=content_hash where id=target_new_entry;snapshot_hash:=app_private.m12_compute_snapshot_checksum(target_new_entry);
 update public.research_note_entry_version set state='ADDENDUM_SEALED',sealed_snapshot_checksum=snapshot_hash,sealed_at=target_time where id=target_new_entry;
 perform set_config('app.m12_note_command',n.id::text,true);update public.research_note set current_entry_version_id=target_new_entry,current_entry_no=prior.entry_no+1,
  state='CORRECTED_BY_ADDENDUM',version_no=next_version,updated_at=target_time where id=n.id;
 perform app_private.m12_append_transition(target_audit,target_transition,target_outbox,'research_note.record.correct',n.id,'EVT-NOTE-ADD-CORRECTION',
  'FINALIZED','CORRECTED_BY_ADDENDUM',n.version_no,next_version,target_reason,target_time);return next_version;
end $$;

create or replace function app_private.m12_can_read_note(target_note uuid,target_time timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private as $$ select exists(
 select 1 from public.research_note n join public.user_account u on u.id=app_private.current_actor_user_id()
 where n.id=target_note and u.account_kind='INTERNAL' and u.status='ACTIVE' and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time)
  and not app_private.m12_is_admin(u.id,target_time) and (n.author_user_id=app_private.current_effective_actor_user_id()
   or (n.assigned_senior_user_id=app_private.current_effective_actor_user_id()
    and app_private.m12_has_position(app_private.current_effective_actor_user_id(),'POSITION_SENIOR_RESEARCHER',target_time))
   or (app_private.m12_has_position(app_private.current_effective_actor_user_id(),'POSITION_LAB_DIRECTOR',target_time)
    and app_private.actor_has_project_internal_scope(n.project_id,target_time)))) $$;
create or replace function public.read_research_note_source(target_note uuid,target_time timestamptz)
returns table(note_id uuid,entry_version_id uuid,entry_no bigint,title text,objective text,method text,observations text,results text,conclusion text,
 content_checksum text,sealed_snapshot_checksum text,state text,version_no bigint)
language plpgsql volatile security definer set search_path=pg_catalog,public,app_private as $$ begin
 if target_time is distinct from app_private.request_time() or not app_private.m12_can_read_note(target_note,target_time) then raise exception 'ResearchNote source read denied' using errcode='42501';end if;
 perform app_private.append_audit(extensions.gen_random_uuid(),'research_note.record.read','RESEARCH_NOTE',target_note,
  (select n.version_no from public.research_note n where n.id=target_note),'SUCCEEDED','RESEARCH-NOTE-SENSITIVE-READ',null,null,null,null,target_time);
 return query select n.id,e.id,e.entry_no,e.title,e.objective,e.method,e.observations,e.results,e.conclusion,e.content_checksum,e.sealed_snapshot_checksum,n.state,n.version_no
  from public.research_note n join public.research_note_entry_version e on e.id=n.current_entry_version_id where n.id=target_note;end $$;

do $rls$ declare t text;begin foreach t in array array['research_note','research_note_entry_version','research_note_entry_attachment','research_note_senior_review',
 'research_note_pdf_manifest','research_note_finalization'] loop execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);end loop;end $rls$;
create policy research_note_read on public.research_note for select to youone_request using(app_private.m12_can_read_note(id,app_private.request_time()));
create policy research_note_entry_read on public.research_note_entry_version for select to youone_request using(app_private.m12_can_read_note(research_note_id,app_private.request_time()));
create policy research_note_attachment_read on public.research_note_entry_attachment for select to youone_request using(exists(
 select 1 from public.research_note_entry_version e where e.id=entry_version_id and app_private.m12_can_read_note(e.research_note_id,app_private.request_time())));
create policy research_note_review_read on public.research_note_senior_review for select to youone_request using(app_private.m12_can_read_note(research_note_id,app_private.request_time()));
create policy research_note_pdf_read on public.research_note_pdf_manifest for select to youone_request using(app_private.m12_can_read_note(research_note_id,app_private.request_time()));
create policy research_note_finalization_read on public.research_note_finalization for select to youone_request using(app_private.m12_can_read_note(research_note_id,app_private.request_time()));
do $revoke$ declare t text;begin foreach t in array array['research_note','research_note_entry_version','research_note_entry_attachment','research_note_senior_review',
 'research_note_pdf_manifest','research_note_finalization'] loop execute format('revoke all on table public.%I from public,youone_request,youone_privileged_writer',t);end loop;end $revoke$;
grant select on public.research_note,public.research_note_entry_version,public.research_note_entry_attachment,public.research_note_senior_review,
 public.research_note_pdf_manifest,public.research_note_finalization to youone_request;
do $commands$ declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in('create_research_note','add_research_note_attachment','edit_research_note_draft','submit_research_note',
 'review_research_note','resubmit_research_note','finalize_research_note','add_research_note_correction','read_research_note_source') loop
 execute format('revoke all on function %s from public,youone_request,youone_privileged_writer',f.signature);execute format('grant execute on function %s to youone_request',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_research_note_pdf' loop
  execute format('revoke all on function %s from public,youone_request,youone_privileged_writer',f.signature);execute format('grant execute on function %s to youone_privileged_writer',f.signature);end loop;end $commands$;
revoke all on function app_private.m12_reject_immutable(),app_private.m12_guard_note(),app_private.m12_guard_entry(),app_private.m12_guard_entry_attachment(),
 app_private.m12_has_position(uuid,text,timestamptz),app_private.m12_is_admin(uuid,timestamptz),app_private.m12_assert_user(text,timestamptz),
 app_private.m12_append_transition(uuid,uuid,uuid,text,uuid,text,text,text,bigint,bigint,text,timestamptz),app_private.m12_compute_content_checksum(uuid),
 app_private.m12_compute_snapshot_checksum(uuid),app_private.m12_can_read_note(uuid,timestamptz)
from public,youone_request,youone_privileged_writer;
grant execute on function app_private.m12_can_read_note(uuid,timestamptz) to youone_request;

comment on table public.research_note_senior_review is 'Optional Senior review evidence only; it is not official Approval authority.';
comment on table public.research_note_finalization is 'Only an active Lab Director may finalize; Representative approval is deliberately absent.';
