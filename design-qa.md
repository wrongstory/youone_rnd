# Design QA — P0 기능 화면 엔터프라이즈 통합

- source visual truth: `C:\Users\Admin\.codex\generated_images\01a02127-6e10-7423-a5ea-29d5e5987bf8\exec-4ba09d6c-1b8a-4cc2-bd6d-94cd481f5e8e.png`
- implementation URL: `http://localhost:3000/`
- mobile implementation: `C:\Users\Admin\AppData\Local\Temp\youone-feature-screen-audit\14-projects-mobile-final.png`
- desktop implementation: `C:\Users\Admin\AppData\Local\Temp\youone-feature-screen-audit\15-approvals-desktop-final.png`
- combined comparison: `C:\Users\Admin\AppData\Local\Temp\youone-feature-screen-audit\16-feature-theme-comparison.png`
- mobile viewport/state: `390 × 844` CSS px, light theme, preview-data enabled, project list
- desktop viewport/state: `1440 × 900` CSS px, light theme, preview-data enabled, approval inbox
- source pixels: `853 × 1844`, Lanczos normalized to `390 × 844` for comparison
- implementation pixels: mobile `390 × 844`, desktop `1440 × 900`, CSS density `1×`

## Comparison scope

Source는 대시보드이고 implementation은 기능 목록이므로 content parity 대상은 아니다. 이번 QA는 사용자가 승인한 source의 공통 visual language — navy shell, teal accent, compact 업무 card, white surface, 얇은 line, 높은 정보 밀도, mobile fixed navigation — 가 기능 화면에 일관되게 확장되었는지를 비교한다.

## Full-view comparison evidence

Combined comparison에서 다음 공통 구조가 동일한 방향으로 유지된다.

- navy 상단 앱 바와 제품 식별·알림·사용자 진입점
- pale gray 업무 canvas와 white 업무 panel
- teal icon tile, active state, 상태 강조
- compact section header와 우측 count/action
- 한국어 업무 제목 아래 stable code·상태·메타 정보
- navy 하단 고정 주요 메뉴

기능 화면은 source 대시보드보다 상단 설명 영역을 짧게 유지하고, 실제 목록이 시작되는 지점을 앞당겼다. 목록 수가 증가해도 같은 row pattern이 이어지며 mobile/desktop에서 정보 순서가 바뀌지 않는다.

## Focused region evidence

- mobile header/navigation: source와 implementation 모두 navy shell, 흰색 product name, teal active navigation을 사용한다.
- collection rows: source 결재 대기 목록의 icon → title/code → state/action 계층을 implementation의 업무 목록에 동일하게 적용했다.
- desktop: `15-approvals-desktop-final.png`에서 고정 sidebar, 업무 context top bar, single-column enterprise work list, status chips가 clipping 없이 보인다.
- detail: `12-approval-detail-mobile.png`에서 핵심 사실, 봉인 결재선, 변경 불가 timeline, 가능한 동작이 별도 panel로 구분된다.

## Required fidelity surfaces

- fonts/typography: 기존 한국어 enterprise sans stack을 유지하고 page title, section title, record title, stable code, metadata를 5단계 계층으로 정리했다. 줄임표와 wrapping을 route별로 검증했다.
- spacing/layout rhythm: mobile 14px page gutter, 11px panel radius, 48px collection header, compact record row, 64px bottom navigation을 사용한다. desktop은 270px sidebar와 66px context top bar를 사용한다.
- colors/tokens: 승인된 navy/teal/white/gray token을 재사용한다. success, warning, danger metadata는 낮은 채도의 semantic surface와 border로 분리한다.
- image quality/assets: repository의 app icon을 유지하고 업무 icon은 Phosphor icon library만 사용한다. placeholder 그림, custom SVG, emoji, CSS 그림을 추가하지 않았다.
- copy/content: stable ID는 영속값을 바꾸지 않고 화면에서 한국어 label로 변환한다. preview record임을 명시하며 미구성 Command Adapter의 동작을 활성화하지 않는다.
- responsiveness: mobile `390 × 844`와 desktop `1440 × 900`에서 목록·상세·sidebar/topbar를 확인했다. horizontal overflow와 persistent control overlap이 없다.
- accessibility/interactions: semantic heading/list/dl/nav, 38–44px 주요 target, focus outline, `aria-label`, reduced motion을 유지한다.

## Comparison history

### Iteration 1 — blocked

- evidence: `02-projects-list.png`, `03-project-detail.png`, `04-approvals-list.png`, `05-contract-detail.png`, `06-safety.png`
- finding: `[P1]` 기능 화면이 큰 단일 hero와 작은 card 묶음으로 보여 대시보드의 업무 밀도·상태 비교·상세 진입 계층과 단절됐다.
- fix: 공통 collection header/count, domain icon, semantic state chip, detail affordance, fact grid, section panel, timeline/action pattern을 추가했다.

### Iteration 2 — blocked

- evidence: browser runtime overlay
- finding: `[P0]` Phosphor icon을 Server Component에서 직접 import해 React context runtime error가 발생했다.
- fix: icon rendering을 전용 Client Component `preview-icons.tsx`로 분리하고 server component에는 primitive props만 전달했다.
- post-fix evidence: `08-safety-after-fixed.png`, mobile console error `0`.

### Iteration 3 — blocked

- evidence: `11-approvals-desktop.png`
- finding: `[P1]` 기존 desktop 2-column record grid 규칙이 남아 metadata와 상세 action이 clipping됐다.
- fix: enterprise collection을 single-column row list로 고정하고 record 내부만 title/action과 metadata의 2영역으로 배치했다.
- post-fix evidence: `13-approvals-desktop-fixed.png`, `15-approvals-desktop-final.png`.

### Iteration 4 — passed

- evidence: `14-projects-mobile-final.png`, `15-approvals-desktop-final.png`, `16-feature-theme-comparison.png`
- result: actionable P0/P1/P2 mismatch 없음.

## Primary interactions and runtime checks

- PC sidebar `프로젝트·WBS` → `/projects`
- mobile bottom navigation `결재` → `/approvals`
- 결재 목록 `정식 연구과제 승격 신청 상세` → exact approval detail route
- fresh verification tab console error: `0`
- `pnpm check`: lint/typecheck, `534 passed / 157 skipped`, production build 통과

## Findings

- P0/P1/P2 actionable finding 없음.
- `[P3]` 실제 법인 logo가 제공되면 current app icon slot만 교체한다.
- `[P3]` 실제 dataset에서 장문 제목·10건 이상 목록·빈 목록 pagination은 Staging 운영 결합 때 추가 확인한다.

## Implementation checklist

- [x] 공통 기능 목록 pattern
- [x] 상세 facts/section/timeline/action pattern
- [x] 모바일 fixed navigation
- [x] PC sidebar/context top bar
- [x] semantic status tone와 한국어 display label
- [x] React server/client boundary
- [x] console/lint/typecheck/test/build

final result: passed
