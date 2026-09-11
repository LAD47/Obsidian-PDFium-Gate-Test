'use strict';

class ContextMenuFeature {
  getMainProcessBridgePath() {
    return this.obsidianPluginPathsAdapter.resolvePluginPath(`main-bridge-${PLUGIN_VERSION}.js`);
  }

  closePdfContextOverlay() {
    const hadOverlay = !!this.state.context.overlay;
    if (this.state.context.overlayCleanup) {
      try { this.state.context.overlayCleanup(); } catch (_) {}
      this.state.context.overlayCleanup = null;
    }
    if (this.state.context.overlay) {
      try { this.state.context.overlay.remove(); } catch (_) {}
      this.state.context.overlay = null;
    }
    if (hadOverlay) {
      try {
        const transport = this.mainProcessTransport;
        if (transport?.getCapabilities?.().loaded) transport.setRendererMenuOpen(false);
      } catch (_) {}
    }
  }

  classifyHighlightMatchesForMenu(file, matches, baseMode = 'existing') {
    const result = { mode:'none', matches:[], match:null, category:null, reason:null };
    let categories = [];
    try { categories = this.ports.getVisibleCategories(file); } catch (_) {}
    const classified = (Array.isArray(matches) ? matches : []).map(match => {
      const color = normalizeHexColor(match?.color || '#000000');
      const categoryMatches = categories.filter(c => normalizeHexColor(c.color || '#000000') === color);
      return { ...match, normalizedColor:color, categoryMatches };
    });
    result.matches = classified;
    if (!classified.length) return result;
    if (classified.length > 1) {
      result.mode = 'ambiguous';
      result.reason = `${classified.length} overlappende highlights`;
      return result;
    }
    const only = classified[0];
    result.match = only;
    if (only.categoryMatches.length === 1) {
      result.mode = baseMode;
      result.category = only.categoryMatches[0];
    } else {
      result.mode = 'existing-unknown';
      result.reason = only.categoryMatches.length > 1 ? 'multiple categories use the same color' : 'highlight color matches no active category';
    }
    return result;
  }

  async inspectDirectHighlightContextForMenu(file, viewerPoint) {
    const candidates = Array.isArray(viewerPoint?.candidates) ? viewerPoint.candidates : [];
    if (!candidates.length) return { mode:'none', matches:[], match:null, category:null, reason:viewerPoint?.error || null, source:'point' };
    try {
      const pdfBuffer = await this.obsidianVaultReadAdapter.readBinary(file);
      const inspected = await this.ports.inspectPointHighlightsWithAnnotator(pdfBuffer, candidates);
      const classified = this.classifyHighlightMatchesForMenu(file, inspected?.matches || [], 'existing-direct');
      return { ...classified, source:'point', candidateDiagnostics:inspected?.candidateDiagnostics || [], viewerPoint };
    } catch (error) {
      return { mode:'inspection-error', matches:[], match:null, category:null, reason:error instanceof Error ? error.message : String(error), source:'point' };
    }
  }

  exactKeyboardSelectionGeometryFromContext(contextEvent) {
    if (contextEvent?.selectionSource !== 'keyboard-selection-state') return null;
    const state = contextEvent?.keyboardSelectionState || null;
    const range = state?.range || null;
    const rects = Array.isArray(state?.rects) ? state.rects : [];
    const start = Number(range?.start), end = Number(range?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || !rects.length) return null;
    const mergedRects = [];
    for (const item of rects) {
      const pageIndex = Number(item?.pageIndex);
      const x = Number(item?.origin?.x), y = Number(item?.origin?.y);
      const width = Number(item?.size?.width), height = Number(item?.size?.height);
      if (![pageIndex,x,y,width,height].every(Number.isFinite)) continue;
      if (pageIndex < 0 || width <= 0 || height <= 0) continue;
      mergedRects.push({pageIndex,origin:{x,y},size:{width,height}});
    }
    if (!mergedRects.length) return null;
    const pages=[...new Set(mergedRects.map(r=>r.pageIndex))].sort((a,b)=>a-b);
    return {
      source:'keyboard-selection-state-exact-geometry',
      complete:true,
      pages,
      range:{start,end},
      rawRectCount:mergedRects.length,
      mergedRectCount:mergedRects.length,
      rawRects:mergedRects,
      mergedRects
    };
  }

  exactNativeSelectionGeometryFromContext(contextEvent) {
    if (contextEvent?.selectionSource !== 'native-context-selection') return null;
    const geometry = contextEvent?.nativeResolvedGeometry || null;
    const range = geometry?.range || contextEvent?.nativeResolvedRange || null;
    const rects = Array.isArray(geometry?.mergedRects) ? geometry.mergedRects : [];
    const start = Number(range?.start), end = Number(range?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || !rects.length) return null;
    const mergedRects = [];
    for (const item of rects) {
      const pageIndex = Number(item?.pageIndex);
      const x = Number(item?.origin?.x), y = Number(item?.origin?.y);
      const width = Number(item?.size?.width), height = Number(item?.size?.height);
      if (![pageIndex,x,y,width,height].every(Number.isFinite)) continue;
      if (pageIndex < 0 || width <= 0 || height <= 0) continue;
      mergedRects.push({pageIndex,origin:{x,y},size:{width,height}});
    }
    if (!mergedRects.length) return null;
    const pages=[...new Set(mergedRects.map(r=>r.pageIndex))].sort((a,b)=>a-b);
    return {
      source:'native-resolved-range-exact-geometry',
      complete:true,
      pages,
      range:{start,end},
      rawRectCount:mergedRects.length,
      mergedRectCount:mergedRects.length,
      rawRects:mergedRects,
      mergedRects
    };
  }

  exactSelectionGeometryFromContext(contextEvent) {
    return this.exactKeyboardSelectionGeometryFromContext(contextEvent) ||
      this.exactNativeSelectionGeometryFromContext(contextEvent);
  }

  selectionGeometryContainsViewerPoint(contextEvent, geometry, tolerance = 3) {
    const rects = Array.isArray(geometry?.mergedRects) ? geometry.mergedRects : [];
    const candidates = Array.isArray(contextEvent?.viewerPoint?.candidates) ? contextEvent.viewerPoint.candidates : [];
    const pad = Number.isFinite(Number(tolerance)) ? Math.max(0, Number(tolerance)) : 3;
    if (!rects.length || !candidates.length) return false;
    for (const candidate of candidates) {
      const pageIndex = Number(candidate?.pageIndex);
      const pageX = Number(candidate?.pageX);
      const pageY = Number(candidate?.pageY);
      if (![pageIndex,pageX,pageY].every(Number.isFinite)) continue;
      for (const rect of rects) {
        if (Number(rect?.pageIndex) !== pageIndex) continue;
        const x = Number(rect?.origin?.x), y = Number(rect?.origin?.y);
        const w = Number(rect?.size?.width), h = Number(rect?.size?.height);
        if (![x,y,w,h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
        if (pageX >= x - pad && pageX <= x + w + pad && pageY >= y - pad && pageY <= y + h + pad) return true;
      }
    }
    return false;
  }

  async inspectSelectionContextForMenu(file, selectionText, contextEvent = null) {
    const result = { mode: 'new', geometry: null, matches: [], match: null, category: null, reason: null };
    try {
      const pdfBuffer = await this.obsidianVaultReadAdapter.readBinary(file);
      const exactGeometry = this.exactSelectionGeometryFromContext(contextEvent);
      let geometry = exactGeometry;
      if (!geometry) {
        const selection = await this.ports.findSelectionWithAnnotator(pdfBuffer, selectionText);
        const searchGeometry = selection && selection.fullGeometry;
        const directGeometry = selection && selection.directGeometry;
        geometry = directGeometry && directGeometry.complete ? directGeometry : searchGeometry;
      }
      result.geometry = geometry || null;
      if (!geometry || !geometry.complete || !Array.isArray(geometry.mergedRects) || !geometry.mergedRects.length) {
        result.mode = 'inspection-error';
        result.reason = 'selection-geometri kunne ikke bestemmes sikkert';
        return result;
      }

      const inspected = await this.ports.inspectSelectionHighlightsWithAnnotator(pdfBuffer, geometry.mergedRects);
      const matches = Array.isArray(inspected?.matches) ? inspected.matches : [];
      result.matches = matches;
      if (!matches.length) return result;

      let categories = [];
      try { categories = this.ports.getVisibleCategories(file); } catch (_) {}
      const classify = match => {
        const color = normalizeHexColor(match?.color || '#000000');
        const categoryMatches = categories.filter(c => normalizeHexColor(c.color || '#000000') === color);
        return { ...match, normalizedColor: color, categoryMatches };
      };
      const classified = matches.map(classify);
      if (classified.length > 1) {
        result.mode = 'ambiguous';
        result.reason = `${classified.length} overlappende highlights`;
        result.matches = classified;
        return result;
      }

      const only = classified[0];
      result.match = only;
      if (only.categoryMatches.length === 1) {
        result.mode = 'existing';
        result.category = only.categoryMatches[0];
      } else {
        result.mode = 'existing-unknown';
        result.reason = only.categoryMatches.length > 1 ? 'multiple categories use the same color' : 'highlight color matches no active category';
      }
      return result;
    } catch (error) {
      result.mode = 'inspection-error';
      result.reason = error instanceof Error ? error.message : String(error);
      return result;
    }
  }

  navigationStateFromViewerPoint(viewerPoint) {
    const page = Number(viewerPoint?.mostVisiblePage);
    const zoom = Number(viewerPoint?.zoom);
    const point = viewerPoint?.navigationPoint || null;
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(page) || page < 0 || !Number.isFinite(zoom) || zoom <= 0 ||
        !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      source:'context-menu-viewerPoint',
      page,
      zoom,
      point:{x,y},
      position: viewerPoint?.position ? {
        x:Number(viewerPoint.position.x||0),
        y:Number(viewerPoint.position.y||0)
      } : null
    };
  }

  showPdfContextOverlay(contextEvent) {
    void this.showPdfContextOverlayAsync(contextEvent);
  }

  async showPdfContextOverlayAsync(contextEvent) {
    const t=(key,params)=>this.i18n?.t?.(key,params) || key;
    this.closePdfContextOverlay();
    const selectionText = String(contextEvent?.selectionText || '').trim();
    if (!contextEvent?.isPdfContext) return;
    const file = this.ports.resolvePdfFileFromBridgePayload(contextEvent);
    if (!file) { new Notice(t('category.context.resolvePdfFailed',{version:PLUGIN_VERSION}), 8000); return; }
    const rendererContext = this.ports.resolveRendererWindowContextForPdfEvent(contextEvent);
    const menuDoc = rendererContext.document;
    const menuWin = rendererContext.window;
    let outwardSelectionText = selectionText;
    let outwardFilter = {ok:true,text:selectionText,artifactExcludedRawCount:0,filtered:false,error:null};
    const filterOutwardArtifacts = this.settings?.includeHeaderFooterText === false;
    const resolveNativeIdentity = contextEvent?.selectionSource === 'native-context-selection' && !!selectionText;
    if (selectionText && (filterOutwardArtifacts || resolveNativeIdentity)) {
      try {
        outwardFilter = await this.ports.filterSelectionArtifactsForOutput(
          file, selectionText, contextEvent,
          resolveNativeIdentity ? {forceResolveIdentity:true} : null
        );
        outwardSelectionText = String(outwardFilter?.text || '');
        if (contextEvent?.selectionSource === 'native-context-selection') {
          const nativeIdentityDiagnostic = this.ports.recordNativeSelectionIdentityDiagnostic({
            at:new Date().toISOString(), version:PLUGIN_VERSION, stage:'context-menu-identity-resolved',
            file:file.path, selectionText, selectionLength:selectionText.length,
            gesture:contextEvent?.selectionGestureHint||null,
            viewerPoint:contextEvent?.viewerPoint||null,
            range:outwardFilter?.range||null, pages:outwardFilter?.pages||null,
            rangeSource:outwardFilter?.rangeSource||null,
            resolvedGeometry:outwardFilter?.resolvedGeometry||null,
            identityDiagnostic:outwardFilter?.identityDiagnostic||null,
            writer:null
          });
          console.log(`[PDFium Gate Test ${PLUGIN_VERSION}] native selection identity diagnostic`, nativeIdentityDiagnostic);
        }
        if (contextEvent?.selectionSource === 'native-context-selection' && outwardFilter?.range && Array.isArray(outwardFilter?.pages) && outwardFilter.pages.length) {
          contextEvent = {
            ...contextEvent,
            nativeResolvedRange:{start:Number(outwardFilter.range.start),end:Number(outwardFilter.range.end)},
            nativeResolvedPages:outwardFilter.pages.map(Number).filter(Number.isFinite),
            nativeResolvedRangeSource:outwardFilter.rangeSource || null,
            nativeResolvedGeometry:outwardFilter?.resolvedGeometry || null
          };
        }
      } catch (error) {
        outwardFilter = {ok:false,text:filterOutwardArtifacts ? '' : selectionText,artifactExcludedRawCount:null,filtered:filterOutwardArtifacts,error:error instanceof Error ? error.message : String(error)};
        outwardSelectionText = filterOutwardArtifacts ? '' : selectionText;
      }
    }
    const contextNavigationState = this.navigationStateFromViewerPoint(contextEvent?.viewerPoint || null);
    this.state.navigation.lastContextNavigationState = contextNavigationState;

    const point = contextEvent?.clientPoint || null;
    let cursorX = Number(point?.x), cursorY = Number(point?.y);
    if (!Number.isFinite(cursorX)) cursorX = Number(contextEvent?.x || 40);
    if (!Number.isFinite(cursorY)) cursorY = Number(contextEvent?.y || 80);

    const menuWidth = 290;
    const roomOnRight = menuWin.innerWidth - cursorX;
    let x = roomOnRight >= (menuWidth + 16) ? cursorX + 8 : cursorX - menuWidth - 8;
    let y = cursorY - 8;
    x = Math.max(8, Math.min(menuWin.innerWidth - menuWidth - 8, x));
    y = Math.max(8, Math.min(menuWin.innerHeight - 470, y));

    // Show a small progress notice while PDFium compares selection geometry with
    // existing Highlight annotations so the context-menu action does not feel unresponsive.
    const loading = menuDoc.createElement('div');
    loading.className = 'pdfium-gate-dom-context-menu';
    Object.assign(loading.style, { position:'fixed', left:`${x}px`, top:`${y}px`, zIndex:'100000', minWidth:'245px', maxWidth:'320px', padding:'10px 12px', background:'var(--background-primary)', color:'var(--text-muted)', border:'1px solid var(--background-modifier-border)', borderRadius:'8px', boxShadow:'0 8px 28px rgba(0,0,0,.35)', fontSize:'14px' });
    loading.textContent = t('category.context.checking');
    menuDoc.body.appendChild(loading);
    this.state.context.overlay = loading;

    let inspection = null;
    try {
      // Restore the canonical menu contract. A real Highlight
      // directly under the right-click point wins, even when Chromium still reports
      // selected text there. Only when there is no direct Highlight do we inspect the
      // active text selection. This preserves the expected existing-category menu.
      inspection = await this.inspectDirectHighlightContextForMenu(file, contextEvent?.viewerPoint || null);
      if ((inspection?.mode === 'none' || inspection?.mode === 'inspection-error') && selectionText) {
        inspection = await this.inspectSelectionContextForMenu(file, selectionText, contextEvent);
        inspection.source = 'selection-fallback';
      }
      this.ports.pushFocusRetestItem(this.state.diagnostics.focusRetest.contextMenuActions, {
        at:new Date().toISOString(), stage:'renderer-dom-menu-priority',
        selectionLength:selectionText.length, inspectionMode:inspection?.mode || null,
        inspectionSource:inspection?.source || null, file:file.path
      }, 40);
    } catch (error) { inspection = { mode:'inspection-error', reason:error instanceof Error ? error.message : String(error), matches:[] }; }

    // The context menu may have been closed while inspection was running.
    if (this.state.context.overlay !== loading) return;
    this.closePdfContextOverlay();

    // Right-click on ordinary, unselected PDF text is not a category action.
    // We intentionally show nothing unless there is either a direct Highlight hit
    // or an actual text selection for creating a new category mark.
    if (inspection?.mode === 'none' && !selectionText) return;

    const menu = menuDoc.createElement('div');
    menu.className = 'pdfium-gate-dom-context-menu';
    Object.assign(menu.style, { position:'fixed', left:`${x}px`, top:`${y}px`, zIndex:'100000', minWidth:'260px', maxWidth:'340px', padding:'6px', background:'var(--background-primary)', color:'var(--text-normal)', border:'1px solid var(--background-modifier-border)', borderRadius:'8px', boxShadow:'0 8px 28px rgba(0,0,0,.35)', fontSize:'14px' });

    const addHeading = (label, muted = false) => {
      const item = menuDoc.createElement('div');
      item.textContent = label;
      Object.assign(item.style, { padding:'7px 10px 6px', fontWeight:'700', color: muted ? 'var(--text-muted)' : 'var(--text-normal)', userSelect:'none' });
      menu.appendChild(item);
      return item;
    };
    const addNote = label => {
      const item = menuDoc.createElement('div');
      item.textContent = label;
      Object.assign(item.style, { padding:'3px 10px 7px', fontSize:'12px', lineHeight:'1.35', color:'var(--text-muted)', userSelect:'none', maxWidth:'310px' });
      menu.appendChild(item);
      return item;
    };
    const addSeparator = () => {
      const sep = menuDoc.createElement('div');
      Object.assign(sep.style, { height:'1px', margin:'5px 4px', background:'var(--background-modifier-border)' });
      menu.appendChild(sep);
    };
    const addItem = (label, onClick, options = {}) => {
      const item = menuDoc.createElement('div');
      item.textContent = label;
      const disabled = !!options.disabled;
      Object.assign(item.style, { padding:'7px 10px', borderRadius:'5px', cursor: disabled ? 'default' : 'pointer', userSelect:'none', color: disabled ? 'var(--text-muted)' : (options.danger ? 'var(--text-error)' : 'var(--text-normal)'), opacity: disabled ? '0.72' : '1' });
      if (!disabled) {
        item.addEventListener('mouseenter', () => { item.style.background = 'var(--background-modifier-hover)'; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });
        item.addEventListener('mousedown', evt => { evt.preventDefault(); evt.stopPropagation(); });
        item.addEventListener('click', evt => {
          evt.preventDefault(); evt.stopPropagation();
          if (!options.keepOpen) this.closePdfContextOverlay();
          onClick();
        });
      }
      menu.appendChild(item);
      return item;
    };
    const addCategoryEditorShortcut = () => {
      addSeparator();
      addItem(t('category.context.editCategories'), () => {
        this.ports.openCategoryEditor(file);
      });
    };
    const addCopyActions = () => {
      addItem(t('category.context.copy'), () => {
        if (!outwardFilter?.ok) { new Notice(t('category.context.filterFailed',{version:PLUGIN_VERSION,error:outwardFilter?.error || t('common.unknown')}), 9000); return; }
        if (!String(outwardSelectionText || '').trim()) { new Notice(t('category.context.emptyFiltered',{version:PLUGIN_VERSION}), 9000); return; }
        try { clipboardTextAdapter.writeText(outwardSelectionText); } catch (_) {}
        this.ports.pushFocusRetestItem(this.state.diagnostics.focusRetest.contextMenuActions, {
          at:new Date().toISOString(), stage:'renderer-dom-copy', file:file.path, selectionLength:selectionText.length, outwardLength:outwardSelectionText.length,
          artifactExcludedRawCount:Number(outwardFilter?.artifactExcludedRawCount||0), continuityExcludedRawCount:Number(outwardFilter?.continuityExcludedRawCount||0),
          range:outwardFilter?.range||null, pages:outwardFilter?.pages||null, rangeSource:outwardFilter?.rangeSource||null
        }, 40);
        new Notice(t('category.context.copied',{version:PLUGIN_VERSION,count:outwardSelectionText.length,artifactInfo:outwardFilter?.artifactExcludedRawCount ? t('category.context.artifactInfo',{count:outwardFilter.artifactExcludedRawCount}) : ''}), 3500);
      });
      addItem(t('category.context.copyQuote'), () => {
        if (!outwardFilter?.ok) { new Notice(t('category.context.filterFailed',{version:PLUGIN_VERSION,error:outwardFilter?.error || t('common.unknown')}), 9000); return; }
        void this.ports.copyObsidianPdfSelectionReference(file, selectionText, contextEvent, inspection, 'quote', outwardSelectionText);
      });
      addItem(t('category.context.copyLink'), () => { void this.ports.copyObsidianPdfSelectionReference(file, selectionText, contextEvent, inspection, 'link', outwardSelectionText); });
    };
    const addCategoryItem = (category, options = {}) => {
      const label = categoryLabel(category);
      const item = menuDoc.createElement('div');
      const disabled = !!options.disabled;
      Object.assign(item.style, { display:'flex', alignItems:'center', gap:'9px', padding:'7px 10px', borderRadius:'5px', cursor:disabled ? 'default' : 'pointer', userSelect:'none', opacity:disabled ? '0.72' : '1' });
      const swatch = menuDoc.createElement('span');
      Object.assign(swatch.style, { width:'14px', height:'14px', borderRadius:'3px', flex:'0 0 14px', background:normalizeHexColor(category.color), border:'1px solid rgba(127,127,127,.45)' });
      item.appendChild(swatch);
      const text = menuDoc.createElement('span');
      text.textContent = `${options.current ? '✓  ' : ''}${label}${!options.editMode && category.shortcut ? `   Ctrl+Alt+${category.shortcut}` : ''}`;
      item.appendChild(text);
      if (!disabled) {
        item.addEventListener('mouseenter', () => { item.style.background = 'var(--background-modifier-hover)'; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });
        item.addEventListener('mousedown', evt => { evt.preventDefault(); evt.stopPropagation(); });
        item.addEventListener('click', evt => {
          evt.preventDefault(); evt.stopPropagation(); this.closePdfContextOverlay();
          this.ports.pushFocusRetestItem(this.state.diagnostics.focusRetest.contextMenuActions, { at:new Date().toISOString(), stage:options.editMode ? 'renderer-dom-category-change' : 'renderer-dom-category-choice', id:category.id, label, color:category.color, selectionLength:selectionText.length, file:file.path }, 40);
          if (options.editMode && options.existingMatch) {
            void this.ports.changeExistingHighlightCategory(file, options.existingMatch, category, contextNavigationState);
          } else {
            void this.ports.runSelectionHighlightTest(file, selectionText, `renderer-dom-context-menu:${category.id}`, category, contextNavigationState, contextEvent);
          }
        });
      }
      menu.appendChild(item);
      return item;
    };

    let categories;
    try { categories = this.ports.getVisibleCategories(file); }
    catch (error) {
      new Notice(t('category.context.configError',{version:PLUGIN_VERSION,error:error instanceof Error ? error.message : String(error)}), 15000);
      return;
    }

    if ((inspection?.mode === 'existing' || inspection?.mode === 'existing-direct') && inspection.match && inspection.category) {
      const renderExistingHighlightMenu = () => {
        menu.replaceChildren();
        addHeading(t('category.context.highlightHeading',{category:categoryLabel(inspection.category)}));
        addItem(t('category.context.copyQuote'), () => { void this.ports.copyExistingCategoryReference(file, inspection.match, 'quote'); });
        addItem(t('category.context.copyLink'), () => { void this.ports.copyExistingCategoryReference(file, inspection.match, 'link'); });
        addSeparator();
        addItem(t('category.context.changeCategory'), () => renderCategoryMenu(), { keepOpen:true });
        addItem(t('category.context.removeHighlight'), () => {
          const ok = menuWin.confirm(t('category.context.confirmRemove',{category:categoryLabel(inspection.category)}));
          if (ok) void this.ports.removeExistingHighlight(file, inspection.match, contextNavigationState);
        }, { danger:true });
        addCategoryEditorShortcut();
      };
      const renderCategoryMenu = () => {
        menu.replaceChildren();
        addHeading(t('category.context.changeCategoryHeading'));
        for (const category of categories) {
          const current = category.id === inspection.category.id;
          addCategoryItem(category, { editMode:true, current, disabled:current, existingMatch:inspection.match });
        }
        addSeparator();
        addItem(t('common.back'), () => renderExistingHighlightMenu(), { keepOpen:true });
      };
      renderExistingHighlightMenu();
    } else if (inspection?.mode === 'ambiguous') {
      addHeading(t('category.context.ambiguousHeading'));
      addNote(t('category.context.ambiguousNote'));
    } else if (inspection?.mode === 'existing-unknown') {
      addHeading(t('category.context.unknownHeading'));
      addNote(t('category.context.unknownNote'));
    } else if (inspection?.mode === 'inspection-error') {
      addHeading(t('category.context.inspectFailedHeading'));
      addNote(t('category.context.inspectFailedNote',{reason:inspection?.reason ? ` (${inspection.reason})` : ''}));
    } else {
      for (const category of categories) addCategoryItem(category, { editMode:false });
    }

    if (selectionText && !((inspection?.mode === 'existing' || inspection?.mode === 'existing-direct') && inspection.match && inspection.category)) {
      addSeparator();
      addCopyActions();
      addCategoryEditorShortcut();
    }

    menuDoc.body.appendChild(menu);
    this.state.context.overlay = menu;
    try {
      const transport = this.mainProcessTransport;
      if (transport?.getCapabilities?.().loaded) {
        const arm = transport.setRendererMenuOpen(true);
        this.ports.pushFocusRetestItem(this.state.diagnostics.focusRetest.contextMenuActions, {
          at:new Date().toISOString(), stage:'renderer-dom-escape-armed',
          escapeRegistered:!!arm?.escapeRegistered, file:file.path
        }, 40);
      }
    } catch (error) {
      this.ports.pushFocusRetestItem(this.state.diagnostics.focusRetest.contextMenuActions, {
        at:new Date().toISOString(), stage:'renderer-dom-escape-arm-error',
        error:error instanceof Error ? error.message : String(error), file:file.path
      }, 40);
    }
    const closeOutside = evt => { if (this.state.context.overlay && !this.state.context.overlay.contains(evt.target)) this.closePdfContextOverlay(); };
    const closeKey = evt => { if (evt.key === 'Escape') this.closePdfContextOverlay(); };
    menuWin.setTimeout(() => menuDoc.addEventListener('mousedown', closeOutside, true), 0);
    menuDoc.addEventListener('keydown', closeKey, true);
    this.state.context.overlayCleanup = () => { menuDoc.removeEventListener('mousedown', closeOutside, true); menuDoc.removeEventListener('keydown', closeKey, true); };
    this.ports.pushFocusRetestItem(this.state.diagnostics.focusRetest.contextMenuActions, { at:new Date().toISOString(), stage:'renderer-dom-menu-shown', menuMode:inspection?.mode || 'new', selectionLength:selectionText.length, file:file.path, cursorX, cursorY, x, y, suppressionMode:contextEvent?.suppressionMode || null }, 40);
  }
}

module.exports = { ContextMenuFeature };
