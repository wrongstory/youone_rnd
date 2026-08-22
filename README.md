# YouOne R&D

(주)유원산업기술 기업부설연구소의 모바일 우선 PWA 업무관리 시스템이다.

## Current delivery

- Phase: `IMPLEMENTATION_ACTIVE`
- Completed: `M00`/`M01` in PR #19, `M02` in PR #20, `M03` trusted Auth/RBAC/Scope in PR #21, `M04` common Approval Engine in PR #22, `M05` immutable Document/Template/File in PR #23, `M06` Project/WBS in PR #24, `M07` Vendor/Contract/Deliverable in PR #25, `M08` Requirement/Test/Inspection in PR #26, `M09` NCR/CAR in PR #27, `M10` ECR/ECO in PR #29, `M11` Purchase/R&D in PR #30, and `M12` ResearchNote in PR #31 (`dev`)
- Active merge item: `M13` Safety Light assignment, inspection, training, and incident investigation
- Roadmap: <https://github.com/wrongstory/youone_rnd/issues/18>

## Branch model

- `dev` is the default integration branch. Create feature and fix branches from `dev` and target their pull requests to `dev`.
- `main` contains release versions only. Promote a reviewed release from `dev` to `main` with a dedicated release pull request.
- Do not merge an ordinary feature branch directly into `main`.

## Local requirements

- Node.js 24.19.0 LTS
- pnpm 11.19.0

## Commands

```bash
pnpm install
pnpm dev
pnpm check
```

화면 검토용 샘플 데이터는 서버 전용 `YOUONE_PREVIEW_DATA=enabled`일 때만 표시된다. `apps/web/.env.local`에서 로컬 검토 모드를 켤 수 있으며, 모든 샘플 화면에는 `데모 데이터` 안내가 표시된다. 이 플래그가 없으면 기존처럼 조회 어댑터가 fail-closed `UNAVAILABLE`을 반환한다. 실제 운영 환경에서는 활성화하지 않는다.

`apps/web` is the Next.js App Router interface/composition boundary. `apps/worker` is the isolated background-job entry point. Domain and Application packages must not import Next.js, React, Supabase, Storage, or browser SDKs.

The machine-readable P0 package inventory, layer, owner, and first delivery item live in `config/package-boundaries.json`. PostgreSQL migrations are global and ordered; request Auth and privileged service Auth use separate infrastructure exports.
