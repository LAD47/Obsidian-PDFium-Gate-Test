#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'ARCHITECTURE.md');
const EXPECTED = [
  'docs/architecture/01-overview.md',
  'docs/architecture/02-core-principles.md',
  'docs/architecture/03-runtime-boundaries.md',
  'docs/architecture/04-main-bridge.md',
  'docs/architecture/05-pdf-viewer.md',
  'docs/architecture/06-annotations-and-categories.md',
  'docs/architecture/07-selection-links.md',
  'docs/architecture/08-metadata-schema.md',
  'docs/architecture/09-document-records.md',
  'docs/architecture/10-document-info.md',
  'docs/architecture/11-document-register.md',
  'docs/architecture/12-i18n.md',
  'docs/architecture/13-testing-and-verification.md',
  'docs/architecture/14-release-readiness.md',
];

function fail(message) {
  console.error(`architecture docs check failed: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

const index = read('ARCHITECTURE.md');
if (index.split(/\r?\n/).length > 120) {
  fail('ARCHITECTURE.md should remain a concise top-level index (max 120 lines)');
}

for (const rel of EXPECTED) {
  if (!index.includes(`](${rel})`)) fail(`ARCHITECTURE.md does not link ${rel}`);
  const text = read(rel);
  if (!/^#\s+\S/m.test(text)) fail(`${rel} has no H1 title`);
}

const unexpected = fs.readdirSync(path.join(ROOT, 'docs', 'architecture'))
  .filter(name => name.endsWith('.md'))
  .map(name => `docs/architecture/${name}`)
  .filter(rel => !EXPECTED.includes(rel));
if (unexpected.length) fail(`unindexed architecture documents: ${unexpected.join(', ')}`);

// Verify relative Markdown links among architecture docs and the root index.
for (const rel of ['ARCHITECTURE.md', ...EXPECTED]) {
  const text = read(rel);
  const base = path.dirname(path.join(ROOT, rel));
  const linkPattern = /\[[^\]]*\]\(([^)]+\.md)(?:#[^)]+)?\)/g;
  let match;
  while ((match = linkPattern.exec(text)) !== null) {
    const target = match[1];
    if (/^[a-z]+:/i.test(target)) continue;
    const abs = path.resolve(base, target);
    if (!abs.startsWith(ROOT + path.sep)) fail(`${rel} links outside repository: ${target}`);
    if (!fs.existsSync(abs)) fail(`${rel} has broken Markdown link: ${target}`);
  }
}

console.log(`Architecture docs OK: ${EXPECTED.length} indexed documents, all relative Markdown links resolve.`);
