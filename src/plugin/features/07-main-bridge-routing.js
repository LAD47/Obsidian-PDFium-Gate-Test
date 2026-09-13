'use strict';

class MainBridgeRoutingFeature {
  resetMainBridgeDiagnosticState() {
    this.state.diagnostics.mainBridge.state = null;
    this.state.diagnostics.mainBridge.lastSnapshotAt = null;
  }

  async activateLeafFromPdfMouseEvent(eventRecord) {
    if (this.state.context.mouseLeafActivationInFlight) return null;
    const token = String(eventRecord?.token || '').trim();
    if (!token || !this.pdfLeafAdapter || typeof this.pdfLeafAdapter.activateExactToken !== 'function') return null;

    const activeLeafResult = this.pdfLeafAdapter?.getActiveLeaf?.();
    const currentLeaf = activeLeafResult?.ok ? activeLeafResult.leaf : null;
    let currentToken = null;
    try {
      const currentView = currentLeaf?.view || null;
      if (currentView && typeof currentView.getViewType === 'function' && currentView.getViewType() === VIEW_TYPE) {
        currentToken = String(currentView.pdfToken || '').trim() || null;
      }
    } catch (_) {}

    const rec = {
      at:new Date().toISOString(), token, source:'pdf-physical-left-mousedown',
      alreadyActive:currentToken === token, activated:false, reason:null,
      matchCount:0, candidateCount:0, filePath:null, error:null
    };
    if (rec.alreadyActive) {
      rec.activated = true;
      rec.reason = 'already-active-token';
      rec.filePath = this.pdfLeafAdapter.leafFilePath(currentLeaf) || null;
      // A click is also an explicit user intent signal. Re-publish the active
      // identity even when Obsidian already points at this leaf, so stale
      // main-process routing state is repaired by the click itself.
      await this.syncActivePdfIdentity('pdf-physical-left-mousedown', currentLeaf);
      this.state.context.lastMouseLeafActivation = rec;
      return rec;
    }

    this.state.context.mouseLeafActivationInFlight = true;
    try {
      const result = this.pdfLeafAdapter.activateExactToken(token);
      rec.activated = !!result?.activated && !!result?.ok;
      rec.reason = result?.reason || null;
      rec.matchCount = Number(result?.matchCount || 0);
      rec.candidateCount = Number(result?.candidateCount || 0);
      rec.error = result?.error || null;
      if (rec.activated && result?.leaf) {
        rec.filePath = this.pdfLeafAdapter.leafFilePath(result.leaf) || null;
        // Publish immediately so reserved keyboard shortcuts follow the same
        // physical click without waiting for active-leaf-change event timing.
        await this.syncActivePdfIdentity('pdf-physical-left-mousedown', result.leaf);
      }
    } catch (error) {
      rec.error = error instanceof Error ? error.message : String(error);
      rec.reason = rec.reason || 'activation-exception';
    } finally {
      this.state.context.mouseLeafActivationInFlight = false;
      this.state.context.lastMouseLeafActivation = rec;
    }
    return rec;
  }

  async handlePdfMouseActivationBridgeEvent(eventRecord) {
    const parsed=validateRendererBridgeEventDetail(RENDERER_BRIDGE_EVENTS.PDF_MOUSE_ACTIVATION,eventRecord);
    if(!parsed?.ok) return {ok:false,error:parsed?.error||'invalid PDF mouse activation event'};
    const activationEvent=parsed.detail;
    const seq=(this.state.bridge.pdfMouseActivation.state?.seq||0)+1;
    this.state.bridge.pdfMouseActivation.state={seq,last:activationEvent};
    if(this.state.context.overlay) {
      this.ports.closePdfContextOverlay();
      this.ports.pushFocusRetestItem(this.state.diagnostics.focusRetest.contextMenuActions,{
        at:new Date().toISOString(),stage:'renderer-dom-menu-dismissed-by-pdf-left-click',
        activationSeq:Number(activationEvent.activationSeq||0),token:activationEvent.token||null
      },40);
    }
    const result=activationEvent?.token ? await this.activateLeafFromPdfMouseEvent(activationEvent) : null;
    return {ok:!!result?.activated||!!result?.alreadyActive,event:activationEvent,result};
  }

  handleEscapeDismissBridgeEvent(detail) {
    const parsed=validateRendererBridgeEventDetail(RENDERER_BRIDGE_EVENTS.ESCAPE_DISMISS,detail);
    if(!parsed?.ok) return {ok:false,error:parsed?.error||'invalid Escape event'};
    const rec=parsed.detail;
    const seq=(this.state.bridge.escapeDismiss.state?.seq||0)+1;
    this.state.bridge.escapeDismiss.state={seq,last:rec};
    this.ports.closePdfContextOverlay();
    this.ports.pushFocusRetestItem(this.state.diagnostics.focusRetest.contextMenuActions,{
      at:new Date().toISOString(),stage:'renderer-dom-menu-dismissed-by-escape',
      escapeDismissSeq:Number(rec.dismissSeq||0),detail:rec
    },40);
    return {ok:true,event:rec};
  }

  handlePdfContextMenuBridgeEvent(detail) {
    const parsed=validateRendererBridgeEventDetail(RENDERER_BRIDGE_EVENTS.PDF_CONTEXT_MENU,detail);
    if(!parsed?.ok) return {ok:false,error:parsed?.error||'invalid PDF context-menu event'};
    const rec=parsed.detail;
    const seq=(this.state.bridge.contextMenu.state?.seq||0)+1;
    this.state.bridge.contextMenu.state={seq,last:rec};
    if(rec.isPdfContext) this.ports.showPdfContextOverlay(rec);
    return {ok:true,event:rec};
  }

  handleCategoryShortcutBridgeEvent(action) {
    const parsed=validateRendererBridgeEventDetail(RENDERER_BRIDGE_EVENTS.CATEGORY_SHORTCUT,action);
    if(!parsed?.ok) return {ok:false,error:parsed?.error||'invalid category shortcut event'};
    const a=parsed.detail;
    const seq=(this.state.bridge.categoryShortcut.state?.seq||0)+1;
    this.state.bridge.categoryShortcut.state={seq,last:a};
    this.ports.pushFocusRetestItem(this.state.diagnostics.focusRetest.inputEvents,{
      at:new Date().toISOString(),source:'main-process-category-shortcut',action:a
    },80);
    if(a.ok&&a.selectionText) {
      const file=this.ports.resolvePdfFileFromBridgePayload(a);
      if(file) {
        const match=String(a.accelerator||'').match(/Alt\+(\d)$/i);
        const slot=match?Number(match[1]):Number(a.slot||0);
        try {
          const category=this.ports.getShortcutCategory(file,slot);
          if(!category) new Notice(this.i18n.t('mainBridgeShortcut.noCategory',{version:PLUGIN_VERSION,slot}),7000);
          else {
            new Notice(this.i18n.t('mainBridgeShortcut.applied',{version:PLUGIN_VERSION,slot,category:categoryLabel(category),color:normalizeHexColor(category.color)}),5000);
            void this.ports.runSelectionHighlightTest(file,a.selectionText,`category-shortcut:slot-${slot}:${category.id}`,category,a.navigationState||null,a.selectionContext||null);
          }
        } catch(error) {
          new Notice(this.i18n.t('mainBridgeShortcut.configError',{version:PLUGIN_VERSION,error:error instanceof Error?error.message:String(error)}),15000);
        }
      } else new Notice(this.i18n.t('mainBridgeShortcut.pdfUnknown',{version:PLUGIN_VERSION}),8000);
    } else new Notice(this.i18n.t('mainBridgeShortcut.selectionFailed',{version:PLUGIN_VERSION,error:a.error||this.i18n.t('mainBridgeShortcut.noText')}),8000);
    return {ok:true,event:a};
  }

  refreshMainBridgeDiagnosticSnapshot() {
    const transport=this.mainProcessTransport;
    if(!transport?.getCapabilities?.().loaded) return null;
    try {
      const remoteState=transport.getState()||null;
      this.state.diagnostics.mainBridge.state=remoteState;
      this.state.diagnostics.mainBridge.lastSnapshotAt=new Date().toISOString();
      return remoteState;
    } catch(error) {
      this.state.diagnostics.mainBridge.state={installed:false,error:error instanceof Error?error.message:String(error)};
      this.state.diagnostics.mainBridge.lastSnapshotAt=new Date().toISOString();
      return null;
    }
  }

  async ensurePdfRuntimeForLeaf(reason, leaf = null) {
    const seq=Number(this.state.lifecycle.pdfRuntimeRegistration?.seq||0)+1;
    const targetLeaf=leaf||null;
    const rec={at:new Date().toISOString(),seq,reason:String(reason||'unknown'),filePath:null,token:null,ok:false,bridgeResult:null,error:null};
    try {
      const view=targetLeaf?.view||null;
      const isPdf=!!(view&&typeof view.getViewType==='function'&&view.getViewType()===VIEW_TYPE);
      if(!isPdf){rec.error='leaf er ikke en lastet PDFium-view';}
      else {
        rec.filePath=view.file?.path||this.pdfLeafAdapter?.leafFilePath?.(targetLeaf)||null;
        rec.token=String(view.pdfToken||'').trim()||null;
        if(!rec.token) rec.error='PDF wrapper token is not ready yet';
        else {
          const transport=this.mainProcessTransport;
          if(!transport?.getCapabilities?.().loaded) rec.error='main-process transport er ikke klar for PDF runtime registration';
          else {
            rec.bridgeResult=await Promise.resolve(transport.ensurePdfRuntime({token:rec.token,filePath:rec.filePath,source:`renderer-${rec.reason}`,at:rec.at,force:true}));
            rec.ok=rec.bridgeResult?.ok===true;
            if(!rec.ok) rec.error=rec.bridgeResult?.error||'PDF runtime registration fant ingen klar wrapper';
          }
        }
      }
    } catch(error){rec.error=error instanceof Error?error.message:String(error);}
    this.state.lifecycle.pdfRuntimeRegistration={...(this.state.lifecycle.pdfRuntimeRegistration||{}),seq,last:rec};
    return rec;
  }

  async reconcileOpenPdfRuntimes(reason='layout-ready') {
    const lifecycle=this.state.lifecycle.pdfRuntimeRegistration||{seq:0,last:null,reconcileSeq:0,lastReconcile:null};
    const reconcileSeq=Number(lifecycle.reconcileSeq||0)+1;
    const rec={at:new Date().toISOString(),reconcileSeq,reason:String(reason||'layout-ready'),candidateCount:0,registeredCount:0,skippedCount:0,results:[],error:null};
    try {
      const listed=this.pdfLeafAdapter?.listOpenLeaves?.();
      if(!listed?.ok) throw new Error(listed?.error||'Could not enumerate open PDF leaves');
      const leaves=Array.isArray(listed.leaves)?listed.leaves:[];
      rec.candidateCount=leaves.length;
      for(const leaf of leaves){
        const token=String(this.pdfLeafAdapter?.leafPdfToken?.(leaf)||'').trim();
        if(!token){rec.skippedCount+=1;continue;}
        const result=await this.ensurePdfRuntimeForLeaf(reason,leaf);
        rec.results.push(result);
        if(result?.ok) rec.registeredCount+=1;
      }
    } catch(error){rec.error=error instanceof Error?error.message:String(error);}
    this.state.lifecycle.pdfRuntimeRegistration={...(this.state.lifecycle.pdfRuntimeRegistration||{}),reconcileSeq,lastReconcile:rec};
    return rec;
  }

  async syncActivePdfIdentity(reason, leaf = null) {
    const seq = Number(this.state.navigation.activePdfIdentity?.seq || 0) + 1;
    const activeLeafResult = leaf ? null : this.pdfLeafAdapter?.getActiveLeaf?.();
    const targetLeaf = leaf || (activeLeafResult?.ok ? activeLeafResult.leaf : null);
    const rec = {
      at:new Date().toISOString(), seq, reason:String(reason || 'unknown'),
      activeLeafIsPdf:false, filePath:null, token:null, bridgeResult:null, error:null
    };
    try {
      const view = targetLeaf?.view || null;
      const isPdf = !!(view && typeof view.getViewType === 'function' && view.getViewType() === VIEW_TYPE);
      rec.activeLeafIsPdf = isPdf;
      if (isPdf) {
        rec.filePath = view.file?.path || null;
        rec.token = String(view.pdfToken || '').trim() || null;
      }
      const transport = this.mainProcessTransport;
      if (!transport?.getCapabilities?.().loaded) {
        rec.error = 'main-process transport er ikke klar for active-PDF identity';
      } else {
        rec.bridgeResult = transport.setActivePdfIdentity({
          token:rec.token,
          filePath:rec.filePath,
          source:'obsidian-active-leaf',
          at:rec.at
        });
      }
    } catch (error) {
      rec.error = error instanceof Error ? error.message : String(error);
    }
    this.state.navigation.activePdfIdentity = { seq, last:rec };
    return rec;
  }

  installMainProcessUxBridge() {
    try {
      const bridgePath = this.ports.getMainProcessBridgePath();
      const bridgeFile = {
        path: bridgePath,
        existedBefore: false,
        wroteEmbeddedCopy: false,
        existsAfter: false,
        writeError: null
      };
      try { bridgeFile.existedBefore = this.nodeFilesystemAdapter.exists(bridgePath); } catch (_) {}
      try {
        let current = null;
        if (bridgeFile.existedBefore) {
          try { current = this.nodeFilesystemAdapter.readText(bridgePath, 'utf8'); } catch (_) {}
        }
        if (current !== EMBEDDED_MAIN_BRIDGE_SOURCE) {
          this.nodeFilesystemAdapter.ensureDir(path.dirname(bridgePath));
          this.nodeFilesystemAdapter.writeText(bridgePath, EMBEDDED_MAIN_BRIDGE_SOURCE, 'utf8');
          bridgeFile.wroteEmbeddedCopy = true;
        }
      } catch (e) {
        bridgeFile.writeError = e instanceof Error ? e.message : String(e);
      }
      try { bridgeFile.existsAfter = this.nodeFilesystemAdapter.exists(bridgePath); } catch (_) {}
      this.state.diagnostics.mainBridge.fileState = bridgeFile;
      if (!bridgeFile.existsAfter) throw new Error(`Could not create main-process bridge: ${bridgePath}${bridgeFile.writeError ? ` | ${bridgeFile.writeError}` : ''}`);
      const transport = this.mainProcessTransport;
      if (!transport || typeof transport.loadExact !== 'function') throw new Error('main-process transport mangler');
      const bridgeLoad = transport.loadExact(bridgePath);
      if (!bridgeLoad?.ok) throw new Error(bridgeLoad?.error || bridgeLoad?.reason || 'main-process bridge kunne ikke lastes');
      // 0.1.211 one-off pre-release cleanup: builds 0.1.205–0.1.210 used a stale
      // internal PLUGIN_VERSION and therefore generated main-bridge-0.1.205.js.
      // The current versioned bridge has already been written and loaded above.
      try {
        const staleBridgePath=this.obsidianPluginPathsAdapter.resolvePluginPath('main-bridge-0.1.205.js');
        if (staleBridgePath !== bridgePath && this.nodeFilesystemAdapter.exists(staleBridgePath)) {
          this.nodeFilesystemAdapter.removeFile(staleBridgePath);
        }
      } catch (_) {}
      const initial = transport.install();
      try { transport.setIncludeHeaderFooterText(this.settings?.includeHeaderFooterText !== false); } catch (_) {}
      const active = this.pdfLeafAdapter?.getActiveLeaf?.();
      void this.syncActivePdfIdentity('bridge-install', active?.ok ? active.leaf : null);
      this.state.diagnostics.mainBridge.state = initial;
      this.state.diagnostics.mainBridge.lastSnapshotAt = new Date().toISOString();
      const listenerCount = Number(initial?.embeddedKeyboardInputListenerCount || 0);
      new Notice(this.i18n.t('mainBridge.installDone',{version:PLUGIN_VERSION,count:listenerCount,listenerWord:this.i18n.t(listenerCount===1?'mainBridge.listenerOne':'mainBridge.listenerMany')}), 9000);
      console.log(`[PDFium Gate ${PLUGIN_VERSION}] main-process UX bridge installed`, initial);
      this.ports.evaluateRuntimeCompatibilityGate('main-bridge-install', true);
    } catch (error) {
      this.state.diagnostics.mainBridge.state = { installed: false, error: error instanceof Error ? error.message : String(error) };
      console.warn(`[PDFium Gate ${PLUGIN_VERSION}] main-process UX bridge unavailable`, error);
      new Notice(this.i18n.t('mainBridge.installFailed',{version:PLUGIN_VERSION,error:this.state.diagnostics.mainBridge.state.error}), 10000);
      try { this.ports.evaluateRuntimeCompatibilityGate('main-bridge-install-failed', true); } catch (_) {}
    }
  }
}

module.exports = { MainBridgeRoutingFeature };
