import { describe, expect, it } from "vitest";
import { Project, ProjectDomainError, WbsNode, type ProjectActorSnapshot, type ProjectCommand, type WbsCommand } from "../../packages/features/project/src/public.js";
import { correlationId, idempotencyKey, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const creator = uuid("10000000-0000-4000-8000-000000000001");
const owner = uuid("10000000-0000-4000-8000-000000000002");
const projectId = uuid("10000000-0000-4000-8000-000000000003");
const wbsId = uuid("10000000-0000-4000-8000-000000000004");
const vendorId = uuid("10000000-0000-4000-8000-000000000005");

function actor(input: Partial<ProjectActorSnapshot> = {}): ProjectActorSnapshot {
  return { actorKind: "INTERNAL", userId: creator, active: true, authorities: ["PM"], ...input };
}
function createCommand(a = actor()) {
  return { actor: a, at: utcInstant("2026-08-22T00:00:00Z"), eventId: uuid("11000000-0000-4000-8000-000000000001"), correlationId: correlationId("m06-create"), idempotencyKey: idempotencyKey("m06-create") };
}
function command(expected: number, a = actor(), reason?: string): ProjectCommand {
  return { ...createCommand(a), expectedVersion: version(expected), ...(reason ? { reason } : {}) };
}
function project(a = actor()) {
  return Project.create({ projectId, projectCode: "P-001", name: "일반 프로젝트", objective: "연구개발", ownerUserId: owner, periodStart: "2026-08-22", periodEnd: "2027-08-21", visibilityCode: stableCode("PROJECT.INTERNAL") }, createCommand(a));
}

describe("SM-PROJECT-V1", () => {
  it("allows every active internal creator to assign a different validated owner and denies Vendor creation", () => {
    const created = project();
    expect(created).toMatchObject({ expectedVersion: 0, snapshot: { state: "DRAFT", version: 1, ownerUserId: owner }, event: { eventType: "EVT-PROJECT-CREATE", aggregateVersion: 1 } });
    expect(() => project(actor({ actorKind: "VENDOR", userId: undefined, vendorId, authorities: [] }))).toThrowError(ProjectDomainError);
  });

  it("uses optimistic transitions and fails closed for close and reopen while OD-014 is open", () => {
    const aggregate = Project.restore(project().snapshot);
    expect(aggregate.plan(command(1, actor({ userId: owner, authorities: ["OWNER"] }))).snapshot.state).toBe("PLANNED");
    expect(() => aggregate.start(command(1))).toThrowError(/Optimistic version/);
    expect(() => aggregate.beginClose(command(2))).toThrowError(expect.objectContaining({ code: "OD-014-PROJECT-CLOSE" }));
    expect(() => aggregate.reopen(command(2))).toThrowError(expect.objectContaining({ code: "OD-014-PROJECT-CLOSE" }));
  });
});

describe("SM-WBS-V1", () => {
  function createWbs() {
    return WbsNode.create({ wbsNodeId: wbsId, projectId, nodeKind: "TASK", title: "검증", sortOrder: 0, ownerUserId: owner, assigneeUserId: creator, assignedVendorId: vendorId, progressPercent: 10 }, { ...createCommand(), projectIsActive: true }).snapshot;
  }
  function wbsCommand(expected: number, a: ProjectActorSnapshot, extra: Partial<WbsCommand> = {}): WbsCommand { return { ...command(expected, a), projectIsActive: true, ...extra }; }

  it("rejects cross-project parents and cycles", () => {
    const parentId = uuid("10000000-0000-4000-8000-000000000006");
    expect(() => WbsNode.create({ wbsNodeId: wbsId, projectId, parentId, parent: { wbsNodeId: parentId, projectId: uuid("10000000-0000-4000-8000-000000000099") }, proposedAncestorIds: [], nodeKind: "TASK", title: "x", sortOrder: 0, ownerUserId: owner, progressPercent: 0 }, { ...createCommand(), projectIsActive: true })).toThrowError(expect.objectContaining({ code: "WBS_PARENT_PROJECT_MISMATCH" }));
    expect(() => WbsNode.create({ wbsNodeId: wbsId, projectId, parentId, parent: { wbsNodeId: parentId, projectId }, proposedAncestorIds: [wbsId], nodeKind: "TASK", title: "x", sortOrder: 0, ownerUserId: owner, progressPercent: 0 }, { ...createCommand(), projectIsActive: true })).toThrowError(expect.objectContaining({ code: "WBS_CYCLE_FORBIDDEN" }));
  });

  it("permits scoped Vendor submission but never Vendor self-acceptance or child auto-completion", () => {
    const node = WbsNode.restore(createWbs());
    node.ready(wbsCommand(1, actor()));
    const vendor = actor({ actorKind: "VENDOR", userId: undefined, vendorId, projectScopeId: uuid("10000000-0000-4000-8000-000000000007"), authorities: ["VENDOR_ASSIGNEE"] });
    node.start(wbsCommand(2, vendor));
    node.submitReview(wbsCommand(3, vendor));
    expect(() => node.accept(wbsCommand(4, vendor))).toThrowError(expect.objectContaining({ code: "WBS_INTERNAL_REVIEWER_REQUIRED" }));
    expect(node.accept(wbsCommand(4, actor({ authorities: ["INTERNAL_REVIEWER"] }))).snapshot).toMatchObject({ state: "DONE", progressPercent: 100 });
    expect(createWbs()).toMatchObject({ state: "BACKLOG", progressPercent: 0 });
  });
});
