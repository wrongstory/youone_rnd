# P1 Open Decisions Checklist

- 문서 ID: `P1-OPEN-DECISIONS-V0.1`
- 상태: `DECISIONS_RECORDED_DESIGN_REVIEW_PENDING`
- 추적 이슈: GitHub `#48`

이 체크리스트는 2026-08-23 사용자 제공 PR #49 검토 결과의 권장 결정을 반영한다. 설계 문서 전체 승인과 `OD-037` 제품 구현 승인은 여전히 별도다.

## 1. 통합검색 `OD-010`

- [x] `P1-SCOPE-V1.0` 확정: 1차는 내부 사용자용 allowlisted metadata 검색부터 시작하고 검증된 L1/L2 본문만 단계적으로 연다.
- [x] 1차 metadata entity allowlist: Project, Document, Item/BOM, Equipment, Safety/MSDS, R&D.
- [x] entity별 명시 field allowlist는 `docs/p1-permissions-delta.md`의 baseline으로 확정.
- [x] P1 첫 릴리즈 L1/L2 본문색인 미허용(metadata-only). 후속 별도 결정/정책 승인 후에만 개방.

공통 고정: Vendor 기술자료 저장소 검색, L3/L4 본문색인, 권한 없는 snippet/cache 제공은 금지한다.

## 2. Vendor BOM 조회

- [x] exact Project+Contract Scope와 외주 납품 assignment가 있는 Vendor에게 item code/name/spec/quantity/unit과 effective revision만 제공한다.
- [ ] Vendor BOM 조회는 P2까지 전면 금지한다.

공통 고정: Contract-bound 데이터는 Project+Contract Scope를 모두 요구한다. 원가, 최근가격, 내부 대체품 평가, ECR/ECO 내부 영향검토, 승인 participant는 제외한다.

## 3. 교정 만료 장비 예외

- [x] 기본 사용 차단, versioned exception policy + exact 장비/목적/기간 + Approval + 독립 재검토가 있을 때만 제한 사용한다.
- [ ] P1에서는 예외 없이 항상 사용 차단한다.
- [ ] 경고만 기록하고 사용은 허용한다.

세 번째 선택은 시험 신뢰성과 감사 Gate를 약화하므로 비권장이다. 승인 전에는 항상 차단한다.

## 4. 연구수당 정책 승인 참여자

- [x] 과제별 ApprovalPolicyVersion이 참여 조합을 결정하되 참여 가능자는 기존 canonical Lab Director 이상 공식 approval authority 또는 기록된 acting authority로 제한한다.
- [ ] 모든 수당 정책에 연구소장 단독 승인을 고정한다.
- [ ] 모든 수당 정책에 연구소장+대표 승인을 고정한다.

공통 고정: Senior Researcher는 공식 승인권자가 아니며 실제 지급/송금은 시스템 범위 밖이다.

## 5. P1 offline 명령

- [x] `P1-SCOPE-V1.0` 확정: 장비 사용·안전점검 등 승인된 저위험 draft만 command별 검토 후 allowlist 후보가 된다.
- [x] 실제 state transition은 전부 online-only. 장비 사용/반납과 안전점검은 draft capture만 offline 후보로 유지한다.
- [ ] 장비 사용/반납 draft exact schema·actor·Scope·conflict ADR 승인.
- [ ] 안전 현장점검 draft가 기존 M15 command로 충분한지 또는 새 command가 필요한지 검토.

공통 고정: 후보라는 이유만으로 registry에 등록하지 않는다. BOM 승인, 교정성적서 확정, 수당 산정/승인/export, 검색/index, MSDS 효력화, 폐기물 인계확정은 online-only다.

## 6. 규정·양식 후속

- [x] `OD-024` 정정 방향: `[별표 1]`의 잘못된 기업부설연구소 운영규정 제5조 참조를 삭제하고 `본 규정 제5조【지급 기준액】에 따라 적용한다`로 self-reference한다.
- [ ] 장비·안전·수당 실제 회사양식이 업로드될 때 generic template과 별도 version으로 등록한다.

두 항목은 미완료 상태에서도 generic evidence 구조 설계는 가능하지만, 공식 조문 표시와 회사양식 동일 출력은 활성화하지 않는다.

## 7. Gate 확인

- [x] `docs/p1-source-delta-audit.md` 승인 — PR #49
- [x] `docs/p1-domain-model-delta.md` 승인 — PR #49
- [x] `docs/p1-erd-delta.md` 승인 — PR #49
- [x] `docs/p1-permissions-delta.md` 승인 — PR #49
- [x] `docs/p1-state-machines-delta.md` 승인 — PR #49
- [x] `docs/adr/ADR-011-p1-module-boundaries.md` 승인 — PR #49
- [ ] P0 `dev → main` release promotion 완료
- [ ] `OD-037-P1-DEVELOPMENT-GATE` 제품 코드·migration 착수 승인
