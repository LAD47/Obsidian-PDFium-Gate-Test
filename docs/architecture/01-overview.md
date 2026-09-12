# Architecture overview

This document is the high-level map of the supported runtime, source of truth, composition roots and accepted baselines. Detailed contracts live in the sibling architecture documents linked from the root `ARCHITECTURE.md`.

## Supported runtime

PDFium Gate supports one runtime contract:

**Obsidian 1.13.7 + Electron 43.x + embedded PDF frame**

Older Obsidian/Electron hosting models are not production fallbacks. Unsupported runtime/hosting shapes fail closed.

## Source of truth and release artifacts

`src/` is authoritative. Generated release runtime is intentionally small:

- `main.js` — renderer/Obsidian bundle;
- `main-bridge.js` — Electron-main bundle;
- `manifest.json`;
- `styles.css`.

Runtime does not use project-relative `require('./...')` / `require('../...')`.

`scripts/source-bundle.js` is the single composition contract used by build and verify. Root `main-bridge.js` and the Main Bridge embedded in `main.js` must represent the same generated source.

## Renderer / Obsidian plugin ownership

Canonical feature modules live under `src/plugin/features/`:

1. `01-lifecycle.js` — plugin install/uninstall and top-level lifecycle orchestration;
2. `02-renderer-bridge.js` — Main Bridge → renderer event listener/wiring boundary;
3. `03-diagnostics.js` — diagnostic/reporting behavior only;
4. `04-category-config.js` — category configuration and inheritance;
5. `05-context-menu.js` — renderer-side context inspection/menu actions;
6. `06-selection-links.js` — outward selection-link/copy creation;
7. `07-main-bridge-routing.js` — renderer handlers for bridge production events and direct Main Bridge calls;
8. `08-link-locator.js` — locator restore/navigation;
9. `09-annotator-host.js` — annotator iframe/request transport, PDF-buffer/backup host operations;
10. `10-selection-bridge.js` — keyboard/native-copy/selection bridge workflow;
11. `11-annotation-io.js` — thin annotation request wrappers;
12. `12-selection-diagnostics.js` — selection-specific diagnostic operations;
13. `13-category-mutation.js` — category write/change/remove workflow.

`src/plugin/plugin-composition.js` is the composition root.

Feature implementations do not address peer feature IDs. Cross-feature work uses root-bound operation ports:

**feature → `this.ports.<operation>()` → composition-root binding → one canonical method owner**

`src/plugin/feature-contracts.js` declares, for every feature:

- source file/class owner;
- operation ports used;
- renderer state domains accessed;
- exact mutable state fields owned by that feature.

Verify rejects undeclared ports, hidden direct cross-feature calls, duplicate providers, undeclared state access and multiple writers. The implementation dependency graph is acyclic by construction because feature modules depend on ports, not peer implementations.

`src/plugin/plugin-state.js` owns the renderer state shape. Teardown is orchestrated by lifecycle, but each feature mutates/clears its own state through its canonical cleanup method.

## Annotator ownership

The generated annotator HTML is composed from:

- `src/annotator/shell-before.html`;
- `src/bridge/annotator-messages.js`;
- `src/annotator/runtime-helpers.js`;
- `src/annotator/handler-shared.js`;
- three keyboard navigation algorithm modules under `src/annotator/keyboard/`;
- 10 request handlers under `src/annotator/handlers/`;
- `src/annotator/runtime-message-dispatch.js`;
- `src/annotator/shell-after.html`.

`src/annotator/handler-contracts.js` declares one request type → one handler owner and exact allowed `deps.*` helper dependencies.

The dispatch module owns the single message listener, creates request `ctx`, opens/closes the document boundary and calls exactly one handler. Handlers use `ctx.*` for request/document/runtime state and `deps.*` for shared helpers.

`keyboard-expand-selection` remains the only request owner and retains selection identity, anchor/focus, protected-seed/reversal and finalization semantics. Physical navigation has three explicit algorithm owners:

- `keyboard/line-navigation.js` — line/page-boundary movement and Home/End;
- `keyboard/viewport-navigation.js` — PageUp/PageDown viewport navigation;
- `keyboard/word-navigation.js` — word/punctuation navigation.

The algorithm modules receive explicit inputs and cannot own transport/request listeners. Verify also prevents the request handler from silently reabsorbing their algorithms.

## Baseline status

**0.1.180 is the authoritative user-confirmed working / architectural / rollback runtime baseline.**

0.1.181 is documentation/governance-only. 0.1.183 is the user-confirmed hidden-schema-path / dedicated-manager build. 0.1.190 is the user-confirmed permanent-category-UUID / owner-level creation build. 0.1.191 is the latest user-confirmed DocumentInfo UX baseline (A–G); 0.1.194 is the user-confirmed permanent-record/canonical-wikilink product baseline. 0.1.195 is the user-confirmed presentation-only File Explorer visibility + Bases indexing baseline. Foundational runtime rollback remains 0.1.180.
