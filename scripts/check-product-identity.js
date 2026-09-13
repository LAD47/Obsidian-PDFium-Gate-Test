const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
const header = read('src/main/00-header.js');

function fail(message) {
  console.error('Product identity check failed: ' + message);
  process.exit(1);
}

if (manifest.id !== 'pdfium-gate') fail('manifest id is ' + manifest.id);
if (manifest.name !== 'PDFium Gate') fail('manifest name is ' + manifest.name);
if (pkg.name !== 'pdfium-gate') fail('package name is ' + pkg.name);
if (manifest.version !== pkg.version) fail('manifest/package version mismatch: ' + manifest.version + ' vs ' + pkg.version);
if (!header.includes("const VIEW_TYPE = 'pdfium-gate-view';")) fail('active view type is not pdfium-gate-view');
if (header.includes('pdfium-gate-test-view')) fail('legacy view type remains in active header');

const forbiddenNames = ['PDFium Gate Test', 'PDFIUM GATE TEST', 'Obsidian PDFium Gate Test'];
const forbiddenId = 'obsidian-pdfium-gate-test';
const roots = ['src', 'docs/architecture', 'docs/examples'];
const rootFiles = ['README.md', 'CONTRIBUTING.md', 'TRANSLATING.md', 'ARCHITECTURE.md', 'manifest.json', 'package.json'];
const allowedExtensions = new Set(['.js','.json','.md','.html','.css','.yml','.yaml','.base']);

function collect(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  const st = fs.statSync(abs);
  if (st.isFile()) return [rel];
  const out = [];
  for (const entry of fs.readdirSync(abs, {withFileTypes:true})) {
    const child = path.join(rel, entry.name).replace(/\\/g,'/');
    if (entry.isDirectory()) out.push(...collect(child));
    else if (allowedExtensions.has(path.extname(entry.name))) out.push(child);
  }
  return out;
}

const files = [...rootFiles, ...roots.flatMap(collect)];
for (const rel of [...new Set(files)]) {
  const text = read(rel);
  for (const token of forbiddenNames) {
    if (text.includes(token)) fail('legacy product name remains in active file ' + rel + ': ' + token);
  }
  if (text.includes(forbiddenId)) fail('legacy plugin id remains in active file ' + rel);
}

console.log(JSON.stringify({
  ok: true,
  product: manifest.name,
  pluginId: manifest.id,
  version: manifest.version,
  viewType: 'pdfium-gate-view'
}, null, 2));

