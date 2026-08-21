import { describe, expect, it } from "vitest";
import { approvalActionDisabled, approvalDetailAvailable, approvalInboxAvailable, approvalInboxUnavailable } from "../../packages/ui/src/public.js";
import { approvalInboxQuery } from "../../apps/web/src/app/approvals/query.js";

describe("M04 approval safe UI boundary", () => {
  it("distinguishes an unavailable adapter from an available empty inbox", async () => {
    const result = await approvalInboxQuery().listMine(); expect(result).toEqual({ availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" });
    expect(approvalInboxUnavailable()).toMatchObject({ availability: "UNAVAILABLE", items: [] });
  });
  it("keeps the required AVAILABLE inbox fields", () => {
    const view = approvalInboxAvailable([{ id: "approval-1", subjectLabel: "DOCUMENT_VERSION", roleLabel: "APPROVAL", stateLabel: "IN_PROGRESS", submitterLabel: "홍길동", submittedAtLabel: "2026-08-22T00:00:00Z" }]);
    expect(view.items[0]).toMatchObject({ stateLabel: "IN_PROGRESS", roleLabel: "APPROVAL", submitterLabel: "홍길동", submittedAtLabel: "2026-08-22T00:00:00Z" });
  });
  it("keeps sealed detail evidence and disables authorized actions without a command adapter", () => {
    const detail = approvalDetailAvailable({ id: "approval-1", generation: 2, previousId: "approval-0", state: "IN_PROGRESS", subject: "DOCUMENT_VERSION", version: 7, checksum: "a".repeat(64), steps: [{ id: "step-1", role: "APPROVAL", mode: "ANY_ONE", required: true, participants: ["대표이사 A"] }], timeline: [{ id: "action-1", kind: "SUBMIT", at: "2026-08-22T00:00:00Z", actor: "홍길동" }], actions: [{ id: "approval.step.approve", label: "승인", authorized: true, commandAvailable: false, decisionId: "decision-1", evaluatedAt: "2026-08-22T00:01:00Z", evidenceIds: ["evidence-1"], obligations: ["AUDIT.APPROVAL.ACTION"] }] });
    expect(detail).toMatchObject({ version: 7, checksum: "a".repeat(64), steps: [{ mode: "ANY_ONE", required: true }], timeline: [{ kind: "SUBMIT" }], actions: [{ decisionId: "decision-1", evidenceIds: ["evidence-1"], obligations: ["AUDIT.APPROVAL.ACTION"] }] });
    expect(approvalActionDisabled(detail.actions[0]!)).toBe(true);
  });
});
