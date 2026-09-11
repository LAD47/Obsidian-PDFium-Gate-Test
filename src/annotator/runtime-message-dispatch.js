'use strict';

const ANNOTATOR_HANDLER_DEPENDENCIES = Object.freeze({
  boundingRect,
  buildKeyboardTextModel,
  dedupeAndMergeRects,
  executeSearch,
  glyphRectsForRawRange,
  keyboardArtifactIndexCache,
  keyboardGlyphModelCache,
  keyboardTextModelCache,
  makeSearchCandidates,
  makeSelectionChunks,
  normalizePdfTextWithMap,
  normalizeSearchText,
  pdfiumGateHighlightGroupKey,
  putKeyboardArtifactIndexCache,
  putKeyboardGlyphModelCache,
  putKeyboardTextModelCache,
  rectArea,
  rectIntersectionArea,
  rectSetCoverage,
  scanArtifactRawIndexes,
  scoreGesturePointsAgainstTopRects,
  searchChunkAdaptive,
  send,
});

const ANNOTATOR_REQUEST_HANDLERS = Object.freeze({
  "prewarm-keyboard-model": handlePrewarmKeyboardModel,
  "keyboard-expand-selection": handleKeyboardExpandSelection,
  "filter-selection-artifacts": handleFilterSelectionArtifacts,
  "find-selection": handleFindSelection,
  "inspect-point-highlights": handleInspectPointHighlights,
  "inspect-selection-highlights": handleInspectSelectionHighlights,
  "read-existing-highlight-selection": handleReadExistingHighlightSelection,
  "modify-existing-highlight": handleModifyExistingHighlight,
  "write-selection-highlight": handleWriteSelectionHighlight,
  "write-highlight": handleWriteHighlight,
});

window.addEventListener('message', async event => {
  const msg = event.data;
  if (!msg || msg.source !== 'pdfium-gate-parent') return;
  if (!isAnnotatorRequestType(msg.type)) return;
  const requestId = msg.requestId;
  const keyboardTimingStarted = msg.type === 'keyboard-expand-selection' ? performance.now() : null;
  const keyboardTiming = msg.type === 'keyboard-expand-selection' ? {
    engineReadyMs:null, openDocumentMs:null, textModelCacheHit:null, textModelCacheBuildMs:null, extractTextMs:0, normalizeTextMs:0, occurrenceFindMs:null,
    duplicateDisambiguationMs:null, glyphCachePagesAvailable:0, glyphCachePageHits:0, glyphCachePageMisses:0, glyphFetchMs:0, glyphPagesLoaded:0, movementMs:null, overlayGeometryMs:null, closeDocumentMs:null, workerTotalMs:null
  } : null;
  const kbRound = value => Math.round(Number(value || 0) * 10) / 10;
  const finishKeyboardTiming = () => {
    if (!keyboardTiming) return undefined;
    keyboardTiming.workerTotalMs = kbRound(performance.now() - keyboardTimingStarted);
    return keyboardTiming;
  };
  const writeDebug = { stages: [] };
  const markWriteStage = (stage, data) => {
    if (msg.type !== 'write-selection-highlight') return;
    const entry = { stage };
    if (data && typeof data === 'object') Object.assign(entry, data);
    writeDebug.stages.push(entry);
  };
  markWriteStage('message-received', { mergedRectCount: Array.isArray(msg.mergedRects) ? msg.mergedRects.length : 0, textLength: String(msg.text || '').length, color: msg.color || null, categoryId: msg.categoryId || null, categoryName: msg.categoryName || null });
  const ctx = { msg, requestId, keyboardTiming, kbRound, finishKeyboardTiming, writeDebug, markWriteStage, engine:null, api:null, native:null, pdfiumModule:null, bytes:null, doc:null };
  try {
    const engineReadyStarted = keyboardTiming ? performance.now() : 0;
    ctx.api = await getEngine();
    if (keyboardTiming) keyboardTiming.engineReadyMs = kbRound(performance.now() - engineReadyStarted);
    markWriteStage('engine-ready');
    ctx.engine = ctx.api.engine;
    ctx.native = ctx.api.native;
    ctx.pdfiumModule = ctx.api.pdfiumModule;
    ctx.bytes = new Uint8Array(msg.pdfBuffer);
    markWriteStage('pdf-buffer-received', { byteLength: ctx.bytes.byteLength });
    const openDocumentStarted = keyboardTiming ? performance.now() : 0;
    ctx.doc = await ctx.engine.openDocumentBuffer({ id: 'obsidian-' + requestId, content: ctx.bytes }).toPromise();
    if (keyboardTiming) keyboardTiming.openDocumentMs = kbRound(performance.now() - openDocumentStarted);
    markWriteStage('document-opened', { pageCount: ctx.doc && ctx.doc.pages ? ctx.doc.pages.length : null });

    const handler = ANNOTATOR_REQUEST_HANDLERS[msg.type];
    if (typeof handler !== 'function') throw new Error('Ingen annotator-handler for ' + String(msg.type || ''));
    await handler(ctx, ANNOTATOR_HANDLER_DEPENDENCIES);
  } catch (error) {
    try { if (ctx.doc && ctx.engine) await ctx.engine.closeDocument(ctx.doc).toPromise(); } catch (_) {}
    ctx.doc = null;
    const resultType=getAnnotatorMessageContract(msg.type)?.resultType||'write-result';
    markWriteStage('error', { message: error instanceof Error ? error.message : String(error), stack: error && error.stack ? String(error.stack) : null });
    send({ type: resultType, requestId, ok: false, error: error instanceof Error ? error.message : String(error), debug: msg.type === 'write-selection-highlight' ? writeDebug : undefined, timing: msg.type === 'keyboard-expand-selection' ? finishKeyboardTiming() : undefined });
  }
});

getEngine()
  .then(() => send({ type: 'ready' }))
  .catch(error => send({ type: 'fatal', error: error instanceof Error ? error.message : String(error) }));
