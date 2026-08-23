# P1 Source Delta Audit

- 문서 ID: `P1-SOURCE-DELTA-V0.1`
- 상태: `PROPOSED_FOR_REVIEW`
- 추적 이슈: GitHub `#48`
- 기준시각: 2026-08-23 (Asia/Seoul)

## 1. 목적과 적용 범위

이 문서는 승인된 `P1-SCOPE-V1.0`을 P0 정본 및 구현 경계와 대조한다. P1 제품 코드, route, menu, table, migration을 승인하는 문서가 아니다. 충돌은 임의로 해소하지 않고 `docs/p1-open-decisions-checklist.md`와 `docs/open-decisions.md`에 남긴다.

근거 우선순위는 `AGENTS.md`의 Source Precedence를 그대로 따른다. P1 delta는 기존 정본을 대체하지 않으며, 사용자 승인 후 해당 정본에 병합한다.

## 2. 기준선

| 근거 | P1에 미치는 확정 내용 |
|---|---|
| `15_Codex_인수인계_마스터_v0.1` | 권한·결재·기술자료·외주 Scope·감사 규칙을 약화하지 않는다. |
| 기업부설연구소 운영규정 | 연구과제·연구원·연구기록 및 연구수당의 상위 사내규정 근거다. |
| 안전관리규정 | 안전담당, 점검·교육·사고 대응에 이어 P1 MSDS·유해물질·폐기물·훈련 확장의 상위 근거다. |
| 연구수당 지급규정 | 과제별 수당 부여, 평가·산정·증빙의 상위 사내규정 근거다. 잘못된 조문 참조는 규칙으로 사용하지 않는다. |
| `P0-SCOPE-V1.0` | BOM·연구장비/교정·안전 확장·연구수당·통합검색을 P1로 유보했다. |
| `P1-SCOPE-V1.0` | 5개 모듈의 권장 깊이, 제한적 offline, 알림, generic export 범위를 승인했다. |
| P0 M00~M16 | Core Approval/Document/Auth/Audit, Project/WBS, Quality, Purchase/Item, Safety-light, PWA/offline의 공개계약을 재사용한다. |
| Release Gate `#36` | P1 설계는 병렬 가능하지만 P0 release promotion 전 P1 구현은 금지한다. |

## 3. P0 대비 모듈 Delta

| P1 범위 | P0에 이미 존재하는 경계 | P1에서 추가할 논리 경계 | 중복 방지 결정 |
|---|---|---|---|
| BOM | `feature.purchase`의 Item, M10의 BOM extension port, ECR/ECO typed target | Bom/BomVersion/BomLine/Applicability/Alternate/AsBuilt snapshot | 별도 Item master를 만들지 않는다. BOM 소유권은 `feature.purchase` 안에 유지한다. |
| 연구장비·교정 | Quality TestPlan/TestResult, Attachment, Project/WBS | Equipment, Calibration, Usage/Checkout, Maintenance, TestResult equipment snapshot | TestResult를 복제하지 않고 exact equipment/calibration snapshot FK를 추가한다. |
| 안전관리 확장 | M13 Safety assignment/inspection/training/incident와 P1 public port | Substance/MSDS, Material lot/transaction, Waste, Emergency plan/drill/action | 기존 SafetyInspection/Training/Incident를 새 테이블로 복제하지 않는다. |
| 연구수당 | Project/RndProgram, P0의 개념 모델, Approval/Audit/Export ports | Project policy version, participation/evaluation, calculation/adjustment/tax assessment/export | 지급·송금·급여 원장을 만들지 않는다. |
| 통합검색 | 모든 Feature의 allowlisted projection, authorization, audit | Search policy/version, derived index entry, authorization-filtered query, purge/reindex evidence | source of truth를 검색 DB로 옮기지 않는다. Vendor 기술자료 검색과 L3/L4 본문색인은 금지한다. |

## 4. 충돌·중복·구버전 잔재

| ID | 유형 | 발견 내용 | 처리 |
|---|---|---|---|
| `P1-AUDIT-001` | 명명 충돌 | `docs/architecture.md`는 Purchase가 BOM을 소유하고, 로드맵은 BOM을 독립 병합 항목으로 표현한다. | 병합 항목은 `P1-M01`, 물리 소유 module은 `feature.purchase`로 유지한다. 신규 `feature.bom`은 만들지 않는다. |
| `P1-AUDIT-002` | 개념/물리 혼동 | P0 domain/ERD에 연구수당·MSDS·폐기물·비상훈련 개념이 있으나 M13/M11 migration에는 의도적으로 없다. | P1 logical delta를 승인한 뒤에만 physical schema를 추가한다. 현 개념도를 구현 완료로 간주하지 않는다. |
| `P1-AUDIT-003` | 경계 중복 위험 | 장비 사용이 Quality TestResult와 연결되지만 Equipment와 TestResult의 소유자가 다르다. | Equipment public application port와 immutable snapshot link를 사용한다. 어느 module도 다른 module 내부 repository를 직접 호출하지 않는다. |
| `P1-AUDIT-004` | 규정 잔재 | 연구수당 `[별표 1]`이 운영규정 제5조(회의)를 잘못 참조한다. | `OD-024` 결정에 따라 외부조문 연결을 삭제하고 `본 규정 제5조【지급 기준액】` self-reference로 정정한다. 승인된 개정본 전에는 source 원문과 correction decision을 함께 보존한다. |
| `P1-AUDIT-005` | 범위 충돌 | 초기 검색 요구는 전체검색으로 읽힐 수 있으나 기술자료/Vendor/L3-L4 정책은 강한 제한을 요구한다. | P1 첫 release는 Project/Document/Item-BOM/Equipment/Safety-MSDS/R&D의 internal metadata allowlist다. L1/L2 본문은 후속 결정/정책 승인 전 금지한다. |
| `P1-AUDIT-006` | 역할 추정 위험 | 연구수당 검토·급여 참고자료 수신자를 새 직급/역할로 추정할 근거가 없다. | stable permission과 policy participant를 사용하고 신규 회사 역할을 seed하지 않는다. |
| `P1-AUDIT-007` | 법정 수치 추정 위험 | 교정주기, MSDS 갱신, 폐기물/훈련 보존기간을 하나의 법정 고정값으로 만들 근거가 없다. | 대상별 versioned policy/source basis를 저장하고 승인 전 숫자 기본값을 두지 않는다. |
| `P1-AUDIT-008` | offline 확대 위험 | P1 전체를 offline으로 해석할 수 있다. | 장비사용·안전 현장점검의 승인된 저위험 draft만 후보이며 BOM/수당/검색/index/공식 증거는 online-only다. |

## 5. 변경 금지 기준

- Vendor Deny by Default와 exact active Membership + Project/Contract Scope를 완화하지 않는다.
- Senior Researcher에게 공식 결재권을 부여하지 않는다.
- `Admin-System`에 L3/L4 source content 또는 연구수당 세무 상세 자동 열람권을 부여하지 않는다.
- 승인된 BOMVersion, 수당 정책/결정, MSDSVersion, 교정성적서, TestResult snapshot과 Audit event를 덮어쓰지 않는다.
- 핵심 lifecycle을 자유 `status: string`이나 하나의 임시 JSON column에 저장하지 않는다.
- Supabase SDK를 Feature/UI에 직접 노출하지 않는다.
- 검색 결과 허용을 UI 숨김이나 검색엔진 filter 하나에만 의존하지 않는다.
- P1에서 RCMS, ERP 재고/MRP, 급여 지급 또는 송금을 구현하지 않는다.

## 6. 설계 Gate를 막는 TBD

| 결정 | 차단 범위 | 현재 fail-closed 처리 |
|---|---|---|
| L1/L2 본문색인 허용 문서유형·필드 | 후속 본문 검색 | P1 첫 release metadata-only, `OD-038` 승인 전 body 금지 |
| 안전 P1 세부 보존/신고 정책 source version | production retention/job | 일반 5년, 더 긴 적용 근거 및 legal hold 중 최장만 논리 규칙으로 유지 |

## 7. 결론

P1 논리 설계는 진행할 수 있다. 다만 `#36` P0 release promotion, 본 문서와 ERD/권한/상태머신 delta의 사용자 승인, `OD-037-P1-DEVELOPMENT-GATE`의 명시 승인 전에는 P1 제품 구현을 시작할 수 없다.
