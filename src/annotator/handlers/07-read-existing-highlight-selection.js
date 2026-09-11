'use strict';

async function handleReadExistingHighlightSelection(ctx, deps) {
    const pageIndex = Number(ctx.msg.pageIndex);
    const annotationId = String(ctx.msg.annotationId || '');
    if (!Number.isFinite(pageIndex) || pageIndex < 0 || pageIndex >= ctx.doc.pages.length)
        throw new Error('Ugyldig side for eksisterende kategori-markering.');
    if (!annotationId)
        throw new Error('Mangler annotation-ID for eksisterende kategori-markering.');
    const groupId = deps.pdfiumGateHighlightGroupKey(annotationId);
    const targets = [];
    if (groupId) {
        for (let i = 0; i < ctx.doc.pages.length; i += 1) {
            const page = ctx.doc.pages[i];
            const annotations = await ctx.engine.getPageAnnotations(ctx.doc, page).toPromise();
            for (const annotation of (Array.isArray(annotations) ? annotations : [])) {
                if (String(annotation?.type) !== String(ctx.api.PdfAnnotationSubtype.HIGHLIGHT))
                    continue;
                if (deps.pdfiumGateHighlightGroupKey(annotation?.id || '') !== groupId)
                    continue;
                targets.push({ pageIndex: i, page, annotation });
            }
        }
    }
    else {
        // Compatibility with category marks created before logical /NM grouping:
        // use only the exact clicked annotation, never colour-based sibling guessing.
        const page = ctx.doc.pages[pageIndex];
        const annotations = await ctx.engine.getPageAnnotations(ctx.doc, page).toPromise();
        const annotation = (Array.isArray(annotations) ? annotations : []).find(a => String(a?.id || '') === annotationId);
        if (annotation)
            targets.push({ pageIndex, page, annotation });
    }
    if (!targets.length)
        throw new Error('Kategori-markeringen ble ikke funnet igjen.');
    if (!targets.some(t => Number(t.pageIndex) === pageIndex && String(t.annotation?.id || '') === annotationId)) {
        throw new Error('Den valgte delen av kategori-markeringen ble ikke funnet igjen.');
    }
    targets.sort((a, b) => a.pageIndex - b.pageIndex);
    const textModel = await deps.buildKeyboardTextModel(ctx.engine, ctx.doc, null);
    const globalMap = textModel.globalMap;
    const documentNormalized = textModel.documentNormalized;
    const targetPages = new Set(targets.map(t => Number(t.pageIndex)));
    const glyphsByPage = new Map();
    const annotationRectsByPage = new Map();
    const outputRects = [];
    for (const t of targets) {
        const arr = await ctx.engine.getPageGlyphs(ctx.doc, t.page).toPromise();
        glyphsByPage.set(Number(t.pageIndex), Array.isArray(arr) ? arr : []);
        const annotation = t.annotation;
        const rects = Array.isArray(annotation?.segmentRects) && annotation.segmentRects.length
            ? annotation.segmentRects
            : (annotation?.rect ? [annotation.rect] : []);
        const clean = rects.filter(r => deps.rectArea(r) > 0);
        if (!clean.length)
            throw new Error('Kategori-markeringen mangler geometri på side ' + String(Number(t.pageIndex) + 1) + '.');
        annotationRectsByPage.set(Number(t.pageIndex), clean);
        const pageHeight = Number(t.page?.size?.height);
        if (!Number.isFinite(pageHeight) || pageHeight <= 0)
            throw new Error('Kategori-markeringen mangler gyldig sidehøyde på side ' + String(Number(t.pageIndex) + 1) + '.');
        for (const r of clean) {
            outputRects.push({
                pageIndex: Number(t.pageIndex),
                origin: { x: Number(r.origin.x), y: Number(r.origin.y) },
                size: { width: Number(r.size.width), height: Number(r.size.height) },
                pageHeight
            });
        }
    }
    const glyphRect = glyph => {
        if (!glyph)
            return null;
        const origin = glyph.tightOrigin || glyph.origin;
        const size = glyph.tightSize || glyph.size;
        const rect = { origin: { x: Number(origin?.x), y: Number(origin?.y) }, size: { width: Number(size?.width), height: Number(size?.height) } };
        return deps.rectArea(rect) > 0 ? rect : null;
    };
    const isMarkedGlyph = (rect, annotationRects) => {
        const area = deps.rectArea(rect);
        if (!(area > 0))
            return false;
        const cx = Number(rect.origin.x) + Number(rect.size.width) / 2;
        const cy = Number(rect.origin.y) + Number(rect.size.height) / 2;
        for (const a of annotationRects) {
            const left = Number(a.origin.x), bottom = Number(a.origin.y), right = left + Number(a.size.width), top = bottom + Number(a.size.height);
            if (cx >= left - 0.75 && cx <= right + 0.75 && cy >= bottom - 0.75 && cy <= top + 0.75)
                return true;
            if (deps.rectIntersectionArea(rect, a) / area >= 0.35)
                return true;
        }
        return false;
    };
    const selectedGlobal = new Set();
    const renderableGlobal = new Set();
    for (let globalIndex = 0; globalIndex < globalMap.length; globalIndex += 1) {
        const map = globalMap[globalIndex];
        if (!map || !targetPages.has(Number(map.pageIndex)) || !Number.isFinite(Number(map.rawIndex)))
            continue;
        const glyph = glyphsByPage.get(Number(map.pageIndex))?.[Number(map.rawIndex)] || null;
        const rect = glyphRect(glyph);
        if (!rect)
            continue;
        renderableGlobal.add(globalIndex);
        if (isMarkedGlyph(rect, annotationRectsByPage.get(Number(map.pageIndex)) || []))
            selectedGlobal.add(globalIndex);
    }
    if (!selectedGlobal.size)
        throw new Error('Fant ingen tekstglypher inne i kategori-markeringen.');
    const ordered = [...selectedGlobal].sort((a, b) => a - b);
    const rangeStart = ordered[0];
    const rangeEnd = ordered[ordered.length - 1];
    const chars = [];
    for (let i = rangeStart; i <= rangeEnd; i += 1) {
        const ch = documentNormalized[i] || '';
        const map = globalMap[i];
        if (selectedGlobal.has(i)) {
            chars.push(ch);
            continue;
        }
        // Keep normalized spaces and non-rendering marks, but do not reintroduce
        // visible glyphs that are physically outside this category annotation.
        if (ch === ' ' || map == null || !renderableGlobal.has(i))
            chars.push(ch);
    }
    const text = deps.normalizeSearchText(chars.join(''));
    if (!text)
        throw new Error('Kategori-markeringen ga ingen kopierbar tekst.');
    await ctx.engine.closeDocument(ctx.doc).toPromise();
    ctx.doc = null;
    deps.send({
        source: 'pdfium-gate-annotator', type: 'read-highlight-selection-result',
        requestId: ctx.requestId,
        ok: true,
        text,
        grouped: !!groupId,
        groupId: groupId || null,
        annotationId,
        affectedCount: targets.length,
        pageIndexes: [...targetPages].sort((a, b) => a - b),
        range: { start: rangeStart, end: rangeEnd },
        rects: outputRects,
        selectionModel: { anchorPos: rangeStart, focusPos: rangeEnd + 1, preferredX: null, seedStartPos: rangeStart, seedEndPos: rangeEnd + 1, viewportDirection: null, viewportTrail: [] }
    });
    return;
}

module.exports = { handleReadExistingHighlightSelection };
