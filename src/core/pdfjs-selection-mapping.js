function extendObsidianPdfJsRangeFromKnownBegin(items, selectionText, begin) {
  // Chromium selectionText remains the textual truth. Starting from
  // the already validated geometric BEGIN, consume the local PDF.js stream.
  // The only tolerated representation difference is a proven discretionary
  // line-wrap hyphen: a standalone "-" item followed by PDF.js EOL structure
  // where Chromium continues directly with the next character.
  const query = compactObsidianLinkText(selectionText);
  if (!query) return {ok:false,error:'tom compact selectionText'};
  const stream = buildPdfJsCompactItemStream(items);
  if (!stream.text || !Array.isArray(stream.map) || !stream.map.length) {
    return {ok:false,error:'PDF.js compact text stream er tom'};
  }

  const beginCaret = {itemIndex:Number(begin?.itemIndex),offset:Number(begin?.offset)};
  if (![beginCaret.itemIndex,beginCaret.offset].every(Number.isFinite)) {
    return {ok:false,error:'mangler gyldig kjent BEGIN-caret'};
  }

  let start = -1;
  for (let i = 0; i < stream.map.length; i += 1) {
    const pos = stream.map[i];
    if (!pos) continue;
    if (comparePdfJsCaret(pos, beginCaret) >= 0) { start = i; break; }
  }
  if (start < 0) return {ok:false,error:'fant ingen kompakt PDF.js-tekst ved/etter kjent BEGIN'};

  let queryIndex = 0;
  let streamIndex = start;
  const skippedLineBreakHyphens = [];
  while (queryIndex < query.length && streamIndex < stream.text.length) {
    const expected = query[queryIndex];
    const actual = stream.text[streamIndex];
    if (expected === actual) {
      queryIndex += 1;
      streamIndex += 1;
      continue;
    }

    const mapped = stream.map[streamIndex] || null;
    const nextActual = streamIndex + 1 < stream.text.length ? stream.text[streamIndex + 1] : '';
    const normalization = resolvePdfJsTextMismatch({
      items,
      mappedCaret:mapped,
      actualChar:actual,
      expectedChar:expected,
      nextActualChar:nextActual
    });
    if (normalization.matched && normalization.action === 'skip-pdf-char') {
      skippedLineBreakHyphens.push({
        compactIndex:streamIndex,
        itemIndex:Number(mapped?.itemIndex),
        offset:Number(mapped?.offset),
        itemText:String(items[Number(mapped?.itemIndex)]?.str || ''),
        normalizationRuleId:normalization.ruleId || null
      });
      streamIndex += 1;
      continue;
    }
    break;
  }

  if (queryIndex !== query.length) {
    const firstMismatchIndex = queryIndex;
    const expectedChar = queryIndex < query.length ? query[queryIndex] : '';
    const actualChar = streamIndex < stream.text.length ? stream.text[streamIndex] : '';
    const firstMapped = stream.map[start] || null;
    const mismatchMapped = streamIndex < stream.map.length ? (stream.map[streamIndex] || null) : null;
    const actualWindowText = stream.text.slice(Math.max(start, streamIndex - 36), Math.min(stream.text.length, streamIndex + 36));
    return {
      ok:false,
      error:'selectionText matcher ikke lokalt fremover fra kjent BEGIN',
      queryLength:query.length,
      consumedQueryLength:queryIndex,
      startCompactIndex:start,
      streamCompactIndex:streamIndex,
      expectedPrefix:query.slice(0,120),
      actualPrefix:stream.text.slice(start, start + 120),
      beginCaret,
      beginItemText:String(items[beginCaret.itemIndex]?.str || ''),
      beginItemTextEscaped:JSON.stringify(String(items[beginCaret.itemIndex]?.str || '')).slice(1,-1),
      firstMappedCaret:firstMapped,
      firstMismatchIndex,
      expectedChar:describeObsidianLinkDiagnosticChar(expectedChar),
      actualChar:describeObsidianLinkDiagnosticChar(actualChar),
      expectedWindow:obsidianLinkMismatchWindow(query, Math.max(0,firstMismatchIndex)),
      actualWindow:{
        start:Math.max(start, streamIndex - 36),
        end:Math.min(stream.text.length, streamIndex + 36),
        mismatchOffset:streamIndex,
        text:actualWindowText,
        escaped:JSON.stringify(actualWindowText).slice(1,-1),
        markerOffset:Math.min(36, streamIndex - Math.max(start, streamIndex - 36))
      },
      mismatchMappedCaret:mismatchMapped,
      mismatchItemText:mismatchMapped ? String(items[mismatchMapped.itemIndex]?.str || '') : null,
      mismatchItemTextEscaped:mismatchMapped ? JSON.stringify(String(items[mismatchMapped.itemIndex]?.str || '')).slice(1,-1) : null,
      skippedLineBreakHyphens,
      itemsAroundBegin:pdfJsItemsAroundCaretDiagnostics(items, beginCaret, 5, 12),
      itemsAroundMismatch:mismatchMapped ? pdfJsItemsAroundCaretDiagnostics(items, mismatchMapped, 5, 8) : []
    };
  }

  const first = stream.map[start] || null;
  const lastMatchedCompactIndex = streamIndex - 1;
  const last = stream.map[lastMatchedCompactIndex] || null;
  if (!first || !last) return {ok:false,error:'lokal tekstmatch mangler endpoint-map'};
  if (comparePdfJsCaret(first, beginCaret) < 0) {
    return {ok:false,error:'lokal tekstmatch startet før kjent BEGIN'};
  }

  const end = {itemIndex:Number(last.itemIndex),offset:Number(last.offset) + 1};
  const rangeCompactLength = compactPdfJsRangeLength(items, beginCaret, end);
  return {
    ok:true,
    begin:beginCaret,
    end,
    queryLength:query.length,
    rangeCompactLength,
    startCompactIndex:start,
    endCompactIndex:lastMatchedCompactIndex,
    firstMapped:first,
    lastMapped:last,
    skippedLineBreakHyphens
  };
}


function mapMultiPageKeyboardSelectionPrefixToObsidianPdfJsRange(items, selectionText) {
  // A multi-page native Obsidian selection cannot encode later pages.
  // For the start-page fragment, Chromium/PDFium selectionText is the textual
  // truth. Match its prefix locally inside this one PDF.js page and derive both
  // BEGIN and the last matching caret before the text continues on the next page.
  // This is deliberately page-local; it is not the abandoned whole-document
  // selectionText search used by the earlier reconstruction path.
  const query = compactObsidianLinkText(selectionText);
  if (!query) return {ok:false,error:'tom compact flerside-selectionText'};
  const stream = buildPdfJsCompactItemStream(items);
  if (!stream.text || !Array.isArray(stream.map) || !stream.map.length) {
    return {ok:false,error:'PDF.js compact text stream er tom på startsiden'};
  }

  const candidates = [];
  for (let start = 0; start < stream.text.length; start += 1) {
    if (stream.text[start] !== query[0]) continue;
    let queryIndex = 0;
    let streamIndex = start;
    let lastMatchedStreamIndex = -1;
    const skipped = [];
    while (queryIndex < query.length && streamIndex < stream.text.length) {
      const expected = query[queryIndex];
      const actual = stream.text[streamIndex];
      if (expected === actual) {
        lastMatchedStreamIndex = streamIndex;
        queryIndex += 1;
        streamIndex += 1;
        continue;
      }
      const mapped = stream.map[streamIndex] || null;
      const nextActual = streamIndex + 1 < stream.text.length ? stream.text[streamIndex + 1] : '';
      const normalization = resolvePdfJsTextMismatch({
        items,
        mappedCaret:mapped,
        actualChar:actual,
        expectedChar:expected,
        nextActualChar:nextActual
      });
      if (normalization.matched && normalization.action === 'skip-pdf-char') {
        skipped.push({
          compactIndex:streamIndex,
          itemIndex:Number(mapped?.itemIndex),
          offset:Number(mapped?.offset),
          ruleId:normalization.ruleId || null
        });
        streamIndex += 1;
        continue;
      }
      break;
    }
    if (queryIndex <= 0 || lastMatchedStreamIndex < start) continue;
    const begin = stream.map[start] || null;
    const last = stream.map[lastMatchedStreamIndex] || null;
    if (!begin || !last) continue;
    candidates.push({
      startCompactIndex:start,
      consumedQueryLength:queryIndex,
      endCompactIndex:lastMatchedStreamIndex,
      streamStoppedAt:streamIndex,
      reachedPageEnd:streamIndex >= stream.text.length,
      consumedWholeQuery:queryIndex >= query.length,
      begin:{itemIndex:Number(begin.itemIndex),offset:Number(begin.offset)},
      end:{itemIndex:Number(last.itemIndex),offset:Number(last.offset)+1},
      skipped
    });
  }

  if (!candidates.length) {
    return {ok:false,error:'fant ingen lokal tekstprefix-match for flerside-selection på startsiden'};
  }
  candidates.sort((a,b) =>
    b.consumedQueryLength-a.consumedQueryLength ||
    a.startCompactIndex-b.startCompactIndex
  );
  const best = candidates[0];
  // Exactness contract: equal textual evidence is ambiguous even if one
  // candidate happens to reach the physical end of the PDF.js page stream.
  // Page-tail position is not identity and must not become a hidden heuristic.
  const tied = candidates.filter(c => c.consumedQueryLength === best.consumedQueryLength);
  const minEvidence = Math.min(query.length, 8);
  if (best.consumedQueryLength < minEvidence) {
    return {
      ok:false,
      error:'for lite lokal tekst-evidens til sikker flerside-BEGIN',
      diagnostics:{queryPrefix:query.slice(0,120),minEvidence,best,candidates:candidates.slice(0,8)}
    };
  }
  if (tied.length > 1) {
    return {
      ok:false,
      error:'flerside-BEGIN er tvetydig på startsiden; nekter å gjette',
      diagnostics:{queryPrefix:query.slice(0,120),best,tied:tied.slice(0,8),candidates:candidates.slice(0,12)}
    };
  }
  if (comparePdfJsCaret(best.begin,best.end) >= 0) {
    return {ok:false,error:'lokal flerside-prefix ga ugyldig/blank PDF.js-range'};
  }

  return {
    ok:true,
    chosen:{
      beginIndex:best.begin.itemIndex, beginOffset:best.begin.offset,
      endIndex:best.end.itemIndex, endOffset:best.end.offset,
      mode:'keyboard-multipage-start-page-local-text-prefix',
      pointDistance:null,
      reversed:false,
      lengthDelta:null,
      rangeCompactLength:best.consumedQueryLength,
      compactSelectionLength:query.length
    },
    diagnostics:{
      pageLocal:true,
      queryLength:query.length,
      queryPrefix:query.slice(0,160),
      matchedPrefixLength:best.consumedQueryLength,
      reachedPageEnd:best.reachedPageEnd,
      consumedWholeQuery:best.consumedWholeQuery,
      chosen:best,
      alternatives:candidates.slice(0,10)
    }
  };
}


function mapCategoryMarkingTextToObsidianPdfJsRange(items, selectionText) {
  // Category annotations are identified by their exact /NM group and
  // reconstructed text, but annotation geometry is not a reliable PDF.js
  // endpoint coordinate contract. Reuse the canonical page-local text
  // prefix mapper instead. It maps the whole text for a single-page category
  // and only the start-page fragment for a multi-page category. Equal textual
  // evidence remains ambiguous and must fail explicitly rather than guess.
  const mapped = mapMultiPageKeyboardSelectionPrefixToObsidianPdfJsRange(items, selectionText);
  if (!mapped?.ok || !mapped?.chosen) return mapped;
  return {
    ...mapped,
    chosen:{...mapped.chosen,mode:'category-marking-start-page-local-text'},
    diagnostics:{...(mapped.diagnostics || {}),source:'category-marking-local-text'}
  };
}

function mapMouseGestureToObsidianPdfJsRange(items, styles, viewport, pdfjsLib, selectionText, downPoint, upPoint) {
  // the captured Chromium/PDF gesture Y is in the opposite direction
  // from the viewport-transformed PDF.js text-item geometry used below. Apply
  // the conversion only at this boundary; do not change the shared gesture or
  // viewer coordinates used by locator, keyboard-selection or highlight code.
  const pageHeight = Number(viewport?.height);
  const toPdfJsHitPoint = point => {
    const x = Number(point?.x), y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return point;
    return Number.isFinite(pageHeight) ? {x, y:pageHeight - y} : {x, y};
  };
  const downHitPoint = toPdfJsHitPoint(downPoint);
  const upHitPoint = toPdfJsHitPoint(upPoint);
  const downCandidates = pdfJsItemEndpointCandidates(items, styles, viewport, pdfjsLib, downHitPoint);
  const upCandidates = pdfJsItemEndpointCandidates(items, styles, viewport, pdfjsLib, upHitPoint);
  // Diagnostics retain both the captured point and the locally corrected point.
  const viewportDiagnostic = {
    width:Number(viewport?.width), height:Number(viewport?.height), scale:Number(viewport?.scale),
    rotation:Number(viewport?.rotation), transform:Array.isArray(viewport?.transform) ? viewport.transform.slice(0,6) : null,
    viewBox:Array.isArray(viewport?.viewBox) ? viewport.viewBox.slice(0,4) : null
  };
  const downFlip = downHitPoint && Number.isFinite(Number(downHitPoint?.x)) && Number.isFinite(Number(downHitPoint?.y))
    ? {x:Number(downHitPoint.x),y:Number(downHitPoint.y)} : null;
  const upFlip = upHitPoint && Number.isFinite(Number(upHitPoint?.x)) && Number.isFinite(Number(upHitPoint?.y))
    ? {x:Number(upHitPoint.x),y:Number(upHitPoint.y)} : null;
  const coordinateDiagnostics = {
    viewport:viewportDiagnostic,
    down:{
      currentPoint:{x:Number(downPoint?.x),y:Number(downPoint?.y)},
      appliedHitPoint:downFlip,
      nearestCurrent:pdfJsCoordinateDiagnosticRows(items,styles,viewport,pdfjsLib,downPoint,12),
      yFlippedPoint:downFlip,
      nearestYFlipped:downFlip ? pdfJsCoordinateDiagnosticRows(items,styles,viewport,pdfjsLib,downFlip,12) : []
    },
    up:{
      currentPoint:{x:Number(upPoint?.x),y:Number(upPoint?.y)},
      appliedHitPoint:upFlip,
      nearestCurrent:pdfJsCoordinateDiagnosticRows(items,styles,viewport,pdfjsLib,upPoint,12),
      yFlippedPoint:upFlip,
      nearestYFlipped:upFlip ? pdfJsCoordinateDiagnosticRows(items,styles,viewport,pdfjsLib,upFlip,12) : []
    },
    selectionTextItems:pdfJsSelectionTextItemDiagnostics(items,styles,viewport,pdfjsLib,selectionText,12)
  };
  if (!downCandidates.length || !upCandidates.length) {
    return {ok:false,error:'kunne ikke hit-teste markeringens mus-endepunkter mot PDF.js textContent-items',downCandidates:downCandidates.slice(0,6),upCandidates:upCandidates.slice(0,6)};
  }
  const downLock = lockPdfJsEndpointToNearestItem(downCandidates);
  const upLock = lockPdfJsEndpointToNearestItem(upCandidates);
  if (!downLock.candidates.length || !upLock.candidates.length) {
    return {ok:false,error:'kunne ikke låse muse-endepunktene til nærmeste PDF.js textContent-item'};
  }

  const compactSelectionLength = compactObsidianLinkText(selectionText).length;
  const pairs = [];
  // Item identity is now fixed by physical geometry. Only offsets inside the
  // two locked items are allowed to vary to compensate for font-metric noise.
  for (const d of downLock.candidates.slice(0,10)) {
    for (const u of upLock.candidates.slice(0,10)) {
      let begin = d, end = u;
      let reversed = false;
      if (comparePdfJsCaret(begin,end) > 0) { begin = u; end = d; reversed = true; }
      if (comparePdfJsCaret(begin,end) === 0) continue;
      const rangeCompactLength = compactPdfJsRangeLength(items, begin, end);
      if (!Number.isFinite(rangeCompactLength)) continue;
      const lengthDelta = Math.abs(rangeCompactLength - compactSelectionLength);
      // Length is only a local offset tie-breaker now. It can no longer select
      // another text item / duplicate occurrence elsewhere on the page.
      const score = Number(d.horizontalError||0) + Number(u.horizontalError||0) + lengthDelta * 0.35;
      pairs.push({begin,end,reversed,score,lengthDelta,rangeCompactLength,compactSelectionLength,down:d,up:u});
    }
  }
  pairs.sort((a,b) => a.score - b.score || a.lengthDelta - b.lengthDelta);
  const chosen = pairs[0] || null;
  if (!chosen) return {ok:false,error:'ingen gyldig PDF.js-range mellom de geometrisk låste muse-endepunktene'};

  // Keep the geometric BEGIN, but do not trust mouseUp to
  // determine END. Consume Chromium's exact selectionText locally forward
  // from BEGIN and derive END from the final matched PDF.js character.
  const localTextRange = extendObsidianPdfJsRangeFromKnownBegin(items, selectionText, chosen.begin);
  if (!localTextRange.ok) {
    return {
      ok:false,
      error:`lokal END-mapping feilet: ${localTextRange.error || 'ukjent feil'}`,
      diagnostics:{
        geometricBegin:{itemIndex:chosen.begin.itemIndex,offset:chosen.begin.offset,itemText:String(items[chosen.begin.itemIndex]?.str||'')},
        geometricEnd:{itemIndex:chosen.end.itemIndex,offset:chosen.end.offset,itemText:String(items[chosen.end.itemIndex]?.str||'')},
        localTextRange,
        coordinateDiagnostics
      }
    };
  }
  const refinedEnd = localTextRange.end;
  const refinedRangeCompactLength = Number(localTextRange.rangeCompactLength);
  const refinedLengthDelta = Math.abs(refinedRangeCompactLength - compactSelectionLength);
  return {
    ok:true,
    chosen:{
      beginIndex:chosen.begin.itemIndex, beginOffset:chosen.begin.offset,
      endIndex:refinedEnd.itemIndex, endOffset:refinedEnd.offset,
      mode:'mouse-begin-local-selectiontext-end', pointDistance:Number(chosen.down.rectDistance||0) + Number(chosen.up.rectDistance||0),
      reversed:chosen.reversed, lengthDelta:refinedLengthDelta,
      rangeCompactLength:refinedRangeCompactLength, compactSelectionLength:chosen.compactSelectionLength
    },
    diagnostics:{
      lockedDownItemIndex:downLock.itemIndex,
      lockedUpItemIndex:upLock.itemIndex,
      // Diagnostic-only fields expose exactly which caret
      // candidates won; they do not alter hit-testing, locking or scoring.
      chosenMouseDown:{
        itemIndex:chosen.down.itemIndex, offset:chosen.down.offset,
        itemText:String(items[chosen.down.itemIndex]?.str || ''),
        itemTextLength:String(items[chosen.down.itemIndex]?.str || '').length,
        point:chosen.down.point || null, rectDistance:chosen.down.rectDistance, horizontalError:chosen.down.horizontalError
      },
      chosenMouseUp:{
        itemIndex:chosen.up.itemIndex, offset:chosen.up.offset,
        itemText:String(items[chosen.up.itemIndex]?.str || ''),
        itemTextLength:String(items[chosen.up.itemIndex]?.str || '').length,
        point:chosen.up.point || null, rectDistance:chosen.up.rectDistance, horizontalError:chosen.up.horizontalError
      },
      normalizedBegin:{
        itemIndex:chosen.begin.itemIndex, offset:chosen.begin.offset,
        itemText:String(items[chosen.begin.itemIndex]?.str || ''),
        itemTextLength:String(items[chosen.begin.itemIndex]?.str || '').length
      },
      normalizedEnd:{
        itemIndex:refinedEnd.itemIndex, offset:refinedEnd.offset,
        itemText:String(items[refinedEnd.itemIndex]?.str || ''),
        itemTextLength:String(items[refinedEnd.itemIndex]?.str || '').length
      },
      geometricEndBeforeLocalText:{
        itemIndex:chosen.end.itemIndex, offset:chosen.end.offset,
        itemText:String(items[chosen.end.itemIndex]?.str || ''),
        itemTextLength:String(items[chosen.end.itemIndex]?.str || '').length
      },
      localTextRange,
      downCandidates:downCandidates.slice(0,6), upCandidates:upCandidates.slice(0,6),
      coordinateDiagnostics,
      pairCandidates:pairs.slice(0,8).map(p => ({beginIndex:p.begin.itemIndex,beginOffset:p.begin.offset,endIndex:p.end.itemIndex,endOffset:p.end.offset,score:p.score,lengthDelta:p.lengthDelta,reversed:p.reversed}))
    }
  };
}


function mapKeyboardSelectionStateToObsidianPdfJsRange(items, styles, viewport, pdfjsLib, selectionText, keyboardState, pageIndex, options = null) {
  const model = keyboardState?.selectionModel || null;
  const anchorPos = Number(model?.anchorPos), focusPos = Number(model?.focusPos);
  if (![anchorPos, focusPos].every(Number.isFinite)) {
    return {ok:false,error:'keyboard-selection mangler gyldig anchorPos/focusPos'};
  }
  const rects = (Array.isArray(keyboardState?.rects) ? keyboardState.rects : [])
    .filter(r => Number(r?.pageIndex) === Number(pageIndex))
    .map(r => ({
      pageIndex:Number(r.pageIndex),
      x:Number(r?.origin?.x), y:Number(r?.origin?.y),
      width:Number(r?.size?.width), height:Number(r?.size?.height),
      pageHeight:Number(r?.pageHeight)
    }))
    .filter(r => [r.x,r.y,r.width,r.height,r.pageHeight].every(Number.isFinite) && r.width > 0 && r.height > 0);
  if (!rects.length) return {ok:false,error:'keyboard-selection mangler gyldig overlay-geometri på siden'};

  // PDFium selection rectangles are bottom-origin. PDF.js viewport-transformed
  // text items are top-origin. Use the exact custom-selection geometry, not the
  // old native mouse gesture, and convert only at this boundary.
  rects.sort((a,b) => {
    const ay = a.y + a.height * 0.5;
    const by = b.y + b.height * 0.5;
    return (by - ay) || (a.x - b.x);
  });
  const firstRect = rects[0];
  const lastRect = rects[rects.length - 1];
  const startPoint = {
    x:firstRect.x,
    y:firstRect.pageHeight - (firstRect.y + firstRect.height * 0.5)
  };
  const endPoint = {
    x:lastRect.x + lastRect.width,
    y:lastRect.pageHeight - (lastRect.y + lastRect.height * 0.5)
  };

  const startCandidates = pdfJsItemEndpointCandidates(items, styles, viewport, pdfjsLib, startPoint, 8);
  const endCandidates = pdfJsItemEndpointCandidates(items, styles, viewport, pdfjsLib, endPoint, 8);
  if (!startCandidates.length || !endCandidates.length) {
    return {ok:false,error:'kunne ikke hit-teste keyboard-selection-geometrien mot PDF.js textContent-items'};
  }

  const pageFragmentOnly = options?.pageFragmentOnly === true;
  const compactSelectionLength = pageFragmentOnly ? null : compactObsidianLinkText(selectionText).length;
  const pairs = [];
  for (const a of startCandidates.slice(0,20)) {
    for (const b of endCandidates.slice(0,20)) {
      let begin = a, end = b;
      if (comparePdfJsCaret(begin,end) > 0) [begin,end] = [end,begin];
      if (comparePdfJsCaret(begin,end) === 0) continue;
      const rangeCompactLength = compactPdfJsRangeLength(items, begin, end);
      if (!Number.isFinite(rangeCompactLength)) continue;
      const lengthDelta = pageFragmentOnly ? null : Math.abs(rangeCompactLength - compactSelectionLength);
      // Single-page keyboard selections can use the complete selection-text
      // length as a strong local tie-breaker. For a multi-page selection the
      // text includes later pages, so comparing that total length with only the
      // start-page fragment would bias the endpoint ranking. In that case the
      // exact overlay geometry is authoritative at this boundary.
      const score = (pageFragmentOnly ? 0 : lengthDelta * 2) +
        Number(a.rectDistance||0) * 4 + Number(b.rectDistance||0) * 4 +
        Number(a.horizontalError||0) + Number(b.horizontalError||0);
      pairs.push({begin,end,score,lengthDelta,rangeCompactLength,compactSelectionLength,start:a,endCandidate:b,pageFragmentOnly});
    }
  }
  pairs.sort((a,b) => a.score-b.score || a.lengthDelta-b.lengthDelta || comparePdfJsCaret(a.begin,b.begin));
  const chosen = pairs[0] || null;
  if (!chosen) return {ok:false,error:'ingen gyldig PDF.js-range fra keyboard-selection-geometrien'};

  return {
    ok:true,
    chosen:{
      beginIndex:chosen.begin.itemIndex, beginOffset:chosen.begin.offset,
      endIndex:chosen.end.itemIndex, endOffset:chosen.end.offset,
      mode:pageFragmentOnly ? 'keyboard-selection-start-page-fragment' : 'keyboard-selection-model-rect-endpoints',
      pointDistance:Number(chosen.start.rectDistance||0)+Number(chosen.endCandidate.rectDistance||0),
      reversed:focusPos < anchorPos,
      lengthDelta:chosen.lengthDelta,
      rangeCompactLength:chosen.rangeCompactLength,
      compactSelectionLength:chosen.compactSelectionLength
    },
    diagnostics:{
      keyboardSelectionModel:{anchorPos,focusPos,range:keyboardState?.range || null,direction:keyboardState?.direction || null},
      pageFragmentOnly,
      rectCount:rects.length,
      firstRect,lastRect,startPoint,endPoint,
      chosenKeyboardStart:{
        itemIndex:chosen.start.itemIndex,offset:chosen.start.offset,itemText:String(items[chosen.start.itemIndex]?.str||''),
        itemTextLength:String(items[chosen.start.itemIndex]?.str||'').length,point:chosen.start.point||null,
        rectDistance:chosen.start.rectDistance,horizontalError:chosen.start.horizontalError
      },
      chosenKeyboardEnd:{
        itemIndex:chosen.endCandidate.itemIndex,offset:chosen.endCandidate.offset,itemText:String(items[chosen.endCandidate.itemIndex]?.str||''),
        itemTextLength:String(items[chosen.endCandidate.itemIndex]?.str||'').length,point:chosen.endCandidate.point||null,
        rectDistance:chosen.endCandidate.rectDistance,horizontalError:chosen.endCandidate.horizontalError
      },
      normalizedBegin:{itemIndex:chosen.begin.itemIndex,offset:chosen.begin.offset,itemText:String(items[chosen.begin.itemIndex]?.str||''),itemTextLength:String(items[chosen.begin.itemIndex]?.str||'').length},
      normalizedEnd:{itemIndex:chosen.end.itemIndex,offset:chosen.end.offset,itemText:String(items[chosen.end.itemIndex]?.str||''),itemTextLength:String(items[chosen.end.itemIndex]?.str||'').length},
      startCandidates:startCandidates.slice(0,8),endCandidates:endCandidates.slice(0,8),
      pairCandidates:pairs.slice(0,10).map(p=>({beginIndex:p.begin.itemIndex,beginOffset:p.begin.offset,endIndex:p.end.itemIndex,endOffset:p.end.offset,score:p.score,lengthDelta:p.lengthDelta})),
      coordinateDiagnostics:{
        viewport:{width:Number(viewport?.width),height:Number(viewport?.height),scale:Number(viewport?.scale),rotation:Number(viewport?.rotation),transform:Array.isArray(viewport?.transform)?viewport.transform.slice(0,6):null},
        start:pdfJsCoordinateDiagnosticRows(items,styles,viewport,pdfjsLib,startPoint,10),
        end:pdfJsCoordinateDiagnosticRows(items,styles,viewport,pdfjsLib,endPoint,10)
      }
    }
  };
}

function findObsidianPdfJsSelectionRange(items, selectionText, hint = null) {
  const query = normalizeObsidianLinkText(selectionText);
  if (!query) return { ok:false, error:'tom markering etter normalisering', query };
  const modes = ['eol-space', 'space', 'eol', 'none'];
  const candidates = [];
  const seen = new Set();
  for (let modeIndex = 0; modeIndex < modes.length; modeIndex += 1) {
    const mode = modes[modeIndex];
    const stream = buildPdfJsTextItemStream(items, mode);
    let from = 0;
    while (from <= stream.text.length - query.length) {
      const at = stream.text.indexOf(query, from);
      if (at < 0) break;
      const endAt = at + query.length - 1;
      let first = at, last = endAt;
      while (first <= endAt && !stream.map[first]) first += 1;
      while (last >= at && !stream.map[last]) last -= 1;
      if (first <= last && stream.map[first] && stream.map[last]) {
        const begin = stream.map[first], end = stream.map[last];
        const key = `${begin.itemIndex},${begin.offset},${end.itemIndex},${end.offset + 1}`;
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push({
            mode, modeIndex, at,
            beginIndex:begin.itemIndex, beginOffset:begin.offset,
            endIndex:end.itemIndex, endOffset:end.offset + 1,
            pointDistance:scorePdfJsItemRange(items, begin.itemIndex, end.itemIndex, hint)
          });
        }
      }
      from = at + 1;
    }
  }
  // Chromium native PDF selection and PDF.js textContent can disagree
  // about whitespace at text-item boundaries. If the exact whitespace models
  // found nothing, match the same non-whitespace character sequence while
  // preserving the PDF.js item/offset mapping for the endpoints.
  if (!candidates.length) {
    const compactQuery = compactObsidianLinkText(selectionText);
    const compact = buildPdfJsCompactItemStream(items);
    if (compactQuery && compact.text.length >= compactQuery.length) {
      let from = 0;
      while (from <= compact.text.length - compactQuery.length) {
        const at = compact.text.indexOf(compactQuery, from);
        if (at < 0) break;
        const endAt = at + compactQuery.length - 1;
        const begin = compact.map[at] || null;
        const end = compact.map[endAt] || null;
        if (begin && end) {
          const key = `${begin.itemIndex},${begin.offset},${end.itemIndex},${end.offset + 1}`;
          if (!seen.has(key)) {
            seen.add(key);
            candidates.push({
              mode:'compact-whitespace-insensitive', modeIndex:modes.length, at,
              beginIndex:begin.itemIndex, beginOffset:begin.offset,
              endIndex:end.itemIndex, endOffset:end.offset + 1,
              pointDistance:scorePdfJsItemRange(items, begin.itemIndex, end.itemIndex, hint)
            });
          }
        }
        from = at + 1;
      }
    }
  }
  candidates.sort((a,b) => a.pointDistance - b.pointDistance || a.modeIndex - b.modeIndex || a.at - b.at);
  const chosen = candidates[0] || null;
  return chosen ? { ok:true, query, chosen, occurrenceCount:candidates.length, candidates:candidates.slice(0,8) }
                : { ok:false, query, error:'markert tekst ble ikke funnet i PDF.js textContent-items', occurrenceCount:0, candidates:[] };
}

