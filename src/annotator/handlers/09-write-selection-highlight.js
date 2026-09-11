'use strict';

async function handleWriteSelectionHighlight(ctx, deps) {
    const incoming = Array.isArray(ctx.msg.mergedRects) ? ctx.msg.mergedRects : [];
    ctx.markWriteStage('geometry-received', { mergedRectCount: incoming.length });
    if (!incoming.length)
        throw new Error('Ingen selection-geometri ble sendt til PDF-writeren.');
    const byPage = new Map();
    let rejectedRectCount = 0;
    for (const item of incoming) {
        const pageIndex = Number(item && item.pageIndex);
        const x = Number(item && item.origin && item.origin.x);
        const y = Number(item && item.origin && item.origin.y);
        const width = Number(item && item.size && item.size.width);
        const height = Number(item && item.size && item.size.height);
        if (![pageIndex, x, y, width, height].every(Number.isFinite)) {
            rejectedRectCount += 1;
            continue;
        }
        if (pageIndex < 0 || pageIndex >= ctx.doc.pages.length || width <= 0 || height <= 0) {
            rejectedRectCount += 1;
            continue;
        }
        if (!byPage.has(pageIndex))
            byPage.set(pageIndex, []);
        byPage.get(pageIndex).push({ origin: { x, y }, size: { width, height } });
    }
    ctx.markWriteStage('geometry-validated', {
        validPageCount: byPage.size,
        rejectedRectCount,
        validRectCount: [...byPage.values()].reduce((sum, arr) => sum + arr.length, 0)
    });
    if (!byPage.size)
        throw new Error('Selection-geometrien inneholdt ingen gyldige PDF-rektangler.');
    const annotationIds = [];
    // Every page-part of one logical selection shares this /NM prefix.
    // /NM is the standard PDF annotation name/id field and does not create a popup.
    const groupId = 'pdfiumgate-' + crypto.randomUUID().replace(/-/g, '').toLowerCase();
    const pageIndexes = [...byPage.keys()].sort((a, b) => a - b);
    for (const pageIndex of pageIndexes) {
        const page = ctx.doc.pages[pageIndex];
        const segmentRects = byPage.get(pageIndex);
        const rect = deps.boundingRect(segmentRects);
        ctx.markWriteStage('page-prepared', {
            pageIndex,
            segmentCount: segmentRects.length,
            boundingRect: rect ? JSON.parse(JSON.stringify(rect)) : null,
            segmentRects: JSON.parse(JSON.stringify(segmentRects))
        });
        if (!rect)
            continue;
        const annotation = {
            id: groupId + '-p' + String(pageIndex),
            type: ctx.api.PdfAnnotationSubtype.HIGHLIGHT,
            pageIndex,
            rect,
            segmentRects,
            color: /^#[0-9A-Fa-f]{6}$/.test(String(ctx.msg.color || '')) ? String(ctx.msg.color).toUpperCase() : '#FFFF00',
            opacity: Number.isFinite(Number(ctx.msg.opacity)) ? Number(ctx.msg.opacity) : 0.45,
            // Highlight opprettes fortsatt uten /Contents.
        };
        // Never write /Contents on Highlight annotations. This prevents category popups in Chromium/PDFium.
        ctx.markWriteStage('createPageAnnotation-start', {
            pageIndex,
            annotationType: String(ctx.api.PdfAnnotationSubtype.HIGHLIGHT),
            annotationId: annotation.id,
            segmentCount: segmentRects.length
        });
        const annotationId = await ctx.engine.createPageAnnotation(ctx.doc, page, annotation).toPromise();
        ctx.markWriteStage('createPageAnnotation-ok', { pageIndex, annotationId: annotationId ?? null });
        try {
            const verifyAnnotations = await ctx.engine.getPageAnnotations(ctx.doc, page).toPromise();
            const verify = (Array.isArray(verifyAnnotations) ? verifyAnnotations : []).find(a => String(a?.id || '') === String(annotationId || ''));
            ctx.markWriteStage('createPageAnnotation-geometry-verified', {
                pageIndex,
                annotationId: annotationId ?? null,
                coordinateSpace: 'embedpdf-top-origin',
                rect: verify?.rect ? JSON.parse(JSON.stringify(verify.rect)) : null,
                segmentRects: Array.isArray(verify?.segmentRects) ? JSON.parse(JSON.stringify(verify.segmentRects)) : []
            });
        }
        catch (verifyError) {
            ctx.markWriteStage('createPageAnnotation-geometry-verify-error', { pageIndex, error: String(verifyError && verifyError.message || verifyError) });
        }
        annotationIds.push({ pageIndex, annotationId, requestedId: annotation.id, groupId, segmentCount: segmentRects.length });
    }
    if (!annotationIds.length)
        throw new Error('PDFium opprettet ingen highlight-annotasjoner.');
    ctx.markWriteStage('saveAsCopy-start', { annotationCount: annotationIds.length });
    const saved = await ctx.engine.saveAsCopy(ctx.doc).toPromise();
    ctx.markWriteStage('saveAsCopy-ok', { byteLength: saved && saved.byteLength !== undefined ? saved.byteLength : null });
    try {
        const verifyDoc = await ctx.engine.openDocumentBuffer({ id: 'verify-' + ctx.requestId, content: new Uint8Array(saved) }).toPromise();
        const persisted = [];
        for (const pageIndex of pageIndexes) {
            const annotations = await ctx.engine.getPageAnnotations(verifyDoc, verifyDoc.pages[pageIndex]).toPromise();
            for (const a of (Array.isArray(annotations) ? annotations : [])) {
                if (!String(a?.id || '').startsWith(groupId))
                    continue;
                persisted.push({ pageIndex, id: a.id || null, rect: a.rect || null, segmentRects: Array.isArray(a.segmentRects) ? a.segmentRects : [], coordinateSpace: 'embedpdf-top-origin' });
            }
        }
        ctx.markWriteStage('saved-pdf-highlight-geometry', { groupId, persisted });
        await ctx.engine.closeDocument(verifyDoc).toPromise();
    }
    catch (verifyError) {
        ctx.markWriteStage('saved-pdf-highlight-geometry-error', { error: String(verifyError && verifyError.message || verifyError) });
    }
    await ctx.engine.closeDocument(ctx.doc).toPromise();
    ctx.doc = null;
    ctx.markWriteStage('document-closed');
    deps.send({
        type: 'write-selection-result',
        requestId: ctx.requestId,
        ok: true,
        annotationIds,
        pageIndexes,
        groupId,
        debug: { ...ctx.writeDebug, groupId },
        pdfBuffer: saved
    }, [saved]);
    return;
}

module.exports = { handleWriteSelectionHighlight };
