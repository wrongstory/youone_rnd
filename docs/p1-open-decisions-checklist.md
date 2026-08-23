# P1 Open Decisions Checklist

- 문서 ID: `P1-OPEN-DECISIONS-V0.1`
- 상태: `WAITING_USER_REVIEW`
- 추적 이슈: GitHub `#48`

이 체크리스트는 설계 검토용이며 체크되지 않은 항목을 Codex가 임의 확정하지 않는다. 권장안은 현재 fail-closed 기본 동작과 구현 영향이 가장 작은 선택이다.

## 1. 통합검색 `OD-010`

- [x] `P1-SCOPE-V1.0` 확정: 1차는 내부 사용자용 allowlisted metadata 검색부터 시작하고 검증된 L1/L2 본문만 단계적으로 연다.
- [ ] 1차 metadata entity allowlist 확정: Project, Document, Item/BOM, Equipment, Safety, R&D 중 허용 대상을 검토한다.
- [ ] entity별 title/number/project/owner/date/security label 등 field allowlist 확정.
- [ ] L1/L2 본문색인을 열 문서유형·field·snippet 정책을 별도 승인하거나 P2로 연기.

공통 고정: Vendor 기술자료 저장소 검색, L3/L4 본문색인, 권한 없는 snippet/cache 제공은 금지한다.

## 2. Vendor BOM 조회

- [ ] **권장:** exact Project+Contract Scope와 외주 납품 assignment가 있는 Vendor에게 item code/name/spec/quantity/unit과 effective revision만 제공한다.
- [ ] Vendor BOM 조회는 P2까지 전면 금지한다.

공통 고정: Contract-bound 데이터는 Project+Contract Scope를 모두 요구한다. 원가, 최근가격, 내부 대체품 평가, ECR/ECO 내부 영향검토, 승인 participant는 제외한다.

## 3. 교정 만료 장비 예외

- [ ] **권장:** 기본 사용 차단, 버전형 예외정책 + exact 장비/목적/기간 + 공식 결재 + 독립 재검토가 있을 때만 제한 사용한다.
- [ ] P1에서는 예외 없이 항상 사용 차단한다.
- [ ] 경고만 기록하고 사용은 허용한다.

세 번째 선택은 시험 신뢰성과 감사 Gate를 약화하므로 비권장이다. 승인 전에는 항상 차단한다.

## 4. 연구수당 정책 승인 참여자

- [ ] **권장:** 과제별 ApprovalPolicyVersion이 참여자를 결정하고 Researcher position 자체에는 공식 승인권을 주지 않는다.
- [ ] 모든 수당 정책에 연구소장 단독 승인을 고정한다.
- [ ] 모든 수당 정책에 연구소장+대표 승인을 고정한다.

공통 고정: Senior Researcher는 공식 승인권자가 아니며 실제 지급/송금은 시스템 범위 밖이다.

## 5. P1 offline 명령

- [x] `P1-SCOPE-V1.0` 확정: 장비 사용·안전점검 등 승인된 저위험 draft만 command별 검토 후 allowlist 후보가 된다.
- [ ] 장비 사용/반납 draft exact schema·actor·Scope·conflict ADR 승인.
- [ ] 안전 현장점검 draft가 기존 M15 command로 충분한지 또는 새 command가 필요한지 검토.

공통 고정: 후보라는 이유만으로 registry에 등록하지 않는다. BOM 승인, 교정성적서 확정, 수당 산정/승인/export, 검색/index, MSDS 효력화, 폐기물 인계확정은 online-only다.

## 6. 규정·양식 후속

- [ ] `OD-024`의 잘못된 연구수당 조문 참조를 승인된 규정 개정본으로 교체한다.
- [ ] 장비·안전·수당 실제 회사양식이 업로드될 때 generic template과 별도 version으로 등록한다.

두 항목은 미완료 상태에서도 generic evidence 구조 설계는 가능하지만, 공식 조문 표시와 회사양식 동일 출력은 활성화하지 않는다.

## 7. Gate 확인

- [ ] `docs/p1-source-delta-audit.md` 승인
- [ ] `docs/p1-domain-model-delta.md` 승인
- [ ] `docs/p1-erd-delta.md` 승인
- [ ] `docs/p1-permissions-delta.md` 승인
- [ ] `docs/p1-state-machines-delta.md` 승인
- [ ] `docs/adr/ADR-011-p1-module-boundaries.md` 승인
- [ ] P0 `dev → main` release promotion 완료
- [ ] `OD-037-P1-DEVELOPMENT-GATE` 제품 코드·migration 착수 승인
