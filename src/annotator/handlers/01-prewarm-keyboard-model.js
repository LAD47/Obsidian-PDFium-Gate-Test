'use strict';

async function handlePrewarmKeyboardModel(ctx, deps) {
    const cacheKey = String(ctx.msg.pdfToken || '');
    const started = performance.now();
    const model = await deps.buildKeyboardTextModel(ctx.engine, ctx.doc, null);
    if (cacheKey)
        deps.putKeyboardTextModelCache(cacheKey, model);
    const textBuildMs = Math.round((performance.now() - started) * 10) / 10;
    const glyphStarted = performance.now();
    const glyphPages = new Map();
    for (let pageIndex = 0; pageIndex < ctx.doc.pages.length; pageIndex += 1) {
        const arr = await ctx.engine.getPageGlyphs(ctx.doc, ctx.doc.pages[pageIndex]).toPromise();
        glyphPages.set(pageIndex, Array.isArray(arr) ? arr : []);
    }
    if (cacheKey)
        deps.putKeyboardGlyphModelCache(cacheKey, glyphPages);
    const glyphBuildMs = Math.round((performance.now() - glyphStarted) * 10) / 10;
    let artifactBuildMs = 0;
    let artifactRawIndexCount = 0;
    if (ctx.msg.includeHeaderFooterText === false) {
        const artifactStarted = performance.now();
        const artifactPages = new Map();
        for (let pageIndex = 0; pageIndex < ctx.doc.pages.length; pageIndex += 1) {
            const indexes = deps.scanArtifactRawIndexes(ctx.native, ctx.pdfiumModule, ctx.doc, pageIndex);
            artifactPages.set(pageIndex, indexes);
            artifactRawIndexCount += indexes.size;
        }
        if (cacheKey)
            deps.putKeyboardArtifactIndexCache(cacheKey, artifactPages);
        artifactBuildMs = Math.round((performance.now() - artifactStarted) * 10) / 10;
    }
    const buildMs = Math.round((performance.now() - started) * 10) / 10;
    await ctx.engine.closeDocument(ctx.doc).toPromise();
    ctx.doc = null;
    deps.send({ source: 'pdfium-gate-annotator', type: 'prewarm-keyboard-model-result', requestId: ctx.requestId, ok: true, pdfToken: cacheKey, pageCount: model.pageCount, textLength: model.documentNormalized.length, textBuildMs, glyphBuildMs, glyphPageCount: glyphPages.size, artifactBuildMs, artifactRawIndexCount, buildMs, cacheSize: deps.keyboardTextModelCache.size, glyphCacheSize: deps.keyboardGlyphModelCache.size, artifactCacheSize: deps.keyboardArtifactIndexCache.size });
    return;
}

module.exports = { handlePrewarmKeyboardModel };
