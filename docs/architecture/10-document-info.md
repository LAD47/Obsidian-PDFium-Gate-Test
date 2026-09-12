# DocumentInfo

DocumentInfo is the active-PDF metadata inspection/editing surface. It consumes the canonical schema and document-record write path rather than owning persistence.

## DocumentInfo vertical slice

DocumentInfo is a renderer-side product feature that consumes the canonical metadata schema through an explicit plugin port. Its UI is embedded beside the existing PDF stage and follows the canonical active PDF leaf. It does not own or infer a second active-PDF identity.

Field behavior is centralized in `src/metadata/field-type-registry.js`; each schema type owns parse, normalize, validate, serialize, read formatting and edit rendering. Since 0.1.192, DocumentInfo reads and saves through the canonical document-record ports; it no longer owns a RAM-only value store.

Focus return after DocumentInfo interactions is exact-token routed. The plugin verifies the loaded leaf/token, invokes `MainProcessTransport.focusPdfRuntime()`, and the Main Bridge resolves the verified embedded target. Chromium viewer DOM focus remains RuntimeDriver-owned via `focusViewerRuntime()`.
