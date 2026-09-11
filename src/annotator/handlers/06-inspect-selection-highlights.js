'use strict';

async function handleInspectSelectionHighlights(ctx, deps) {
    const incoming = Array.isArray(ctx.msg.mergedRects) ? ctx.msg.mergedRects : [];
    const byPage = new Map();
    for (const item of incoming) {
        const pageIndex = Number(item && item.pageIndex);
        if (!Number.isFinite(pageIndex) || pageIndex < 0 || pageIndex >= ctx.doc.pages.length)
            continue;
        const rect = { origin: { x: Number(item?.origin?.x), y: Number(item?.origin?.y) }, size: { width: Number(item?.size?.width), height: Number(item?.size?.height) } };
        if (deps.rectArea(rect) <= 0)
            continue;
        if (!byPage.has(pageIndex))
            byPage.set(pageIndex, []);
        byPage.get(pageIndex).push(rect);
    }
    const matches = [];
    for (const [pageIndex, selectionRects] of byPage.entries()) {
        const page = ctx.doc.pages[pageIndex];
        const annotations = await ctx.engine.getPageAnnotations(ctx.doc, page).toPromise();
        for (const annotation of (Array.isArray(annotations) ? annotations : [])) {
            if (String(annotation?.type) !== String(ctx.api.PdfAnnotationSubtype.HIGHLIGHT))
                continue;
            const annotationRects = Array.isArray(annotation?.segmentRects) && annotation.segmentRects.length
                ? annotation.segmentRects
                : (annotation?.rect ? [annotation.rect] : []);
            const coverage = deps.rectSetCoverage(selectionRects, annotationRects);
            // Bevisst konservativ terskel. Våre egne highlights bør normalt ligge svært nær 1.0.
            if (coverage.selectionCoverage >= 0.72 && coverage.annotationCoverage >= 0.72) {
                matches.push({
                    id: annotation.id || null,
                    type: annotation.type,
                    pageIndex,
                    color: annotation.color || null,
                    opacity: annotation.opacity ?? null,
                    rect: annotation.rect || null,
                    segmentRects: annotationRects,
                    coverage
                });
            }
        }
    }
    await ctx.engine.closeDocument(ctx.doc).toPromise();
    ctx.doc = null;
    matches.sort((a, b) => Number(b?.coverage?.score || 0) - Number(a?.coverage?.score || 0));
    deps.send({ type: 'inspect-selection-result', requestId: ctx.requestId, ok: true, matches });
    return;
}

module.exports = { handleInspectSelectionHighlights };
