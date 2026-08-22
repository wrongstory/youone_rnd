import { policyMatches, validateResolvedLine } from "@youone/core-approval/public";
import type {
  ApprovalActorSnapshot,
  ApprovalOutcomeInput,
  ApprovalPolicySelectionInput,
  ApprovalPolicyVersion,
  ApprovalSubject,
  ApprovalSubjectSnapshot,
  ResolvedStep,
  TypedApprovalSubjectPort
} from "@youone/core-approval/public";
import type { Money, Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";

export type PurchaseRequestApprovalSubject = Extract<ApprovalSubject, { kind: "PURCHASE_REQUEST_VERSION" }>;
export type PurchaseApprovalTierId = "PURCHASE_UNDER_FIRST_THRESHOLD" | "PURCHASE_FIRST_TO_SECOND_THRESHOLD" | "PURCHASE_SECOND_THRESHOLD_AND_ABOVE";
export type PurchaseApprovalState = "APPROVAL_PENDING" | "APPROVED" | "REJECTED" | "RECALLED" | "CANCELLED";

export interface OpaquePurchasePrivateFileRef {
  readonly attachmentId: Uuid;
  readonly rowVersion: Version;
  readonly checksum: Sha256;
}

export interface PurchaseEvidenceRef {
  readonly evidenceId: Uuid;
  readonly kind: "QUOTATION" | "PURPOSE" | "AMOUNT_BASIS" | "LEGAL_CHECKLIST" | "OTHER";
  readonly file: OpaquePurchasePrivateFileRef;
}

/**
 * Versioned company preset. Thresholds are internal policy data, never a claim
 * that the amounts are statutory requirements.
 */
export interface PurchaseApprovalPresetVersion {
  readonly presetVersionId: Uuid;
  readonly presetId: StableCode;
  readonly version: number;
  readonly checksum: Sha256;
  readonly state: "DRAFT" | "PUBLISHED" | "RETIRED";
  readonly effectiveFrom: UtcInstant;
  readonly effectiveTo?: UtcInstant;
  readonly classification: "INTERNAL_RECOMMENDED_PRESET_NOT_STATUTORY";
  readonly currency: string;
  readonly firstThresholdInclusive: string;
  readonly secondThresholdInclusive: string;
  readonly strengthenedLegalCheckThresholdInclusive: string;
}

export interface PurchaseApprovalAmountFactsSnapshot {
  readonly vatInclusiveTotalBurden: Money;
  readonly antiSplitCumulativeExposure: Money;
  readonly policySelectionAmount: Money;
  readonly antiSplitPolicyVersionId: Uuid;
  readonly antiSplitPolicyChecksum: Sha256;
  readonly aggregationKeyHash: Sha256;
  readonly aggregationWindowFrom: UtcInstant;
  readonly aggregationWindowTo: UtcInstant;
  readonly aggregationEvidenceIds: readonly Uuid[];
  readonly strengthenedLegalCheckRequired: boolean;
  readonly strengthenedLegalCheckCompleted: boolean;
  readonly strengthenedLegalCheckTrigger?: "AMOUNT_THRESHOLD" | "VERSIONED_RISK_RULE";
  readonly legalChecklistPolicyVersionId?: Uuid;
  readonly legalChecklistPolicyChecksum?: Sha256;
  readonly legalChecklistEvidenceIds: readonly Uuid[];
  readonly factsChecksum: Sha256;
}

export interface PurchaseApprovalPolicyEntry {
  readonly tierId: PurchaseApprovalTierId;
  readonly policy: ApprovalPolicyVersion;
  readonly line: readonly ResolvedStep[];
}

export interface PurchaseApprovalPolicySnapshot {
  readonly presetVersionId: Uuid;
  readonly presetId: StableCode;
  readonly presetVersion: number;
  readonly presetChecksum: Sha256;
  readonly tierId: PurchaseApprovalTierId;
  readonly approvalPolicyVersionId: Uuid;
  readonly approvalPolicyId: StableCode;
  readonly approvalPolicyVersion: number;
  readonly approvalPolicyChecksum: Sha256;
  readonly amountFacts: PurchaseApprovalAmountFactsSnapshot;
  readonly selectedAt: UtcInstant;
}

export interface PurchaseApprovalSelection {
  readonly policy: ApprovalPolicyVersion;
  readonly line: readonly ResolvedStep[];
  readonly selectionInput: ApprovalPolicySelectionInput;
  readonly snapshot: PurchaseApprovalPolicySnapshot;
}

export interface PurchaseApprovalPolicySelectionPort {
  /** Resolves only published versioned preset/policy data and trusted server-calculated amount facts. */
  selectExact(input: {
    readonly subject: PurchaseRequestApprovalSubject;
    readonly at: UtcInstant;
    readonly amountFacts: PurchaseApprovalAmountFactsSnapshot;
  }): Promise<PurchaseApprovalSelection>;
}

export interface PurchaseRequestApprovalRecord {
  readonly purchaseRequestVersionId: Uuid;
  readonly purchaseRequestId: Uuid;
  readonly revisionNo: number;
  readonly previousPurchaseRequestVersionId?: Uuid;
  readonly subjectVersion: Version;
  readonly sealedSnapshotChecksum: Sha256;
  readonly sealedAt: UtcInstant;
  readonly approvalState: PurchaseApprovalState;
  readonly sealedVatInclusiveTotalBurden: Money;
  readonly policySnapshot: PurchaseApprovalPolicySnapshot;
  readonly quotationRefs: readonly PurchaseEvidenceRef[];
  readonly evidenceRefs: readonly PurchaseEvidenceRef[];
}

export interface PurchaseRequestApprovalStore {
  loadExact(purchaseRequestVersionId: Uuid): Promise<PurchaseRequestApprovalRecord | null>;
  /** Resolves only the current row's exact previous-version FK. */
  loadPrevious(purchaseRequestVersionId: Uuid): Promise<PurchaseRequestApprovalRecord | null>;
}

export interface CompletedPurchaseApprovalSnapshot {
  readonly approvalInstanceId: Uuid;
  readonly approvalVersion: Version;
  readonly approvalPolicyVersionId: Uuid;
  readonly approvalPolicyChecksum: Sha256;
  readonly approvalStepId: Uuid;
  readonly approvalParticipantId: Uuid;
  readonly approvalStepRole: "APPROVAL";
  readonly approvalStepCompletionMode: "SEQUENTIAL" | "ANY_ONE";
  readonly subject: PurchaseRequestApprovalSubject;
  readonly subjectVersion: Version;
  readonly subjectChecksum: Sha256;
  readonly subjectSealedAt: UtcInstant;
  readonly completedAt: UtcInstant;
  readonly officialApproverUserId: Uuid;
  readonly officialApproverPositionId: StableCode;
  readonly actingAuthorityEvidenceId?: Uuid;
}

export interface CompletedPurchaseApprovalSnapshotPort {
  /** Re-loads the terminal APPROVAL action, participant, exact typed subject link and policy snapshot. */
  resolve(input: ApprovalOutcomeInput): Promise<CompletedPurchaseApprovalSnapshot>;
}

export interface PurchaseApprovalObligations {
  readonly exactSealedRequestVersionIsImmutable: true;
  readonly policyAndAmountFactsAreVersionedSnapshots: true;
  readonly seniorNeverHasOfficialApprovalAuthority: true;
  readonly onlyApprovedOutcomeCreatesResolution: true;
  readonly quotationsAndEvidenceAreAppendOnlyPrivateRefs: true;
  readonly actualPaymentAndAccountingAreOutOfScope: true;
}

export const PURCHASE_APPROVAL_OBLIGATIONS: PurchaseApprovalObligations = Object.freeze({
  exactSealedRequestVersionIsImmutable: true,
  policyAndAmountFactsAreVersionedSnapshots: true,
  seniorNeverHasOfficialApprovalAuthority: true,
  onlyApprovedOutcomeCreatesResolution: true,
  quotationsAndEvidenceAreAppendOnlyPrivateRefs: true,
  actualPaymentAndAccountingAreOutOfScope: true
});

declare const trustedApprovedPurchaseOutcomeBrand: unique symbol;
declare const trustedNegativePurchaseOutcomeBrand: unique symbol;
interface TrustedApprovedPurchaseOutcomeBrand { readonly [trustedApprovedPurchaseOutcomeBrand]: true }
interface TrustedNegativePurchaseOutcomeBrand { readonly [trustedNegativePurchaseOutcomeBrand]: true }

export type TrustedApprovedPurchaseOutcome = Readonly<ApprovalOutcomeInput & {
  readonly outcome: "COMPLETED";
  readonly decision: "APPROVED";
  readonly exactVersion: PurchaseRequestApprovalRecord;
  readonly policySnapshot: PurchaseApprovalPolicySnapshot;
  readonly completedApproval: CompletedPurchaseApprovalSnapshot;
  readonly resolutionEffect: { readonly kind: "CREATE_RESOLUTION_FROM_APPROVED_REQUEST_VERSION"; readonly allowed: true };
  readonly obligations: PurchaseApprovalObligations;
}> & TrustedApprovedPurchaseOutcomeBrand;

export type TrustedNegativePurchaseOutcome = Readonly<ApprovalOutcomeInput & {
  readonly outcome: "REJECTED" | "RECALLED" | "CANCELLED";
  readonly decision: "REJECTED" | "RECALLED" | "CANCELLED";
  readonly exactVersion: PurchaseRequestApprovalRecord;
  readonly policySnapshot: PurchaseApprovalPolicySnapshot;
  readonly resolutionEffect: { readonly kind: "RETAIN_NEGATIVE_APPROVAL_EVIDENCE"; readonly allowed: false };
  readonly obligations: PurchaseApprovalObligations;
}> & TrustedNegativePurchaseOutcomeBrand;

export interface VerifiedPurchaseApprovalOutcomePort {
  /** This is the only Approval contract that may create a PurchaseResolution. */
  applyApprovedOutcome(input: TrustedApprovedPurchaseOutcome): Promise<void>;
  /** Negative outcomes are retained but can never be passed to Resolution creation. */
  retainNegativeOutcome(input: TrustedNegativePurchaseOutcome): Promise<void>;
}

export class PurchaseApprovalContractError extends Error {
  public constructor(public readonly code: StableCode, message: string) {
    super(message);
    this.name = "PurchaseApprovalContractError";
  }
}

const fail = (code: string, message: string): never => {
  throw new PurchaseApprovalContractError(code as StableCode, message);
};

function decimalUnits(value: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) fail("PURCHASE_APPROVAL_AMOUNT_INVALID", "Amount must be a non-negative decimal with at most six fraction digits.");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

function sameMoneyCurrency(values: readonly Money[], expected: string): void {
  if (values.some((value) => value.currency !== expected)) fail("PURCHASE_APPROVAL_CURRENCY_MISMATCH", "All purchase policy amounts must use the preset currency.");
}

function validatePreset(preset: PurchaseApprovalPresetVersion, at: UtcInstant): void {
  if (preset.state !== "PUBLISHED" || at < preset.effectiveFrom || (preset.effectiveTo !== undefined && at >= preset.effectiveTo) ||
    preset.classification !== "INTERNAL_RECOMMENDED_PRESET_NOT_STATUTORY" || !Number.isSafeInteger(preset.version) || preset.version < 1) {
    fail("PURCHASE_APPROVAL_PRESET_NOT_ACTIVE", "An effective, published, explicitly non-statutory internal preset is required.");
  }
  const first = decimalUnits(preset.firstThresholdInclusive);
  const second = decimalUnits(preset.secondThresholdInclusive);
  const strengthened = decimalUnits(preset.strengthenedLegalCheckThresholdInclusive);
  if (first <= 0n || second <= first || strengthened < second) fail("PURCHASE_APPROVAL_PRESET_THRESHOLDS_INVALID", "Preset thresholds must be positive, ordered and versioned.");
}

function validateAmountFacts(preset: PurchaseApprovalPresetVersion, facts: PurchaseApprovalAmountFactsSnapshot): bigint {
  sameMoneyCurrency([facts.vatInclusiveTotalBurden, facts.antiSplitCumulativeExposure, facts.policySelectionAmount], preset.currency);
  const vatTotal = decimalUnits(facts.vatInclusiveTotalBurden.amount);
  const cumulative = decimalUnits(facts.antiSplitCumulativeExposure.amount);
  const selected = decimalUnits(facts.policySelectionAmount.amount);
  if (selected !== (vatTotal > cumulative ? vatTotal : cumulative) || facts.aggregationWindowFrom >= facts.aggregationWindowTo ||
    facts.aggregationEvidenceIds.length === 0 || !facts.antiSplitPolicyVersionId || !facts.antiSplitPolicyChecksum || !facts.aggregationKeyHash || !facts.factsChecksum) {
    fail("PURCHASE_APPROVAL_AMOUNT_FACTS_INVALID", "Selection amount must preserve VAT-inclusive burden, anti-split cumulative exposure and exact policy evidence.");
  }
  const amountRequiresLegalCheck = selected >= decimalUnits(preset.strengthenedLegalCheckThresholdInclusive);
  if (amountRequiresLegalCheck && !facts.strengthenedLegalCheckRequired ||
    facts.strengthenedLegalCheckRequired && (!facts.strengthenedLegalCheckCompleted || !facts.strengthenedLegalCheckTrigger ||
      !facts.legalChecklistPolicyVersionId || !facts.legalChecklistPolicyChecksum || facts.legalChecklistEvidenceIds.length === 0) ||
    !facts.strengthenedLegalCheckRequired && (facts.strengthenedLegalCheckCompleted || facts.strengthenedLegalCheckTrigger !== undefined ||
      facts.legalChecklistPolicyVersionId !== undefined || facts.legalChecklistPolicyChecksum !== undefined || facts.legalChecklistEvidenceIds.length !== 0) ||
    amountRequiresLegalCheck && facts.strengthenedLegalCheckTrigger !== "AMOUNT_THRESHOLD") {
    fail("PURCHASE_APPROVAL_LEGAL_CHECK_INVALID", "Strengthened legal checklist evidence must exactly follow the selected preset threshold.");
  }
  return selected;
}

function tierFor(preset: PurchaseApprovalPresetVersion, selected: bigint): PurchaseApprovalTierId {
  if (selected < decimalUnits(preset.firstThresholdInclusive)) return "PURCHASE_UNDER_FIRST_THRESHOLD";
  if (selected < decimalUnits(preset.secondThresholdInclusive)) return "PURCHASE_FIRST_TO_SECOND_THRESHOLD";
  return "PURCHASE_SECOND_THRESHOLD_AND_ABOVE";
}

function exactPositions(step: ResolvedStep, position: string, mode: "SEQUENTIAL" | "ANY_ONE"): boolean {
  return step.required && step.role === "APPROVAL" && step.completionMode === mode && step.participants.length > 0 &&
    step.participants.every((participant) => participant.positionId === position);
}

function exactRule(policy: ApprovalPolicyVersion, index: number, position: string, mode: "SEQUENTIAL" | "ANY_ONE"): boolean {
  const rule = policy.steps[index];
  return rule !== undefined && rule.sequenceNo === index + 1 && rule.required && rule.role === "APPROVAL" &&
    (rule.completionMode ?? "SEQUENTIAL") === mode && rule.allowedPositionIds.length === 1 && rule.allowedPositionIds[0] === position &&
    rule.allowedRoleIds.length === 0 && rule.specificUserId === undefined;
}

function validatePurchaseLine(tierId: PurchaseApprovalTierId, policy: ApprovalPolicyVersion, line: readonly ResolvedStep[]): void {
  validateResolvedLine(policy, line);
  const rules = policy.steps;
  if (rules.some((rule) => rule.allowedPositionIds.includes("POSITION_SENIOR_RESEARCHER" as StableCode)) ||
    line.some((step) => step.participants.some((participant) => participant.positionId === "POSITION_SENIOR_RESEARCHER"))) {
    fail("PURCHASE_APPROVAL_SENIOR_FORBIDDEN", "Senior Researcher may review but never holds official purchase approval authority.");
  }
  const director = line[0];
  if (!director || director.sequenceNo !== 1 || !exactRule(policy, 0, "POSITION_LAB_DIRECTOR", "SEQUENTIAL") ||
    !exactPositions(director, "POSITION_LAB_DIRECTOR", "SEQUENTIAL")) {
    fail("PURCHASE_APPROVAL_DIRECTOR_STEP_INVALID", "The first required purchase approval step is the Lab Director.");
  }
  const requiresRepresentative = tierId !== "PURCHASE_UNDER_FIRST_THRESHOLD";
  if ((!requiresRepresentative && line.length !== 1) || (requiresRepresentative && line.length !== 2)) {
    fail("PURCHASE_APPROVAL_LINE_INVALID", "Purchase approval line does not match its versioned amount tier.");
  }
  if (requiresRepresentative) {
    const representative = line[1];
    if (!representative || representative.sequenceNo !== 2 || !exactRule(policy, 1, "POSITION_REPRESENTATIVE", "ANY_ONE") ||
      !exactPositions(representative, "POSITION_REPRESENTATIVE", "ANY_ONE")) {
      fail("PURCHASE_APPROVAL_REPRESENTATIVE_STEP_INVALID", "Higher purchase tiers require a Representative ANY_ONE step after the Lab Director.");
    }
  }
}

const PURCHASE_APPROVAL_TIERS: readonly PurchaseApprovalTierId[] = [
  "PURCHASE_UNDER_FIRST_THRESHOLD",
  "PURCHASE_FIRST_TO_SECOND_THRESHOLD",
  "PURCHASE_SECOND_THRESHOLD_AND_ABOVE"
];

function validatePolicyEntry(entry: PurchaseApprovalPolicyEntry, preset: PurchaseApprovalPresetVersion, at: UtcInstant): void {
  const policy = entry.policy;
  if (policy.state !== "PUBLISHED" || at < policy.effectiveFrom || (policy.effectiveTo !== undefined && at >= policy.effectiveTo) ||
    policy.selection.subjectKinds.length !== 1 || policy.selection.subjectKinds[0] !== "PURCHASE_REQUEST_VERSION" ||
    policy.selection.documentTypeIds.length !== 0 || policy.selection.securityLevels.length !== 0 || policy.selection.strengthenedRisk !== "ANY") {
    fail("PURCHASE_APPROVAL_POLICY_INVALID", "Purchase approval requires one effective dedicated subject policy without unrelated selectors.");
  }
  assertBand(entry, preset);
  validatePurchaseLine(entry.tierId, policy, entry.line);
}

/** Validates the whole three-band matrix before any one tier can be selected. */
export function validatePurchaseApprovalMatrix(input: {
  readonly preset: PurchaseApprovalPresetVersion;
  readonly entries: readonly PurchaseApprovalPolicyEntry[];
  readonly at: UtcInstant;
}): void {
  validatePreset(input.preset, input.at);
  if (input.entries.length !== PURCHASE_APPROVAL_TIERS.length ||
    PURCHASE_APPROVAL_TIERS.some((tierId) => input.entries.filter((entry) => entry.tierId === tierId).length !== 1) ||
    new Set(input.entries.map((entry) => entry.policy.policyVersionId)).size !== input.entries.length) {
    fail("PURCHASE_APPROVAL_POLICY_MATRIX_INVALID", "The versioned purchase matrix requires exactly one unique policy for every amount tier.");
  }
  for (const entry of input.entries) validatePolicyEntry(entry, input.preset, input.at);
}

function assertBand(entry: PurchaseApprovalPolicyEntry, preset: PurchaseApprovalPresetVersion): void {
  const band = entry.policy.selection.amountBand;
  if (!band) fail("PURCHASE_APPROVAL_POLICY_BAND_INVALID", "Each purchase policy tier requires an exact currency amount band.");
  const exactBand = band as NonNullable<ApprovalPolicyVersion["selection"]["amountBand"]>;
  if (exactBand.currency !== preset.currency) fail("PURCHASE_APPROVAL_POLICY_BAND_INVALID", "Purchase policy band currency must match the preset.");
  const expected = entry.tierId === "PURCHASE_UNDER_FIRST_THRESHOLD"
    ? { min: undefined, max: preset.firstThresholdInclusive }
    : entry.tierId === "PURCHASE_FIRST_TO_SECOND_THRESHOLD"
      ? { min: preset.firstThresholdInclusive, max: preset.secondThresholdInclusive }
      : { min: preset.secondThresholdInclusive, max: undefined };
  if (exactBand.minInclusive !== expected.min || exactBand.maxExclusive !== expected.max) fail("PURCHASE_APPROVAL_POLICY_BAND_INVALID", "Purchase policy bands must be contiguous and match the selected preset version.");
}

export function selectPurchaseApprovalPolicy(input: {
  readonly preset: PurchaseApprovalPresetVersion;
  readonly entries: readonly PurchaseApprovalPolicyEntry[];
  readonly amountFacts: PurchaseApprovalAmountFactsSnapshot;
  readonly at: UtcInstant;
}): PurchaseApprovalSelection {
  validatePurchaseApprovalMatrix(input);
  const selectedAmount = validateAmountFacts(input.preset, input.amountFacts);
  const tierId = tierFor(input.preset, selectedAmount);
  const entry = input.entries.find((candidate) => candidate.tierId === tierId);
  if (!entry) fail("PURCHASE_APPROVAL_POLICY_NOT_FOUND", "No versioned purchase policy matches the selected amount tier.");
  const selectedEntry = entry as PurchaseApprovalPolicyEntry;
  const policy = selectedEntry.policy;
  const selectionInput: ApprovalPolicySelectionInput = {
    amount: { currency: input.amountFacts.policySelectionAmount.currency, value: input.amountFacts.policySelectionAmount.amount },
    strengthenedRisk: input.amountFacts.strengthenedLegalCheckRequired
  };
  if (!policyMatches(policy, { ...selectionInput, subjectKind: "PURCHASE_REQUEST_VERSION" })) fail("PURCHASE_APPROVAL_POLICY_SELECTION_MISMATCH", "Selected purchase policy does not match the sealed amount facts.");
  return deepFreeze(structuredClone({ policy, line: selectedEntry.line, selectionInput, snapshot: {
    presetVersionId: input.preset.presetVersionId, presetId: input.preset.presetId, presetVersion: input.preset.version,
    presetChecksum: input.preset.checksum, tierId, approvalPolicyVersionId: policy.policyVersionId, approvalPolicyId: policy.policyId,
    approvalPolicyVersion: policy.version, approvalPolicyChecksum: policy.checksum, amountFacts: input.amountFacts, selectedAt: input.at
  } }));
}

const trustedApprovedOutcomes = new WeakSet<object>();
const trustedNegativeOutcomes = new WeakSet<object>();

function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>();
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object" || seen.has(candidate)) return;
    seen.add(candidate);
    for (const nested of Object.values(candidate)) freeze(nested);
    Object.freeze(candidate);
  };
  freeze(value);
  return value;
}

function mintApproved(value: Omit<TrustedApprovedPurchaseOutcome, keyof TrustedApprovedPurchaseOutcomeBrand>): TrustedApprovedPurchaseOutcome {
  const outcome = deepFreeze(structuredClone(value)) as TrustedApprovedPurchaseOutcome;
  trustedApprovedOutcomes.add(outcome);
  return outcome;
}

function mintNegative(value: Omit<TrustedNegativePurchaseOutcome, keyof TrustedNegativePurchaseOutcomeBrand>): TrustedNegativePurchaseOutcome {
  const outcome = deepFreeze(structuredClone(value)) as TrustedNegativePurchaseOutcome;
  trustedNegativeOutcomes.add(outcome);
  return outcome;
}

export function assertTrustedApprovedPurchaseOutcome(value: unknown): asserts value is TrustedApprovedPurchaseOutcome {
  if (value === null || typeof value !== "object" || !trustedApprovedOutcomes.has(value)) fail("PURCHASE_APPROVED_OUTCOME_NOT_TRUSTED", "Only the Purchase Approval adapter may mint a Resolution-authorizing outcome.");
}

export function assertTrustedNegativePurchaseOutcome(value: unknown): asserts value is TrustedNegativePurchaseOutcome {
  if (value === null || typeof value !== "object" || !trustedNegativeOutcomes.has(value)) fail("PURCHASE_NEGATIVE_OUTCOME_NOT_TRUSTED", "Only the Purchase Approval adapter may mint retained negative evidence.");
}

function sameActor(left: ApprovalActorSnapshot, right: ApprovalActorSnapshot): boolean {
  const a = left.actingAuthority;
  const b = right.actingAuthority;
  const sameAuthority = a === undefined && b === undefined || Boolean(a && b && a.assignmentId === b.assignmentId &&
    a.evidenceId === b.evidenceId && a.grantorUserId === b.grantorUserId && a.delegateUserId === b.delegateUserId &&
    a.representedPositionId === b.representedPositionId && a.validFrom === b.validFrom && a.validTo === b.validTo &&
    a.reason === b.reason && a.allowedActionIds.length === b.allowedActionIds.length &&
    a.allowedActionIds.every((value, index) => value === b.allowedActionIds[index]));
  return left.actorType === right.actorType && left.accountKind === right.accountKind &&
    left.authenticatedUserId === right.authenticatedUserId && left.effectiveUserId === right.effectiveUserId &&
    left.positionIds.length === right.positionIds.length && left.positionIds.every((value, index) => value === right.positionIds[index]) &&
    left.roleIds.length === right.roleIds.length && left.roleIds.every((value, index) => value === right.roleIds[index]) && sameAuthority;
}

function assertTerminalProvenance(input: ApprovalOutcomeInput): void {
  const kinds = { COMPLETED: "APPROVE", REJECTED: "REJECT", RECALLED: "RECALL", CANCELLED: "CANCEL" } as const;
  const provenance = input.provenance;
  if (provenance.terminalAction.kind !== kinds[input.outcome] || provenance.terminalAction.at !== provenance.occurredAt ||
    !sameActor(provenance.terminalAction.actor, provenance.actor) || provenance.terminalAction.reasonCode !== provenance.terminalReasonCode ||
    provenance.actor.actingAuthority?.evidenceId !== provenance.actingAuthorityEvidenceId || !String(provenance.correlationId).trim() || !String(provenance.idempotencyKey).trim()) {
    fail("PURCHASE_APPROVAL_PROVENANCE_INVALID", "Terminal Purchase Approval action and trusted provenance must remain exact.");
  }
}

function exactSubjectId(subject: ApprovalSubject): Uuid {
  if (subject.kind !== "PURCHASE_REQUEST_VERSION") fail("PURCHASE_APPROVAL_SUBJECT_KIND_INVALID", "Purchase Approval subject must be PURCHASE_REQUEST_VERSION.");
  return (subject as PurchaseRequestApprovalSubject).purchaseRequestVersionId;
}

function assertPolicySnapshot(record: PurchaseRequestApprovalRecord): void {
  const policy = record.policySnapshot;
  if (!policy || policy.amountFacts.vatInclusiveTotalBurden.currency !== policy.amountFacts.policySelectionAmount.currency ||
    record.sealedVatInclusiveTotalBurden.currency !== policy.amountFacts.vatInclusiveTotalBurden.currency ||
    record.sealedVatInclusiveTotalBurden.amount !== policy.amountFacts.vatInclusiveTotalBurden.amount ||
    policy.approvalPolicyVersion < 1 || policy.presetVersion < 1 || !policy.approvalPolicyChecksum || !policy.presetChecksum || !policy.amountFacts.factsChecksum) {
    fail("PURCHASE_APPROVAL_POLICY_SNAPSHOT_INVALID", "PurchaseRequestVersion requires an exact immutable amount and policy snapshot.");
  }
}

function expectedTerminalPosition(tierId: PurchaseApprovalTierId): StableCode {
  return (tierId === "PURCHASE_UNDER_FIRST_THRESHOLD" ? "POSITION_LAB_DIRECTOR" : "POSITION_REPRESENTATIVE") as StableCode;
}

async function completedApproval(input: ApprovalOutcomeInput, record: PurchaseRequestApprovalRecord,
  resolver: CompletedPurchaseApprovalSnapshotPort): Promise<CompletedPurchaseApprovalSnapshot> {
  const resolved = await resolver.resolve(input);
  const actor = input.provenance.actor;
  const subjectId = exactSubjectId(resolved.subject);
  const expectedPosition = expectedTerminalPosition(record.policySnapshot.tierId);
  const positionAllowed = actor.actingAuthority?.representedPositionId === resolved.officialApproverPositionId || actor.positionIds.includes(resolved.officialApproverPositionId);
  if (input.outcome !== "COMPLETED" || actor.actorType !== "USER" || actor.accountKind !== "INTERNAL" || !actor.effectiveUserId || !positionAllowed ||
    resolved.approvalStepRole !== "APPROVAL" || resolved.officialApproverPositionId === "POSITION_SENIOR_RESEARCHER" ||
    resolved.officialApproverPositionId !== expectedPosition || resolved.approvalStepCompletionMode !== (record.policySnapshot.tierId === "PURCHASE_UNDER_FIRST_THRESHOLD" ? "SEQUENTIAL" : "ANY_ONE") ||
    subjectId !== record.purchaseRequestVersionId || subjectId !== exactSubjectId(input.snapshot.subject) ||
    resolved.approvalInstanceId !== input.approvalInstanceId || resolved.approvalVersion !== input.approvalVersion ||
    resolved.approvalPolicyVersionId !== record.policySnapshot.approvalPolicyVersionId || resolved.approvalPolicyChecksum !== record.policySnapshot.approvalPolicyChecksum ||
    resolved.subjectVersion !== input.snapshot.subjectVersion || resolved.subjectChecksum !== input.snapshot.checksum || resolved.subjectSealedAt !== input.snapshot.sealedAt ||
    resolved.completedAt !== input.provenance.occurredAt || resolved.officialApproverUserId !== actor.effectiveUserId ||
    resolved.actingAuthorityEvidenceId !== input.provenance.actingAuthorityEvidenceId) {
    fail("PURCHASE_COMPLETED_APPROVAL_INVALID", "Completed Purchase Approval must bind the exact subject, policy, final official participant and provenance.");
  }
  return resolved;
}

export class PurchaseRequestApprovalSubjectAdapter implements TypedApprovalSubjectPort<PurchaseRequestApprovalSubject> {
  public readonly kind = "PURCHASE_REQUEST_VERSION" as const;

  public constructor(
    private readonly store: PurchaseRequestApprovalStore,
    private readonly outcomes: VerifiedPurchaseApprovalOutcomePort,
    private readonly completedApprovals: CompletedPurchaseApprovalSnapshotPort
  ) {}

  public async sealExactVersion(subject: PurchaseRequestApprovalSubject): Promise<ApprovalSubjectSnapshot> {
    const record = await this.requireExact(subject.purchaseRequestVersionId);
    this.assertPending(record);
    return { subject, subjectVersion: record.subjectVersion, checksum: record.sealedSnapshotChecksum, sealedAt: record.sealedAt };
  }

  public async assertExactVersion(snapshot: ApprovalSubjectSnapshot): Promise<void> {
    const id = exactSubjectId(snapshot.subject);
    const record = await this.requireExact(id);
    if (record.subjectVersion !== snapshot.subjectVersion || record.sealedSnapshotChecksum !== snapshot.checksum || record.sealedAt !== snapshot.sealedAt) {
      fail("PURCHASE_APPROVAL_SUBJECT_MISMATCH", "Approval does not bind the exact immutable PurchaseRequestVersion.");
    }
    assertPolicySnapshot(record);
  }

  public async assertResubmissionLineage(input: { readonly previous: ApprovalSubjectSnapshot; readonly current: ApprovalSubjectSnapshot }): Promise<void> {
    await this.assertExactVersion(input.previous);
    await this.assertExactVersion(input.current);
    const previousId = exactSubjectId(input.previous.subject);
    const currentId = exactSubjectId(input.current.subject);
    const previous = await this.requireExact(previousId);
    const current = await this.requireExact(currentId);
    const storedPrevious = await this.store.loadPrevious(currentId);
    if ((previous.approvalState !== "REJECTED" && previous.approvalState !== "RECALLED") || current.approvalState !== "APPROVAL_PENDING" ||
      previous.purchaseRequestId !== current.purchaseRequestId || current.previousPurchaseRequestVersionId !== previous.purchaseRequestVersionId ||
      storedPrevious?.purchaseRequestVersionId !== previous.purchaseRequestVersionId || current.revisionNo <= previous.revisionNo ||
      current.subjectVersion <= previous.subjectVersion || current.sealedAt <= previous.sealedAt || current.sealedSnapshotChecksum === previous.sealedSnapshotChecksum) {
      fail("PURCHASE_APPROVAL_RESUBMISSION_INVALID", "Purchase resubmission requires a direct, strictly newer, changed immutable version after reject or recall.");
    }
  }

  public async applyApprovalOutcome(input: ApprovalOutcomeInput): Promise<void> {
    await this.assertExactVersion(input.snapshot);
    assertTerminalProvenance(input);
    const record = await this.requireExact(exactSubjectId(input.snapshot.subject));
    if (input.outcome === "COMPLETED") {
      const completed = await completedApproval(input, record, this.completedApprovals);
      const approved = mintApproved({ ...input, outcome: "COMPLETED", decision: "APPROVED", exactVersion: record,
        policySnapshot: record.policySnapshot, completedApproval: completed,
        resolutionEffect: { kind: "CREATE_RESOLUTION_FROM_APPROVED_REQUEST_VERSION", allowed: true }, obligations: PURCHASE_APPROVAL_OBLIGATIONS });
      await this.outcomes.applyApprovedOutcome(approved);
      return;
    }
    const negative = mintNegative({ ...input, outcome: input.outcome, decision: input.outcome, exactVersion: record,
      policySnapshot: record.policySnapshot, resolutionEffect: { kind: "RETAIN_NEGATIVE_APPROVAL_EVIDENCE", allowed: false },
      obligations: PURCHASE_APPROVAL_OBLIGATIONS });
    await this.outcomes.retainNegativeOutcome(negative);
  }

  private async requireExact(id: Uuid): Promise<PurchaseRequestApprovalRecord> {
    const record = await this.store.loadExact(id);
    if (record === null) fail("PURCHASE_REQUEST_VERSION_NOT_FOUND", "PurchaseRequestVersion was not found.");
    return record as PurchaseRequestApprovalRecord;
  }

  private assertPending(record: PurchaseRequestApprovalRecord): void {
    if (record.approvalState !== "APPROVAL_PENDING" || record.subjectVersion < 1 || !record.sealedSnapshotChecksum || !record.sealedAt) {
      fail("PURCHASE_EXACT_SEALED_VERSION_REQUIRED", "Only an exact sealed PurchaseRequestVersion pending approval may be submitted.");
    }
    assertPolicySnapshot(record);
  }
}

function samePrivateFile(left: OpaquePurchasePrivateFileRef, right: OpaquePurchasePrivateFileRef): boolean {
  return left.attachmentId === right.attachmentId && left.rowVersion === right.rowVersion && left.checksum === right.checksum;
}

function evidencePrefix(before: readonly PurchaseEvidenceRef[], after: readonly PurchaseEvidenceRef[]): boolean {
  return after.length >= before.length && before.every((item, index) => {
    const next = after[index];
    return next !== undefined && item.evidenceId === next.evidenceId && item.kind === next.kind && samePrivateFile(item.file, next.file);
  });
}

/** Approved request identity is immutable; later quotation/evidence records may only append exact opaque refs. */
export function assertApprovedPurchaseRequestEvidenceAppend(previous: PurchaseRequestApprovalRecord, current: PurchaseRequestApprovalRecord): void {
  const samePolicy = JSON.stringify(previous.policySnapshot) === JSON.stringify(current.policySnapshot);
  const currentEvidence = [...current.quotationRefs, ...current.evidenceRefs];
  const evidenceIdsAreUnique = new Set(currentEvidence.map((item) => item.evidenceId)).size === currentEvidence.length;
  const sameIdentity = previous.approvalState === "APPROVED" && current.approvalState === "APPROVED" &&
    previous.purchaseRequestVersionId === current.purchaseRequestVersionId && previous.purchaseRequestId === current.purchaseRequestId &&
    previous.revisionNo === current.revisionNo && previous.previousPurchaseRequestVersionId === current.previousPurchaseRequestVersionId &&
    previous.subjectVersion === current.subjectVersion && previous.sealedSnapshotChecksum === current.sealedSnapshotChecksum && previous.sealedAt === current.sealedAt &&
    previous.sealedVatInclusiveTotalBurden.amount === current.sealedVatInclusiveTotalBurden.amount &&
    previous.sealedVatInclusiveTotalBurden.currency === current.sealedVatInclusiveTotalBurden.currency;
  if (!sameIdentity || !samePolicy || !evidenceIdsAreUnique || !evidencePrefix(previous.quotationRefs, current.quotationRefs) || !evidencePrefix(previous.evidenceRefs, current.evidenceRefs)) {
    fail("PURCHASE_APPROVED_REQUEST_MUTATED", "Approved PurchaseRequestVersion identity and evidence prefix are immutable.");
  }
}
