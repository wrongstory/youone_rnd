import { describe, expect, it, vi } from "vitest";
import {
  ApprovalConcurrencyError,
  ApprovalInstance,
  persistApprovalMutation,
  type ApprovalActorSnapshot,
  type ApprovalCommand,
  type ApprovalPolicyVersion,
  type ApprovalTransactionContext,
  type ResolvedStep
} from "../../packages/core/approval/src/public.js";
import { DocumentManifestFactory, type DocumentAttachmentManifestItem, type SealedDocumentManifest } from "../../packages/core/document/src/public.js";
import { correlationId, idempotencyKey, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const at = utcInstant("2026-08-23T01:00:00Z");
const submitterId = uuid("16000000-0000-4000-8000-000000000001");
const directorId = uuid("16000000-0000-4000-8000-000000000002");
const approvalInstanceId = uuid("16000000-0000-4000-8000-000000000003");
const stepId = uuid("16000000-0000-4000-8000-000000000004");
const ruleId = uuid("16000000-0000-4000-8000-000000000005");
const participantId = uuid("16000000-0000-4000-8000-000000000006");
const documentVersionId = uuid("16000000-0000-4000-8000-000000000007");

const actor = (userId: typeof submitterId): ApprovalActorSnapshot => ({
  actorType: "USER",
  accountKind: "INTERNAL",
  authenticatedUserId: userId,
  effectiveUserId: userId,
  positionIds: [stableCode("POSITION_LAB_DIRECTOR")],
  roleIds: []
});

let sequence = 1;
function command(userId: typeof submitterId, expectedVersion: number): ApprovalCommand {
  const current = sequence++;
  return {
    actor: actor(userId),
    at,
    expectedVersion: version(expectedVersion),
    actionId: uuid(`16100000-0000-4000-8000-${String(current).padStart(12, "0")}`),
    eventId: uuid(`16200000-0000-4000-8000-${String(current).padStart(12, "0")}`),
    correlationId: correlationId(`m16:approval:${current}`),
    idempotencyKey: idempotencyKey(`m16:approval:${current}`)
  };
}

function activeApproval() {
  const policy: ApprovalPolicyVersion = {
    policyVersionId: uuid("16000000-0000-4000-8000-000000000008"),
    policyId: stableCode("POL-M16-DOCUMENT"),
    version: 1,
    checksum: sha256("a".repeat(64)),
    state: "PUBLISHED",
    effectiveFrom: at,
    selection: { subjectKinds: ["DOCUMENT_VERSION"], documentTypeIds: [], securityLevels: ["L3"], strengthenedRisk: "ANY" },
    recallAllowed: true,
    steps: [{ ruleId, sequenceNo: 1, role: "APPROVAL", completionMode: "SEQUENTIAL", required: true, allowedPositionIds: [stableCode("POSITION_LAB_DIRECTOR")], allowedRoleIds: [] }]
  };
  const line: ResolvedStep[] = [{
    stepId,
    ruleId,
    sequenceNo: 1,
    role: "APPROVAL",
    completionMode: "SEQUENTIAL",
    required: true,
    participants: [{ participantId, userId: directorId, positionId: stableCode("POSITION_LAB_DIRECTOR"), roleIds: [], order: 1 }]
  }];
  const aggregate = ApprovalInstance.create({ approvalInstanceId, submitterUserId: submitterId });
  aggregate.submit(command(submitterId, 0), {
    subject: { kind: "DOCUMENT_VERSION", documentVersionId },
    subjectVersion: version(4),
    checksum: sha256("b".repeat(64)),
    sealedAt: at
  }, policy, line, { securityLevel: "L3", strengthenedRisk: false });
  aggregate.activate({ ...command(submitterId, 1), actor: { actorType: "SYSTEM", accountKind: "SYSTEM", positionIds: [], roleIds: [] } });
  return { aggregate, policy, line };
}

describe("M16 approval/document evidence regression", () => {
  it("keeps the exact approval subject, policy and line snapshot isolated from caller mutation", () => {
    const { aggregate, policy, line } = activeApproval();
    (policy.selection.securityLevels as string[])[0] = "L1";
    (line[0]!.participants as { userId: string }[])[0]!.userId = submitterId;
    const snapshot = aggregate.snapshot();
    expect(snapshot.submission?.policy.selection.securityLevels).toEqual(["L3"]);
    expect(snapshot.submission?.line[0]?.participants[0]?.userId).toBe(directorId);
    expect(snapshot.submission?.subject).toMatchObject({ subjectVersion: 4, checksum: "b".repeat(64) });
  });

  it("lets only one concurrent approval action persist and emits evidence only for the winner", async () => {
    const base = activeApproval().aggregate.snapshot();
    const first = ApprovalInstance.restore(base).act({
      ...command(directorId as typeof submitterId, 2),
      actor: actor(directorId as typeof submitterId),
      kind: "APPROVE",
      stepId,
      participantId,
      completionEventId: uuid("16000000-0000-4000-8000-000000000009")
    });
    const second = ApprovalInstance.restore(base).act({
      ...command(directorId as typeof submitterId, 2),
      actor: actor(directorId as typeof submitterId),
      kind: "APPROVE",
      stepId,
      participantId,
      completionEventId: uuid("16000000-0000-4000-8000-000000000010")
    });
    let storedVersion = Number(base.version);
    const appendAction = vi.fn(async () => undefined);
    const appendAudit = vi.fn(async () => undefined);
    const enqueue = vi.fn(async () => undefined);
    const context = {
      approvals: {
        loadForUpdate: async () => base,
        insert: async () => undefined,
        save: async (_snapshot, expectedVersion) => {
          if (Number(expectedVersion) !== storedVersion) return false;
          storedVersion += 1;
          return true;
        }
      },
      evidence: { appendAction, appendAudit, enqueue },
      subjects: { get: () => { throw new Error("unused"); } },
      actingAuthorities: { assertActive: async () => undefined }
    } satisfies ApprovalTransactionContext;

    await persistApprovalMutation(context, first);
    await expect(persistApprovalMutation(context, second)).rejects.toBeInstanceOf(ApprovalConcurrencyError);
    expect(appendAction).toHaveBeenCalledTimes(1);
    expect(appendAudit).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("deep-freezes the exact sealed document manifest and rejects builder drift", async () => {
    const attachment: DocumentAttachmentManifestItem = {
      attachmentId: uuid("16000000-0000-4000-8000-000000000011"),
      sha256: sha256("c".repeat(64)),
      mimeType: "application/pdf",
      sizeBytes: 1024,
      securityLevel: "L3"
    };
    let retained: SealedDocumentManifest | undefined;
    const factory = new DocumentManifestFactory({
      build: async (input) => {
        retained = { ...input, attachments: input.attachments.map((item) => ({ ...item })), checksum: sha256("d".repeat(64)), evidenceId: uuid("16000000-0000-4000-8000-000000000012") };
        return retained;
      }
    });
    const manifest = await factory.create({
      manifestSchemaId: stableCode("DOCUMENT.MANIFEST.V1"),
      manifestSchemaVersion: 1,
      contentChecksum: sha256("e".repeat(64)),
      attachments: [attachment],
      effectiveSecurityLevel: "L3",
      rendererId: stableCode("PDF_RENDERER"),
      rendererVersion: stableCode("V1")
    });
    (retained!.attachments as { mimeType: string }[])[0]!.mimeType = "text/plain";
    expect(manifest.attachments[0]?.mimeType).toBe("application/pdf");
    expect(Object.isFrozen(manifest.attachments)).toBe(true);
    expect(Object.isFrozen(manifest.attachments[0])).toBe(true);

    const drifting = new DocumentManifestFactory({ build: async (input) => ({ ...input, manifestSchemaVersion: 2, checksum: sha256("f".repeat(64)), evidenceId: uuid("16000000-0000-4000-8000-000000000013") }) });
    await expect(drifting.create({
      manifestSchemaId: stableCode("DOCUMENT.MANIFEST.V1"), manifestSchemaVersion: 1, contentChecksum: sha256("e".repeat(64)), attachments: [attachment], effectiveSecurityLevel: "L3", rendererId: stableCode("PDF_RENDERER"), rendererVersion: stableCode("V1")
    })).rejects.toThrow(/may hash and attach evidence/);
  });
});
