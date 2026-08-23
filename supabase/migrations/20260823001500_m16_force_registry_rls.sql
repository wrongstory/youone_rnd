-- M16 security forward-fix: stable definition registries must not rely on table-owner RLS bypass.
-- Runtime principals remain NOBYPASSRLS and receive no DML grants. Future registry changes are
-- deployment migrations executed by the isolated migration identity, never application traffic.

do $registry_rls$
declare
  registry_table text;
begin
  foreach registry_table in array array[
    'aggregate_type_definition',
    'action_definition',
    'domain_event_definition',
    'state_machine_definition',
    'state_definition',
    'transition_definition'
  ]
  loop
    execute format('alter table public.%I enable row level security', registry_table);
    execute format('alter table public.%I force row level security', registry_table);
    execute format(
      'revoke all on table public.%I from public, youone_request, youone_privileged_writer, youone_identity_resolver',
      registry_table
    );
  end loop;
end
$registry_rls$;
