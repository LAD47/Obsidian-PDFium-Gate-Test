# PDFium Gate architecture

`ARCHITECTURE.md` is the stable entry point to the project architecture. Detailed contracts are split by domain under `docs/architecture/` so contributors can read and change one area without navigating one monolithic file.

## Architectural status

- Foundational runtime architecture reached its intended structural target in 0.1.180 and remains the rollback/runtime reference.
- `src/` is the authoritative production source; root runtime files are generated release artifacts.
- Cross-feature behavior uses explicit operation ports and one canonical owner.
- Ambiguous PDF/runtime identity fails closed.
- Markdown/YAML and explicit configuration files are persistent source of truth; RAM indexes/caches are derived.
- Factory-created persistent defaults are canonical English; i18n owns UI presentation only.

## Documentation map

1. [Architecture overview](docs/architecture/01-overview.md) — supported runtime, source of truth, composition roots and baselines.
2. [Core architecture principles](docs/architecture/02-core-principles.md) — stability policy and non-negotiable ownership rules.
3. [Runtime boundaries and production dataflow](docs/architecture/03-runtime-boundaries.md) — Electron main ↔ renderer ↔ annotator communication.
4. [Electron Main Bridge](docs/architecture/04-main-bridge.md) — physical wrapper/input/lifecycle ownership.
5. [PDF viewer identity and lifecycle](docs/architecture/05-pdf-viewer.md) — identity, RuntimeDriver and wrapper readiness.
6. [Annotations, categories and backup](docs/architecture/06-annotations-and-categories.md) — annotation invariants, category ownership and backup.
7. [Selection links and outward copy](docs/architecture/07-selection-links.md) — outward link/copy responsibility and boundaries.
8. [Metadata schema and hidden configuration](docs/architecture/08-metadata-schema.md) — schema, field identity and safe hidden config writes.
9. [Document records, identity and startup cache](docs/architecture/09-document-records.md) — Markdown records, relink, cache and startup readiness.
10. [DocumentInfo](docs/architecture/10-document-info.md) — active-PDF metadata UI and focus return.
11. [PDF Document Register / Bases](docs/architecture/11-document-register.md) — Bases query/sort/filter/edit boundaries.
12. [Internationalization](docs/architecture/12-i18n.md) — UI translation vs canonical persistent data.
13. [Testing and verification](docs/architecture/13-testing-and-verification.md) — verify gates, architecture completion and benchmarks.
14. [Release readiness](docs/architecture/14-release-readiness.md) — public versioning, migration review and distribution direction.

## Change rule

Update the smallest owning architecture document when a contract changes. Update this index only when the document map or top-level architectural status changes. Foundational runtime refactoring still requires a concrete product/platform need and corresponding verifier coverage; documentation splitting itself does not authorize structural runtime cleanup.
