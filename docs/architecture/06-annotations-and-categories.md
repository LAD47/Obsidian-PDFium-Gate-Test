# Annotations, categories and backup

This document collects annotation invariants, category ownership/inheritance rules and the PDF backup contract.

## Selection and annotation invariants

- `/Artifact` is authoritative for reconstruction.
- INTERNAL = raw range / identity / physical geometry.
- OUTWARD = user-facing copy/display text.
- Header/footer filtering must never decide INTERNAL identity.
- `focusPos` is textual truth for keyboard selection.
- `selectionHint` is physical glyph/page/line truth.
- Category highlights are written physically to the PDF.
- Main Bridge native PDF page point: X left-origin, Y bottom-origin.
- EmbedPDF annotation rectangle: top-origin.
- Y conversion occurs exactly once; never “try both axes”.

## Category inheritance ownership and editor navigation

Category inheritance remains folder-scoped. The five code-defined category defaults are factory/bootstrap data only. At plugin startup, a missing vault-root `.pdf-metadata/highlight-categories.yaml` is created from those defaults with `inherit: false`; runtime effective categories are then merged only from physical root/ancestor/local `highlight-categories.yaml` owners according to the existing `inherit` contract.

The category editor now keeps **per-category provenance** for inherited categories:

- the nearest ancestor configuration containing a local row with the category ID is the editable owner for that inherited category;
- different inherited categories may have different owners;
- the inherited list and detail page show the actual owner level;
- **Rediger overordnet…** switches the existing editor to that owner folder and opens the owning local category directly;
- unsaved local edits must be explicitly discarded before switching scope;
- factory defaults are never exposed as a runtime owner; the physical vault-root file is the global editable owner.

This is an editor/navigation enhancement only; merge semantics and category inheritance behavior are unchanged.

## Backup invariant

Backup path:

`.pdfium-backup/<same filename>.pdf`

- existing backup is never overwritten;
- backup can be disabled;
- old `*-original.pdf` names are ordinary PDFs.

Persisted-format migration/backward compatibility remains a separate pre-public-release review.

## Category editor ownership + identity UX

Inherited category provenance remains per-category and nearest-owner-wins, and every runtime owner is physical. Factory defaults only bootstrap the vault-root `.pdf-metadata/highlight-categories.yaml` when that file is missing; they are not a permanent fallback source. The editor exposes **Rediger overordnet…** for inherited categories and navigates to the exact owning folder, including vault root. Category creation is level-aware and remains visible even from an existing category detail page: vault root exposes **+ Ny global kategori** and folder scopes expose **+ Ny kategori på dette nivået**. Root scope has no inheritance toggle because it is the top-level owner.

Category `id` is a permanent technical identity, not an editable label. Canonical IDs are UUID v4. The five factory categories have fixed UUIDs; every user-created category gets a fresh random UUID through the canonical generator. The editor exposes the UUID read-only with copy support. Category name, color, shortcut and enabled state remain user-editable. A legacy semantic/sequential ID such as `economy` or `category-1` is intentionally non-canonical in the current test phase and is rejected by validation rather than silently migrated.
