'use strict';

async function handleKeyboardExpandSelection(ctx, deps) {
    const selected = deps.normalizeSearchText(ctx.msg.text);
    const direction = String(ctx.msg.direction || 'right');
    const requestedUnit = String(ctx.msg.unit || 'glyph');
    const unit = requestedUnit === 'select-all' ? 'select-all' : (requestedUnit === 'word' ? 'word' : (requestedUnit === 'line-edge' ? 'line-edge' : (requestedUnit === 'document-edge' ? 'document-edge' : (requestedUnit === 'viewport' ? 'viewport' : 'glyph'))));
    const visiblePage = Number(ctx.msg.visiblePage);
    const keyboardViewerState = ctx.msg.viewerState && typeof ctx.msg.viewerState === 'object' ? ctx.msg.viewerState : null;
    if (!selected && unit !== 'select-all')
        throw new Error('Ingen eksisterende selection. Marker litt tekst med mus først.');
    const cacheKey = String(ctx.msg.pdfToken || '');
    let textModel = cacheKey ? deps.keyboardTextModelCache.get(cacheKey) : null;
    if (textModel && Number(textModel.pageCount) === ctx.doc.pages.length) {
        ctx.keyboardTiming.textModelCacheHit = true;
        ctx.keyboardTiming.textModelCacheBuildMs = 0;
    }
    else {
        ctx.keyboardTiming.textModelCacheHit = false;
        const modelBuildStarted = performance.now();
        textModel = await deps.buildKeyboardTextModel(ctx.engine, ctx.doc, ctx.keyboardTiming);
        ctx.keyboardTiming.textModelCacheBuildMs = ctx.kbRound(performance.now() - modelBuildStarted);
        if (cacheKey)
            deps.putKeyboardTextModelCache(cacheKey, textModel);
    }
    const pageMaps = textModel.pageMaps;
    const globalMap = textModel.globalMap;
    const documentNormalized = textModel.documentNormalized;
    const selectionHint = ctx.msg.hint && [ctx.msg.hint.pageIndex, ctx.msg.hint.x, ctx.msg.hint.y].every(v => Number.isFinite(Number(v)))
        ? { pageIndex: Number(ctx.msg.hint.pageIndex), x: Number(ctx.msg.hint.x), y: Number(ctx.msg.hint.y) } : null;
    const normalizeGesturePoint = p => p && [p.pageIndex, p.x, p.y].every(v => Number.isFinite(Number(v)))
        ? { pageIndex: Number(p.pageIndex), x: Number(p.x), y: Number(p.y) } : null;
    const selectionGestureHint = ctx.msg.gestureHint ? {
        down: normalizeGesturePoint(ctx.msg.gestureHint.down),
        up: normalizeGesturePoint(ctx.msg.gestureHint.up)
    } : null;
    const requestedRange = ctx.msg.rangeHint && [ctx.msg.rangeHint.start, ctx.msg.rangeHint.end].every(v => Number.isFinite(Number(v)))
        ? { start: Math.floor(Number(ctx.msg.rangeHint.start)), end: Math.floor(Number(ctx.msg.rangeHint.end)) } : null;
    const requestedSelectionModel = ctx.msg.selectionModel && [ctx.msg.selectionModel.anchorPos, ctx.msg.selectionModel.focusPos].every(v => Number.isFinite(Number(v)))
        ? {
            anchorPos: Math.floor(Number(ctx.msg.selectionModel.anchorPos)),
            focusPos: Math.floor(Number(ctx.msg.selectionModel.focusPos)),
            preferredX: ctx.msg.selectionModel.preferredX != null && Number.isFinite(Number(ctx.msg.selectionModel.preferredX)) ? Number(ctx.msg.selectionModel.preferredX) : null,
            seedStartPos: ctx.msg.selectionModel.seedStartPos != null && Number.isFinite(Number(ctx.msg.selectionModel.seedStartPos)) ? Math.floor(Number(ctx.msg.selectionModel.seedStartPos)) : null,
            seedEndPos: ctx.msg.selectionModel.seedEndPos != null && Number.isFinite(Number(ctx.msg.selectionModel.seedEndPos)) ? Math.floor(Number(ctx.msg.selectionModel.seedEndPos)) : null,
            viewportDirection: ['up', 'down'].includes(String(ctx.msg.selectionModel.viewportDirection || '')) ? String(ctx.msg.selectionModel.viewportDirection) : null,
            viewportTrail: Array.isArray(ctx.msg.selectionModel.viewportTrail) ? ctx.msg.selectionModel.viewportTrail.slice(-32).map(item => ({
                anchorPos: item?.anchorPos != null && Number.isFinite(Number(item.anchorPos)) ? Math.floor(Number(item.anchorPos)) : null,
                focusPos: item?.focusPos != null && Number.isFinite(Number(item.focusPos)) ? Math.floor(Number(item.focusPos)) : null,
                preferredX: item?.preferredX != null && Number.isFinite(Number(item.preferredX)) ? Number(item.preferredX) : null,
                selectionHint: item?.selectionHint && [item.selectionHint.pageIndex, item.selectionHint.x, item.selectionHint.y].every(v => Number.isFinite(Number(v)))
                    ? { pageIndex: Number(item.selectionHint.pageIndex), x: Number(item.selectionHint.x), y: Number(item.selectionHint.y) } : null
            })).filter(item => Number.isFinite(item.anchorPos) && Number.isFinite(item.focusPos)) : []
        } : null;
    const occurrenceFindStarted = performance.now();
    const occurrences = [];
    if (unit === 'select-all') {
        if (!documentNormalized.length)
            throw new Error('PDF-en inneholder ingen tekst som kan markeres.');
        occurrences.push({ start: 0, end: documentNormalized.length - 1, pages: Array.from({ length: textModel.pageCount }, (_, i) => i), distance: 0, rangeHintMatch: false, selectAll: true });
    }
    else if (requestedSelectionModel) {
        // once PDFium Gate owns a keyboard selection, anchor/focus are
        // the authoritative raw PDF-text identity. Outward text may exclude
        // /Artifact characters, so it must never be searched back into the raw
        // document stream to recover the current range.
        const modelStart = Math.min(requestedSelectionModel.anchorPos, requestedSelectionModel.focusPos);
        const modelEnd = Math.max(requestedSelectionModel.anchorPos, requestedSelectionModel.focusPos) - 1;
        if (modelStart >= 0 && modelEnd >= modelStart && modelEnd < documentNormalized.length) {
            const pages = [...new Set(globalMap.slice(modelStart, modelEnd + 1).filter(Boolean).map(x => x.pageIndex))];
            const rangeHintMatch = !!(requestedRange && requestedRange.start === modelStart && requestedRange.end === modelEnd);
            occurrences.push({ start: modelStart, end: modelEnd, pages, distance: 0, rangeHintMatch, hintScore: -1, selectionModelTrusted: true });
        }
    }
    else if (requestedRange && requestedRange.start >= 0 && requestedRange.end >= requestedRange.start && requestedRange.end < documentNormalized.length) {
        const rangeText = deps.normalizeSearchText(documentNormalized.slice(requestedRange.start, requestedRange.end + 1));
        if (rangeText === selected) {
            occurrences.push({ start: requestedRange.start, end: requestedRange.end, pages: [...new Set(globalMap.slice(requestedRange.start, requestedRange.end + 1).filter(Boolean).map(x => x.pageIndex))], distance: 0, rangeHintMatch: true, hintScore: -1 });
        }
    }
    if (!occurrences.length) {
        let from = 0;
        while (from <= documentNormalized.length - selected.length) {
            const at = documentNormalized.indexOf(selected, from);
            if (at < 0)
                break;
            const end = at + selected.length - 1;
            const pages = [...new Set(globalMap.slice(at, end + 1).filter(Boolean).map(x => x.pageIndex))];
            const distance = Number.isFinite(visiblePage) && pages.length ? Math.min(...pages.map(pg => Math.abs(pg - visiblePage))) : 0;
            occurrences.push({ start: at, end, pages, distance, rangeHintMatch: false });
            from = at + 1;
        }
    }
    occurrences.sort((a, b) => (a.rangeHintMatch === b.rangeHintMatch ? 0 : (a.rangeHintMatch ? -1 : 1)) || a.distance - b.distance || a.start - b.start);
    ctx.keyboardTiming.occurrenceFindMs = ctx.kbRound(performance.now() - occurrenceFindStarted);
    const includeHeaderFooterText = ctx.msg.includeHeaderFooterText !== false;
    let persistentArtifactCache = cacheKey ? deps.keyboardArtifactIndexCache.get(cacheKey) : null;
    if (!(persistentArtifactCache instanceof Map))
        persistentArtifactCache = null;
    const getArtifactRawIndexes = async (pageIndex) => {
        if (includeHeaderFooterText)
            return null;
        if (persistentArtifactCache && persistentArtifactCache.has(pageIndex))
            return persistentArtifactCache.get(pageIndex);
        const indexes = deps.scanArtifactRawIndexes(ctx.native, ctx.pdfiumModule, ctx.doc, pageIndex);
        if (!persistentArtifactCache) {
            persistentArtifactCache = new Map();
            if (cacheKey)
                deps.putKeyboardArtifactIndexCache(cacheKey, persistentArtifactCache);
        }
        persistentArtifactCache.set(pageIndex, indexes);
        return indexes;
    };
    let persistentGlyphCache = cacheKey ? deps.keyboardGlyphModelCache.get(cacheKey) : null;
    if (!(persistentGlyphCache instanceof Map))
        persistentGlyphCache = null;
    ctx.keyboardTiming.glyphCachePagesAvailable = persistentGlyphCache ? persistentGlyphCache.size : 0;
    const glyphCache = new Map();
    const getGlyphs = async (pageIndex) => {
        if (glyphCache.has(pageIndex))
            return glyphCache.get(pageIndex);
        if (persistentGlyphCache && persistentGlyphCache.has(pageIndex)) {
            ctx.keyboardTiming.glyphCachePageHits += 1;
            const cached = persistentGlyphCache.get(pageIndex);
            glyphCache.set(pageIndex, cached);
            return cached;
        }
        ctx.keyboardTiming.glyphCachePageMisses += 1;
        const glyphStarted = performance.now();
        const arr = await ctx.engine.getPageGlyphs(ctx.doc, ctx.doc.pages[pageIndex]).toPromise();
        ctx.keyboardTiming.glyphFetchMs = ctx.kbRound(ctx.keyboardTiming.glyphFetchMs + (performance.now() - glyphStarted));
        ctx.keyboardTiming.glyphPagesLoaded += 1;
        const normalizedGlyphs = Array.isArray(arr) ? arr : [];
        glyphCache.set(pageIndex, normalizedGlyphs);
        if (cacheKey) {
            if (!persistentGlyphCache) {
                persistentGlyphCache = new Map();
                deps.putKeyboardGlyphModelCache(cacheKey, persistentGlyphCache);
            }
            persistentGlyphCache.set(pageIndex, normalizedGlyphs);
        }
        return normalizedGlyphs;
    };
    const glyphRecordAt = async (globalIndex, step) => {
        let i = globalIndex;
        while (i >= 0 && i < globalMap.length) {
            const map = globalMap[i];
            if (map && Number.isFinite(Number(map.rawIndex))) {
                const glyphs = await getGlyphs(map.pageIndex);
                const g = glyphs[map.rawIndex];
                const origin = g && (g.tightOrigin || g.origin);
                const size = g && (g.tightSize || g.size);
                const x = Number(origin && origin.x), y = Number(origin && origin.y);
                const width = Number(size && size.width), height = Number(size && size.height);
                if ([x, y, width, height].every(Number.isFinite) && width > 0.05 && height > 0.05) {
                    const pageHeight = Number(ctx.doc.pages[map.pageIndex]?.size?.height);
                    return { globalIndex: i, pageIndex: map.pageIndex, rawIndex: map.rawIndex, x, y, width, height, pageHeight: Number.isFinite(pageHeight) ? pageHeight : null };
                }
            }
            i += step;
        }
        return null;
    };
    const duplicateDisambiguationStarted = performance.now();
    if ((selectionHint || selectionGestureHint?.down || selectionGestureHint?.up) && !occurrences.some(o => o.rangeHintMatch)) {
        const topPoint = r => {
            if (!r)
                return null;
            const cx = r.x + r.width * 0.5;
            const cyPdf = r.y + r.height * 0.5;
            const cy = Number.isFinite(r.pageHeight) ? r.pageHeight - cyPdf : cyPdf;
            return { pageIndex: r.pageIndex, x: cx, y: cy, pdfY: cyPdf, pageHeight: r.pageHeight, rawIndex: r.rawIndex, globalIndex: r.globalIndex };
        };
        const scorePoint = (a, b) => {
            if (!a || !b)
                return Number.POSITIVE_INFINITY;
            return Math.abs(a.pageIndex - b.pageIndex) * 100000 + Math.hypot(a.x - b.x, a.y - b.y);
        };
        for (const occurrence of occurrences.slice(0, 120)) {
            const startRec = await glyphRecordAt(occurrence.start, +1);
            const endRec = await glyphRecordAt(occurrence.end, -1);
            const startPoint = topPoint(startRec), endPoint = topPoint(endRec);
            if (selectionGestureHint?.down || selectionGestureHint?.up) {
                const d = selectionGestureHint.down, u = selectionGestureHint.up;
                let gestureScore = Number.POSITIVE_INFINITY, orientation = null;
                if (d && u) {
                    const forward = scorePoint(startPoint, d) + scorePoint(endPoint, u);
                    const reverse = scorePoint(startPoint, u) + scorePoint(endPoint, d);
                    if (forward <= reverse) {
                        gestureScore = forward;
                        orientation = 'down→start/up→end';
                    }
                    else {
                        gestureScore = reverse;
                        orientation = 'down→end/up→start';
                    }
                }
                else {
                    const h = d || u;
                    gestureScore = Math.min(scorePoint(startPoint, h), scorePoint(endPoint, h));
                    orientation = d ? 'down-only' : 'up-only';
                }
                occurrence.gestureScore = gestureScore;
                occurrence.gestureOrientation = orientation;
            }
            if (selectionHint) {
                let best = null;
                for (const r of [startPoint, endPoint]) {
                    if (!r)
                        continue;
                    const score = scorePoint(r, selectionHint);
                    if (!best || score < best.score)
                        best = { score, ...r };
                }
                occurrence.hintScore = best ? best.score : Number.POSITIVE_INFINITY;
                occurrence.hintNearest = best;
            }
        }
        occurrences.sort((a, b) => (a.rangeHintMatch === b.rangeHintMatch ? 0 : (a.rangeHintMatch ? -1 : 1)) ||
            (a.gestureScore ?? Number.POSITIVE_INFINITY) - (b.gestureScore ?? Number.POSITIVE_INFINITY) ||
            (a.hintScore ?? Number.POSITIVE_INFINITY) - (b.hintScore ?? Number.POSITIVE_INFINITY) ||
            a.distance - b.distance || a.start - b.start);
    }
    ctx.keyboardTiming.duplicateDisambiguationMs = ctx.kbRound(performance.now() - duplicateDisambiguationStarted);
    const chosen = occurrences[0] || null;
    if (!chosen)
        throw new Error('Fant ikke gjeldende selection i PDF-teksten.');
    const movementStarted = performance.now();
    const glyphTopPoint = r => {
        if (!r)
            return null;
        const x = r.x + r.width * 0.5;
        const yPdf = r.y + r.height * 0.5;
        const y = Number.isFinite(r.pageHeight) ? r.pageHeight - yPdf : yPdf;
        return { pageIndex: r.pageIndex, x, y, globalIndex: r.globalIndex, height: r.height, width: r.width };
    };
    const glyphRecordExact = async (globalIndex) => {
        const map = globalMap[globalIndex];
        if (!map || !Number.isFinite(Number(map.rawIndex)))
            return null;
        const glyphs = await getGlyphs(map.pageIndex);
        const g = glyphs[map.rawIndex];
        const origin = g && (g.tightOrigin || g.origin);
        const size = g && (g.tightSize || g.size);
        const x = Number(origin && origin.x), y = Number(origin && origin.y);
        const width = Number(size && size.width), height = Number(size && size.height);
        if (![x, y, width, height].every(Number.isFinite) || width <= 0.05 || height <= 0.05)
            return null;
        const pageHeight = Number(ctx.doc.pages[map.pageIndex]?.size?.height);
        return { globalIndex, pageIndex: map.pageIndex, rawIndex: map.rawIndex, x, y, width, height, pageHeight: Number.isFinite(pageHeight) ? pageHeight : null };
    };
    const clampCaretPos = pos => Math.max(0, Math.min(documentNormalized.length, Math.floor(Number(pos) || 0)));
    let anchorPos = null, focusPos = null, preferredX = null;
    let seedStartPos = null, seedEndPos = null;
    let viewportDirection = null;
    let viewportTrail = [];
    if (unit === 'select-all') {
        anchorPos = 0;
        focusPos = documentNormalized.length;
        preferredX = null;
        seedStartPos = null;
        seedEndPos = null;
    }
    else if (requestedSelectionModel && (chosen.selectionModelTrusted || (requestedRange && requestedRange.start === chosen.start && requestedRange.end === chosen.end))) {
        anchorPos = clampCaretPos(requestedSelectionModel.anchorPos);
        focusPos = clampCaretPos(requestedSelectionModel.focusPos);
        preferredX = Number.isFinite(requestedSelectionModel.preferredX) ? requestedSelectionModel.preferredX : null;
        seedStartPos = Number.isFinite(requestedSelectionModel.seedStartPos) ? clampCaretPos(requestedSelectionModel.seedStartPos) : null;
        seedEndPos = Number.isFinite(requestedSelectionModel.seedEndPos) ? clampCaretPos(requestedSelectionModel.seedEndPos) : null;
        viewportDirection = requestedSelectionModel.viewportDirection || null;
        viewportTrail = (requestedSelectionModel.viewportTrail || []).map(item => ({
            anchorPos: clampCaretPos(item.anchorPos),
            focusPos: clampCaretPos(item.focusPos),
            preferredX: Number.isFinite(item.preferredX) ? Number(item.preferredX) : null,
            selectionHint: item.selectionHint || null
        })).slice(-32);
    }
    else {
        // The original native mouse selection is the protected "seed".
        // Horizontal reversal may shrink an extension back to this range, but
        // continuing in the opposite direction should switch active edge rather
        // than consume characters inside the mouse-selected seed itself.
        seedStartPos = clampCaretPos(chosen.start);
        seedEndPos = clampCaretPos(chosen.end + 1);
        // First keyboard step after a native mouse selection: the Shift-arrow
        // direction determines which seed edge is the active focus. Horizontal
        // Horizontal behavior is unchanged; the vertical case
        // explicit as well: Shift+Up starts from the seed's left/start caret,
        // Shift+Down from its right/end caret. This guarantees that the original
        // mouse-selected seed stays inside the selection regardless of mouse-drag
        // orientation.
        if (direction === 'left' || direction === 'up') {
            anchorPos = clampCaretPos(chosen.end + 1);
            focusPos = clampCaretPos(chosen.start);
        }
        else if (direction === 'right' || direction === 'down') {
            anchorPos = clampCaretPos(chosen.start);
            focusPos = clampCaretPos(chosen.end + 1);
        }
        else if (chosen.gestureOrientation === 'down→end/up→start') {
            anchorPos = clampCaretPos(chosen.end + 1);
            focusPos = clampCaretPos(chosen.start);
        }
        else {
            anchorPos = clampCaretPos(chosen.start);
            focusPos = clampCaretPos(chosen.end + 1);
        }
    }
    const lineNavigation = createKeyboardLineNavigation({
        pageMaps,
        globalMap,
        getArtifactRawIndexes,
        glyphRecordExact,
        glyphTopPoint,
        glyphRecordAt,
        requestedSelectionModel,
        selectionHint,
        includeHeaderFooterText,
        clampCaretPos,
        getSelectionState: () => ({ anchorPos, focusPos, preferredX })
    });
    const {
        getPageLines,
        activeGlyphRecord,
        hintedActiveGlyphRecord,
        glyphRecordNearHint,
        makeViewportSnapshot,
        findCurrentLineEdgeTarget,
        findAdjacentLineTarget
    } = lineNavigation;
    const viewportNavigation = createKeyboardViewportNavigation({
        keyboardViewerState,
        glyphTopPoint,
        clampCaretPos,
        getSelectionState: () => ({ anchorPos, focusPos, preferredX }),
        getPageLines,
        activeGlyphRecord,
        hintedActiveGlyphRecord
    });
    const { findViewportLineTarget } = viewportNavigation;
    const wordNavigation = createKeyboardWordNavigation({ documentNormalized, clampCaretPos });
    const { wordCaretTarget } = wordNavigation;
    let adjacentLineDebug = null;
    let targetRec = null;
    let newFocusPos = focusPos;
    let lineMove = null;
    let horizontalSeedSwitch = null;
    let verticalSeedReturn = null;
    let wordMove = null;
    let documentMove = null;
    let viewportHistoryRestore = null;
    // If a reversal has shrunk an earlier extension exactly back to the
    // original mouse-selected seed, the next horizontal Shift-arrow should
    // continue from the matching outer edge of that seed. Do not chew into
    // the seed one character at a time.
    if (requestedSelectionModel &&
        Number.isFinite(seedStartPos) && Number.isFinite(seedEndPos) &&
        seedEndPos > seedStartPos &&
        (direction === 'left' || direction === 'right')) {
        const currentStart = Math.min(anchorPos, focusPos);
        const currentEnd = Math.max(anchorPos, focusPos);
        const exactlyAtSeed = currentStart === seedStartPos && currentEnd === seedEndPos;
        let visuallyAtSeedFromLeft = false;
        let visuallyAtSeedFromRight = false;
        if (!exactlyAtSeed && direction === 'right' && focusPos <= anchorPos &&
            currentEnd === seedEndPos && currentStart < seedStartPos) {
            // PDFium's normalized text stream can leave the caret one or more
            // hidden/non-renderable indexes to the left even though the visible
            // selection is exactly back at the original mouse seed. Treat that
            // as seed-return only when the first renderable glyph is seedStart.
            const firstVisible = await glyphRecordAt(currentStart, +1);
            const wordWhitespaceGap = unit === 'word' && documentNormalized.slice(currentStart, seedStartPos).trim() === '';
            visuallyAtSeedFromLeft = wordWhitespaceGap || (!!firstVisible && firstVisible.globalIndex === seedStartPos);
        }
        if (!exactlyAtSeed && direction === 'left' && focusPos >= anchorPos &&
            currentStart === seedStartPos && currentEnd > seedEndPos) {
            // Symmetric case: after undoing a right-side extension,
            // PDFium can leave the caret one or more hidden/non-renderable indexes
            // to the right of the visible seed. Treat that as seed-return only
            // when the last renderable glyph is still the seed's final glyph.
            const lastVisible = await glyphRecordAt(currentEnd - 1, -1);
            const wordWhitespaceGap = unit === 'word' && documentNormalized.slice(seedEndPos, currentEnd).trim() === '';
            visuallyAtSeedFromRight = wordWhitespaceGap || (!!lastVisible && lastVisible.globalIndex === (seedEndPos - 1));
        }
        if ((exactlyAtSeed || visuallyAtSeedFromLeft) && direction === 'right' && focusPos <= anchorPos) {
            // We arrived back at the seed from a left-side extension. Continuing
            // right now means "switch to the right edge and extend outward".
            anchorPos = seedStartPos;
            focusPos = seedEndPos;
            newFocusPos = focusPos;
            horizontalSeedSwitch = {
                direction,
                mode: visuallyAtSeedFromLeft ? 'visual-seed-left-focus-to-right-edge' : 'seed-left-focus-to-right-edge',
                seedStartPos,
                seedEndPos
            };
        }
        else if ((exactlyAtSeed || visuallyAtSeedFromRight) && direction === 'left' && focusPos >= anchorPos) {
            // Symmetric case after undoing a right-side extension.
            anchorPos = seedEndPos;
            focusPos = seedStartPos;
            newFocusPos = focusPos;
            horizontalSeedSwitch = {
                direction,
                mode: visuallyAtSeedFromRight ? 'visual-seed-right-focus-to-left-edge' : 'seed-right-focus-to-left-edge',
                seedStartPos,
                seedEndPos
            };
        }
    }
    if (unit !== 'viewport') {
        viewportDirection = null;
        viewportTrail = [];
    }
    if (unit === 'select-all') {
        anchorPos = 0;
        focusPos = documentNormalized.length;
        newFocusPos = documentNormalized.length;
        targetRec = await glyphRecordAt(documentNormalized.length - 1, -1);
        documentMove = { unit: 'select-all', direction: 'right', fromFocusPos: null, toFocusPos: newFocusPos };
    }
    else if (direction === 'left') {
        if (unit === 'document-edge') {
            const fromFocusPos = focusPos;
            newFocusPos = 0;
            targetRec = await glyphRecordAt(0, +1);
            documentMove = { unit: 'document-edge', direction: 'left', fromFocusPos, toFocusPos: newFocusPos };
            // document-edge reversal can cross the complete protected
            // mouse seed in one jump. Mirror the canonical line-edge guard.
            if (requestedSelectionModel &&
                Number.isFinite(seedStartPos) && Number.isFinite(seedEndPos) &&
                seedEndPos > seedStartPos &&
                anchorPos === seedStartPos && focusPos > seedEndPos) {
                anchorPos = seedEndPos;
                horizontalSeedSwitch = {
                    direction: 'left',
                    mode: 'document-end-extension-home-cross-protected-seed',
                    seedStartPos,
                    seedEndPos,
                    fromFocusPos,
                    toFocusPos: newFocusPos
                };
            }
        }
        else if (unit === 'word') {
            const fromFocusPos = focusPos;
            newFocusPos = wordCaretTarget(focusPos, 'left');
            targetRec = newFocusPos < focusPos ? await glyphRecordAt(newFocusPos, +1) : null;
            wordMove = { unit: 'word', direction: 'left', fromFocusPos, toFocusPos: newFocusPos };
        }
        else if (unit === 'line-edge') {
            lineMove = await findCurrentLineEdgeTarget('left');
            targetRec = lineMove?.rec || null;
            if (lineMove)
                newFocusPos = lineMove.newFocusPos;
            // Shift+Home can jump across the entire protected mouse
            // seed in one command after a previous Shift+End extension. Keep the
            // seed inside the selection by moving the anchor to the opposite seed
            // edge before applying the line-start focus.
            if (requestedSelectionModel &&
                Number.isFinite(seedStartPos) && Number.isFinite(seedEndPos) &&
                seedEndPos > seedStartPos &&
                anchorPos === seedStartPos && focusPos > seedEndPos &&
                Number.isFinite(newFocusPos) && newFocusPos <= seedStartPos) {
                anchorPos = seedEndPos;
                horizontalSeedSwitch = {
                    direction: 'left',
                    mode: 'line-end-extension-home-cross-protected-seed',
                    seedStartPos,
                    seedEndPos,
                    fromFocusPos: focusPos,
                    toFocusPos: newFocusPos
                };
            }
        }
        else {
            targetRec = await glyphRecordAt(focusPos - 1, -1);
            if (targetRec)
                newFocusPos = clampCaretPos(targetRec.globalIndex);
        }
        preferredX = null;
    }
    else if (direction === 'right') {
        if (unit === 'document-edge') {
            const fromFocusPos = focusPos;
            newFocusPos = documentNormalized.length;
            targetRec = await glyphRecordAt(documentNormalized.length - 1, -1);
            documentMove = { unit: 'document-edge', direction: 'right', fromFocusPos, toFocusPos: newFocusPos };
            // Symmetric case after an extension toward document start.
            if (requestedSelectionModel &&
                Number.isFinite(seedStartPos) && Number.isFinite(seedEndPos) &&
                seedEndPos > seedStartPos &&
                anchorPos === seedEndPos && focusPos < seedStartPos) {
                anchorPos = seedStartPos;
                horizontalSeedSwitch = {
                    direction: 'right',
                    mode: 'document-start-extension-end-cross-protected-seed',
                    seedStartPos,
                    seedEndPos,
                    fromFocusPos,
                    toFocusPos: newFocusPos
                };
            }
        }
        else if (unit === 'word') {
            const fromFocusPos = focusPos;
            newFocusPos = wordCaretTarget(focusPos, 'right');
            targetRec = newFocusPos > focusPos ? await glyphRecordAt(newFocusPos - 1, -1) : null;
            wordMove = { unit: 'word', direction: 'right', fromFocusPos, toFocusPos: newFocusPos };
        }
        else if (unit === 'line-edge') {
            lineMove = await findCurrentLineEdgeTarget('right');
            targetRec = lineMove?.rec || null;
            if (lineMove)
                newFocusPos = lineMove.newFocusPos;
            // Symmetric case: Shift+End after a Shift+Home extension can
            // jump across the protected seed in one step. Switch the anchor to
            // the seed's left edge so the original mouse-selected word remains.
            if (requestedSelectionModel &&
                Number.isFinite(seedStartPos) && Number.isFinite(seedEndPos) &&
                seedEndPos > seedStartPos &&
                anchorPos === seedEndPos && focusPos < seedStartPos &&
                Number.isFinite(newFocusPos) && newFocusPos >= seedEndPos) {
                anchorPos = seedStartPos;
                horizontalSeedSwitch = {
                    direction: 'right',
                    mode: 'line-start-extension-end-cross-protected-seed',
                    seedStartPos,
                    seedEndPos,
                    fromFocusPos: focusPos,
                    toFocusPos: newFocusPos
                };
            }
        }
        else {
            targetRec = await glyphRecordAt(focusPos, +1);
            if (targetRec)
                newFocusPos = clampCaretPos(targetRec.globalIndex + 1);
        }
        preferredX = null;
    }
    else if (direction === 'up' || direction === 'down') {
        if (unit === 'viewport') {
            const oppositeDirection = direction === 'up' ? 'down' : 'up';
            const canRestoreViewportHistory = requestedSelectionModel && viewportDirection === oppositeDirection && viewportTrail.length > 0;
            if (canRestoreViewportHistory) {
                // viewport reversal must be the exact inverse of the prior
                // viewport step. Recomputing a fresh 90% target after autoscroll uses
                // a shifted viewport transform and can land near, but not exactly on,
                // the previous caret. Pop the exact prior selection-state instead.
                const snapshot = viewportTrail.pop();
                const fromFocusPos = focusPos;
                anchorPos = clampCaretPos(snapshot.anchorPos);
                newFocusPos = clampCaretPos(snapshot.focusPos);
                preferredX = Number.isFinite(snapshot.preferredX) ? snapshot.preferredX : null;
                targetRec = await glyphRecordNearHint(snapshot.selectionHint);
                if (!targetRec) {
                    targetRec = newFocusPos > anchorPos
                        ? await glyphRecordAt(newFocusPos - 1, -1)
                        : await glyphRecordAt(newFocusPos, +1);
                }
                const restoredPoint = snapshot.selectionHint || glyphTopPoint(targetRec);
                lineMove = targetRec && restoredPoint ? {
                    rec: targetRec,
                    point: { pageIndex: targetRec.pageIndex, x: Number(restoredPoint.x), y: Number(restoredPoint.y) },
                    newFocusPos,
                    candidateFocusPos: newFocusPos,
                    edgeAdjustment: 'viewport-history-exact-restore',
                    preferredX,
                    boundaryMode: 'viewport-exact-reversal',
                    activeSource: 'viewport-history',
                    currentLine: { pageIndex: null, index: null, y: null },
                    targetLine: { pageIndex: targetRec.pageIndex, y: Number(restoredPoint.y), itemCount: null, globalMin: null, globalMax: null }
                } : null;
                viewportHistoryRestore = {
                    direction,
                    previousDirection: oppositeDirection,
                    fromFocusPos,
                    restoredFocusPos: newFocusPos,
                    remainingTrail: viewportTrail.length
                };
                if (!viewportTrail.length)
                    viewportDirection = null;
            }
            else {
                // Once exact reversal has returned to the protected seed, a further
                // viewport move in the opposite direction must switch the active seed
                // edge before extending outward, just like the proven horizontal model.
                const exactlyAtSeed = Number.isFinite(seedStartPos) && Number.isFinite(seedEndPos) && seedEndPos > seedStartPos &&
                    Math.min(anchorPos, focusPos) === seedStartPos && Math.max(anchorPos, focusPos) === seedEndPos;
                if (exactlyAtSeed && viewportTrail.length === 0) {
                    if (direction === 'up' && !(anchorPos === seedEndPos && focusPos === seedStartPos)) {
                        anchorPos = seedEndPos;
                        focusPos = seedStartPos;
                    }
                    else if (direction === 'down' && !(anchorPos === seedStartPos && focusPos === seedEndPos)) {
                        anchorPos = seedStartPos;
                        focusPos = seedEndPos;
                    }
                }
                const snapshot = await makeViewportSnapshot();
                lineMove = await findViewportLineTarget(direction);
                targetRec = lineMove?.rec || null;
                if (lineMove) {
                    newFocusPos = lineMove.newFocusPos;
                    preferredX = lineMove.preferredX;
                    viewportTrail = [...viewportTrail, snapshot].slice(-32);
                    viewportDirection = direction;
                }
            }
        }
        else {
            viewportDirection = null;
            viewportTrail = [];
            lineMove = await findAdjacentLineTarget(direction);
            adjacentLineDebug = lineNavigation.getAdjacentLineDebug();
            targetRec = lineMove?.rec || null;
            if (lineMove) {
                newFocusPos = lineMove.newFocusPos;
                preferredX = lineMove.preferredX;
            }
        }
        // symmetric protected-seed return for viewport reversal.
        // The established guard below already handles PageDown->PageUp.
        // This handles PageUp->PageDown without changing ordinary Shift+Arrow.
        if (!viewportHistoryRestore && unit === 'viewport' && direction === 'down' && requestedSelectionModel &&
            Number.isFinite(seedStartPos) && Number.isFinite(seedEndPos) &&
            seedEndPos > seedStartPos &&
            anchorPos === seedEndPos && focusPos < seedStartPos &&
            Number.isFinite(newFocusPos) && newFocusPos > seedStartPos) {
            const seedEdgeRec = await glyphRecordAt(seedStartPos, +1);
            if (seedEdgeRec) {
                const originalCandidateFocusPos = newFocusPos;
                const seedPoint = glyphTopPoint(seedEdgeRec);
                newFocusPos = seedStartPos;
                targetRec = seedEdgeRec;
                lineMove = {
                    ...(lineMove || {}),
                    rec: seedEdgeRec,
                    point: seedPoint,
                    newFocusPos,
                    edgeAdjustment: 'protected-seed-left-caret'
                };
                verticalSeedReturn = {
                    direction,
                    mode: 'up-extension-down-return-to-seed-left-edge',
                    originalCandidateFocusPos,
                    snappedFocusPos: newFocusPos,
                    seedStartPos,
                    seedEndPos,
                    targetPageIndex: seedEdgeRec.pageIndex,
                    targetGlobalIndex: seedEdgeRec.globalIndex
                };
            }
        }
        // protect the original mouse-selected seed when a vertical
        // Shift+Down extension is reversed with Shift+Up. PDFium's nearest-X
        // caret on the seed line can land one glyph before the seed boundary;
        // that visually drops the mouse-selected word. If we are returning
        // from a document-forward extension and the candidate crosses back
        // into the protected seed, snap exactly to the seed's right caret.
        // Horizontal selection logic is intentionally untouched.
        if (!viewportHistoryRestore && direction === 'up' && requestedSelectionModel &&
            Number.isFinite(seedStartPos) && Number.isFinite(seedEndPos) &&
            seedEndPos > seedStartPos &&
            anchorPos === seedStartPos && focusPos > seedEndPos &&
            Number.isFinite(newFocusPos) && newFocusPos < seedEndPos) {
            const seedEdgeRec = await glyphRecordAt(seedEndPos - 1, -1);
            if (seedEdgeRec) {
                const originalCandidateFocusPos = newFocusPos;
                const seedPoint = glyphTopPoint(seedEdgeRec);
                newFocusPos = seedEndPos;
                targetRec = seedEdgeRec;
                lineMove = {
                    ...(lineMove || {}),
                    rec: seedEdgeRec,
                    point: seedPoint,
                    newFocusPos,
                    edgeAdjustment: 'protected-seed-right-caret'
                };
                verticalSeedReturn = {
                    direction,
                    mode: 'down-extension-up-return-to-seed-right-edge',
                    originalCandidateFocusPos,
                    snappedFocusPos: newFocusPos,
                    seedStartPos,
                    seedEndPos,
                    targetPageIndex: seedEdgeRec.pageIndex,
                    targetGlobalIndex: seedEdgeRec.globalIndex
                };
            }
        }
    }
    else {
        throw new Error('Ukjent keyboard-selection retning: ' + direction);
    }
    if (!targetRec || (newFocusPos === focusPos && unit !== 'select-all')) {
        ctx.keyboardTiming.movementMs = ctx.kbRound(performance.now() - movementStarted);
        const closeStarted = performance.now();
        await ctx.engine.closeDocument(ctx.doc).toPromise();
        ctx.doc = null;
        ctx.keyboardTiming.closeDocumentMs = ctx.kbRound(performance.now() - closeStarted);
        const noMoveReason = !targetRec ? 'ingen naboposisjon funnet' : 'nabolinje funnet men caret-posisjon uendret';
        deps.send({ source: 'pdfium-gate-annotator', type: 'keyboard-expand-result', requestId: ctx.requestId, ok: true, changed: false, direction, unit, selectedText: selected, chosen, reason: noMoveReason, wordMove, documentMove, lineMove: lineMove ? { activeSource: lineMove.activeSource || null, currentLine: lineMove.currentLine, targetLine: lineMove.targetLine, preferredX: lineMove.preferredX, boundaryMode: lineMove.boundaryMode || null, candidateFocusPos: lineMove.candidateFocusPos, adjustedFocusPos: lineMove.newFocusPos, edgeAdjustment: lineMove.edgeAdjustment || null, viewportHeight: lineMove.viewportHeight ?? null, stepPx: lineMove.stepPx ?? null, sourceScreenY: lineMove.sourceScreenY ?? null, targetScreenY: lineMove.targetScreenY ?? null, chosenScreenY: lineMove.chosenScreenY ?? null, screenDistance: lineMove.screenDistance ?? null } : null, adjacentLineDebug, timing: ctx.finishKeyboardTiming() });
        return;
    }
    // Horizontal reversal must be able to pass through the anchor. PDFium's
    // normalized text stream can contain hidden/non-renderable indexes between
    // visible glyphs. Therefore "focusPos === anchorPos" is too strict: the
    // visible selection may already be collapsed even while one or more hidden
    // indexes remain numerically between focus and anchor.
    //
    // Treat the selection as effectively collapsed when the candidate interval
    // contains no renderable glyph. Then step directly onto the first real glyph
    // on the opposite side of the anchor.
    const firstRenderableInRange = async (start, end) => {
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
            return null;
        const rec = await glyphRecordAt(start, +1);
        return rec && rec.globalIndex <= end ? rec : null;
    };
    let horizontalAnchorCross = null;
    if (direction === 'left' || direction === 'right') {
        const candidateStart = Math.min(anchorPos, newFocusPos);
        const candidateEnd = Math.max(anchorPos, newFocusPos) - 1;
        const candidateVisibleRec = await firstRenderableInRange(candidateStart, candidateEnd);
        const effectiveCollapse = candidateEnd < candidateStart || !candidateVisibleRec;
        if (effectiveCollapse) {
            const crossRec = direction === 'right'
                ? await glyphRecordAt(anchorPos, +1)
                : await glyphRecordAt(anchorPos - 1, -1);
            if (crossRec) {
                targetRec = crossRec;
                newFocusPos = direction === 'right'
                    ? clampCaretPos(crossRec.globalIndex + 1)
                    : clampCaretPos(crossRec.globalIndex);
                horizontalAnchorCross = {
                    direction,
                    reason: 'no-renderable-glyph-between-focus-and-anchor',
                    anchorPos,
                    candidateStart,
                    candidateEnd,
                    crossedToFocusPos: newFocusPos,
                    targetPageIndex: crossRec.pageIndex,
                    targetGlobalIndex: crossRec.globalIndex
                };
            }
        }
    }
    ctx.keyboardTiming.movementMs = ctx.kbRound(performance.now() - movementStarted);
    const newStart = Math.min(anchorPos, newFocusPos);
    const newEnd = Math.max(anchorPos, newFocusPos) - 1;
    if (newEnd < newStart) {
        const closeStarted = performance.now();
        await ctx.engine.closeDocument(ctx.doc).toPromise();
        ctx.doc = null;
        ctx.keyboardTiming.closeDocumentMs = ctx.kbRound(performance.now() - closeStarted);
        deps.send({ source: 'pdfium-gate-annotator', type: 'keyboard-expand-result', requestId: ctx.requestId, ok: true, changed: false, direction, unit, selectedText: selected, chosen, reason: 'selection kollapset til caret uten kryssbar naboglyph', wordMove, documentMove, horizontalAnchorCross, timing: ctx.finishKeyboardTiming() });
        return;
    }
    const overlayGeometryStarted = performance.now();
    let artifactExcludedRawCount = 0;
    const expectedChars = [];
    for (let i = newStart; i <= newEnd; i += 1) {
        const m = globalMap[i];
        if (m && Number.isFinite(Number(m.rawIndex))) {
            const excluded = await getArtifactRawIndexes(m.pageIndex);
            if (excluded instanceof Set && excluded.has(Number(m.rawIndex))) {
                artifactExcludedRawCount += 1;
                continue;
            }
        }
        expectedChars.push(documentNormalized[i] || '');
    }
    const expectedText = deps.normalizeSearchText(expectedChars.join(''));
    const pageRawRanges = new Map();
    for (let i = newStart; i <= newEnd; i += 1) {
        const m = globalMap[i];
        if (!m || !Number.isFinite(Number(m.rawIndex)))
            continue;
        const pg = Number(m.pageIndex), ri = Number(m.rawIndex);
        const r = pageRawRanges.get(pg) || { min: ri, max: ri };
        r.min = Math.min(r.min, ri);
        r.max = Math.max(r.max, ri);
        pageRawRanges.set(pg, r);
    }
    const hits = [];
    for (const [pageIndex, rr] of pageRawRanges.entries()) {
        const glyphs = await getGlyphs(pageIndex);
        const excluded = await getArtifactRawIndexes(pageIndex);
        hits.push(deps.glyphRectsForRawRange(glyphs, rr.min, rr.max, pageIndex, excluded, textModel.pageMaps?.[pageIndex]?.extractedText || null));
    }
    const merged = deps.dedupeAndMergeRects(hits).mergedRects.map(r => ({
        ...r,
        pageHeight: Number(ctx.doc.pages[r.pageIndex]?.size?.height) || 842
    }));
    // selectionHint is the physical active-focus identity used by the next
    // vertical move. After Shift+Up/Down it must follow the target glyph/line,
    // especially across page boundaries. Reusing the previous occurrence hint
    // leaves the next keypress anchored to the old page and can degrade into
    // apparent one-character horizontal movement.
    const verticalFocusHint = lineMove?.point && targetRec
        ? { pageIndex: targetRec.pageIndex, x: Number(lineMove.point.x), y: Number(lineMove.point.y) }
        : null;
    // document-edge moves can jump many pages in one command. The
    // previous generic hint still pointed near the original mouse seed, so
    // the existing keyboard-autoscroll correctly saw nothing to scroll.
    // Reuse the proven physical-glyph hint model and point it at the actual
    // document-edge target glyph. Selection/range semantics are unchanged.
    const documentFocusPoint = documentMove && targetRec ? glyphTopPoint(targetRec) : null;
    const documentFocusHint = documentFocusPoint
        ? { pageIndex: targetRec.pageIndex, x: Number(documentFocusPoint.x), y: Number(documentFocusPoint.y) }
        : null;
    const nearestHint = verticalFocusHint || documentFocusHint ||
        (chosen.hintNearest ? { pageIndex: chosen.hintNearest.pageIndex, x: chosen.hintNearest.x, y: chosen.hintNearest.y } : selectionHint);
    ctx.keyboardTiming.overlayGeometryMs = ctx.kbRound(performance.now() - overlayGeometryStarted);
    const closeStarted = performance.now();
    await ctx.engine.closeDocument(ctx.doc).toPromise();
    ctx.doc = null;
    ctx.keyboardTiming.closeDocumentMs = ctx.kbRound(performance.now() - closeStarted);
    deps.send({ source: 'pdfium-gate-annotator', type: 'keyboard-expand-result', requestId: ctx.requestId, ok: true, changed: true, direction, unit,
        selectedText: selected, expectedText, chosen: { start: chosen.start, end: chosen.end, pages: chosen.pages, distance: chosen.distance, rangeHintMatch: !!chosen.rangeHintMatch, gestureScore: chosen.gestureScore ?? null, gestureOrientation: chosen.gestureOrientation ?? null, hintScore: chosen.hintScore ?? null },
        range: { start: newStart, end: newEnd }, rects: merged, selectionHint: nearestHint, includeHeaderFooterText, artifactExcludedRawCount,
        selectionModel: {
            anchorPos,
            focusPos: newFocusPos,
            preferredX: Number.isFinite(preferredX) ? preferredX : null,
            seedStartPos: Number.isFinite(seedStartPos) ? seedStartPos : null,
            seedEndPos: Number.isFinite(seedEndPos) ? seedEndPos : null,
            viewportDirection: unit === 'viewport' && ['up', 'down'].includes(viewportDirection) ? viewportDirection : null,
            viewportTrail: unit === 'viewport' ? viewportTrail.slice(-32) : []
        },
        lineMove: lineMove ? { activeSource: lineMove.activeSource || null, currentLine: lineMove.currentLine, targetLine: lineMove.targetLine, preferredX: lineMove.preferredX, boundaryMode: lineMove.boundaryMode || null, candidateFocusPos: lineMove.candidateFocusPos, adjustedFocusPos: lineMove.newFocusPos, edgeAdjustment: lineMove.edgeAdjustment || null, viewportHeight: lineMove.viewportHeight ?? null, stepPx: lineMove.stepPx ?? null, sourceScreenY: lineMove.sourceScreenY ?? null, targetScreenY: lineMove.targetScreenY ?? null, chosenScreenY: lineMove.chosenScreenY ?? null, screenDistance: lineMove.screenDistance ?? null } : null,
        adjacentLineDebug,
        target: { pageIndex: targetRec.pageIndex, rawIndex: targetRec.rawIndex, globalIndex: targetRec.globalIndex }, wordMove, documentMove, horizontalSeedSwitch, horizontalAnchorCross, verticalSeedReturn, viewportHistoryRestore, occurrenceCount: occurrences.length, timing: ctx.finishKeyboardTiming() });
    return;
}

module.exports = { handleKeyboardExpandSelection };
