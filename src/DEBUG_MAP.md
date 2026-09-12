# PDFium Gate — debug map

Start here when a regression appears. Follow the narrow canonical route before searching globally.

| Symptom / feature | Canonical source route |
|---|---|
| PDF/frame identity, duplicate wrappers, wrong PDF | `src/platform/pdf-embedded-target.js` → `src/platform/pdf-wrapper-frame.js` → `src/platform/IDENTITY_POLICY.md` |
| Chromium `pdf-viewer`, viewport, scroller, page↔screen conversion | `src/runtime/chromium-pdf-runtime-driver.js` |
| Main Bridge target classification / basic embedded target resolution | `src/main-bridge/features/01-kernel.js` |
| Active identity / locator physical resolution | `src/main-bridge/features/02-identity-locator.js` |
| Native context-menu capture/suppression | `src/main-bridge/features/03-context-menu.js` |
| Mouse selection text / gesture / viewer-state capture | `src/main-bridge/features/04-selection-capture.js` |
| Keyboard selection lifecycle / copy / locator operations | `src/main-bridge/features/05-selection-operations.js` |
| Keyboard key recognition / Ctrl+C / Ctrl+Alt+1–5 | `src/main-bridge/features/06-input-router.js` |
| Delayed Chromium `<embed>` readiness / wrapper instrumentation / continuous mouse autoscroll | `src/main-bridge/features/07-wrapper-lifecycle.js` |
| Main Bridge install/uninstall / shortcuts / capability state | `src/main-bridge/features/08-lifecycle.js` |
| Startup restore / background PDF not responding | `src/main/pdfium-gate-view.js` → `src/plugin/features/07-main-bridge-routing.js` → `src/main-bridge/features/07-wrapper-lifecycle.js` |
| Main Bridge → renderer event names/payload validation | `src/bridge/renderer-events.js` |
| Main Bridge → renderer physical event dispatch | `src/platform/renderer-event-dispatch.js` |
| Renderer production event wiring | `src/plugin/features/02-renderer-bridge.js` |
| Renderer diagnostics / diagnostic snapshots | `src/plugin/features/03-diagnostics.js` — observation only, never production transport |
| Category factory bootstrap / permanent UUID identity / physical root owner / folder inheritance + per-category provenance | `src/plugin/features/04-category-config.js` + `src/core/category-config-serialization.js` |
| Category editor UI / create at current owner level / read-only category UUID / inherited owner navigation | `src/main/category-modals.js` |
| Context-menu inspection / overlay actions | `src/plugin/features/05-context-menu.js` |
| Obsidian selection-link creation / outward copy | `src/plugin/features/06-selection-links.js` |
| Renderer handling of Main Bridge context/category/Escape/mouse events | `src/plugin/features/07-main-bridge-routing.js` |
| Locator restore / navigation | `src/plugin/features/08-link-locator.js` + RuntimeDriver |
| Renderer → annotator request transport / iframe lifecycle / backups | `src/plugin/features/09-annotator-host.js` |
| Renderer handling of keyboard/native copy and keyboard selection | `src/plugin/features/10-selection-bridge.js` |
| Thin annotation operation wrappers | `src/plugin/features/11-annotation-io.js` |
| Selection diagnostics | `src/plugin/features/12-selection-diagnostics.js` |
| PDF mutation / category assignment / removal | `src/plugin/features/13-category-mutation.js` |
| Metadata schema validation / field types / reserved properties | `src/metadata/schema-contract.js` |
| Metadata schema hidden-folder persistence | `src/metadata/schema-repository.js` + `src/platform/obsidian-adapter-file-store.js` |
| Config/schema safe-write + timestamped backup + temp/read-back/restore | `src/core/safe-config-file-write.js` |
| Metadata schema RAM owner / create-edit-delete-reorder | `src/plugin/features/14-metadata-schema.js` |
| Metadata field manager / field editor | `src/main/metadata-schema-modal.js` |
| Regional formatting + compact metadata-manager entry point | `src/main/settings.js` |
| Annotator request/result/timeout contract | `src/bridge/annotator-messages.js` |
| Annotator request ownership/dependency contract | `src/annotator/handler-contracts.js` |
| Annotator runtime dispatch / only message listener | `src/annotator/runtime-message-dispatch.js` |
| Annotator keyboard selection request identity / anchor-focus / reversal / finalize | `src/annotator/handlers/02-keyboard-expand-selection.js` |
| Annotator Shift+Up/Down/Home/End / line and page-boundary navigation | `src/annotator/keyboard/line-navigation.js` |
| Annotator PageUp/PageDown viewport navigation | `src/annotator/keyboard/viewport-navigation.js` |
| Annotator word/punctuation navigation | `src/annotator/keyboard/word-navigation.js` |
| Annotator artifact filtering | `src/annotator/handlers/03-filter-selection-artifacts.js` |
| Annotator find-selection | `src/annotator/handlers/04-find-selection.js` |
| Annotator inspect/read/mutate/write operations | `src/annotator/handlers/05-inspect-point-highlights.js` → `06-inspect-selection-highlights.js` → `07-read-existing-highlight-selection.js` → `08-modify-existing-highlight.js` → `09-write-selection-highlight.js` → `10-write-highlight.js` |
| Annotator shared PDF/text/geometry helpers | `src/annotator/runtime-helpers.js` + `src/annotator/handler-shared.js` |
| PDF.js native-link range mapping | `src/core/pdfjs-selection-geometry.js` + `src/core/pdfjs-selection-mapping.js` |
| INTERNAL/OUTWARD normalization | `src/selection/text-normalization.js` |
| Backup path / filesystem behavior | `src/platform/node-filesystem.js` + `src/plugin/features/09-annotator-host.js` + `13-category-mutation.js` |
| Renderer mutable state / field writer ownership / operation ports | `src/plugin/plugin-state.js` + `src/plugin/feature-contracts.js` + `src/plugin/plugin-composition.js` |
| Main Bridge mutable state / field ownership / operation ports | `src/main-bridge/composition.js` + `src/main-bridge/feature-contracts.js` |
| Electron renderer→main loader | `src/platform/electron-remote-require.js` → `src/platform/main-process-transport.js` |
| Runtime compatibility gate | `src/platform/compatibility-gate.js` |
| Build composition / source order | `scripts/source-bundle.js` → `build.js` |
| Startup lifecycle regression | `scripts/verify/contracts/06-startup-lifecycle.js` |
| Explicit dataflow / single transport regression | `scripts/verify/contracts/07-explicit-data-flow.js` |
| Renderer module-boundary regression | `scripts/verify/contracts/08-plugin-module-boundaries.js` |
| Main Bridge module/state-ownership regression | `scripts/verify/contracts/09-main-bridge-module-boundaries.js` |
| Annotator handler/dependency-boundary regression | `scripts/verify/contracts/10-annotator-module-boundaries.js` |
| Final architecture target (ports / no cycles / single writers / keyboard modules) | `scripts/verify/contracts/11-architecture-completion.js` |
| Metadata schema v1 contract / no-record-write boundary | `scripts/verify/contracts/12-metadata-schema.js` |
| Shared config/schema backup-write contract | `scripts/verify/contracts/13-safe-config-write.js` |
| Architecture stability / when foundational refactoring is allowed | `ARCHITECTURE.md` → `docs/architecture/02-core-principles.md` + `docs/architecture/13-testing-and-verification.md` |
| All regression gates | `scripts/verify/contracts/` → `scripts/verify-build.js` |

## Production dataflow rule

Main Bridge asynchronous output:

`renderer-events.js` → `renderer-event-dispatch.js` → `plugin/features/02-renderer-bridge.js` → root-bound operation port → exact feature owner.

Annotator requests:

`annotator-messages.js` → `plugin/features/09-annotator-host.js::sendAnnotatorRequest(...)` → `annotator/runtime-message-dispatch.js` → exact request handler.

Do not use diagnostics state, timer polling, duplicate `CustomEvent` injection or feature-local `postMessage` as production transport.

## Debugging rule

1. Identify the violated contract, not only the visible symptom.
2. Inspect the canonical owner above.
3. Audit the codebase for the same assumption/bug class.
4. Fix one canonical route; do not add a parallel fallback.
5. Add or strengthen a contract test in `scripts/verify/contracts/`.
6. Keep ambiguous physical identity fail-closed.


## Bases document register (0.1.196)

- schema-aware Bases presentation contract: `src/metadata/base-presentation.js`
- custom Bases layout: `src/main/pdf-document-register-bases-view.js`
- Bases registration owner: `src/plugin/features/18-document-register-bases.js`
- Obsidian Bases registration adapter: `src/platform/obsidian-plugin-registration.js`
- verification: `scripts/verify/contracts/18-document-register-bases.js`

## DocumentInfo + document records (0.1.192)

- UI shell/button/panel host: `src/main/pdfium-gate-view.js`
- DocumentInfo state + UX flow owner: `src/plugin/features/15-document-info.js`
- schema/type parse-normalize-validate-render owner: `src/metadata/field-type-registry.js`
- schema source: `src/metadata/schema-contract.js` + `src/metadata/schema-repository.js`
- active PDF leaf/token source: existing `src/platform/pdf-leaf.js` + active identity lifecycle
- exact focus return: `MainProcessTransport.focusPdfRuntime()` -> Main Bridge identity locator -> `ChromiumPdfRuntimeDriver.focusViewerRuntime()`
- persistent record owner: `src/plugin/features/16-document-records.js`
- record contract/repository: `src/metadata/record-contract.js` + `src/metadata/record-repository.js`
- canonical records: `File Metadata/<UUID-prefix>/<filemeta_id>.md`
- RAM cache/index only: `state.documentRecords.byPdfPath` + `state.documentRecords.byId`
- PDF rename/delete lifecycle orchestration: `src/plugin/features/01-lifecycle.js` -> document-record ports


## Editable Bases document register (0.1.197)

- View/UI owner: `src/main/pdf-document-register-bases-view.js`
- Schema-aware edit preparation: `src/metadata/base-presentation.js`
- Registration/dependency boundary: `src/plugin/features/18-document-register-bases.js`
- Canonical persistence owner: `src/plugin/features/16-document-records.js` via `saveDocumentMetadataRecordValues`
- No direct frontmatter/Vault write is permitted from the Bases view.

## Missing PDF / relink lifecycle (0.1.198)

- automatic PDF rename/move + delete-to-missing owner: `src/plugin/features/16-document-records.js`
- explicit `missing -> active` relink operation: `DocumentRecordsFeature.relinkMissingDocumentRecord()`
- missing-row relink UI/search: `src/main/pdf-document-register-bases-view.js`
- Bases registration bridge for relink/list-PDF callbacks: `src/plugin/features/18-document-register-bases.js`
- vault file enumeration adapter: `src/platform/obsidian-vault-read.js`



## Metadata scale benchmark (0.1.199)

- benchmark contract / deterministic UUID + fixture paths: `src/metadata/benchmark-contract.js`
- benchmark UI modals: `src/main/benchmark-modals.js`
- generator/report/cleanup owner: `src/plugin/features/19-metadata-benchmark.js`
- cold/full RAM-index measurement owner: `src/plugin/features/16-document-records.js`
- benchmark commands registered through lifecycle composition: `src/plugin/features/01-lifecycle.js`
- verification: `scripts/verify/contracts/19-metadata-benchmark.js`

Benchmark fixture root: `PDFium Benchmark/`.
Fixture records remain canonical Markdown under `File Metadata/<shard>/<uuid>.md`.

## Document-record startup cache (0.1.201)

- Persistent acceleration file: `.pdf-metadata/document-record-index-cache.json`
- Owner: `DocumentRecordsFeature`
- Cache contract: `src/metadata/record-index-cache.js`
- Source of truth remains `File Metadata/**/*.md`.
- Benchmark metrics: `cacheLoadMs`, `cacheHits`, `cacheMisses`, `diskReadParseMs`, `indexPopulateMs`, `cacheWriteMs`.
- Delete the cache file to force a full Markdown parse on next startup.

## Document-record resolved/layout/idle startup (0.1.203)
- Background warmup owner: `DocumentRecordsFeature.scheduleDocumentRecordIndexWarmup()`
- Startup orchestration: early `metadataCache.on("resolved")` latch + `workspace.onLayoutReady()` latch -> idle scheduler
- Browser scheduling boundary: `src/platform/obsidian-workspace-lifecycle.js::scheduleIdle()` (`requestIdleCallback`, `setTimeout(0)` fallback only)
- Canonical readiness gate: `DocumentRecordsFeature.ensureDocumentRecordIndexReady(reason)`
- Single-flight state: `documentRecords.readyPromise`
- Early user demand cancels pending idle handle and starts the same canonical rebuild; no fixed startup delay.
- Benchmark startup fields: `startupScheduleMode`, `startupGateOrder`, `startupDeferralMs`.


## Standard Dokumentregister Base (0.1.204)

- Base-config generator: `src/metadata/document-register-base-config.js`
- Create/open owner: `src/plugin/features/18-document-register-bases.js`
- Register UI/presentation: `src/main/pdf-document-register-bases-view.js`
- Canonical path: `PDF Dokumentregister.base`
- Create-only rule: existing Base is reused and never overwritten.
- Native Bases owns filters/sort/search; DocumentRecords remains metadata write owner.


## Klikkbare Dokumentregister-headere (0.1.205 test)

- sort/filter header UX: `src/main/pdf-document-register-bases-view.js`
- sort persistence: `BasesViewConfig.getSort()` + `setSortProperty(...)` (single-column ASC/DESC)
- headerfilter state: view-local `headerFilters` Map; optional sanitized persistence under custom view config key `pdfiumHeaderFilters` when Settings → **Husk filtre i PDF Dokumentregister** is enabled
- native Bases `filters` remain untouched; default filter persistence is off
- CSS: `styles.css`
- verification: `scripts/verify/contracts/18-document-register-bases.js`


## Dokumentregister filter persistence (0.1.211)

- global preference: `src/main/settings.js` → `rememberDocumentRegisterFilters`
- default/restore owner: `src/plugin/features/01-lifecycle.js`
- custom view state key: `pdfiumHeaderFilters`
- serialization/sanitization/restore: `src/main/pdf-document-register-bases-view.js`
- runtime bridge version path: `src/plugin/features/05-context-menu.js::getMainProcessBridgePath()`
- stale pre-release bridge cleanup: `src/plugin/features/07-main-bridge-routing.js::installMainProcessUxBridge()`
- verification: `scripts/verify/contracts/18-document-register-bases.js`

## Internationalization (0.1.214)

- canonical English strings: `src/i18n/en.json`
- Norwegian Bokmål strings: `src/i18n/nb.json`
- language resolution: `src/i18n/locale-resolver.js`
- translation/fallback/interpolation: `src/i18n/i18n-service.js`
- locale integrity gate: `scripts/check-i18n.js` and `scripts/verify/contracts/20-i18n.js`
- localized UI so far: `src/plugin/features/15-document-info.js`, `src/main/pdfium-gate-view.js`, and the complete ordinary Settings surface in `src/main/settings.js`
- boolean presentation context: `src/metadata/field-type-registry.js::metadataPresentationSettings()`
- regional date/time/decimal formatting remains owned by `src/metadata/field-type-registry.js` and the three independent Settings values; there is no separate `Locale` setting.
