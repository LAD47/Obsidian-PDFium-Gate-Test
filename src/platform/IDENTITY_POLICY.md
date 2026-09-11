# PDF identity and readiness policy

## Canonical identity hierarchy

1. PDF token = logical document identity.
2. owner WebContents identity = `webContents.id`.
3. physical frame identity = `processId + routingId`.
4. actual Chromium PDF wrapper readiness/identity = token match plus `<embed>` verification where required.
5. Chromium viewer identity = verified wrapper ancestry through `ChromiumPdfRuntimeDriver`.

## Mandatory rules

- Ambiguity is an error. Never choose the first token/frame/window match.
- JavaScript object identity is not physical identity.
- WebContents title is not PDF identity.
- State freshness/gesture recency is never physical identity.
- `focusedFrame` may disambiguate only when physical focus is part of the contract.
- Readiness-only operations such as locator must not pretend that current keyboard focus is required.
- A capability/readiness probe may verify a candidate but must not silently invent a new target-selection rule.

## Canonical wrapper boundary

`src/platform/pdf-wrapper-frame.js` owns exact wrapper resolution and verified execution:

- `resolveExact()` — synchronous target-aware wrapper resolution.
- `resolveExactVerified()` — `<embed>`-verified wrapper resolution.
- `executeExactVerified()` — verified wrapper resolution plus execution.

Feature code must not locally enumerate token-like frames and select one by first match, timestamp or viewer state.

## Reviewed instrumentation exception

`ensurePdfRuntime()` and install-time runtime reconciliation may enumerate physical wrapper frames in order to install idempotent wrapper instrumentation. This is instrumentation, not target selection: every matching physical wrapper may be registered, including stale/new duplicates for the same logical token. This enumeration must never choose the active PDF, choose a Chromium viewer, or override canonical PDF identity.

## RuntimeDriver viewer rule

`ChromiumPdfRuntimeDriver.resolveViewerFrame()` starts at a verified HTTP wrapper, walks only its physical parent chain, selects the nearest Chromium `pdf-viewer` ancestor that passes the viewer capability probe, and fails closed if none can be proven.

## Verify policy

Verify must protect these semantic contracts and reject reintroduction of known bad identity classes. New exceptions require explicit documentation here.
