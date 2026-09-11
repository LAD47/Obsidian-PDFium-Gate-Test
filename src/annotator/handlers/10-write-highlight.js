'use strict';

async function handleWriteHighlight(ctx, deps) {
    const pageIndex = Math.max(0, Math.floor(Number(ctx.msg.page || 1)) - 1);
    if (pageIndex >= ctx.doc.pages.length) {
        throw new Error('PDF-en har bare ' + ctx.doc.pages.length + ' sider.');
    }
    const page = ctx.doc.pages[pageIndex];
    const pageWidth = page.size && Number(page.size.width) || 595;
    const pageHeight = page.size && Number(page.size.height) || 842;
    const x = Math.min(72, Math.max(12, pageWidth * 0.08));
    const y = Math.min(96, Math.max(24, pageHeight * 0.10));
    const width = Math.max(80, Math.min(240, pageWidth - x - 24));
    const height = Math.max(14, Math.min(24, pageHeight - y - 24));
    const rect = { origin: { x, y }, size: { width, height } };
    const annotation = {
        id: crypto.randomUUID(),
        type: ctx.api.PdfAnnotationSubtype.HIGHLIGHT,
        pageIndex,
        rect,
        segmentRects: [rect],
        color: '#FFFF00',
        opacity: 0.45
    };
    const annotationId = await ctx.engine.createPageAnnotation(ctx.doc, page, annotation).toPromise();
    const saved = await ctx.engine.saveAsCopy(ctx.doc).toPromise();
    await ctx.engine.closeDocument(ctx.doc).toPromise();
    ctx.doc = null;
    deps.send({ type: 'write-result', requestId: ctx.requestId, ok: true, annotationId, pdfBuffer: saved }, [saved]);
}

module.exports = { handleWriteHighlight };
