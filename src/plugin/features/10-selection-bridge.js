'use strict';

class SelectionBridgeFeature {
  async prewarmKeyboardTextModel(file, pdfToken) {
    const token = String(pdfToken || '');
    const seq = (this.state.annotation.keyboardTextModelPrewarm?.seq || 0) + 1;
    const rec = {at:new Date().toISOString(),seq,token,filePath:file?.path||null,ok:false,vaultReadMs:null,ensureFrameMs:null,roundTripMs:null,result:null,error:null};
    this.state.annotation.keyboardTextModelPrewarm = {seq,last:rec};
    try {
      if (!file || !(file instanceof TFile) || !token) throw new Error('mangler file/token for keyboard-model prewarm');
      const readStarted = performance.now();
      const pdfBuffer = await this.obsidianVaultReadAdapter.readBinary(file);
      rec.vaultReadMs = Math.round((performance.now()-readStarted)*10)/10;
      rec.result=await this.ports.sendAnnotatorRequest('prewarm-keyboard-model',{
        pdfToken:token,includeHeaderFooterText:this.settings?.includeHeaderFooterText !== false
      },pdfBuffer,{target:rec,ensureField:'ensureFrameMs',roundTripField:'roundTripMs'});
      rec.ok = !!rec.result?.ok;
      if (!rec.ok) rec.error = rec.result?.error || 'prewarm feilet';
    } catch (e) {
      rec.error = e instanceof Error ? e.message : String(e);
    }
    this.state.annotation.keyboardTextModelPrewarm = {seq,last:rec};
    return rec;
  }

  async expandKeyboardSelectionWithAnnotator(pdfBuffer, text, direction, unit, visiblePage, viewerState, selectionHint, selectionGestureHint, rangeHint, selectionModel, pdfToken, includeHeaderFooterText, timing = null) {
    const frameWarmBefore=!!(this.state.annotation.frame&&this.state.annotation.frame.isConnected&&!this.state.annotation.frameReady);
    if(timing) timing.annotationFrameWarmBefore=frameWarmBefore;
    return this.ports.sendAnnotatorRequest('keyboard-expand-selection',{
      text:String(text||''),direction:String(direction||'right'),unit:String(unit||'glyph'),visiblePage:Number(visiblePage),pdfToken:String(pdfToken||''),
      viewerState:viewerState||null,hint:selectionHint||null,gestureHint:selectionGestureHint||null,rangeHint:rangeHint||null,selectionModel:selectionModel||null,includeHeaderFooterText:includeHeaderFooterText !== false
    },pdfBuffer,{target:timing,ensureField:'ensureAnnotationFrameMs',cloneField:'bufferCloneMs',roundTripField:'annotatorRoundTripMs'});
  }

  async filterSelectionArtifactsForOutput(file, selectionText, contextEvent = null, options = null) {
    const rawText=String(selectionText||'').trim();
    const gesture=contextEvent?.selectionGestureHint||null;
    const hasCrossPageGesture=!!(gesture?.down && gesture?.up &&
      [gesture.down.pageIndex,gesture.down.x,gesture.down.y,gesture.up.pageIndex,gesture.up.x,gesture.up.y].every(v=>Number.isFinite(Number(v))) &&
      Number(gesture.down.pageIndex)!==Number(gesture.up.pageIndex));
    const includeHeaderFooterText=this.settings?.includeHeaderFooterText !== false;
    const forceResolveIdentity=options?.forceResolveIdentity === true;
    // INTERNAL native-selection identity must not depend on the OUTWARD
    // header/footer preference. Context-menu mouse selection can therefore
    // force the PDFium locator to run even when output filtering is disabled.
    if (includeHeaderFooterText && !forceResolveIdentity) {
      return {ok:true,text:rawText,artifactExcludedRawCount:0,continuityExcludedRawCount:0,filtered:false,range:null,pages:null,occurrenceCount:null,rangeSource:null,resolvedGeometry:null,identityResolved:false};
    }
    if (!rawText && !hasCrossPageGesture) {
      return {ok:true,text:rawText,artifactExcludedRawCount:0,continuityExcludedRawCount:0,filtered:false,range:null,pages:null,occurrenceCount:null,rangeSource:null,resolvedGeometry:null,identityResolved:false};
    }
    if (!file || !(file instanceof TFile)) throw new Error('Artifact-filter: PDF-fil mangler.');
    const pdfBuffer=await this.obsidianVaultReadAdapter.readBinary(file);
    const categoryRange=contextEvent?.selectionSource==='category-marking-state' ? contextEvent?.categoryMarkingState?.range : null;
    const keyboardRange=contextEvent?.selectionSource==='keyboard-selection-state' ? contextEvent?.keyboardSelectionState?.range : null;
    // both right-click quote/link copy and keyboard Ctrl+C use the
    // exact raw keyboard range. Internal selection identity is unchanged;
    // only outward text passes through Artifact/continuity filtering.
    const sourceRange=categoryRange||keyboardRange;
    const exactRange=[Number(sourceRange?.start),Number(sourceRange?.end)].every(Number.isFinite) && Number(sourceRange.end)>=Number(sourceRange.start)
      ? {start:Number(sourceRange.start),end:Number(sourceRange.end)} : null;
    const token=String(contextEvent?.keyboardSelectionState?.token || contextEvent?.token || this.ports.getActiveReader()?.pdfToken || '');
    const result=await this.ports.sendAnnotatorRequest('filter-selection-artifacts',{pdfToken:token,
      text:rawText,visiblePage:Number(contextEvent?.viewerPoint?.mostVisiblePage),gestureHint:gesture?{
        coordinateSpace:String(gesture.coordinateSpace||'pdf-bottom-origin'),
        source:gesture.source||null,
        ageMs:Number.isFinite(Number(gesture.ageMs)) ? Number(gesture.ageMs) : null,
        down:gesture.down||null,up:gesture.up||null,
        debug:gesture.debug||null
      }:null,
      exactRange},pdfBuffer);
    const filterApplied=!includeHeaderFooterText;
    return {ok:true,text:filterApplied ? String(result?.filteredText||'') : rawText,
      artifactExcludedRawCount:filterApplied ? Number(result?.artifactExcludedRawCount||0) : 0,
      continuityExcludedRawCount:filterApplied ? Number(result?.continuityExcludedRawCount||0) : 0,
      filtered:filterApplied,
      range:result?.range||null,pages:result?.pages||null,occurrenceCount:Number(result?.occurrenceCount||0),rangeSource:result?.rangeSource||null,gestureEndpoints:result?.gestureEndpoints||null,
      resolvedGeometry:result?.resolvedGeometry||null,identityDiagnostic:result?.identityDiagnostic||null,
      artifactDiagnostics:filterApplied ? (result?.artifactDiagnostics||null) : null,identityResolved:!!(result?.range && result?.resolvedGeometry)};
  }

  async handlePdfKeyboardCopyRequest(detail) {
    const range=detail?.keyboardSelectionState?.range||null;
    const rec={
      at:new Date().toISOString(),seq:(this.state.bridge.keyboardCopy.state?.seq||0)+1,
      token:String(detail?.token||detail?.keyboardSelectionState?.token||''),
      rawText:String(detail?.selectedText||detail?.keyboardSelectionState?.text||''),
      rawLength:String(detail?.selectedText||detail?.keyboardSelectionState?.text||'').length,
      range:range&&[Number(range?.start),Number(range?.end)].every(Number.isFinite)?{start:Number(range.start),end:Number(range.end)}:null,
      filteredText:'',filteredLength:0,artifactExcludedRawCount:null,continuityExcludedRawCount:null,
      ok:false,error:null
    };
    this.state.bridge.keyboardCopy.state={seq:rec.seq,last:rec,busy:true};
    try {
      if(!rec.rawText.trim()) throw new Error('Keyboard Ctrl+C: ingen selection-tekst mottatt');
      if(!rec.range||rec.range.end<rec.range.start) throw new Error('Keyboard Ctrl+C: eksakt selection-range mangler');
      const payload={
        token:rec.token,
        selectionSource:'keyboard-selection-state',
        keyboardSelectionState:{
          token:rec.token,text:rec.rawText,range:rec.range,
          selectionModel:detail?.keyboardSelectionState?.selectionModel||null,
          selectionHint:detail?.keyboardSelectionState?.selectionHint||null
        }
      };
      const file=this.ports.resolvePdfFileFromBridgePayload(payload);
      if(!file) throw new Error('Keyboard Ctrl+C: kunne ikke knytte selection til eksakt PDF-fil');
      const filtered=await this.filterSelectionArtifactsForOutput(file,rec.rawText,payload);
      if(!filtered?.ok) throw new Error(filtered?.error||'Keyboard Ctrl+C: Artifact-filter feilet');
      rec.filteredText=String(filtered.text||'');
      rec.filteredLength=rec.filteredText.length;
      rec.artifactExcludedRawCount=Number(filtered.artifactExcludedRawCount||0);
      rec.continuityExcludedRawCount=Number(filtered.continuityExcludedRawCount||0);
      clipboardTextAdapter.writeText(rec.filteredText);
      rec.ok=true;
    } catch(e){ rec.error=e instanceof Error?e.message:String(e); }
    this.state.bridge.keyboardCopy.state={seq:rec.seq,last:rec,busy:false};
    return rec;
  }

  async handlePdfNativeCopyRequest(detail) {
    const rec={at:new Date().toISOString(),seq:(this.state.bridge.nativeCopy.state?.seq||0)+1,token:String(detail?.token||''),rawText:String(detail?.selectedText||''),rawLength:String(detail?.selectedText||'').length,geometryOnly:detail?.geometryOnly===true,filteredText:'',filteredLength:0,artifactExcludedRawCount:null,continuityExcludedRawCount:null,range:null,pages:null,rangeSource:null,ok:false,error:null};
    this.state.bridge.nativeCopy.state = {seq:rec.seq,last:rec,busy:true};
    try {
      const payload={
        token:rec.token,
        selectionSource:'native-pdf-copy',
        viewerPoint:{mostVisiblePage:Number(detail?.viewerState?.mostVisiblePage)},
        selectionGestureHint:detail?.selectionGestureHint||null
      };
      const crossPageGesture=!!(payload.selectionGestureHint?.down && payload.selectionGestureHint?.up &&
        Number(payload.selectionGestureHint.down.pageIndex)!==Number(payload.selectionGestureHint.up.pageIndex));
      if(!rec.rawText.trim() && !crossPageGesture) throw new Error('Native Ctrl+C: ingen selection-tekst eller flersidig musegeometri mottatt');
      const file=this.ports.resolvePdfFileFromBridgePayload(payload);
      if(!file) throw new Error('Native Ctrl+C: kunne ikke knytte selection til eksakt PDF-fil');
      const filtered=await this.filterSelectionArtifactsForOutput(file,rec.rawText,payload);
      if(!filtered?.ok) throw new Error(filtered?.error||'Native Ctrl+C: Artifact-filter feilet');
      rec.filteredText=String(filtered.text||'');
      rec.filteredLength=rec.filteredText.length;
      rec.artifactExcludedRawCount=Number(filtered.artifactExcludedRawCount||0);
      rec.continuityExcludedRawCount=Number(filtered.continuityExcludedRawCount||0);
      rec.range=filtered.range||null;
      rec.pages=filtered.pages||null;
      rec.rangeSource=filtered.rangeSource||null;
      if(!rec.filteredText.trim()) throw new Error('Native Ctrl+C: filtrert selection ble tom');
      clipboardTextAdapter.writeText(rec.filteredText);
      rec.ok=true;
    } catch(e){ rec.error=e instanceof Error?e.message:String(e); }
    this.state.bridge.nativeCopy.state={seq:rec.seq,last:rec,busy:false};
    return rec;
  }

  async handlePdfKeyboardSelectionRequest(detail) {
    const rec = {
      at:new Date().toISOString(), seq:(this.state.bridge.keyboardSelection.state?.seq||0)+1,
      direction:String(detail?.direction||''), unit:String(detail?.unit||'glyph'), token:detail?.token||null,
      selectionSource:detail?.selectionSource||null,
      beforeText:String(detail?.selectedText||''), beforeLength:String(detail?.selectedText||'').length,
      rangeHint:detail?.rangeHint||null, selectionModel:detail?.selectionModel||null, selectionHint:detail?.selectionHint||null, selectionGestureHint:detail?.selectionGestureHint||null, viewerState:detail?.viewerState||null,
      geometry:null, setResult:null,
      timing:{vaultReadMs:null,annotationFrameWarmBefore:null,ensureAnnotationFrameMs:null,bufferCloneMs:null,annotatorRoundTripMs:null,bridgeSetSelectionMs:null,totalMs:null},
      ok:false, error:null
    };
    const timingStarted = performance.now();
    const roundMs = value => Math.round(Number(value || 0) * 10) / 10;
    this.state.bridge.keyboardSelection.state = {seq:rec.seq,last:rec,busy:true};
    try {
      if (rec.unit !== 'select-all' && !rec.beforeText.trim()) throw new Error('Marker først minst ett tegn med mus i PDF-en.');
      const view = this.ports.getActiveReader();
      const file = view && view.file instanceof TFile ? view.file : null;
      if (!file) throw new Error('Fant ikke aktiv PDF i vår viewer.');
      const vaultReadStarted = performance.now();
      const pdfBuffer = await this.obsidianVaultReadAdapter.readBinary(file);
      rec.timing.vaultReadMs = roundMs(performance.now() - vaultReadStarted);
      const result = await this.expandKeyboardSelectionWithAnnotator(
        pdfBuffer, rec.beforeText, rec.direction, rec.unit, Number(detail?.viewerState?.mostVisiblePage), rec.viewerState, rec.selectionHint, rec.selectionGestureHint, rec.rangeHint, rec.selectionModel, rec.token, this.settings?.includeHeaderFooterText !== false, rec.timing
      );
      rec.geometry = result;
      if (!result?.changed) {
        const reason=String(result?.reason||'');
        if (/kollapset til caret/i.test(reason)) {
          const transport=this.mainProcessTransport;
          if (transport?.getCapabilities?.().loaded) {
            rec.setResult=await transport.clearKeyboardSelection('keyboard-selection-collapsed-to-anchor');
          }
          rec.collapsedToCaret=true;
          rec.afterText=''; rec.afterLength=0; rec.ok=true;
          return rec;
        }
        throw new Error(reason || 'Selection kunne ikke utvides.');
      }
      if (!Array.isArray(result.rects) || !result.rects.length) throw new Error('PDFium returnerte ingen overlay-geometri.');
      const transport = this.mainProcessTransport;
      if (!transport?.getCapabilities?.().loaded) throw new Error('main-process transport er ikke lastet for setKeyboardSelection()');
      const bridgeSetStarted = performance.now();
      rec.setResult = await transport.setKeyboardSelection({
        token:rec.token,
        text:String(result.expectedText||''),
        range:result.range||null,
        rects:result.rects,
        selectionHint:result.selectionHint||rec.selectionHint||null,
        selectionModel:result.selectionModel||null,
        direction:rec.direction
      });
      rec.timing.bridgeSetSelectionMs = roundMs(performance.now() - bridgeSetStarted);
      if (!rec.setResult?.ok) throw new Error(rec.setResult?.error || 'Kunne ikke aktivere keyboard-selection overlay.');
      rec.afterText=String(result.expectedText||''); rec.afterLength=rec.afterText.length;
      rec.ok=true;
    } catch(e) {
      rec.error=e instanceof Error?e.message:String(e);
      new Notice(`PDFium ${PLUGIN_VERSION}: ${rec.error}`,5000);
    } finally {
      rec.timing.totalMs = roundMs(performance.now() - timingStarted);
      this.state.bridge.keyboardSelection.state={seq:rec.seq,last:rec,busy:false};
      try {
        const transport=this.mainProcessTransport;
        if(transport?.getCapabilities?.().loaded) {
          transport.reportKeyboardSelectionResult({token:rec.token,direction:rec.direction,unit:rec.unit,seq:rec.seq,ok:rec.ok,error:rec.error});
        }
      } catch (_) {}
    }
    return rec;
  }
}

module.exports = { SelectionBridgeFeature };
