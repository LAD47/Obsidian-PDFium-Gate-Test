# I18N migration inventory

This file tracks user-facing text that still needs to move through `I18nService` before additional community locales are treated as first-class UI languages.

English is canonical. Norwegian Bokmål is the complete reference translation during the migration.

## Migrated and protected

The following surfaces are localized and protected by automated verification against hard-coded UI text:

- Settings
- DocumentInfo, including user-facing metadata validation presentation
- Category configuration bootstrap
- Category folder picker
- Category editor, inheritance/override UI and category validation
- Category-related context menu actions
- Category highlight mutation notices/errors
- Category-related Command Palette entries
- Effective category configuration heading

`npm run check:i18n-ui` protects migrated category files/regions. Additional modules must be added to that gate as they are migrated.

## Remaining direct user-facing surfaces

### Metadata schema / field manager

- `src/main/metadata-schema-modal.js`
- field editor headings, buttons, descriptions, validation presentation and notices

### PDF Document Register

- `src/main/pdf-document-register-bases-view.js`
- headers/help text, datatype-aware filter dialogs, status/actions, relink UI and inline-edit messages

### Command Palette and general lifecycle notices

- remaining entries in `src/plugin/features/01-lifecycle.js`
- page navigation, metadata visibility, diagnostics and compatibility/support commands

### PDF viewer chrome and state messages

- `src/main/pdfium-gate-view.js`
- diagnostic header, loading/status/error text and viewer actions not already migrated for DocumentInfo

### Diagnostics

- remaining classes in `src/main/diagnostic-modals.js`
- diagnostics-related notices in plugin features
- visible labels may be translated; diagnostic JSON/property keys and machine payloads remain stable English

### Benchmark/test tools

- `src/main/benchmark-modals.js`
- `src/plugin/features/19-metadata-benchmark.js`
- replace hard-coded `toLocaleString('nb-NO')` with language-neutral or UI-language-aware presentation where appropriate

### Copy/link/highlight support messages

- remaining notices and UI strings in selection-link, annotation I/O and selection diagnostics features
- technical diagnostics should use stable English; user-facing wrappers use i18n

### Metadata record visibility / register lifecycle

- command/notices around File Explorer visibility and standard Base creation/opening

## Persistent defaults — separate policy

These are not ordinary runtime UI strings and must not be automatically rewritten when UI language changes:

- factory category names in `src/core/pdf-link-category-foundation.js`
- default metadata schema labels/options in `src/metadata/schema-contract.js`
- generated standard Base file/view/property labels in `src/metadata/document-register-base-config.js`

If defaults are localized for new installations, localization must happen only at explicit first creation/reset. After creation they are user-owned persistent data.

## Internal technical text

Source-code identifiers, comments, developer documentation and diagnostic machine keys use English. Internal Norwegian error text should gradually be converted to English unless it is intentionally presented to users through an i18n wrapper.

## Completion rule

Before adding a third first-class locale, the remaining user-facing sections above should be migrated or explicitly documented as non-UI/persistent data. `npm run check:i18n` and `npm run check:i18n-ui` must both pass.


## 0.1.216 follow-up
The 0.1.215 button/command audit was migrated in 0.1.216: all PDF command display names plus the diagnostics header, metadata-field editor, Document register, diagnostic modals and benchmark UI are now routed through i18n and protected by the hard-coded UI gate.
