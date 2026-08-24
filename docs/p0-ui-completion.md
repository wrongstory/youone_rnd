# P0 화면 마감 및 운영 결합 준비

- 문서 ID: `P0-UI-COMPLETION-V1`
- 승인 근거: 2026-08-24 사용자 선택 모바일 시안 및 P0 화면 마감 지시
- GitHub: Issue `#53`
- 구현 순서: 모바일 우선 → 동일 정보구조의 PC 확장

## 1. 확정된 화면 구조

### 모바일

- 상단 앱 바: 제품 식별, 알림, 사용자 메뉴
- 하단 고정 메뉴: 대시보드, 결재, 프로젝트, 문서, 더보기
- 더보기: 업무영역별 계층형 전체 메뉴
- 대시보드: 개인 결재 대기, 작성 중 문서, 기한 초과, 오늘 할 일, 주요 프로젝트 진행, 최근 알림

### PC

- 모바일과 같은 메뉴 ID와 URL을 사용한다.
- 화면 폭 `1024px` 이상에서는 하단 메뉴 대신 왼쪽 고정 사이드바를 사용한다.
- 메뉴 노출은 편의를 위한 표현일 뿐 권한 판정이 아니다. Query/Command와 DB policy가 계속 권한을 강제한다.

### 결재 정보구조

```text
결재
├─ 내 결재함
├─ 상신한 결재
├─ 완료된 결재
└─ 결재 설정
```

결재 설정은 versioned ApprovalPolicy 조회를 먼저 제공한다. 실제 편집·게시 명령은 운영 ActorContext, 권한, 감사, Command Adapter가 결합되기 전까지 열지 않는다.

## 2. P0에서 구현하는 화면 마감

- 기존 P0 기능 목록·상세를 공통 앱 셸에 연결
- 화면 검토용 대시보드와 알림 샘플
- 상신한 결재, 완료된 결재, 결재 설정 조회 화면
- 한국어 상태 표시와 Asia/Seoul 시간 표현
- 로딩, 오류, 찾을 수 없음, 데이터 연결 대기 상태
- 온라인/오프라인 브라우저 상태 표시
- 모바일/PC 반응형 레이아웃과 키보드 포커스

## 3. 실제 운영 전에 아직 필요한 항목

다음은 화면만 꾸며서 완료로 처리할 수 없다. 실제 Staging 운영 결합 또는 후속 vertical slice가 필요하다.

### 인증·세션

- [ ] Supabase Auth 로그인 화면과 실제 오류 매핑
- [ ] INTERNAL/VENDOR TOTP `aal2` 등록·확인·복구 흐름
- [ ] 신규 device 재인증 및 managed-device 판정 화면
- [ ] 민감 action step-up, 세션 만료, single-session 충돌 안내
- [ ] global sign-out 및 요청별 `auth.sessions` 확인 결과 연결

### 실제 작성·변경

- [ ] Project 생성 및 정식 연구과제 별도 신청본 작성
- [ ] WBS 작성·담당·진행률 변경
- [ ] 결재 기안·의견·승인/반려/회송 Command Adapter 연결
- [ ] DocumentVersion 작성·첨부·새 버전 생성
- [ ] 계약·검수·NCR/CAR·ECR/ECO·구매·연구노트·안전의 승인된 입력 form 연결
- [ ] 통제사본 신청·내부 출력·인계·반납/파기 명령 연결

### 운영 사용자 경험

- [ ] 실제 UserAccount 표시명·Position·Role 결합
- [ ] Notification Outbox의 읽음·딥링크·재시도 연결
- [ ] 권한 없음과 Scope 상실의 서버 reason code별 안전한 안내
- [ ] 감사로그 조회 권한과 마스킹된 운영 화면
- [ ] 실제 빈 목록, 페이지네이션, 정렬, 필터 query 연결
- [ ] 법인 로고와 실제 회사 양식 업로드 후 브랜드·출력 레이아웃 교체

## 4. P0에서 제외하는 화면

- P1 BOM, 연구장비·교정, 연구수당, 통합검색
- P2 특허/IP, 하이웍스·외부시스템
- 미승인 고급 KPI, 재무예측, 전사 순위·평가 차트

## 5. Release Gate 영향

Issue `#53` 병합 뒤 이전 Staging evidence를 재사용하지 않는다. 운영 결합은 새 exact `dev` merge SHA를 고정한 뒤 수행하며, 정확히 27개 artifact와 R06 `READY_FOR_RELEASE_PR` 전까지 Issue `#36`을 닫지 않는다.

## 6. 기능 화면 엔터프라이즈 마감

- GitHub: Issue `#55`
- 기준 시안: 승인된 모바일 대시보드의 navy shell, teal accent, compact 업무 카드, 고정 주요 탐색
- 모든 P0 목록 화면은 동일한 업무 목록 header, 실제 건수, 도메인 icon, 한국어 표시명, 상태 tone, 상세 진입점을 사용한다.
- 모든 P0 상세 화면은 핵심 사실, 하위 업무, 상태·결재 이력, 정책 안내, 허용된 동작을 별도 업무 panel로 구분한다.
- PC는 모바일과 같은 route/navigation ID를 사용하면서 고정 sidebar와 업무 context top bar를 제공한다.
- Command Adapter가 없거나 권한 판정이 완료되지 않은 동작은 계속 비활성 또는 미노출한다. 화면 마감은 권한·상태·감사 Gate를 우회하지 않는다.
- 영속 stable ID는 변경하지 않고 화면 표시만 한국어 label로 변환한다.

## 7. 화면 전환과 오버레이 기준

- 사용자 승인: 2026-08-24
- 알림은 현재 화면을 유지한 채 PC 팝오버·모바일 바텀시트로 최근 3건을 확인하고, 전체 이력은 `/notifications`에서 조회한다.
- 사용자 메뉴와 동기화 상태도 PC 팝오버·모바일 바텀시트로 제공한다. 동기화 충돌의 실제 검토·해결은 `/offline-sync` 정식 화면에서 수행한다.
- 목록의 `빠른 보기`는 허용된 목록 projection만 사용한다. PC는 우측 drawer, 모바일은 전체 화면 sheet이며 민감 원문·권한 밖 필드를 추가 조회하지 않는다.
- 확인·의견·사유 입력은 modal 패턴을 사용한다. 실제 Command Adapter와 최신 ActorContext·상태·버전·감사 경계가 없으면 최종 실행은 비활성 상태를 유지한다.
- 다단계 기안·결재설정·계약·검수·복구·충돌 해결 등 복잡한 업무는 독립 페이지를 유지한다.
- 필터와 정렬은 별도 popover로 숨기지 않고 목록 상단의 compact inline toolbar로 테마에 통합한다. 실제 query adapter가 없는 필터 결과를 화면에서 추정하지 않는다.

## 8. 운영 Frontend 전환

- GitHub: Issue `#59`
- Backend 계약: Issue `#58`
- 로그인, TOTP 등록·challenge, 계정 복구, 세션 만료 화면은 공통 앱 셸과 분리된 public entry route로 제공한다.
- 시스템 관리에는 사용자, 외주 계정, 조직·직책, 역할·권한 현황, 세션·MFA, 마스킹된 감사 로그를 둔다.
- 프로젝트는 생성 화면과 개요/WBS/구성원/Product·R&D 연결/문서·결재/변경 이력/설정 작업공간을 제공한다.
- 정식 연구과제는 Project 직접 flag가 아니라 별도 immutable application 화면에서 작성하며 연구소장 검토·동의 후 designation으로 표시한다.
- Issue `#58`이 실제 DTO/Command/Query/Auth를 제공하기 전에는 입력 형식·화면 검토까지만 허용하고 저장·인증·봉인 성공을 표현하지 않는다.
- 실제 Backend 연결 전까지 위 3절의 운영 체크리스트는 완료 처리하지 않는다.
- 이 변경 병합 뒤 기존 Staging evidence는 폐기하고 새 exact `dev` merge SHA로 #36 증거를 다시 생성한다.
