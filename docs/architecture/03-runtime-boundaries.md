# Runtime boundaries and production dataflow

This document defines the supported communication paths between Electron main, the Obsidian renderer and the annotator runtime.

## Shared production dataflow

### Main Bridge → renderer

Production asynchronous communication is event-driven:

**Main Bridge feature → `rendererEventDispatchAdapter` → validated CustomEvent → `src/plugin/features/02-renderer-bridge.js` → root-bound renderer operation port → exact owner**

`src/bridge/renderer-events.js` owns the eight production event names and payload validation.

There is exactly one physical CustomEvent injection implementation: `src/platform/renderer-event-dispatch.js`.

Diagnostics may fetch Main Bridge state on demand, but diagnostic sequence/state fields must never drive production routing.

### Renderer → annotator

Renderer annotator communication is request-driven:

**feature caller → root-bound operation port → `src/plugin/features/09-annotator-host.js::sendAnnotatorRequest(...)` → `src/bridge/annotator-messages.js` → one `postMessage` route → `runtime-message-dispatch.js` → exact handler**

`sendAnnotatorRequest(...)` owns request IDs, pending promises, timeout policy, PDF-buffer transfer and expected-result validation.

Feature files must not create parallel request maps or `postMessage` transports.

## Renderer ↔ Electron-main loading boundary

Renderer calls explicit Main Bridge methods through `MainProcessTransport` when a command requires a direct return value.

`electron.remote.require(exactPath)` is retained only inside `src/platform/electron-remote-require.js` as the current renderer→Electron-main loading adapter. It is not PDF hosting, identity or owner selection.
