import type { ApprovalActorSnapshot } from "@youone/core-approval/public";
import type {
  AcceptancePaymentProcessPort,
  FinalizedInspectionOutcome,
  InspectionAttemptReadPort,
  InspectionAttemptSnapshot
} from "@youone/feature-quality/public";
import type { Money, Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";
import type {
  AcceptancePaymentActorCommand,
  AcceptancePaymentDecisionSnapshot,
  AcceptancePaymentMutation,
  AcceptancePaymentPolicyVersionSnapshot,
  AcceptancePaymentSystemCommand,
  PartialUsablePortionSnapshot,
  ResidualPaymentConditionSnapshot,
  SealedInspectionAttemptBasis
} from "../domain/acceptance-payment.js";
import { AcceptancePaymentDecision, AcceptancePaymentError } from "../domain/acceptance-payment.js";

export interface AcceptancePaymentRepository {
  insert(snapshot: AcceptancePaymentDecisionSnapshot): Promise<void>;
  loadExact(acceptancePaymentDecisionId: Uuid): Promise<AcceptancePaymentDecisionSnapshot | null>;
  loadForUpdate(acceptancePaymentDecisionId: Uuid): Promise<AcceptancePaymentDecisionSnapshot | null>;
  save(snapshot: AcceptancePaymentDecisionSnapshot, expectedVersion: Version): Promise<boolean>;
  /** Must prove direct previous_decision_id, same root and strictly increasing revision. */
  assertDirectNewerLineage(snapshot: AcceptancePaymentDecisionSnapshot): Promise<void>;
}

export interface AcceptancePaymentPolicyStore {
  loadExact(policyVersionId: Uuid): Promise<AcceptancePaymentPolicyVersionSnapshot | null>;
}

export interface AcceptancePaymentAuthorizationPort {
  assertMayCreate(input: { readonly contractId: Uuid; readonly contractMilestoneId: Uuid }): Promise<void>;
  assertContractOwner(input: { readonly actor: ApprovalActorSnapshot; readonly contractId: Uuid; readonly contractMilestoneId: Uuid }): Promise<void>;
  assertMayRelease(input: { readonly actor: ApprovalActorSnapshot; readonly contractId: Uuid; readonly contractMilestoneId: Uuid }): Promise<void>;
}

export interface AcceptancePaymentSnapshotHashPort {
  /** Hashes the exact unsealed decision basis and all requested-rate fields, excluding later lifecycle metadata. */
  computeExactChecksum(snapshot: AcceptancePaymentDecisionSnapshot): Promise<Sha256>;
}

export interface AcceptancePaymentEvidencePort {
  appendTransition(input: {
    readonly aggregateId: Uuid;
    readonly machineId: StableCode;
    readonly fromVersion: Version;
    readonly toVersion: Version;
    readonly eventType: StableCode;
    readonly occurredAt: UtcInstant;
  }): Promise<void>;
  appendAudit(audit: AcceptancePaymentMutation["audit"]): Promise<void>;
  enqueue(event: AcceptancePaymentMutation["event"]): Promise<void>;
}

export interface AcceptancePaymentTransactionContext {
  readonly decisions: AcceptancePaymentRepository;
  readonly policies: AcceptancePaymentPolicyStore;
  readonly inspectionAttempts: InspectionAttemptReadPort;
  readonly authorization: AcceptancePaymentAuthorizationPort;
  readonly hashes: AcceptancePaymentSnapshotHashPort;
  readonly evidence: AcceptancePaymentEvidencePort;
}

export interface AcceptancePaymentUnitOfWork {
  transact<T>(work: (context: AcceptancePaymentTransactionContext) => Promise<T>): Promise<T>;
}

export class AcceptancePaymentConcurrencyError extends Error {
  public readonly code = "ACCEPTANCE_PAYMENT_STALE_VERSION" as StableCode;
}

function attemptBasis(attempt: InspectionAttemptSnapshot): SealedInspectionAttemptBasis {
  if (!["ACCEPTED", "CONDITIONAL_ACCEPTANCE", "PARTIAL_ACCEPTANCE", "REJECTED"].includes(attempt.disposition)) {
    throw new AcceptancePaymentError("ACCEPTANCE_PAYMENT_FINAL_DISPOSITION_REQUIRED" as StableCode, "The sealed attempt has no final acceptance disposition.");
  }
  return {
    inspectionAttemptId: attempt.inspectionAttemptId,
    inspectionId: attempt.inspectionId,
    attemptNo: attempt.attemptNo,
    checksum: attempt.checksum,
    sealedAt: attempt.sealedAt,
    inspectionChecklistVersionId: attempt.inspectionChecklistVersionId,
    contractId: attempt.contractId,
    contractMilestoneId: attempt.contractMilestoneId,
    deliverableId: attempt.deliverableId,
    deliverableVersionId: attempt.deliverableVersionId,
    disposition: attempt.disposition as SealedInspectionAttemptBasis["disposition"],
    achievementPercent: attempt.achievementPercent,
    evidenceIds: structuredClone(attempt.evidenceIds),
    criticalFailureCriterionIds: structuredClone(attempt.criticalFailureCriterionIds),
    independentlyUsablePortions: structuredClone(attempt.independentlyUsablePortions),
    residualConditions: structuredClone(attempt.residualConditions)
  };
}

function assertExactOutcome(outcome: FinalizedInspectionOutcome, attempt: InspectionAttemptSnapshot): void {
  if (
    outcome.inspectionId !== attempt.inspectionId ||
    outcome.inspectionAttemptId !== attempt.inspectionAttemptId ||
    outcome.attemptChecksum !== attempt.checksum ||
    outcome.contractId !== attempt.contractId ||
    outcome.contractMilestoneId !== attempt.contractMilestoneId ||
    outcome.deliverableId !== attempt.deliverableId ||
    outcome.deliverableVersionId !== attempt.deliverableVersionId ||
    outcome.disposition !== attempt.disposition ||
    outcome.achievementPercent !== attempt.achievementPercent ||
    outcome.policyId !== attempt.policyId ||
    outcome.policyVersion !== attempt.policyVersion ||
    !outcome.acceptanceDoesNotWaiveVendorResponsibility ||
    !outcome.paymentDoesNotWaiveVendorResponsibility
  ) throw new AcceptancePaymentError("ACCEPTANCE_PAYMENT_INSPECTION_OUTCOME_MISMATCH" as StableCode, "Finalization handoff differs from the exact sealed InspectionAttempt.");
}

async function appendEvidence(context: AcceptancePaymentTransactionContext, mutation: AcceptancePaymentMutation): Promise<void> {
  await context.evidence.appendTransition({
    aggregateId: mutation.snapshot.acceptancePaymentDecisionId,
    machineId: mutation.event.machineId as StableCode,
    fromVersion: mutation.expectedVersion,
    toVersion: mutation.snapshot.version,
    eventType: mutation.event.eventType,
    occurredAt: mutation.event.occurredAt
  });
  await context.evidence.appendAudit(mutation.audit);
  await context.evidence.enqueue(mutation.event);
}

export interface CalculateAcceptancePaymentInput {
  readonly acceptancePaymentDecisionId: Uuid;
  readonly decisionRootId: Uuid;
  readonly revisionNo: number;
  readonly previousDecisionId?: Uuid;
  readonly inspectionAttemptId: Uuid;
  readonly policyVersionId: Uuid;
  readonly milestoneAmount: Money;
  readonly command: Omit<AcceptancePaymentSystemCommand, "expectedVersion">;
}

export async function calculateAcceptancePayment(
  unitOfWork: AcceptancePaymentUnitOfWork,
  input: CalculateAcceptancePaymentInput
): Promise<AcceptancePaymentDecisionSnapshot> {
  return unitOfWork.transact(async (context) => {
    const attempt = await context.inspectionAttempts.getExactSealedAttempt(input.inspectionAttemptId);
    if (attempt === null || attempt.state !== "SEALED") throw new AcceptancePaymentError("ACCEPTANCE_PAYMENT_SEALED_ATTEMPT_NOT_FOUND" as StableCode, "The exact sealed InspectionAttempt was not found.");
    const policy = await context.policies.loadExact(input.policyVersionId);
    if (policy === null || policy.policyId !== attempt.policyId || policy.version !== attempt.policyVersion) {
      throw new AcceptancePaymentError("ACCEPTANCE_PAYMENT_POLICY_VERSION_MISMATCH" as StableCode, "The policy must be the exact version used by the sealed InspectionAttempt.");
    }
    await context.authorization.assertMayCreate({ contractId: attempt.contractId, contractMilestoneId: attempt.contractMilestoneId });
    const mutation = AcceptancePaymentDecision.calculate({
      acceptancePaymentDecisionId: input.acceptancePaymentDecisionId,
      decisionRootId: input.decisionRootId,
      revisionNo: input.revisionNo,
      ...(input.previousDecisionId ? { previousDecisionId: input.previousDecisionId } : {}),
      basis: attemptBasis(attempt),
      policy,
      milestoneAmount: input.milestoneAmount
    }, input.command);
    if (mutation.expectedVersion !== 0 || mutation.snapshot.version !== 1) throw new AcceptancePaymentConcurrencyError("Decision creation must be version 0 to 1.");
    if (input.previousDecisionId) await context.decisions.assertDirectNewerLineage(mutation.snapshot);
    await context.decisions.insert(mutation.snapshot);
    await appendEvidence(context, mutation);
    return mutation.snapshot;
  });
}

export async function proposeAcceptancePaymentAdjustment(
  unitOfWork: AcceptancePaymentUnitOfWork,
  input: {
    readonly acceptancePaymentDecisionId: Uuid;
    readonly adjustmentId: Uuid;
    readonly requestedRate: string;
    readonly reason: string;
    readonly evidenceIds: readonly Uuid[];
    readonly command: AcceptancePaymentActorCommand;
  }
): Promise<AcceptancePaymentDecisionSnapshot> {
  return unitOfWork.transact(async (context) => {
    const current = await context.decisions.loadForUpdate(input.acceptancePaymentDecisionId);
    if (current === null) throw new AcceptancePaymentError("ACCEPTANCE_PAYMENT_DECISION_NOT_FOUND" as StableCode, "Decision was not found.");
    await context.authorization.assertContractOwner({ actor: input.command.actor, contractId: current.basis.contractId, contractMilestoneId: current.basis.contractMilestoneId });
    const mutation = AcceptancePaymentDecision.restore(current).proposeAdjustment(input.command, input);
    if (!await context.decisions.save(mutation.snapshot, mutation.expectedVersion)) throw new AcceptancePaymentConcurrencyError("Concurrent adjustment lost optimistic lock.");
    await appendEvidence(context, mutation);
    return mutation.snapshot;
  });
}

export async function submitAcceptancePaymentForApproval(
  unitOfWork: AcceptancePaymentUnitOfWork,
  input: { readonly acceptancePaymentDecisionId: Uuid; readonly approvalInstanceId: Uuid; readonly command: AcceptancePaymentActorCommand }
): Promise<AcceptancePaymentDecisionSnapshot> {
  return unitOfWork.transact(async (context) => {
    const current = await context.decisions.loadForUpdate(input.acceptancePaymentDecisionId);
    if (current === null) throw new AcceptancePaymentError("ACCEPTANCE_PAYMENT_DECISION_NOT_FOUND" as StableCode, "Decision was not found.");
    await context.authorization.assertContractOwner({ actor: input.command.actor, contractId: current.basis.contractId, contractMilestoneId: current.basis.contractMilestoneId });
    const checksum = await context.hashes.computeExactChecksum(current);
    const mutation = AcceptancePaymentDecision.restore(current).submitForApproval(input.command, { approvalInstanceId: input.approvalInstanceId, checksum });
    if (!await context.decisions.save(mutation.snapshot, mutation.expectedVersion)) throw new AcceptancePaymentConcurrencyError("Concurrent submission lost optimistic lock.");
    await appendEvidence(context, mutation);
    return mutation.snapshot;
  });
}

export async function persistAcceptancePaymentSystemMutation(
  unitOfWork: AcceptancePaymentUnitOfWork,
  mutation: AcceptancePaymentMutation
): Promise<void> {
  if (mutation.expectedVersion === 0) throw new AcceptancePaymentConcurrencyError("Creation requires calculateAcceptancePayment.");
  await unitOfWork.transact(async (context) => {
    if (!await context.decisions.save(mutation.snapshot, mutation.expectedVersion)) throw new AcceptancePaymentConcurrencyError("Concurrent system transition lost optimistic lock.");
    await appendEvidence(context, mutation);
  });
}

export async function markAcceptancePaymentEligible(
  unitOfWork: AcceptancePaymentUnitOfWork,
  input: { readonly acceptancePaymentDecisionId: Uuid; readonly command: AcceptancePaymentActorCommand }
): Promise<AcceptancePaymentDecisionSnapshot> {
  return unitOfWork.transact(async (context) => {
    const current = await context.decisions.loadForUpdate(input.acceptancePaymentDecisionId);
    if (current === null) throw new AcceptancePaymentError("ACCEPTANCE_PAYMENT_DECISION_NOT_FOUND" as StableCode, "Decision was not found.");
    await context.authorization.assertMayRelease({ actor: input.command.actor, contractId: current.basis.contractId, contractMilestoneId: current.basis.contractMilestoneId });
    const mutation = AcceptancePaymentDecision.restore(current).markEligibleForExternalPayment(input.command);
    if (!await context.decisions.save(mutation.snapshot, mutation.expectedVersion)) throw new AcceptancePaymentConcurrencyError("Concurrent release lost optimistic lock.");
    await appendEvidence(context, mutation);
    return mutation.snapshot;
  });
}

export async function satisfyAcceptancePaymentResidualCondition(
  unitOfWork: AcceptancePaymentUnitOfWork,
  input: { readonly acceptancePaymentDecisionId: Uuid; readonly residualConditionId: Uuid; readonly evidenceIds: readonly Uuid[]; readonly command: AcceptancePaymentActorCommand }
): Promise<AcceptancePaymentDecisionSnapshot> {
  return unitOfWork.transact(async (context) => {
    const current = await context.decisions.loadForUpdate(input.acceptancePaymentDecisionId);
    if (current === null) throw new AcceptancePaymentError("ACCEPTANCE_PAYMENT_DECISION_NOT_FOUND" as StableCode, "Decision was not found.");
    await context.authorization.assertMayRelease({ actor: input.command.actor, contractId: current.basis.contractId, contractMilestoneId: current.basis.contractMilestoneId });
    const mutation = AcceptancePaymentDecision.restore(current).satisfyResidualCondition(input.command, input);
    if (!await context.decisions.save(mutation.snapshot, mutation.expectedVersion)) throw new AcceptancePaymentConcurrencyError("Concurrent condition satisfaction lost optimistic lock.");
    await appendEvidence(context, mutation);
    return mutation.snapshot;
  });
}

/**
 * Quality-to-payment handoff adapter. The resolver supplies transaction-owned
 * IDs, exact policy ID and milestone amount; the process then re-loads and
 * compares the complete sealed attempt before creating a decision.
 */
export interface AcceptancePaymentFinalizationResolver {
  resolve(outcome: FinalizedInspectionOutcome): Promise<CalculateAcceptancePaymentInput>;
}

export class FinalizedInspectionAcceptancePaymentAdapter implements AcceptancePaymentProcessPort {
  public constructor(
    private readonly unitOfWork: AcceptancePaymentUnitOfWork,
    private readonly resolver: AcceptancePaymentFinalizationResolver
  ) {}

  public async recordFinalizedInspection(outcome: FinalizedInspectionOutcome): Promise<void> {
    const resolved = await this.resolver.resolve(outcome);
    if (resolved.inspectionAttemptId !== outcome.inspectionAttemptId) {
      throw new AcceptancePaymentError("ACCEPTANCE_PAYMENT_RESOLVER_ATTEMPT_MISMATCH" as StableCode, "Resolver changed the finalized attempt identity.");
    }
    await this.unitOfWork.transact(async (context) => {
      const attempt = await context.inspectionAttempts.getExactSealedAttempt(outcome.inspectionAttemptId);
      if (attempt === null) throw new AcceptancePaymentError("ACCEPTANCE_PAYMENT_SEALED_ATTEMPT_NOT_FOUND" as StableCode, "The exact sealed InspectionAttempt was not found.");
      assertExactOutcome(outcome, attempt);
    });
    await calculateAcceptancePayment(this.unitOfWork, resolved);
  }
}

export interface AcceptancePaymentInternalDetail {
  readonly decision: AcceptancePaymentDecisionSnapshot;
}
export type AcceptancePaymentDetailResult =
  | { readonly availability: "AVAILABLE"; readonly detail: AcceptancePaymentInternalDetail }
  | { readonly availability: "NOT_FOUND" | "FORBIDDEN"; readonly detail: null }
  | { readonly availability: "UNAVAILABLE"; readonly detail: null; readonly reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
export interface AcceptancePaymentQueryPort {
  getInternalDetail(acceptancePaymentDecisionId: string): Promise<AcceptancePaymentDetailResult>;
}

/** Payment-condition command input is explicit and cannot be inferred from a front-end status string. */
export interface AcceptancePaymentHoldCommandInput {
  readonly acceptancePaymentDecisionId: Uuid;
  readonly residualConditions: readonly ResidualPaymentConditionSnapshot[];
  readonly independentlyUsablePortions: readonly PartialUsablePortionSnapshot[];
  readonly heldAmount: Money;
  readonly unpaidRemainder: Money;
  readonly command: AcceptancePaymentSystemCommand;
}

export async function holdAcceptancePaymentForConditions(
  unitOfWork: AcceptancePaymentUnitOfWork,
  input: AcceptancePaymentHoldCommandInput
): Promise<AcceptancePaymentDecisionSnapshot> {
  return unitOfWork.transact(async (context) => {
    const current = await context.decisions.loadForUpdate(input.acceptancePaymentDecisionId);
    if (current === null) throw new AcceptancePaymentError("ACCEPTANCE_PAYMENT_DECISION_NOT_FOUND" as StableCode, "Decision was not found.");
    const mutation = AcceptancePaymentDecision.restore(current).holdForConditions(input.command, input);
    if (!await context.decisions.save(mutation.snapshot, mutation.expectedVersion)) throw new AcceptancePaymentConcurrencyError("Concurrent hold transition lost optimistic lock.");
    await appendEvidence(context, mutation);
    return mutation.snapshot;
  });
}
