const DISPLAY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ACTIVE: "진행 중",
  APPROVAL: "승인",
  APPROVAL_PENDING: "결재 대기",
  BACKLOG: "대기",
  CANCELLED: "취소",
  CLOSED: "종결",
  COMPLETE: "완료",
  COMPLETED: "완료",
  CONDITIONAL_ACCEPTANCE: "조건부 합격",
  DRAFT: "작성 중",
  DONE: "완료",
  FINALIZED: "확정",
  HANDED_OVER: "인계 완료",
  IN_PROGRESS: "진행 중",
  OVERDUE: "기한 초과",
  PARTIAL_ACCEPTANCE: "부분 합격",
  PLANNED: "예정",
  READY: "준비",
  REJECTED: "반려",
  RETURNED: "회송",
  REVIEW: "검토",
  REVIEW_REQUIRED: "검토 필요",
  SEALED: "봉인",
  SUBMITTED: "상신됨",
  UNDER_REVIEW: "검토 중",
  L1: "L1 일반",
  L2: "L2 사내",
  L3: "L3 제한",
  L4: "L4 극비"
});

const ISO_INSTANT = /\b(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?Z\b/g;

function formatSeoulInstant(match: string) {
  const date = new Date(match);
  if (Number.isNaN(date.valueOf())) return match;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function formatDisplayText(value: string) {
  let result = value.replace(ISO_INSTANT, formatSeoulInstant);
  for (const [stableId, label] of Object.entries(DISPLAY_LABELS)) {
    result = result.replace(new RegExp(`\\b${stableId}\\b`, "g"), label);
  }
  return result;
}

export function formatSeoulDate(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(value);
}

