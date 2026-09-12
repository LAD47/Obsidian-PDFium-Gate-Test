# Metadata schema and hidden configuration storage

This document defines the editable metadata schema, hidden technical configuration storage and safe-write ownership.

## Metadata schema + hidden storage product layer

The first product slice adds a new renderer/plugin owner, `metadataSchema`, without altering the established PDF identity, RuntimeDriver, selection, annotation or bridge contracts.

Persistent schema source-of-truth is `.pdf-metadata/document-metadata-schema.json`. It is open JSON inside the vault. Because the path is hidden from normal Obsidian indexing, schema I/O is owned by `src/platform/obsidian-adapter-file-store.js` over `vault.adapter`; the schema repository does not depend on indexed `TFile` objects. The active in-memory copy is cache/state only.

Hidden PDF-related configuration uses one canonical folder name: `.pdf-metadata`. Highlight categories use `.pdf-metadata/highlight-categories.yaml` at vault root and `<folder>/.pdf-metadata/highlight-categories.yaml` for folder-scoped overrides. The existing nearest-parent category inheritance model is preserved. The former `.pdf-markering/config.yaml` test layout is not part of the canonical runtime.

Schema and category writes go through `src/core/safe-config-file-write.js`: validate before touching the current file, backup only when existing content actually changes, write the already-read previous bytes through the same file-store write path and prove the backup exists/round-trips exactly before canonical mutation, validate a temporary write by read-back, replace through rename, and restore the previous canonical file if replacement fails. Schema backups live in `.pdf-metadata/backup/document-metadata-schema/`; category backups live in the corresponding `<folder>/.pdf-metadata/backup/highlight-categories/` scope.

Schema field identity has three separate concerns:

- stable UUID v4 `id`;
- stable English technical `property`;
- editable user-facing `label`.

System metadata will use the reserved `pdfmeta_*` namespace. User properties must match `^[a-z][a-z0-9_]{0,63}$` and may not collide with reserved Obsidian/Bases names declared by the schema contract.

v1 field types are text, date, time, integer, decimal, boolean, select, multiselect and link. Canonical persistence is locale-independent. `date` uses `YYYY-MM-DD`; time-only uses `HH:mm` or `HH:mm:ss` without timezone. Regional presentation/input preferences are plugin settings, not schema semantics.

`src/metadata/schema-contract.js` owns the data contract and pure validation. `src/metadata/schema-repository.js` owns schema persistence through the Adapter file-store boundary. `src/plugin/features/14-metadata-schema.js` owns active schema state and mutations. `src/main/metadata-schema-modal.js` owns field administration; `src/main/settings.js` exposes only compact global metadata/regional settings.

0.1.192 adds the separate indexed document-record layer described below. It consumes this schema rather than duplicating field definitions; hidden `.pdf-metadata` remains technical configuration only.

## Canonical factory defaults

Factory-created persistent defaults are canonical English and are not i18n-owned UI text. The standard schema contains nine fields: `document_date`, `document_time`, `sender`, `document_type`, `response_received`, `response_received_date`, `response_sent`, `response_sent_date`, and `response_sent_link`. Labels remain freely user-editable after creation; stable field UUIDs, properties and select machine values do not change when labels change.
