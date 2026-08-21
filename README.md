# YouOne R&D

(주)유원산업기술 기업부설연구소의 모바일 우선 PWA 업무관리 시스템이다.

## Current delivery

- Phase: `IMPLEMENTATION_ACTIVE`
- Completed: `M00` architecture decisions and `M01` scaffold in PR #19
- Active merge item: CI-verified `M02` database/audit kernel
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

The machine-readable P0 package inventory, layer, owner, and first delivery item live in `config/package-boundaries.json`. M01 packages intentionally contain public-contract shells only; database migrations and Supabase integration begin in M02.
