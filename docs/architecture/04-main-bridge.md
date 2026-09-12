# Electron Main Bridge

The Main Bridge is the Electron-main ownership layer for physical PDF wrapper identity, native input/context operations and wrapper lifecycle. It must remain independent of renderer feature implementation details.

## Feature ownership and dependency direction

Canonical Main Bridge features live under `src/main-bridge/features/`:

1. `01-kernel.js` — basic target classification, descriptions and exact embedded-target primitives;
2. `02-identity-locator.js` — active identity publication and locator resolution;
3. `03-context-menu.js` — native context-menu ownership;
4. `04-selection-capture.js` — mouse/selection/gesture/viewer-state capture;
5. `05-selection-operations.js` — selection lifecycle, copy and locator operations;
6. `06-input-router.js` — keyboard/input routing;
7. `07-wrapper-lifecycle.js` — physical wrapper lifecycle, delayed `<embed>` readiness and pointer/autoscroll instrumentation;
8. `08-lifecycle.js` — install/uninstall, shortcuts and capability/state surface.

`src/main-bridge/composition.js` is the composition root and owns the shared runtime object.

Cross-feature work uses root-bound operation ports:

**feature → `__bridgeRuntime.ports.<operation>()` → composition-root binding → one canonical method owner**

`src/main-bridge/feature-contracts.js` declares feature owner, operation ports, state fields accessed and exactly one mutation owner for every Main Bridge state field.

Nested callbacks/getters use the lexical `__bridgeRuntime` host reference; they must not depend on dynamic `this` binding.

Verify rejects peer-feature addressing, hidden direct cross-feature calls, duplicate providers, undeclared port/state use and multiple writers. The implementation dependency graph is acyclic because features depend on ports rather than peer implementations.

## Boundary summary

- The composition root is `src/main-bridge/composition.js`.
- Main Bridge features communicate through `__bridgeRuntime.ports.*`.
- State mutation is single-writer and declared in `src/main-bridge/feature-contracts.js`.
- Renderer communication uses the validated renderer-event dispatch path documented in `03-runtime-boundaries.md`.
- Diagnostics may observe state but must not become a production routing mechanism.
