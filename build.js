#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { moduleBody, buildAnnotatorSource, buildI18nSource, buildSharedBridgeSource, buildRendererPlatformSource, buildRendererFoundationSource, buildRendererPostNormalizationCoreSource, buildNormalizationSource, buildMetadataSource, buildMainBridgeSource, buildPluginSource } = require('./scripts/source-bundle');

const ROOT = __dirname;
function read(p){ return fs.readFileSync(path.join(ROOT,p),'utf8').replace(/\r\n?/g,'\n'); }
function write(p,s){ fs.mkdirSync(path.dirname(path.join(ROOT,p)),{recursive:true}); fs.writeFileSync(path.join(ROOT,p),s,'utf8'); }
const i18nSource = buildI18nSource(ROOT);
const sharedBridgeSource = buildSharedBridgeSource(ROOT);
const platformSource = buildRendererPlatformSource(ROOT);
const rendererFoundation = buildRendererFoundationSource(ROOT);
const rendererCore = buildRendererPostNormalizationCoreSource(ROOT);
const metadataSource = buildMetadataSource(ROOT);
const normalization = buildNormalizationSource(ROOT);
const bridge = buildMainBridgeSource(ROOT);
const annotator = buildAnnotatorSource(ROOT);
const fragments = [
  moduleBody(ROOT, 'src/plugin/plugin-state.js'),
  read('src/main/00-header.js'),
  i18nSource,
  sharedBridgeSource,
  platformSource,
  rendererFoundation,
  normalization,
  rendererCore,
  metadataSource,
  '__PDFIUM_GATE_EMBEDDED_MAIN_BRIDGE__',
  read('src/main/category-modals.js'),
  read('src/main/diagnostic-modals.js'),
  read('src/main/benchmark-modals.js'),
  read('src/main/pdfium-gate-view.js'),
  read('src/main/metadata-schema-modal.js'),
  read('src/main/pdf-document-register-bases-view.js'),
  read('src/main/example-files-installer.js'),
  read('src/main/settings.js'),
  buildPluginSource(ROOT)
];
let main = fragments.join('\n');
const bridgeMarker='__PDFIUM_GATE_EMBEDDED_MAIN_BRIDGE__';
const annotatorMarker='__PDFIUM_GATE_ANNOTATOR_HTML__';
if((main.match(new RegExp(bridgeMarker,'g'))||[]).length!==1) throw new Error('Embedded Main Bridge marker count != 1');
if((main.match(new RegExp(annotatorMarker,'g'))||[]).length!==1) throw new Error('Annotator HTML marker count != 1');
main = main.replace(bridgeMarker, `const EMBEDDED_MAIN_BRIDGE_SOURCE = ${JSON.stringify(bridge)};`);
main = main.replace(annotatorMarker, JSON.stringify(annotator));
write('main.js', main.endsWith('\n')?main:main+'\n');
write('main-bridge.js', bridge.endsWith('\n')?bridge:bridge+'\n');
// Source-of-truth lives only under src/. Runtime is fully bundled.
for (const legacyGeneratedDir of ['platform','selection']) {
  fs.rmSync(path.join(ROOT, legacyGeneratedDir), {recursive:true, force:true});
}
console.log('Built bundled root runtime from canonical src/. sources.');
