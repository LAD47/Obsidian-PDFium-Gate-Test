'use strict';

class SelectionLinksFeature {
  getPdfSelectionPageHint(contextEvent, inspection) {
    const candidates = Array.isArray(contextEvent?.viewerPoint?.candidates) ? contextEvent.viewerPoint.candidates : [];
    const exact = candidates.find(c => Number.isFinite(Number(c?.pageIndex)) && Number.isFinite(Number(c?.pageX)) && Number.isFinite(Number(c?.pageY)));
    if (exact) return { pageIndex:Number(exact.pageIndex), pageX:Number(exact.pageX), pageY:Number(exact.pageY), source:'viewer-point' };
    const pages = Array.isArray(inspection?.geometry?.pages) ? inspection.geometry.pages.map(Number).filter(Number.isFinite) : [];
    if (pages.length === 1) return { pageIndex:pages[0], pageX:null, pageY:null, source:'selection-geometry' };
    return null;
  }

  async buildObsidianPdfSelectionReference(file, selectionText, contextEvent, inspection = null) {
    const keyboardState = contextEvent?.selectionSource === 'keyboard-selection-state'
      ? (contextEvent?.keyboardSelectionState || null)
      : null;
    const keyboardModel = keyboardState?.selectionModel || null;
    const keyboardRects = Array.isArray(keyboardState?.rects) ? keyboardState.rects : [];
    const keyboardPages = [...new Set(keyboardRects.map(r => Number(r?.pageIndex)).filter(Number.isFinite))].sort((a,b) => a-b);
    const useKeyboardSelection = !!(
      keyboardState && keyboardModel &&
      [Number(keyboardModel.anchorPos),Number(keyboardModel.focusPos)].every(Number.isFinite) &&
      keyboardRects.length
    );
    const categoryState = contextEvent?.selectionSource === 'category-marking-state'
      ? (contextEvent?.categoryMarkingState || null)
      : null;
    const categoryPages = [...new Set((Array.isArray(categoryState?.pageIndexes) ? categoryState.pageIndexes : [])
      .map(Number).filter(Number.isFinite))].sort((a,b) => a-b);
    const useCategoryMarking = !!(categoryState && categoryPages.length);
    const nativeResolvedRange = contextEvent?.nativeResolvedRange || null;
    const nativeResolvedPages = [...new Set((Array.isArray(contextEvent?.nativeResolvedPages) ? contextEvent.nativeResolvedPages : [])
      .map(Number).filter(Number.isFinite))].sort((a,b) => a-b);
    const useNativeResolvedSelection = !!(
      contextEvent?.selectionSource === 'native-context-selection' &&
      [Number(nativeResolvedRange?.start),Number(nativeResolvedRange?.end)].every(Number.isFinite) &&
      Number(nativeResolvedRange.end) >= Number(nativeResolvedRange.start) && nativeResolvedPages.length
    );

    const gesture = contextEvent?.selectionGestureHint || null;
    const down = gesture?.down || null;
    const up = gesture?.up || null;
    let pageIndex = null;
    const multiPageKeyboardSelection = useKeyboardSelection && keyboardPages.length > 1;
    const multiPageCategoryMarking = useCategoryMarking && categoryPages.length > 1;
    const multiPageNativeResolvedSelection = useNativeResolvedSelection && nativeResolvedPages.length > 1;
    if (useCategoryMarking) {
      // Category marks already have an exact logical identity (/NM group).
      // Native Obsidian links are still page-local, so always map the text
      // locally on the first page of that exact logical category mark.
      pageIndex = categoryPages[0];
    } else if (useKeyboardSelection) {
      if (!keyboardPages.length) {
        throw new Error('keyboard-selection mangler sidegeometri');
      }
      // Native Obsidian selection-links are page-local: #page=N&selection=...
      // For a multi-page keyboard selection we therefore link to the exact
      // fragment on the first document page. This preserves a standard
      // Obsidian link and gives a precise entry point without inventing a
      // proprietary cross-page selection format.
      pageIndex = keyboardPages[0];
    } else if (useNativeResolvedSelection) {
      // cross-page native mouse selections can be resolved from their
      // physical gesture to an exact raw PDF range. Keep the standard Obsidian
      // contract by linking only to the first-page fragment, just like keyboard
      // and category multi-page selections.
      pageIndex = nativeResolvedPages[0];
    } else {
      const downPage = Number(down?.pageIndex), upPage = Number(up?.pageIndex);
      if (![downPage,upPage,Number(down?.x),Number(down?.y),Number(up?.x),Number(up?.y)].every(Number.isFinite)) {
        throw new Error('mangler gyldige fysiske start/sluttpunkter for den native musemarkeringen');
      }
      if (downPage !== upPage) {
        throw new Error('multi-page selection is not supported by Obsidian selection links');
      }
      pageIndex = downPage;
    }

    const pdfBuffer = await this.obsidianVaultReadAdapter.readBinary(file);
    const pdfjsLib = await loadPdfJs();
    if (!pdfjsLib || typeof pdfjsLib.getDocument !== 'function') throw new Error('Obsidian loadPdfJs() returnerte ikke pdfjsLib.getDocument');
    let loadingTask = null;
    let pdfDoc = null;
    try {
      const data = new Uint8Array(pdfBuffer.slice(0));
      loadingTask = pdfjsLib.getDocument({ data });
      pdfDoc = await loadingTask.promise;
      const pageNumber = Number(pageIndex) + 1;
      if (pageNumber < 1 || pageNumber > Number(pdfDoc.numPages || 0)) throw new Error(`invalid PDF page ${pageNumber}`);
      const page = await pdfDoc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const items = Array.isArray(textContent?.items) ? textContent.items : [];
      const styles = textContent?.styles || {};
      if (!items.length) throw new Error('PDF.js found no textContent items on the page');
      const viewport = page.getViewport({scale:1});
      const map = useCategoryMarking
        ? mapCategoryMarkingTextToObsidianPdfJsRange(items, selectionText)
        : useKeyboardSelection
          ? (multiPageKeyboardSelection
              ? mapMultiPageKeyboardSelectionPrefixToObsidianPdfJsRange(items, selectionText)
              : mapKeyboardSelectionStateToObsidianPdfJsRange(
                  items, styles, viewport, pdfjsLib, selectionText, keyboardState, pageIndex,
                  {pageFragmentOnly:false}
                ))
          : useNativeResolvedSelection && multiPageNativeResolvedSelection
            ? mapMultiPageKeyboardSelectionPrefixToObsidianPdfJsRange(items, selectionText)
            : mapMouseGestureToObsidianPdfJsRange(
                items, styles, viewport, pdfjsLib, selectionText,
                {x:Number(down.x),y:Number(down.y)},
                {x:Number(up.x),y:Number(up.y)}
              );
      if (!map.ok || !map.chosen) {
        const mappingError = new Error(map.error || 'kunne ikke mappe markeringens endepunkter');
        mappingError.pdfiumSelectionDiagnostics = deepClone(map.diagnostics || null);
        mappingError.pdfiumSelectionMapError = map.error || null;
        mappingError.pdfiumSelectionPage = pageNumber;
        throw mappingError;
      }
      const c = map.chosen;
      const selection = `${c.beginIndex},${c.beginOffset},${c.endIndex},${c.endOffset}`;
      const subpath = `#page=${pageNumber}&selection=${selection}`;
      const display = `${file.basename}, side ${pageNumber}`;
      const linkResult = this.obsidianMarkdownLinkAdapter.generate(file, '', subpath, display);
      if (!linkResult?.ok) throw new Error(linkResult?.error || 'kunne ikke generere Obsidian Markdown-lenke');
      const link = linkResult.link;
      return {
        pageNumber, selection, subpath, link,
        beginIndex:c.beginIndex, beginOffset:c.beginOffset, endIndex:c.endIndex, endOffset:c.endOffset,
        mappingMode:c.mode, occurrenceCount:null, pointDistance:c.pointDistance,
        pageHintSource:useCategoryMarking ? 'category-marking-start-page' : (useKeyboardSelection ? 'keyboard-selection-model' : (useNativeResolvedSelection ? 'native-mouse-resolved-start-page' : 'native-mouse-gesture')),
        endpointReversed:!!c.reversed,
        lengthDelta:c.lengthDelta,
        rangeCompactLength:c.rangeCompactLength,
        compactSelectionLength:c.compactSelectionLength,
        gestureSource:useKeyboardSelection ? null : (gesture?.source || null),
        gestureAgeMs:useKeyboardSelection ? null : (Number.isFinite(Number(gesture?.ageMs)) ? Number(gesture.ageMs) : null),
        keyboardSelectionModel:useKeyboardSelection ? keyboardModel : null,
        keyboardSelectionRange:useKeyboardSelection ? (keyboardState?.range || null) : null,
        keyboardSelectionPages:useKeyboardSelection ? keyboardPages.slice() : null,
        categoryMarkingPages:useCategoryMarking ? categoryPages.slice() : null,
        nativeResolvedRange:useNativeResolvedSelection ? {start:Number(nativeResolvedRange.start),end:Number(nativeResolvedRange.end)} : null,
        nativeResolvedPages:useNativeResolvedSelection ? nativeResolvedPages.slice() : null,
        selectionLinkScope:(multiPageKeyboardSelection || multiPageCategoryMarking || multiPageNativeResolvedSelection) ? 'start-page-fragment' : 'full-selection',
        endpointDiagnostics:map.diagnostics || null
      };
    } finally {
      try { if (pdfDoc && typeof pdfDoc.destroy === 'function') await pdfDoc.destroy(); }
      catch (_) { try { if (loadingTask && typeof loadingTask.destroy === 'function') await loadingTask.destroy(); } catch (_) {} }
    }
  }

  formatObsidianPdfQuote(selectionText, link) {
    const quote = String(selectionText || '').trim().replace(/\r\n/g, '\n').split('\n').map(line => `> ${line}`).join('\n');
    return `${quote}\n\n${link}`;
  }

  async copyObsidianPdfSelectionReference(file, selectionText, contextEvent, inspection, mode, outwardSelectionText = null) {
    try {
      const ref = await this.buildObsidianPdfSelectionReference(file, selectionText, contextEvent, inspection);
      const quoteText = outwardSelectionText == null ? String(selectionText || '') : String(outwardSelectionText || '');
      const text = mode === 'quote' ? this.formatObsidianPdfQuote(quoteText, ref.link) : ref.link;
      clipboardTextAdapter.writeText(text);

      // retain diagnostics while the endpoint hit-test uses the local Y correction.
      const gesture = contextEvent?.selectionGestureHint || null;
      const endpointDiagnostics = ref.endpointDiagnostics || null;
      this.state.navigation.lastSelectionLinkDiagnostic = deepClone({
        at:new Date().toISOString(),
        version:PLUGIN_VERSION,
        purpose:'canonical embedded PDF target; selection-link mapping diagnostics',
        mode,
        file:file.path,
        page:ref.pageNumber,
        selectionSource:contextEvent?.selectionSource || null,
        mappingMode:ref.mappingMode,
        selectionText:String(selectionText || ''),
        selectionLength:String(selectionText || '').length,
        compactSelectionLength:ref.compactSelectionLength,
        keyboardSelection:contextEvent?.keyboardSelectionState ? {
          range:contextEvent.keyboardSelectionState.range || null,
          selectionModel:contextEvent.keyboardSelectionState.selectionModel || null,
          rectCount:Array.isArray(contextEvent.keyboardSelectionState.rects) ? contextEvent.keyboardSelectionState.rects.length : 0,
          pages:ref.keyboardSelectionPages || null,
          selectionLinkScope:ref.selectionLinkScope || null,
          selectionHint:contextEvent.keyboardSelectionState.selectionHint || null
        } : null,
        categoryMarking:contextEvent?.categoryMarkingState ? {
          range:contextEvent.categoryMarkingState.range || null,
          rectCount:Array.isArray(contextEvent.categoryMarkingState.rects) ? contextEvent.categoryMarkingState.rects.length : 0,
          pages:ref.categoryMarkingPages || contextEvent.categoryMarkingState.pageIndexes || null,
          groupId:contextEvent.categoryMarkingState.groupId || null,
          annotationId:contextEvent.categoryMarkingState.annotationId || null,
          selectionLinkScope:ref.selectionLinkScope || null
        } : null,
        mouseDown:gesture?.down ? {
          pageIndex:Number(gesture.down.pageIndex), x:Number(gesture.down.x), y:Number(gesture.down.y)
        } : null,
        mouseUp:gesture?.up ? {
          pageIndex:Number(gesture.up.pageIndex), x:Number(gesture.up.x), y:Number(gesture.up.y)
        } : null,
        gestureSource:ref.gestureSource,
        gestureAgeMs:ref.gestureAgeMs,
        gestureTransform:gesture?.debug || null,
        coordinateDiagnostics:endpointDiagnostics?.coordinateDiagnostics || null,
        lockedDownItemIndex:endpointDiagnostics?.lockedDownItemIndex ?? null,
        lockedUpItemIndex:endpointDiagnostics?.lockedUpItemIndex ?? null,
        mappedMouseDown:endpointDiagnostics?.chosenMouseDown || null,
        mappedMouseUp:endpointDiagnostics?.chosenMouseUp || null,
        mappedKeyboardStart:endpointDiagnostics?.chosenKeyboardStart || null,
        mappedKeyboardEnd:endpointDiagnostics?.chosenKeyboardEnd || null,
        keyboardRectEndpoints:endpointDiagnostics?.firstRect && endpointDiagnostics?.lastRect ? {
          firstRect:endpointDiagnostics.firstRect,lastRect:endpointDiagnostics.lastRect,
          startPoint:endpointDiagnostics.startPoint,endPoint:endpointDiagnostics.endPoint
        } : null,
        normalizedBegin:endpointDiagnostics?.normalizedBegin || null,
        normalizedEnd:endpointDiagnostics?.normalizedEnd || null,
        endpointReversed:ref.endpointReversed,
        rangeCompactLength:ref.rangeCompactLength,
        lengthDelta:ref.lengthDelta,
        final:{
          beginIndex:ref.beginIndex, beginOffset:ref.beginOffset,
          endIndex:ref.endIndex, endOffset:ref.endOffset,
          selection:ref.selection, link:ref.link
        },
        pairCandidates:Array.isArray(endpointDiagnostics?.pairCandidates) ? endpointDiagnostics.pairCandidates : []
      });
      console.log(`[PDFium Gate ${PLUGIN_VERSION}] selection-link diagnostic`, this.state.navigation.lastSelectionLinkDiagnostic);

      this.ports.pushFocusRetestItem(this.state.diagnostics.focusRetest.contextMenuActions, {
        at:new Date().toISOString(), stage:mode === 'quote' ? 'renderer-dom-copy-as-quote' : 'renderer-dom-copy-selection-link',
        file:file.path, page:ref.pageNumber, selection:ref.selection, selectionLength:String(selectionText||'').length,
        mappingMode:ref.mappingMode, occurrenceCount:ref.occurrenceCount, pointDistance:ref.pointDistance, pageHintSource:ref.pageHintSource,
        endpointReversed:ref.endpointReversed, lengthDelta:ref.lengthDelta, rangeCompactLength:ref.rangeCompactLength,
        compactSelectionLength:ref.compactSelectionLength, gestureSource:ref.gestureSource, gestureAgeMs:ref.gestureAgeMs,
        endpointDiagnostics:ref.endpointDiagnostics
      }, 40);
      const multiPageNotice = ref.selectionLinkScope === 'start-page-fragment';
      new Notice(this.i18n.t('selectionLinks.copiedNotice',{version:PLUGIN_VERSION,message:this.i18n.t(mode === 'quote'
        ? (multiPageNotice ? 'selectionLinks.copied.multiQuote' : 'selectionLinks.copied.quote')
        : (multiPageNotice ? 'selectionLinks.copied.multiLink' : 'selectionLinks.copied.link'))}), 3500);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failureDiagnostics = error && typeof error === 'object' ? (error.pdfiumSelectionDiagnostics || null) : null;
      const localTextRange = failureDiagnostics?.localTextRange || null;
      this.state.navigation.lastSelectionLinkDiagnostic = {
        at:new Date().toISOString(), version:PLUGIN_VERSION,
        purpose:'canonical embedded PDF target; selection-link mapping failure diagnostics',
        mode, file:file?.path || null,
        selectionSource:contextEvent?.selectionSource || null,
        selectionText:String(selectionText || ''), selectionLength:String(selectionText || '').length,
        compactSelectionText:compactObsidianLinkText(selectionText),
        compactSelectionLength:compactObsidianLinkText(selectionText).length,
        mouseDown:contextEvent?.selectionGestureHint?.down || null, mouseUp:contextEvent?.selectionGestureHint?.up || null,
        gestureSource:contextEvent?.selectionGestureHint?.source || null,
        error:message,
        mappingError:error && typeof error === 'object' ? (error.pdfiumSelectionMapError || null) : null,
        page:error && typeof error === 'object' ? (error.pdfiumSelectionPage || null) : null,
        geometricBegin:failureDiagnostics?.geometricBegin || null,
        geometricEnd:failureDiagnostics?.geometricEnd || null,
        localTextRange,
        mismatchSummary:localTextRange ? {
          beginCaret:localTextRange.beginCaret || null,
          beginItemText:localTextRange.beginItemText || null,
          firstMappedCaret:localTextRange.firstMappedCaret || null,
          firstMismatchIndex:localTextRange.firstMismatchIndex ?? null,
          expectedChar:localTextRange.expectedChar || null,
          actualChar:localTextRange.actualChar || null,
          expectedWindow:localTextRange.expectedWindow || null,
          actualWindow:localTextRange.actualWindow || null,
          mismatchMappedCaret:localTextRange.mismatchMappedCaret || null,
          mismatchItemText:localTextRange.mismatchItemText || null
        } : null,
        endpointDiagnostics:failureDiagnostics,
        coordinateDiagnostics:failureDiagnostics?.coordinateDiagnostics || null
      };
      console.warn(`[PDFium Gate ${PLUGIN_VERSION}] selection-link diagnostic failed`, this.state.navigation.lastSelectionLinkDiagnostic);
      this.ports.pushFocusRetestItem(this.state.diagnostics.focusRetest.contextMenuActions, {
        at:new Date().toISOString(), stage:'renderer-dom-copy-selection-reference-error', mode, file:file.path, error:message
      }, 40);
      new Notice(this.i18n.t('selectionLinks.createFailed',{version:PLUGIN_VERSION,error:message}), 9000);
    }
  }
}

module.exports = { SelectionLinksFeature };
