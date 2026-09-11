
import { init } from 'https://cdn.jsdelivr.net/npm/@embedpdf/pdfium@2.15.0/dist/index.browser.js';
import { PdfiumNative, PdfEngine, browserImageDataToBlobConverter } from 'https://cdn.jsdelivr.net/npm/@embedpdf/engines@2.15.0/dist/lib/pdfium/index.js';
import { PdfAnnotationSubtype } from 'https://cdn.jsdelivr.net/npm/@embedpdf/models@2.15.0/dist/index.js';
const P = parent;
let enginePromise = null;
const keyboardTextModelCache = new Map();
const keyboardGlyphModelCache = new Map();
const keyboardArtifactIndexCache = new Map();

function putKeyboardGlyphModelCache(key, glyphPages) {
  const k = String(key || '');
  if (!k || !(glyphPages instanceof Map)) return;
  keyboardGlyphModelCache.delete(k);
  keyboardGlyphModelCache.set(k, glyphPages);
  while (keyboardGlyphModelCache.size > 4) {
    const oldest = keyboardGlyphModelCache.keys().next().value;
    keyboardGlyphModelCache.delete(oldest);
  }
}

function putKeyboardTextModelCache(key, model) {
  const k = String(key || '');
  if (!k || !model) return;
  keyboardTextModelCache.delete(k);
  keyboardTextModelCache.set(k, model);
  while (keyboardTextModelCache.size > 4) {
    const oldest = keyboardTextModelCache.keys().next().value;
    keyboardTextModelCache.delete(oldest);
  }
}

function putKeyboardArtifactIndexCache(key, pageMap) {
  const k = String(key || '');
  if (!k || !(pageMap instanceof Map)) return;
  keyboardArtifactIndexCache.delete(k);
  keyboardArtifactIndexCache.set(k, pageMap);
  while (keyboardArtifactIndexCache.size > 4) {
    const oldest = keyboardArtifactIndexCache.keys().next().value;
    keyboardArtifactIndexCache.delete(oldest);
  }
}

function readPdfPageObjectMarkName(pdfiumModule, markPtr) {
  const mod = pdfiumModule;
  const wasm = mod?.pdfium?.wasmExports;
  if (!mod || !wasm || !markPtr) return '';
  const outLenPtr = wasm.malloc(4);
  try {
    mod.pdfium.setValue(outLenPtr, 0, 'i32');
    if (!mod.FPDFPageObjMark_GetName(markPtr, 0, 0, outLenPtr)) return '';
    const byteLength = Number(mod.pdfium.getValue(outLenPtr, 'i32')) >>> 0;
    if (!byteLength || byteLength > 4096) return '';
    const bufferPtr = wasm.malloc(byteLength);
    try {
      if (!mod.FPDFPageObjMark_GetName(markPtr, bufferPtr, byteLength, outLenPtr)) return '';
      return String(mod.pdfium.UTF16ToString(bufferPtr) || '');
    } finally {
      wasm.free(bufferPtr);
    }
  } finally {
    wasm.free(outLenPtr);
  }
}

function scanArtifactRawIndexes(native, pdfiumModule, doc, pageIndex) {
  const out = new Set();
  const mod = pdfiumModule;
  const ctx = native?.cache?.getContext?.(doc?.id);
  if (!mod || !ctx) return out;
  const pageCtx = ctx.acquirePage(pageIndex);
  try {
    const textPagePtr = pageCtx.getTextPage();
    const count = Number(mod.FPDFText_CountChars(textPagePtr)) || 0;
    const objectArtifactCache = new Map();
    for (let rawIndex = 0; rawIndex < count; rawIndex += 1) {
      const objectPtr = Number(mod.FPDFText_GetTextObject(textPagePtr, rawIndex)) || 0;
      if (!objectPtr) continue;
      let isArtifact = objectArtifactCache.get(objectPtr);
      if (isArtifact == null) {
        isArtifact = false;
        const markCount = Number(mod.FPDFPageObj_CountMarks(objectPtr));
        for (let markIndex = 0; markIndex < markCount; markIndex += 1) {
          const markPtr = Number(mod.FPDFPageObj_GetMark(objectPtr, markIndex)) || 0;
          if (!markPtr) continue;
          if (readPdfPageObjectMarkName(mod, markPtr).trim().toLowerCase() === 'artifact') {
            isArtifact = true;
            break;
          }
        }
        objectArtifactCache.set(objectPtr, isArtifact);
      }
      if (isArtifact) out.add(rawIndex);
    }
  } finally {
    pageCtx.release();
  }
  return out;
}

function send(message, transfer = []) {
  P.postMessage({ source: 'pdfium-gate-annotator', ...message }, '*', transfer);
}

async function getEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const wasmResponse = await fetch('https://cdn.jsdelivr.net/npm/@embedpdf/pdfium@2.15.0/dist/pdfium.wasm');
    if (!wasmResponse.ok) throw new Error('Kunne ikke hente PDFium WASM: HTTP ' + wasmResponse.status);
    const wasmBinary = await wasmResponse.arrayBuffer();
    const pdfiumModule = await init({ wasmBinary });
    const native = new PdfiumNative(pdfiumModule);
    const engine = new PdfEngine(native, {
      imageConverter: browserImageDataToBlobConverter,
    });
    return { engine, native, pdfiumModule, PdfAnnotationSubtype };
  })();
  return enginePromise;
}

function makeSearchCandidates(text) {
  const raw = String(text || '').trim();
  const collapsed = raw.replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();
  const candidates = [];
  const add = (value, mode) => {
    const q = String(value || '').trim();
    if (q.length < 2 || candidates.some(c => c.query === q)) return;
    candidates.push({ query: q, mode });
  };
  add(raw, 'exact');
  add(collapsed, 'whitespace-normalized');
  if (collapsed.length > 120) add(collapsed.slice(0, 120).trim(), 'prefix-120');
  if (collapsed.length > 70) add(collapsed.slice(0, 70).trim(), 'prefix-70');
  if (collapsed.length > 40) add(collapsed.slice(0, 40).trim(), 'prefix-40');
  return candidates;
}

function normalizeSearchText(text) {
  return String(text || '')
    .replace(/\u00ad/g, '')
    .replace(/[\uFFFE\uFFFF]/g, '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPdfIgnorableChar(ch) {
  if (!ch) return true;
  const cp = ch.codePointAt(0);
  if (cp === 0x00AD || cp === 0xFFFE || cp === 0xFFFF) return true;
  if (cp >= 0xFDD0 && cp <= 0xFDEF) return true;
  if ((cp & 0xFFFF) === 0xFFFE || (cp & 0xFFFF) === 0xFFFF) return true;
  if (cp === 0x200B || cp === 0x200C || cp === 0x200D || cp === 0x2060 || cp === 0xFEFF) return true;
  if ((cp < 0x20 || (cp >= 0x7F && cp <= 0x9F)) && !/\s/.test(ch)) return true;
  return false;
}

function normalizePdfTextWithMap(text) {
  const raw = String(text || '');
  const chars = [];
  const rawIndexMap = [];
  let lastWasSpace = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (isPdfIgnorableChar(ch)) continue;
    if (/\s/.test(ch)) {
      if (chars.length && !lastWasSpace) {
        chars.push(' ');
        rawIndexMap.push(i);
        lastWasSpace = true;
      }
      continue;
    }
    chars.push(ch);
    rawIndexMap.push(i);
    lastWasSpace = false;
  }
  while (chars.length && chars[chars.length - 1] === ' ') {
    chars.pop();
    rawIndexMap.pop();
  }
  return { normalized: chars.join(''), rawIndexMap };
}

async function buildKeyboardTextModel(engine, doc, timing = null) {
  const pageMaps = [];
  const globalMap = [];
  let documentNormalized = '';
  for (let pageIndex = 0; pageIndex < doc.pages.length; pageIndex += 1) {
    const extractStarted = performance.now();
    const extracted = await engine.extractText(doc, [pageIndex]).toPromise();
    if (timing) timing.extractTextMs = Math.round((Number(timing.extractTextMs || 0) + (performance.now() - extractStarted)) * 10) / 10;
    const extractedText = String(extracted || '');
    const normalizeStarted = performance.now();
    const mapped = normalizePdfTextWithMap(extractedText);
    if (timing) timing.normalizeTextMs = Math.round((Number(timing.normalizeTextMs || 0) + (performance.now() - normalizeStarted)) * 10) / 10;
    if (documentNormalized.length && mapped.normalized.length) {
      documentNormalized += ' ';
      globalMap.push(null);
    }
    const startIndex = documentNormalized.length;
    for (let i = 0; i < mapped.normalized.length; i += 1) {
      documentNormalized += mapped.normalized[i];
      globalMap.push({pageIndex, rawIndex:mapped.rawIndexMap[i], localNormalizedIndex:i});
    }
    const endIndex = documentNormalized.length - 1;
    pageMaps.push({pageIndex, extractedText, mapped, startIndex, endIndex});
  }
  return { pageCount: doc.pages.length, pageMaps, globalMap, documentNormalized };
}

function glyphRectsForRawRange(glyphs, rawStart, rawEndInclusive, pageIndex, excludedRawIndexes = null, rawText = null) {
  const rects = [];
  const arr = Array.isArray(glyphs) ? glyphs : [];
  const mappedText = typeof rawText === 'string' && rawText.length === arr.length ? rawText : null;
  const start = Math.max(0, Number(rawStart) || 0);
  const end = Math.min(arr.length - 1, Number(rawEndInclusive));
  for (let i = start; i <= end; i += 1) {
    if (excludedRawIndexes instanceof Set && excludedRawIndexes.has(i)) continue;
    // whitespace participates in logical range identity, but its PDFium
    // glyph box must not become a Highlight QuadPoint. Some PDFs expose spaces /
    // NBSP as tiny one-pixel glyph boxes, which previously created stray segments.
    if (mappedText && /\s/u.test(mappedText[i] || '')) continue;
    const g = arr[i];
    if (!g) continue;
    const origin = g.tightOrigin || g.origin;
    const size = g.tightSize || g.size;
    const x = Number(origin && origin.x);
    const y = Number(origin && origin.y);
    const width = Number(size && size.width);
    const height = Number(size && size.height);
    if (![x, y, width, height].every(Number.isFinite)) continue;
    if (width <= 0 || height <= 0) continue;
    rects.push({ origin: { x, y }, size: { width, height } });
  }
  return { pageIndex, rects };
}

function makeSelectionChunks(text, maxChars = 100, overlapWords = 4) {
  const normalized = normalizeSearchText(text);
  const words = normalized ? normalized.split(' ') : [];
  const chunks = [];
  let start = 0;
  let guard = 0;
  while (start < words.length && guard < 200) {
    guard += 1;
    let end = start;
    let query = '';
    while (end < words.length) {
      const candidate = query ? query + ' ' + words[end] : words[end];
      if (query && candidate.length > maxChars) break;
      query = candidate;
      end += 1;
      if (query.length >= maxChars) break;
    }
    if (!query) break;
    chunks.push({ index: chunks.length, query, wordStart: start, wordEnd: end });
    if (end >= words.length) break;
    const nextStart = Math.max(start + 1, end - overlapWords);
    if (nextStart <= start) break;
    start = nextStart;
  }
  return { normalized, chunks };
}

async function executeSearch(engine, doc, query) {
  const progress = [];
  const task = engine.searchAllPages(doc, query);
  if (task && typeof task.onProgress === 'function') {
    task.onProgress(p => {
      try {
        progress.push(JSON.parse(JSON.stringify(p)));
      } catch (_) {
        progress.push({ page: p && p.page, results: p && p.results });
      }
    });
  }
  const finalResult = await task.toPromise();
  const finalCopy = JSON.parse(JSON.stringify(finalResult || {}));
  let results = Array.isArray(finalCopy.results) ? finalCopy.results : [];
  if (!results.length) {
    results = progress.flatMap(p => Array.isArray(p && p.results) ? p.results : []);
  }
  let total = Number(finalCopy.total);
  if (!Number.isFinite(total)) total = results.length;
  return { query, total, progress, finalResult: finalCopy, results };
}

function chooseSequentialHit(results, previous) {
  const list = (Array.isArray(results) ? results : [])
    .filter(r => r && Number.isFinite(Number(r.pageIndex)) && Number.isFinite(Number(r.charIndex)))
    .map(r => ({ ...r, pageIndex: Number(r.pageIndex), charIndex: Number(r.charIndex) }))
    .sort((a, b) => (a.pageIndex - b.pageIndex) || (a.charIndex - b.charIndex));
  if (!list.length) return null;
  if (!previous) return list[0];

  const sameOrLater = list.filter(r =>
    r.pageIndex > previous.pageIndex ||
    (r.pageIndex === previous.pageIndex && r.charIndex >= previous.charIndex)
  );
  if (!sameOrLater.length) return null;
  sameOrLater.sort((a, b) => {
    const pagePenaltyA = (a.pageIndex - previous.pageIndex) * 1000000;
    const pagePenaltyB = (b.pageIndex - previous.pageIndex) * 1000000;
    const charPenaltyA = a.pageIndex === previous.pageIndex ? Math.abs(a.charIndex - previous.charIndex) : a.charIndex;
    const charPenaltyB = b.pageIndex === previous.pageIndex ? Math.abs(b.charIndex - previous.charIndex) : b.charIndex;
    return (pagePenaltyA + charPenaltyA) - (pagePenaltyB + charPenaltyB);
  });
  return sameOrLater[0];
}


function splitAdaptiveChunk(chunk) {
  const words = String(chunk.query || '').split(' ').filter(Boolean);
  if (words.length <= 3) return null;
  const mid = Math.floor(words.length / 2);
  const overlap = 1;
  const leftWords = words.slice(0, Math.min(words.length, mid + overlap));
  const rightStartLocal = Math.max(1, mid - overlap);
  const rightWords = words.slice(rightStartLocal);
  if (!leftWords.length || !rightWords.length) return null;
  return {
    left: {
      query: leftWords.join(' '),
      wordStart: chunk.wordStart,
      wordEnd: chunk.wordStart + leftWords.length
    },
    right: {
      query: rightWords.join(' '),
      wordStart: chunk.wordStart + rightStartLocal,
      wordEnd: chunk.wordEnd
    }
  };
}

async function searchChunkAdaptive(engine, doc, chunk, previous, depth = 0) {
  const search = await executeSearch(engine, doc, chunk.query);
  const chosen = chooseSequentialHit(search.results, previous);
  const node = {
    query: chunk.query,
    wordStart: chunk.wordStart,
    wordEnd: chunk.wordEnd,
    depth,
    total: search.total,
    chosen: chosen ? JSON.parse(JSON.stringify(chosen)) : null,
    candidates: search.results.slice(0, 10),
    split: null
  };
  if (chosen) {
    return { complete: true, hits: [chosen], lastHit: chosen, node };
  }

  if (depth >= 4) return { complete: false, hits: [], lastHit: previous, node };
  const parts = splitAdaptiveChunk(chunk);
  if (!parts) return { complete: false, hits: [], lastHit: previous, node };

  const left = await searchChunkAdaptive(engine, doc, parts.left, previous, depth + 1);
  const rightPrevious = left.complete ? left.lastHit : previous;
  const right = left.complete
    ? await searchChunkAdaptive(engine, doc, parts.right, rightPrevious, depth + 1)
    : { complete: false, hits: [], lastHit: rightPrevious, node: null };

  node.split = {
    left: left.node,
    right: right.node
  };
  return {
    complete: left.complete && right.complete,
    hits: [...left.hits, ...right.hits],
    lastHit: right.complete ? right.lastHit : (left.complete ? left.lastHit : previous),
    node
  };
}

function dedupeAndMergeRects(hits) {
  const seen = new Set();
  const raw = [];
  for (const hit of hits) {
    const pageIndex = Number(hit.pageIndex);
    for (const rect of (Array.isArray(hit.rects) ? hit.rects : [])) {
      const x = Number(rect && rect.origin && rect.origin.x);
      const y = Number(rect && rect.origin && rect.origin.y);
      const width = Number(rect && rect.size && rect.size.width);
      const height = Number(rect && rect.size && rect.size.height);
      if (![x, y, width, height].every(Number.isFinite)) continue;
      const key = [pageIndex, x, y, width, height].map(v => Math.round(v * 10) / 10).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      raw.push({ pageIndex, origin: { x, y }, size: { width, height } });
    }
  }

  const byPage = new Map();
  for (const rect of raw) {
    if (!byPage.has(rect.pageIndex)) byPage.set(rect.pageIndex, []);
    byPage.get(rect.pageIndex).push(rect);
  }

  // PDFium tight glyph boxes do not share one vertical centre on a
  // real text line. Descenders (g/y/p/q/j), ascenders and capitals can differ by
  // several PDF points. The old fixed centre tolerance (4.5) could therefore
  // split ONE visual line into interleaved groups; bounding each group produced
  // overlapping Highlight QuadPoints (for example the dark "g/y" islands in a
  // large title). A text line is now identified by substantial vertical overlap
  // between glyph boxes. This is scale/zoom independent because all values are
  // native PDF page coordinates.
  const verticalOverlapRatio = (a, b) => {
    const aTop = Number(a.origin.y), aBottom = aTop + Number(a.size.height);
    const bTop = Number(b.origin.y), bBottom = bTop + Number(b.size.height);
    const overlap = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);
    const minHeight = Math.min(Number(a.size.height), Number(b.size.height));
    if (!(overlap > 0) || !(minHeight > 0)) return 0;
    return overlap / minHeight;
  };
  const sameVisualLine = (a, b) => verticalOverlapRatio(a, b) >= 0.45;

  const merged = [];
  for (const [pageIndex, rects] of byPage) {
    rects.sort((a, b) => {
      const ac = a.origin.y + a.size.height / 2;
      const bc = b.origin.y + b.size.height / 2;
      return (ac - bc) || (a.origin.x - b.origin.x);
    });
    const lines = [];
    for (const rect of rects) {
      // Connected overlap is deliberate: a normal x-height glyph can bridge a
      // descender to the rest of the same baseline even when their centres are
      // farther apart than the old fixed threshold.
      let line = lines.find(l => l.rects.some(existing => sameVisualLine(existing, rect)));
      if (!line) {
        line = { rects: [] };
        lines.push(line);
      }
      line.rects.push(rect);
    }
    for (const line of lines) {
      const xs = line.rects.map(r => r.origin.x);
      const ys = line.rects.map(r => r.origin.y);
      const rights = line.rects.map(r => r.origin.x + r.size.width);
      const bottoms = line.rects.map(r => r.origin.y + r.size.height);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const right = Math.max(...rights);
      const bottom = Math.max(...bottoms);
      merged.push({
        pageIndex,
        origin: { x, y },
        size: { width: right - x, height: bottom - y },
        sourceRectCount: line.rects.length
      });
    }
  }
  merged.sort((a, b) => (a.pageIndex - b.pageIndex) || (a.origin.y - b.origin.y) || (a.origin.x - b.origin.x));
  return { rawRects: raw, mergedRects: merged };
}


function pointToTopRectDistance(point, rect) {
  if (!point || !rect || Number(point.pageIndex) !== Number(rect.pageIndex)) return Number.POSITIVE_INFINITY;
  const px = Number(point.x), py = Number(point.y);
  const left = Number(rect.left), right = Number(rect.right), top = Number(rect.top), bottom = Number(rect.bottom);
  if (![px, py, left, right, top, bottom].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const dx = px < left ? left - px : (px > right ? px - right : 0);
  const dy = py < top ? top - py : (py > bottom ? py - bottom : 0);
  return Math.hypot(dx, dy);
}

function scoreGesturePointsAgainstTopRects(points, rects) {
  const gesturePoints = (Array.isArray(points) ? points : []).filter(p =>
    p && [p.pageIndex, p.x, p.y].every(v => Number.isFinite(Number(v)))
  );
  const candidateRects = (Array.isArray(rects) ? rects : []).filter(r =>
    r && [r.pageIndex, r.left, r.right, r.top, r.bottom].every(v => Number.isFinite(Number(v)))
  );
  if (!gesturePoints.length || !candidateRects.length) {
    return { score:Number.POSITIVE_INFINITY, pointDistances:[], rectCount:candidateRects.length };
  }
  const pointDistances = gesturePoints.map(point => {
    let best = Number.POSITIVE_INFINITY;
    for (const rect of candidateRects) best = Math.min(best, pointToTopRectDistance(point, rect));
    return best;
  });
  const finite = pointDistances.filter(Number.isFinite);
  return {
    score:finite.length === pointDistances.length ? finite.reduce((sum, value) => sum + value, 0) : Number.POSITIVE_INFINITY,
    pointDistances,
    rectCount:candidateRects.length
  };
}

function boundingRect(rects) {
  const clean = (Array.isArray(rects) ? rects : []).filter(r =>
    r && r.origin && r.size &&
    [r.origin.x, r.origin.y, r.size.width, r.size.height].every(v => Number.isFinite(Number(v)))
  );
  if (!clean.length) return null;
  const left = Math.min(...clean.map(r => Number(r.origin.x)));
  const top = Math.min(...clean.map(r => Number(r.origin.y)));
  const right = Math.max(...clean.map(r => Number(r.origin.x) + Number(r.size.width)));
  const bottom = Math.max(...clean.map(r => Number(r.origin.y) + Number(r.size.height)));
  return { origin: { x: left, y: top }, size: { width: right - left, height: bottom - top } };
}

function rectArea(rect) {
  const w = Number(rect && rect.size && rect.size.width);
  const h = Number(rect && rect.size && rect.size.height);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w * h : 0;
}

function rectIntersectionArea(a, b) {
  if (!a || !b || !a.origin || !b.origin || !a.size || !b.size) return 0;
  const left = Math.max(Number(a.origin.x), Number(b.origin.x));
  const top = Math.max(Number(a.origin.y), Number(b.origin.y));
  const right = Math.min(Number(a.origin.x) + Number(a.size.width), Number(b.origin.x) + Number(b.size.width));
  const bottom = Math.min(Number(a.origin.y) + Number(a.size.height), Number(b.origin.y) + Number(b.size.height));
  const w = right - left, h = bottom - top;
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w * h : 0;
}

function rectSetCoverage(selectionRects, annotationRects) {
  const a = (Array.isArray(selectionRects) ? selectionRects : []).filter(r => rectArea(r) > 0);
  const b = (Array.isArray(annotationRects) ? annotationRects : []).filter(r => rectArea(r) > 0);
  if (!a.length || !b.length) return { selectionCoverage:0, annotationCoverage:0, score:0 };
  const totalA = a.reduce((sum, r) => sum + rectArea(r), 0);
  const totalB = b.reduce((sum, r) => sum + rectArea(r), 0);
  const coveredA = a.reduce((sum, r) => sum + Math.max(0, ...b.map(x => rectIntersectionArea(r, x))), 0);
  const coveredB = b.reduce((sum, r) => sum + Math.max(0, ...a.map(x => rectIntersectionArea(r, x))), 0);
  const selectionCoverage = totalA > 0 ? coveredA / totalA : 0;
  const annotationCoverage = totalB > 0 ? coveredB / totalB : 0;
  return { selectionCoverage, annotationCoverage, score: Math.min(selectionCoverage, annotationCoverage) };
}

