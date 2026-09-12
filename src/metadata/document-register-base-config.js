'use strict';

const PDF_DOCUMENT_REGISTER_BASE_VIEW_TYPE = 'pdfium-document-register';
const PDF_DOCUMENT_REGISTER_STANDARD_BASE_PATH = 'PDF Dokumentregister.base';
const PDF_DOCUMENT_REGISTER_STANDARD_VIEW_NAME = 'Document Register';

function metadataDocumentRegisterYamlString(value) {
  return JSON.stringify(String(value == null ? '' : value));
}

function metadataDocumentRegisterBaseFields(schema) {
  return (Array.isArray(schema?.fields) ? schema.fields : [])
    .filter(field => field && field.active !== false && field.show_in_default_base !== false && String(field.property || '').trim())
    .map(field => ({
      property:String(field.property || '').trim(),
      label:String(field.label || field.property || '').trim() || String(field.property || '').trim()
    }));
}

function metadataDocumentRegisterStandardBaseYaml(schema) {
  const fields = metadataDocumentRegisterBaseFields(schema);
  const lines = [
    '# PDFium Gate Test — standard Document Register',
    '# Created by the plugin. After creation this is a normal user-owned Obsidian Base.',
    '# The plugin will not overwrite later changes to this file.', 
    'filters:',
    '  and:',
    `    - ${metadataDocumentRegisterYamlString('file.inFolder("File Metadata")')}`,
    `    - ${metadataDocumentRegisterYamlString('filemeta_type == "pdf"')}`,
    `    - ${metadataDocumentRegisterYamlString('filemeta_profile == "document"')}`,
    'properties:'
  ];

  for (const field of fields) {
    lines.push(`  ${field.property}:`);
    lines.push(`    displayName: ${metadataDocumentRegisterYamlString(field.label)}`);
  }
  lines.push('  filemeta_status:');
  lines.push(`    displayName: ${metadataDocumentRegisterYamlString('Status')}`);
  lines.push('  filemeta_file:');
  lines.push(`    displayName: ${metadataDocumentRegisterYamlString('PDF')}`);
  lines.push('views:');
  lines.push(`  - type: ${PDF_DOCUMENT_REGISTER_BASE_VIEW_TYPE}`);
  lines.push(`    name: ${metadataDocumentRegisterYamlString(PDF_DOCUMENT_REGISTER_STANDARD_VIEW_NAME)}`);
  lines.push('    order:');
  for (const field of fields) lines.push(`      - ${field.property}`);
  lines.push('      - filemeta_status');
  lines.push('      - filemeta_file');

  const hasDocumentDate = fields.some(field => field.property === 'document_date');
  lines.push('    sort:');
  lines.push(`      - property: ${hasDocumentDate ? 'document_date' : 'file.mtime'}`);
  lines.push('        direction: DESC');
  return `${lines.join('\n')}\n`;
}

module.exports = {
  PDF_DOCUMENT_REGISTER_BASE_VIEW_TYPE,
  PDF_DOCUMENT_REGISTER_STANDARD_BASE_PATH,
  PDF_DOCUMENT_REGISTER_STANDARD_VIEW_NAME,
  metadataDocumentRegisterBaseFields,
  metadataDocumentRegisterStandardBaseYaml
};
