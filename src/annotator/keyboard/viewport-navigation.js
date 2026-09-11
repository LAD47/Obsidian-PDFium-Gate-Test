'use strict';

// PageUp/PageDown viewport-distance navigation. Consumes line-navigation ports
// and Chromium viewer transforms, and returns a normal caret target.
function createKeyboardViewportNavigation(options) {
  const {
    keyboardViewerState, glyphTopPoint, clampCaretPos, getSelectionState,
    getPageLines, activeGlyphRecord, hintedActiveGlyphRecord
  } = options;
  if (typeof getSelectionState !== 'function') throw new Error('keyboard viewport-navigation state provider missing');
  let anchorPos = 0, focusPos = 0, preferredX = null;
  const syncSelectionState = () => {
    const state = getSelectionState() || {};
    anchorPos = clampCaretPos(state.anchorPos);
    focusPos = clampCaretPos(state.focusPos);
    preferredX = Number.isFinite(Number(state.preferredX)) ? Number(state.preferredX) : null;
  };

    // PageUp/PageDown keep the canonical viewport movement, with caret-edge
    // precision at preferred X. Chromium supplies the current scroller height plus an affine
    // page->scroller transform for each laid-out page. We use that only to
    // choose a physical target line roughly one visible viewport away, then
    // return a normal focusPos/selectionHint to the existing selection engine.
    const findViewportLineTarget = async (verticalDirection) => {
            syncSelectionState();
        const hintedRec = await hintedActiveGlyphRecord();
        const refRec = hintedRec || await activeGlyphRecord();
        const activeSource = hintedRec ? 'selection-hint' : 'focus-pos';
        const ref = glyphTopPoint(refRec);
        if (!refRec || !ref)
            return null;
        const transforms = Array.isArray(keyboardViewerState?.pageTransforms) ? keyboardViewerState.pageTransforms : [];
        const transformByPage = new Map();
        for (const t of transforms) {
            const pg = Number(t?.pageIndex);
            if (Number.isFinite(pg))
                transformByPage.set(pg, t);
        }
        const pagePointToScroller = (pageIndex, point) => {
            const t = transformByPage.get(Number(pageIndex));
            const p0 = t?.p0, p1 = t?.px, p2 = t?.py;
            if (!p0 || !p1 || !p2)
                return null;
            const nums = [p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, point?.x, point?.y].map(Number);
            if (!nums.every(Number.isFinite))
                return null;
            const ex = { x: Number(p1.x) - Number(p0.x), y: Number(p1.y) - Number(p0.y) };
            const ey = { x: Number(p2.x) - Number(p0.x), y: Number(p2.y) - Number(p0.y) };
            return {
                x: Number(p0.x) + Number(point.x) * ex.x + Number(point.y) * ey.x,
                y: Number(p0.y) + Number(point.x) * ex.y + Number(point.y) * ey.y
            };
        };
        const refScreen = pagePointToScroller(refRec.pageIndex, ref);
        const viewportHeight = Number(keyboardViewerState?.viewportHeight || keyboardViewerState?.scrollerRect?.height || 0);
        if (!refScreen || !Number.isFinite(viewportHeight) || viewportHeight < 80)
            return null;
        const stepPx = Math.max(80, viewportHeight * 0.90);
        const targetY = Number(refScreen.y) + (verticalDirection === 'down' ? stepPx : -stepPx);
        // preferred X is a caret coordinate, not a glyph-center coordinate.
        // For the first viewport move derive it from the physically active caret
        // edge: after the glyph when focus is to the right of anchor, before it
        // when focus is to the left. Subsequent viewport moves retain preferredX.
        const activeCaretX = focusPos > anchorPos
            ? Number(ref.x) + Number(ref.width || 0) * 0.5
            : Number(ref.x) - Number(ref.width || 0) * 0.5;
        const px = Number.isFinite(preferredX) ? preferredX : activeCaretX;
        const distanceToRect = (y, rect) => {
            const top = Number(rect?.y), height = Number(rect?.height);
            if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0)
                return Number.POSITIVE_INFINITY;
            const bottom = top + height;
            if (y < top)
                return top - y;
            if (y > bottom)
                return y - bottom;
            return 0;
        };
        const pageCandidates = transforms
            .filter(t => {
            const pg = Number(t?.pageIndex);
            return Number.isFinite(pg) && (verticalDirection === 'down' ? pg >= refRec.pageIndex : pg <= refRec.pageIndex);
        })
            .map(t => ({ t, d: distanceToRect(targetY, t?.rect) }))
            .sort((a, b) => a.d - b.d || (verticalDirection === 'down' ? Number(a.t.pageIndex) - Number(b.t.pageIndex) : Number(b.t.pageIndex) - Number(a.t.pageIndex)))
            .slice(0, 6);
        let best = null;
        for (const pageCandidate of pageCandidates) {
            const pageIndex = Number(pageCandidate.t.pageIndex);
            const lines = await getPageLines(pageIndex);
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
                const line = lines[lineIndex];
                // rank actual caret boundaries on the target line.
                // Ranking glyph centers and then guessing before/after would
                // can land one character away from the requested visual column.
                const ranked = [...(line?.items || [])].flatMap(it => {
                    const before = clampCaretPos(it.rec.globalIndex);
                    const after = clampCaretPos(it.rec.globalIndex + 1);
                    const halfWidth = Number(it.p.width || 0) * 0.5;
                    const beforeX = Number(it.p.x) - halfWidth;
                    const afterX = Number(it.p.x) + halfWidth;
                    return [
                        { ...it, caretSide: 'before', caretPos: before, caretX: beforeX, xDistance: Math.abs(beforeX - Number(px)) },
                        { ...it, caretSide: 'after', caretPos: after, caretX: afterX, xDistance: Math.abs(afterX - Number(px)) }
                    ];
                }).sort((a, b) => a.xDistance - b.xDistance || a.caretPos - b.caretPos || a.rec.globalIndex - b.rec.globalIndex);
                let chosenRanked = null;
                let candidateFocusPos = null;
                let edgeAdjustment = null;
                if (verticalDirection === 'down') {
                    chosenRanked = ranked.find(r => r.caretPos > focusPos) || null;
                }
                else {
                    chosenRanked = ranked.find(r => r.caretPos < focusPos) || null;
                }
                if (chosenRanked) {
                    candidateFocusPos = chosenRanked.caretPos;
                    edgeAdjustment = chosenRanked.caretSide === 'after' ? 'target-caret-after' : 'target-caret-before';
                }
                if (!chosenRanked || !Number.isFinite(candidateFocusPos))
                    continue;
                const screenPoint = pagePointToScroller(pageIndex, chosenRanked.p);
                if (!screenPoint)
                    continue;
                const deltaFromCurrent = Number(screenPoint.y) - Number(refScreen.y);
                if (verticalDirection === 'down' && deltaFromCurrent <= 1)
                    continue;
                if (verticalDirection === 'up' && deltaFromCurrent >= -1)
                    continue;
                const score = Math.abs(Number(screenPoint.y) - targetY);
                if (!best || score < best.score || (score === best.score && chosenRanked.xDistance < best.item.xDistance)) {
                    best = { score, item: chosenRanked, candidateFocusPos, edgeAdjustment, line, lineIndex, pageIndex, screenPoint };
                }
            }
        }
        if (!best)
            return null;
        const indexes = (best.line?.items || []).map(it => Number(it?.rec?.globalIndex)).filter(Number.isFinite);
        return {
            rec: best.item.rec,
            point: best.item.p,
            newFocusPos: clampCaretPos(best.candidateFocusPos),
            candidateFocusPos: best.candidateFocusPos,
            edgeAdjustment: best.edgeAdjustment,
            preferredX: px,
            boundaryMode: 'viewport-90-percent',
            activeSource,
            currentLine: { pageIndex: refRec.pageIndex, index: null, y: ref.y },
            targetLine: { pageIndex: best.pageIndex, y: best.line?.y ?? null, itemCount: best.line?.items?.length || 0, globalMin: indexes.length ? Math.min(...indexes) : null, globalMax: indexes.length ? Math.max(...indexes) : null },
            viewportHeight,
            stepPx,
            sourceScreenY: Number(refScreen.y),
            targetScreenY: targetY,
            chosenScreenY: Number(best.screenPoint.y),
            screenDistance: Number(best.score)
        };
    };

  return Object.freeze({ findViewportLineTarget });
}

module.exports = { createKeyboardViewportNavigation };
