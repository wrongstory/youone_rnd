# ADR-008: L3/L4 Controlled Copy Rendering and Custody

- Status: Accepted
- Date: 2026-08-21
- Decision IDs: `OD-011-L4-DELIVERY`, `OD-012-L3-DOWNLOAD-EXCEPTION`

## Context

L3/L4 source files cannot be downloaded or printed by recipients. External delivery is an internally generated, approved, numbered, watermarked paper copy with custody evidence.

## Decision

- A server-only `ControlledCopyRendererPort` renders from one exact approved DocumentVersion or attachment hash.
- Rendering requires an approved request: Lab Director for L3; Lab Director and one Representative for L4.
- Each output has an immutable copy number, classification, recipient/vendor, purpose, approval reference, issue timestamp, page count, renderer version, source hash, and output hash.
- The watermark is repeated on every page and contains at least classification, copy number, recipient, and purpose. Renderer changes are versioned.
- Output files stay in private storage and are delivered only to an authorized internal print operator through a short-lived server response. Vendor download and self-print endpoints do not exist.
- Print, handover, receipt, return, destruction, loss, and reprint are append-only custody events. Reprint creates a new copy number and reason.

## Consequences

Generic rendering is allowed before company forms arrive, but source fidelity, Korean font embedding, and printer behavior require fixture-based validation before production activation.

## Verification

- Approval matrix, exact-version, per-page watermark, unique copy number, hash, forbidden vendor response, reprint, and custody lifecycle tests.
