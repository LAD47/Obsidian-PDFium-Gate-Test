# Annotator source boundary

The generated annotator HTML is composed in canonical order from:

1. `shell-before.html`
2. `src/bridge/annotator-messages.js`
3. `runtime-helpers.js`
4. `handler-shared.js`
5. the keyboard algorithm modules under `keyboard/`
6. the 10 request handlers under `handlers/`
7. `runtime-message-dispatch.js`
8. `shell-after.html`

`scripts/source-bundle.js` owns the exact order.

## Shared message contract

`src/bridge/annotator-messages.js` is the one source of truth for request type, exact result type, timeout/failure policy and response policy.

## Renderer transport

All renderer → annotator requests go through:

`src/plugin/features/09-annotator-host.js` → `sendAnnotatorRequest(...)`

That function owns request IDs, pending request state, timeout lifecycle, buffer cloning/transfer, `postMessage` and timing. Callers must not create parallel request transports.

## Runtime handler contract

`src/annotator/runtime-message-dispatch.js` owns the single runtime message listener. It creates request `ctx`, opens the PDF document and dispatches to exactly one request handler.

`src/annotator/handler-contracts.js` declares:

- one request type → one handler file/function owner;
- the exact shared helper dependencies allowed for that handler.

Handlers use:

- `ctx.*` for request/document/runtime state;
- `deps.*` for canonical shared helper dependencies.

Handlers must not call another request handler directly or own transport/message listeners.

## Keyboard-selection algorithm boundary

`handlers/02-keyboard-expand-selection.js` remains the sole owner of the `keyboard-expand-selection` request and of selection identity, anchor/focus, protected-seed/reversal and finalization semantics.

Physical navigation is delegated to three real algorithm modules:

- `keyboard/line-navigation.js` — line grouping, Home/End, Up/Down and page-boundary reading flow;
- `keyboard/viewport-navigation.js` — PageUp/PageDown viewport-distance navigation;
- `keyboard/word-navigation.js` — Unicode word/punctuation caret boundaries.

These modules receive explicit inputs/closures, do not read request transport directly, do not install listeners and do not own request types. Verify enforces this boundary and also prevents the request handler from reabsorbing the extracted algorithms.
