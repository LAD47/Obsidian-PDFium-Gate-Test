# PDFium Gate platform contracts

`src/platform/` contains the explicit platform boundaries used by PDFium Gate. `src/` is authoritative; `build.js` bundles these modules directly into the release runtime. No root source-copy directory is generated.

## Runtime contract

Supported runtime: **Obsidian 1.13.7 + Electron 43.x + embedded PDF frame**.

There is no alternate separate-PDF-WebContents hosting contract.

## PDF identity

- `pdf-embedded-target.js`: logical token -> exact embedded target. Duplicate token candidates can be resolved by physical focused-frame ancestry only when focus is contractual; otherwise ambiguity fails closed.
- `pdf-wrapper-frame.js`: exact physical wrapper and `<embed>` readiness verification. Physical identity is `processId + routingId`.
- `active-pdf.js`: renderer publication of active logical PDF plus focus requirement for keyboard routing.
- `pdf-iframe.js`: exact renderer iframe rectangle for coordinate translation after owner/token are already known.
- `browser-window.js` / `screen-point.js`: exact owner-window and OS cursor coordinate boundaries.
- `pdf-leaf.js`: exact Obsidian PDF leaf resolution/activation.

Never add title-based targeting, first-match frame selection, object-reference identity, state-recency identity or a second PDF hosting model.

## PDF runtime lifecycle

Runtime registration is separate from active PDF identity. Main Bridge owns physical wrapper registration through immediate install reconciliation plus Electron `frame-created` / `did-frame-navigate`. Renderer iframe `load` and layout-ready leaf reconciliation call the same idempotent `ensurePdfRuntime(token)` contract. No delayed startup scans are part of the supported runtime.

## Main-process transport

- `electron-remote-require.js`: isolated current-runtime loader using `electron.remote.require(exactPath)`.
- `main-process-transport.js`: named renderer-facing Main Bridge API.
- `electron-focus-diagnostics.js`: focus diagnostics through the canonical renderer-to-main module loader; diagnostics never access Electron remote directly.

The word `remote` in this transport does **not** mean remote PDF hosting. It is only the current renderer -> Electron-main module-loading mechanism in Obsidian 1.13.7.

## Runtime compatibility and capabilities

- `compatibility-gate.js`: enforces exactly the supported runtime/hosting contract.
- `capabilities.js`: reports available current-runtime capabilities without probing obsolete hosting packages/models.

## Engineering rule

Feature/core code uses these contracts instead of inventing local platform fallbacks. See `IDENTITY_POLICY.md` and `RUNTIME_DRIVER_POLICY.md`.
