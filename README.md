# Obsidian PDFium Gate Test

## Architecture documentation

`ARCHITECTURE.md` is the stable architecture entry point. Detailed contracts are split by domain under `docs/architecture/`, including runtime boundaries, Main Bridge, PDF identity/lifecycle, annotations/categories, metadata, DocumentRecords, DocumentInfo, Document Register/Bases, i18n, verification, and release readiness.

Run `npm run check:architecture-docs` to verify that the index is complete and that architecture Markdown links resolve. The check is also part of `npm run check`.

## 0.1.219 — architecture documentation split

0.1.219 is a documentation/governance-only release-readiness build from 0.1.218. Runtime feature ownership and behavior are unchanged. The former monolithic `ARCHITECTURE.md` is now a short top-level index pointing to 14 domain documents under `docs/architecture/`. A new architecture-doc integrity gate prevents missing/indexless domain files and broken relative Markdown links.

The release-readiness document also records the planned public sequence (`0.9.x` Beta → `0.99.x` Release Candidate → `1.0.0`) and the requirement to review migration/backward compatibility before changing persisted user-data formats after public release.


## 0.1.215 — category i18n + hard-coded UI gate

0.1.215 builds directly from 0.1.214 and continues the staged i18n migration without changing PDF runtime, metadata persistence, DocumentRecords, cache/startup, or Main Bridge logic.

- The complete category user journey now uses `I18nService`: bootstrap, folder picker, category editor, inheritance/override controls, validation, context-menu category actions, category mutation notices and the category Command Palette entries.
- User-defined category names remain persistent user data and are never auto-translated. A newly created placeholder category name is localized only at creation time.
- The effective-category diagnostic heading is localized; diagnostic machine payloads remain stable.
- `npm run check:i18n-ui` is added to the normal `npm run check` pipeline. Migrated modules/regions are protected against reintroducing hard-coded user-facing literals.
- Technical comments/diagnostic reasons in the migrated category modules are English for GitHub contributors.
- `I18N-AUDIT.md` is now a repository migration inventory for the remaining UI surfaces and the separate persistent-default policy.
- English and Norwegian Bokmål remain 100% complete for the current translation key set.

**Rollback:** 0.1.211 remains the last fully accepted product baseline before the i18n track. 0.1.214 is the immediate source rollback for this migration step.


## 0.1.214 — Settings i18n + regional cleanup

0.1.214 bygger direkte fra 0.1.213 og utvider i18n-piloten uten å endre PDF-, metadata-, DocumentRecords-, cache/startup- eller Main Bridge-logikk.

- Hele den ordinære Settings-siden bruker nå `I18nService` for norsk/engelsk presentasjon.
- Den tidligere `Locale`-innstillingen er fjernet. Den hadde ingen nødvendig selvstendig rolle når datoformat, tidsformat og desimalskilletegn allerede er egne innstillinger.
- `regionalLocale` er fjernet fra runtime settings-modellen og fra metadataformattering.
- `Ja/Nei` og `Yes/No` eies nå av UI-språket gjennom i18n, ikke av regional formatering.
- Datoformat, tidsformat og desimalskilletegn fungerer som før og er fortsatt separate fra UI-språk.
- `metadataPresentationSettings()` bygger en eksplisitt presentasjonskontekst for språkavhengige boolean-labels uten å endre persistente metadata.
- Verifieren beskytter at `Locale` ikke kommer tilbake, at Settings-flaten bruker translation keys, og at norsk/engelsk boolean-presentasjon følger UI-språket.
- English og Norsk bokmål har fortsatt 100 % dekning av det nåværende i18n-keysettet; fremtidige språk kan være ufullstendige og falle tilbake til engelsk.

**Rollback:** 0.1.211 er siste godkjente produktbaseline før i18n-sporet; 0.1.213 er nærmeste i18n-rollback.

## 0.1.213 — i18n foundation (English + Norsk bokmål)

0.1.213 bygger direkte fra 0.1.211-koden og etablerer det første internasjonaliseringsfundamentet. Den tidligere eksperimentelle 0.1.212-builden for «funn i aktiv PDF» er forkastet og brukes ikke som kilde eller baseline; versjonsnummer 0.1.212 gjenbrukes derfor ikke.

### Pilotomfang

- `src/i18n/en.json` er canonical source of truth for brukerrettet UI-tekst.
- `src/i18n/nb.json` er komplett norsk bokmål for pilotsettet.
- Engelsk fallback brukes når en oversettelse mangler.
- Ny separat Settings-verdi `uiLanguage`: `Følg Obsidian`, `English`, `Norsk bokmål`.
- UI-språk er eksplisitt separat fra regional formatering. I 0.1.213 fantes fortsatt den eldre `regionalLocale`-verdien; den fjernes i 0.1.214 fordi dato, tid og desimal allerede har egne innstillinger.
- `LocaleResolver` eier språkdeteksjon. Den prøver Obsidian `getLanguage()` når tilgjengelig og holder kompatibilitetsfallback isolert fra produktfunksjoner.
- Dokumentinfo er første migrerte produktflate: knapp/panel, handlinger, aria-tekster og brukerrettet valideringspresentasjon går gjennom i18n.
- Metadata-schemaets labels, kategorinavn, UUID-er, `pdfmeta_*`, machine values og andre persistente bruker-/maskinverdier oversettes ikke automatisk.
- `npm run check:i18n` validerer locale-JSON, ukjente keys, duplikater og `{{placeholder}}`-kontrakter. Ufullstendige fremtidige språk er tillatt fordi de faller tilbake til engelsk.
- `TRANSLATING.md` beskriver en enkel GitHub-bidragsflyt for oversettere uten kodeendringer.
- Språkvalg trer fullt i kraft etter plugin-/Obsidian-reload i denne første pilotbuilden.

Ingen PDF-, metadata-, DocumentRecords-, cache/startup-, Dokumentregister- eller Main Bridge-produksjonskontrakter er endret. Main Bridge-kilden er fortsatt bit-for-bit den samme som i 0.1.211.

**Rollback:** 0.1.211 beholdes som nærmeste produktrollback. 0.1.210 er siste fullstendig brukerbekreftede sort/filter-runtimebaseline dersom 0.1.213 skulle avdekke en generell regressjon.

## 0.1.211 — valgfri filterpersistens + konsolidering

0.1.211 bygger direkte på den brukerbekreftede 0.1.210-løsningen for enkel single-column sortering og datatype-aware kolonnefiltre. Den endrer ikke metadataformat, DocumentRecords write-path, PDF-identitet, cache/startup eller Main Bridge-runtimekontrakten.

- Ny Settings-toggle: **Husk filtre i PDF Dokumentregister**. Standard er **Av**.
- Av: headerfiltre er view-lokale og midlertidige.
- På: headerfiltre serialiseres som custom view-state under `pdfiumHeaderFilters` i den aktuelle `.base`-visningen og gjenopprettes når viewet åpnes igjen.
- Persistens bruker `BasesViewConfig.get()/set()` for custom view configuration; den skriver ikke native Bases `filters` og endrer ikke metadatarecords.
- Sortering forblir den brukerbekreftede 0.1.210-regelen: første klikk ASC, neste DESC, én kolonne om gangen via `setSortProperty`.
- Headerknappene bruker ikke lenger både HTML `title` og accessibility-label med samme tekst; dette fjerner den doble tooltip-presentasjonen.
- Intern `PLUGIN_VERSION`, `manifest.json` og `package.json` er synkronisert til 0.1.211. Runtime Main Bridge-path blir derfor `main-bridge-0.1.211.js`.
- Den feilgenererte pre-release-filen `main-bridge-0.1.205.js` ryddes bort etter at korrekt 0.1.211-bro er skrevet og lastet.

**Baseline:** 0.1.210 er siste brukerbekreftede working product baseline. 0.1.211 skal brukertestes før baseline-promotering.

## 0.1.210 — rettet Bases sort write-back

Denne testbuilden retter bare Dokumentregister-sorteringen. Klikk på en kolonne bruker nå Obsidian Bases sin dedikerte `setSortProperty`-operasjon i stedet for generisk `config.set('sort', ...)`. Én kolonne er aktiv om gangen; første klikk gir stigende, neste synkende. Datatypefiltrene er uendret.

## 0.1.209 — enkel kolonne-sortering uten Shift

0.1.209 er en avgrenset Dokumentregister-test bygget fra 0.1.208. Sorteringsinteraksjonen er nå eksplisitt låst til vanlig museklikk og én sorteringskolonne om gangen:

- første klikk på en usortert kolonne → `ASC` / stigende `↑`
- neste klikk på samme kolonne → `DESC` / synkende `↓`
- videre klikk veksler bare `ASC ↔ DESC`
- klikk på en annen kolonne gjør den til eneste sorteringskolonne og starter `ASC`
- ingen Shift+klikk eller multi-column-sortering
- datatype-aware headerfilter fra 0.1.206 beholdes uendret og kan brukes samtidig med sortering
- filteret er fortsatt transient view-state og skriver ikke `.base`-filterkonfigurasjon

Ingen metadata-, DocumentRecords-, cache/startup-, identity- eller PDF-runtimekontrakter endres.

## 0.1.208 — recovery: filter + kjent-god enkel sortering

0.1.208 bygger direkte på 0.1.207, men ruller tilbake bare den nye multi-sorteringsdelen som ga regresjon i 0.1.207. Datatype-aware headerfilter fra 0.1.206 beholdes. Kolonneklikk bruker igjen den brukerbekreftede single-column Bases-sorteringsbanen fra 0.1.206.

- vanlig klikk på kolonnenavn: ASC ↔ DESC via Bases view-config
- headerfilter kan være aktivt samtidig med sortering
- filter er fortsatt transient og skriver ikke til `.base`
- ingen Shift+multi-sort i denne recovery-builden
- ingen endring i metadataformat, DocumentRecords write-path, cache/startup eller PDF runtime

## 0.1.207 — kombinert filter + flernivåsortering (test)

0.1.207 bygger direkte på 0.1.206 og endrer bare Dokumentregisterets header-UX og verifier/CSS. Filtrering og sortering kan være aktive samtidig.

- Vanlig klikk på kolonnenavn gjør kolonnen til eneste sorteringsnøkkel og veksler stigende/synkende.
- **Shift+klikk** legger til en ny sorteringskolonne uten å fjerne eksisterende sortering.
- Videre Shift+klikk på samme kolonne går `ASC → DESC → fjern fra flernivåsortering`.
- Når flere sorteringskolonner er aktive, vises prioritet **1, 2, 3 …** ved sorteringspilen.
- Datatypefiltrene fra 0.1.206 beholdes og kombineres fortsatt som AND.
- Filtrering skjer over Bases-resultatet etter at Bases har anvendt sin sorteringskonfigurasjon, så filter og sortering virker samtidig.
- Headerfiltrene er fortsatt transiente og skriver ikke Bases `filters` eller `.base`-filen.
- Metadataformat, DocumentRecords write-path, PDF-identitet, cache/startup og Main Bridge er uendret.

## 0.1.206 — datatypebevisste kolonnefiltre (test)

0.1.206 bygger direkte på 0.1.205-testen. Endringen er avgrenset til Dokumentregisterets kolonnefilter-UX og CSS. Persistent metadataformat, DocumentRecords write-path, PDF-identitet, cache/startup og Main Bridge er uendret.

- **text/link**: tekstsøk (`contains`) i vist verdi.
- **select/multiselect**: avkryssingsvalg generert fra metadata-schemaets egne alternativer, inkludert valg for tom verdi.
- **boolean**: Alle / Ja / Nei.
- **date/time**: Fra / Til med eksisterende regional formattering og canonical validering.
- **integer/decimal**: Fra / Til med canonical parsing/validering.
- **Status**: Aktiv / Mangler.
- **PDF**: tekstsøk i filsti/filnavn.
- Flere kolonnefiltre kombineres som **OG**.
- Aktive filtre markeres i headeren og kan endres eller fjernes.
- Filtrene er fortsatt med vilje **transiente** i denne UX-testen og skriver ikke til `PDF Dokumentregister.base`.
- Klikkbar kolonne-sortering fra 0.1.205 er beholdt og går fortsatt gjennom Bases view-config.

## 0.1.205 — klikkbare kolonneoverskrifter (test)


0.1.205 bygger direkte på den brukerbekreftede 0.1.204-baselinen og tester kun Dokumentregister-UX. Ingen persistent metadata-, PDF-identitets-, cache- eller startup-kontrakt endres.

- Ny kommando: **PDF: Åpne Dokumentregister**.
- Ved første bruk opprettes `PDF Dokumentregister.base` i vault-roten hvis filen ikke finnes.
- Den genererte Base-filen filtrerer til canonical `PDF Metadata`-records, bruker custom view `pdfium-document-register`, og sorterer som standard på `document_date` nyeste først (fallback `file.mtime` hvis feltet ikke finnes).
- En eksisterende `PDF Dokumentregister.base` behandles som bruker-eid og **overskrives aldri** av pluginen.
- Registervisningen viser schema-feltene, menneskelig status **Aktiv/Mangler**, og eksplisitt **Åpne** eller **Koble til PDF…** uten å eksponere UUID eller record-filnavn.
- Inline-redigering bruker fortsatt samme FieldTypeRegistry og canonical DocumentRecords save-port som DocumentInfo.
- Sortering, filtrering og søk overlates til native Obsidian Bases.


### Dokumentregister-header test

- Klikk på kolonnenavnet: stigende ↔ synkende.
- Sortering skrives til Bases view-config og Bases leverer resultatene sortert.
- Filterikon i samme header åpner et enkelt tekstfilter for den viste kolonnen.
- Headerfiltre er med vilje midlertidige i denne testen og lagres ikke i `.base`-filen.
- Native Bases toolbar for sortering/filter/søk er fortsatt tilgjengelig.


## 0.1.203 — metadata-resolved + layout-ready + idle startup gate

DocumentRecords background warmup now waits for two independent Obsidian startup signals: the first `metadataCache` `resolved` event and `workspace.onLayoutReady()`. Only after both have been observed is warmup scheduled through browser idle. This avoids allowing an unusually early idle callback to compete with metadata-cache startup.

On-demand access remains fail-open for UX: DocumentInfo/Bases can start the canonical single-flight index build immediately before the background gate is complete. Cache format, record format, identity, lifecycle, and UI behavior are unchanged.

## 0.1.202 — idle deferred warm-cache startup

Built from 0.1.201. Persistent records and cache format are unchanged. After `workspace.onLayoutReady()`, background DocumentRecords warmup is scheduled with browser `requestIdleCallback`; if DocumentInfo/Bases needs the index first, it cancels the pending idle warmup and awaits the same single-flight build promise. No fixed startup delay is used.


## 0.1.201 — disposable document-record index cache

0.1.201 is built from the 0.1.199 benchmark implementation after rejecting the 0.1.200 concurrent-read experiment. The persistent metadata model is unchanged.

The build adds one disposable acceleration file:

```text
.pdf-metadata/document-record-index-cache.json
```

Markdown/YAML records under `PDF Metadata/` remain the permanent source of truth. The cache may be deleted at any time and is rebuilt automatically.

A cached record is accepted only when all relevant contracts match and the current Markdown `TFile` has the same canonical record path, modification time and file size. A schema signature is stored in the cache; schema changes invalidate the cache. Cached `pdfmeta_file` text is still resolved through Obsidian's current link resolver while rebuilding the RAM index, so cache reuse does not replace canonical PDF identity resolution.

If the cache is missing, invalid, stale, or cannot be written, the plugin falls back to normal Markdown reads. Cache failure is not a metadata failure.

Benchmark metrics now include cache load time, hits, misses, disk read/parse time, index populate time and cache-write time.

Rollback/comparison: 0.1.199 is the benchmark baseline. 0.1.200 is intentionally rejected due to slower cold-start and high RSS in the user's 10,000-record test.

## 0.1.216 — command/button i18n sweep
All PDF Command Palette names, diagnostics header, metadata-field editor, Document register, diagnostic dialogs and benchmark/test UI are routed through i18n. `check:i18n-ui` now protects these migrated surfaces.

## 0.1.217 — localized factory defaults

The internationalization layer now also owns the human-readable defaults created for **new** persistent configuration artifacts. New category configuration, a newly created/reset metadata schema, and newly generated standard Base presentation text use the active UI language at creation time. Stable UUIDs, metadata properties and machine values are unchanged.

Existing persistent labels are intentionally not rewritten when the UI language changes. Language changes continue to require a plugin/Obsidian reload so the Settings UI, menus and Command Palette cannot end up in a partially switched state.


## 0.1.218 — canonical English factory defaults + Sent response link

0.1.218 supersedes the 0.1.217 experiment where persistent factory labels followed the active UI language. Factory-created persistent data is now deterministic and always English, independent of UI language. Existing user-owned category/schema/Base files are not migrated or rewritten.

Canonical default categories:
- Economy
- Regulation
- Fact
- Documentation
- Investigate

Canonical default metadata schema now has nine fields:
- `document_date` — Document date — `date`
- `document_time` — Document time — `time`
- `sender` — Sender — `text`
- `document_type` — Document type — `select` (`decision`, `letter`, `report`, `memo`)
- `response_received` — Response received — `boolean`
- `response_received_date` — Response received date — `date`
- `response_sent` — Response sent — `boolean`
- `response_sent_date` — Response sent date — `date`
- `response_sent_link` — Sent response — `link`

The new field has its own permanent UUID; all existing field UUIDs/properties and document-type machine values are unchanged.
