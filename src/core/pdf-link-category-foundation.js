const PDF_METADATA_ROOT = '.pdf-metadata';
const PDF_METADATA_BACKUP_ROOT = `${PDF_METADATA_ROOT}/backup`;
const HIGHLIGHT_CATEGORIES_FILE_NAME = 'highlight-categories.yaml';
const HIGHLIGHT_CATEGORIES_BACKUP_SCOPE = 'highlight-categories';
const PDF_BACKUP_DIR_NAME = '.pdfium-backup';
const DEFAULT_HIGHLIGHT_OPACITY = 0.45;
const CATEGORY_ID_UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_CATEGORIES = [
  { id: 'a49dde44-7872-4d89-b97e-027a6e689d94', name: 'Økonomi', color: '#FFD84D', shortcut: 1, enabled: true },
  { id: '824e1c5a-7074-4232-99ce-e8b1306f20c5', name: 'Forskrift', color: '#6AA9FF', shortcut: 2, enabled: true },
  { id: 'c44c3b4a-110a-4446-a7e9-e3662e1dc791', name: 'Faktum', color: '#72C472', shortcut: 3, enabled: true },
  { id: 'ea31f6c8-88dc-4d32-882d-8d3dbdf1f84e', name: 'Dokumentasjon', color: '#B388EB', shortcut: 4, enabled: true },
  { id: '1886403e-77b2-4474-a255-606acc8a5906', name: 'Må undersøkes', color: '#E57373', shortcut: 5, enabled: true }
];

function categoryUuidV4() {
  if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const c = require('crypto');
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = c.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function categoryIsUuidV4(value) {
  return CATEGORY_ID_UUID_V4_PATTERN.test(String(value || ''));
}

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function vaultDirname(vaultPath) {
  const clean = String(vaultPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const i = clean.lastIndexOf('/');
  return i < 0 ? '' : clean.slice(0, i);
}

function vaultJoin(...parts) {
  return parts.map(p => String(p || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
}

function categoryLabel(category) {
  const name = String(category?.name || category?.id || 'Kategori');
  return name;
}

function normalizeHexColor(value, fallback = '#FFD84D') {
  const text = String(value || '').trim();
  return /^#[0-9A-Fa-f]{6}$/.test(text) ? text.toUpperCase() : fallback;
}

// Keep native Obsidian PDF deep-links intact. The custom viewer uses
// only the selection start as a lightweight locator; standard Obsidian still
// receives the full #page=N&selection=a,b,c,d fragment unchanged.
// They intentionally parse only the part needed by the custom viewer: the
// PDF path and the 1-based page number. Extra parameters such as
// &selection=... remain valid and must not prevent page routing.
function splitPdfLink(rawLink) {
  const text = String(rawLink || '').trim();
  const hashIndex = text.indexOf('#');
  if (hashIndex <= 0) return null;
  const filePart = text.slice(0, hashIndex).trim();
  const fragment = text.slice(hashIndex + 1).trim();
  if (!/\.pdf$/i.test(filePart) || !fragment) return null;
  return { filePart, fragment };
}

function extractPage(fragment) {
  const text = String(fragment || '').replace(/^#/, '').trim();
  const match = text.match(/(?:^|&)page=(\d+)(?:&|$)/i);
  if (!match) return null;
  const page = Number(match[1]);
  return Number.isInteger(page) && page > 0 ? page : null;
}

function extractSelectionRange(fragment) {
  const text = String(fragment || '').replace(/^#/, '').trim();
  const match = text.match(/(?:^|&)selection=(\d+),(\d+),(\d+),(\d+)(?:&|$)/i);
  if (!match) return null;
  const values = match.slice(1).map(Number);
  if (!values.every(Number.isInteger) || values.some(v => v < 0)) return null;
  return {
    beginIndex:values[0], beginOffset:values[1],
    endIndex:values[2], endOffset:values[3]
  };
}
