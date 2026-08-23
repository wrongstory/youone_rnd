# P1 개발 로드맵

- 계획 ID: `DELIVERY-PLAN-P1-V0.1`
- 작성일: 2026-08-23 (Asia/Seoul)
- 상태: `PROPOSED` — 범위 체크리스트와 P1 Development Gate 승인 전에는 설계 초안만 유효
- 기준: `P0-SCOPE-V1.0`, `docs/p1-scope-checklist.md`, P0 정본 설계 및 구현 결과
- 추적 이슈: GitHub `#39`

## 1. 현재 기준선

P0의 기능 수직 슬라이스 `M00`~`M16`은 `dev`에 병합됐다. 다만 이것은 P0 기능개발 완료를 뜻하며, P0 운영출시 완료를 뜻하지 않는다. GitHub 이슈 `#36`의 R02 잔여와 R03~R06, Staging 증적, 사용자 운영정책 승인, `dev → main` 릴리즈 승격이 남아 있다.

P1은 지금 계획·검토할 수 있지만, P0와 섞어서 구현하지 않는다.

| 트랙 | 지금 가능한 작업 | 구현 착수 조건 |
|---|---|---|
| P0 Release | `#36` R02 잔여 및 R03~R06 구현·검증 | 기존 승인 범위에 따라 계속 진행 |
| P1 Planning | 범위 체크리스트, 상태·권한·ERD 차이, ADR, 이슈 분해 | 즉시 가능 |
| P1 Implementation | 아래 `P1-M00`~`P1-M07` 수직 슬라이스 | P0 릴리즈 승격 완료 + P1 Development Gate 승인 |

## 2. P1 목표와 비목표

P1의 목표는 P0에서 의도적으로 후속으로 둔 업무를 기존 Core와 보안 경계 위에 추가하는 것이다.

- 버전 BOM과 ECR/ECO 연계
- 연구장비·교정·사용/반출·시험결과 연계
- MSDS/유해물질, 폐기물, 비상계획·훈련을 포함한 안전관리 확장
- 과제별 연구수당 정책·평가·산정·세무분류·급여 참고자료 내보내기
- 권한·Scope·보안등급을 강제하는 통합검색

P1에서도 다음은 포함하지 않는다.

- 특허/IP, 하이웍스·SSO·외부시스템 Adapter: P2
- RCMS 회계·송금 또는 ERP/재고/급여 지급 시스템 복제
- 외주업체의 기술자료 저장소 탐색, L3/L4 원문 다운로드·자가출력
- 실시간 공동편집, 미승인 오프라인 자동 병합
- 실제 회사양식 업로드 전 추정한 인쇄양식

## 3. P1 Development Gate

다음 항목을 모두 충족하기 전 P1 package, table, route, menu 또는 migration을 만들지 않는다.

- [ ] P0 Release Gate 이슈 `#36` 완료
- [ ] `dev → main` P0 릴리즈 승격 승인·병합
- [ ] `P1-SCOPE-V1.0` 사용자 승인
- [ ] P1 source delta audit 완료
- [ ] 모듈별 상태머신·권한·감사 이벤트·보존정책 승인
- [ ] 논리 ERD와 P0 데이터 migration/backfill 영향 검토
- [ ] `OD-010`, `OD-024` 및 해당 P1 기능을 막는 결정 해소
- [ ] P1 기술·보안 ADR 승인
- [ ] P1 이슈, 파일 소유권, migration 단일 작성자, 병합 순서 확정

P0 운영출시 준비와 P1 설계는 병렬로 진행할 수 있다. P1 제품 코드는 위 Gate 이후에만 시작한다.

## 4. 권장 병합 순서

| 병합 | 범위 | 핵심 완료선 | 선행조건 |
|---|---|---|---|
| `P1-M00` | P1 Gate·구조·ADR | P1 package/route 경계, stable ID, 상태·권한·ERD delta, migration 순서, 테스트 행렬 확정 | P1 Gate 승인 |
| `P1-M01` | BOM | Item 기반 버전 BOM, 구성항목, 대체/효력 범위, 승인 snapshot, ECR/ECO 변경대상 및 as-built 증거 | `P1-M00`, M10 공개계약 |
| `P1-M02` | 연구장비·교정 | 장비대장, 상태·위치·관리자, 교정주기/성적서, 사용·반출·반납, 유지보수, TestResult 연결 | `P1-M00`, M08 공개계약 |
| `P1-M03` | 안전관리 확장 | MSDS 버전, 유해물질 재고·사용, 폐기물 인계·처리증빙, 비상계획·훈련·참석·후속조치 | `P1-M00`, M13 공개계약 |
| `P1-M04` | 연구수당 | 과제별 정책 버전, 참여자·평가, 산정·조정 승인, 사람/월 합산, 세무·임금 분리, 급여 참고자료 export | `P1-M00`, M04/M11 공개계약 |
| `P1-M05` | 권한필터 통합검색 | 서버/DB 권한 필터, 보안등급별 색인 정책, 허용 projection, 검색·열람 감사, 재색인 | `P1-M01`~`P1-M04` schema 안정화 |
| `P1-M06` | PWA·알림·모바일 통합 | 승인된 P1 명령만 offline allowlist, 민감자료 cache 금지, 만기/교정/훈련 알림, 375px 주요 흐름 | `P1-M01`~`P1-M05` |
| `P1-M07` | 보안·이관·릴리즈 Gate | P0→P1 upgrade, RLS/field-redaction/concurrency/audit/recovery/E2E, Staging 검증, release evidence | 전체 P1 병합 |

모든 병합은 `Domain → Application → Infrastructure → Interface → Test` 수직 슬라이스로 끝낸다. DB만 먼저 만들거나 임시 JSON 필드에 생애주기를 저장하지 않는다.

## 5. 모듈별 핵심 불변조건

### 5.1 BOM

- BOM 버전은 승인 후 덮어쓰지 않고 새 버전을 연결한다.
- ECR/ECO는 변경 전·후 exact BOM/Item/Revision을 구조화해 참조한다.
- 효력시점과 적용 serial/lot/project 범위를 분리한다.
- 외주 projection에는 허용된 구성정보만 포함하고 원가·내부변경검토를 제외한다.

### 5.2 연구장비·교정

- 장비 상태와 교정 상태는 자유 문자열이 아닌 상태머신으로 관리한다.
- 만료 장비의 사용 차단 또는 예외는 버전형 정책과 승인 증거가 필요하다.
- 사용·반출·반납·교정·정비 이력은 append-only evidence다.
- 시험결과는 사용 장비와 당시 교정 snapshot을 보존한다.

### 5.3 안전관리 확장

- MSDS는 물질별 버전과 효력기간을 가진다.
- 유해물질·폐기물·훈련 기록은 담당자와 Project/Vendor Scope를 서버와 DB에서 재검증한다.
- 법정 보존·신고 대상과 내부 운영기록을 구분하고 근거 버전을 저장한다.
- 회사양식이 없으면 범용 증빙 구조만 사용한다.

### 5.4 연구수당

- 하나의 전역 지급주기를 두지 않고 승인된 과제별 정책 버전을 사용한다.
- 사람/월 비과세 후보액은 여러 과제를 합산하되 세무분류와 임금성 판단을 분리한다.
- 계산값, 조정값, 조정사유, 승인 snapshot, export 이력을 보존한다.
- 시스템은 지급을 실행하지 않고 급여 담당자가 검토할 참고자료만 내보낸다.

### 5.5 통합검색

- 검색 결과와 snippet도 일반 조회와 동일한 권한·Scope·필드투영을 적용한다.
- Vendor는 기술자료 저장소를 탐색할 수 없다.
- L3/L4 원문을 범용 검색색인에 넣지 않는다. 허용되는 metadata 범위도 별도 승인한다.
- 민감 검색과 결과 열람은 감사하며, 권한 회수 후 이전 cache/index 결과를 제공하지 않는다.

## 6. 검증 Gate

각 P1 병합과 최종 릴리즈는 다음을 증명한다.

- P0 전체 회귀 테스트 통과
- internal/vendor/disabled/expired/cross-vendor 권한·RLS 행렬 통과
- 상태전이·동시성·불변 snapshot·audit/outbox 원자성 통과
- Vendor 응답의 금액·세무·원가·내부검토·기술정보 금지필드 부재
- clean DB와 P0 release fixture에서 P1 upgrade 검증
- 검색색인·offline cache·백업/복구에서 권한 회수와 민감정보 삭제/격리 검증
- 모바일 375px empty/loading/error/forbidden/offline 주요 흐름 검증
- critical/high 보안 결함 0건

## 7. 이슈와 브랜치 운영

- P1 epic 하나와 `P1-M00`~`P1-M07` 순서의 한글 이슈를 만든다.
- 일반 작업 브랜치는 `dev`에서 `codex/` prefix로 생성하고 PR 대상은 `dev`다.
- P1 병합은 번호 순서를 지키며, 병렬 준비 중 같은 module 또는 migration path를 동시에 편집하지 않는다.
- `main`은 별도 P1 릴리즈 승격 PR로만 갱신한다.
- 각 이슈는 요구사항 ID, 공개계약, DB/RLS, 상태/audit, 테스트, 위험, 롤백/forward-fix를 포함한다.

## 8. 바로 다음 행동

1. 사용자가 `docs/p1-scope-checklist.md`를 검토·확정한다.
2. P0 Release Gate `#36`은 R03부터 계속 진행한다.
3. P1 설계 delta audit과 `P1-M00` ADR을 준비한다.
4. P0 릴리즈 승격과 P1 Development Gate가 모두 승인되면 `P1-M01`부터 구현한다.
