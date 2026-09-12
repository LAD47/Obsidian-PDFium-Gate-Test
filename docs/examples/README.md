# PDFium Gate example files

These files are the canonical example set for PDFium Gate Test. From plugin Settings, the user can explicitly copy the same set into the Vault under:

`Examples-Obsidian-PDFium-Gate/`

Nothing is copied automatically. Before the copy starts, PDFium Gate warns that existing files with the same four example filenames in that folder will be overwritten. Other files in the folder are left untouched. Running the action again is therefore a simple way to restore the canonical examples.

The files demonstrate that PDFium Gate document records are ordinary Markdown notes with YAML/frontmatter that native Obsidian Bases can read directly.

The example records intentionally live outside the real `PDF Metadata/` record tree. They use fixed sample UUIDs and placeholder PDF links and must not be treated as production records.

Included examples:

- `README.md` — explains the copied example folder and overwrite behavior.
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

The `document_type` examples use the stable canonical values `decision`, `letter`, `report`, and `memo`; display labels are presentation and may vary by UI language.
