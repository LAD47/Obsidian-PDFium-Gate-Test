# PDF Document Register / Obsidian Bases

The custom `pdfium-document-register` view is a presentation/editing layer over Obsidian Bases and the canonical DocumentRecords write path. Bases remains query/sort owner; the custom view must not become a second metadata database.

## 0.1.196 Bases presentation and future localization boundary

The permanent metadata contract remains language-neutral. `field.property`, select/multiselect option `value`, UUID identities and `filemeta_*` system properties are storage/API identifiers, not localized UI strings.

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

## 0.1.204 standard Dokumentregister ownership

`DocumentRegisterBasesFeature` owns the end-user entry point to the document register and the **create-once** standard Base file `PDF Dokumentregister.base`. The Base file is not metadata source of truth; it is a user-facing query/view configuration over ordinary indexed Markdown records.

Creation rules:

- creation is lazy and happens only through **PDF: Åpne Dokumentregister**;
- if the canonical Base file already exists, it is reused and never modified by the plugin;
- generated membership is constrained to `File Metadata` + `filemeta_type == "pdf"`;
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

0.1.208 is a constrained recovery build for the Document Register header. Multi-column/Shift sorting from 0.1.207 was removed after a user-confirmed regression. The previously confirmed single-column Bases sorting path from 0.1.206 was restored together with the 0.1.206 datatype-aware transient header filters. No canonical metadata, DocumentRecords, cache/startup, identity, or PDF-runtime contracts changed.

## 0.1.209 simple sort interaction boundary

The PDF Document Register keeps Bases as the sole owner of query ordering. The custom view exposes only a deterministic single-column interaction: an unsorted column starts `ASC`, subsequent ordinary clicks toggle `ASC`/`DESC`, and choosing a different column replaces the previous sort key. Shift/multi-column sort behavior is intentionally absent. Existing datatype-aware header filters remain transient presentation state and may coexist with the Bases-owned sort order without writing Base filter configuration.

## 0.1.210 Bases sort write boundary

Document Register header sorting uses the Bases runtime sort operation `BasesViewConfig.setSortProperty(...)`; it must not write the serialized `sort` key through generic `config.set`. The product contract remains one active sort property, ordinary click only, ASC/DESC toggle. Header filtering remains transient view-local state and is independent of the Bases sort configuration.

## 0.1.211 optional header-filter persistence boundary

The `pdfium-document-register` custom view may optionally persist its own datatype-aware header-filter state, but this does not transfer query ownership away from Bases. The user setting `rememberDocumentRegisterFilters` is default-off. When enabled, the view serializes sanitized state under the custom view-config key `pdfiumHeaderFilters` via `BasesViewConfig.set`; on restore it reads only that key and rejects unknown filter shapes.

This custom state is distinct from native Base `filters`: the plugin must not write `config.set('filters', ...)` and must not rewrite `PDF Dokumentregister.base` directly. Native Bases continues to determine query membership and sort order; the custom view only narrows the already-produced result for its own header-filter UX.

0.1.211 also restores release-version consistency: renderer `PLUGIN_VERSION`, manifest/package version, and the generated runtime bridge filename are aligned. The stale pre-release `main-bridge-0.1.205.js` may be removed only after the current versioned bridge has been successfully written and loaded. The Main Bridge source itself is unchanged.

## 0.1.223 profile filter

The standard PDF Document Register remains a PDF-specific user view, but its Base filter now targets the generic record layer with both `filemeta_type == "pdf"` and `filemeta_profile == "document"`. This keeps the current UI simple while allowing future registers to select other type/profile combinations.
