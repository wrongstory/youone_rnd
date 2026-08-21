# Web Composition Boundary

This directory is the only web location that may assemble concrete request-safe adapters.

- PostgreSQL imports must use `@youone/infra-postgres/request`.
- Worker/service-role entries and credentials are forbidden.
- Route, Server Action, and UI code call Application use cases; they do not resolve repositories directly.
