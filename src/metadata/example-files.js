'use strict';

const PDFIUM_EXAMPLES_ROOT = 'Examples-Obsidian-PDFium-Gate';
const PDFIUM_EXAMPLES_BOOTSTRAP_VERSION = 1;
const PDFIUM_EXAMPLE_ACTIVE_RECORD_ID = '11111111-1111-4111-8111-111111111111';
const PDFIUM_EXAMPLE_MISSING_RECORD_ID = '22222222-2222-4222-8222-222222222222';

function metadataExampleReadmeMarkdown() {
  return `# PDFium Gate examples

This folder is created once by PDFium Gate Test so you can inspect the plugin's metadata model with ordinary Obsidian files.

The files in this folder are **examples only**. They are deliberately stored outside \`PDF Metadata/\`, so PDFium Gate does not index them as real document records. Obsidian Bases can still read their YAML/frontmatter directly.

## Included files

- \`Example - Active PDF record.md\` — a complete example using all current factory metadata fields.
- \`Example - Missing PDF record.md\` — an example of a preserved record whose PDF is missing.
- \`Example PDF Document Register.base\` — a native Obsidian Bases table that reads the two example Markdown notes directly, without the PDFium Gate custom Base view.

## Important

Do not move these example Markdown files unchanged into \`PDF Metadata/\`. They contain fixed sample UUIDs and placeholder PDF links.

PDFium Gate never overwrites files in this example folder. You may edit, rename, copy, or delete them. The initial example set is copied only once for this example-set version.
`;
}

function metadataExampleActiveRecordMarkdown() {
  const schema = metadataDefaultSchema();
  return metadataRecordSerializeMarkdown({
    id:PDFIUM_EXAMPLE_ACTIVE_RECORD_ID,
    pdfPath:'Example Documents/example-letter.pdf',
    status:METADATA_RECORD_STATUS_ACTIVE,
    values:{
      document_date:'2016-03-17',
      document_time:'14:35',
      sender:'Example Municipality',
      document_type:'letter',
      response_received:true,
      response_received_date:'2016-03-24',
      response_sent:true,
      response_sent_date:'2016-03-25',
      response_sent_link:'[[Example Documents/example-response.md]]'
    }
  }, schema) + '# Example active PDF metadata record\n\nThis is an ordinary Markdown note with YAML/frontmatter. Obsidian Bases can use the properties directly.\n';
}

function metadataExampleMissingRecordMarkdown() {
  const schema = metadataDefaultSchema();
  return metadataRecordSerializeMarkdown({
    id:PDFIUM_EXAMPLE_MISSING_RECORD_ID,
    pdfPath:'Example Documents/missing-example-decision.pdf',
    status:METADATA_RECORD_STATUS_MISSING,
    values:{
      document_date:'2015-11-02',
      sender:'Example Public Office',
      document_type:'decision',
      response_received:false,
      response_sent:false
    }
  }, schema) + '# Example missing-PDF metadata record\n\nThe metadata survives even when the linked PDF is missing. The record can later be explicitly relinked by PDFium Gate.\n';
}

function metadataExampleNativeBaseYaml() {
  const schema = metadataDefaultSchema();
  const fields = metadataDocumentRegisterBaseFields(schema);
  const q = value => JSON.stringify(String(value));
  const lines = [
    '# PDFium Gate examples — native Obsidian Bases view',
    '# This Base intentionally uses the built-in table view, not the PDFium Gate custom view.',
    'filters:',
    '  and:',
    `    - ${q(`file.inFolder("${PDFIUM_EXAMPLES_ROOT}")`)}`,
    `    - ${q('pdfmeta_type == "pdf_document"')}`,
    'properties:'
  ];
  for (const field of fields) {
    lines.push(`  ${field.property}:`);
    lines.push(`    displayName: ${q(field.label)}`);
  }
  lines.push('  pdfmeta_status:');
  lines.push(`    displayName: ${q('Status')}`);
  lines.push('  pdfmeta_file:');
  lines.push(`    displayName: ${q('PDF')}`);
  lines.push('  pdfmeta_id:');
  lines.push(`    displayName: ${q('Metadata ID')}`);
  lines.push('views:');
  lines.push('  - type: table');
  lines.push(`    name: ${q('PDF metadata examples')}`);
  lines.push('    order:');
  for (const field of fields) lines.push(`      - ${field.property}`);
  lines.push('      - pdfmeta_status');
  lines.push('      - pdfmeta_file');
  lines.push('      - pdfmeta_id');
  lines.push('    sort:');
  lines.push('      - property: document_date');
  lines.push('        direction: DESC');
  return `${lines.join('\n')}\n`;
}

function metadataExampleFiles() {
  return Object.freeze([
    Object.freeze({ path:`${PDFIUM_EXAMPLES_ROOT}/README.md`, content:metadataExampleReadmeMarkdown() }),
    Object.freeze({ path:`${PDFIUM_EXAMPLES_ROOT}/Example - Active PDF record.md`, content:metadataExampleActiveRecordMarkdown() }),
    Object.freeze({ path:`${PDFIUM_EXAMPLES_ROOT}/Example - Missing PDF record.md`, content:metadataExampleMissingRecordMarkdown() }),
    Object.freeze({ path:`${PDFIUM_EXAMPLES_ROOT}/Example PDF Document Register.base`, content:metadataExampleNativeBaseYaml() })
  ]);
}

module.exports = {
  PDFIUM_EXAMPLES_ROOT,
  PDFIUM_EXAMPLES_BOOTSTRAP_VERSION,
  PDFIUM_EXAMPLE_ACTIVE_RECORD_ID,
  PDFIUM_EXAMPLE_MISSING_RECORD_ID,
  metadataExampleReadmeMarkdown,
  metadataExampleActiveRecordMarkdown,
  metadataExampleMissingRecordMarkdown,
  metadataExampleNativeBaseYaml,
  metadataExampleFiles
};
