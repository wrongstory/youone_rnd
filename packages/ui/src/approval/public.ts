export interface ApprovalInboxViewItem { readonly id: string; readonly subjectLabel: string; readonly roleLabel: string; readonly stateLabel: string; readonly submitterLabel: string; readonly submittedAtLabel: string }
export interface ApprovalInboxViewModel { readonly availability: "AVAILABLE"|"UNAVAILABLE"; readonly items: readonly ApprovalInboxViewItem[]; readonly message: string }

export function approvalInboxUnavailable(): ApprovalInboxViewModel {
  return { availability: "UNAVAILABLE", items: [], message: "결재 조회 서비스가 아직 연결되지 않았습니다. 데이터가 없다는 뜻이 아닙니다." };
}
export function approvalInboxAvailable(items: readonly ApprovalInboxViewItem[]): ApprovalInboxViewModel { return { availability: "AVAILABLE", items: items.map((item) => ({ ...item })), message: items.length ? "처리할 결재가 있습니다." : "현재 처리할 결재가 없습니다." }; }
export interface ApprovalDetailViewModel { readonly id: string; readonly generation: number; readonly previousId?: string; readonly state: string; readonly subject: string; readonly version: number; readonly checksum: string; readonly steps: readonly { readonly id: string; readonly role: string; readonly mode: string; readonly required: boolean; readonly participants: readonly string[] }[]; readonly timeline: readonly { readonly id: string; readonly kind: string; readonly at: string; readonly actor: string }[]; readonly actions: readonly { readonly id: string; readonly label: string; readonly authorized: boolean; readonly commandAvailable: boolean; readonly decisionId: string; readonly evaluatedAt: string; readonly evidenceIds: readonly string[]; readonly obligations: readonly string[]; readonly denyReasonCode?: string }[] }
export type ApprovalActionView = ApprovalDetailViewModel["actions"][number];
export function approvalActionDisabled(action: ApprovalActionView): boolean { return !action.authorized || !action.commandAvailable; }
export function approvalDetailAvailable(detail: ApprovalDetailViewModel): ApprovalDetailViewModel { return structuredClone(detail); }
