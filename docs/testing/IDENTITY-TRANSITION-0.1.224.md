# PDFium Gate 0.1.224 — identity transition test

0.1.224 is an identity-only build. It changes the public plugin identity from
`PDFium Gate Test` / `obsidian-pdfium-gate-test` to `PDFium Gate` / `pdfium-gate`.

No metadata schema, record identity, category UUID, PDF annotation, selection,
link, cache, or persistence contract is intentionally changed.

## Intentionally unchanged durable data

- `.pdf-metadata/`
- `File Metadata/`
- `filemeta_*`
- metadata field UUIDs/properties
- category UUIDs and category configuration
- PDF annotation/highlight data

## Installation transition for the test vault

Because the Obsidian plugin ID changes, treat 0.1.224 as a one-time installation
identity transition.

1. Confirm the old plugin is currently **PDFium Gate Test** (`obsidian-pdfium-gate-test`).
2. Close all open PDF tabs.
3. Disable the old plugin in Obsidian.
4. Close Obsidian completely.
5. Keep a backup copy of `.obsidian/plugins/obsidian-pdfium-gate-test/` until testing is accepted.
6. Rename the installed plugin folder from `obsidian-pdfium-gate-test` to `pdfium-gate`.
   This preserves `data.json` and therefore the existing plugin settings.
7. Replace the runtime files in that renamed folder with the verified 0.1.224
   `main.js`, `manifest.json`, and `styles.css`.
8. Start Obsidian and enable **PDFium Gate**.
9. Confirm that the old **PDFium Gate Test** entry is not simultaneously enabled or installed as a second active plugin.

If BRAT was managing the old identity, remove the old BRAT entry before this
one-time transition. Re-add the repository only after 0.1.224 is published and
the installed folder uses `pdfium-gate`.

## Regression test

### A — identity

- Settings → Community plugins shows **PDFium Gate**.
- The installed plugin folder is `.obsidian/plugins/pdfium-gate/`.
- There is no simultaneously active `obsidian-pdfium-gate-test` installation.
- The visible PDF banner/title says **PDFium Gate**, not **PDFium Gate Test**.

### B — settings continuity

- Existing plugin settings are preserved after the folder rename.
- Language, PDF copy/header-footer settings, metadata settings and diagnostics settings retain their previous values.

### C — core PDF regression

Repeat the normal confirmed PDF regression:

- open PDF from File Explorer;
- normal mouse selection/copy;
- keyboard selection;
- selection across a page boundary;
- selection-link creation and navigation;
- two open PDFs / active-PDF routing;
- existing highlight/category operations.

### D — metadata regression

- Document information opens immediately for the active PDF.
- Existing metadata is found.
- Edit/save works.
- PDF Document register opens and existing records are present.
- No record is duplicated merely because the plugin ID changed.

### E — persistence boundary

Verify that the identity change did **not** rename or recreate:

- `.pdf-metadata/`;
- `File Metadata/`;
- existing `filemeta_*` records.

### F — restart

Restart Obsidian once more and repeat a short PDF + Document information check.

## Acceptance

0.1.224 becomes the new user-confirmed runtime baseline only after A–F pass.
GitHub/Actions/release success alone is not runtime acceptance.

## Rollback during this pre-release transition

If 0.1.224 fails before acceptance:

1. close Obsidian;
2. restore the backed-up `obsidian-pdfium-gate-test` plugin folder;
3. remove/rename the failed `pdfium-gate` folder;
4. start Obsidian and re-enable the 0.1.223 plugin.

The durable metadata formats are intentionally unchanged, so no metadata
migration rollback is expected.
