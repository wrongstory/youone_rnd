import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.M11_TEST_DATABASE_URL;
const psql = process.env.PSQL_BIN ?? "psql";
const migrations = ["20260821000100_m02_database_audit_kernel.sql", "20260821000200_m03_auth_rbac_scope.sql",
  "20260822000300_m04_approval_engine.sql", "20260822000400_m05_document_file.sql", "20260822000500_m06_project_wbs.sql",
  "20260822000600_m07_vendor_contract.sql", "20260822000700_m08_quality_inspection.sql", "20260822000800_m09_ncr_car.sql",
  "20260822000900_m10_ecr_eco.sql", "20260822001000_m11_purchase_rnd.sql"]
  .map((name) => readFileSync(resolve(import.meta.dirname, `../../supabase/migrations/${name}`), "utf8")).join("\n");
const dbDescribe = url === undefined ? describe.skip : describe;
const now = "2026-08-22T09:00:00Z";
const manager = "b0000000-0000-4000-8000-000000000001";
const hq = "b0000000-0000-4000-8000-000000000002";
const vendor = "b0000000-0000-4000-8000-000000000003";
const org = "b0000000-0000-4000-8000-000000000004";

function run(sql: string, success = true): string {
  if (url === undefined) throw new Error("M11_TEST_DATABASE_URL required");
  const result = spawnSync(psql, ["-X", "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url],
    { input: sql, encoding: "utf8" });
  if ((result.status === 0) !== success) throw new Error(success ? `psql failed: ${result.stderr}` : "psql unexpectedly succeeded");
  return result.stdout.trim();
}
function runAsync(sql: string): Promise<number | null> {
  if (url === undefined) throw new Error("M11_TEST_DATABASE_URL required");
  return new Promise((done) => { const child = spawn(psql, ["-X", "--no-psqlrc", "--quiet", "-v", "ON_ERROR_STOP=1", "--dbname", url]); child.stdin.end(sql); child.on("close", done); });
}
function context(actor: string): string { return `select set_config('app.actor_kind','USER',true);select set_config('app.actor_user_id','${actor}',true);
 select set_config('app.effective_actor_user_id','${actor}',true);select set_config('app.anonymous_subject_fingerprint','',true);
 select set_config('app.system_actor_id','',true);select set_config('app.correlation_id','request:m11-db',true);
 select set_config('app.causation_id','',true);select set_config('app.request_time','${now}',true);select set_config('app.acting_authority_id','',true);`; }

dbDescribe.sequential("M11 PostgreSQL Purchase/R&D boundary", () => {
  beforeAll(() => {
    if (url === undefined) return;
    if (!/test/i.test(new URL(url).pathname)) throw new Error("database name must contain test");
    if (run("select count(*) from information_schema.tables where table_schema='public';") !== "0") throw new Error("clean dedicated M11 test DB required");
    run(migrations);
    run(`insert into public.organization(id,stable_code,legal_name,status) values('${org}','M11_ORG','M11 Org','ACTIVE');
      insert into public.user_account(id,auth_subject,account_kind,status,valid_from) values
       ('${manager}','m11-manager','INTERNAL','ACTIVE','2026-01-01'),('${hq}','m11-hq','INTERNAL','ACTIVE','2026-01-01'),
       ('${vendor}','m11-vendor','VENDOR','ACTIVE','2026-01-01');
      insert into public.user_organization_assignment(id,user_id,organization_id,valid_from,grant_reason_code) values
       ('b1000000-0000-4000-8000-000000000001','${manager}','${org}','2026-01-01','M11_FIXTURE'),
       ('b1000000-0000-4000-8000-000000000002','${hq}','${org}','2026-01-01','M11_FIXTURE');
      insert into public.user_role_assignment(id,user_id,role_id,valid_from,grant_reason_code) values
       ('b1000000-0000-4000-8000-000000000003','${manager}','20000000-0000-4000-8000-000000000001','2026-01-01','M11_FIXTURE'),
       ('b1000000-0000-4000-8000-000000000004','${hq}','20000000-0000-4000-8000-000000000008','2026-01-01','M11_FIXTURE'),
       ('b1000000-0000-4000-8000-000000000005','${vendor}','20000000-0000-4000-8000-000000000005','2026-01-01','M11_FIXTURE');
      insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
       select ('b2000000-0000-4000-8000-'||lpad(row_number() over(order by id)::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000001',id,'2026-01-01','M11_FIXTURE'
       from public.permission where stable_code in('purchase.request.create','purchase.request.manage','purchase.resolution.manage','purchase.payment.record',
        'purchase.receipt.record','purchase.inspection.record','purchase.request.read','rnd.program.register','rnd.program.manage','rnd.budget.manage',
        'rnd.expenditure.record','rnd.evidence.record','rnd.deadline.manage','rnd.program.read');
      begin;
      insert into public.attachment(id,storage_provider,bucket_code,storage_key,declared_mime_type,declared_size_bytes,expected_sha256,
       detected_mime_type,detected_size_bytes,detected_sha256,signature_validation,scanner_id,scanner_version,scan_evidence_id,scan_verdict,
       security_level,uploader_user_id,state,row_version,intent_expires_at,created_at,verified_at,scanned_at)
      values('bf000000-0000-4000-8000-000000000001','SUPABASE_PRIVATE','PRIVATE_BUSINESS','private/m11/evidence/file.pdf','application/pdf',10,
       repeat('a',64),'application/pdf',10,repeat('a',64),'MATCH','M11_SCANNER','V1','bf000000-0000-4000-8000-000000000002','CLEAN',
       'SEC_L2_INTERNAL','${manager}','AVAILABLE',3,'2027-01-01','2026-08-22T08:00:00Z','2026-08-22T08:10:00Z','2026-08-22T08:20:00Z');
      insert into public.file_scan_evidence(id,attachment_id,detected_sha256,scanner_id,scanner_version,verdict,scanned_at)
      values('bf000000-0000-4000-8000-000000000002','bf000000-0000-4000-8000-000000000001',repeat('a',64),'M11_SCANNER','V1','CLEAN','2026-08-22T08:20:00Z');commit;`);
  }, 60_000);

  it("clean-applies M02 through M11 without inventing an RND Program machine", () => {
    expect(run("select count(*) from information_schema.tables where table_schema='public' and table_name in ('supplier','item','purchase_request_version','receipt_line','purchase_inspection','rnd_program','rnd_budget_version','rnd_expenditure','rnd_alert');")).toBe("9");
    expect(run("select count(*) from public.state_machine_definition where aggregate_type='RND_PROGRAM';")).toBe("0");
  });
  it("forces RLS and gives request or privileged writer no direct mutations", () => {
    const names = ["purchase_request", "purchase_request_version", "purchase_quotation", "purchase_resolution", "receipt", "purchase_inspection", "rnd_program", "rnd_expenditure", "rnd_alert"];
    expect(run(`select count(*) from pg_class where relnamespace='public'::regnamespace and relname in (${names.map((name) => `'${name}'`).join(",")}) and relrowsecurity and relforcerowsecurity;`)).toBe(String(names.length));
    expect(run(`select count(*) from information_schema.role_table_grants where grantee in('youone_request','youone_privileged_writer') and table_schema='public'
      and table_name in (${names.map((name) => `'${name}'`).join(",")}) and privilege_type in('INSERT','UPDATE','DELETE');`)).toBe("0");
  });
  it("denies Vendor Purchase and R&D rows and projections", () => {
    expect(run(`begin;set local role youone_request;${context(vendor)}select count(*) from public.purchase_request;select count(*) from public.rnd_program;rollback;`).split("\n").slice(-2)).toEqual(["0", "0"]);
    expect(run(`begin;set local role youone_request;${context(vendor)}select count(*) from public.read_purchase_hq('b3000000-0000-4000-8000-000000000001','${now}');rollback;`).split("\n").at(-1)).toBe("0");
  });
  it("hard-denies HQ mutation even if a mutation permission is mistakenly assigned", () => {
    run(`insert into public.role_permission_assignment(id,role_id,permission_id,valid_from,grant_reason_code)
      select 'b2000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000000008',id,'2026-01-01','M11_FIXTURE' from public.permission where stable_code='purchase.request.create';`);
    run(`begin;set local role youone_request;${context(hq)}select public.create_purchase_request('b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002','M11-HQ','${org}',
      'forged','2026-08-22','KRW',1000,'2026-08-01','2026-08-31',1000,'b3000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000004','b3000000-0000-4000-8000-000000000005','${now}');rollback;`, false);
  });
  it("allows exactly one concurrent optimistic Purchase create and records one atomic envelope", async () => {
    const call = (suffix: string) => `begin;set local role youone_request;${context(manager)}select public.create_purchase_request(
      'b3100000-0000-4000-8000-000000000001','b3100000-0000-4000-8000-000000000002','M11-REQ-1','${org}','lab equipment','2026-08-22','KRW',1000,
      '2026-08-01','2026-08-31',1000,'b3100000-0000-4000-8000-0000000000${suffix}','b3200000-0000-4000-8000-0000000000${suffix}',
      'b3300000-0000-4000-8000-0000000000${suffix}','${now}');commit;`;
    const result = await Promise.all([runAsync(call("01")), runAsync(call("02"))]);
    expect(result.filter((status) => status === 0)).toHaveLength(1);
    expect(run("select count(*) from public.audit_log a join public.state_transition_history t on t.audit_log_id=a.id join public.outbox_event o on o.initiating_audit_log_id=a.id where a.resource_type='PURCHASE_REQUEST' and a.resource_id='b3100000-0000-4000-8000-000000000001';")).toBe("1");
  });
  it("rolls Purchase creation back when Outbox identity conflicts", () => {
    const outbox = run("select id from public.outbox_event where aggregate_id='b3100000-0000-4000-8000-000000000001' limit 1;");
    run(`begin;set local role youone_request;${context(manager)}select public.create_purchase_request('b3400000-0000-4000-8000-000000000001','b3400000-0000-4000-8000-000000000002',
      'M11-ROLLBACK','${org}','rollback','2026-08-22','KRW',1000,'2026-08-01','2026-08-31',1000,'b3400000-0000-4000-8000-000000000003',
      'b3400000-0000-4000-8000-000000000004','${outbox}','${now}');commit;`, false);
    expect(run("select count(*) from public.purchase_request where id='b3400000-0000-4000-8000-000000000001';")).toBe("0");
  });
  it("rejects Purchase revision without an exact negative Approval predecessor", () => {
    run(`begin;set local role youone_request;${context(manager)}select public.create_purchase_request_revision(
      'b3100000-0000-4000-8000-000000000001','b3100000-0000-4000-8000-000000000002','b3410000-0000-4000-8000-000000000001',
      'unchanged revision','2026-08-22','KRW',1000,'2026-08-01','2026-08-31',1000,1,'RP-NO-NEGATIVE',
      'b3410000-0000-4000-8000-000000000002','b3410000-0000-4000-8000-000000000003','b3410000-0000-4000-8000-000000000004','${now}');commit;`, false);
    expect(run("select count(*) from public.purchase_request_version where id='b3410000-0000-4000-8000-000000000001';")).toBe("0");
  });
  it("rejects a high effective amount paired with a low-band policy preset", () => {
    run(`begin;
      insert into public.approval_policy(id,stable_code,status) values
       ('ba000000-0000-4000-8000-000000000001','M11_PURCHASE_LOW','ACTIVE'),
       ('ba000000-0000-4000-8000-000000000002','M11_PURCHASE_MID','ACTIVE'),
       ('ba000000-0000-4000-8000-000000000003','M11_PURCHASE_HIGH','ACTIVE');
      insert into public.approval_policy_version(id,policy_id,version_no,state,subject_kind,checksum,valid_from,created_by_user_id) values
       ('ba100000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001',1,'PUBLISHED','PURCHASE_REQUEST_VERSION',repeat('b',64),'2026-01-01','${manager}'),
       ('ba100000-0000-4000-8000-000000000002','ba000000-0000-4000-8000-000000000002',1,'PUBLISHED','PURCHASE_REQUEST_VERSION',repeat('c',64),'2026-01-01','${manager}'),
       ('ba100000-0000-4000-8000-000000000003','ba000000-0000-4000-8000-000000000003',1,'PUBLISHED','PURCHASE_REQUEST_VERSION',repeat('d',64),'2026-01-01','${manager}');
      insert into public.purchase_approval_preset_version(id,preset_code,version_no,currency,strengthened_legal_check_from,checksum,valid_from,sealed_at)
       values('ba200000-0000-4000-8000-000000000001','M11_INTERNAL_PRESET',1,'KRW',50000000,repeat('e',64),'2026-01-01','2026-01-01');
      insert into public.purchase_approval_tier(id,preset_version_id,tier_no,lower_amount,upper_amount,approval_policy_version_id,approval_policy_version_no,approval_policy_checksum) values
       ('ba300000-0000-4000-8000-000000000001','ba200000-0000-4000-8000-000000000001',1,0,1000000,'ba100000-0000-4000-8000-000000000001',1,repeat('b',64)),
       ('ba300000-0000-4000-8000-000000000002','ba200000-0000-4000-8000-000000000001',2,1000000,10000000,'ba100000-0000-4000-8000-000000000002',1,repeat('c',64)),
       ('ba300000-0000-4000-8000-000000000003','ba200000-0000-4000-8000-000000000001',3,10000000,null,'ba100000-0000-4000-8000-000000000003',1,repeat('d',64));
      insert into public.purchase_request(id,request_no,requester_user_id,owner_organization_id,current_version_id,current_version_no,state,version_no,created_at,updated_at)
       values('ba400000-0000-4000-8000-000000000001','M11-HIGH-LOW','${manager}','${org}','ba400000-0000-4000-8000-000000000002',1,'REQUEST_DRAFT',1,'${now}','${now}');
      insert into public.purchase_request_version(id,purchase_request_id,version_no,purpose,requested_on,currency,vat_included_total,anti_split_window_start,
       anti_split_window_end,effective_policy_amount,policy_facts_checksum,state,created_by_user_id,created_at)
       values('ba400000-0000-4000-8000-000000000002','ba400000-0000-4000-8000-000000000001',1,'high amount','2026-08-22','KRW',60000000,
       '2026-08-01','2026-08-31',60000000,repeat('f',64),'DRAFT','${manager}','${now}');
      insert into public.purchase_approval_policy_snapshot(purchase_request_version_id,preset_version_id,preset_version_no,preset_checksum,tier_id,
       effective_policy_amount,vat_included_total,anti_split_cumulative_exposure,amount_facts_checksum,strengthened_legal_check_required,selected_at)
       values('ba400000-0000-4000-8000-000000000002','ba200000-0000-4000-8000-000000000001',1,repeat('e',64),'ba300000-0000-4000-8000-000000000001',
       60000000,60000000,60000000,repeat('f',64),true,'${now}');commit;`);
    run(`select app_private.assert_purchase_policy_selection('ba400000-0000-4000-8000-000000000002','ba100000-0000-4000-8000-000000000001','${now}');`, false);
  });
  it("quarantines observed overage while counting only the accepted quantity", () => {
    run(`begin;
      insert into public.supplier(id,supplier_code,legal_name,state,created_at,updated_at) values('bb000000-0000-4000-8000-000000000001','M11_SUPPLIER','Supplier','ACTIVE','${now}','${now}');
      insert into public.item(id,item_code,name,specification,unit_code,state,created_at,updated_at) values('bb000000-0000-4000-8000-000000000002','M11_ITEM','Item','Spec','EA','ACTIVE','${now}','${now}');
      insert into public.purchase_request_line(id,purchase_request_version_id,sequence_no,item_id,specification_snapshot,quantity,unit_code,unit_price,line_amount,currency)
       values('bb000000-0000-4000-8000-000000000003','b3100000-0000-4000-8000-000000000002',1,'bb000000-0000-4000-8000-000000000002','Spec',10,'EA',100,1000,'KRW');
      insert into public.purchase_quotation(id,purchase_request_version_id,supplier_id,quotation_no,total_amount,currency,attachment_id,attachment_row_version,attachment_checksum,received_at)
       values('bb000000-0000-4000-8000-000000000004','b3100000-0000-4000-8000-000000000002','bb000000-0000-4000-8000-000000000001','Q-1',1000,'KRW',
       'bf000000-0000-4000-8000-000000000001',3,repeat('a',64),'${now}');
      select set_config('app.m11_purchase_command','b3100000-0000-4000-8000-000000000001',true);
      update public.purchase_request_version set state='APPROVED',sealed_snapshot_checksum=repeat('9',64),sealed_at='${now}' where id='b3100000-0000-4000-8000-000000000002';
      update public.purchase_request set state='PAYMENT_CONFIRMED',version_no=2 where id='b3100000-0000-4000-8000-000000000001';
      insert into public.purchase_resolution(id,purchase_request_id,purchase_request_version_id,request_version_no,request_checksum,request_sealed_at,
       selected_quotation_id,selected_supplier_id,resolution_reason,resolved_amount,currency,state,version_no,created_by_user_id,created_at,resolved_at)
       values('bb000000-0000-4000-8000-000000000005','b3100000-0000-4000-8000-000000000001','b3100000-0000-4000-8000-000000000002',1,repeat('9',64),'${now}',
       'bb000000-0000-4000-8000-000000000004','bb000000-0000-4000-8000-000000000001','fixture',1000,'KRW','EXTERNAL_PAYMENT_CONFIRMED',1,'${manager}','${now}','${now}');
      insert into public.receipt(id,receipt_no,purchase_resolution_id,purchase_request_id,received_on,received_by_user_id,state,version_no,created_at)
       values('bb000000-0000-4000-8000-000000000006','M11-RECEIPT','bb000000-0000-4000-8000-000000000005','b3100000-0000-4000-8000-000000000001','2026-08-22','${manager}','RECORDED',1,'${now}');commit;`);
    const prefix = `begin;set local role youone_request;${context(manager)}`;
    run(`${prefix}select public.add_receipt_line('bb000000-0000-4000-8000-000000000006','bb000000-0000-4000-8000-000000000007',
      'bb000000-0000-4000-8000-000000000003',12,10,'observed overage',null,null,null,'bb000000-0000-4000-8000-000000000008','${now}');commit;`, false);
    run(`${prefix}select public.add_receipt_line('bb000000-0000-4000-8000-000000000006','bb000000-0000-4000-8000-000000000007',
      'bb000000-0000-4000-8000-000000000003',12,10,'accepted ten','bb000000-0000-4000-8000-000000000009','PHYSICAL-OVERAGE',
      'bf000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000010','${now}');commit;`);
    expect(run("select received_quantity from public.receipt_line where id='bb000000-0000-4000-8000-000000000007';")).toBe("10.000000");
    expect(run("select excess_quantity||':'||resolution_status from public.receipt_overage_discrepancy where id='bb000000-0000-4000-8000-000000000009';")).toBe("2.000000:PENDING");
  });
  it("rejects a PurchaseInspection whose exact InspectionAttempt tuple does not match", () => {
    run(`begin;select set_config('app.m11_purchase_command','b3100000-0000-4000-8000-000000000001',true);
      update public.purchase_request set state='INSPECTION_PENDING' where id='b3100000-0000-4000-8000-000000000001';
      update public.receipt set state='INSPECTION_PENDING' where id='bb000000-0000-4000-8000-000000000006';commit;`);
    run(`begin;set local role youone_request;${context(manager)}select public.record_purchase_inspection(
      'bd000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000006','bd000000-0000-4000-8000-000000000002',
      'bd000000-0000-4000-8000-000000000003',1,repeat('1',64),'PASS','PASS','PASS','NOT_APPLICABLE','PASS','forged tuple',
      'bf000000-0000-4000-8000-000000000001',2,'bd000000-0000-4000-8000-000000000004','bd000000-0000-4000-8000-000000000005',
      'bd000000-0000-4000-8000-000000000006','${now}');commit;`, false);
    expect(run("select count(*) from public.purchase_inspection where id='bd000000-0000-4000-8000-000000000001';")).toBe("0");
  });
  it("seals an exact BudgetVersion and rejects later mutation", () => {
    run(`begin;set local role youone_request;${context(manager)}select public.create_rnd_program('b3500000-0000-4000-8000-000000000001','RND-M11','M11 Program','Agency',null,null,
      '2026-01-01','2026-12-31',1000,'KRW','b3500000-0000-4000-8000-000000000002','b3500000-0000-4000-8000-000000000003','${now}');
      select public.create_rnd_budget('b3500000-0000-4000-8000-000000000004','b3500000-0000-4000-8000-000000000005','b3500000-0000-4000-8000-000000000001','MAIN',1000,'KRW','b3500000-0000-4000-8000-000000000006','${now}');
      select public.add_rnd_budget_line('b3500000-0000-4000-8000-000000000004','b3500000-0000-4000-8000-000000000007','MATERIAL',1000,'Materials','b3500000-0000-4000-8000-000000000008','${now}');
      select public.seal_rnd_budget('b3500000-0000-4000-8000-000000000004','b3500000-0000-4000-8000-000000000009','b3500000-0000-4000-8000-000000000010','${now}');commit;`);
    run("update public.rnd_budget_version set total_amount=1 where id='b3500000-0000-4000-8000-000000000005';", false);
  });
  it("enforces exactly one typed R&D evidence subject and exact ContractVersion linkage", () => {
    run(`begin;set local role youone_request;${context(manager)}select public.record_rnd_expenditure(
      'bc000000-0000-4000-8000-000000000001','EXP-M11-1','b3500000-0000-4000-8000-000000000001','b3500000-0000-4000-8000-000000000005',
      'b3500000-0000-4000-8000-000000000007',null,'Counterparty','2026-08-22',100,'KRW','materials',null,null,null,null,
      'bc000000-0000-4000-8000-000000000002','RECEIPT','bf000000-0000-4000-8000-000000000001',
      'bc000000-0000-4000-8000-000000000003','bc000000-0000-4000-8000-000000000004','${now}');commit;`);
    run(`begin;
      insert into public.rnd_evidence(id,evidence_type_code,attachment_id,attachment_row_version,attachment_checksum,recorded_by_user_id,recorded_at)
       values('bc000000-0000-4000-8000-000000000005','DUPLICATE_SUBJECT','bf000000-0000-4000-8000-000000000001',3,repeat('a',64),'${manager}','${now}');
      insert into public.rnd_evidence_expenditure values('bc000000-0000-4000-8000-000000000005','bc000000-0000-4000-8000-000000000001');
      insert into public.rnd_evidence_budget_version select 'bc000000-0000-4000-8000-000000000005',id,checksum,sealed_at
       from public.rnd_budget_version where id='b3500000-0000-4000-8000-000000000005';commit;`, false);
    run(`insert into public.rnd_expenditure_contract(expenditure_id,contract_id,contract_version_id,contract_version_no,contract_version_checksum,contract_version_sealed_at)
      values('bc000000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000006','bc000000-0000-4000-8000-000000000007',1,repeat('1',64),'${now}');`, false);
    expect(run("select count(*) from public.rnd_expenditure_contract where expenditure_id='bc000000-0000-4000-8000-000000000001';")).toBe("0");
  });
  it("emits a deadline alert once for a deterministic idempotency key", () => {
    run(`begin;set local role youone_request;${context(manager)}select public.record_rnd_deadline('b3600000-0000-4000-8000-000000000001','b3500000-0000-4000-8000-000000000001','SETTLEMENT',
      '2026-08-21T09:00:00Z',null,'b3600000-0000-4000-8000-000000000002','b3600000-0000-4000-8000-000000000006','${now}');
      select public.emit_rnd_alert('b3600000-0000-4000-8000-000000000003','b3500000-0000-4000-8000-000000000001','DEADLINE_OVERDUE',null,
      'b3600000-0000-4000-8000-000000000001','rnd:deadline:b360:overdue','RND-DEADLINE-OVERDUE','b3600000-0000-4000-8000-000000000004',
      'b3600000-0000-4000-8000-000000000005','${now}');commit;`);
    expect(run("select count(*) from public.rnd_alert where idempotency_key='rnd:deadline:b360:overdue';")).toBe("1");
  });
});
