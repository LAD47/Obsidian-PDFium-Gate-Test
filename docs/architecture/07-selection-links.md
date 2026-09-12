# Selection links and outward copy

Selection links are an outward representation of a verified internal PDF selection. This layer must never become a second identity or annotation owner.

## Ownership

`src/plugin/features/06-selection-links.js` owns outward selection-link/copy creation. It consumes verified selection state through declared operation ports and does not own PDF runtime identity, annotation reconstruction or metadata persistence.

## Core invariants

- INTERNAL selection identity remains authoritative for reconstruction.
- OUTWARD text is user-facing display/copy data only.
- Header/footer filtering may affect outward text but must never decide internal selection identity.
- Page/selection locators must resolve through the canonical PDF identity and locator contracts.
- Copy/link behavior must not create an alternate transport or independent active-PDF selector.

## Related contracts

See `05-pdf-viewer.md` for PDF identity/runtime targeting, `06-annotations-and-categories.md` for selection/annotation invariants, and `03-runtime-boundaries.md` for renderer↔annotator transport.
