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
- GitHub 기본 통합 브랜치는 `dev`다. 기능·수정 PR은 `dev`를 대상으로 하고, `main`에는 검토 완료된 릴리즈 승격 PR만 병합한다.

## Current Phase

`IMPLEMENTATION_ACTIVE` (`M10` ECR/ECO 및 화면 검토용 Preview PR #29가 `dev`에 병합 완료됐고, `M11` Purchase/R&D 구현 진행 중).

Google Drive 프로젝트 문서 `00`~`15`와 상위 사내규정 3종을 읽고 1차 정본 설계문서를 작성했다. 사용자가 2026-08-21 (Asia/Seoul) Development Gate와 확정된 P0 범위 및 프로젝트 구조에 따라 개발 착수를 승인했다. `M00` ADR과 `M01` 스캐폴딩은 PR #19로 `main`에 병합됐다.

`M00`의 ADR-001~ADR-008을 Accepted로 기록했다. `M01`은 Node.js 24 LTS, pnpm workspace, Turborepo, Next.js App Router, 분리 worker, 전체 P0 package 공개계약 shell, request/worker 자격증명 경계, CI와 architecture test 기반을 생성했다. `config/package-boundaries.json`이 P0 package의 계층·소유자·최초 구현 merge item을 고정한다.

`M02`는 공통 value type, UnitOfWork/Audit/Transition/Outbox Port, 빈 stable-code registry, append-only Audit/Transition, immutable Outbox event와 분리 delivery state, idempotency ledger, NOBYPASSRLS request/worker capability role의 첫 SQL migration을 구현했고 PR #20으로 `main`에 병합됐다. 업무별 상태·Feature table·R&D Program machine은 선도입하지 않는다. 로컬 TypeScript/계약 테스트와 GitHub Actions PostgreSQL 16의 clean/upgrade/RLS/rollback/payload/idempotency/worker/concurrency 테스트를 포함한 총 50개 테스트가 통과했다.

`M03`는 Supabase의 서버 검증 세션을 user-editable metadata와 분리하고, DB의 활성 계정·effective-dated assignment를 매 요청 재조회해 `TrustedActorContext`를 만든다. Actor/Resource/Projection은 WeakSet provenance와 immutable collection으로 caller 조립·spread clone을 거부한다. Authorization 결과는 effect/reason뿐 아니라 Scope evidence, action-bound versioned projection, 후속 audit/delivery obligation을 보존한다. DB에는 Identity/RBAC/VendorMembership, 정규화된 action-set과 projection registry를 만들되, 실제 Project/Contract/DocumentVersion FK가 없는 임시 Scope row는 만들지 않는다. 계정·업체·membership lifecycle은 optimistic update와 M02 Audit을 한 transaction에 기록하며, request/identity-resolver/service Auth 경계를 별도 export로 격리한다. PR #21은 PostgreSQL 16 DB 통합 테스트를 포함한 테스트 80개, typecheck 4개 작업, build 2개 작업 통과 후 `main`에 병합됐다.

`M04`는 공통 Approval domain/application 계약, 정책·결재선·참여자 snapshot, `SEQUENTIAL`/`ANY_ONE`/`ALL`/`SPECIFIC`, REVIEW/AGREEMENT/APPROVAL/REFERENCE, 위임 재검증, 반려·회수·재상신 generation, append-only action과 M02 Audit/Transition/Outbox 원자성을 구현했다. 첫 물리 typed subject는 `APPROVAL_POLICY_VERSION`이며 exact version/checksum과 같은 root의 새 version 재상신을 강제한다. 개인 결재함·상세는 query/command adapter 미연결 시 명시적 unavailable·disabled 상태를 반환한다. PR #22는 GitHub Actions의 PostgreSQL 16 DB 통합 검증을 포함해 통과한 뒤 `main`에 병합됐다.

`M05`는 versioned Template/Document/DocumentVersion, content validation·sealed manifest·scan evidence, private Attachment metadata, 정확한 `DOCUMENT_VERSION` 결재 대상 FK, 반려·회수 후 strictly newer revision, 승인본 supersede, Vendor deny, exact participant read, L3/L4 entitlement, private Storage broker를 구현했다. DB가 canonical JSON/content와 full manifest hash를 재계산하며 승인본 내용·template·renderer·보안등급·봉인 첨부는 변경할 수 없다. raw editor content, private object key, signed/public URL, evidence table은 일반 projection으로 노출하지 않는다. GitHub Actions PostgreSQL 16 실DB 검증까지 통과한 PR #23이 `main`에 병합됐다.

`M06`는 일반 Project, ProjectMember, Product 연결, 자유계층 WBS, 실제 Project FK를 가진 Vendor grant와 정식 연구과제 신청/지정을 구현했다. 모든 활성 내부사용자는 일반 Project를 만들 수 있으나 정식 연구과제 여부는 별도 immutable application version을 봉인하고 정확히 한 명의 연구소장이 검토·동의해 생성된 designation에서만 파생한다. 선임·대표 단계와 직접 플래그 변경은 허용하지 않는다. 신청 반려·재작성 및 신청자 회수는 원본을 수정하지 않고 strictly newer version으로 이어지며, Project 종료·재개는 `OD-014`가 확정될 때까지 명령을 제공하지 않는다. PR #24는 GitHub Actions의 전체 195개 및 M06 PostgreSQL 실DB 10개 검증을 통과해 `main`에 병합됐다.

`M07`은 VendorContract root, immutable ContractVersion, ContractProject, 구조화된 ContractMilestone, Deliverable/Version, Guarantee/Warranty 기반과 실제 Contract Scope를 구현했다. 외주 계약 목록 projection에는 금액·지급·내부평가 필드가 존재하지 않으며, 상세 금융 projection은 exact active Contract Scope와 `contract.detail.finance.read`를 모두 요구한다. 계약 승인·서명·변경은 exact version/checksum/signature evidence로 고정하고, 활성화 시 scope 부여와 종료·해지 시 scope 회수를 계약 전이·감사·outbox와 같은 transaction에서 처리한다. PR #25는 `quality`와 독립 `m07-postgres` 검증을 통과해 `main`에 병합됐다.

`M08`은 Requirement/Revision, TestPlan/Result, weighted InspectionChecklistVersion/Criterion, immutable InspectionAttempt/CriterionResult 및 AcceptancePaymentDecision/PaymentRateAdjustment를 구현했고 PR #26으로 `main`에 병합됐다. 계산 달성도·시스템 제안률·조정 요청률·최종 승인률을 별도 보존하며, critical 실패는 점수만으로 완전합격될 수 없다. 조건부합격은 잔여조건·기한·보류액, 부분합격은 독립 사용가능분·미지급 잔액을 exact snapshot으로 가진다. 조정은 사유·증거·공식 결재 snapshot이 필요하며 지급 가능 상태는 외부 송금이나 회계 실행을 뜻하지 않는다.

`M09`는 PR #27로 `main`에 병합됐다. exact source와 evidence를 가진 NCR, 복수 CAR, containment, root-cause/action plan, 독립 효과검증, ineffective 재작업, close/reopen 이력을 구현한다. 책임 평가는 `PRELIMINARY`/`DISPUTED`/`FINAL`을 분리하고, 외주업체는 정확한 활성 VendorMembership 및 Project/Contract Scope와 책임 할당이 있을 때만 허용된 수행 명령을 사용할 수 있다. NCR/CAR의 검토·종료가 계약 책임을 면제하거나 계약 상태를 자동 변경하지 않는다.

`M10`은 PR #29로 `dev`에 병합됐다. ECR/ECO의 immutable version, 구조화된 6개 영향검토, exact typed before/after target, 승인된 변경지시, 적용범위 및 독립 재검증을 구현한다. 계약 영향 변경은 별도 서명·발효된 ContractVersion snapshot 없이는 효력이 발생하지 않으며, 긴급변경 정책과 결재 부정결과 상태전이는 각각 `OD-032`, `OD-033`을 임의 결정하지 않고 fail-closed로 유지한다. BOM은 P1 extension port만 두고 M10 물리 저장소와 화면에 포함하지 않았다.

로컬 화면 검토는 서버 전용 `YOUONE_PREVIEW_DATA=enabled`에서만 샘플 결재·문서·프로젝트/WBS·계약·검수·NCR/CAR·ECR/ECO 목록과 상세를 제공한다. 화면마다 데모임을 명시하며 실제 저장·결재·지급 기록으로 표시하지 않는다. 플래그가 없으면 기존 조회 어댑터가 fail-closed `UNAVAILABLE`을 유지하고, 외주 안전 projection에는 금액·지급·내부 책임검토 필드를 추가하지 않는다.

`STRUCTURE-PROPOSAL-V1`과 `DELIVERY-PLAN-P0-V1`을 작성했다. 권장 구조는 pnpm workspace, Next.js App Router web, 별도 worker, Core/Feature/Process/Infrastructure package, 전역 SQL migration 정본이다. 서브에이전트는 Platform/Security, Approval/Evidence, Business/Quality의 세 역할과 Root Integration/Release로 나눈다.

## Known Gaps

- 개별 계약은 내부 초기 프리셋을 사용하되 적용 법령과 계약별 수치·예외를 서명 전 확정해야 한다.
- 연구수당 규정의 잘못된 조문 참조는 규정 개정사항으로 남는다. 시스템 정책은 현행 세법과 과제별 승인 버전을 근거로 별도 추적한다.
- `P0-SCOPE-V1.0`으로 권장 범위를 확정했다. P0에는 연구노트 경량, 시험/성능, 검수 달성도/차등지급, NCR/CAR, ECR/ECO, 안전 경량, L3/L4 통제출력을 포함한다.
- BOM, 연구수당, 연구장비/교정, 권한필터 검색은 P1이다. 특허/IP와 하이웍스/외부시스템은 P2다.
- 실제 회사 양식, 역할별 KPI, 하이웍스 범위, 모바일 탭, 캘린더 위치, 검색 범위가 미확정이다.
- `WF-RND-V1`의 `RND_PROGRAM` 정식 상태머신은 미확정이며 `OD-030`으로 기록했다. M11은 Program 등록·Project 연결·예산·집행·증빙·기한 조회를 구현하되 lifecycle 상태/전이/종료·재개 명령은 fail-closed로 두고 registry에 임의 등록하지 않는다.
- NCR `REOPENED` 이후 재시정·재종료 전이 경로는 `OD-031`로 남긴다. M09는 증거가 있는 `CLOSED → REOPENED`와 과거 이력 보존까지만 구현하고 후속 상태를 임의로 만들지 않는다.
- 긴급 ECO의 실제 권한·소급승인 기한·위험기준은 `OD-032`의 버전형 운영정책으로 남기며, 미설정 시 긴급경로를 차단한다.
- ECO 결재의 반려·회수·취소 이후 canonical 상태전이는 `OD-033`으로 남긴다. M10은 결재결과 증거만 보존하고 상태를 임의 전이하지 않는다.
- 실제 회사 양식 업로드 전에는 범용 버전형 템플릿만 설계하고 인쇄 레이아웃을 추정하지 않는다.

## Development Gate

기술스택, `P0-SCOPE-V1.0`, `STRUCTURE-PROPOSAL-V1`, `DELIVERY-PLAN-P0-V1` 및 제품 코드·스캐폴딩·DB migration 착수가 2026-08-21 사용자 지시로 승인됐다.

## Next Work After Approval

1. `M00`: 구조/DB principal/typed Approval subject/editor/worker/offline/watermark ADR 확정.
2. `M01`: 프로젝트 스캐폴딩과 import boundary 완료 및 PR #19 병합.
3. `M02`: DB/Audit Kernel 실제 PostgreSQL CI 검증 및 PR #20 병합.
4. `M03`: Auth/RBAC/Scope와 trusted request/RLS/field projection 구현 및 PR #21 병합 완료.
5. `M04`: 공통 Approval Engine과 typed subject adapter 구현 및 PR #22 병합 완료.
6. `M05`: Document/File CI 실DB 검증 및 PR #23 병합 완료.
7. `M06`: Project/WBS, 실제 Project Scope, 정식 연구과제 승격 구현 및 PR #24 병합 완료.
8. `M07`: Vendor/Contract/Deliverable, 실제 Contract Scope와 finance field denial 구현 및 PR #25 병합 완료.
9. `M08`: Requirement/Test/Inspection, 달성도·조건부/부분합격·승인된 지급률 조정 구현 및 PR #26 병합 완료.
10. `M09`: NCR/CAR 부적합·시정조치·독립 효과검증 구현 및 PR #27 병합 완료.
11. `M10`: ECR/ECO 변경요청·변경지시·재검증 구현 및 PR #29 `dev` 병합 완료.
12. `M11`: Purchase/R&D 진행·예산·집행·증빙 구현 진행 중.
13. `M12~M14`: ResearchNote 경량 → Safety 경량 → L3/L4 통제출력.
14. `M15~M16`: PWA/offline → 통합 보안·운영 Gate.
