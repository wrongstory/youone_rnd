import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const migration = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260821000100_m02_database_audit_kernel.sql"), "utf8");
const dbDescribe = url === undefined ? describe.skip : describe;

function run(sql: string, success = true): string {
  if (url === undefined) throw new Error("TEST_DATABASE_URL required");
  const result = spawnSync(
    psql,
    [
      "-X",
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--quiet",
      "-v",
      "ON_ERROR_STOP=1",
      "--dbname",
      url
    ],
    { input: sql, encoding: "utf8" }
  );
  if ((result.status === 0) !== success) throw new Error(success ? `psql failed: ${result.stderr}` : "psql unexpectedly succeeded");
  return result.stdout.trim();
}

function concurrent(sql: string): Promise<number | null> {
  if (url === undefined) throw new Error("TEST_DATABASE_URL required");
  return new Promise((resolveStatus, reject) => {
    const child = spawn(psql, ["-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "--dbname", url], { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", reject); child.on("close", resolveStatus); child.stdin.end(sql);
  });
}

const context = `
select set_config('app.actor_kind','USER',true);
select set_config('app.actor_user_id','550e8400-e29b-41d4-a716-446655440000',true);
select set_config('app.effective_actor_user_id','f47ac10b-58cc-4372-a567-0e02b2c3d479',true);
select set_config('app.anonymous_subject_fingerprint','',true);
select set_config('app.system_actor_id','',true);
select set_config('app.correlation_id','req:m02-db',true);
select set_config('app.causation_id','cmd:m02-db',true);`;

dbDescribe.sequential("M02 PostgreSQL", () => {
  beforeAll(() => {
    if (url === undefined) return;
    if (!/test/i.test(new URL(url).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated test DB required");
    run(`begin; create table public.m00_upgrade_fixture(id int primary key); insert into public.m00_upgrade_fixture values(1); ${migration} rollback;`);
    run(migration);
    run(`
      insert into public.aggregate_type_definition values ('M02_TEST_AGGREGATE', statement_timestamp());
      insert into public.action_definition values ('M02_TEST_ACTION', statement_timestamp());
      insert into public.domain_event_definition values ('M02_TEST_EVENT','M02_TEST_PAYLOAD',1,statement_timestamp());
      insert into public.state_machine_definition values ('M02_TEST_MACHINE','M02_TEST_AGGREGATE',statement_timestamp());
      insert into public.state_definition(machine_id,state_id) values ('M02_TEST_MACHINE','M02_INITIAL'),('M02_TEST_MACHINE','M02_ADVANCED');
      insert into public.transition_definition(machine_id,event_id,from_state,to_state) values ('M02_TEST_MACHINE','M02_ADVANCE','M02_INITIAL','M02_ADVANCED');
    `);
  }, 30_000);

  it("supports atomic audit/transition and append-only protection", () => {
    run(`begin; ${context}
      select app_private.append_audit('11111111-1111-4111-8111-111111111111','M02_TEST_ACTION','M02_TEST_AGGREGATE','22222222-2222-4222-8222-222222222222',1,'SUCCEEDED','M02_REASON',null,null,'${"a".repeat(64)}',null,statement_timestamp());
      select app_private.append_state_transition('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','M02_TEST_AGGREGATE','22222222-2222-4222-8222-222222222222','M02_TEST_MACHINE','M02_ADVANCE','M02_INITIAL','M02_ADVANCED',0,1,'M02_REASON',null,'req:m02-db','cmd:m02-db',statement_timestamp()); commit;`);
    run("update public.audit_log set result='FAILED';", false);
    run("delete from public.state_transition_history;", false);
    run("update public.domain_event_definition set payload_schema_version=2;", false);
  });

  it("denies direct request-role access", () => {
    run("set role youone_request; select * from public.audit_log;", false);
  });

  it("rolls audit and outbox back together", () => {
    run(`begin; ${context}
      select app_private.append_audit('44444444-4444-4444-8444-444444444444','M02_TEST_ACTION','M02_TEST_AGGREGATE','22222222-2222-4222-8222-222222222222',1,'DENIED','M02_REASON',null,null,null,null,statement_timestamp());
      select app_private.enqueue_outbox('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','M02_TEST_EVENT','M02_TEST_AGGREGATE','22222222-2222-4222-8222-222222222222',1,'req:m02-db','cmd:m02-db','M02_TEST_PAYLOAD',1,'{"aggregateId":"22222222-2222-4222-8222-222222222222"}','m02:rollback',statement_timestamp(),statement_timestamp()); rollback;`);
    expect(run("select count(*) from public.audit_log where id='44444444-4444-4444-8444-444444444444';")).toBe("0");
    expect(run("select count(*) from public.outbox_event where id='55555555-5555-4555-8555-555555555555';")).toBe("0");
  });

  it("rejects an idempotency key reused with a different request", () => {
    run(`begin; ${context}
      select app_private.register_idempotency_key('M02_TEST_SCOPE','m02:command','${"b".repeat(64)}',statement_timestamp() + interval '1 hour');
      select app_private.register_idempotency_key('M02_TEST_SCOPE','m02:command','${"c".repeat(64)}',statement_timestamp() + interval '1 hour');
      rollback;`, false);
  });

  it("claims an outbox event and records dead-letter state through the worker role", () => {
    run(`begin; ${context}
      select app_private.append_audit('66666666-6666-4666-8666-666666666666','M02_TEST_ACTION','M02_TEST_AGGREGATE','22222222-2222-4222-8222-222222222222',1,'SUCCEEDED','M02_REASON',null,null,'${"d".repeat(64)}',null,statement_timestamp());
      select app_private.enqueue_outbox('77777777-7777-4777-8777-777777777777','66666666-6666-4666-8666-666666666666','M02_TEST_EVENT','M02_TEST_AGGREGATE','22222222-2222-4222-8222-222222222222',1,'req:m02-db','cmd:m02-db','M02_TEST_PAYLOAD',1,'{"aggregateId":"22222222-2222-4222-8222-222222222222"}','m02:dead-letter',statement_timestamp(),statement_timestamp()); commit;`);
    run(`begin; set role youone_privileged_writer;
      select count(*) from app_private.claim_outbox('M02_WORKER',60,10);
      select app_private.mark_outbox_dead_letter('77777777-7777-4777-8777-777777777777','M02_WORKER','M02_TEST_ERROR');
      commit;`);
    expect(
      run("select delivery_state from public.outbox_delivery where event_id='77777777-7777-4777-8777-777777777777';")
    ).toBe("DEAD_LETTER");
  });

  it.each(["accessToken","cookie","authorizationHeader","signedUrl","stack","sql","requestBody","editorJson","rawContent"])("rejects payload key %s", (key) => {
    run(`begin; ${context} select app_private.enqueue_outbox(extensions.gen_random_uuid(),'11111111-1111-4111-8111-111111111111','M02_TEST_EVENT','M02_TEST_AGGREGATE','22222222-2222-4222-8222-222222222222',1,'req:m02-db','cmd:m02-db','M02_TEST_PAYLOAD',1,jsonb_build_object('${key}','x'),'m02:${key}',statement_timestamp(),statement_timestamp()); rollback;`, false);
  });

  it("permits only one concurrent optimistic advance", async () => {
    run("create table public.m02_version_probe(id int primary key, version_no bigint not null); insert into public.m02_version_probe values(1,0);");
    const sql = "update public.m02_version_probe set version_no=app_private.next_version(version_no,0) where id=1 returning version_no;";
    const statuses = await Promise.all([concurrent(sql), concurrent(sql)]);
    expect(statuses.filter((status) => status === 0)).toHaveLength(1);
  });
});
