import { describe, expect, it, vi } from "vitest";
import { persistProjectCreation, persistProjectMutation, persistWbsCreation, Project, ProjectConcurrencyError, WbsNode, type ProjectActorSnapshot, type ProjectTransactionContext } from "../../packages/features/project/src/public.js";
import { correlationId, idempotencyKey, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const actor: ProjectActorSnapshot = { actorKind: "INTERNAL", userId: uuid("20000000-0000-4000-8000-000000000001"), active: true, authorities: [] };
function mutation() {
  return Project.create({ projectId: uuid("20000000-0000-4000-8000-000000000002"), projectCode: "P-002", name: "P", objective: "O", ownerUserId: uuid("20000000-0000-4000-8000-000000000003"), periodStart: "2026-01-01", periodEnd: "2026-12-31", visibilityCode: stableCode("PROJECT.INTERNAL") }, { actor, at: utcInstant("2026-08-22T00:00:00Z"), eventId: uuid("20000000-0000-4000-8000-000000000004"), correlationId: correlationId("m06-application"), idempotencyKey: idempotencyKey("m06-application") });
}

describe("Project application transaction boundary", () => {
  it("persists state, transition, audit and outbox in one unit of work", async () => {
    const save = vi.fn(async () => true);
    const appendTransition = vi.fn(async () => undefined);
    const appendAudit = vi.fn(async () => undefined);
    const enqueue = vi.fn(async () => undefined);
    const context = { projects: { save, loadForUpdate: vi.fn(), insert: vi.fn(), appendMember: vi.fn(), appendProductLink: vi.fn(), appendRndProgramLink: vi.fn() }, wbs: { save: vi.fn(), loadForUpdate: vi.fn(), insert: vi.fn(), assertParentInProject: vi.fn(), assertNoCycle: vi.fn() }, identities: { assertActiveInternalUser: vi.fn() }, evidence: { appendTransition, appendAudit, enqueue } } as unknown as ProjectTransactionContext;
    await persistProjectCreation({ transact: async (work) => work(context) }, mutation());
    expect(context.identities.assertActiveInternalUser).toHaveBeenCalledWith(mutation().snapshot.ownerUserId);
    expect(context.projects.insert).toHaveBeenCalledWith(expect.objectContaining({ state: "DRAFT", version: 1 }));
    expect(save).not.toHaveBeenCalled();
    expect(appendTransition).toHaveBeenCalledWith(expect.objectContaining({ fromVersion: 0, toVersion: 1 }));
    expect(appendAudit).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it("fails before evidence writes when optimistic save loses", async () => {
    const appendAudit = vi.fn();
    const aggregate = Project.restore(mutation().snapshot);
    const transition = aggregate.plan({ actor: { ...actor, userId: mutation().snapshot.ownerUserId, authorities: ["OWNER"] }, at: utcInstant("2026-08-22T00:01:00Z"), expectedVersion: version(1), eventId: uuid("20000000-0000-4000-8000-000000000005"), correlationId: correlationId("m06-transition"), idempotencyKey: idempotencyKey("m06-transition") });
    const context = { projects: { save: async () => false }, wbs: {}, identities: {}, evidence: { appendTransition: vi.fn(), appendAudit, enqueue: vi.fn() } } as unknown as ProjectTransactionContext;
    await expect(persistProjectMutation({ transact: async (work) => work(context) }, transition)).rejects.toBeInstanceOf(ProjectConcurrencyError);
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it("rejects an inactive owner before Project insert or evidence", async () => {
    const insert = vi.fn();
    const enqueue = vi.fn();
    const context = { projects: { insert }, wbs: {}, identities: { assertActiveInternalUser: vi.fn(async () => { throw new Error("OWNER_INACTIVE"); }) }, evidence: { appendTransition: vi.fn(), appendAudit: vi.fn(), enqueue } } as unknown as ProjectTransactionContext;
    await expect(persistProjectCreation({ transact: async (work) => work(context) }, mutation())).rejects.toThrow("OWNER_INACTIVE");
    expect(insert).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("validates WBS parent project and cycle before insert in the same UoW", async () => {
    const parentId = uuid("20000000-0000-4000-8000-000000000006");
    const created = WbsNode.create({ wbsNodeId: uuid("20000000-0000-4000-8000-000000000007"), projectId: mutation().snapshot.projectId, parentId, parent: { wbsNodeId: parentId, projectId: mutation().snapshot.projectId }, nodeKind: "TASK", title: "child", sortOrder: 0, ownerUserId: actor.userId!, progressPercent: 0 }, { actor: { ...actor, authorities: ["PM"] }, at: utcInstant("2026-08-22T00:00:00Z"), eventId: uuid("20000000-0000-4000-8000-000000000008"), correlationId: correlationId("m06-wbs"), idempotencyKey: idempotencyKey("m06-wbs"), projectIsActive: true });
    const assertParentInProject = vi.fn(async () => undefined);
    const assertNoCycle = vi.fn(async () => undefined);
    const insert = vi.fn(async () => undefined);
    const context = { projects: {}, identities: {}, wbs: { assertParentInProject, assertNoCycle, insert }, evidence: { appendTransition: vi.fn(), appendAudit: vi.fn(), enqueue: vi.fn() } } as unknown as ProjectTransactionContext;
    await persistWbsCreation({ transact: async (work) => work(context) }, created);
    expect(assertParentInProject).toHaveBeenCalledWith(parentId, created.snapshot.projectId);
    expect(assertNoCycle).toHaveBeenCalledWith(created.snapshot.wbsNodeId, parentId);
    expect(insert).toHaveBeenCalledAfter(assertNoCycle);
  });
});
