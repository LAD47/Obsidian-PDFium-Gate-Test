# PDF viewer identity and lifecycle

This document owns the contracts for identifying the physical Chromium PDF runtime, accessing viewer primitives and reconciling wrapper lifecycle.

## PDF identity

Identity has two layers:

- **PDF token** = logical document identity;
- **`processId + routingId`** = physical Electron/Chromium frame identity.

Rules:

1. Never use WebContents title as PDF identity.
2. Never use JavaScript object-reference equality as physical identity.
3. Never choose the first matching token/frame/window.
4. A token-like HTTP frame is not automatically the Chromium PDF wrapper.
5. Verify the wrapper with physical identity/readiness when required.
6. Ambiguity fails closed.
7. `focusedFrame` is used only when physical focus is part of the contract.
8. State freshness/gesture recency can validate state but never choose physical identity.

Canonical sources: `src/platform/pdf-embedded-target.js`, `src/platform/pdf-wrapper-frame.js`, `src/platform/IDENTITY_POLICY.md`.

## RuntimeDriver boundary

`ChromiumPdfRuntimeDriver` is the only production owner of Chromium viewer DOM/viewport/scroller primitives:

- `pdf-viewer`;
- `viewer.viewport`;
- `#scroller`;
- page-screen geometry;
- page-point conversion;
- keyboard viewport state;
- keyboard/locator overlays;
- keyboard/locator wrapper scrolling;
- viewport capture used around PDF mutation/reload.

Viewer identity is:

**verified wrapper → physical parent chain → nearest capability-verified Chromium `pdf-viewer` ancestor**

No global viewer scan and no wrapper fallback when viewer identity cannot be proven.

## PDF runtime lifecycle

Runtime registration and active PDF identity are separate contracts.

- Main Bridge reconciles wrappers that already exist when it installs.
- Owner WebContents use Electron `frame-created` and `did-frame-navigate` lifecycle events.
- Renderer iframe load/layout readiness reconciles open PDF leaves.
- Registration is idempotent and keyed by physical owner + `processId + routingId`.
- Duplicate/stale wrappers may all be instrumented because instrumentation does not select identity.
- Active identity remains separate and fail-closed.

Wrapper frame existence and wrapper DOM readiness are separate. If a physical wrapper exists before Chromium inserts `<embed>`, an idempotent wrapper-local `MutationObserver` waits for readiness and installs pointer/runtime instrumentation when `<embed>` appears.

No arbitrary startup-delay is used as the readiness mechanism.
