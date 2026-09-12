'use strict';
const fs = require('fs');
const path = require('path');

const ANNOTATOR_HANDLER_ORDER = Object.freeze([
  'handlers/01-prewarm-keyboard-model.js',
  'handlers/02-keyboard-expand-selection.js',
  'handlers/03-filter-selection-artifacts.js',
  'handlers/04-find-selection.js',
  'handlers/05-inspect-point-highlights.js',
  'handlers/06-inspect-selection-highlights.js',
  'handlers/07-read-existing-highlight-selection.js',
  'handlers/08-modify-existing-highlight.js',
  'handlers/09-write-selection-highlight.js',
  'handlers/10-write-highlight.js'
]);

const ANNOTATOR_KEYBOARD_ORDER = Object.freeze([
  'keyboard/line-navigation.js',
  'keyboard/viewport-navigation.js',
  'keyboard/word-navigation.js'
]);

const ANNOTATOR_RUNTIME_ORDER = Object.freeze([
  'runtime-helpers.js',
  'handler-shared.js',
  'handler-contracts.js',
  ...ANNOTATOR_KEYBOARD_ORDER,
  ...ANNOTATOR_HANDLER_ORDER,
  'runtime-message-dispatch.js'
]);

const SHARED_BRIDGE_ORDER = Object.freeze([
  'renderer-events.js'
]);

const ANNOTATOR_MESSAGE_CONTRACT_ORDER = Object.freeze([
  'annotator-messages.js'
]);

const RENDERER_PLATFORM_ORDER = Object.freeze([
  'pdf-leaf.js',
  'obsidian-command-execution.js',
  'obsidian-open-link-hook.js',
  'obsidian-link-resolution.js',
  'obsidian-markdown-link.js',
  'obsidian-view-registry.js',
  'clipboard-text.js',
  'text-metrics.js',
  'obsidian-plugin-data.js',
  'obsidian-plugin-paths.js',
  'obsidian-plugin-registration.js',
  'node-filesystem.js',
  'compatibility-gate.js',
  'obsidian-workspace-lifecycle.js',
  'obsidian-vault-lifecycle.js',
  'obsidian-metadata-cache.js',
  'obsidian-frontmatter.js',
  'obsidian-vault-read.js',
  'obsidian-vault-write.js',
  'obsidian-adapter-file-store.js',
  'electron-remote-require.js',
  'electron-focus-diagnostics.js',
  'main-process-transport.js'
]);

const I18N_LOCALE_ORDER = Object.freeze(['en','nb','de','es','sv','da','fr']);

const METADATA_SOURCE_ORDER = Object.freeze([
  'schema-contract.js',
  'field-type-registry.js',
  'base-presentation.js',
  'document-register-base-config.js',
  'schema-repository.js',
  'record-contract.js',
  'record-index-cache.js',
  'benchmark-contract.js',
  'record-repository.js'
]);

const RENDERER_FOUNDATION_ORDER = Object.freeze([
  'pdf-link-category-foundation.js'
]);

const RENDERER_POST_NORMALIZATION_CORE_ORDER = Object.freeze([
  'pdfjs-selection-geometry.js',
  'pdfjs-selection-mapping.js',
  'category-config-serialization.js',
  'safe-config-file-write.js'
]);

const MAIN_BRIDGE_RUNTIME_ORDER = Object.freeze([
  'chromium-pdf-runtime-driver.js'
]);

const MAIN_BRIDGE_PLATFORM_ORDER = Object.freeze([
  'pdf-wrapper-frame.js',
  'pdf-embedded-target.js',
  'active-pdf.js',
  'pdf-iframe.js',
  'browser-window.js',
  'screen-point.js',
  'renderer-event-dispatch.js',
  'obsidian-command-dispatch.js'
]);

const MAIN_BRIDGE_FEATURE_ORDER = Object.freeze([
  '01-kernel.js',
  '02-identity-locator.js',
  '03-context-menu.js',
  '04-selection-capture.js',
  '05-selection-operations.js',
  '06-input-router.js',
  '07-wrapper-lifecycle.js',
  '08-lifecycle.js'
]);

const PLUGIN_FEATURE_ORDER = Object.freeze([
  '01-lifecycle.js',
  '02-renderer-bridge.js',
  '03-diagnostics.js',
  '04-category-config.js',
  '05-context-menu.js',
  '06-selection-links.js',
  '07-main-bridge-routing.js',
  '08-link-locator.js',
  '09-annotator-host.js',
  '10-selection-bridge.js',
  '11-annotation-io.js',
  '12-selection-diagnostics.js',
  '13-category-mutation.js',
  '14-metadata-schema.js',
  '15-document-info.js',
  '16-document-records.js',
  '17-document-record-visibility.js',
  '18-document-register-bases.js',
  '19-metadata-benchmark.js'
]);

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function moduleBody(root, rel) {
  let source = read(root, rel).replace(/^'use strict';\s*/, '');
  const exportAt = source.lastIndexOf('module.exports');
  if (exportAt >= 0) source = source.slice(0, exportAt);
  return source.trimEnd() + '\n';
}

function buildAnnotatorSource(root) {
  return [
    read(root, 'src/annotator/shell-before.html'),
    ...ANNOTATOR_MESSAGE_CONTRACT_ORDER.map(file => moduleBody(root, `src/bridge/${file}`)),
    read(root, 'src/annotator/runtime-helpers.js'),
    moduleBody(root, 'src/annotator/handler-shared.js'),
    ...ANNOTATOR_KEYBOARD_ORDER.map(file => moduleBody(root, `src/annotator/${file}`)),
    ...ANNOTATOR_HANDLER_ORDER.map(file => moduleBody(root, `src/annotator/${file}`)),
    read(root, 'src/annotator/runtime-message-dispatch.js'),
    read(root, 'src/annotator/shell-after.html')
  ].join('');
}

function buildI18nSource(root) {
  const dictionaries=Object.fromEntries(I18N_LOCALE_ORDER.map(locale=>[
    locale,
    JSON.parse(read(root, `src/i18n/${locale}.json`))
  ]));
  const serialized=I18N_LOCALE_ORDER
    .map(locale=>`${JSON.stringify(locale)}:Object.freeze(${JSON.stringify(dictionaries[locale])})`)
    .join(',');
  return [
    `const PDFIUM_I18N_TRANSLATIONS = Object.freeze({${serialized}});`,
    moduleBody(root, 'src/i18n/locale-resolver.js'),
    moduleBody(root, 'src/i18n/i18n-service.js')
  ].join('\n');
}

function buildSharedBridgeSource(root) {
  return [...SHARED_BRIDGE_ORDER,...ANNOTATOR_MESSAGE_CONTRACT_ORDER].map(file => moduleBody(root, `src/bridge/${file}`)).join('\n');
}

function buildRendererPlatformSource(root) {
  const parts = [];
  for (const file of RENDERER_PLATFORM_ORDER) {
    parts.push(moduleBody(root, `src/platform/${file}`));
    if (file === 'clipboard-text.js') parts.push('const clipboardTextAdapter = createClipboardTextAdapter({ clipboard:electronClipboard });\n');
    if (file === 'text-metrics.js') parts.push("const textMetricsAdapter = createTextMetricsAdapter({\n  document: typeof document !== 'undefined' ? document : null\n});\n");
  }
  return parts.join('\n');
}

function buildRendererFoundationSource(root) {
  return RENDERER_FOUNDATION_ORDER.map(file => read(root, `src/core/${file}`)).join('\n');
}

function buildRendererPostNormalizationCoreSource(root) {
  return RENDERER_POST_NORMALIZATION_CORE_ORDER.map(file => moduleBody(root, `src/core/${file}`)).join('\n');
}

function buildNormalizationSource(root) {
  return [
    '// BEGIN GENERATED TEXT NORMALIZATION CONTRACT',
    '// Source: src/selection/text-normalization.js (bundled at build time; no runtime local require).',
    moduleBody(root, 'src/selection/text-normalization.js').trimEnd(),
    '// END GENERATED TEXT NORMALIZATION CONTRACT',
    ''
  ].join('\n');
}

function buildMetadataSource(root) {
  return METADATA_SOURCE_ORDER.map(file => moduleBody(root, `src/metadata/${file}`)).join('\n');
}

function buildMainBridgeSource(root) {
  return [
    read(root, 'src/main-bridge/header.js'),
    '// BEGIN GENERATED SHARED BRIDGE CONTRACTS',
    ...SHARED_BRIDGE_ORDER.map(file => moduleBody(root, `src/bridge/${file}`)),
    '// END GENERATED SHARED BRIDGE CONTRACTS',
    '// BEGIN GENERATED MAIN-BRIDGE RUNTIME CONTRACTS',
    '// Sources: canonical src/runtime modules; bundled at build time; no runtime local require.',
    ...MAIN_BRIDGE_RUNTIME_ORDER.map(file => moduleBody(root, `src/runtime/${file}`)),
    '// END GENERATED MAIN-BRIDGE RUNTIME CONTRACTS',
    '// BEGIN GENERATED MAIN-BRIDGE PLATFORM CONTRACTS',
    '// Sources: canonical src/platform modules; bundled at build time; no runtime local require.',
    ...MAIN_BRIDGE_PLATFORM_ORDER.map(file => moduleBody(root, `src/platform/${file}`)),
    '// END GENERATED MAIN-BRIDGE PLATFORM CONTRACTS',
    moduleBody(root, 'src/main-bridge/feature-contracts.js'),
    ...MAIN_BRIDGE_FEATURE_ORDER.map(file => moduleBody(root, `src/main-bridge/features/${file}`)),
    read(root, 'src/main-bridge/composition.js')
  ].join('\n');
}

function buildPluginSource(root) {
  return [
    moduleBody(root, 'src/plugin/feature-contracts.js'),
    ...PLUGIN_FEATURE_ORDER.map(file => moduleBody(root, `src/plugin/features/${file}`)),
    read(root, 'src/plugin/plugin-composition.js')
  ].join('\n');
}

module.exports = {
  ANNOTATOR_HANDLER_ORDER,
  ANNOTATOR_KEYBOARD_ORDER,
  ANNOTATOR_RUNTIME_ORDER,
  SHARED_BRIDGE_ORDER,
  ANNOTATOR_MESSAGE_CONTRACT_ORDER,
  RENDERER_PLATFORM_ORDER,
  RENDERER_FOUNDATION_ORDER,
  I18N_LOCALE_ORDER,
  METADATA_SOURCE_ORDER,
  RENDERER_POST_NORMALIZATION_CORE_ORDER,
  MAIN_BRIDGE_RUNTIME_ORDER,
  MAIN_BRIDGE_PLATFORM_ORDER,
  MAIN_BRIDGE_FEATURE_ORDER,
  PLUGIN_FEATURE_ORDER,
  moduleBody,
  buildAnnotatorSource,
  buildI18nSource,
  buildSharedBridgeSource,
  buildRendererPlatformSource,
  buildRendererFoundationSource,
  buildMetadataSource,
  buildRendererPostNormalizationCoreSource,
  buildNormalizationSource,
  buildMainBridgeSource,
  buildPluginSource
};
