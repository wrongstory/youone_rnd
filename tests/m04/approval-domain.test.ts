import { describe, expect, it } from "vitest";
import { ApprovalDomainError, ApprovalInstance, normalizePolicy, validateResearchProjectDesignationLine, type ApprovalActorSnapshot, type ApprovalCommand, type ApprovalPolicyVersion, type ResolvedStep } from "../../packages/core/approval/src/public.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const at = utcInstant("2026-08-22T00:00:00Z");
const submitter = uuid("10000000-0000-4000-8000-000000000001");
const director = uuid("10000000-0000-4000-8000-000000000002");
const representative1 = uuid("10000000-0000-4000-8000-000000000003");
const representative2 = uuid("10000000-0000-4000-8000-000000000004");
const actor = (userId: typeof submitter, position = "POSITION_LAB_DIRECTOR"): ApprovalActorSnapshot => ({ actorType: "USER", accountKind: "INTERNAL", authenticatedUserId: userId, effectiveUserId: userId, positionIds: [stableCode(position)], roleIds: [] });
let seq = 1;
const command = (userId: typeof submitter, expectedVersion: number): ApprovalCommand => ({ actor: actor(userId), at, expectedVersion: version(expectedVersion), actionId: uuid(`20000000-0000-4000-8000-${String(seq++).padStart(12,"0")}`), eventId: uuid(`30000000-0000-4000-8000-${String(seq++).padStart(12,"0")}`), correlationId: correlationId("m04:test"), idempotencyKey: idempotencyKey(`m04:${seq}`) });
const policy = (position = "POSITION_LAB_DIRECTOR", mode?: "SEQUENTIAL"|"ANY_ONE"): ApprovalPolicyVersion => ({
  policyVersionId: uuid("40000000-0000-4000-8000-000000000001"), policyId: stableCode("POL-APPROVAL-MATRIX-V1"), version: 1, checksum: sha256("a".repeat(64)), state: "PUBLISHED", effectiveFrom: at,
  selection: { subjectKinds: ["DOCUMENT_VERSION"], documentTypeIds: [], securityLevels: ["L1"], strengthenedRisk: "ANY" }, recallAllowed: true,
  steps: [{ ruleId: uuid("50000000-0000-4000-8000-000000000001"), sequenceNo: 1, role: "APPROVAL", completionMode: mode, required: true, allowedPositionIds: [stableCode(position)], allowedRoleIds: [] }]
});
const line = (position = "POSITION_LAB_DIRECTOR", users = [director], mode: "SEQUENTIAL"|"ANY_ONE" = "SEQUENTIAL"): ResolvedStep[] => [{
  stepId: uuid("60000000-0000-4000-8000-000000000001"), ruleId: uuid("50000000-0000-4000-8000-000000000001"), sequenceNo: 1, role: "APPROVAL", completionMode: mode, required: true,
  participants: users.map((userId, i) => ({ participantId: uuid(`70000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`), userId, positionId: stableCode(position), roleIds: [], order: i+1 }))
}];
const subject = { subject: { kind: "DOCUMENT_VERSION" as const, documentVersionId: uuid("80000000-0000-4000-8000-000000000001") }, subjectVersion: version(3), checksum: sha256("b".repeat(64)), sealedAt: at };

function submitted(p = policy(), l = line()): ApprovalInstance {
  const instance = ApprovalInstance.create({ approvalInstanceId: uuid("90000000-0000-4000-8000-000000000001"), submitterUserId: submitter });
  instance.submit(command(submitter, 0), subject, p, l, { securityLevel: "L1", strengthenedRisk: false }); instance.activate({ ...command(submitter, 1), actor: { actorType: "SYSTEM", accountKind: "SYSTEM", positionIds: [], roleIds: [] } }); return instance;
}

describe("SM-APPROVAL-V1", () => {
  it("rejects Senior Researcher official approval in policy and resolved authority", () => {
    expect(() => normalizePolicy(policy("POSITION_SENIOR_RESEARCHER"))).toThrowError(ApprovalDomainError);
    expect(() => submitted(policy("LAB_DIRECTOR"), line("LAB_DIRECTOR"))).toThrowError(/Director or Representative/i);
  });
  it("defaults Representative policy to ANY_ONE and completes on exactly one action", () => {
    const p = normalizePolicy(policy("POSITION_REPRESENTATIVE")); expect(p.steps[0]?.completionMode).toBe("ANY_ONE");
    const instance = submitted(p, line("POSITION_REPRESENTATIVE", [representative1, representative2], "ANY_ONE"));
    const result = instance.act({ ...command(representative1, 2), completionEventId: uuid("30000000-0000-4000-8000-000000009999"), actor: actor(representative1, "POSITION_REPRESENTATIVE"), stepId: uuid("60000000-0000-4000-8000-000000000001"), participantId: uuid("70000000-0000-4000-8000-000000000001"), kind: "APPROVE" });
    expect(result.instance.state).toBe("COMPLETED"); expect(result.events.map((event) => event.eventType)).toEqual(["EVT-APPROVAL-APPROVED", "EVT-APPROVAL-COMPLETED"]);
    expect(result.instance.steps[0]?.participants.map((x) => x.state)).toEqual(["COMPLETED", "CANCELLED"]);
    expect(() => instance.act({ ...command(representative2, 2), actor: actor(representative2, "POSITION_REPRESENTATIVE"), stepId: uuid("60000000-0000-4000-8000-000000000001"), participantId: uuid("70000000-0000-4000-8000-000000000002"), kind: "APPROVE" })).toThrowError(/version/i);
  });
  it("preserves rejection actions and creates a linked new generation", () => {
    const instance = submitted();
    instance.reject({ ...command(director, 2), actor: actor(director), stepId: uuid("60000000-0000-4000-8000-000000000001"), participantId: uuid("70000000-0000-4000-8000-000000000001"), reasonCode: stableCode("REASON.REWORK") });
    const before = instance.snapshot(); const next = instance.createResubmission({ approvalInstanceId: uuid("90000000-0000-4000-8000-000000000002"), submitterUserId: submitter }).snapshot();
    expect(before.actions.at(-1)?.kind).toBe("REJECT"); expect(next).toMatchObject({ generation: 2, previousInstanceId: before.approvalInstanceId, state: "DRAFT" }); expect(next.submission).toBeUndefined();
  });
  it("rejects a subject that does not match the selected policy snapshot", () => {
    const instance = ApprovalInstance.create({ approvalInstanceId: uuid("90000000-0000-4000-8000-000000000003"), submitterUserId: submitter });
    const wrong = { ...subject, subject: { kind: "PURCHASE_REQUEST" as const, purchaseRequestVersionId: uuid("80000000-0000-4000-8000-000000000002") } };
    expect(() => instance.submit(command(submitter, 0), wrong, policy(), line(), { securityLevel: "L1", strengthenedRisk: false })).toThrowError(/policy conditions/i);
  });
  it("requires exactly one Lab Director step for formal research designation", () => {
    expect(() => validateResearchProjectDesignationLine(line("POSITION_REPRESENTATIVE", [representative1], "ANY_ONE"))).toThrowError(/Lab Director/i);
  });
  it("allows an explicit Representative ALL rule for strengthened policy", () => {
    const all = { ...policy("POSITION_REPRESENTATIVE"), steps: [{ ...policy("POSITION_REPRESENTATIVE").steps[0]!, completionMode: "ALL" as const }] };
    expect(normalizePolicy(all).steps[0]?.completionMode).toBe("ALL");
  });
  it("requires direct internal submitter and system activation", () => {
    const instance = ApprovalInstance.create({ approvalInstanceId: uuid("90000000-0000-4000-8000-000000000004"), submitterUserId: submitter });
    expect(() => instance.submit({ ...command(submitter, 0), actor: { actorType: "SYSTEM", accountKind: "SYSTEM", positionIds: [], roleIds: [] } }, subject, policy(), line(), { securityLevel: "L1", strengthenedRisk: false })).toThrowError(/direct internal/i);
    instance.submit(command(submitter, 0), subject, policy(), line(), { securityLevel: "L1", strengthenedRisk: false });
    expect(() => instance.activate(command(submitter, 1))).toThrowError(/system transition/i);
  });
});
