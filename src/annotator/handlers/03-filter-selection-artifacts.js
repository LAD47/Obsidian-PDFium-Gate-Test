'use strict';

async function handleFilterSelectionArtifacts(ctx, deps) {
    const selected = deps.normalizeSearchText(ctx.msg.text);
    const cacheKey = String(ctx.msg.pdfToken || '');
    let textModel = cacheKey ? deps.keyboardTextModelCache.get(cacheKey) : null;
    if (!textModel || Number(textModel.pageCount) !== ctx.doc.pages.length) {
        textModel = await deps.buildKeyboardTextModel(ctx.engine, ctx.doc, null);
        if (cacheKey)
            deps.putKeyboardTextModelCache(cacheKey, textModel);
    }
    const globalMap = textModel.globalMap;
    const documentNormalized = textModel.documentNormalized;
    const visiblePage = Number(ctx.msg.visiblePage);
    const normalizeGesturePoint = p => p && [p.pageIndex, p.x, p.y].every(v => Number.isFinite(Number(v)))
        ? { pageIndex: Number(p.pageIndex), x: Number(p.x), y: Number(p.y) } : null;
    const gestureCoordinateSpace = String(ctx.msg.gestureHint?.coordinateSpace || 'pdf-bottom-origin');
    const gestureHint = ctx.msg.gestureHint ? {
        down: normalizeGesturePoint(ctx.msg.gestureHint.down),
        up: normalizeGesturePoint(ctx.msg.gestureHint.up),
        source: String(ctx.msg.gestureHint.source || ''),
        ageMs: Number.isFinite(Number(ctx.msg.gestureHint.ageMs)) ? Number(ctx.msg.gestureHint.ageMs) : null,
        debug: ctx.msg.gestureHint.debug || null
    } : null;
    // Main Bridge returns the inverse of Chromium convertPageToScreen(), which is
    // native PDF page space (bottom-origin Y). Text-locator scoring below uses
    // top-origin glyph boxes, so convert exactly once at this boundary.
    const gestureTopPoint = point => {
        if (!point)
            return null;
        const pageHeight = Number(ctx.doc.pages[Number(point.pageIndex)]?.size?.height);
        if (!Number.isFinite(pageHeight))
            return point;
        return gestureCoordinateSpace === 'pdf-bottom-origin'
            ? { ...point, y: pageHeight - Number(point.y) }
            : point;
    };
    const occurrences = [];
    const exactStart = Number(ctx.msg.exactRange?.start), exactEnd = Number(ctx.msg.exactRange?.end);
    const hasExactRange = [exactStart, exactEnd].every(Number.isFinite) && exactStart >= 0 && exactEnd >= exactStart && exactEnd < documentNormalized.length;
    let glyphCache = cacheKey ? deps.keyboardGlyphModelCache.get(cacheKey) : null;
    if (!(glyphCache instanceof Map))
        glyphCache = new Map();
    const getPageGlyphs = async (pageIndex) => {
        let glyphs = glyphCache.get(Number(pageIndex));
        if (!Array.isArray(glyphs)) {
            const arr = await ctx.engine.getPageGlyphs(ctx.doc, ctx.doc.pages[Number(pageIndex)]).toPromise();
            glyphs = Array.isArray(arr) ? arr : [];
            glyphCache.set(Number(pageIndex), glyphs);
            if (cacheKey)
                deps.putKeyboardGlyphModelCache(cacheKey, glyphCache);
        }
        return glyphs;
    };
    const nearestGlobalGlyphToPoint = async (point) => {
        if (!point || ![point.pageIndex, point.x, point.y].every(v => Number.isFinite(Number(v))))
            return null;
        const pageIndex = Number(point.pageIndex), px = Number(point.x);
        if (pageIndex < 0 || pageIndex >= ctx.doc.pages.length)
            return null;
        const glyphs = await getPageGlyphs(pageIndex);
        const pageHeight = Number(ctx.doc.pages[pageIndex]?.size?.height);
        if (!Number.isFinite(pageHeight))
            return null;
        const topPoint = gestureTopPoint(point);
        const py = Number(topPoint?.y);
        if (!Number.isFinite(py))
            return null;
        let best = null;
        for (let globalIndex = 0; globalIndex < globalMap.length; globalIndex += 1) {
            const map = globalMap[globalIndex];
            if (!map || Number(map.pageIndex) !== pageIndex || !Number.isFinite(Number(map.rawIndex)))
                continue;
            const rawIndex = Number(map.rawIndex), g = glyphs[rawIndex];
            const origin = g && (g.tightOrigin || g.origin), size = g && (g.tightSize || g.size);
            const x = Number(origin && origin.x), y = Number(origin && origin.y), width = Number(size && size.width), height = Number(size && size.height);
            if (![x, y, width, height].every(Number.isFinite) || width <= 0.05 || height <= 0.05)
                continue;
            const left = x, right = x + width, top = pageHeight - (y + height), bottom = pageHeight - y;
            const dx = px < left ? left - px : (px > right ? px - right : 0);
            const dy = py < top ? top - py : (py > bottom ? py - bottom : 0);
            const edgeDistance = Math.hypot(dx, dy);
            const centerDistance = Math.hypot(px - (left + right) * 0.5, py - (top + bottom) * 0.5);
            const score = edgeDistance * 1000 + centerDistance;
            if (!best || score < best.score)
                best = { globalIndex, pageIndex, rawIndex, score, edgeDistance, centerDistance, rect: { left, right, top, bottom } };
        }
        if (!best || best.edgeDistance > 48)
            return null;
        return best;
    };
    let rangeSource = null;
    let gestureEndpoints = null;
    if (hasExactRange) {
        const pages = [...new Set(globalMap.slice(exactStart, exactEnd + 1).filter(Boolean).map(x => Number(x.pageIndex)).filter(Number.isFinite))];
        const distance = Number.isFinite(visiblePage) && pages.length ? Math.min(...pages.map(pg => Math.abs(pg - visiblePage))) : 0;
        occurrences.push({ start: exactStart, end: exactEnd, pages, distance, gestureScore: null, exactRange: true, rangeSource: 'exact-range' });
        rangeSource = 'exact-range';
    }
    else if (gestureHint?.down && gestureHint?.up && Number(gestureHint.down.pageIndex) !== Number(gestureHint.up.pageIndex)) {
        // physical endpoints remain authoritative only after the
        // reconstructed range is checked against Chromium's actual selection
        // text. This prevents stale/wrong wrapper geometry from silently
        // selecting a neighbouring range after cross-page autoscroll.
        const downHit = await nearestGlobalGlyphToPoint(gestureHint.down);
        const upHit = await nearestGlobalGlyphToPoint(gestureHint.up);
        if (downHit && upHit) {
            const start = Math.min(downHit.globalIndex, upHit.globalIndex);
            const end = Math.max(downHit.globalIndex, upHit.globalIndex);
            const candidateText = documentNormalized.slice(start, end + 1);
            const compact = s => String(s || '').replace(/\s+/gu, '');
            const selectedCompact = compact(selected);
            const candidateCompact = compact(candidateText);
            const lengthDelta = Math.abs(candidateCompact.length - selectedCompact.length);
            const tolerance = Math.max(2, Math.ceil(selectedCompact.length * 0.01));
            const textMatch = !selectedCompact || candidateCompact === selectedCompact ||
                (lengthDelta <= tolerance && (candidateCompact.includes(selectedCompact) || selectedCompact.includes(candidateCompact)));
            gestureEndpoints = { down: downHit, up: upHit, validation: { textMatch, selectedLength: selectedCompact.length, candidateLength: candidateCompact.length, lengthDelta, tolerance } };
            if (textMatch) {
                const pages = [...new Set(globalMap.slice(start, end + 1).filter(Boolean).map(x => Number(x.pageIndex)).filter(Number.isFinite))];
                const distance = Number.isFinite(visiblePage) && pages.length ? Math.min(...pages.map(pg => Math.abs(pg - visiblePage))) : 0;
                occurrences.push({ start, end, pages, distance, gestureScore: 0, exactRange: true, rangeSource: 'cross-page-mouse-gesture-validated' });
                rangeSource = 'cross-page-mouse-gesture-validated';
            }
        }
    }
    if (!occurrences.length && selected) {
        let from = 0;
        while (from <= documentNormalized.length - selected.length) {
            const at = documentNormalized.indexOf(selected, from);
            if (at < 0)
                break;
            const end = at + selected.length - 1;
            const pages = [...new Set(globalMap.slice(at, end + 1).filter(Boolean).map(x => Number(x.pageIndex)).filter(Number.isFinite))];
            const distance = Number.isFinite(visiblePage) && pages.length ? Math.min(...pages.map(pg => Math.abs(pg - visiblePage))) : 0;
            occurrences.push({ start: at, end, pages, distance, gestureScore: null, exactRange: false, rangeSource: 'text-search' });
            from = at + 1;
        }
        if (occurrences.length)
            rangeSource = 'text-search';
    }
    if (!occurrences.length) {
        if (!selected && !(gestureHint?.down && gestureHint?.up))
            throw new Error('Ingen selection-tekst eller komplett musegeometri å filtrere.');
        throw new Error('Fant ikke native selection sikkert i rå PDF-tekst for Artifact-filter.');
    }
    const glyphRecordAt = async (globalIndex, step) => {
        let i = globalIndex;
        while (i >= 0 && i < globalMap.length) {
            const map = globalMap[i];
            if (map && Number.isFinite(Number(map.rawIndex))) {
                const glyphs = await getPageGlyphs(Number(map.pageIndex));
                const g = glyphs[Number(map.rawIndex)];
                const origin = g && (g.tightOrigin || g.origin);
                const size = g && (g.tightSize || g.size);
                const x = Number(origin && origin.x), y = Number(origin && origin.y), width = Number(size && size.width), height = Number(size && size.height);
                if ([x, y, width, height].every(Number.isFinite) && width > 0.05 && height > 0.05) {
                    // getPageGlyphs() coordinates are already EmbedPDF/top-origin.
                    // The mouse gesture was converted to top-origin once at gestureTopPoint();
                    // do not mirror glyph Y again for endpoint tie-breaking.
                    const cyTop = y + height * 0.5;
                    return { globalIndex: i, pageIndex: Number(map.pageIndex), rawIndex: Number(map.rawIndex), x: x + width * 0.5, y: cyTop };
                }
            }
            i += step;
        }
        return null;
    };
    const scorePoint = (a, b) => (!a || !b) ? Number.POSITIVE_INFINITY : Math.abs(a.pageIndex - b.pageIndex) * 100000 + Math.hypot(a.x - b.x, a.y - b.y);
    // text alone is never sufficient identity for native mouse
    // selection. A short selection such as "for" may legitimately occur as a
    // whole word AND as a substring elsewhere on the same page. For duplicate
    // text candidates, score the complete candidate glyph geometry against the
    // physical left-mouse gesture. A double-click has down/up at almost the same
    // point, so endpoint-only scoring is intrinsically weak; containment / nearest
    // distance to the candidate glyph boxes identifies the actual occurrence.
    const gestureTopPoints = [gestureTopPoint(gestureHint?.down), gestureTopPoint(gestureHint?.up)].filter(Boolean);
    const occurrenceGestureGeometry = async (occurrence) => {
        if (!gestureTopPoints.length)
            return null;
        const gesturePages = new Set(gestureTopPoints.map(p => Number(p.pageIndex)).filter(Number.isFinite));
        const occurrencePages = new Set((Array.isArray(occurrence.pages) ? occurrence.pages : []).map(Number).filter(Number.isFinite));
        // Same-page native selection cannot resolve to an occurrence on another
        // page. Reject those candidates without loading their glyph models.
        if (gesturePages.size && ![...gesturePages].some(pg => occurrencePages.has(pg))) {
            return { score: 100000 * gestureTopPoints.length, pointDistances: gestureTopPoints.map(() => 100000), rectCount: 0, pageMismatch: true };
        }
        const rawRanges = new Map();
        for (let i = Number(occurrence.start); i <= Number(occurrence.end); i += 1) {
            const map = globalMap[i];
            if (!map || !Number.isFinite(Number(map.pageIndex)) || !Number.isFinite(Number(map.rawIndex)))
                continue;
            const pageIndex = Number(map.pageIndex), rawIndex = Number(map.rawIndex);
            const rr = rawRanges.get(pageIndex) || { min: rawIndex, max: rawIndex };
            rr.min = Math.min(rr.min, rawIndex);
            rr.max = Math.max(rr.max, rawIndex);
            rawRanges.set(pageIndex, rr);
        }
        const topRects = [];
        const pdfRects = [];
        const rawRangeDiagnostics = [];
        for (const [pageIndex, rr] of rawRanges.entries()) {
            rawRangeDiagnostics.push({ pageIndex, rawStart: rr.min, rawEnd: rr.max });
            if (gesturePages.size && !gesturePages.has(pageIndex))
                continue;
            const glyphs = await getPageGlyphs(pageIndex);
            const rawText = textModel.pageMaps?.[pageIndex]?.extractedText || null;
            const hit = deps.glyphRectsForRawRange(glyphs, rr.min, rr.max, pageIndex, null, rawText);
            for (const rect of hit.rects) {
                const x = Number(rect?.origin?.x), y = Number(rect?.origin?.y), width = Number(rect?.size?.width), height = Number(rect?.size?.height);
                if (![x, y, width, height].every(Number.isFinite))
                    continue;
                // engine.getPageGlyphs() / glyphRectsForRawRange() already
                // return EmbedPDF page-model coordinates with top-origin Y. The gesture
                // points above are also top-origin after gestureTopPoint(). The
                // mirrored these glyph boxes a second time, which made the first whole
                // word "for" lose to the substring "for" in "gebyrforskrift".
                pdfRects.push({ pageIndex, origin: { x, y }, size: { width, height } });
                topRects.push({ pageIndex, left: x, right: x + width, top: y, bottom: y + height });
            }
        }
        if (!topRects.length)
            return { score: Number.POSITIVE_INFINITY, pointDistances: [], rectCount: 0, pageMismatch: false, rawRanges: rawRangeDiagnostics, pdfRects, topRects, unionTopRect: null };
        const scored = deps.scoreGesturePointsAgainstTopRects(gestureTopPoints, topRects);
        const unionTopRect = {
            left: Math.min(...topRects.map(r => r.left)), right: Math.max(...topRects.map(r => r.right)),
            top: Math.min(...topRects.map(r => r.top)), bottom: Math.max(...topRects.map(r => r.bottom))
        };
        return {
            score: scored.score,
            pointDistances: scored.pointDistances,
            rectCount: scored.rectCount,
            pageMismatch: false,
            rawRanges: rawRangeDiagnostics,
            pdfRects,
            topRects,
            unionTopRect
        };
    };
    if (occurrences.length > 1 && gestureTopPoints.length) {
        for (const occurrence of occurrences) {
            const geometry = await occurrenceGestureGeometry(occurrence);
            occurrence.gestureGeometryScore = Number(geometry?.score);
            occurrence.gesturePointDistances = geometry?.pointDistances || null;
            occurrence.gestureGeometryRectCount = Number(geometry?.rectCount || 0);
            occurrence.gesturePageMismatch = !!geometry?.pageMismatch;
            occurrence.gestureGeometryDiagnostics = geometry || null;
            // Keep endpoint scoring only as a deterministic secondary signal for
            // true drags. It is no longer the primary identity signal because a
            // double-click places both physical points inside the selected word.
            const startRec = await glyphRecordAt(occurrence.start, +1);
            const endRec = await glyphRecordAt(occurrence.end, -1);
            const d = gestureTopPoints[0] || null, u = gestureTopPoints[1] || null;
            if (d && u)
                occurrence.gestureEndpointScore = Math.min(scorePoint(startRec, d) + scorePoint(endRec, u), scorePoint(startRec, u) + scorePoint(endRec, d));
            else
                occurrence.gestureEndpointScore = Math.min(scorePoint(startRec, d || u), scorePoint(endRec, d || u));
            occurrence.gestureScore = Number.isFinite(occurrence.gestureGeometryScore) ? occurrence.gestureGeometryScore : occurrence.gestureEndpointScore;
        }
    }
    occurrences.sort((a, b) => (a.gestureGeometryScore ?? Number.POSITIVE_INFINITY) - (b.gestureGeometryScore ?? Number.POSITIVE_INFINITY) ||
        (a.gestureEndpointScore ?? Number.POSITIVE_INFINITY) - (b.gestureEndpointScore ?? Number.POSITIVE_INFINITY) ||
        a.distance - b.distance || a.start - b.start);
    if (occurrences.length > 1) {
        const first = occurrences[0], second = occurrences[1];
        const firstGeometry = Number(first.gestureGeometryScore), secondGeometry = Number(second.gestureGeometryScore);
        const firstEndpoint = Number(first.gestureEndpointScore), secondEndpoint = Number(second.gestureEndpointScore);
        const uniquelyByGeometry = Number.isFinite(firstGeometry) && (!Number.isFinite(secondGeometry) || firstGeometry + 0.5 < secondGeometry);
        const geometryTied = Number.isFinite(firstGeometry) && Number.isFinite(secondGeometry) && Math.abs(firstGeometry - secondGeometry) <= 0.5;
        const uniquelyByEndpoint = geometryTied && Number.isFinite(firstEndpoint) && (!Number.isFinite(secondEndpoint) || firstEndpoint + 0.5 < secondEndpoint);
        const uniquelyVisible = !Number.isFinite(firstGeometry) && !Number.isFinite(firstEndpoint) && first.distance < second.distance;
        if (!uniquelyByGeometry && !uniquelyByEndpoint && !uniquelyVisible)
            throw new Error('Artifact-filter: selection forekommer flere steder og kan ikke identifiseres entydig.');
    }
    const chosen = occurrences[0];
    if (chosen?.rangeSource === 'text-search' && occurrences.length > 1 && Number.isFinite(Number(chosen.gestureGeometryScore))) {
        chosen.rangeSource = 'text-search-gesture-geometry';
    }
    rangeSource = chosen?.rangeSource || rangeSource || null;
    // Retain the complete same-page occurrence diagnostic.
    // This does not affect ranking or the chosen range.
    const diagnosticDownHit = gestureHint?.down ? await nearestGlobalGlyphToPoint(gestureHint.down) : null;
    const diagnosticUpHit = gestureHint?.up ? await nearestGlobalGlyphToPoint(gestureHint.up) : null;
    const selectionDirection = diagnosticDownHit && diagnosticUpHit
        ? (diagnosticDownHit.globalIndex < diagnosticUpHit.globalIndex ? 'forward' : (diagnosticDownHit.globalIndex > diagnosticUpHit.globalIndex ? 'reverse' : 'same-glyph'))
        : null;
    const candidateDiagnostics = occurrences.map((occurrence, rank) => ({
        rank,
        chosen: occurrence === chosen,
        normalizedRange: { start: Number(occurrence.start), end: Number(occurrence.end) },
        pages: Array.isArray(occurrence.pages) ? occurrence.pages : null,
        visiblePageDistance: Number(occurrence.distance),
        rangeSource: occurrence.rangeSource || null,
        exactRange: !!occurrence.exactRange,
        gestureGeometryScore: Number.isFinite(Number(occurrence.gestureGeometryScore)) ? Number(occurrence.gestureGeometryScore) : null,
        gesturePointDistances: Array.isArray(occurrence.gesturePointDistances) ? occurrence.gesturePointDistances : null,
        gestureEndpointScore: Number.isFinite(Number(occurrence.gestureEndpointScore)) ? Number(occurrence.gestureEndpointScore) : null,
        scoreReason: 'primary=sum(distance gesture points -> candidate glyph boxes); secondary=endpoint pairing when geometry ties; then visible-page distance; then raw order',
        geometry: occurrence.gestureGeometryDiagnostics || null
    }));
    const identityDiagnostic = {
        diagnosticVersion: '0.1.194',
        selectionText: selected,
        visiblePage: Number.isFinite(visiblePage) ? visiblePage : null,
        gesture: {
            coordinateSpace: gestureCoordinateSpace,
            source: gestureHint?.source || null,
            ageMs: gestureHint?.ageMs ?? null,
            down: gestureHint?.down || null,
            up: gestureHint?.up || null,
            downTop: gestureTopPoint(gestureHint?.down),
            upTop: gestureTopPoint(gestureHint?.up),
            eventTransform: gestureHint?.debug || null,
            nearestDownGlyph: diagnosticDownHit,
            nearestUpGlyph: diagnosticUpHit,
            selectionDirection
        },
        candidates: candidateDiagnostics,
        chosen: { rank: 0, normalizedRange: { start: Number(chosen.start), end: Number(chosen.end) }, pages: chosen.pages, rangeSource },
        downstreamRange: { start: Number(chosen.start), end: Number(chosen.end) }
    };
    // preserve INTERNAL native-selection identity once the exact
    // normalized document range has been resolved. Mouse selections used to
    // discard this identity and later search selectionText again when the
    // context menu inspected or wrote a Highlight. That is fragile across
    // page boundaries (and for duplicate text). Build raw PDF glyph geometry
    // directly from the resolved range and return it alongside OUTWARD text.
    const resolvedPageRawRanges = new Map();
    for (let i = chosen.start; i <= chosen.end; i += 1) {
        const map = globalMap[i];
        if (!map || !Number.isFinite(Number(map.pageIndex)) || !Number.isFinite(Number(map.rawIndex)))
            continue;
        const pageIndex = Number(map.pageIndex), rawIndex = Number(map.rawIndex);
        const range = resolvedPageRawRanges.get(pageIndex) || { min: rawIndex, max: rawIndex };
        range.min = Math.min(range.min, rawIndex);
        range.max = Math.max(range.max, rawIndex);
        resolvedPageRawRanges.set(pageIndex, range);
    }
    const resolvedHits = [];
    for (const [pageIndex, rr] of resolvedPageRawRanges.entries()) {
        const glyphs = await getPageGlyphs(pageIndex);
        resolvedHits.push(deps.glyphRectsForRawRange(glyphs, rr.min, rr.max, pageIndex, null, textModel.pageMaps?.[pageIndex]?.extractedText || null));
    }
    const resolvedMerged = deps.dedupeAndMergeRects(resolvedHits);
    const resolvedPages = [...new Set(resolvedMerged.mergedRects.map(r => Number(r.pageIndex)).filter(Number.isFinite))].sort((a, b) => a - b);
    const resolvedGeometry = {
        source: 'native-resolved-range-exact-geometry',
        complete: resolvedMerged.mergedRects.length > 0 && resolvedPages.length > 0,
        pages: resolvedPages,
        range: { start: chosen.start, end: chosen.end },
        rawRectCount: resolvedMerged.rawRects.length,
        mergedRectCount: resolvedMerged.mergedRects.length,
        rawRects: resolvedMerged.rawRects,
        mergedRects: resolvedMerged.mergedRects
    };
    let persistentArtifactCache = cacheKey ? deps.keyboardArtifactIndexCache.get(cacheKey) : null;
    if (!(persistentArtifactCache instanceof Map))
        persistentArtifactCache = new Map();
    const getArtifactRawIndexes = pageIndex => {
        if (persistentArtifactCache.has(pageIndex))
            return persistentArtifactCache.get(pageIndex);
        const indexes = deps.scanArtifactRawIndexes(ctx.native, ctx.pdfiumModule, ctx.doc, pageIndex);
        persistentArtifactCache.set(pageIndex, indexes);
        if (cacheKey)
            deps.putKeyboardArtifactIndexCache(cacheKey, persistentArtifactCache);
        return indexes;
    };
    let artifactExcludedRawCount = 0;
    let continuityExcludedRawCount = 0;
    const chars = [];
    // Artifact remains authoritative. If one page at a real page
    // boundary has an Artifact-tagged numeric footer/header and its adjacent
    // page has the sequential numeric token in the same physical margin but
    // lacks the tag, treat only that uniquely matched token as a missing
    // Artifact tag. PDFs with no Artifact evidence are unchanged.
    const digitArtifactDiagnostics = [];
    const pageArtifactSummary = new Map();
    for (const pg of chosen.pages) {
        const excluded = getArtifactRawIndexes(Number(pg));
        pageArtifactSummary.set(Number(pg), { pageIndex: Number(pg), artifactRawIndexCount: excluded instanceof Set ? excluded.size : 0, artifactCharsInChosenRange: [] });
    }
    const glyphMetricAt = async (globalIndex) => {
        const map = globalMap[globalIndex];
        if (!map || !Number.isFinite(Number(map.rawIndex)) || !Number.isFinite(Number(map.pageIndex)))
            return null;
        const pageIndex = Number(map.pageIndex), rawIndex = Number(map.rawIndex);
        const glyphs = await getPageGlyphs(pageIndex);
        const g = glyphs[rawIndex];
        const origin = g && (g.tightOrigin || g.origin), size = g && (g.tightSize || g.size);
        const x = Number(origin && origin.x), y = Number(origin && origin.y), width = Number(size && size.width), height = Number(size && size.height);
        const pageWidth = Number(ctx.doc.pages[pageIndex]?.size?.width), pageHeight = Number(ctx.doc.pages[pageIndex]?.size?.height);
        if (![x, y, width, height, pageWidth, pageHeight].every(Number.isFinite) || width <= 0.05 || height <= 0.05 || pageWidth <= 0 || pageHeight <= 0)
            return null;
        const cx = x + width * 0.5, cyTop = pageHeight - (y + height * 0.5);
        return { globalIndex, pageIndex, rawIndex, x: cx, y: cyTop, pageWidth, pageHeight, xNorm: cx / pageWidth, yNorm: cyTop / pageHeight };
    };
    const numericTokens = [];
    for (let i = chosen.start; i <= chosen.end;) {
        const ch = documentNormalized[i] || '';
        const map = globalMap[i];
        if (!/\d/u.test(ch) || !map || !Number.isFinite(Number(map.pageIndex))) {
            i += 1;
            continue;
        }
        const pageIndex = Number(map.pageIndex), startIndex = i, indexes = [];
        let text = '';
        while (i <= chosen.end) {
            const c = documentNormalized[i] || '', m = globalMap[i];
            if (!/\d/u.test(c) || !m || Number(m.pageIndex) !== pageIndex)
                break;
            text += c;
            indexes.push(i);
            i += 1;
        }
        const artifactFlags = indexes.map(idx => {
            const m = globalMap[idx];
            const excluded = getArtifactRawIndexes(Number(m.pageIndex));
            return excluded instanceof Set && excluded.has(Number(m.rawIndex));
        });
        const firstMetric = await glyphMetricAt(indexes[0]);
        const lastMetric = await glyphMetricAt(indexes[indexes.length - 1]);
        let metric = null;
        if (firstMetric && lastMetric) {
            metric = { pageIndex, x: (firstMetric.x + lastMetric.x) * 0.5, y: (firstMetric.y + lastMetric.y) * 0.5,
                pageWidth: firstMetric.pageWidth, pageHeight: firstMetric.pageHeight,
                xNorm: (firstMetric.xNorm + lastMetric.xNorm) * 0.5, yNorm: (firstMetric.yNorm + lastMetric.yNorm) * 0.5 };
        }
        const marginType = metric ? (metric.yNorm <= 0.12 ? 'top' : (metric.yNorm >= 0.88 ? 'bottom' : null)) : null;
        numericTokens.push({ pageIndex, start: startIndex, end: indexes[indexes.length - 1], indexes, text, value: Number(text),
            allArtifact: artifactFlags.length > 0 && artifactFlags.every(Boolean), anyArtifact: artifactFlags.some(Boolean), metric, marginType });
    }
    const continuityExcludedGlobalIndexes = new Set();
    const continuityMatches = [];
    const orderedPages = [...new Set(chosen.pages.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
    for (let pi = 0; pi < orderedPages.length - 1; pi += 1) {
        const firstPage = orderedPages[pi], secondPage = orderedPages[pi + 1];
        if (secondPage !== firstPage + 1)
            continue;
        const firstTokens = numericTokens.filter(t => t.pageIndex === firstPage && t.marginType && Number.isInteger(t.value));
        const secondTokens = numericTokens.filter(t => t.pageIndex === secondPage && t.marginType && Number.isInteger(t.value));
        const candidates = [];
        for (const a of firstTokens)
            for (const b of secondTokens) {
                if (b.value !== a.value + 1 || a.marginType !== b.marginType || !a.metric || !b.metric)
                    continue;
                const aligned = Math.abs(a.metric.xNorm - b.metric.xNorm) <= 0.08 && Math.abs(a.metric.yNorm - b.metric.yNorm) <= 0.04;
                if (!aligned)
                    continue;
                if (a.allArtifact && !b.anyArtifact)
                    candidates.push({ artifact: a, repair: b });
                else if (b.allArtifact && !a.anyArtifact)
                    candidates.push({ artifact: b, repair: a });
            }
        if (candidates.length === 1) {
            const match = candidates[0];
            for (const idx of match.repair.indexes)
                continuityExcludedGlobalIndexes.add(idx);
            continuityMatches.push({
                pages: [firstPage, secondPage], marginType: match.repair.marginType,
                artifactToken: { pageIndex: match.artifact.pageIndex, text: match.artifact.text, start: match.artifact.start, end: match.artifact.end, xNorm: match.artifact.metric?.xNorm ?? null, yNorm: match.artifact.metric?.yNorm ?? null },
                repairedToken: { pageIndex: match.repair.pageIndex, text: match.repair.text, start: match.repair.start, end: match.repair.end, xNorm: match.repair.metric?.xNorm ?? null, yNorm: match.repair.metric?.yNorm ?? null }
            });
        }
    }
    for (let i = chosen.start; i <= chosen.end; i += 1) {
        const map = globalMap[i];
        const ch = documentNormalized[i] || '';
        let isArtifact = false;
        if (map && Number.isFinite(Number(map.rawIndex))) {
            const pageIndex = Number(map.pageIndex), rawIndex = Number(map.rawIndex);
            const excluded = getArtifactRawIndexes(pageIndex);
            isArtifact = excluded instanceof Set && excluded.has(rawIndex);
            if (isArtifact) {
                artifactExcludedRawCount += 1;
                const summary = pageArtifactSummary.get(pageIndex);
                if (summary)
                    summary.artifactCharsInChosenRange.push({ globalIndex: i, rawIndex, char: ch });
            }
            if (/\d/u.test(ch))
                digitArtifactDiagnostics.push({ globalIndex: i, pageIndex, rawIndex, char: ch, isArtifact, continuityExcluded: continuityExcludedGlobalIndexes.has(i) });
            if (isArtifact)
                continue;
        }
        else if (/\d/u.test(ch)) {
            digitArtifactDiagnostics.push({ globalIndex: i, pageIndex: null, rawIndex: null, char: ch, isArtifact: false, continuityExcluded: continuityExcludedGlobalIndexes.has(i) });
        }
        if (continuityExcludedGlobalIndexes.has(i)) {
            continuityExcludedRawCount += 1;
            continue;
        }
        chars.push(ch);
    }
    const filteredText = deps.normalizeSearchText(chars.join(''));
    const artifactDiagnostics = { digits: digitArtifactDiagnostics, pages: [...pageArtifactSummary.values()], continuityMatches };
    await ctx.engine.closeDocument(ctx.doc).toPromise();
    ctx.doc = null;
    deps.send({ source: 'pdfium-gate-annotator', type: 'filter-selection-result', requestId: ctx.requestId, ok: true, filteredText, artifactExcludedRawCount, continuityExcludedRawCount,
        rawNormalizedText: selected, range: { start: chosen.start, end: chosen.end }, pages: chosen.pages, occurrenceCount: occurrences.length, rangeSource, gestureEndpoints, resolvedGeometry, identityDiagnostic, artifactDiagnostics });
    return;
}

module.exports = { handleFilterSelectionArtifacts };
