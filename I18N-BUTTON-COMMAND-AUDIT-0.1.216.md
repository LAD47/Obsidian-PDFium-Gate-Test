# I18N button/command audit — 0.1.216

- PDF-related Command Palette entries found: **18**.
- Commands using i18n display names: **18/18**.
- English keys: **573**.
- Norwegian keys: **573**.
- Hard-coded text button/tooltip/placeholder/aria-label candidates after exclusions: **0**.

## PDF Command Palette entries

- `copy-last-selection-link-diagnostic` → `this.i18n.t('commands.copySelectionLinkDiagnostic')`
- `copy-platform-capability-report` → `this.i18n.t('commands.copyPlatformCapabilityReport')`
- `copy-runtime-compatibility-status` → `this.i18n.t('commands.copyRuntimeCompatibilityStatus')`
- `create-category-config` → `this.i18n.t('commands.createCategoryConfig')`
- `edit-folder-category-config` → `this.i18n.t('commands.editFolderCategories')`
- `full-page-go-to-page` → `this.i18n.t('commands.goToPage')`
- `manage-metadata-fields` → `this.i18n.t('commands.manageMetadataFields')`
- `metadata-benchmark-cleanup` → `this.i18n.t('commands.benchmarkCleanup')`
- `metadata-benchmark-generate` → `this.i18n.t('commands.benchmarkGenerate')`
- `metadata-benchmark-run` → `this.i18n.t('commands.benchmarkRun')`
- `open-pdf-document-register` → `this.i18n.t('commands.openDocumentRegister')`
- `show-document-info` → `this.i18n.t('commands.showDocumentInfo')`
- `show-effective-category-config` → `this.i18n.t('commands.showEffectiveCategoryConfig')`
- `show-focus-retest-diagnostics` → `this.i18n.t('commands.showDiagnosticsNow')`
- `show-gate-status` → `this.i18n.t('commands.showGateStatus')`
- `show-last-link-intercept` → `this.i18n.t('commands.showLastMarkdownLink')`
- `toggle-diagnostics` → `this.i18n.t('commands.toggleDiagnostics')`
- `toggle-document-metadata-files` → `this.i18n.t('commands.toggleMetadataFiles')`

## Remaining hard-coded UI candidates

- **None found** in the audited button/tooltip/placeholder/aria-label sinks.

Dynamic labels already obtained from i18n/user data and language-neutral symbol buttons (`✓`, `×`, `↑`, `↓`) are intentionally excluded.

## Separate technical-language cleanup

- Deep runtime/annotator error and diagnostic strings are not treated as ordinary UI translation keys in this build.
- Some legacy technical strings are still Norwegian. They are tracked separately for later English developer/diagnostic cleanup, especially where an error might bubble into a user-facing wrapper.

## Policy

- Command IDs remain stable machine identifiers and are never translated.
- Command display names, buttons, tooltips, aria/help text and user-facing modal text are translated.
- Persistent user labels and category names are not translated automatically.
- Diagnostic payload keys remain stable technical English.
