# ChromiumPdfRuntimeDriver policy

## Canonical boundary

Chromium's built-in PDF viewer is an external runtime dependency. Main Bridge feature code must not directly depend on its viewer DOM/viewport implementation.

The following primitives belong to `ChromiumPdfRuntimeDriver`:

- `pdf-viewer` lookup and `viewer.viewport` access
- `#scroller` lookup/geometry
- `getPageScreenRect()` / `getPageInsetDimensions()` / `convertPageToScreen()`
- viewer coordinate capture and page-point conversion
- keyboard viewer-state/viewport-map capture
- keyboard-selection and locator overlay rendering
- one-shot keyboard/locator wrapper scroll operations

Feature code should pass a proven viewer target or canonical wrapper frame into the driver and consume the driver's typed result.

## Failure rule

Do not reintroduce local viewer DOM fallbacks. If the RuntimeDriver cannot resolve or execute the required capability, fail closed at that boundary and diagnose the driver contract.

## Reviewed exception

The native mouse-autoscroll instrumentation is a stateful wrapper lifecycle. Runtime registration may install it in every physical wrapper matching a logical token, because registration is not viewer/active-target selection. It may capture pointer/scroll state inside each registered wrapper, but it must not select a viewer frame or directly use Chromium viewer viewport APIs.

## Bug-class workflow

When Chromium/Obsidian runtime behavior changes, audit all users of the RuntimeDriver contract before patching a single call-site. Prefer one canonical driver fix and a regression test over duplicate local workarounds.
