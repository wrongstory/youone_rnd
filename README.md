# YouOne R&D

(주)유원산업기술 기업부설연구소의 모바일 우선 PWA 업무관리 시스템이다.

## Current delivery

- Phase: `IMPLEMENTATION_ACTIVE`
- Completed: `M00`/`M01` in PR #19, `M02` in PR #20, `M03` trusted Auth/RBAC/Scope in PR #21, `M04` common Approval Engine in PR #22, `M05` immutable Document/Template/File in PR #23, and `M06` Project/WBS in PR #24
- Active merge item: `M07` Vendor/Contract/Deliverable and exact Contract Scope
- Roadmap: <https://github.com/wrongstory/youone_rnd/issues/18>

## Local requirements

- Node.js 24.19.0 LTS
- pnpm 11.19.0

## Commands

```bash
pnpm install
pnpm dev
pnpm check
```

`apps/web` is the Next.js App Router interface/composition boundary. `apps/worker` is the isolated background-job entry point. Domain and Application packages must not import Next.js, React, Supabase, Storage, or browser SDKs.

The machine-readable P0 package inventory, layer, owner, and first delivery item live in `config/package-boundaries.json`. PostgreSQL migrations are global and ordered; request Auth and privileged service Auth use separate infrastructure exports.
