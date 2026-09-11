'use strict';

// Physical line/page navigation for Shift+Up/Down and Shift+Home/End.
// Owns geometric line grouping and page-boundary reading-flow decisions only.
function createKeyboardLineNavigation(options) {
  const {
    pageMaps, globalMap, getArtifactRawIndexes, glyphRecordExact, glyphTopPoint,
    glyphRecordAt, requestedSelectionModel, selectionHint, includeHeaderFooterText,
    clampCaretPos, getSelectionState
  } = options;
  if (typeof getSelectionState !== 'function') throw new Error('keyboard line-navigation state provider missing');
  let anchorPos = 0, focusPos = 0, preferredX = null;
  const syncSelectionState = () => {
    const state = getSelectionState() || {};
    anchorPos = clampCaretPos(state.anchorPos);
    focusPos = clampCaretPos(state.focusPos);
    preferredX = Number.isFinite(Number(state.preferredX)) ? Number(state.preferredX) : null;
  };

    const pageLineCache = new Map();
    const getPageLines = async (pageIndex) => {
        if (pageLineCache.has(pageIndex))
            return pageLineCache.get(pageIndex);
        const items = [];
        const seenRaw = new Set();
        const excluded = await getArtifactRawIndexes(pageIndex);
        const pm = pageMaps[pageIndex];
        if (pm) {
            for (let i = Math.max(0, pm.startIndex); i <= Math.min(globalMap.length - 1, pm.endIndex); i += 1) {
                const map = globalMap[i];
                if (!map || map.pageIndex !== pageIndex)
                    continue;
                if (excluded instanceof Set && excluded.has(Number(map.rawIndex)))
                    continue;
                const rawKey = String(map.rawIndex);
                if (seenRaw.has(rawKey))
                    continue;
                const rec = await glyphRecordExact(i);
                if (!rec)
                    continue;
                seenRaw.add(rawKey);
                const p = glyphTopPoint(rec);
                if (!p)
                    continue;
                items.push({ rec, p });
            }
        }
        items.sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x || a.rec.globalIndex - b.rec.globalIndex);
        const lines = [];
        for (const item of items) {
            const tol = Math.max(2.0, Math.min(7.5, Number(item.rec.height || 8) * 0.55));
            let line = lines[lines.length - 1] || null;
            if (!line || Math.abs(item.p.y - line.y) > Math.max(tol, line.tolerance)) {
                line = { pageIndex, y: item.p.y, tolerance: tol, items: [item] };
                lines.push(line);
            }
            else {
                line.items.push(item);
                line.y = line.items.reduce((sum, x) => sum + x.p.y, 0) / line.items.length;
                line.tolerance = Math.max(line.tolerance, tol);
            }
        }
        for (const line of lines)
            line.items.sort((a, b) => a.p.x - b.p.x || a.rec.globalIndex - b.rec.globalIndex);
        pageLineCache.set(pageIndex, lines);
        return lines;
    };
    const activeGlyphRecord = async () => {
            syncSelectionState();
        if (focusPos > anchorPos)
            return await glyphRecordAt(focusPos - 1, -1);
        return await glyphRecordAt(focusPos, +1);
    };
    const hintedActiveGlyphRecord = async () => {
        // At a normalized page boundary one caret offset can represent both the
        // end of page N and the start of page N+1.  For an existing custom
        // selection we already have an exact physical focus hint from the
        // previous move.  Use that to retain page/line identity instead of
        // guessing solely from focusPos.
        if (!requestedSelectionModel || !selectionHint || !Number.isFinite(selectionHint.pageIndex))
            return null;
        const hintLines = await getPageLines(selectionHint.pageIndex);
        let best = null;
        for (const line of hintLines) {
            for (const item of line.items || []) {
                const dx = Number(item.p.x) - Number(selectionHint.x);
                const dy = Number(item.p.y) - Number(selectionHint.y);
                const d = Math.hypot(dx, dy);
                if (!best || d < best.d || (d === best.d && item.rec.globalIndex < best.rec.globalIndex)) {
                    best = { rec: item.rec, d };
                }
            }
        }
        return best ? best.rec : null;
    };
    const glyphRecordNearHint = async (hint) => {
        if (!hint || !Number.isFinite(Number(hint.pageIndex)))
            return null;
        const hintLines = await getPageLines(Number(hint.pageIndex));
        let best = null;
        for (const line of hintLines) {
            for (const item of line.items || []) {
                const dx = Number(item.p.x) - Number(hint.x);
                const dy = Number(item.p.y) - Number(hint.y);
                const d = Math.hypot(dx, dy);
                if (!best || d < best.d || (d === best.d && item.rec.globalIndex < best.rec.globalIndex)) {
                    best = { rec: item.rec, d };
                }
            }
        }
        return best ? best.rec : null;
    };
    const makeViewportSnapshot = async () => {
            syncSelectionState();
        const hintedRec = await hintedActiveGlyphRecord();
        const rec = hintedRec || await activeGlyphRecord();
        const p = glyphTopPoint(rec);
        return {
            anchorPos: clampCaretPos(anchorPos),
            focusPos: clampCaretPos(focusPos),
            preferredX: Number.isFinite(preferredX) ? preferredX : null,
            selectionHint: p ? { pageIndex: rec.pageIndex, x: Number(p.x), y: Number(p.y) } : null
        };
    };
    // Shift+Home/End are physical-line focus primitives. Reuse
    // the same page-line grouping and physical selectionHint that already
    // drive vertical keyboard movement, then hand the resulting caret back
    // to the existing anchor/focus/seed/overlay machinery.
    const findCurrentLineEdgeTarget = async (horizontalDirection) => {
        const hintedRec = await hintedActiveGlyphRecord();
        const refRec = hintedRec || await activeGlyphRecord();
        const activeSource = hintedRec ? 'selection-hint' : 'focus-pos';
        const ref = glyphTopPoint(refRec);
        if (!refRec || !ref)
            return null;
        const lines = await getPageLines(refRec.pageIndex);
        if (!lines.length)
            return null;
        let lineIndex = lines.findIndex(line => (line.items || []).some(it => it.rec.globalIndex === refRec.globalIndex));
        if (lineIndex < 0) {
            let best = { idx: -1, d: Number.POSITIVE_INFINITY };
            lines.forEach((line, idx) => {
                const d = Math.abs(Number(line.y) - Number(ref.y));
                if (d < best.d)
                    best = { idx, d };
            });
            lineIndex = best.idx;
        }
        if (lineIndex < 0)
            return null;
        const line = lines[lineIndex];
        const items = line?.items || [];
        if (!items.length)
            return null;
        const item = horizontalDirection === 'left' ? items[0] : items[items.length - 1];
        const newFocusPos = horizontalDirection === 'left'
            ? clampCaretPos(item.rec.globalIndex)
            : clampCaretPos(item.rec.globalIndex + 1);
        return {
            rec: item.rec,
            point: item.p,
            newFocusPos,
            candidateFocusPos: newFocusPos,
            edgeAdjustment: horizontalDirection === 'left' ? 'physical-line-start-caret' : 'physical-line-end-caret',
            preferredX: null,
            boundaryMode: horizontalDirection === 'left' ? 'current-physical-line-start' : 'current-physical-line-end',
            activeSource,
            currentLine: { pageIndex: refRec.pageIndex, index: lineIndex, y: line.y },
            targetLine: { pageIndex: line.pageIndex, y: line.y, itemCount: items.length, globalMin: items[0]?.rec?.globalIndex ?? null, globalMax: items[items.length - 1]?.rec?.globalIndex ?? null }
        };
    };
    let adjacentLineDebug = null;
    const findAdjacentLineTarget = async (verticalDirection) => {
            syncSelectionState();
        adjacentLineDebug = {
            direction: verticalDirection,
            includeHeaderFooterText,
            anchorPos,
            focusPos,
            preferredX: Number.isFinite(preferredX) ? preferredX : null,
            selectionHint: selectionHint || null,
            stage: 'start',
            current: null,
            boundaryPages: [],
            boundaryFlows: [],
            target: null,
            ranked: [],
            failure: null
        };
        const hintedRec = await hintedActiveGlyphRecord();
        const refRec = hintedRec || await activeGlyphRecord();
        const activeSource = hintedRec ? 'selection-hint' : 'focus-pos';
        const ref = glyphTopPoint(refRec);
        if (!refRec || !ref) {
            adjacentLineDebug.stage = 'no-active-glyph';
            adjacentLineDebug.failure = 'active glyph/point mangler';
            return null;
        }
        adjacentLineDebug.activeSource = activeSource;
        adjacentLineDebug.refRec = { pageIndex: refRec.pageIndex, globalIndex: refRec.globalIndex, rawIndex: refRec.rawIndex, x: ref.x, y: ref.y, width: ref.width, height: ref.height };
        let px = Number.isFinite(preferredX) ? preferredX : ref.x;
        let pageIndex = refRec.pageIndex;
        let lines = await getPageLines(pageIndex);
        let lineIndex = lines.findIndex(line => line.items.some(it => it.rec.globalIndex === refRec.globalIndex));
        if (lineIndex < 0 && lines.length) {
            let best = { idx: -1, d: Number.POSITIVE_INFINITY };
            lines.forEach((line, idx) => { const d = Math.abs(line.y - ref.y); if (d < best.d)
                best = { idx, d }; });
            lineIndex = best.idx;
        }
        const summarizeLine = (line, idx = null) => {
            const is = (line?.items || []).map(it => Number(it?.rec?.globalIndex)).filter(Number.isFinite);
            return {
                index: idx, pageIndex: line?.pageIndex ?? null, y: Number(line?.y), itemCount: (line?.items || []).length,
                globalMin: is.length ? Math.min(...is) : null, globalMax: is.length ? Math.max(...is) : null
            };
        };
        const currentExcluded = await getArtifactRawIndexes(pageIndex);
        adjacentLineDebug.current = {
            pageIndex, lineIndex, lineCount: lines.length, artifactRawCount: currentExcluded instanceof Set ? currentExcluded.size : null,
            lines: lines.map((line, idx) => summarizeLine(line, idx)).slice(Math.max(0, lineIndex - 4), Math.max(0, lineIndex - 4) + 9)
        };
        adjacentLineDebug.stage = 'current-line-resolved';
        let targetLine = null;
        let boundaryMode = null;
        const lineBounds = line => {
            const indexes = (line?.items || []).map(it => Number(it?.rec?.globalIndex)).filter(Number.isFinite);
            return indexes.length ? { min: Math.min(...indexes), max: Math.max(...indexes) } : { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
        };
        const buildPageReadingFlow = candidateLines => {
            const usable = (candidateLines || []).filter(line => line?.items?.length);
            if (!usable.length)
                return { line: null, visual: [], runs: [], selectedRun: null };
            // Page-reading-flow contract:
            // getPageLines() is geometric (bottom -> top), while PDFium's text
            // stream can place headers/footers/page numbers outside that physical
            // order.  A contiguous keyboard selection cannot safely follow an
            // isolated line whose global text indexes reverse the surrounding
            // body-text flow.  Build the dominant contiguous top -> bottom run in
            // which global text order is strictly increasing.  This is structural,
            // not a semantic header/footer heuristic.
            const visual = [...usable].sort((a, b) => Number(b?.y) - Number(a?.y));
            const runs = [];
            let run = [];
            for (const line of visual) {
                if (!run.length) {
                    run = [line];
                    continue;
                }
                const prev = lineBounds(run[run.length - 1]);
                const cur = lineBounds(line);
                const monotonic = Number.isFinite(prev.max) && Number.isFinite(cur.min) && cur.min > prev.max;
                if (monotonic)
                    run.push(line);
                else {
                    runs.push(run);
                    run = [line];
                }
            }
            if (run.length)
                runs.push(run);
            const scored = runs.map((lines, index) => ({
                index,
                lines,
                lineCount: lines.length,
                itemCount: lines.reduce((sum, line) => sum + (line?.items || []).length, 0),
                topY: Number(lines[0]?.y),
                bottomY: Number(lines[lines.length - 1]?.y)
            })).sort((a, b) => b.lineCount - a.lineCount ||
                b.itemCount - a.itemCount ||
                Number(b.topY) - Number(a.topY) ||
                a.index - b.index);
            return { visual, runs, selectedRun: scored[0] || null };
        };
        const pickPageReadingBoundaryLine = (candidateLines, edge) => {
            const flow = buildPageReadingFlow(candidateLines);
            const selected = flow.selectedRun;
            if (!selected?.lines?.length)
                return { line: null, flow };
            const ordered = edge === 'start' ? selected.lines : [...selected.lines].reverse();
            const line = ordered.find(candidate => {
                const items = candidate?.items || [];
                if (verticalDirection === 'down') {
                    return items.some(it => clampCaretPos(Number(it?.rec?.globalIndex) + 1) > focusPos);
                }
                return items.some(it => clampCaretPos(Number(it?.rec?.globalIndex)) < focusPos);
            }) || null;
            return { line, flow };
        };
        // Within one page we keep geometry-based line ordering.  At a page
        // The boundary uses the dominant monotonic physical reading-flow,
        // rather than the numerically first/last PDFium text item.  This avoids
        // a page-number/footer becoming the target on every following page.
        const returningTowardAnchor = !!requestedSelectionModel &&
            ((verticalDirection === 'down' && focusPos < anchorPos) ||
                (verticalDirection === 'up' && focusPos > anchorPos));
        const anchorBoundaryLineForPage = async (pg, ls) => {
            if (!returningTowardAnchor || !Array.isArray(ls) || !ls.length)
                return null;
            // The anchor is a caret, so choose the visible glyph immediately on
            // the side that represents the original anchor line.
            const anchorRec = verticalDirection === 'down'
                ? await glyphRecordAt(anchorPos, +1)
                : await glyphRecordAt(anchorPos - 1, -1);
            if (!anchorRec || anchorRec.pageIndex !== pg)
                return null;
            const idx = ls.findIndex(line => (line.items || []).some(it => it.rec.globalIndex === anchorRec.globalIndex));
            if (idx < 0)
                return null;
            // getPageLines() is ordered by PDF Y ascending:
            //   index 0            = visual bottom
            //   index length - 1   = visual top
            //
            // Only use the anchor override when the anchor line is actually near
            // the page edge we are crossing. This prevents a reversal from
            // jumping to an anchor that is far inside the page.
            const edgeDistance = verticalDirection === 'down'
                ? (ls.length - 1 - idx) // top edge of next page
                : idx; // bottom edge of previous page
            if (edgeDistance > 2)
                return null;
            return { line: ls[idx], edgeDistance, anchorPageIndex: pg, anchorGlobalIndex: anchorRec.globalIndex };
        };
        const lineHasDirectionalCaret = line => {
            const items = line?.items || [];
            if (verticalDirection === 'down') {
                return items.some(it => clampCaretPos(Number(it?.rec?.globalIndex) + 1) > focusPos);
            }
            return items.some(it => clampCaretPos(Number(it?.rec?.globalIndex)) < focusPos);
        };
        if (verticalDirection === 'up') {
            if (lineIndex >= 0 && lineIndex < lines.length - 1) {
                // physical page-edge lines (notably header/footer/page-number
                // text) are not guaranteed to be monotonic in PDF text order, even
                // when header/footer inclusion is enabled. Vertical keyboard
                // navigation must never stop on a line whose carets all move in the
                // opposite textual direction; scan onward and, if necessary, cross
                // the page boundary.
                for (let idx = lineIndex + 1; idx < lines.length && !targetLine; idx++) {
                    if (lineHasDirectionalCaret(lines[idx])) {
                        targetLine = lines[idx];
                        if (idx !== lineIndex + 1)
                            boundaryMode = 'same-page-skip-nonmonotonic-up';
                    }
                }
            }
            if (!targetLine) {
                for (let pg = pageIndex - 1; pg >= 0 && !targetLine; pg--) {
                    const ls = await getPageLines(pg);
                    const excludedPg = await getArtifactRawIndexes(pg);
                    adjacentLineDebug.boundaryPages.push({ pageIndex: pg, lineCount: ls.length, artifactRawCount: excludedPg instanceof Set ? excludedPg.size : null, lines: ls.slice(0, 6).map((line, idx) => summarizeLine(line, idx)) });
                    if (!ls.length)
                        continue;
                    const anchorBoundary = await anchorBoundaryLineForPage(pg, ls);
                    if (anchorBoundary) {
                        targetLine = anchorBoundary.line;
                        boundaryMode = 'previous-page-return-anchor-bottom';
                    }
                    else {
                        const boundaryPick = pickPageReadingBoundaryLine(ls, 'end');
                        targetLine = boundaryPick.line;
                        adjacentLineDebug.boundaryFlows.push({
                            pageIndex: pg,
                            edge: 'end',
                            selectedRun: boundaryPick.flow?.selectedRun ? {
                                lineCount: boundaryPick.flow.selectedRun.lineCount,
                                itemCount: boundaryPick.flow.selectedRun.itemCount,
                                topY: boundaryPick.flow.selectedRun.topY,
                                bottomY: boundaryPick.flow.selectedRun.bottomY,
                                lines: boundaryPick.flow.selectedRun.lines.map((line, idx) => summarizeLine(line, idx))
                            } : null,
                            runCount: Array.isArray(boundaryPick.flow?.runs) ? boundaryPick.flow.runs.length : 0
                        });
                        if (targetLine)
                            boundaryMode = 'previous-page-reading-flow-end';
                    }
                }
            }
        }
        else {
            if (lineIndex > 0) {
                // same monotonicity rule as upward movement. A physical
                // footer/page-number line may appear earlier in the PDF text stream
                // than body text, so it cannot be the next caret when extending
                // forward. Skip such lines instead of failing before the page break.
                for (let idx = lineIndex - 1; idx >= 0 && !targetLine; idx--) {
                    if (lineHasDirectionalCaret(lines[idx])) {
                        targetLine = lines[idx];
                        if (idx !== lineIndex - 1)
                            boundaryMode = 'same-page-skip-nonmonotonic-down';
                    }
                }
            }
            if (!targetLine) {
                for (let pg = pageIndex + 1; pg < pageMaps.length && !targetLine; pg++) {
                    const ls = await getPageLines(pg);
                    const excludedPg = await getArtifactRawIndexes(pg);
                    adjacentLineDebug.boundaryPages.push({ pageIndex: pg, lineCount: ls.length, artifactRawCount: excludedPg instanceof Set ? excludedPg.size : null, lines: ls.slice(0, 6).map((line, idx) => summarizeLine(line, idx)) });
                    if (!ls.length)
                        continue;
                    const anchorBoundary = await anchorBoundaryLineForPage(pg, ls);
                    if (anchorBoundary) {
                        targetLine = anchorBoundary.line;
                        boundaryMode = 'next-page-return-anchor-top';
                    }
                    else {
                        const boundaryPick = pickPageReadingBoundaryLine(ls, 'start');
                        targetLine = boundaryPick.line;
                        adjacentLineDebug.boundaryFlows.push({
                            pageIndex: pg,
                            edge: 'start',
                            selectedRun: boundaryPick.flow?.selectedRun ? {
                                lineCount: boundaryPick.flow.selectedRun.lineCount,
                                itemCount: boundaryPick.flow.selectedRun.itemCount,
                                topY: boundaryPick.flow.selectedRun.topY,
                                bottomY: boundaryPick.flow.selectedRun.bottomY,
                                lines: boundaryPick.flow.selectedRun.lines.map((line, idx) => summarizeLine(line, idx))
                            } : null,
                            runCount: Array.isArray(boundaryPick.flow?.runs) ? boundaryPick.flow.runs.length : 0
                        });
                        if (targetLine)
                            boundaryMode = 'next-page-reading-flow-start';
                    }
                }
            }
        }
        if (!targetLine || !targetLine.items.length) {
            adjacentLineDebug.stage = 'no-target-line';
            adjacentLineDebug.failure = 'ingen fysisk targetLine etter Artifact-filter/boundary-søk';
            return null;
        }
        adjacentLineDebug.target = summarizeLine(targetLine, null);
        adjacentLineDebug.boundaryMode = boundaryMode;
        adjacentLineDebug.stage = 'target-line-resolved';
        const tb = lineBounds(targetLine);
        const ranked = [...targetLine.items].map(it => ({
            ...it,
            before: clampCaretPos(it.rec.globalIndex),
            after: clampCaretPos(it.rec.globalIndex + 1),
            natural: clampCaretPos(it.rec.globalIndex + (px >= it.p.x ? 1 : 0)),
            xDistance: Math.abs(it.p.x - px)
        })).sort((a, b) => a.xDistance - b.xDistance || a.rec.globalIndex - b.rec.globalIndex);
        // At visual/page boundaries PDFium normalization can make the caret at the
        // end of one line identical to the caret at the start of the next. Do not
        // repair that with focusPos +/- 1: that produces the observed one-character
        // crawl. Instead choose a real glyph on the target line whose caret is
        // monotonic in the requested document direction, preserving preferred X.
        adjacentLineDebug.ranked = ranked.slice(0, 16).map(r => ({
            pageIndex: r.rec.pageIndex, globalIndex: r.rec.globalIndex, rawIndex: r.rec.rawIndex,
            x: Number(r.p.x), y: Number(r.p.y), before: r.before, after: r.after, natural: r.natural, xDistance: r.xDistance
        }));
        let chosenRanked = null;
        let candidateFocusPos = null;
        let edgeAdjustment = null;
        if (verticalDirection === 'down') {
            chosenRanked = ranked.find(r => r.natural > focusPos) || null;
            if (chosenRanked)
                candidateFocusPos = chosenRanked.natural;
            if (!chosenRanked) {
                chosenRanked = ranked.find(r => r.after > focusPos) || null;
                if (chosenRanked) {
                    candidateFocusPos = chosenRanked.after;
                    edgeAdjustment = 'target-glyph-after';
                }
            }
        }
        else {
            chosenRanked = ranked.find(r => r.natural < focusPos) || null;
            if (chosenRanked)
                candidateFocusPos = chosenRanked.natural;
            if (!chosenRanked) {
                chosenRanked = ranked.find(r => r.before < focusPos) || null;
                if (chosenRanked) {
                    candidateFocusPos = chosenRanked.before;
                    edgeAdjustment = 'target-glyph-before';
                }
            }
        }
        if (!chosenRanked) {
            adjacentLineDebug.stage = 'no-monotonic-caret';
            adjacentLineDebug.failure = 'targetLine finnes, men ingen caret er monotonic i ønsket retning';
            return null;
        }
        adjacentLineDebug.stage = 'success';
        adjacentLineDebug.chosen = { globalIndex: chosenRanked.rec.globalIndex, rawIndex: chosenRanked.rec.rawIndex, before: chosenRanked.before, after: chosenRanked.after, natural: chosenRanked.natural, candidateFocusPos, edgeAdjustment };
        const item = chosenRanked;
        const newFocusPos = clampCaretPos(candidateFocusPos);
        return { rec: item.rec, point: item.p, newFocusPos, candidateFocusPos, edgeAdjustment, preferredX: px, boundaryMode, activeSource, currentLine: { pageIndex: refRec.pageIndex, index: lineIndex, y: lineIndex >= 0 ? lines[lineIndex]?.y : null }, targetLine: { pageIndex: targetLine.pageIndex, y: targetLine.y, itemCount: targetLine.items.length, globalMin: Number.isFinite(tb.min) ? tb.min : null, globalMax: Number.isFinite(tb.max) ? tb.max : null } };
    };

  return Object.freeze({
    getPageLines,
    activeGlyphRecord,
    hintedActiveGlyphRecord,
    glyphRecordNearHint,
    makeViewportSnapshot,
    findCurrentLineEdgeTarget,
    findAdjacentLineTarget,
    getAdjacentLineDebug: () => adjacentLineDebug
  });
}

module.exports = { createKeyboardLineNavigation };
