# Document records, identity and startup cache

Markdown/YAML document records are the permanent metadata source of truth. Indexes and caches exist only to accelerate access and must remain rebuildable.

## Document-record layer

`src/plugin/features/16-document-records.js` is the single owner of per-PDF metadata-record identity, persistence orchestration and RAM indexing. It consumes the canonical schema through a port and does not call back into DocumentInfo; lifecycle owns cross-feature refresh orchestration so the feature graph remains acyclic.

Permanent records are ordinary Markdown notes under `PDF Metadata/<first-two-UUID-hex>/<pdfmeta_id>.md`. The root remains a normal indexed vault folder so Obsidian properties and Bases can consume the records. Since 0.1.195, the root may be visually hidden from File Explorer by a presentation-only feature; it is not moved into a dot-folder or excluded from indexing. `.pdf-metadata/` remains reserved for hidden technical config and backup.

Each record has stable UUID v4 identity and canonical system properties `pdfmeta_type`, `pdfmeta_version`, `pdfmeta_id`, `pdfmeta_file`, and `pdfmeta_status`. `pdfmeta_file` is an Obsidian wikilink to the PDF. User metadata values use the schema properties directly. Markdown/YAML is source of truth; `state.documentRecords` is cache/index only.

The index has two canonical lookup directions: active unambiguous `byPdfPath` and unique `byId`. Duplicate active PDF-path bindings fail closed. Records are created lazily on first valid DocumentInfo save. Existing frontmatter updates use the `FileManager.processFrontMatter` platform adapter and are read back/validated before the index is replaced.

Vault lifecycle listeners are installed only after workspace layout readiness. PDF rename/move updates the existing record's `pdfmeta_file`. PDF deletion retains the metadata note and changes status to `missing`; it is not automatically rebound if a different PDF later appears at the same path. Manual record create/modify/rename/delete updates only the affected index entries.

## Canonical record-link identity

`pdfmeta_file` is a link representation, not a primary identity key. Obsidian may legitimately rewrite equivalent links between full-path and shortest-path forms.

Canonical runtime rule:

1. Physical Markdown/YAML remains source of truth for persisted record content.
2. Parse `pdfmeta_file` as an Obsidian linkpath.
3. Resolve it using Obsidian link semantics from the metadata record source path.
4. Use the resolved PDF `TFile.path` as the only `byPdfPath` identity key.
5. Direct vault-path lookup is fallback only when link resolution is unavailable/not-found.
6. If the PDF is missing, retain persisted path text so missing records remain inspectable.
7. Never create a second document identity merely because Obsidian changed wikilink representation.

This rule is orthogonal to PDF runtime identity (`PDF token`, `processId + routingId`) and does not alter viewer targeting.

## Document-record presentation visibility

`src/plugin/features/17-document-record-visibility.js` owns only File Explorer presentation. It toggles the `pdfium-hide-document-records` body class according to the plugin setting `hideDocumentMetadataFilesInExplorer` (default true). `styles.css` scopes the rule to the standard File Explorer and the exact `data-path="PDF Metadata"` folder.

This owner must never participate in record persistence, record identity, RAM indexing, metadata parsing or lifecycle mutation. Disabling the setting or unloading the plugin removes the body class. Therefore an Obsidian DOM change is deliberately fail-open: `PDF Metadata` can become visible again, but the underlying indexed Markdown records remain untouched.

## Missing-PDF / relink boundary

Deletion breaks reliable file continuity, so document identity must remain fail-closed after a PDF is deleted. `DocumentRecordsFeature` retains the record as `missing` and must never reactivate it merely because a later create event produces the same path or filename.

Move/rename inside the vault is different: Obsidian's rename event supplies both old and new path for the same file lifecycle event, so the existing record may be updated automatically while preserving `pdfmeta_id`.

Manual relink is the only supported transition from `missing` back to `active` in 0.1.198. The custom Bases register presents **Koble til PDF…**, but the view is not a write owner. It sends `(recordId, targetPdfPath)` through the explicit `relinkMissingDocumentRecord` operation. `DocumentRecordsFeature` verifies unique record ID, `missing` status, target PDF existence, and absence of another active record binding before writing via the canonical repository and read-back verification.

Relink preserves the record UUID and all user metadata. Only the PDF binding and status change. A conflicting target fails closed and leaves the missing record untouched.

## Disposable document-record index cache

The canonical persistent document metadata remains ordinary Markdown/YAML under `PDF Metadata/`. A performance cache may exist at:

```text
.pdf-metadata/document-record-index-cache.json
```

This cache is explicitly **not** source of truth and is not a compatibility format. It can be deleted or ignored without data loss.

Cache rules:

- current metadata schema is SHA-256 signed into the cache; mismatch invalidates the cache;
- record/cache contract version mismatch invalidates the cache;
- each entry is bound to canonical record path plus current `TFile.stat.mtime` and `TFile.stat.size`;
- mismatch/missing fingerprint => read and parse the physical Markdown record;
- cached record data never bypasses current Obsidian PDF-link resolution; `addDocumentRecordEntry` still resolves `pdfmeta_file` to canonical `TFile.path` on every RAM-index build;
- cache write/read failure is fail-open for performance and must not fail metadata indexing;
- cache entries are rebuilt/pruned from the current indexed Markdown file set.

This preserves the architectural rule: Markdown/YAML is permanent truth; RAM index and disk cache are rebuildable derived state.

## Idle-deferred startup ownership

DocumentRecords background startup is no longer started synchronously inside the layout-ready callback. Lifecycle schedules the owner through the browser idle scheduler after layout-ready. `ensureDocumentRecordIndexReady()` remains the only readiness gate and now uses one shared single-flight promise; an early user demand cancels the pending idle warmup and starts the same canonical rebuild immediately. There is no fixed/random startup delay. Markdown/YAML remains source of truth and the 0.1.201 cache format is unchanged.

## Startup gate ownership

DocumentRecords owns startup readiness. Lifecycle contributes two explicit signals through declared operation ports: `markDocumentRecordMetadataResolved()` and `markDocumentRecordLayoutReady()`. The metadata-resolved listener is registered early during plugin load; layout-ready is signaled from the existing workspace lifecycle callback. DocumentRecords schedules background warmup only after both latches are true, then uses the existing idle scheduler.

This is an orchestration optimization only. Persistent Markdown/YAML remains source of truth, the disposable cache contract is unchanged, and on-demand callers are never forced to wait for the background gate: they use the same canonical single-flight readiness promise immediately.

## Example-set isolation and bootstrap

The plugin ships a small canonical demonstration set under `docs/examples/` and copies the same set once into the user's Vault at `Examples-Obsidian-PDFium-Gate/`.

The example folder is deliberately outside `PDF Metadata/`. Example notes use valid record-shaped frontmatter and fixed sample UUIDs, but they are teaching/demo material and must never enter the production document-record index merely because they exist in the Vault. A native Obsidian Bases file in the example folder filters that folder directly and demonstrates that ordinary Markdown/YAML properties can be consumed without the PDFium Gate custom Bases view.

Bootstrap rules:

- bootstrap state is technical metadata stored at `.pdf-metadata/example-files-bootstrap.json`;
- the marker records an explicit example-set version;
- installation creates the example folder only when needed;
- an existing example file is always skipped and never overwritten;
- if creation is interrupted before the marker is written, a later run may fill only the still-missing files;
- once the current example-set version is marked installed, deleting or renaming the user-owned example folder does not cause it to be recreated on every startup;
- future example-set versions may add missing examples, but existing user-owned files remain untouched.

The example set is not a source of truth for production records, does not change document identity, and must not participate in record lifecycle events or indexing.
