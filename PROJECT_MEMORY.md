# Project Memory

## Product

(주)유원산업기술 기업부설연구소의 연구개발 프로젝트, 외주개발, 계약, 구매, 정부 R&D, 연구노트, 시험·검증, 기술자료, 사내문서, 전자결재, 현장업무를 통합 관리하는 모바일 우선 PWA.

## Scale and Actors

- 초기 내부 사용자 약 8명, 외주 사용자 약 10명.
- 최대 약 30명 예상.
- 기본 직위: 전임 → 선임 → 연구소장 → 대표.
- Role과 Position은 분리한다.
- 외주 사용자는 별도 계정으로 직접 로그인한다.
- 본사 직원은 현재 조회 전용이다.

## Stable Decisions

- 모든 활성 내부사용자는 일반 프로젝트를 생성할 수 있다. 외주계정은 생성할 수 없다.
- 일반 프로젝트 생애주기와 `정식 연구과제 승격`을 분리한다. 신청 버전을 봉인한 뒤 연구소장 검토·동의가 완료되면 정식 연구과제로 지정한다. 선임·대표 승인은 이 승격 결재선에 포함하지 않는다.
- 선임은 검토/합의자이며 공식 승인권자는 아니다.
- 공식 결재권자는 연구소장 이상이다.
- 대표 단계는 2명 중 1명 승인하는 `ANY_ONE`이 기본이다.
- Approval Engine은 공통 모듈이고 승인 대상 문서 버전은 immutable snapshot이다.
- 기술자료는 L1~L4이며 외주 접근은 Deny by Default이다.
- 기술정보 외부반출은 L1 여부와 별개로 연구소장 승인을 요구한다.
- L2 외주 임시 디지털열람은 연구소장 승인, 기본 15일(승인자가 변경 가능)이다.
- L3/L4 외주 원문 다운로드와 수신자 자체 출력은 금지한다. 필요 시 내부 권한자가 식별 워터마크·사본번호를 넣어 직접 출력하고 인계·회수/파기 이력을 남긴다.
- L3 통제출력은 연구소장 승인, L4는 연구소장과 대표 승인이 모두 필요하다.
- 시스템관리자와 L3/L4 원문 열람권을 분리한다.
- 외주 계약 목록은 금액·지급정보를 노출하지 않는다. 본인 계약 상세도 별도 권한의 허용 필드만 제공한다.
- 회사는 WHAT을 관리하고 외주업체는 HOW의 전문책임을 부담한다. 회사 확인·검수·지급은 책임 면제가 아니다.
- Product, Project, R&D Program은 독립 엔티티이며 N:M으로 연결한다.
- WBS는 자유계층이고 UI 기본만 프로젝트→마일스톤→과업이다.
- 연구노트는 선임 검토가 선택적으로 가능하며 연구소장 확정으로 완료한다. 대표 결재는 없다.
- 구매 흐름은 견적→구매품의→결재→구매결의→본사 지급→입고→검수보고→완료이다.
- R&D는 진행·예산·집행·증빙·마감을 관리하며 RCMS 전체를 복제하지 않는다.
- 자유편집 문서와 템플릿을 병행하고 템플릿 변경은 과거 문서를 바꾸지 않는다.
- 승인된 초기 기술스택은 Next.js App Router + TypeScript 모듈러 모놀리스, Supabase Auth/PostgreSQL/Private Storage, Repository/Adapter 경계, Tiptap, Service Worker + IndexedDB/Dexie, Vitest + Playwright + RLS 통합테스트다. 도메인 계층과 UI는 Supabase SDK에 종속시키지 않는다.
- 오프라인 충돌은 자동 덮어쓰지 않고 비교·선택·병합한다.
- 연구성과·연구노트·연구시설 등 결과물은 회사 귀속이 원칙이며 법령·협약·개별 계약 예외를 기록한다.
- 안전관리자, 안전점검/교육/비상훈련/사고/폐기물 기록을 별도 안전 모듈 경계로 관리하고 기본 5년 이상 보존한다.
- 연구수당은 수당이 부여된 과제별 버전 정책에서 종류·대상·예산·평가기준·지급주기를 결정한다. 여러 과제의 월 비과세 후보액은 사람별로 합산하며, 적격요건과 월 20만원 한도를 재검증한다.
- 부분합격/조건부합격은 가중치 체크리스트 달성도로 평가하고 기본 지급률을 달성도에 연동한다. 지급률 조정은 사유와 별도 승인을 요구한다.
- 계약 수치, 법령 체크, 금액/보안등급별 결재선은 `docs/legal-policy-baseline.md`의 버전형 내부 프리셋으로 시작한다.

## Current Phase

`IMPLEMENTATION_ACTIVE` (`M02` 병합 완료, `M03` Auth/RBAC/Scope 구현·검증 진행 중).

Google Drive 프로젝트 문서 `00`~`15`와 상위 사내규정 3종을 읽고 1차 정본 설계문서를 작성했다. 사용자가 2026-08-21 (Asia/Seoul) Development Gate와 확정된 P0 범위 및 프로젝트 구조에 따라 개발 착수를 승인했다. `M00` ADR과 `M01` 스캐폴딩은 PR #19로 `main`에 병합됐다.

`M00`의 ADR-001~ADR-008을 Accepted로 기록했다. `M01`은 Node.js 24 LTS, pnpm workspace, Turborepo, Next.js App Router, 분리 worker, 전체 P0 package 공개계약 shell, request/worker 자격증명 경계, CI와 architecture test 기반을 생성했다. `config/package-boundaries.json`이 P0 package의 계층·소유자·최초 구현 merge item을 고정한다.

`M02`는 공통 value type, UnitOfWork/Audit/Transition/Outbox Port, 빈 stable-code registry, append-only Audit/Transition, immutable Outbox event와 분리 delivery state, idempotency ledger, NOBYPASSRLS request/worker capability role의 첫 SQL migration을 구현했고 PR #20으로 `main`에 병합됐다. 업무별 상태·Feature table·R&D Program machine은 선도입하지 않는다. 로컬 TypeScript/계약 테스트와 GitHub Actions PostgreSQL 16의 clean/upgrade/RLS/rollback/payload/idempotency/worker/concurrency 테스트를 포함한 총 50개 테스트가 통과했다.

`M03`는 Supabase의 서버 검증 세션을 user-editable metadata와 분리하고, DB의 활성 계정·effective-dated assignment를 매 요청 재조회해 `TrustedActorContext`를 만든다. Actor/Resource/Projection은 WeakSet provenance와 immutable collection으로 caller 조립·spread clone을 거부한다. Authorization 결과는 effect/reason뿐 아니라 Scope evidence, action-bound versioned projection, 후속 audit/delivery obligation을 보존한다. DB에는 Identity/RBAC/VendorMembership, 정규화된 action-set과 projection registry를 만들되, 실제 Project/Contract/DocumentVersion FK가 없는 임시 Scope row는 만들지 않는다. 계정·업체·membership lifecycle은 optimistic update와 M02 Audit을 한 transaction에 기록하며, request/identity-resolver/service Auth 경계를 별도 export로 격리한다.

`STRUCTURE-PROPOSAL-V1`과 `DELIVERY-PLAN-P0-V1`을 작성했다. 권장 구조는 pnpm workspace, Next.js App Router web, 별도 worker, Core/Feature/Process/Infrastructure package, 전역 SQL migration 정본이다. 서브에이전트는 Platform/Security, Approval/Evidence, Business/Quality의 세 역할과 Root Integration/Release로 나눈다.

## Known Gaps

- 개별 계약은 내부 초기 프리셋을 사용하되 적용 법령과 계약별 수치·예외를 서명 전 확정해야 한다.
- 연구수당 규정의 잘못된 조문 참조는 규정 개정사항으로 남는다. 시스템 정책은 현행 세법과 과제별 승인 버전을 근거로 별도 추적한다.
- `P0-SCOPE-V1.0`으로 권장 범위를 확정했다. P0에는 연구노트 경량, 시험/성능, 검수 달성도/차등지급, NCR/CAR, ECR/ECO, 안전 경량, L3/L4 통제출력을 포함한다.
- BOM, 연구수당, 연구장비/교정, 권한필터 검색은 P1이다. 특허/IP와 하이웍스/외부시스템은 P2다.
- 실제 회사 양식, 역할별 KPI, 하이웍스 범위, 모바일 탭, 캘린더 위치, 검색 범위가 미확정이다.
- `WF-RND-V1`의 `RND_PROGRAM` 정식 상태머신은 미확정이며 `OD-030`으로 기록했다. M11 전 결정하고 M02 registry에는 임의 등록하지 않는다.
- 실제 회사 양식 업로드 전에는 범용 버전형 템플릿만 설계하고 인쇄 레이아웃을 추정하지 않는다.

## Development Gate

기술스택, `P0-SCOPE-V1.0`, `STRUCTURE-PROPOSAL-V1`, `DELIVERY-PLAN-P0-V1` 및 제품 코드·스캐폴딩·DB migration 착수가 2026-08-21 사용자 지시로 승인됐다.

## Next Work After Approval

1. `M00`: 구조/DB principal/typed Approval subject/editor/worker/offline/watermark ADR 확정.
2. `M01`: 프로젝트 스캐폴딩과 import boundary 완료 및 PR #19 병합.
3. `M02`: DB/Audit Kernel 실제 PostgreSQL CI 검증 및 PR #20 병합.
4. `M03`: Auth/RBAC/Scope와 trusted request/RLS/field projection 검증.
5. `M04~M05`: Approval → Document/File.
6. `M06~M11`: Project/WBS → Vendor/Contract → Quality/Payment → NCR/CAR → ECR/ECO → Purchase/R&D.
7. `M12~M14`: ResearchNote 경량 → Safety 경량 → L3/L4 통제출력.
8. `M15~M16`: PWA/offline → 통합 보안·운영 Gate.
