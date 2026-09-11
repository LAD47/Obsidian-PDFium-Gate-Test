# PDFium Gate — canonical architecture + metadata/category product layer (through 0.1.211)

## 1. Supported runtime

PDFium Gate supports one runtime contract:

**Obsidian 1.13.7 + Electron 43.x + embedded PDF frame**

Older Obsidian/Electron hosting models are not production fallbacks. Unsupported runtime/hosting shapes fail closed.

## 2. Source of truth and release artifacts

`src/` is authoritative. Generated release runtime is intentionally small:

- `main.js` — renderer/Obsidian bundle;
- `main-bridge.js` — Electron-main bundle;
- `manifest.json`;
- `styles.css`.

Runtime does not use project-relative `require('./...')` / `require('../...')`.

`scripts/source-bundle.js` is the single composition contract used by build and verify. Root `main-bridge.js` and the Main Bridge embedded in `main.js` must represent the same generated source.

## 3. Source modules, ownership and dependency direction

### Renderer / Obsidian plugin

Canonical feature modules live under `src/plugin/features/`:

1. `01-lifecycle.js` — plugin install/uninstall and top-level lifecycle orchestration;
2. `02-renderer-bridge.js` — Main Bridge → renderer event listener/wiring boundary;
3. `03-diagnostics.js` — diagnostic/reporting behavior only;
4. `04-category-config.js` — category configuration and inheritance;
5. `05-context-menu.js` — renderer-side context inspection/menu actions;
6. `06-selection-links.js` — outward selection-link/copy creation;
7. `07-main-bridge-routing.js` — renderer handlers for bridge production events and direct Main Bridge calls;
8. `08-link-locator.js` — locator restore/navigation;
9. `09-annotator-host.js` — annotator iframe/request transport, PDF-buffer/backup host operations;
10. `10-selection-bridge.js` — keyboard/native-copy/selection bridge workflow;
11. `11-annotation-io.js` — thin annotation request wrappers;
12. `12-selection-diagnostics.js` — selection-specific diagnostic operations;
13. `13-category-mutation.js` — category write/change/remove workflow.

`src/plugin/plugin-composition.js` is the composition root.

Feature implementations do not address peer feature IDs. Cross-feature work uses root-bound operation ports:

**feature → `this.ports.<operation>()` → composition-root binding → one canonical method owner**

`src/plugin/feature-contracts.js` declares, for every feature:

- source file/class owner;
- operation ports used;
- renderer state domains accessed;
- exact mutable state fields owned by that feature.

Verify rejects undeclared ports, hidden direct cross-feature calls, duplicate providers, undeclared state access and multiple writers. The implementation dependency graph is acyclic by construction because feature modules depend on ports, not peer implementations.

`src/plugin/plugin-state.js` owns the renderer state shape. Teardown is orchestrated by lifecycle, but each feature mutates/clears its own state through its canonical cleanup method.

### Electron Main Bridge

Canonical Main Bridge features live under `src/main-bridge/features/`:

1. `01-kernel.js` — basic target classification, descriptions and exact embedded-target primitives;
2. `02-identity-locator.js` — active identity publication and locator resolution;
3. `03-context-menu.js` — native context-menu ownership;
4. `04-selection-capture.js` — mouse/selection/gesture/viewer-state capture;
5. `05-selection-operations.js` — selection lifecycle, copy and locator operations;
6. `06-input-router.js` — keyboard/input routing;
7. `07-wrapper-lifecycle.js` — physical wrapper lifecycle, delayed `<embed>` readiness and pointer/autoscroll instrumentation;
8. `08-lifecycle.js` — install/uninstall, shortcuts and capability/state surface.

`src/main-bridge/composition.js` is the composition root and owns the shared runtime object.

Cross-feature work uses root-bound operation ports:

**feature → `__bridgeRuntime.ports.<operation>()` → composition-root binding → one canonical method owner**

`src/main-bridge/feature-contracts.js` declares feature owner, operation ports, state fields accessed and exactly one mutation owner for every Main Bridge state field.

Nested callbacks/getters use the lexical `__bridgeRuntime` host reference; they must not depend on dynamic `this` binding.

Verify rejects peer-feature addressing, hidden direct cross-feature calls, duplicate providers, undeclared port/state use and multiple writers. The implementation dependency graph is acyclic because features depend on ports rather than peer implementations.

### Annotator

The generated annotator HTML is composed from:

- `src/annotator/shell-before.html`;
- `src/bridge/annotator-messages.js`;
- `src/annotator/runtime-helpers.js`;
- `src/annotator/handler-shared.js`;
- three keyboard navigation algorithm modules under `src/annotator/keyboard/`;
- 10 request handlers under `src/annotator/handlers/`;
- `src/annotator/runtime-message-dispatch.js`;
- `src/annotator/shell-after.html`.

`src/annotator/handler-contracts.js` declares one request type → one handler owner and exact allowed `deps.*` helper dependencies.

The dispatch module owns the single message listener, creates request `ctx`, opens/closes the document boundary and calls exactly one handler. Handlers use `ctx.*` for request/document/runtime state and `deps.*` for shared helpers.

`keyboard-expand-selection` remains the only request owner and retains selection identity, anchor/focus, protected-seed/reversal and finalization semantics. Physical navigation has three explicit algorithm owners:

- `keyboard/line-navigation.js` — line/page-boundary movement and Home/End;
- `keyboard/viewport-navigation.js` — PageUp/PageDown viewport navigation;
- `keyboard/word-navigation.js` — word/punctuation navigation.

The algorithm modules receive explicit inputs and cannot own transport/request listeners. Verify also prevents the request handler from silently reabsorbing their algorithms.

## 4. Shared production dataflow

### Main Bridge → renderer

Production asynchronous communication is event-driven:

**Main Bridge feature → `rendererEventDispatchAdapter` → validated CustomEvent → `src/plugin/features/02-renderer-bridge.js` → root-bound renderer operation port → exact owner**

`src/bridge/renderer-events.js` owns the eight production event names and payload validation.

There is exactly one physical CustomEvent injection implementation: `src/platform/renderer-event-dispatch.js`.

Diagnostics may fetch Main Bridge state on demand, but diagnostic sequence/state fields must never drive production routing.

### Renderer → annotator

Renderer annotator communication is request-driven:

**feature caller → root-bound operation port → `src/plugin/features/09-annotator-host.js::sendAnnotatorRequest(...)` → `src/bridge/annotator-messages.js` → one `postMessage` route → `runtime-message-dispatch.js` → exact handler**

`sendAnnotatorRequest(...)` owns request IDs, pending promises, timeout policy, PDF-buffer transfer and expected-result validation.

Feature files must not create parallel request maps or `postMessage` transports.

## 5. PDF identity

Identity has two layers:

- **PDF token** = logical document identity;
- **`processId + routingId`** = physical Electron/Chromium frame identity.

Rules:

1. Never use WebContents title as PDF identity.
2. Never use JavaScript object-reference equality as physical identity.
3. Never choose the first matching token/frame/window.
4. A token-like HTTP frame is not automatically the Chromium PDF wrapper.
5. Verify the wrapper with physical identity/readiness when required.
6. Ambiguity fails closed.
7. `focusedFrame` is used only when physical focus is part of the contract.
8. State freshness/gesture recency can validate state but never choose physical identity.

Canonical sources: `src/platform/pdf-embedded-target.js`, `src/platform/pdf-wrapper-frame.js`, `src/platform/IDENTITY_POLICY.md`.

## 6. RuntimeDriver boundary

`ChromiumPdfRuntimeDriver` is the only production owner of Chromium viewer DOM/viewport/scroller primitives:

- `pdf-viewer`;
- `viewer.viewport`;
- `#scroller`;
- page-screen geometry;
- page-point conversion;
- keyboard viewport state;
- keyboard/locator overlays;
- keyboard/locator wrapper scrolling;
- viewport capture used around PDF mutation/reload.

Viewer identity is:

**verified wrapper → physical parent chain → nearest capability-verified Chromium `pdf-viewer` ancestor**

No global viewer scan and no wrapper fallback when viewer identity cannot be proven.

## 7. PDF runtime lifecycle

Runtime registration and active PDF identity are separate contracts.

- Main Bridge reconciles wrappers that already exist when it installs.
- Owner WebContents use Electron `frame-created` and `did-frame-navigate` lifecycle events.
- Renderer iframe load/layout readiness reconciles open PDF leaves.
- Registration is idempotent and keyed by physical owner + `processId + routingId`.
- Duplicate/stale wrappers may all be instrumented because instrumentation does not select identity.
- Active identity remains separate and fail-closed.

Wrapper frame existence and wrapper DOM readiness are separate. If a physical wrapper exists before Chromium inserts `<embed>`, an idempotent wrapper-local `MutationObserver` waits for readiness and installs pointer/runtime instrumentation when `<embed>` appears.

No arbitrary startup-delay is used as the readiness mechanism.

## 8. Renderer ↔ Electron-main loading boundary

Renderer calls explicit Main Bridge methods through `MainProcessTransport` when a command requires a direct return value.

`electron.remote.require(exactPath)` is retained only inside `src/platform/electron-remote-require.js` as the current renderer→Electron-main loading adapter. It is not PDF hosting, identity or owner selection.

## 9. Selection and annotation invariants

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

## 10. Category inheritance ownership and editor navigation

Category inheritance remains folder-scoped. The five code-defined category defaults are factory/bootstrap data only. At plugin startup, a missing vault-root `.pdf-metadata/highlight-categories.yaml` is created from those defaults with `inherit: false`; runtime effective categories are then merged only from physical root/ancestor/local `highlight-categories.yaml` owners according to the existing `inherit` contract.

The category editor now keeps **per-category provenance** for inherited categories:

- the nearest ancestor configuration containing a local row with the category ID is the editable owner for that inherited category;
- different inherited categories may have different owners;
- the inherited list and detail page show the actual owner level;
- **Rediger overordnet…** switches the existing editor to that owner folder and opens the owning local category directly;
- unsaved local edits must be explicitly discarded before switching scope;
- factory defaults are never exposed as a runtime owner; the physical vault-root file is the global editable owner.

This is an editor/navigation enhancement only; merge semantics and category inheritance behavior are unchanged.

## 11. Backup invariant

Backup path:

`.pdfium-backup/<same filename>.pdf`

- existing backup is never overwritten;
- backup can be disabled;
- old `*-original.pdf` names are ordinary PDFs.

Persisted-format migration/backward compatibility remains a separate pre-public-release review.

## 12. Verify philosophy and architecture completion

`scripts/verify/contracts/` is organized by architectural/runtime contracts.

Important gates include:

- structure/source-of-truth;
- runtime input routing;
- selection/output behavior;
- RuntimeDriver ownership and coordinate contracts;
- identity/locator fail-closed behavior;
- deterministic release build/root-only load;
- startup/restored-wrapper lifecycle simulation;
- explicit production dataflow and single annotator transport;
- renderer feature/port/state ownership;
- Main Bridge feature/port/state ownership;
- annotator request-handler/dependency ownership;
- final architecture-completion gate.

When behavior can be tested through input → output/runtime simulation, prefer that over brittle source-text matching. Source-text gates remain appropriate for forbidden architecture patterns and single-owner invariants.

`11-architecture-completion.js` makes the structural target machine-enforced. It requires simultaneously:

- renderer hidden cross-feature calls = 0;
- renderer shared mutable-state writers = 0;
- renderer implementation dependency cycles = 0;
- Main Bridge hidden cross-feature calls = 0;
- Main Bridge shared state writers = 0;
- Main Bridge implementation dependency cycles = 0;
- annotator hidden cross-handler calls = 0;
- annotator runtime transport listener owners = 1;
- keyboard navigation algorithm modules = 3;
- keyboard request handler remains below its architecture regression ceiling.

## 12. Architecture stability policy

The foundational architecture reached its intended target in 0.1.180 and was explicitly user-regression-tested with A–F working perfectly. From this point, architecture stability is a product requirement, not an invitation for continued structural cleanup.

Normal future work should add behavior through the existing canonical owners, root-bound operation ports, single-writer state ownership, RuntimeDriver boundary, annotator request ownership and explicit bridge contracts. Do not refactor foundational architecture merely for aesthetics, smaller files, speculative abstraction, or because another organization could also work.

A foundational architecture change is permitted only when driven by a concrete need:

- a product feature cannot be implemented cleanly within current contracts;
- a demonstrated bug class proves that an ownership/identity/lifecycle/state/transport contract is wrong or incomplete;
- a required Obsidian/Electron/Chromium platform change invalidates an existing contract.

For any such change, first audit the full bug/assumption class and canonical owner, keep one canonical route, avoid parallel fallbacks, preserve fail-closed identity and established selection/coordinate semantics unless explicitly required, and extend verify so the revised contract is machine-enforced.

## 12.1 Category editor ownership + identity UX (0.1.190)

Inherited category provenance remains per-category and nearest-owner-wins, and every runtime owner is physical. Factory defaults only bootstrap the vault-root `.pdf-metadata/highlight-categories.yaml` when that file is missing; they are not a permanent fallback source. The editor exposes **Rediger overordnet…** for inherited categories and navigates to the exact owning folder, including vault root. Category creation is level-aware and remains visible even from an existing category detail page: vault root exposes **+ Ny global kategori** and folder scopes expose **+ Ny kategori på dette nivået**. Root scope has no inheritance toggle because it is the top-level owner.

Category `id` is a permanent technical identity, not an editable label. Canonical IDs are UUID v4. The five factory categories have fixed UUIDs; every user-created category gets a fresh random UUID through the canonical generator. The editor exposes the UUID read-only with copy support. Category name, color, shortcut and enabled state remain user-editable. A legacy semantic/sequential ID such as `economy` or `category-1` is intentionally non-canonical in the current test phase and is rejected by validation rather than silently migrated.

## 13. Metadata schema + hidden storage product layer (0.1.190)

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

## 14. Baseline status

**0.1.180 is the authoritative user-confirmed working / architectural / rollback runtime baseline.**

0.1.181 is documentation/governance-only. 0.1.183 is the user-confirmed hidden-schema-path / dedicated-manager build. 0.1.190 is the user-confirmed permanent-category-UUID / owner-level creation build. 0.1.191 is the latest user-confirmed DocumentInfo UX baseline (A–G); 0.1.194 is the user-confirmed permanent-record/canonical-wikilink product baseline. 0.1.195 is the user-confirmed presentation-only File Explorer visibility + Bases indexing baseline. Foundational runtime rollback remains 0.1.180.

## 14. DocumentInfo vertical slice (0.1.191)

DocumentInfo is a renderer-side product feature that consumes the canonical metadata schema through an explicit plugin port. Its UI is embedded beside the existing PDF stage and follows the canonical active PDF leaf. It does not own or infer a second active-PDF identity.

Field behavior is centralized in `src/metadata/field-type-registry.js`; each schema type owns parse, normalize, validate, serialize, read formatting and edit rendering. Since 0.1.192, DocumentInfo reads and saves through the canonical document-record ports; it no longer owns a RAM-only value store.

Focus return after DocumentInfo interactions is exact-token routed. The plugin verifies the loaded leaf/token, invokes `MainProcessTransport.focusPdfRuntime()`, and the Main Bridge resolves the verified embedded target. Chromium viewer DOM focus remains RuntimeDriver-owned via `focusViewerRuntime()`.


## 15. Persistent document-record layer (0.1.192)

`src/plugin/features/16-document-records.js` is the single owner of per-PDF metadata-record identity, persistence orchestration and RAM indexing. It consumes the canonical schema through a port and does not call back into DocumentInfo; lifecycle owns cross-feature refresh orchestration so the feature graph remains acyclic.

Permanent records are ordinary Markdown notes under `PDF Metadata/<first-two-UUID-hex>/<pdfmeta_id>.md`. The root remains a normal indexed vault folder so Obsidian properties and Bases can consume the records. Since 0.1.195, the root may be visually hidden from File Explorer by a presentation-only feature; it is not moved into a dot-folder or excluded from indexing. `.pdf-metadata/` remains reserved for hidden technical config and backup.

Each record has stable UUID v4 identity and canonical system properties `pdfmeta_type`, `pdfmeta_version`, `pdfmeta_id`, `pdfmeta_file`, and `pdfmeta_status`. `pdfmeta_file` is an Obsidian wikilink to the PDF. User metadata values use the schema properties directly. Markdown/YAML is source of truth; `state.documentRecords` is cache/index only.

The index has two canonical lookup directions: active unambiguous `byPdfPath` and unique `byId`. Duplicate active PDF-path bindings fail closed. Records are created lazily on first valid DocumentInfo save. Existing frontmatter updates use the `FileManager.processFrontMatter` platform adapter and are read back/validated before the index is replaced.

Vault lifecycle listeners are installed only after workspace layout readiness. PDF rename/move updates the existing record's `pdfmeta_file`. PDF deletion retains the metadata note and changes status to `missing`; it is not automatically rebound if a different PDF later appears at the same path. Manual record create/modify/rename/delete updates only the affected index entries.


## 16. 0.1.194 canonical record-link identity rule

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


## 17. 0.1.195 document-record presentation visibility

`src/plugin/features/17-document-record-visibility.js` owns only File Explorer presentation. It toggles the `pdfium-hide-document-records` body class according to the plugin setting `hideDocumentMetadataFilesInExplorer` (default true). `styles.css` scopes the rule to the standard File Explorer and the exact `data-path="PDF Metadata"` folder.

This owner must never participate in record persistence, record identity, RAM indexing, metadata parsing or lifecycle mutation. Disabling the setting or unloading the plugin removes the body class. Therefore an Obsidian DOM change is deliberately fail-open: `PDF Metadata` can become visible again, but the underlying indexed Markdown records remain untouched.

## 0.1.196 Bases presentation and future localization boundary

The permanent metadata contract remains language-neutral. `field.property`, select/multiselect option `value`, UUID identities and `pdfmeta_*` system properties are storage/API identifiers, not localized UI strings.

DocumentInfo and the PDF document-register Bases presentation consume the same metadata schema and field-type registry for user-facing formatting. A select value such as `letter` may therefore render as the schema label `Brev` without modifying the Markdown record.

The custom Bases view type `pdfium-document-register` is presentation-only. Bases remains the query/filter engine and supplies the record entries; the view does not create a second document database or a parallel index.

Future multilingual UI is an explicit roadmap requirement. UI language must remain separate from regional date/time/decimal formatting. Locale-specific labels may be added later, but changing language must never migrate or rewrite stable stored metadata values.


## 0.1.197 editable document-register boundary

The custom `pdfium-document-register` Bases view may edit user metadata fields inline, but it is not a persistence owner. The view renders edit controls through the same `metadataFieldTypeRegistry` used by DocumentInfo, then routes canonical field patches through the root-bound `saveDocumentMetadataRecordValues` operation owned by `DocumentRecordsFeature`.

Rules:

- Bases continues to own query/filter membership and provides the record entries.
- The custom view owns presentation and edit interaction only.
- The view must not call `processFrontMatter`, Vault write APIs, or serialize YAML directly.
- `FieldTypeRegistry.parseNormalizeValidate` is the validation gate before every inline save.
- A field update is a narrow patch; `DocumentRecordsFeature` merges it into the existing record and performs the canonical read-back verification.
- Select/multiselect controls expose schema labels but persist stable option `value`s.
- Date/time/decimal inputs use the current regional presentation while preserving canonical stored values.
- Missing PDF records are read-only in the document register until a separate missing-file workflow is explicitly designed.

This keeps DocumentInfo and the document register on one metadata write path and prevents UI-specific storage behavior from becoming a second source of truth.

## 0.1.198 missing-PDF/relink boundary

Deletion breaks reliable file continuity, so document identity must remain fail-closed after a PDF is deleted. `DocumentRecordsFeature` retains the record as `missing` and must never reactivate it merely because a later create event produces the same path or filename.

Move/rename inside the vault is different: Obsidian's rename event supplies both old and new path for the same file lifecycle event, so the existing record may be updated automatically while preserving `pdfmeta_id`.

Manual relink is the only supported transition from `missing` back to `active` in 0.1.198. The custom Bases register presents **Koble til PDF…**, but the view is not a write owner. It sends `(recordId, targetPdfPath)` through the explicit `relinkMissingDocumentRecord` operation. `DocumentRecordsFeature` verifies unique record ID, `missing` status, target PDF existence, and absence of another active record binding before writing via the canonical repository and read-back verification.

Relink preserves the record UUID and all user metadata. Only the PDF binding and status change. A conflicting target fails closed and leaves the missing record untouched.



## 0.1.199 benchmark/instrumentation boundary

Scale testing is intentionally isolated from product ownership.

`MetadataBenchmarkFeature` owns only benchmark fixture generation, reporting UI and cleanup. It does not write or update ordinary document records through an alternate product persistence path. Generated fixture records are serialized with the canonical metadata record contract and placed in the same visible/indexed Markdown record layout as normal records so the stress test exercises the real storage shape.

`DocumentRecordsFeature` remains the sole owner of RAM-index mutation. Benchmark instrumentation therefore enters through explicit operations:

- `setDocumentRecordBenchmarkEventSuppression(enabled)`
- `runDocumentRecordIndexBenchmark()`

Cold/full rebuild timing is recorded by the existing `rebuildDocumentRecordIndex()` owner. The benchmark feature never clears or mutates `documentRecords` state directly.

Bulk fixture generation uses direct filesystem writes solely to avoid turning 10k–100k fixture creation events into the benchmark itself. Marked benchmark UUIDs and the dedicated `PDFium Benchmark/` PDF root allow lifecycle suppression to be scoped to benchmark fixtures. Suppression is reset naturally by plugin restart. Measurement must be performed after restart so Obsidian has discovered the files and the canonical cold index is built from disk.

Cleanup is fail-closed: the dedicated root is only recursively removed when a valid benchmark manifest marker is present, and metadata record deletion uses deterministic benchmark UUID paths. Ordinary `PDF Metadata` records are never selected by root-wide deletion.

The benchmark layer must remain removable without changing record format, schema, DocumentInfo, Bases editing, PDF identity, RuntimeDriver, selection or annotation behavior.

## 0.1.201 disposable document-record index cache

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


## 0.1.202 idle-deferred startup ownership

DocumentRecords background startup is no longer started synchronously inside the layout-ready callback. Lifecycle schedules the owner through the browser idle scheduler after layout-ready. `ensureDocumentRecordIndexReady()` remains the only readiness gate and now uses one shared single-flight promise; an early user demand cancels the pending idle warmup and starts the same canonical rebuild immediately. There is no fixed/random startup delay. Markdown/YAML remains source of truth and the 0.1.201 cache format is unchanged.


## 0.1.203 startup gate ownership

DocumentRecords owns startup readiness. Lifecycle contributes two explicit signals through declared operation ports: `markDocumentRecordMetadataResolved()` and `markDocumentRecordLayoutReady()`. The metadata-resolved listener is registered early during plugin load; layout-ready is signaled from the existing workspace lifecycle callback. DocumentRecords schedules background warmup only after both latches are true, then uses the existing idle scheduler.

This is an orchestration optimization only. Persistent Markdown/YAML remains source of truth, the disposable cache contract is unchanged, and on-demand callers are never forced to wait for the background gate: they use the same canonical single-flight readiness promise immediately.


## 0.1.204 standard Dokumentregister ownership

`DocumentRegisterBasesFeature` owns the end-user entry point to the document register and the **create-once** standard Base file `PDF Dokumentregister.base`. The Base file is not metadata source of truth; it is a user-facing query/view configuration over ordinary indexed Markdown records.

Creation rules:

- creation is lazy and happens only through **PDF: Åpne Dokumentregister**;
- if the canonical Base file already exists, it is reused and never modified by the plugin;
- generated membership is constrained to `PDF Metadata` + `pdfmeta_type == "pdf_document"`;
- generated property labels come from the current metadata schema and respect `show_in_default_base`;
- technical UUID/record filenames are not standard columns;
- default sort is `document_date` descending, with `file.mtime` descending only when `document_date` is unavailable.

The custom `pdfium-document-register` view remains a presentation/edit surface, not a metadata persistence owner. It renders human status and PDF actions, while user field writes continue through `saveDocumentMetadataRecordValues` and missing relink continues through `relinkMissingDocumentRecord`. Native Bases continues to own membership, filtering, sorting and search.


## 0.1.205 clickable register headers test boundary

The custom `pdfium-document-register` view may expose lightweight header interactions without taking ownership of the underlying document database. Sorting mutates only the Bases view sort configuration; query execution and ordering remain Bases responsibilities. The first filter prototype is deliberately transient view state, never a metadata writer and never a `.base` filter writer, so user-owned Base filter configuration cannot be overwritten during the UX experiment.


## 0.1.206 schema-aware header filter test boundary

The custom document-register view may derive transient filter controls from the existing metadata schema and FieldTypeRegistry. Machine values remain canonical: select/multiselect filters compare stored option values, boolean filters compare booleans, and date/time/numeric range bounds are parsed and validated through the existing field-type contract. Human labels and regional formatting remain presentation only.

These filters are intentionally view-local test state. They do not call `BasesViewConfig.set('filters', ...)`, do not rewrite `PDF Dokumentregister.base`, and do not participate in metadata persistence. Multiple active column filters are combined as AND after Bases has already produced the view's query result. This keeps the experiment reversible while preserving existing Bases query ownership and the single canonical metadata write path.

## 0.1.207 combined sort/filter test boundary

The custom document-register view may combine two distinct query/presentation concerns without creating a second data engine. Bases remains the owner of query membership and sort order. The view receives the Bases result, then applies the existing transient schema-aware header filters as an additional presentation-level narrowing step.

Ordinary header click replaces the current Bases sort list with one property and toggles ASC/DESC. Shift+click edits the existing Bases sort list to add, reverse or remove secondary/tertiary sort keys. Sort priority is presentation-only. Header filters remain transient view state and must not write `BasesViewConfig.filters`, `.base` files, metadata records, or DocumentRecords state.


## 0.1.208 recovery boundary

0.1.208 er en avgrenset recovery-build for Dokumentregister-headeren. Multi-column/Shift-sort fra 0.1.207 er fjernet etter brukerbekreftet regresjon. Den tidligere single-column Bases-sorteringsbanen fra 0.1.206 er gjeninnført sammen med 0.1.206 sine datatype-aware, transient headerfiltre. Ingen canonical metadata-, DocumentRecords-, cache/startup-, identity- eller PDF-runtimekontrakter endres.

## 0.1.209 simple sort interaction boundary

The PDF Document Register keeps Bases as the sole owner of query ordering. The custom view exposes only a deterministic single-column interaction: an unsorted column starts `ASC`, subsequent ordinary clicks toggle `ASC`/`DESC`, and choosing a different column replaces the previous sort key. Shift/multi-column sort behavior is intentionally absent. Existing datatype-aware header filters remain transient presentation state and may coexist with the Bases-owned sort order without writing Base filter configuration.


## 0.1.210 Bases sort write boundary

Dokumentregister header sorting uses the Bases runtime sort operation `BasesViewConfig.setSortProperty(...)`; it must not write the serialized `sort` key through generic `config.set`. The product contract remains one active sort property, ordinary click only, ASC/DESC toggle. Header filtering remains transient view-local state and is independent of the Bases sort configuration.

## 0.1.211 optional header-filter persistence boundary

The `pdfium-document-register` custom view may optionally persist its own datatype-aware header-filter state, but this does not transfer query ownership away from Bases. The user setting `rememberDocumentRegisterFilters` is default-off. When enabled, the view serializes sanitized state under the custom view-config key `pdfiumHeaderFilters` via `BasesViewConfig.set`; on restore it reads only that key and rejects unknown filter shapes.

This custom state is distinct from native Base `filters`: the plugin must not write `config.set('filters', ...)` and must not rewrite `PDF Dokumentregister.base` directly. Native Bases continues to determine query membership and sort order; the custom view only narrows the already-produced result for its own header-filter UX.

0.1.211 also restores release-version consistency: renderer `PLUGIN_VERSION`, manifest/package version, and the generated runtime bridge filename are aligned. The stale pre-release `main-bridge-0.1.205.js` may be removed only after the current versioned bridge has been successfully written and loaded. The Main Bridge source itself is unchanged.


## 0.1.213 internationalization boundary

Internationalization is a presentation-layer concern. `src/i18n/i18n-service.js` is the single translation owner and `src/i18n/locale-resolver.js` is the single UI-language resolution owner. Production features must not infer language independently.

English (`src/i18n/en.json`) is canonical. Locale files may be incomplete; lookup falls back to English. Unknown translation keys and placeholder drift are build-time errors. Translation resources are bundled into the root runtime at build time, preserving the root-only-load contract.

UI language is explicitly independent from metadata regional formatting. In the 0.1.213 pilot, the older `regionalLocale` value still existed alongside the independent date/time/decimal settings. 0.1.214 removes that redundant locale value. Changing UI language must never migrate or rewrite UUIDs, `pdfmeta_*`, schema `property` values, select/multiselect machine values, user-defined metadata labels, category names, or diagnostic machine keys.

The 0.1.213 pilot migrates only DocumentInfo and the new language setting. This staged migration avoids a repository-wide string rewrite and gives each product surface a regression boundary before it is internationalized.

## 0.1.214 Settings internationalization and regional-format boundary

The ordinary Settings surface is now an i18n consumer. `src/main/settings.js` must use translation keys for user-facing section names, labels, descriptions and localized option text; the product setting identifiers remain stable English machine keys.

The legacy `regionalLocale` setting is removed. Regional formatting now has only the independently meaningful controls already present in the product: `regionalDateFormat`, `regionalTimeFormat`, and `regionalDecimalSeparator`. These controls affect parsing/display formats only and do not determine UI language.

Boolean labels are presentation text. `metadataPresentationSettings(settings, i18n)` supplies localized `Yes/No` or `Ja/Nei` labels to the field-type registry without modifying canonical boolean values or persistent records. Translation ownership therefore remains in `I18nService`; the metadata formatter receives only presentation labels as an explicit dependency.

Verifier contracts reject production references to `regionalLocale` and require Settings translation-key ownership. Main Bridge, annotation, identity, persistence, cache and startup boundaries are unchanged.



## 0.1.215 migrated-UI i18n protection boundary

Category UI is now an internationalized presentation surface. Category persistence remains unchanged: category UUIDs, names after creation, colors, shortcuts, inheritance and YAML ownership are not translation-owned data. The UI may localize a placeholder name only when a new category row is first created; changing language later must not rewrite that name.

`check:i18n-ui` introduces an incremental migration gate. Whole files or bounded source regions are added only after their user-facing UI has been migrated. Within protected surfaces, hard-coded UI literals and obvious Norwegian residue fail the check. This avoids requiring a repository-wide flag day while preventing already-migrated modules from regressing. The gate is part of `npm run check`.

Visible category validation/errors use `I18nService`; technical diagnostic payload keys remain stable and source-code comments/diagnostic prose in migrated modules use English. No PDF runtime, annotation format, metadata record, cache/startup or Main Bridge ownership changes.


## i18n UI gate extension (0.1.216)
Command names are user-facing presentation and are translated; command IDs remain stable machine identifiers. Migrated modal/button/notice surfaces are protected by `check:i18n-ui`. Diagnostic payload keys remain stable technical English.
