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
const supportedLocales = ['en','nb','de','es','sv','da','fr'];
const installerTextKeys = ['name','description','button','confirm','success','failed'];

const schemaSource = read('src/metadata/schema-contract.js');
const templateSource = read('src/metadata/example-files.js');
const activeExample = read('docs/examples/Example - Active PDF record.md');
const missingExample = read('docs/examples/Example - Missing PDF record.md');
const baseExample = read('docs/examples/Example PDF Document Register.base');
const schemaFeature = read('src/plugin/features/14-metadata-schema.js');
const settingsSource = read('src/main/settings.js');

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

for (const locale of supportedLocales) {
  if (!templateSource.includes(`${locale}:Object.freeze({`)) fail(`example installer text is missing locale ${locale}`);
}
for (const key of installerTextKeys) {
  const occurrences=(templateSource.match(new RegExp(`\\b${key}:'`,'g'))||[]).length;
  if (occurrences < supportedLocales.length) fail(`example installer text key ${key} is incomplete (${occurrences}/${supportedLocales.length})`);
}

if (!templateSource.includes(`const PDFIUM_EXAMPLES_ROOT = '${examplesRoot}'`)) fail('runtime example root differs from documented root');
if (!baseExample.includes(`file.inFolder(\\\"${examplesRoot}\\\")`)) fail('native Base does not filter the example folder');
if (!baseExample.includes('- type: table')) fail('example Base must use native Obsidian table view');
if (baseExample.includes('pdfium-document-register')) fail('example Base must not depend on the custom PDFium Gate view');

if (schemaFeature.includes('example-files-bootstrap.json')) fail('automatic example bootstrap marker must not exist');
if (schemaFeature.includes('_ensureMetadataExampleFiles')) fail('automatic example bootstrap method must not exist');
if (!schemaFeature.includes('async installMetadataExampleFiles()')) fail('explicit example installer port is missing');
if (!schemaFeature.includes('await write.createText(example.path, example.content)')) fail('new example creation path is missing');
if (!schemaFeature.includes('await write.modifyText(existing, example.content)')) fail('confirmed overwrite path is missing');
if (!settingsSource.includes('this.plugin.ports.installMetadataExampleFiles()')) fail('Settings does not invoke the explicit example installer');
if (!settingsSource.includes("window.confirm(exampleText('confirm'")) fail('Settings overwrite confirmation is missing');
if (!settingsSource.includes("setButtonText(exampleText('button'))")) fail('Settings example button is missing');

console.log(`Example files OK: ${expectedFields.length} factory fields, ${supportedLocales.length} installer languages, native Base root, explicit overwrite-confirmed Settings installer.`);
