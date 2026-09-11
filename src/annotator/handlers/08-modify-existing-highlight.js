'use strict';

async function handleModifyExistingHighlight(ctx, deps) {
    const pageIndex = Number(ctx.msg.pageIndex);
    const annotationId = String(ctx.msg.annotationId || '');
    if (!Number.isFinite(pageIndex) || pageIndex < 0 || pageIndex >= ctx.doc.pages.length)
        throw new Error('Ugyldig side for eksisterende highlight.');
    if (!annotationId)
        throw new Error('Mangler annotation-ID for eksisterende highlight.');
    const groupId = deps.pdfiumGateHighlightGroupKey(annotationId);
    const targets = [];
    if (groupId) {
        // Multi-page selections are stored as one Highlight per PDF page.
        // All parts share a stable prefix in the standard annotation /NM (id).
        // Find the complete logical group before changing anything.
        for (let i = 0; i < ctx.doc.pages.length; i += 1) {
            const p = ctx.doc.pages[i];
            const annotations = await ctx.engine.getPageAnnotations(ctx.doc, p).toPromise();
            for (const a of (Array.isArray(annotations) ? annotations : [])) {
                if (String(a?.type) !== String(ctx.api.PdfAnnotationSubtype.HIGHLIGHT))
                    continue;
                if (deps.pdfiumGateHighlightGroupKey(a?.id || '') !== groupId)
                    continue;
                targets.push({ pageIndex: i, page: p, annotation: a });
            }
        }
    }
    else {
        // Compatibility path for highlights without group metadata:
        // therefore deliberately edit only the clicked annotation. Guessing siblings
        // from color/geometry could delete unrelated user annotations.
        const page = ctx.doc.pages[pageIndex];
        const annotations = await ctx.engine.getPageAnnotations(ctx.doc, page).toPromise();
        const annotation = (Array.isArray(annotations) ? annotations : []).find(a => String(a?.id || '') === annotationId);
        if (annotation)
            targets.push({ pageIndex, page, annotation });
    }
    if (!targets.length)
        throw new Error('Den eksisterende markeringen ble ikke funnet igjen. PDF-en kan ha endret seg.');
    if (!targets.some(t => Number(t.pageIndex) === pageIndex && String(t.annotation?.id || '') === annotationId)) {
        throw new Error('Den valgte delen av markeringen ble ikke funnet igjen. Ingen gruppeendring ble gjort.');
    }
    for (const t of targets) {
        if (String(t.annotation?.type) !== String(ctx.api.PdfAnnotationSubtype.HIGHLIGHT))
            throw new Error('Annotasjonen er ikke en Highlight.');
    }
    targets.sort((a, b) => a.pageIndex - b.pageIndex);
    let changed = false;
    let resultAnnotationId = annotationId;
    const resultAnnotationIds = [];
    if (ctx.msg.action === 'remove') {
        for (const t of targets) {
            const removed = !!(await ctx.engine.removePageAnnotation(ctx.doc, t.page, t.annotation).toPromise());
            if (!removed)
                throw new Error('PDFium kunne ikke fjerne hele markeringen (stoppet på side ' + String(t.pageIndex + 1) + ').');
            resultAnnotationIds.push({ pageIndex: t.pageIndex, annotationId: String(t.annotation?.id || ''), removed: true });
        }
        changed = targets.length > 0;
    }
    else if (ctx.msg.action === 'change-category') {
        const color = /^#[0-9A-Fa-f]{6}$/.test(String(ctx.msg.color || '')) ? String(ctx.msg.color).toUpperCase() : null;
        if (!color)
            throw new Error('Ugyldig kategorifarge.');
        // Keep the reliable remove+recreate strategy, atomically for
        // every page-part in the logical multi-page group.
        for (const t of targets) {
            const annotation = t.annotation;
            const replacement = {
                id: annotation.id,
                type: ctx.api.PdfAnnotationSubtype.HIGHLIGHT,
                pageIndex: t.pageIndex,
                rect: annotation.rect,
                segmentRects: Array.isArray(annotation.segmentRects) ? annotation.segmentRects : [],
                color,
                opacity: Number.isFinite(Number(annotation.opacity)) ? Number(annotation.opacity) : 0.45,
            };
            if (!replacement.rect || !replacement.segmentRects.length) {
                throw new Error('Eksisterende highlight mangler geometri og kan ikke erstattes sikkert.');
            }
            if (Array.isArray(annotation.flags) && annotation.flags.length)
                replacement.flags = annotation.flags;
            if (annotation.author != null)
                replacement.author = annotation.author;
            if (annotation.created != null)
                replacement.created = annotation.created;
            if (annotation.modified != null)
                replacement.modified = annotation.modified;
            if (annotation.custom != null)
                replacement.custom = annotation.custom;
            // No /Contents: preserve popup-free highlight behavior.
            const removed = !!(await ctx.engine.removePageAnnotation(ctx.doc, t.page, annotation).toPromise());
            if (!removed)
                throw new Error('PDFium kunne ikke fjerne den gamle markeringen før kategoriendring på side ' + String(t.pageIndex + 1) + '.');
            const replacementId = await ctx.engine.createPageAnnotation(ctx.doc, t.page, replacement).toPromise();
            if (!replacementId)
                throw new Error('PDFium kunne ikke opprette markeringen med ny kategori på side ' + String(t.pageIndex + 1) + '.');
            if (String(annotation.id || '') === annotationId)
                resultAnnotationId = String(replacementId);
            const verifyAnnotations = await ctx.engine.getPageAnnotations(ctx.doc, t.page).toPromise();
            const verify = (Array.isArray(verifyAnnotations) ? verifyAnnotations : []).find(a => String(a?.id || '') === String(replacementId));
            if (!verify)
                throw new Error('Den nye markeringen kunne ikke verifiseres etter kategoriendring på side ' + String(t.pageIndex + 1) + '.');
            if (String(verify.color || '').toUpperCase() !== color) {
                throw new Error('Ny markering fikk uventet farge (' + String(verify.color || 'ukjent') + ') på side ' + String(t.pageIndex + 1) + '.');
            }
            resultAnnotationIds.push({ pageIndex: t.pageIndex, annotationId: String(replacementId), changed: true });
        }
        changed = targets.length > 0;
    }
    else {
        throw new Error('Ukjent endring av eksisterende highlight.');
    }
    if (!changed)
        throw new Error('Ingen markering ble endret.');
    const saved = await ctx.engine.saveAsCopy(ctx.doc).toPromise();
    await ctx.engine.closeDocument(ctx.doc).toPromise();
    ctx.doc = null;
    deps.send({
        type: 'modify-highlight-result',
        requestId: ctx.requestId,
        ok: true, action: ctx.msg.action,
        pageIndex, annotationId: resultAnnotationId,
        groupId: groupId || null,
        grouped: !!groupId,
        affectedCount: resultAnnotationIds.length,
        annotationIds: resultAnnotationIds,
        pageIndexes: [...new Set(resultAnnotationIds.map(x => Number(x.pageIndex)).filter(Number.isFinite))].sort((a, b) => a - b),
        pdfBuffer: saved
    }, [saved]);
    return;
}

module.exports = { handleModifyExistingHighlight };
