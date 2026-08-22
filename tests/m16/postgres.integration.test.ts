import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.M16_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const pgDump = process.env.PG_DUMP_BIN ?? "pg_dump";
const migrationDirectory = resolve(import.meta.dirname, "../../supabase/migrations");
const migrationNames = readdirSync(migrationDirectory).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
const migrationSql = migrationNames.map((name) => readFileSync(resolve(migrationDirectory, name), "utf8")).join("\n");
const databaseDescribe = databaseUrl === undefined ? describe.skip : describe;

const now = "2026-08-23T12:00:00Z";
const internal = "16000000-0000-4000-8000-000000000101";
const vendorActor = "16000000-0000-4000-8000-000000000102";
const otherVendorActor = "16000000-0000-4000-8000-000000000103";
const disabledActor = "16000000-0000-4000-8000-000000000104";
const expiredActor = "16000000-0000-4000-8000-000000000105";
const restoreProbe = "16000000-0000-4000-8000-000000000106";
const vendorOne = "16000000-0000-4000-8000-000000000201";
const vendorTwo = "16000000-0000-4000-8000-000000000202";
const membershipOne = "16000000-0000-4000-8000-000000000301";
const membershipTwo = "16000000-0000-4000-8000-000000000302";
const commandId = "16000000-0000-4000-8000-000000000401";
const aggregateId = "16000000-0000-4000-8000-000000000402";
const sessionId = "m16-live-session";
const payload = '{"checked":true}';
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const stableRegistries = ["aggregate_type_definition", "action_definition", "domain_event_definition", "state_machine_definition", "state_definition", "transition_definition"];

function run(sql: string, success = true): string {
  if (databaseUrl === undefined) throw new Error("M16_TEST_DATABASE_URL required");
  const result = spawnSync(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", databaseUrl], { input: sql, encoding: "utf8" });
  if ((result.status === 0) !== success) throw new Error(success ? `psql failed: ${result.stderr}` : "psql unexpectedly succeeded");
  return result.stdout.trim();
}

function requestContext(actorId: string, session = sessionId): string {
  return `select set_config('app.actor_kind','USER',true);
    select set_config('app.actor_user_id','${actorId}',true);
    select set_config('app.effective_actor_user_id','${actorId}',true);
    select set_config('app.anonymous_subject_fingerprint','',true);
    select set_config('app.system_actor_id','',true);
    select set_config('app.correlation_id','request:m16-full-chain',true);
    select set_config('app.causation_id','',true);
    select set_config('app.request_time','${now}',true);
    select set_config('app.acting_authority_id','',true);
    select set_config('app.session_id','${session}',true);
    select set_config('app.assurance_level','AAL2',true);`;
}

databaseDescribe.sequential("M16 full-chain PostgreSQL security and recovery rehearsal", () => {
  beforeAll(() => {
    if (databaseUrl === undefined) return;
    if (!/test/i.test(new URL(databaseUrl).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated M16 test DB required");
    run(`begin; create table public.m15_upgrade_fixture(id integer primary key); insert into public.m15_upgrade_fixture values(1); ${migrationSql} rollback;`);
    expect(run("select count(*) from information_schema.tables where table_schema='public';")).toBe("0");
    run(migrationSql);
  }, 60_000);

  it("restores a backed-up business identity fixture", () => {
    if (databaseUrl === undefined) return;
    run(`insert into public.user_account(id,auth_subject,account_kind,status,valid_from) values('${restoreProbe}','m16-restore-probe','INTERNAL','ACTIVE','2026-01-01');`);
    const backup = spawnSync(pgDump, ["--data-only", "--inserts", "--table=public.user_account", "--dbname", databaseUrl], { encoding: "utf8" });
    if (backup.status !== 0) throw new Error(`pg_dump failed: ${backup.stderr}`);
    run("delete from public.user_account;");
    expect(run("select count(*) from public.user_account;")).toBe("0");
    run(backup.stdout);
    expect(run(`select auth_subject from public.user_account where id='${restoreProbe}';`)).toBe("m16-restore-probe");
    run(`delete from public.user_account where id='${restoreProbe}';`);
  });

  it("enforces FORCE RLS and denies direct request/worker table writes", () => {
    expect(run(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity);`)).toBe("0");
    expect(run(`select count(*) from information_schema.role_table_grants where grantee in('youone_request','youone_privileged_writer') and table_schema='public' and privilege_type in('INSERT','UPDATE','DELETE','TRUNCATE');`)).toBe("0");
    expect(run(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles owner on owner.oid=c.relowner where n.nspname='public' and c.relname=any(array[${stableRegistries.map((table) => `'${table}'`).join(",")}]) and (not c.relforcerowsecurity or owner.rolname in('youone_request','youone_privileged_writer','youone_identity_resolver'));`)).toBe("0");
    expect(run("select rolname||':'||rolsuper||':'||rolbypassrls from pg_roles where rolname in('youone_request','youone_privileged_writer','youone_identity_resolver') order by rolname;").split("\n")).toEqual([
      "youone_identity_resolver:false:false",
      "youone_privileged_writer:false:false",
      "youone_request:false:false"
    ]);
    for (const role of ["youone_request", "youone_privileged_writer", "youone_identity_resolver"]) {
      run(`begin; set local role ${role}; insert into public.action_definition(action_id) values('M16_FORGED_${role.toUpperCase()}'); rollback;`, false);
    }
  });

  it("fails closed for missing, disabled, expired, and cross-vendor actors", () => {
    run(`insert into public.user_account(id,auth_subject,account_kind,status,valid_from,valid_until) values
      ('${internal}','m16-internal','INTERNAL','ACTIVE','2026-01-01',null),
      ('${vendorActor}','m16-vendor-one','VENDOR','ACTIVE','2026-01-01',null),
      ('${otherVendorActor}','m16-vendor-two','VENDOR','ACTIVE','2026-01-01',null),
      ('${disabledActor}','m16-disabled','INTERNAL','DISABLED','2026-01-01',null),
      ('${expiredActor}','m16-expired','VENDOR','ACTIVE','2026-01-01','2026-08-01');
      insert into public.vendor(id,vendor_code,legal_name,status) values
      ('${vendorOne}','M16_VENDOR_ONE','M16 Vendor One','ACTIVE'),('${vendorTwo}','M16_VENDOR_TWO','M16 Vendor Two','ACTIVE');
      insert into public.vendor_user(id,vendor_id,user_id,status,valid_from,grant_reason_code) values
      ('${membershipOne}','${vendorOne}','${vendorActor}','ACTIVE','2026-01-01','M16_FIXTURE'),
      ('${membershipTwo}','${vendorTwo}','${otherVendorActor}','ACTIVE','2026-01-01','M16_FIXTURE');`);

    run("begin; set local role youone_request; select count(*) from public.user_account; rollback;", false);
    expect(run(`begin; set local role youone_request; ${requestContext(internal)} select count(*) from public.user_account; rollback;`).split("\n").at(-1)).toBe("1");
    expect(run(`begin; set local role youone_request; ${requestContext(disabledActor)} select count(*) from public.user_account; rollback;`).split("\n").at(-1)).toBe("0");
    expect(run(`begin; set local role youone_request; ${requestContext(expiredActor)} select count(*) from public.user_account; rollback;`).split("\n").at(-1)).toBe("0");
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.vendor; rollback;`).split("\n").at(-1)).toBe("1");
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select app_private.actor_has_vendor_membership('${membershipTwo}','${vendorTwo}'); rollback;`).split("\n").at(-1)).toBe("f");
  });

  it("binds M15 owner RLS to the current actor and exact live session", () => {
    const binding = digest(`${internal}:${sessionId}`);
    const payloadHash = digest(payload);
    const register = `select app_private.register_offline_command('${commandId}','CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT','${internal}','${internal}','${binding}','INSPECTION','${aggregateId}',0,1,'2026-08-23T11:55:00Z','${payloadHash}','${payload}','${now}');`;
    run(`begin; set local role youone_request; ${requestContext(internal)} ${register} commit;`);
    expect(run(`begin; set local role youone_request; ${requestContext(internal)} select count(*) from public.offline_command where command_id='${commandId}'; rollback;`).split("\n").at(-1)).toBe("1");
    expect(run(`begin; set local role youone_request; ${requestContext(vendorActor)} select count(*) from public.offline_command where command_id='${commandId}'; rollback;`).split("\n").at(-1)).toBe("0");
    run(`begin; set local role youone_request; ${requestContext(internal, "revoked-session")} ${register} rollback;`, false);
  });

  it("keeps evidence append-only and rolls failed mutations back", () => {
    const auditId = "16000000-0000-4000-8000-000000000501";
    run(`begin; set local role youone_request; ${requestContext(internal)} select app_private.append_audit('${auditId}','offline.command.receive','OFFLINE_COMMAND','${commandId}',0,'SUCCEEDED','M16_ROLLBACK',null,null,'${digest("after")}',null,'${now}'); rollback;`);
    expect(run(`select count(*) from public.audit_log where id='${auditId}';`)).toBe("0");
    run("update public.audit_log set result='FAILED';", false);
    run(`delete from public.offline_command where command_id='${commandId}';`, false);
  });
});
