import { describe, expect, it, vi } from "vitest";
import { persistContractMutation, type ContractTransactionContext, type VendorContractListSafeItem } from "../../packages/features/contract/src/application/contracts.js";
import { ContractVersion, VendorContract, type ContractActorSnapshot, type ContractVersionSnapshot } from "../../packages/features/contract/src/domain/contract.js";
import { correlationId, idempotencyKey, money, sha256, stableCode, utcInstant, uuid, version } from "../../packages/shared-kernel/src/public.js";

const id = (n: number) => uuid(`72000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const manager = id(1), vendorId = id(2), contractId = id(3), projectId = id(4), contractVersionId = id(5);
function actor(authorities: ContractActorSnapshot["authorities"]): ContractActorSnapshot { return { actorKind: "INTERNAL", userId: manager, active: true, authorities }; }
function command(expected: number, authorities: ContractActorSnapshot["authorities"], reason?: string) { return { actor: actor(authorities), at: utcInstant("2026-08-22T04:00:00Z"), expectedVersion: version(expected), eventId: id(6), correlationId: correlationId("m07-app"), idempotencyKey: idempotencyKey("m07-app"), ...(reason ? { reason } : {}) }; }
function rootSnapshot() { return VendorContract.create({ contractId, vendorId, contractNo: "C-APP-1", title: "계약", managerUserId: manager, projectLinks: [{ contractProjectId: id(7), contractId, projectId, validFrom: "2026-09-01", validTo: "2027-08-31" }] }, { ...command(0, ["CONTRACT_MANAGER"]), vendorExists: true }).snapshot; }
function signed(): ContractVersionSnapshot { const digest = sha256("d".repeat(64)); const sealed = ContractVersion.draft({ contractVersionId, contractId, versionNo: 1, versionKind: "ORIGINAL", statementOfWorkDocumentVersionId: id(8), requirementsSnapshotId: id(9), effectiveFrom: "2026-09-01", effectiveTo: "2027-08-31", contractAmount: money("1000", "KRW"), intellectualPropertyTermsCode: stableCode("IP.COMPANY"), securityTermsCode: stableCode("SEC.L2"), warrantyTermsCode: stableCode("WARRANTY.V1"), liabilityTermsCode: stableCode("LIABILITY.NON_WAIVER"), policyProvenance: { presetPolicyId: stableCode("POL-CONTRACT-BASELINE-V1"), presetPolicyVersion: 1, legalBaselineId: stableCode("LEGAL-KR-2026-08"), legalBaselineVersion: 1, overrideApplied: false }, createdAt: utcInstant("2026-08-22T03:00:00Z") }).seal(digest, utcInstant("2026-08-22T03:10:00Z")); return ContractVersion.restore(sealed).sign({ approvalInstanceId: id(10), subjectContractVersionId: contractVersionId, subjectManifestHash: digest, outcome: "APPROVED", decidedAt: utcInstant("2026-08-22T03:20:00Z") }, id(11), utcInstant("2026-08-22T03:30:00Z")); }
function context(save = vi.fn(async () => true)) { return { contracts: { save, insert: vi.fn(), insertImmutableVersion: vi.fn(), supersedeVersion: vi.fn(), insertMilestones: vi.fn() }, deliverables: {}, scopes: { issueExactContractScopes: vi.fn(async () => undefined), refreshExactContractScopes: vi.fn(async () => undefined), revokeAllContractScopes: vi.fn(async () => undefined) }, evidence: { appendTransition: vi.fn(async () => undefined), appendAudit: vi.fn(async () => undefined), enqueue: vi.fn(async () => undefined) } } as unknown as ContractTransactionContext; }

describe("Contract application transaction boundary", () => {
  it("issues exact Vendor/Project/Contract scope atomically with activation evidence", async () => {
    const aggregate = VendorContract.restore({ ...rootSnapshot(), state: "SIGNED", currentSignedVersionId: contractVersionId, currentSignedVersionNo: 1, version: version(5) });
    const mutation = aggregate.activate({ ...command(5, ["CONTRACT_MANAGER"]), effectiveOn: "2026-09-01" }, signed());
    const ctx = context();
    await persistContractMutation({ transact: async (work) => work(ctx) }, mutation, signed());
    expect(ctx.contracts.save).toHaveBeenCalledWith(expect.objectContaining({ state: "ACTIVE" }), 5);
    expect(ctx.scopes.issueExactContractScopes).toHaveBeenCalledWith({ contractId, vendorId, projectIds: [projectId], validFrom: "2026-09-01", validTo: "2027-08-31" });
    expect(ctx.evidence.appendAudit).toHaveBeenCalledOnce(); expect(ctx.evidence.enqueue).toHaveBeenCalledOnce();
  });

  it("revokes every Contract scope in the same close transaction", async () => {
    const aggregate = VendorContract.restore({ ...rootSnapshot(), state: "CLOSING", currentSignedVersionId: contractVersionId, currentSignedVersionNo: 1, version: version(9) });
    const mutation = aggregate.close(command(9, ["DIRECTOR"], "종결 승인"));
    const ctx = context();
    await persistContractMutation({ transact: async (work) => work(ctx) }, mutation);
    expect(ctx.scopes.revokeAllContractScopes).toHaveBeenCalledWith(expect.objectContaining({ contractId, vendorId, reason: "종결 승인" }));
    expect(ctx.evidence.appendTransition).toHaveBeenCalledOnce();
  });

  it("does not issue scope or evidence after an optimistic lock loss", async () => {
    const aggregate = VendorContract.restore({ ...rootSnapshot(), state: "SIGNED", currentSignedVersionId: contractVersionId, currentSignedVersionNo: 1, version: version(5) });
    const mutation = aggregate.activate({ ...command(5, ["CONTRACT_MANAGER"]), effectiveOn: "2026-09-01" }, signed());
    const ctx = context(vi.fn(async () => false));
    await expect(persistContractMutation({ transact: async (work) => work(ctx) }, mutation, signed())).rejects.toThrow("optimistic lock");
    expect(ctx.scopes.issueExactContractScopes).not.toHaveBeenCalled(); expect(ctx.evidence.appendAudit).not.toHaveBeenCalled();
  });

  it("keeps finance and internal evaluation fields out of the list-safe Contract type", () => {
    type Forbidden = Extract<keyof VendorContractListSafeItem, "contractAmount" | "currency" | "plannedAmount" | "paymentStatus" | "internalEvaluation" | "riskLevel">;
    const typeHasNoForbiddenFields: Forbidden extends never ? true : false = true;
    const item: VendorContractListSafeItem = { contractId, contractNo: "C-APP-1", vendorId, vendorName: "업체", title: "계약", state: "ACTIVE", projectIds: [projectId], currentVersionNo: 1, version: 6 };
    expect(typeHasNoForbiddenFields).toBe(true); expect(item).not.toHaveProperty("contractAmount"); expect(item).not.toHaveProperty("paymentStatus");
  });
});
