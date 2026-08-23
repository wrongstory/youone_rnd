const DISPLAY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ACTIVE: "진행 중",
  ACCEPTED: "합격",
  APPROVED: "승인 완료",
  APPROVAL: "승인",
  APPROVAL_PENDING: "결재 대기",
  BACKLOG: "대기",
  CANCELLED: "취소",
  CLOSED: "종결",
  COMPLETE: "완료",
  COMPLETED: "완료",
  CONDITIONAL_ACCEPTANCE: "조건부 합격",
  CONTRACT_VERSION: "계약 버전",
  CORRECTION_REQUIRED: "시정 필요",
  CRITICAL: "매우 높음",
  DRAFT: "작성 중",
  DOCUMENT_VERSION: "문서 버전",
  DONE: "완료",
  FINALIZED: "확정",
  HIGH: "높음",
  HANDED_OVER: "인계 완료",
  IN_PROGRESS: "진행 중",
  IN_REVIEW: "검토 중",
  INSPECTION_PENDING: "검수 대기",
  LOW: "낮음",
  MAJOR: "중요",
  MAKE_UP_REQUIRED: "보충교육 필요",
  MATERIAL: "자재",
  MEDIUM: "보통",
  MILESTONE: "마일스톤",
  MINOR: "경미",
  MONTHLY: "월간",
  OVERDUE: "기한 초과",
  PARTIALLY_RECEIVED: "부분 입고",
  PASSED: "통과",
  PENDING: "대기",
  PARTIAL_ACCEPTANCE: "부분 합격",
  PLANNED: "예정",
  READY: "준비",
  RECURRENCE_ACTION: "재발방지 조치",
  RESEARCH_PROJECT_APPLICATION: "정식 연구과제 승격",
  REJECTED: "반려",
  RETURNED: "회송",
  REVIEW: "검토",
  REVIEW_REQUIRED: "검토 필요",
  SAFETY_MANAGER: "안전관리자",
  SEALED: "봉인",
  SUBMITTED: "상신됨",
  STOP_WORK: "작업중지",
  TASK: "작업",
  UNDER_REVIEW: "검토 중",
  VERIFIED: "검증 완료",
  WEEKLY: "주간",
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
