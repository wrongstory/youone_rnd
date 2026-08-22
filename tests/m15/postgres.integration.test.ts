import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const url=process.env.M15_TEST_DATABASE_URL;
const psql=process.env.PSQL_BIN??"psql";
const migrationNames=["20260821000100_m02_database_audit_kernel.sql","20260821000200_m03_auth_rbac_scope.sql","20260823001400_m15_pwa_offline_sync.sql"];
const migrations=migrationNames.map(name=>readFileSync(resolve(import.meta.dirname,`../../supabase/migrations/${name}`),"utf8")).join("\n");
const dbDescribe=url===undefined?describe.skip:describe;
const now="2026-08-23T09:00:00Z";
const actor="f5000000-0000-4000-8000-000000000001";
const other="f5000000-0000-4000-8000-000000000002";
const command="f5000000-0000-4000-8000-000000000003";
const aggregate="f5000000-0000-4000-8000-000000000004";
const conflict="f5000000-0000-4000-8000-000000000005";
const resolution="f5000000-0000-4000-8000-000000000006";
const session="m15-current-session";
const payload='{"checked":true,"note":"현장"}';
const digest=(value:string)=>createHash("sha256").update(value,"utf8").digest("hex");
const payloadHash=digest(payload);
const bindingHash=digest(`${actor}:${session}`);
const serverProjection='{"state":"SERVER"}';
const serverHash=digest(serverProjection);

function run(sql:string,success=true):string{
  if(url===undefined)throw new Error("M15_TEST_DATABASE_URL required");
  const result=spawnSync(psql,["-X","--no-psqlrc","--tuples-only","--no-align","--quiet","-v","ON_ERROR_STOP=1","--dbname",url],{input:sql,encoding:"utf8"});
  if((result.status===0)!==success)throw new Error(success?`psql failed: ${result.stderr}`:"psql unexpectedly succeeded");
  return result.stdout.trim();
}
function context(user:string,sessionId=session,correlation="request:m15-db"):string{return `select set_config('app.actor_kind','USER',true);select set_config('app.actor_user_id','${user}',true);
 select set_config('app.effective_actor_user_id','${user}',true);select set_config('app.anonymous_subject_fingerprint','',true);select set_config('app.system_actor_id','',true);
 select set_config('app.correlation_id','${correlation}',true);select set_config('app.causation_id','',true);select set_config('app.request_time','${now}',true);
 select set_config('app.acting_authority_id','',true);select set_config('app.session_id','${sessionId}',true);select set_config('app.assurance_level','AAL2',true);`;}
function register(type="CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT",hash=payloadHash,body=payload):string{return `select app_private.register_offline_command('${command}','${type}','${actor}','${actor}','${bindingHash}','INSPECTION','${aggregate}',3,1,'2026-08-23T08:55:00Z','${hash}','${body}','${now}');`;}

dbDescribe.sequential("M15 PostgreSQL offline synchronization boundary",()=>{
  beforeAll(()=>{
    if(url===undefined)return;
    if(!/test/i.test(new URL(url).pathname))throw new Error("database name must contain test");
    if(run("select count(*) from information_schema.tables where table_schema='public';")!=="0")throw new Error("clean dedicated M15 test DB required");
    run(`begin;create table public.m14_upgrade_fixture(id int primary key);insert into public.m14_upgrade_fixture values(1);${migrations}rollback;`);
    run(migrations);
    run(`insert into public.user_account(id,auth_subject,account_kind,status,valid_from) values('${actor}','m15-actor','INTERNAL','ACTIVE','2026-01-01'),('${other}','m15-other','INTERNAL','ACTIVE','2026-01-01');`);
  },30000);

  it("rejects online-only, actor changes, session changes, and noncanonical payloads",()=>{
    run(`begin;set local role youone_request;${context(actor)}${register("CMD-APPROVAL-ACTION")}rollback;`,false);
    run(`begin;set local role youone_request;${context(other)}${register()}rollback;`,false);
    run(`begin;set local role youone_request;${context(actor,"changed-session")}${register()}rollback;`,false);
    run(`begin;set local role youone_request;${context(actor)}${register("CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT",digest('{ "checked": true }'),'{ "checked": true }')}rollback;`,false);
  });

  it("records one immutable command and returns an idempotent replay",()=>{
    expect(run(`begin;set local role youone_request;${context(actor)}${register()}commit;`).split("\n").at(-1)).toBe("RECEIVED");
    expect(run(`begin;set local role youone_request;${context(actor)}${register()}commit;`).split("\n").at(-1)).toBe("IDEMPOTENT_REPLAY");
    run(`begin;set local role youone_request;${context(actor)}${register("CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT",digest('{"checked":false}'),'{"checked":false}')}rollback;`,false);
    run(`update public.offline_command set base_version=4 where command_id='${command}';`,false);
  });

  it("preserves exact local payload and safe server projection on stale version",()=>{
    run(`begin;set local role youone_request;${context(actor,"changed-session")}select app_private.record_sync_conflict('${conflict}','${command}',5,'${serverProjection}'::jsonb,'${serverHash}','${now}');rollback;`,false);
    run(`begin;set local role youone_request;${context(actor)}select app_private.record_sync_conflict('${conflict}','${command}',5,'${serverProjection}'::jsonb,'${serverHash}','${now}');commit;`);
    expect(run(`select base_version||':'||server_version||':'||(local_payload=(select payload from public.offline_command where command_id='${command}'))||':'||(safe_server_projection->>'state') from public.sync_conflict where conflict_id='${conflict}';`)).toBe("3:5:true:SERVER");
    expect(run(`select result_code||':'||reason_code from public.offline_command_result where offline_command_id='${command}';`)).toBe("SYNC_CONFLICT:STALE_BASE_VERSION");
    run(`update public.sync_conflict set server_version=6 where conflict_id='${conflict}';`,false);
  });

  it("allows only the owner to read and records one explicit terminal resolution",()=>{
    expect(run(`begin;set local role youone_request;${context(other)}select count(*) from public.sync_conflict;rollback;`).split("\n").at(-1)).toBe("0");
    expect(run(`begin;set local role youone_request;${context(actor)}select count(*) from public.sync_conflict;rollback;`).split("\n").at(-1)).toBe("1");
    run(`begin;set local role youone_request;${context(actor)}select app_private.resolve_sync_conflict('f5000000-0000-4000-8000-000000000008','${conflict}',1,'RESOLVED_RETRY_AS_NEW','${command}','STALE_SUCCESSOR','${now}');rollback;`,false);
    run(`begin;set local role youone_request;${context(actor)}select app_private.resolve_sync_conflict('${resolution}','${conflict}',1,'RESOLVED_DISCARD_LOCAL',null,'USER_DISCARDED_LOCAL','${now}');commit;`);
    expect(run(`select resolution_state from public.sync_conflict_resolution where resolution_id='${resolution}';`)).toBe("RESOLVED_DISCARD_LOCAL");
    run(`begin;set local role youone_request;${context(actor)}select app_private.resolve_sync_conflict('f5000000-0000-4000-8000-000000000007','${conflict}',2,'RESOLVED_DISCARD_LOCAL',null,'SECOND_RESOLUTION','${now}');rollback;`,false);
    expect(run(`select count(*) from public.offline_command where command_id='${command}' and base_version=3;`)).toBe("1");
  });

  it("denies direct request-role writes to command, result, conflict, and resolution tables",()=>{
    for(const table of ["offline_command","offline_command_result","sync_conflict","sync_conflict_resolution"])
      expect(run(`select count(*) from information_schema.role_table_grants where grantee='youone_request' and table_name='${table}' and privilege_type in('INSERT','UPDATE','DELETE');`)).toBe("0");
  });
});
