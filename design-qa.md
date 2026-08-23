# Design QA — P0 모바일 대시보드 및 앱 셸

- source visual truth: `C:\Users\Admin\.codex\generated_images\01a02127-6e10-7423-a5ea-29d5e5987bf8\exec-4ba09d6c-1b8a-4cc2-bd6d-94cd481f5e8e.png`
- implementation URL: `http://localhost:3000/`
- final implementation screenshot: `C:\Users\Admin\AppData\Local\Temp\youone-product-design-audit\12-mobile-dashboard-final-density.png`
- final combined comparison: `C:\Users\Admin\AppData\Local\Temp\youone-product-design-audit\13-dashboard-comparison-passed.png`
- viewport/state: mobile `390 × 844` CSS px, light theme, preview-data enabled, online, dashboard route
- source pixels: `853 × 1844` (`390 × 844`로 bicubic 정규화, 약 `2.187×` density)
- implementation pixels: `390 × 844`, CSS `390 × 844`, density `1×`

## Full-view comparison evidence

최종 combined comparison에서 다음 핵심 구성이 같은 순서와 밀도로 보인다.

- 짙은 navy 상단 앱 바와 제품 식별·알림·사용자 진입점
- 대시보드 제목·인사·날짜와 얇은 시스템 상태 행
- 한 행의 4개 개인 업무 수치
- 2개의 결재 대기 행
- 2개의 프로젝트 진행률 행
- 3개의 최근 업데이트 행
- 짙은 navy 하단 5개 주요 메뉴

초기 구현보다 카드 높이, 섹션 간격, 제목 계층, 하단 메뉴 색상을 source에 맞춰 보정했고 최종 화면은 스크롤 없이 `390 × 844`에 핵심 정보 전체가 들어온다.

## Focused region evidence

별도 crop 비교는 필요하지 않았다. `790 × 844` combined image에서 상단 브랜드, 4개 수치, 결재 badge·상태, progress bar, 최근 업데이트, 하단 메뉴의 텍스트와 icon이 모두 판독 가능한 크기였다. 계층형 drawer는 별도 브라우저 화면에서 열어 결재 하위 메뉴와 전체 업무 그룹을 확인했다.

## Required fidelity surfaces

- fonts/typography: 한국어 enterprise sans 계열, 제목/본문/보조문구의 weight와 크기 계층을 source와 동일한 방향으로 정리했다. raw stable ID 대신 한국어 표시명을 사용한다.
- spacing/layout rhythm: 52px 앱 바, 단일 행 metric, 얇은 divider, compact list, 64px 하단 메뉴로 source의 높은 정보밀도를 재현했다. `390 × 844`에서 overlap/clip이 없다.
- colors/tokens: navy shell, teal active/accent, white surface, pale gray canvas, semantic danger/success 색을 일관된 CSS token으로 사용한다. 텍스트 대비와 focus outline을 유지한다.
- image quality/assets: repository에 이미 존재하는 `/icons/app-icon.svg`를 제품 mark로 사용했고 임시 CSS/HTML 그림을 만들지 않았다. 업무 icon은 Phosphor icon library로 통일했다.
- copy/content: 승인된 P0 도메인 용어와 실제 preview record를 사용한다. 데모임을 명시하고 미구성 live adapter에서 수치나 권한을 추정하지 않는다.
- responsiveness: 모바일 하단 메뉴·drawer와 PC 고정 sidebar가 동일 navigation source를 공유한다. `1440 × 900`에서 sidebar/2-column dashboard, `390 × 844`에서 모바일 dashboard를 검증했다.
- accessibility/interactions: semantic nav/section/heading, 42px 이상 주요 tap target, keyboard focus, reduced motion, drawer expanded state와 닫기, online/offline live status를 확인했다.

## Comparison history

### Iteration 1 — blocked

- evidence: `06-dashboard-comparison.png`
- finding: `[P0]` 기존 개발 Service Worker가 `_next/static`을 cache-first로 유지해 변경된 client chunk 대신 stale chunk를 제공했고 runtime error 화면이 나타났다.
- fix: 개발환경에서 registration/cache를 정리하고, production Service Worker를 `v2`로 올리며 Next static asset을 network-first/cache-fallback으로 변경했다.
- post-fix evidence: `08-dashboard-comparison-fixed.png`에서 runtime error가 사라졌다.

### Iteration 2 — blocked

- evidence: `08-dashboard-comparison-fixed.png`
- finding: `[P2]` 68px 앱 바, 2×2 metric, 큰 card/shadow, 흰 하단 메뉴로 source보다 above-the-fold 정보량이 크게 줄었다.
- fix: 52px 앱 바, 한 행 4개 metric, compact enterprise card/list, navy 하단 메뉴로 조정했다.
- post-fix evidence: `11-dashboard-comparison-final.png`에서 큰 비율 차이를 해소했다.

### Iteration 3 — blocked

- evidence: `11-dashboard-comparison-final.png`
- finding: `[P2]` 중복 eyebrow와 남은 수직 여백 때문에 최근 업데이트 전체가 첫 화면에 들어오지 않았다.
- fix: 모바일 section heading을 한 줄로 단순화하고 metric/list padding과 vertical rhythm을 추가 보정했다.
- post-fix evidence: `13-dashboard-comparison-passed.png`에서 핵심 4개 영역과 하단 메뉴가 모두 `390 × 844` 안에 보인다.

## Primary interactions and runtime checks

- 모바일 하단 `결재` → `/approvals`
- 모바일 `더보기` drawer 열기/닫기
- drawer `결재 설정` → `/settings/approval`
- PC `>= 1024px` 고정 sidebar와 모바일 하단 메뉴 상호 전환
- 새 브라우저 탭 최종 load의 console error: `0`
- `pnpm check`: lint/typecheck, `533 passed / 157 skipped`, production build 통과

## Findings

- P0/P1/P2 actionable finding 없음.
- `[P3]` concept source의 임시 mark 대신 repository의 기존 app icon을 사용한다. 실제 법인 logo가 업로드되면 동일 slot asset만 교체한다.

## Implementation checklist

- [x] 모바일 dashboard fidelity
- [x] 계층형 drawer 동작
- [x] PC sidebar responsive 전환
- [x] stale PWA asset 방지
- [x] console error 확인
- [x] lint/typecheck/test/build

final result: passed
