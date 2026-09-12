# 0.1.195 — presentation-only hiding of indexed document records

0.1.195 is a deliberately narrow UX experiment built from the user-confirmed 0.1.194 baseline. It addresses File Explorer clutter without changing the permanent Markdown/YAML record model.

## Problem

Per-PDF metadata records are ordinary indexed Markdown notes under `PDF Metadata/<uuid-prefix>/<pdfmeta_id>.md`. This is desirable for Obsidian properties/Bases and long-term portability, but a visible record tree becomes noisy when a vault contains hundreds or thousands of registered PDFs.

## Decision confirmed by user test

Keep `PDF Metadata/` as an ordinary indexed vault folder, but hide only its File Explorer presentation by default.

- no dot-folder migration;
- no `Excluded files` setting;
- no change to `pdfmeta_*` properties;
- no change to record paths, UUIDs, RAM index or lifecycle;
- no change to DocumentInfo, selection, annotation, PDF identity or RuntimeDriver;
- Markdown/YAML remains source of truth;
- Bases/indexing are expected to keep seeing the files because the files themselves are not hidden from the vault.

## Presentation owner

`src/plugin/features/17-document-record-visibility.js` owns the UI-only state projection. It toggles a body CSS class. `styles.css` scopes the hide rule to Obsidian File Explorer and the exact canonical root path `PDF Metadata`.

Default setting:

`hideDocumentMetadataFilesInExplorer: true`

Settings exposes **Skjul metadatafiler i filutforskeren**. Command Palette exposes **PDF: Vis/skjul metadatafiler i filutforskeren**.

On plugin unload the body class is removed. If Obsidian changes File Explorer DOM markup, the intended failure mode is therefore fail-open: the metadata folder becomes visible again while storage and indexing remain intact.

## Verification

The 0.1.195 gate verifies:

- canonical record root remains `PDF Metadata` and is not converted to a dot-folder;
- visibility CSS is scoped to File Explorer and the exact root path;
- hide is default-on;
- settings and Command Palette can reveal/re-hide the folder;
- unload removes the presentation class;
- the visibility feature does not leak into the document-record storage owner;
- all architecture-completion gates remain green.

User testing in Obsidian 1.13.7 confirmed tests 1–7 and the decisive Bases check: the folder can be hidden from File Explorer while Bases still sees the metadata records.

## Baselines

- **0.1.195** — user-confirmed File Explorer hiding + Bases indexing baseline
- **0.1.194** — user-confirmed permanent-record/canonical-link working product baseline and rollback
- **0.1.191** — user-confirmed DocumentInfo A–G baseline
- **0.1.180** — user-confirmed full architecture/runtime rollback reference

# 0.1.196 — schema-aware Bases document register

0.1.196 is built from the user-confirmed 0.1.195 baseline. It adds a custom Obsidian Bases view type for PDF document metadata without changing persisted record values.

## Product rule under test

Canonical metadata values stay language-neutral and stable. Presentation uses the current metadata schema:

- stored `document_type: letter` remains `letter`;
- schema option `letter -> Brev` is shown as `Brev`;
- date/time/decimal/boolean presentation uses the existing field-type registry and regional settings;
- active fields with `show_in_default_base: true` become the visible document-register columns;
- changing a schema label changes presentation, not stored document metadata.

Bases remains responsible for query/filter membership. The plugin-added `pdfium-document-register` view is presentation-only and reads the same ordinary Markdown frontmatter that Bases has already selected.

## Future localization reminder

The plugin must later support a genuinely multilingual UI. **UI language and regional formatting are separate concepts.** Stable machine values, `property` names, UUIDs, option `value`s and `pdfmeta_*` system properties must remain language-neutral. User-facing labels should be localized separately so changing UI language never rewrites persisted document metadata.

A future locale-aware schema/presentation model may support per-locale labels, for example `nb-NO: Brev`, `en: Letter`, `de: Brief`, but 0.1.196 deliberately does not freeze that representation yet.

## Baselines

- **0.1.196** — schema-aware Bases presentation test build
- **0.1.195** — user-confirmed File Explorer hiding + Bases indexing working product baseline and rollback
- **0.1.194** — user-confirmed permanent-record/canonical-link baseline
- **0.1.191** — user-confirmed DocumentInfo A–G baseline
- **0.1.180** — user-confirmed full architecture/runtime rollback reference


# 0.1.197 — editable schema-aware Bases document register

0.1.197 is built from the user-confirmed 0.1.196 baseline. It adds inline editing to the existing **PDF Dokumentregister** custom Bases view without changing the permanent record format or storage/index model.

## Canonical edit rule

The Bases view is not a write owner. It renders field controls using the same `metadataFieldTypeRegistry` as DocumentInfo, runs `parseNormalizeValidate`, and sends a narrow property patch through the root-bound `saveDocumentMetadataRecordValues` operation. `DocumentRecordsFeature` remains the only owner of document-record persistence and read-back verification.

Expected UX:

- click an editable metadata cell to enter inline edit mode;
- schema-aware controls are used for all nine field types;
- Enter or ✓ saves normal single-value controls;
- select and boolean save immediately on change;
- Escape or × cancels;
- validation errors remain in the cell and no record write occurs;
- select labels such as `Brev` still persist machine values such as `letter`;
- missing-PDF records are read-only in this test build.

## Baselines

- **0.1.197** — editable Bases document-register test build
- **0.1.196** — user-confirmed schema-aware Bases presentation baseline and rollback
- **0.1.195** — user-confirmed hidden File Explorer + Bases indexing baseline
- **0.1.194** — user-confirmed permanent-record/canonical-link baseline
- **0.1.180** — user-confirmed full architecture/runtime rollback reference

# 0.1.198 — missing-PDF lifecycle and explicit relink

0.1.198 is built from the user-confirmed 0.1.197 baseline. The persistent record format, sharding, UUID identity, schema and normal active-record write path are unchanged.

## Lifecycle rule

- PDF rename/move inside the vault remains automatic and preserves the same record UUID.
- PDF delete retains the metadata note, preserves the last known `pdfmeta_file`, and sets `pdfmeta_status: missing`.
- A later PDF create at the same path does **not** reactivate the record automatically. After deletion, path equality is not sufficient proof of identity.
- Missing records are read-only in the document register until explicitly rebound.
- **Koble til PDF…** opens a bounded searchable vault-PDF chooser.
- Explicit relink preserves `pdfmeta_id` and all existing user metadata, changes only the PDF binding/status, and uses the canonical DocumentRecords repository/write/read-back path.
- Relink to a PDF already owned by another active metadata record fails closed.

This is intentionally conservative: automatic move is safe because the rename event itself carries continuity; post-delete reappearance is not.

## Baselines

- **0.1.198** — missing/relink lifecycle test build
- **0.1.197** — user-confirmed editable Bases/document-register working product baseline and rollback
- **0.1.195** — user-confirmed hidden File Explorer + Bases indexing baseline
- **0.1.194** — user-confirmed permanent-record/canonical-link baseline
- **0.1.180** — user-confirmed full architecture/runtime rollback reference



# 0.1.199 — repeatable metadata scale benchmark

0.1.199 is built from the user-confirmed 0.1.198 baseline. It is a benchmark/instrumentation build, not a product-format change.

Benchmark contract:

- sizes: 1,000 / 10,000 / 50,000 / 100,000 documents
- fixture PDFs: `PDFium Benchmark/PDF/<group>/benchmark-XXXXXX.pdf`
- fixture metadata: normal canonical `PDF Metadata/<uuid-shard>/<uuid>.md`
- benchmark records use deterministic marked UUID v4 values spread across ordinary UUID shards
- generator fixture writes are direct filesystem bulk writes; benchmark lifecycle events are ignored until restart
- restart after generation is mandatory before measurement
- DocumentRecords owns cold-index timing and forced benchmark rebuilds
- measured output includes full rebuild time, candidate/record/invalid counts, lookup latency and renderer memory
- JSON report is stored under `PDFium Benchmark/`
- cleanup is marker/manifest gated and deletes only benchmark fixtures
- persistent metadata record format remains version 1

Rollback: 0.1.198 remains the latest user-confirmed product baseline while 0.1.199 is benchmark-tested.

# 0.1.201 — disposable validated record-index cache

Built from 0.1.199 after the 0.1.200 bounded-concurrency read experiment regressed the 10,000-record cold-start from about 7.6 s to about 17.4 s and increased RSS sharply.

0.1.201 does not change the persistent document-record format. It adds `.pdf-metadata/document-record-index-cache.json` as a fully disposable acceleration artifact. `PDF Metadata/**/*.md` remains source of truth.

Cache acceptance requires matching cache/record contract versions, matching full metadata-schema SHA-256, canonical record path, and unchanged current `TFile.stat.mtime` + `TFile.stat.size`. Any mismatch becomes a disk read. The RAM index still resolves the cached textual PDF link through current Obsidian link semantics before using a PDF path as identity.

The cache is fail-open: missing/corrupt/unwritable cache must only reduce performance, never block or overwrite metadata.

Benchmark metrics: `cacheLoadMs`, `cacheReason`, `cacheEntriesLoaded`, `cacheHits`, `cacheMisses`, `diskReadParseMs`, `indexPopulateMs`, `cacheWriteMs`, `cacheWriteError`.

A/B test target: existing 10,000-record benchmark dataset. First 0.1.201 startup builds the cache; a second full Obsidian restart measures cached cold-start.


# 0.1.202 — idle-deferred DocumentRecords warmup

DocumentRecords background startup is no longer started synchronously inside the layout-ready callback. Lifecycle schedules the owner through the browser idle scheduler after layout-ready. `ensureDocumentRecordIndexReady()` remains the only readiness gate and now uses one shared single-flight promise; an early user demand cancels the pending idle warmup and starts the same canonical rebuild immediately. There is no fixed/random startup delay. Markdown/YAML remains source of truth and the 0.1.201 cache format is unchanged.


# 0.1.203 — resolved/layout/idle startup gate

- Background DocumentRecords warmup requires both first `metadataCache` `resolved` and `workspace.onLayoutReady()`.
- The two signals are latched and idempotent; neither signal alone schedules warmup.
- Once both are present, warmup is scheduled by `requestIdleCallback` (existing zero-delay fallback only).
- Early DocumentInfo/Bases access bypasses only the background gate and starts/awaits the same single-flight readiness promise.
- Cache format and Markdown/YAML record format are unchanged from 0.1.201/0.1.202.
- Benchmark metrics include `startupGateOrder`.


# 0.1.204 — standard Dokumentregister og produkt-polish

0.1.204 er en produkt-UX-build fra den brukerbekreftede 0.1.203-baselinen. Ingen persistent record-, cache-, startup- eller PDF-identitetskontrakt endres.

## Standard Base

- Kommandoen **PDF: Åpne Dokumentregister** er den normale inngangen.
- `PDF Dokumentregister.base` opprettes lazy første gang kommandoen brukes.
- Hvis filen allerede finnes, gjenbrukes den og pluginen skriver den ikke om. Etter opprettelse er Base-filen bruker-eid og kan tilpasses i Obsidian.
- Base-filteret begrenser medlemskap til Markdown-records under `PDF Metadata` med `pdfmeta_type == "pdf_document"`.
- Standardvisningen bruker `pdfium-document-register` og sorterer `document_date` DESC; hvis dette feltet ikke finnes i standardkolonnene brukes `file.mtime` DESC.
- `show_in_default_base=false` respekteres ved førstegenerering. UUID og record-filnavn er ikke standardkolonner.

## Register UX

- Schema-feltene vises med brukerlabels og regional formatering.
- `pdfmeta_status` presenteres som **Aktiv** eller **Mangler**.
- Aktiv PDF får handlingen **Åpne**; missing-record får **Koble til PDF…**.
- Inline-redigering, validering og persistens er uendret og går fortsatt gjennom canonical DocumentRecords save-port.
- Native Bases eier fortsatt query membership, sortering, filtrering og søk.

## Baselines

- **0.1.204** — standard Dokumentregister / product-polish test build
- **0.1.203** — siste brukerbekreftede working product baseline og rollback
- **0.1.180** — confirmed architectural/runtime baseline


# 0.1.205 — klikkbare Dokumentregister-kolonner (UX-test)

0.1.205 bygger direkte på brukerbekreftet 0.1.204. Endringen er avgrenset til custom Bases Dokumentregister-view og CSS.

- kolonnenavn kan klikkes for single-column sort: ASC ↔ DESC
- sorteringen går gjennom `BasesViewConfig.set('sort', ...)`; Bases beholder query/sort ownership
- hver kolonne får et lite filterikon
- filterikonet åpner et transient `contains`-filter på presentert kolonneverdi
- prototypefilteret lagres ikke i `.base` og endrer ikke native Bases-filterkonfigurasjon
- dette gjør at filter-UX kan brukertestes før eventuell persistent Bases-integrasjon besluttes
- metadata-write-path, DocumentRecords, PDF-identitet, cache/startup og Main Bridge er uendret

0.1.204 beholdes som rollback dersom UX-testen feiler.


# 0.1.206 — datatypebevisste Dokumentregister-filtre (UX-test)

0.1.206 bygger direkte på 0.1.205 og utvider bare det transiente headerfilteret.

- filter-UI velges fra metadatafeltets schema-type
- text/link bruker case-insensitive contains
- select/multiselect bruker schemaets machine values med labels som presentasjon
- boolean bruker Alle / Ja / Nei
- date/time/integer/decimal bruker Fra/Til og eksisterende FieldTypeRegistry for canonical parsing/validation
- Status bruker canonical `active` / `missing`, vist som Aktiv / Mangler
- flere kolonnefiltre kombineres som AND
- filtrene er fortsatt view-lokale og skriver ikke Bases `filters` eller `.base`-filen
- 0.1.205 klikkbar sortering beholdes uendret
- metadata-write-path, DocumentRecords, PDF-identitet, cache/startup og Main Bridge er uendret

**Rollback:** 0.1.204 er fortsatt siste fullt brukerbekreftede product baseline. 0.1.205-sortering er brukerbekreftet i praktisk test.

# 0.1.207 — kombinert filtrering og flernivåsortering (UX-test)

0.1.207 bygger direkte på 0.1.206 og holder headerfilteret transient, men gjør kombinasjonen med Bases-sortering eksplisitt og lettere å teste.

- vanlig headerklikk velger én sorteringskolonne og veksler ASC/DESC
- Shift+klikk legger til sekundær/tertiær sortering
- Shift+klikk på eksisterende sorteringskolonne går ASC → DESC → fjern
- flere sorteringsnivåer nummereres visuelt 1, 2, 3 …
- aktive datatypefiltre beholdes mens Bases leverer det sorterte query-resultatet
- flere filtre kombineres fortsatt som AND
- filtertilstand er fortsatt view-lokal og skriver ikke `.base` filters
- metadata-write-path, DocumentRecords, PDF-identitet, cache/startup og Main Bridge er uendret

**Rollback:** 0.1.204 er fortsatt siste fullt brukerbekreftede product baseline. 0.1.205-sortering og 0.1.206-filtrering er separat brukerbekreftet i praktisk test.


# 0.1.208 — recovery av sortering + kombinert filter

0.1.207 introduserte en brukerbekreftet regresjon der kolonneklikk ikke lenger ga sortering. Diffen isolerte endringen til multi-sort state/cycle-laget. 0.1.208 fjerner derfor den nye Shift+multi-sorteringen og gjeninnfører den kjente, fungerende single-column Bases-sorteringsbanen fra 0.1.206, samtidig som datatype-aware headerfiltre beholdes.

Kontrakt:
- filter + sortering kan være aktive samtidig
- vanlig kolonneklikk skriver én Bases-sortering gjennom eksisterende `config.set('sort', ...)`
- headerfilter forblir transient
- ingen endring i metadata-write-path, record-format, cache/startup eller PDF runtime

# 0.1.209 — enkel deterministisk sortering

0.1.209 forenkler Dokumentregister-sorteringen til én eksplisitt brukerregel etter testing av 0.1.207/0.1.208:

- vanlig klikk på usortert kolonne = `ASC`
- neste klikk = `DESC`
- videre klikk = `ASC ↔ DESC`
- ny kolonne erstatter tidligere sorteringskolonne og starter `ASC`
- ingen Shift/multi-sort
- datatype-aware transient headerfilter beholdes og kan kombineres med sortering

Verifieren beskytter nå eksplisitt både ASC/DESC-toggle og fravær av Shift-avhengighet i Dokumentregister-sorteringen.

**Rollback:** 0.1.204 er fortsatt siste fullt brukerbekreftede product baseline. 0.1.205-sortering og 0.1.206-filtrering er separat brukerbekreftet. 0.1.209 skal praktisk brukertestes før eventuell baseline-promotering.


# 0.1.210 — dedicated Bases sort operation

0.1.210 diagnoses the user-confirmed 0.1.209 runtime failure as a sort write-back problem. The Dokumentregister header had been mutating the serialized `sort` config through generic `config.set('sort', ...)` instead of using the Bases runtime operation dedicated to sorting.

The header now uses `BasesViewConfig.setSortProperty(property, direction)` on Obsidian 1.13.7. Before applying the selected property it removes any existing sort properties with `NONE`, preserving the agreed single-column UX: first click ASC, second click DESC, then toggle. Shift/multi-sort remains intentionally absent. Datatype-aware transient filters are unchanged.

0.1.210 is now user-confirmed in Obsidian 1.13.7: simple ASC/DESC column sorting and datatype-aware filtering work together. Treat 0.1.210 as the latest confirmed working product baseline.

# 0.1.211 — optional persistent filters + release consistency

0.1.211 is a consolidation build from the user-confirmed 0.1.210 baseline.

- `rememberDocumentRegisterFilters` is a global plugin setting, default `false`.
- When disabled, column filters remain transient view state exactly as in 0.1.210.
- When enabled, the custom view stores sanitized filter state in its own Bases view config key `pdfiumHeaderFilters`; this is serialized into the user-owned `.base` file by Bases.
- The custom filter state does **not** replace or mutate native Bases `filters`; query membership remains Bases-owned, while PDFium applies its datatype-aware header filters as presentation narrowing.
- Stored filter state is sanitized fail-closed before restore; unknown filter kinds are ignored.
- Header sort/filter buttons no longer duplicate tooltip text through both native HTML `title` and accessibility labeling.
- Internal `PLUGIN_VERSION`, manifest and package versions are synchronized to `0.1.211`. Versioned runtime bridge path is therefore `main-bridge-0.1.211.js`.
- One-off pre-release cleanup removes the stale `main-bridge-0.1.205.js` generated by builds whose internal version constant was not updated.

No persistent document metadata, record, schema, cache, startup, PDF identity, selection, annotation or Main Bridge execution contract changes.

**Rollback:** 0.1.210 is the latest user-confirmed working product baseline. 0.1.180 remains the confirmed architectural/runtime baseline.



# 0.1.214 — Settings i18n and Locale removal

0.1.214 extends the 0.1.213 internationalization foundation to the complete ordinary Settings surface and removes the redundant regional `Locale` setting.

- Settings labels, descriptions, section headings and localized option labels route through `I18nService`.
- `regionalLocale` is no longer part of the runtime settings model.
- Date format, time format and decimal separator remain independent persisted settings and preserve their existing behavior.
- Boolean display labels are presentation text owned by UI language (`common.yes` / `common.no`) rather than regional formatting.
- `metadataPresentationSettings()` injects localized boolean labels into metadata presentation without changing canonical values.
- English and Norwegian Bokmål remain complete for the current translation-key set.
- Verification rejects reintroduction of `regionalLocale` into production source and protects localized Settings ownership.

No PDF execution, annotation, identity, metadata persistence, DocumentRecords, cache/startup or Main Bridge contract changes.

# 0.1.213 — i18n foundation

0.1.213 starts the multilingual UI track from the 0.1.211 product source. The earlier experimental 0.1.212 active-PDF findings build was rejected as a product direction and is not a baseline; 0.1.212 is intentionally not reused.

The new boundary is deliberately small:

- English is canonical (`src/i18n/en.json`).
- Norwegian Bokmål (`src/i18n/nb.json`) is the first complete translation.
- Missing locale keys fall back to English.
- UI language is independent of the already-existing regional date/time/decimal settings.
- `LocaleResolver` owns Obsidian language detection and isolates compatibility fallbacks.
- `I18nService` owns translation lookup and placeholder interpolation.
- DocumentInfo is the first migrated product surface, including its user-facing validation presentation.
- Persistent metadata labels, category names, stable machine values, UUIDs and diagnostic property keys remain language-independent.
- `npm run check:i18n` validates JSON, duplicate/unknown keys and placeholder parity.
- `TRANSLATING.md` defines the GitHub translation contribution workflow.

The pilot intentionally does not migrate the whole plugin in one build. Remaining UI surfaces will move module-by-module after practical Norwegian/English testing.

**Rollback:** 0.1.211 remains the nearest product rollback. Main Bridge source/runtime behavior is unchanged.


# 0.1.215 — category i18n + hard-coded UI gate

0.1.215 continues the staged English/Norwegian internationalization from 0.1.214.

- Category bootstrap, folder selection, category editor, inheritance/override actions and validation are localized.
- Category context-menu actions and category mutation notices/errors are localized.
- Persisted category identity/data is unchanged and never rewritten on language change.
- A new `check:i18n-ui` verification step protects migrated surfaces from hard-coded UI text in future changes.
- `I18N-AUDIT.md` records remaining migration surfaces and persistent-default exceptions.
- English/Norwegian translation files remain in placeholder parity and at 100% coverage.

No PDF-runtime, metadata persistence, DocumentRecords, cache/startup, or Main Bridge production behavior is changed.


## 0.1.216 test milestone
Full command/button audit follow-up. English/Norwegian i18n expanded across remaining high-visibility UI surfaces; no persistent metadata or PDF-runtime contract change.

# 0.1.217 — localized factory defaults + reload-consistent language switching

0.1.217 closes the persistent-default gap found during the 0.1.216 menu audit.

- New root highlight-category configs use the active UI language for factory category names while retaining the same permanent UUIDs, colors and shortcuts.
- A newly created metadata schema uses the active UI language for field/option labels while retaining the same field UUIDs, properties and machine option values.
- Explicit metadata-schema reset regenerates factory labels in the currently active UI language; this is an explicit destructive/reset action, not automatic language migration.
- Newly generated standard Document Register Base comments/view text use the active UI language. Existing user-owned Base files are never rewritten.
- The canonical Base path remains `PDF Dokumentregister.base`; path identity is not made locale-dependent.
- Existing category names, metadata labels/options and Base contents remain user-owned and are never auto-translated on language change.
- UI-language switching deliberately remains reload-based so Command Palette names and open UI surfaces cannot drift into a mixed-language runtime state.
- English remains canonical fallback; Norwegian Bokmål remains complete.

No PDF runtime, annotation, selection, metadata-record, DocumentRecords, cache/startup, or Main Bridge execution contract changes.


# 0.1.218 — canonical English persistent defaults

0.1.218 replaces the localized-factory experiment from 0.1.217 with a simpler long-term contract for open-source/multilingual use.

- Factory category names are always English: Economy, Regulation, Fact, Documentation, Investigate.
- Factory metadata labels/options are always English regardless of UI language.
- `document_time` canonical label is `Document time`.
- The standard schema adds `response_sent_link` / `Sent response` with type `link` and a new permanent UUID.
- Existing eight field UUIDs/properties are unchanged.
- Existing category files, schema files and user-owned Base files are never automatically rewritten.
- Factory translation keys are removed from locale files; i18n resources now own UI presentation only.
- Standard Base generated presentation text is canonical English; the existing canonical Base path remains unchanged for compatibility during the test phase.

No PDF runtime, annotation, selection, DocumentRecords, cache/startup or Main Bridge execution contract changes.


# 0.1.219 — architecture documentation split

0.1.219 is a release-readiness documentation/governance build from 0.1.218. `ARCHITECTURE.md` is now a concise stable index and the detailed architecture contracts live in 14 domain files under `docs/architecture/`. Runtime feature ownership, Main Bridge, metadata persistence, PDF identity, annotation behavior, cache/startup and i18n behavior are unchanged.

The build adds `scripts/check-architecture-docs.js` and `npm run check:architecture-docs`; the normal `npm run check` pipeline now verifies that every canonical architecture document is indexed and that relative Markdown links resolve.
