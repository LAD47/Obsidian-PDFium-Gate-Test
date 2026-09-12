# PDFium Gate example files

These files mirror the example set that PDFium Gate Test copies once into a user's Vault under:

`Examples-Obsidian-PDFium-Gate/`

They demonstrate that PDFium Gate document records are ordinary Markdown notes with YAML/frontmatter that native Obsidian Bases can read directly.

The example records intentionally live outside the real `PDF Metadata/` record tree. They use fixed sample UUIDs and placeholder PDF links and must not be treated as production records.

Included examples:

- `Example - Active PDF record.md` — complete factory-schema example using all nine current user metadata fields.
- `Example - Missing PDF record.md` — preserved metadata for a PDF that is marked missing.
- `Example PDF Document Register.base` — native Obsidian Bases table reading these example notes without the custom PDFium Gate Base view.

The canonical factory field names used here are:

- `document_date`
- `document_time`
- `sender`
- `document_type`
- `response_received`
- `response_received_date`
- `response_sent`
- `response_sent_date`
- `response_sent_link`

System fields are:

- `pdfmeta_type`
- `pdfmeta_version`
- `pdfmeta_id`
- `pdfmeta_file`
- `pdfmeta_status`
