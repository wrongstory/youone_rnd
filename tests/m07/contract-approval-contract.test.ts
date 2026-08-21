import { describe, expect, it, vi } from "vitest";
import type {
  ApprovalActorSnapshot,
  ApprovalOutcomeInput,
  ApprovalPolicyVersion,
  ApprovalSubjectSnapshot,
  ResolvedStep
} from "../../packages/core/approval/src/public.js";
import {
  CONTRACT_APPROVAL_IMMUTABILITY_OBLIGATIONS,
  CONTRACT_MANAGER_ROLE_ID,
  ContractVersionApprovalSubjectAdapter,
  assertContractSignedTransition,
  selectContractApprovalPolicy,
  validateContractApprovalPolicy,
  type ContractApprovalPolicyEntry,
  type ContractVersionApprovalRecord
} from "../../packages/features/contract/src/approval/contracts.js";
import {
  correlationId,
  idempotencyKey,
  sha256,
  stableCode,
  utcInstant,
  uuid,
  version
} from "../../packages/shared-kernel/src/public.js";

const contractId = uuid("71000000-0000-4000-8000-000000000001");
const versionOneId = uuid("71000000-0000-4000-8000-000000000002");
const versionTwoId = uuid("71000000-0000-4000-8000-000000000003");
const approvalId = uuid("71000000-0000-4000-8000-000000000004");
const sealedAt = utcInstant("2026-08-22T01:00:00Z");
const outcomeAt = utcInstant("2026-08-22T02:00:00Z");
const checksumOne = sha256("a".repeat(64));
const checksumTwo = sha256("b".repeat(64));

function record(
  overrides: Partial<ContractVersionApprovalRecord> = {}
): ContractVersionApprovalRecord {
  return {
    contractVersionId: versionOneId,
    contractId,
    versionNo: 1,
    approvalState: "APPROVAL_PENDING",
    sealedSnapshotChecksum: checksumOne,
    sealedAt,
    signatureEvidenceIds: [],
    ...overrides
  };
}

function internalActor(
  userId: string,
  positionIds: readonly string[] = [],
  roleIds: readonly string[] = []
): ApprovalActorSnapshot {
  return {
    actorType: "USER",
    accountKind: "INTERNAL",
    authenticatedUserId: uuid(userId),
    effectiveUserId: uuid(userId),
    positionIds: positionIds.map(stableCode),
    roleIds: roleIds.map(stableCode)
  };
}

const representative = internalActor(
  "71000000-0000-4000-8000-000000000005",
  ["POSITION_REPRESENTATIVE"]
);

function provenance(
  outcome: ApprovalOutcomeInput["outcome"],
  actor: ApprovalActorSnapshot = representative
): ApprovalOutcomeInput["provenance"] {
  const actionKind = {
    COMPLETED: "APPROVE",
    REJECTED: "REJECT",
    RECALLED: "RECALL",
    CANCELLED: "CANCEL"
  } as const;
  const reasonCode = outcome === "REJECTED" ? stableCode("CONTRACT.TERMS_INCOMPLETE") : undefined;
  return {
    terminalAction: {
      actionId: uuid("71000000-0000-4000-8000-000000000006"),
      kind: actionKind[outcome],
      at: outcomeAt,
      actor,
      ...(reasonCode === undefined ? {} : { reasonCode })
    },
    ...(reasonCode === undefined ? {} : { terminalReasonCode: reasonCode }),
    actor,
    occurredAt: outcomeAt,
    correlationId: correlationId(`m07:contract:${outcome.toLowerCase()}`),
    idempotencyKey: idempotencyKey(`m07:contract:${outcome.toLowerCase()}:1`)
  };
}

describe("M07 ContractVersion typed approval subject", () => {
  it("seals and revalidates the exact version, checksum, and sealed time", async () => {
    const current = record();
    const adapter = new ContractVersionApprovalSubjectAdapter(
      { loadExact: async () => current, loadPrevious: async () => null },
      { applyVerifiedOutcome: async () => undefined }
    );

    const exact = await adapter.sealExactVersion({ kind: "CONTRACT_VERSION", contractVersionId: versionOneId });
    expect(exact).toEqual({
      subject: { kind: "CONTRACT_VERSION", contractVersionId: versionOneId },
      subjectVersion: version(1),
      checksum: checksumOne,
      sealedAt
    });
    await expect(adapter.assertExactVersion({ ...exact, checksum: checksumTwo })).rejects.toMatchObject({
      code: "CONTRACT_APPROVAL_SUBJECT_MISMATCH"
    });
    await expect(adapter.assertExactVersion({ ...exact, sealedAt: utcInstant("2026-08-22T01:00:01Z") })).rejects.toMatchObject({
      code: "CONTRACT_APPROVAL_SUBJECT_MISMATCH"
    });
  });

  it("allows only a direct strictly newer version on the same Contract root", async () => {
    const previous = record({ approvalState: "REJECTED" });
    const current = record({
      contractVersionId: versionTwoId,
      versionNo: 2,
      previousContractVersionId: versionOneId,
      sealedSnapshotChecksum: checksumTwo
    });
    let storedPredecessor: ContractVersionApprovalRecord | null = previous;
    const adapter = new ContractVersionApprovalSubjectAdapter(
      {
        loadExact: async (id) => id === versionOneId ? previous : current,
        loadPrevious: async () => storedPredecessor
      },
      { applyVerifiedOutcome: async () => undefined }
    );
    const snapshots = {
      previous: {
        subject: { kind: "CONTRACT_VERSION" as const, contractVersionId: versionOneId },
        subjectVersion: version(1), checksum: checksumOne, sealedAt
      },
      current: {
        subject: { kind: "CONTRACT_VERSION" as const, contractVersionId: versionTwoId },
        subjectVersion: version(2), checksum: checksumTwo, sealedAt
      }
    };

    await expect(adapter.assertResubmissionLineage(snapshots)).resolves.toBeUndefined();
    storedPredecessor = record({ contractVersionId: uuid("71000000-0000-4000-8000-000000000007") });
    await expect(adapter.assertResubmissionLineage(snapshots)).rejects.toMatchObject({
      code: "CONTRACT_RESUBMISSION_LINEAGE_INVALID"
    });
  });

  it("passes immutable terminal provenance and prevents Approval completion from signing or rewriting", async () => {
    const current = record();
    const applyVerifiedOutcome = vi.fn();
    const adapter = new ContractVersionApprovalSubjectAdapter(
      { loadExact: async () => current, loadPrevious: async () => null },
      { applyVerifiedOutcome }
    );
    const snapshot = await adapter.sealExactVersion({ kind: "CONTRACT_VERSION", contractVersionId: versionOneId });
    const terminal = provenance("COMPLETED");

    await adapter.applyApprovalOutcome({
      snapshot,
      approvalInstanceId: approvalId,
      approvalVersion: version(4),
      outcome: "COMPLETED",
      provenance: terminal
    });

    expect(applyVerifiedOutcome).toHaveBeenCalledWith(expect.objectContaining({
      snapshot,
      approvalInstanceId: approvalId,
      approvalVersion: version(4),
      outcome: "COMPLETED",
      decision: "APPROVED",
      exactVersion: current,
      provenance: terminal,
      obligations: CONTRACT_APPROVAL_IMMUTABILITY_OBLIGATIONS
    }));
    expect(CONTRACT_APPROVAL_IMMUTABILITY_OBLIGATIONS).toEqual({
      approvalCompletionDoesNotSign: true,
      signatureEvidenceRequiredBeforeSigned: true,
      signedVersionContentIsImmutable: true,
      amendmentRequiresDirectNewerVersion: true,
      amendmentPreservesSignedPredecessor: true,
      activationRequiresSeparateContractCommand: true
    });
  });

  it("requires signature evidence and a direct signed successor while preserving the signed predecessor", () => {
    const approved = record({ approvalState: "APPROVED" });
    const signatureEvidenceId = uuid("71000000-0000-4000-8000-000000000008");
    const signedAt = utcInstant("2026-08-22T03:00:00Z");
    const signed = record({ approvalState: "SIGNED", signedAt, signatureEvidenceIds: [signatureEvidenceId] });
    expect(() => assertContractSignedTransition({ previous: approved, current: signed })).not.toThrow();
    expect(() => assertContractSignedTransition({
      previous: signed,
      current: { ...signed, sealedSnapshotChecksum: checksumTwo, approvalState: "SUPERSEDED_BY_AMENDMENT", supersededByContractVersionId: versionTwoId }
    })).toThrowError(expect.objectContaining({ code: "CONTRACT_SIGNED_VERSION_IMMUTABLE" }));

    const amended = record({
      contractVersionId: versionTwoId,
      versionNo: 2,
      previousContractVersionId: versionOneId,
      approvalState: "SIGNED",
      sealedSnapshotChecksum: checksumTwo,
      signedAt: utcInstant("2026-08-22T04:00:00Z"),
      signatureEvidenceIds: [uuid("71000000-0000-4000-8000-000000000009")]
    });
    const preserved = { ...signed, approvalState: "SUPERSEDED_BY_AMENDMENT" as const, supersededByContractVersionId: versionTwoId };
    expect(() => assertContractSignedTransition({ previous: signed, current: preserved, amendment: amended })).not.toThrow();
  });

  it.each([
    ["REJECTED", "REJECTED"],
    ["RECALLED", "RECALLED"],
    ["CANCELLED", "CANCELLED"]
  ] as const)("forwards %s with complete terminal evidence", async (outcome, decision) => {
    const applyVerifiedOutcome = vi.fn();
    const adapter = new ContractVersionApprovalSubjectAdapter(
      { loadExact: async () => record(), loadPrevious: async () => null },
      { applyVerifiedOutcome }
    );
    const snapshot: ApprovalSubjectSnapshot = {
      subject: { kind: "CONTRACT_VERSION", contractVersionId: versionOneId },
      subjectVersion: version(1), checksum: checksumOne, sealedAt
    };
    const terminal = provenance(outcome);
    await adapter.applyApprovalOutcome({ snapshot, approvalInstanceId: approvalId, approvalVersion: version(5), outcome, provenance: terminal });
    expect(applyVerifiedOutcome).toHaveBeenCalledWith(expect.objectContaining({ decision, provenance: terminal }));
  });

  it("rejects outcome provenance whose terminal actor or action does not match", async () => {
    const adapter = new ContractVersionApprovalSubjectAdapter(
      { loadExact: async () => record(), loadPrevious: async () => null },
      { applyVerifiedOutcome: async () => undefined }
    );
    const snapshot: ApprovalSubjectSnapshot = {
      subject: { kind: "CONTRACT_VERSION", contractVersionId: versionOneId },
      subjectVersion: version(1), checksum: checksumOne, sealedAt
    };
    const invalid = provenance("COMPLETED");
    await expect(adapter.applyApprovalOutcome({
      snapshot, approvalInstanceId: approvalId, approvalVersion: version(4), outcome: "REJECTED", provenance: invalid
    })).rejects.toMatchObject({ code: "CONTRACT_APPROVAL_OUTCOME_PROVENANCE_INVALID" });
  });
});

const directorRuleId = uuid("72000000-0000-4000-8000-000000000001");
const representativeRuleId = uuid("72000000-0000-4000-8000-000000000002");
const directorUserId = uuid("72000000-0000-4000-8000-000000000003");
const representativeUserIds = [
  uuid("72000000-0000-4000-8000-000000000004"),
  uuid("72000000-0000-4000-8000-000000000005")
] as const;

function policyEntry(input: {
  readonly suffix: string;
  readonly tier: "STANDARD" | "STRENGTHENED";
  readonly priority: number;
  readonly minInclusive?: string;
  readonly maxExclusive?: string;
  readonly strengthenedRisk: "ANY" | "REQUIRED" | "EXCLUDED";
}): ContractApprovalPolicyEntry {
  const representativeMode = input.tier === "STRENGTHENED" ? "ALL" : "ANY_ONE";
  const policy: ApprovalPolicyVersion = {
    policyVersionId: uuid(`72000000-0000-4000-8000-${input.suffix.padStart(12, "0")}`),
    policyId: stableCode(`POL-CONTRACT-${input.suffix}`),
    version: 1,
    checksum: sha256(input.suffix.slice(-1).repeat(64)),
    state: "PUBLISHED",
    effectiveFrom: utcInstant("2026-01-01T00:00:00Z"),
    selection: {
      subjectKinds: ["CONTRACT_VERSION"],
      documentTypeIds: [],
      securityLevels: [],
      amountBand: {
        currency: "KRW",
        ...(input.minInclusive === undefined ? {} : { minInclusive: input.minInclusive }),
        ...(input.maxExclusive === undefined ? {} : { maxExclusive: input.maxExclusive })
      },
      strengthenedRisk: input.strengthenedRisk
    },
    recallAllowed: true,
    steps: [
      {
        ruleId: directorRuleId, sequenceNo: 1, role: "APPROVAL", completionMode: "SEQUENTIAL", required: true,
        allowedPositionIds: [stableCode("POSITION_LAB_DIRECTOR")], allowedRoleIds: []
      },
      {
        ruleId: representativeRuleId, sequenceNo: 2, role: "APPROVAL", completionMode: representativeMode, required: true,
        allowedPositionIds: [stableCode("POSITION_REPRESENTATIVE")], allowedRoleIds: []
      }
    ]
  };
  const line: readonly ResolvedStep[] = [
    {
      stepId: uuid(`73000000-0000-4000-8000-${input.suffix.padStart(12, "0")}`),
      ruleId: directorRuleId, sequenceNo: 1, role: "APPROVAL", completionMode: "SEQUENTIAL", required: true,
      participants: [{ participantId: uuid("74000000-0000-4000-8000-000000000001"), userId: directorUserId, positionId: stableCode("POSITION_LAB_DIRECTOR"), roleIds: [], order: 1 }]
    },
    {
      stepId: uuid(`75000000-0000-4000-8000-${input.suffix.padStart(12, "0")}`),
      ruleId: representativeRuleId, sequenceNo: 2, role: "APPROVAL", completionMode: representativeMode, required: true,
      participants: representativeUserIds.map((userId, index) => ({ participantId: uuid(`76000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`), userId, positionId: stableCode("POSITION_REPRESENTATIVE"), roleIds: [], order: index + 1 }))
    }
  ];
  return {
    policy,
    line,
    tier: input.tier,
    selectionPriority: input.priority,
    basis: { kind: "INTERNAL_PRESET", referenceId: stableCode("POL-CONTRACT-BASELINE-V1"), version: 1 }
  };
}

describe("M07 data-owned contract approval policy selection", () => {
  const submitter = internalActor(
    "77000000-0000-4000-8000-000000000001",
    [],
    [CONTRACT_MANAGER_ROLE_ID]
  );
  const catalog = [
    policyEntry({ suffix: "1", tier: "STANDARD", priority: 10, maxExclusive: "50000000", strengthenedRisk: "EXCLUDED" }),
    policyEntry({ suffix: "2", tier: "STRENGTHENED", priority: 20, minInclusive: "50000000", strengthenedRisk: "ANY" }),
    policyEntry({ suffix: "3", tier: "STRENGTHENED", priority: 30, maxExclusive: "50000000", strengthenedRisk: "REQUIRED" })
  ];

  it("uses ANY_ONE below the policy-stored band and ALL at or above it", () => {
    const standard = selectContractApprovalPolicy(catalog, {
      at: utcInstant("2026-08-22T00:00:00Z"), submitter,
      selection: { amount: { currency: "KRW", value: "49999999" }, strengthenedRisk: false }
    });
    const amountStrengthened = selectContractApprovalPolicy(catalog, {
      at: utcInstant("2026-08-22T00:00:00Z"), submitter,
      selection: { amount: { currency: "KRW", value: "50000000" }, strengthenedRisk: false }
    });
    expect(standard.tier).toBe("STANDARD");
    expect(standard.policy.steps[1]?.completionMode).toBe("ANY_ONE");
    expect(amountStrengthened.tier).toBe("STRENGTHENED");
    expect(amountStrengthened.policy.steps[1]?.completionMode).toBe("ALL");
  });

  it("selects Representative ALL for strengthened risk independently of amount", () => {
    const selected = selectContractApprovalPolicy(catalog, {
      at: utcInstant("2026-08-22T00:00:00Z"), submitter,
      selection: { amount: { currency: "KRW", value: "1000000" }, strengthenedRisk: true }
    });
    expect(selected.tier).toBe("STRENGTHENED");
    expect(selected.policy.selection.strengthenedRisk).toBe("REQUIRED");
    expect(selected.policy.steps[1]?.completionMode).toBe("ALL");
  });

  it("rejects a strengthened policy without a versioned risk or amount selector", () => {
    const invalid = policyEntry({ suffix: "4", tier: "STRENGTHENED", priority: 40, strengthenedRisk: "ANY" });
    expect(() => validateContractApprovalPolicy(invalid)).toThrowError(expect.objectContaining({
      code: "CONTRACT_STRENGTHENED_POLICY_SELECTOR_REQUIRED"
    }));
  });

  it("does not let a non-manager or an ambiguous catalog choose the approval line", () => {
    const nonManager = internalActor("77000000-0000-4000-8000-000000000002");
    expect(() => selectContractApprovalPolicy(catalog, {
      at: utcInstant("2026-08-22T00:00:00Z"), submitter: nonManager,
      selection: { amount: { currency: "KRW", value: "1000000" }, strengthenedRisk: false }
    })).toThrowError(expect.objectContaining({ code: "CONTRACT_MANAGER_SUBMITTER_REQUIRED" }));
    const duplicate = { ...catalog[0]!, policy: { ...catalog[0]!.policy, policyVersionId: uuid("78000000-0000-4000-8000-000000000001") } };
    expect(() => selectContractApprovalPolicy([...catalog, duplicate], {
      at: utcInstant("2026-08-22T00:00:00Z"), submitter,
      selection: { amount: { currency: "KRW", value: "1000000" }, strengthenedRisk: false }
    })).toThrowError(expect.objectContaining({ code: "CONTRACT_APPROVAL_POLICY_AMBIGUOUS" }));
  });
});
