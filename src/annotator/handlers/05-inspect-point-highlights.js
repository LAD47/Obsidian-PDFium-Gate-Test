'use strict';

async function handleInspectPointHighlights(ctx, deps) {
    const incomingCandidates = Array.isArray(ctx.msg.candidates) ? ctx.msg.candidates : [];
    const tolerance = Math.max(1, Math.min(12, Number(ctx.msg.tolerance || 4)));
    const unique = new Map();
    const candidateDiagnostics = [];
    for (const candidate of incomingCandidates) {
        const pageIndex = Number(candidate?.pageIndex);
        const pageX = Number(candidate?.pageX);
        const pageY = Number(candidate?.pageY);
        if (!Number.isFinite(pageIndex) || pageIndex < 0 || pageIndex >= ctx.doc.pages.length || !Number.isFinite(pageX) || !Number.isFinite(pageY))
            continue;
        const page = ctx.doc.pages[pageIndex];
        const pageHeight = Number(page?.size?.height);
        if (!Number.isFinite(pageHeight) || pageHeight <= 0)
            continue;
        // Main Bridge viewerPoint is native PDF page space (bottom-origin Y).
        // @embedpdf/engines exposes annotation Rect/segmentRects in its page-model
        // coordinate space (top-origin Y). Convert exactly once before hit-testing.
        // Never test both axes: the old dual probe caused symmetric false hits.
        const probeYs = [{ mode: 'embedpdf-top-origin-from-pdf-bottom-origin', y: pageHeight - pageY }];
        const annotations = await ctx.engine.getPageAnnotations(ctx.doc, page).toPromise();
        let hitsForCandidate = 0;
        for (const annotation of (Array.isArray(annotations) ? annotations : [])) {
            if (String(annotation?.type) !== String(ctx.api.PdfAnnotationSubtype.HIGHLIGHT))
                continue;
            const annotationRects = Array.isArray(annotation?.segmentRects) && annotation.segmentRects.length
                ? annotation.segmentRects
                : (annotation?.rect ? [annotation.rect] : []);
            let hit = null;
            for (const py of probeYs) {
                for (const rect of annotationRects) {
                    const rx = Number(rect?.origin?.x), ry = Number(rect?.origin?.y);
                    const rw = Number(rect?.size?.width), rh = Number(rect?.size?.height);
                    if (![rx, ry, rw, rh].every(Number.isFinite))
                        continue;
                    if (pageX >= rx - tolerance && pageX <= rx + rw + tolerance && py.y >= ry - tolerance && py.y <= ry + rh + tolerance) {
                        const dx = pageX < rx ? rx - pageX : (pageX > rx + rw ? pageX - (rx + rw) : 0);
                        const dy = py.y < ry ? ry - py.y : (py.y > ry + rh ? py.y - (ry + rh) : 0);
                        hit = { yMode: py.mode, distance: Math.hypot(dx, dy), rect };
                        break;
                    }
                }
                if (hit)
                    break;
            }
            if (!hit)
                continue;
            hitsForCandidate += 1;
            const key = String(pageIndex) + ':' + String(annotation.id || '');
            const record = {
                id: annotation.id || null,
                groupId: deps.pdfiumGateHighlightGroupKey(annotation.id || null),
                type: annotation.type,
                pageIndex,
                color: annotation.color || null,
                opacity: annotation.opacity ?? null,
                rect: annotation.rect || null,
                segmentRects: annotationRects,
                pointHit: {
                    pageX, pageY,
                    yMode: hit.yMode,
                    distance: hit.distance,
                    transform: candidate?.transform || null,
                    zoom: Number(candidate?.zoom) || null,
                    candidate
                }
            };
            const prior = unique.get(key);
            if (!prior || Number(record.pointHit.distance || 0) < Number(prior.pointHit?.distance || Infinity))
                unique.set(key, record);
        }
        candidateDiagnostics.push({
            pageIndex, pageX, pageY,
            incomingCoordinateSpace: candidate?.coordinateSpace || 'pdf-bottom-origin',
            annotationCoordinateSpace: 'embedpdf-top-origin',
            convertedPageY: pageHeight - pageY,
            transform: candidate?.transform || null,
            zoom: Number(candidate?.zoom) || null,
            hits: hitsForCandidate
        });
    }
    const matches = [...unique.values()].sort((a, b) => Number(a?.pointHit?.distance || 0) - Number(b?.pointHit?.distance || 0));
    await ctx.engine.closeDocument(ctx.doc).toPromise();
    ctx.doc = null;
    deps.send({ type: 'inspect-point-result', requestId: ctx.requestId, ok: true, matches, candidateDiagnostics });
    return;
}

module.exports = { handleInspectPointHighlights };
