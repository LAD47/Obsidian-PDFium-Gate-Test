# Documentation

This directory contains active architecture documentation, focused test notes, canonical examples, and preserved project history.

## Current technical documentation

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — stable architecture entry point.
- [`architecture/`](architecture/) — detailed architecture contracts by domain.
- [`../TRANSLATING.md`](../TRANSLATING.md) — translation contribution guide and locale policy.

The architecture documents and automated verification describe the current intended contracts. Historical notes may contain experiments or policies that have since been superseded.

## Examples

- [`examples/`](examples/) — canonical Markdown/YAML document-record examples and a native Obsidian Bases example. The plugin copies the same example set once into `Examples-Obsidian-PDFium-Gate/` in a user's Vault.

## Testing

- [`testing/BENCHMARK-TEST-0.1.203.md`](testing/BENCHMARK-TEST-0.1.203.md) — preserved benchmark procedure from the metadata startup/cache work.\n- [`testing/IDENTITY-TRANSITION-0.1.224.md`](testing/IDENTITY-TRANSITION-0.1.224.md) — one-time plugin identity transition and regression test.

## Historical development material

- [`history/DEVELOPMENT-NOTES.md`](history/DEVELOPMENT-NOTES.md) — the former root README, preserved because it contains detailed version-by-version development notes.
- [`history/MILESTONE.md`](history/MILESTONE.md) — milestone and baseline history from the metadata/document-register/i18n development sequence.
- [`history/i18n/I18N-AUDIT.md`](history/i18n/I18N-AUDIT.md) — historical i18n migration inventory.
- [`history/i18n/I18N-BUTTON-COMMAND-AUDIT-0.1.216.md`](history/i18n/I18N-BUTTON-COMMAND-AUDIT-0.1.216.md) — preserved command/button audit from 0.1.216.

## Reading historical files

Historical files are retained to preserve design reasoning and regression context. They are not automatically updated when later builds supersede an experiment or policy. When historical text conflicts with current architecture documentation, current source contracts, or automated verification, the current material wins.
