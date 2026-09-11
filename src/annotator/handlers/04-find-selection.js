'use strict';

async function handleFindSelection(ctx, deps) {
    const attempts = [];
    let winner = null;
    for (const candidate of deps.makeSearchCandidates(ctx.msg.text)) {
        const search = await deps.executeSearch(ctx.engine, ctx.doc, candidate.query);
        const attempt = {
            mode: candidate.mode,
            query: candidate.query,
            total: search.total,
            progress: search.progress,
            finalResult: search.finalResult
        };
        attempts.push(attempt);
        if (search.total > 0) {
            winner = attempt;
            break;
        }
    }
    const selectionPlan = deps.makeSelectionChunks(ctx.msg.text, 100, 4);
    const chunkResults = [];
    const selectedHits = [];
    let previous = null;
    let geometryComplete = selectionPlan.chunks.length > 0;
    for (const chunk of selectionPlan.chunks) {
        const adaptive = await deps.searchChunkAdaptive(ctx.engine, ctx.doc, chunk, previous, 0);
        chunkResults.push({
            ...chunk,
            adaptiveComplete: adaptive.complete,
            adaptive: adaptive.node
        });
        if (!adaptive.complete) {
            geometryComplete = false;
            break;
        }
        selectedHits.push(...adaptive.hits);
        previous = adaptive.lastHit;
    }
    const geometry = deps.dedupeAndMergeRects(selectedHits);
    const geometryPages = [...new Set(geometry.mergedRects.map(r => r.pageIndex))];
    const fullGeometry = {
        normalizedText: selectionPlan.normalized,
        chunkCount: selectionPlan.chunks.length,
        matchedChunkCount: chunkResults.filter(c => c.adaptiveComplete).length,
        adaptiveHitCount: selectedHits.length,
        complete: geometryComplete && chunkResults.length === selectionPlan.chunks.length && chunkResults.every(c => c.adaptiveComplete),
        pages: geometryPages,
        rawRectCount: geometry.rawRects.length,
        mergedRectCount: geometry.mergedRects.length,
        rawRects: geometry.rawRects,
        mergedRects: geometry.mergedRects,
        chunks: chunkResults
    };
    // if search-based reconstruction is incomplete, use the
    // PDF text streams + normalized-index maps + glyph geometry. The
    // same method is used first on one page and then across
    // page boundaries by building one normalized document stream and then
    // mapping the matched range back to the contributing pages.
    let primitiveDiagnostics = null;
    let directGeometry = null;
    if (!fullGeometry.complete) {
        primitiveDiagnostics = { strategy: 'direct-document-text-index-map', pages: [], documentMatch: null };
        const normalizedSelection = deps.normalizeSearchText(ctx.msg.text);
        const firstHitPages = [...new Set(selectedHits.map(h => Number(h.pageIndex)).filter(Number.isFinite))];
        // First try an exact normalized match across the whole document. Each
        // page keeps its own normalized→raw index map, so the resulting range
        // can be split back into per-page glyph ranges without inventing any
        // overlay geometry.
        try {
            const pageMaps = [];
            let documentNormalized = '';
            for (let pageIndex = 0; pageIndex < ctx.doc.pages.length; pageIndex += 1) {
                const extracted = await ctx.engine.extractText(ctx.doc, [pageIndex]).toPromise();
                const extractedText = String(extracted || '');
                const mapped = deps.normalizePdfTextWithMap(extractedText);
                if (documentNormalized.length && mapped.normalized.length)
                    documentNormalized += ' ';
                const startIndex = documentNormalized.length;
                documentNormalized += mapped.normalized;
                const endIndex = documentNormalized.length - 1;
                pageMaps.push({ pageIndex, extractedText, mapped, startIndex, endIndex });
            }
            const occurrences = [];
            if (normalizedSelection) {
                let from = 0;
                while (from <= documentNormalized.length - normalizedSelection.length) {
                    const at = documentNormalized.indexOf(normalizedSelection, from);
                    if (at < 0)
                        break;
                    const endAt = at + normalizedSelection.length - 1;
                    const pages = pageMaps
                        .filter(pm => pm.mapped.normalized.length && endAt >= pm.startIndex && at <= pm.endIndex)
                        .map(pm => pm.pageIndex);
                    const hintOverlap = pages.filter(pg => firstHitPages.includes(pg)).length;
                    const hintDistance = firstHitPages.length && pages.length
                        ? Math.min(...pages.map(pg => Math.min(...firstHitPages.map(h => Math.abs(pg - h)))))
                        : 0;
                    const score = hintOverlap * 10000 + pages.length * 100 - hintDistance;
                    occurrences.push({ start: at, end: endAt, pages, score });
                    from = at + 1;
                }
            }
            occurrences.sort((a, b) => b.score - a.score || a.start - b.start);
            const chosen = occurrences[0] || null;
            primitiveDiagnostics.documentMatch = {
                normalizedDocumentLength: documentNormalized.length,
                normalizedSelectionLength: normalizedSelection.length,
                occurrenceCount: occurrences.length,
                firstHitPages,
                chosen
            };
            if (chosen) {
                const glyphHits = [];
                const pageMatches = [];
                let complete = true;
                for (const pm of pageMaps) {
                    if (!pm.mapped.normalized.length || chosen.end < pm.startIndex || chosen.start > pm.endIndex)
                        continue;
                    const localStart = Math.max(chosen.start, pm.startIndex) - pm.startIndex;
                    const localEnd = Math.min(chosen.end, pm.endIndex) - pm.startIndex;
                    const rawStart = pm.mapped.rawIndexMap[localStart];
                    const rawEnd = pm.mapped.rawIndexMap[localEnd];
                    const pageDiag = {
                        pageIndex: pm.pageIndex,
                        extractText: { rawLength: pm.extractedText.length, normalizedLength: pm.mapped.normalized.length },
                        documentRange: { start: pm.startIndex, end: pm.endIndex },
                        normalizedMatch: { localStart, localEnd },
                        indexMapMatch: { rawStart, rawEnd }
                    };
                    try {
                        const glyphs = await ctx.engine.getPageGlyphs(ctx.doc, ctx.doc.pages[pm.pageIndex]).toPromise();
                        const glyphArray = Array.isArray(glyphs) ? glyphs : [];
                        pageDiag.glyphs = {
                            count: glyphArray.length,
                            rawTextLength: pm.extractedText.length,
                            indexLengthsMatch: glyphArray.length === pm.extractedText.length
                        };
                        if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || !glyphArray.length) {
                            complete = false;
                        }
                        else {
                            const hit = deps.glyphRectsForRawRange(glyphArray, rawStart, rawEnd, pm.pageIndex, null, pm.extractedText);
                            const pageGeometry = deps.dedupeAndMergeRects([hit]);
                            pageDiag.directGeometry = {
                                rawRectCount: pageGeometry.rawRects.length,
                                mergedRectCount: pageGeometry.mergedRects.length,
                                mergedRects: pageGeometry.mergedRects
                            };
                            if (!pageGeometry.mergedRects.length)
                                complete = false;
                            else {
                                glyphHits.push(hit);
                                pageMatches.push({ pageIndex: pm.pageIndex, localStart, localEnd, rawStart, rawEnd });
                            }
                        }
                    }
                    catch (e) {
                        complete = false;
                        pageDiag.glyphError = String(e && e.message || e);
                    }
                    primitiveDiagnostics.pages.push(pageDiag);
                }
                const geometryFromGlyphs = deps.dedupeAndMergeRects(glyphHits);
                const pages = [...new Set(geometryFromGlyphs.mergedRects.map(r => Number(r.pageIndex)).filter(Number.isFinite))];
                if (complete && pageMatches.length && geometryFromGlyphs.mergedRects.length) {
                    directGeometry = {
                        source: pages.length > 1 ? 'extractText-index-map-glyphs-multipage' : 'extractText-index-map-glyphs',
                        normalizedText: normalizedSelection,
                        complete: true,
                        pages,
                        rawRectCount: geometryFromGlyphs.rawRects.length,
                        mergedRectCount: geometryFromGlyphs.mergedRects.length,
                        rawRects: geometryFromGlyphs.rawRects,
                        mergedRects: geometryFromGlyphs.mergedRects,
                        documentNormalizedStart: chosen.start,
                        documentNormalizedEnd: chosen.end,
                        pageMatches
                    };
                }
            }
        }
        catch (e) {
            primitiveDiagnostics.documentMatchError = String(e && e.message || e);
        }
        // Keep the canonical single-page fallback as a second line of
        // defence. This also minimizes regression risk for ordinary selections.
        if (!directGeometry) {
            primitiveDiagnostics.strategy += '+single-page-fallback';
            const allPageIndexes = Array.from({ length: ctx.doc.pages.length }, (_, i) => i);
            const candidatePages = [...firstHitPages, ...allPageIndexes.filter(i => !firstHitPages.includes(i))];
            for (const pageIndex of candidatePages) {
                const page = ctx.doc.pages[pageIndex];
                if (!page)
                    continue;
                const pageDiag = { pageIndex, fallback: true };
                let extractedText = '';
                let mapped = null;
                try {
                    const extracted = await ctx.engine.extractText(ctx.doc, [pageIndex]).toPromise();
                    extractedText = String(extracted || '');
                    mapped = deps.normalizePdfTextWithMap(extractedText);
                    const selectionIndex = mapped.normalized.indexOf(normalizedSelection);
                    pageDiag.extractText = {
                        rawLength: extractedText.length,
                        normalizedLength: mapped.normalized.length,
                        fullSelectionIndex: selectionIndex,
                        fullSelectionExactAfterPdfCleanup: selectionIndex >= 0
                    };
                    if (selectionIndex >= 0 && normalizedSelection.length > 0) {
                        const normalizedEnd = selectionIndex + normalizedSelection.length - 1;
                        const rawStart = mapped.rawIndexMap[selectionIndex];
                        const rawEnd = mapped.rawIndexMap[normalizedEnd];
                        pageDiag.indexMapMatch = {
                            normalizedStart: selectionIndex,
                            normalizedEnd,
                            rawStart,
                            rawEnd,
                            rawCharCount: Number.isFinite(rawStart) && Number.isFinite(rawEnd) ? rawEnd - rawStart + 1 : null
                        };
                        const glyphs = await ctx.engine.getPageGlyphs(ctx.doc, page).toPromise();
                        const glyphArray = Array.isArray(glyphs) ? glyphs : [];
                        pageDiag.glyphs = {
                            count: glyphArray.length,
                            rawTextLength: extractedText.length,
                            indexLengthsMatch: glyphArray.length === extractedText.length
                        };
                        if (Number.isFinite(rawStart) && Number.isFinite(rawEnd) && glyphArray.length) {
                            const hit = deps.glyphRectsForRawRange(glyphArray, rawStart, rawEnd, pageIndex, null, extractedText);
                            const geometryFromGlyphs = deps.dedupeAndMergeRects([hit]);
                            pageDiag.directGeometry = {
                                rawRectCount: geometryFromGlyphs.rawRects.length,
                                mergedRectCount: geometryFromGlyphs.mergedRects.length,
                                mergedRects: geometryFromGlyphs.mergedRects
                            };
                            if (geometryFromGlyphs.mergedRects.length > 0) {
                                directGeometry = {
                                    source: 'extractText-index-map-glyphs',
                                    normalizedText: normalizedSelection,
                                    complete: true,
                                    pages: [pageIndex],
                                    rawRectCount: geometryFromGlyphs.rawRects.length,
                                    mergedRectCount: geometryFromGlyphs.mergedRects.length,
                                    rawRects: geometryFromGlyphs.rawRects,
                                    mergedRects: geometryFromGlyphs.mergedRects,
                                    pageIndex,
                                    normalizedStart: selectionIndex,
                                    normalizedEnd,
                                    rawStart,
                                    rawEnd
                                };
                            }
                        }
                    }
                }
                catch (e) {
                    pageDiag.extractTextError = String(e && e.message || e);
                }
                primitiveDiagnostics.pages.push(pageDiag);
                if (directGeometry && directGeometry.complete)
                    break;
            }
        }
    }
    await ctx.engine.closeDocument(ctx.doc).toPromise();
    ctx.doc = null;
    deps.send({
        type: 'selection-result',
        requestId: ctx.requestId,
        ok: true,
        found: !!winner,
        winner,
        attempts,
        fullGeometry,
        directGeometry,
        primitiveDiagnostics
    });
    return;
}

module.exports = { handleFindSelection };
