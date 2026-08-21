# ADR-005: Editor Schema and Rendering Versions

- Status: Accepted
- Date: 2026-08-21
- Decision IDs: `ARC-006-IMMUTABLE-EVIDENCE`

## Context

Tiptap content must remain renderable and auditable after extensions and templates change. Company-specific print layouts are not yet available.

## Decision

- Store editor content as validated Tiptap JSON with `editor_schema_version`, `renderer_version`, and template version.
- Start with a conservative node/mark allowlist; reject raw HTML, executable embeds, unregistered extensions, and unknown schema versions.
- Migrations between editor schema versions create a new DocumentVersion and never rewrite approved content.
- Render generic evidence/PDF output until actual company forms are supplied. Do not infer pagination or signature geometry.
- Store the canonical content hash and renderer metadata with every sealed/approved output.

## Consequences

Schema evolution needs explicit converters and fixtures. Rich editing remains possible without making the latest editor code the only way to interpret historical evidence.

## Verification

- Schema validation, unsupported-node rejection, deterministic render fixture, and historical-version rendering tests.
