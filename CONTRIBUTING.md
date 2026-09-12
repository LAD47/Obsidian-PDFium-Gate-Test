# Contributing to PDFium Gate Test

Thank you for helping improve PDFium Gate Test.

The project is still in pre-release development. Contributions are welcome, but changes should remain focused, reviewable, and conservative about user data.

## Before contributing

Please read:

- [README.md](README.md) for the project goals and current beta status;
- [ARCHITECTURE.md](ARCHITECTURE.md) for the stable architecture entry point;
- [docs/architecture/](docs/architecture/) for detailed technical contracts;
- [TRANSLATING.md](TRANSLATING.md) for translation work.

The current practical compatibility baseline is Obsidian 1.13.7. Most regression testing has been performed on Windows 11. macOS and Linux testing is especially useful.

## Report a bug

Please open a GitHub Issue and include, when relevant:

- PDFium Gate Test version;
- Obsidian version;
- operating system;
- clear reproduction steps;
- expected behavior;
- actual behavior;
- whether the problem reproduces in a fresh/test Vault;
- relevant diagnostics or console output.

Do not attach private documents, confidential metadata, access tokens, passwords, or other secrets to public issues.

## Safety and test data

PDFium Gate can modify PDFs and create or update metadata/configuration files in a Vault.

When testing development builds:

1. use a test Vault or a disposable copy of real data whenever possible;
2. keep a complete backup of the Vault, including `.obsidian`;
3. do not rely on the plugin's per-PDF backup feature as a replacement for a full Vault backup.

## Pull requests

Prefer small, single-purpose pull requests. Avoid combining refactoring, feature work, UI changes, persistence changes, and documentation cleanup unless they are inseparable.

A good pull request should explain:

- what problem it solves;
- what changed;
- what intentionally did not change;
- how it was tested;
- whether it affects persisted user data, file layout, metadata identity, PDF mutation, or migration behavior.

If a change modifies persisted formats, file layouts, configuration structures, document identity, or other durable user data, call that out explicitly. Migration and backward compatibility must be reviewed before such changes are accepted for public releases.

## Source and generated runtime

Canonical source lives under `src/`.

The root runtime files are generated and committed for release/install workflows. Do not treat generated `main.js` as the primary source for feature changes.

Before submitting a code change, run:

```bash
npm run check
```

The verification pipeline covers the build, internationalization, architecture documentation, deterministic output, dependency boundaries, shared-state ownership, metadata contracts, and other regression gates.

A pull request should not deliberately weaken or bypass a verification gate just to make a change pass.

## Architecture rules

The project currently protects several architectural properties that should remain intact unless a deliberate architecture change is discussed first:

- zero dependency cycles;
- zero shared mutable-state writers;
- zero hidden cross-feature calls;
- explicit ownership of persistence and runtime boundaries;
- Markdown/YAML document metadata remains the durable source of truth;
- ambiguous or destructive identity decisions should fail safely rather than guess.

Avoid reaching across feature boundaries when an explicit operation/port already exists.

## Internationalization

English is the canonical UI source language. Officially supported locales must remain complete and pass the i18n checks.

For translation-only changes, follow [TRANSLATING.md](TRANSLATING.md). Do not translate stable identifiers, UUIDs, `pdfmeta_*` properties, machine values, paths, or user-owned labels.

## Documentation

Current technical contracts live under [docs/architecture/](docs/architecture/). Historical experiments and superseded development notes live under `docs/history/` and should not be treated as current specifications.

When behavior changes, update the relevant current documentation in the same pull request when practical.

## Coding style and scope

Match the surrounding code and keep changes easy to audit. Prefer explicit behavior over clever abstractions, especially around PDF identity, persistence, backup, and user data.

Do not add dependencies unless they provide clear value and the maintenance/license cost is justified.

## License

By contributing to this repository, you agree that your contributions are licensed under the project's [MIT License](LICENSE).
