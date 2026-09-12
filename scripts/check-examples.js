'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const fail = message => { console.error(`Example files check failed: ${message}`); process.exit(1); };

const expectedFields = [
  'document_date',
  'document_time',
  'sender',
  'document_type',
  'response_received',
  'response_received_date',
  'response_sent',
  'response_sent_date',
  'response_sent_link'
];
const systemFields = ['pdfmeta_type','pdfmeta_version','pdfmeta_id','pdfmeta_file','pdfmeta_status'];
const examplesRoot = 'Examples-Obsidian-PDFium-Gate';

const schemaSource = read('src/metadata/schema-contract.js');
const templateSource = read('src/metadata/example-files.js');
const activeExample = read('docs/examples/Example - Active PDF record.md');
const missingExample = read('docs/examples/Example - Missing PDF record.md');
const baseExample = read('docs/examples/Example PDF Document Register.base');
const schemaFeature = read('src/plugin/features/14-metadata-schema.js');
const basesFeature = read('src/plugin/features/18-document-register-bases.js');

for (const field of expectedFields) {
  if (!schemaSource.includes(`property:'${field}'`)) fail(`factory schema is missing ${field}`);
  if (!activeExample.includes(`${field}:`)) fail(`active Markdown example is missing ${field}`);
  if (!baseExample.includes(`  ${field}:`)) fail(`native Base properties are missing ${field}`);
  if (!baseExample.includes(`      - ${field}`)) fail(`native Base order is missing ${field}`);
}

for (const field of systemFields) {
  if (!activeExample.includes(`${field}:`)) fail(`active Markdown example is missing system field ${field}`);
  if (!missingExample.includes(`${field}:`)) fail(`missing Markdown example is missing system field ${field}`);
}

for (const value of ['decision','letter','report','memo']) {
  if (!schemaSource.includes(`metadataMakeOption('${value}'`)) fail(`factory document_type option is missing ${value}`);
}

if (!templateSource.includes(`const PDFIUM_EXAMPLES_ROOT = '${examplesRoot}'`)) fail('runtime example root differs from documented root');
if (!baseExample.includes(`file.inFolder(\\\"${examplesRoot}\\\")`)) fail('native Base does not filter the example folder');
if (!baseExample.includes('- type: table')) fail('example Base must use native Obsidian table view');
if (baseExample.includes('pdfium-document-register')) fail('example Base must not depend on the custom PDFium Gate view');
if (!basesFeature.includes('`${METADATA_SCHEMA_ROOT}/example-files-bootstrap.json`')) fail('one-time bootstrap marker is missing');
if (!basesFeature.includes('if (installedVersion >= PDFIUM_EXAMPLES_BOOTSTRAP_VERSION)')) fail('versioned one-time bootstrap guard is missing');
if (!basesFeature.includes('if (read.getAbstractFileByPath(example.path))')) fail('existing-file skip guard is missing');
if (!basesFeature.includes('await write.createText(example.path, example.content)')) fail('example creation path is missing');
if (basesFeature.includes('modifyText(example.path')) fail('example bootstrap must never overwrite existing files');
if (!basesFeature.includes('void this.ensureExampleFiles();')) fail('example bootstrap is not started by the Bases owner');
if (schemaFeature.includes('ensureExampleFiles') || schemaFeature.includes('example-files-bootstrap')) fail('metadata schema owner must remain isolated from example Vault writes');

console.log(`Example files OK: ${expectedFields.length} factory fields, native Base root, one-time non-overwrite bootstrap contract.`);
