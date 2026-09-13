# PDFium Gate

**PDFium Gate** is an experimental desktop plugin for [Obsidian](https://obsidian.md/) that explores a more capable, source-oriented workflow for PDF documents.

The project is built around a simple idea: a PDF should remain a durable source document, while Obsidian should provide the surrounding workspace for reading, highlighting, linking, structured metadata, document registers, notes, and long-term analysis.

> [!WARNING]
> **This is pre-release software.** It is still under active development and has not yet completed broad platform and real-world testing. Make a complete backup of your Obsidian Vault before installing or updating the plugin, especially if the Vault contains important or irreplaceable material.

## Why this project exists

PDFs are central to journalism, research, public-record work, investigations, administration, and archival projects. A useful long-term workflow needs more than a PDF viewer: it should make it easy to preserve the source, extract and cite evidence, organize documents, add structured information, and return to the exact place where a finding came from.

PDFium Gate aims to keep that work inside one Obsidian interface while avoiding unnecessary lock-in. Important metadata is stored as ordinary Markdown/YAML rather than in a proprietary plugin database, and the original PDF remains the primary source document.

The project is guided by a few principles:

- **Source first.** The PDF remains the document of record.
- **Traceability.** Quotes, selections, highlights, and notes should lead back to the source location.
- **Portable metadata.** Document metadata should remain readable and usable without the plugin.
- **Explicit identity.** The plugin should fail safely rather than guess which document or annotation a destructive action belongs to.
- **User ownership.** User-created labels, categories, metadata, and Bases remain user data and are not silently rewritten by UI-language changes.
- **One workspace.** PDF reading, annotation, metadata, and document management should feel like parts of the same Obsidian workflow.
- **Long-term maintainability.** Architecture, verification, rollback points, and migration decisions are treated as part of the product, not as afterthoughts.

## Current capabilities

The current test builds include:

- an integrated Chromium/PDFium-based PDF view inside Obsidian;
- mouse and keyboard text selection, including multi-page workflows;
- copying selected text, quotes, and Obsidian links back to PDF selections/pages;
- configurable exclusion of PDF text marked as headers/footers when copying;
- PDF highlight categories with colors and keyboard shortcuts;
- creation, category changes, and removal of PDF highlights;
- optional automatic backup before the plugin makes its first change to a PDF that does not already have a backup;
- a configurable metadata schema with text, date, time, integer, decimal, yes/no, select, multi-select, and link fields;
- **Document information** directly beside the active PDF;
- one Markdown/YAML metadata record per registered PDF, created lazily on first metadata save;
- stable UUID-based document metadata identity across normal PDF rename/move operations;
- conservative handling of deleted/missing PDFs, with explicit relinking instead of unsafe automatic rebinding;
- an Obsidian Bases-powered **PDF Document register** with schema-driven columns, sorting, datatype-aware filtering, inline editing, and missing-PDF actions;
- a canonical example set copied once into the Vault to demonstrate ordinary Markdown/YAML records and native Obsidian Bases usage;
- scalable metadata indexing with a disposable cache while Markdown/YAML remains the source of truth;
- diagnostics and benchmark tools for testing large document collections;
- a multilingual interface with live language switching.

## Languages

The complete UI currently supports:

- English
- Norwegian Bokmål
- German
- Spanish
- Swedish
- Danish
- French

English is the canonical fallback language. When **Auto** is selected, the plugin follows a supported Obsidian UI language and falls back to English for unsupported languages.

UI language is separate from regional date, time, and decimal formatting. Changing the UI language does not translate or rewrite user-owned metadata labels or category names.

Most open UI surfaces change language immediately. Command Palette display names are the known exception and refresh after the plugin is reloaded or Obsidian is restarted.

## Before you install: back up your Vault

Do not test a pre-release build against the only copy of important data.

Recommended minimum procedure:

1. Close Obsidian or make sure all pending changes have been written.
2. Make a complete copy or snapshot of the entire Vault.
3. Make sure the backup includes your PDFs, Markdown files, Bases, and the hidden `.obsidian` folder.
4. Store the backup separately from the working Vault.
5. For especially important collections, test the plugin in a copy of the Vault first.

The plugin's automatic PDF-backup feature is an additional safeguard for PDF modifications. **It is not a replacement for a full Vault backup.** The plugin also creates and updates metadata/configuration files and plugin settings during normal use.

## Installation with BRAT

PDFium Gate is not yet distributed through Obsidian Community Plugins. Current test releases are installed through [BRAT](https://github.com/TfTHacker/obsidian42-brat).

1. In Obsidian, open **Settings → Community plugins → Browse**.
2. Search for **BRAT**, install it, and enable it.
3. Use BRAT's **Add a beta plugin for testing** command.
4. Enter this repository:

   `LAD47/Obsidian-PDFium-Gate-Test`

5. Install the latest test release, or select a specific frozen release when doing controlled regression testing.
6. Enable **PDFium Gate** under Community plugins.

The repository is public, so no GitHub token is required for normal BRAT installation.

BRAT can also be used to check for and install newer test releases.

## Requirements and test status

- Desktop Obsidian only (`isDesktopOnly: true`).
- The current compatibility baseline is **Obsidian 1.13.7**.
- Most practical development and regression testing has been performed on **Windows 11**.
- The architecture is intended to remain desktop/cross-platform where Electron and Chromium permit it, but macOS and Linux have not yet received the same level of practical testing.
- The PDF integration depends on Electron/Chromium's built-in PDF viewer. Changes in future Obsidian/Electron/Chromium releases can therefore require compatibility work.

## What the plugin stores

The project deliberately separates durable user data from disposable acceleration data and internal configuration.

- `File Metadata/` contains ordinary indexed Markdown/YAML document records.
- `.pdf-metadata/` contains plugin metadata/configuration and disposable technical data such as the document-record index cache and the example-bootstrap marker.
- `PDF Dokumentregister.base` is created on demand as the standard document register. After creation it is treated as user-owned and is not silently overwritten by the plugin.
- `Examples-Obsidian-PDFium-Gate/` contains a one-time copied example set. These files are user-owned after creation and are never overwritten by the plugin.
- PDFs remain normal PDF files in the Vault.

The exact internal structures may still evolve before the project reaches a stable 1.0 release. Changes to persisted formats or file layouts require an explicit migration/backward-compatibility review before a public stable release.

## Beta limitations

This project should currently be treated as a serious test build rather than finished production software.

Known boundaries include:

- Command Palette labels require a plugin reload/restart after changing UI language.
- Chromium PDF internals are outside the plugin's control and may change with Obsidian/Electron updates.
- Cross-platform testing is not yet complete.
- Pre-1.0 builds may still change workflows, configuration, or persisted structures when testing shows that a better long-term design is needed.

If you find a reproducible problem, please open a GitHub Issue and include the Obsidian version, operating system, plugin version, what you expected, what happened, and any relevant diagnostics.

## Documentation

- [Documentation index](docs/README.md)
- [Example files](docs/examples/)
- [Architecture overview](ARCHITECTURE.md)
- [Detailed architecture contracts](docs/architecture/)
- [Translation guide](TRANSLATING.md)
- [Contributing guide](CONTRIBUTING.md)
- [Historical development notes](docs/history/DEVELOPMENT-NOTES.md)
- [Historical milestones](docs/history/MILESTONE.md)

Historical documents are retained because they explain why several architectural and UX decisions were made. They may describe experiments or policies that were later superseded; current architecture documents and source verification are authoritative.

## Development and verification

The root runtime is generated from canonical sources under `src/`.

Run the complete verification pipeline with:

```bash
npm run check
```

The pipeline builds the runtime and checks internationalization, migrated UI text, architecture documentation integrity, deterministic build output, dependency boundaries, shared-state ownership, metadata contracts, and other regression gates.

Generated root runtime files are committed so GitHub/BRAT releases can install the plugin directly.

## Release direction

The current `0.1.x` series is the development/test line. The planned public maturity sequence is:

- `0.9.x` — Beta
- `0.99.x` — Release Candidate
- `1.0.0` — stable release

The project is intentionally conservative about data ownership and migration as it approaches those milestones.

## Contributing

Testing, bug reports, translation improvements, and focused pull requests are welcome while the project matures. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting code or larger documentation changes. Translation contributors should also read [TRANSLATING.md](TRANSLATING.md); architecture contributors should start with [ARCHITECTURE.md](ARCHITECTURE.md).

## License

PDFium Gate is released under the [MIT License](LICENSE).