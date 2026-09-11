'use strict';

class DiagnosticsFeature {
  recordNativeSelectionIdentityDiagnostic(value) {
    this.state.navigation.lastNativeSelectionIdentityDiagnostic = value ? deepClone(value) : null;
    return this.state.navigation.lastNativeSelectionIdentityDiagnostic;
  }

  disposeDiagnosticsRuntime() {
    if (this.state.diagnostics.focusRetestPollTimer) {
      try { window.clearInterval(this.state.diagnostics.focusRetestPollTimer); } catch (_) {}
      this.state.diagnostics.focusRetestPollTimer = null;
    }
    for (const { wc, focusHandler, blurHandler, inputHandler, contextMenuHandler } of this.state.diagnostics.focusRetestListeners.values()) {
      try {
        if (wc && typeof wc.removeListener === 'function') {
          wc.removeListener('focus', focusHandler);
          wc.removeListener('blur', blurHandler);
          wc.removeListener('before-input-event', inputHandler);
          wc.removeListener('context-menu', contextMenuHandler);
        } else if (wc && typeof wc.off === 'function') {
          wc.off('focus', focusHandler);
          wc.off('blur', blurHandler);
          wc.off('before-input-event', inputHandler);
          wc.off('context-menu', contextMenuHandler);
        }
      } catch (_) {}
    }
    this.state.diagnostics.focusRetestListeners.clear();
    this.state.diagnostics.focusRetest.listenerCount = 0;
    if (this.state.diagnostics.focusRetestCreatedSubscription?.dispose) {
      try { this.state.diagnostics.focusRetestCreatedSubscription.dispose(); } catch (_) {}
    }
    this.state.diagnostics.focusRetestCreatedSubscription = null;
  }

  pushFocusRetestItem(array, item, maxItems = 80) {
    if (!Array.isArray(array)) return;
    array.push(item);
    if (array.length > maxItems) array.splice(0, array.length - maxItems);
  }

  safeDescribeFocusFrame(webContents) {
    try {
      const adapter = this.electronFocusDiagnosticsAdapter;
      if (!adapter || typeof adapter.describeFocusedFrame !== 'function') return { error:'Electron focus-diagnostics adapter mangler describeFocusedFrame()' };
      return adapter.describeFocusedFrame(webContents);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  safeDescribeFocusWebContents(wc, focused = null) {
    if (!wc) return null;
    const out = {};
    try { out.id = wc.id; } catch (_) {}
    try { if (typeof wc.getType === 'function') out.type = wc.getType(); } catch (_) {}
    try { if (typeof wc.getURL === 'function') out.url = wc.getURL(); } catch (_) {}
    try { if (typeof wc.getTitle === 'function') out.title = wc.getTitle(); } catch (_) {}
    try { if (typeof wc.isDestroyed === 'function') out.destroyed = wc.isDestroyed(); } catch (_) {}
    try {
      if (focused) {
        const id=Number(wc?.id), focusedId=Number(focused?.id);
        out.isFocusedWebContents = Number.isFinite(id) && Number.isFinite(focusedId) ? id === focusedId : false;
      }
    } catch (_) {}
    try { out.focusedFrame = this.safeDescribeFocusFrame(wc); } catch (_) {}
    return out;
  }

  snapshotFocusRetestWebContents() {
    const adapter = this.electronFocusDiagnosticsAdapter;
    if (!adapter) return [];
    let focused = null;
    try { focused = adapter.getFocusedWebContents(); } catch (_) {}
    try {
      return (adapter.getAllWebContents() || []).map(wc => this.safeDescribeFocusWebContents(wc, focused));
    } catch (error) {
      return [{ error: error instanceof Error ? error.message : String(error) }];
    }
  }

  recordFocusRetestFocus(wc, eventName, reason) {
    const state = this.state.diagnostics.focusRetest;
    if (!state) return;
    let focused = null;
    try { focused = this.electronFocusDiagnosticsAdapter?.getFocusedWebContents?.() || null; } catch (_) {}
    this.pushFocusRetestItem(state.focusHistory, {
      at: new Date().toISOString(),
      source: eventName,
      reason,
      webContents: this.safeDescribeFocusWebContents(wc, focused)
    }, 80);
  }

  attachFocusRetestListeners(wc, reason = 'existing') {
    if (!wc || typeof wc.on !== 'function') return false;
    let id = null;
    try { id = wc.id; } catch (_) {}
    if (id === null || id === undefined || this.state.diagnostics.focusRetestListeners.has(id)) return false;

    const focusHandler = () => this.recordFocusRetestFocus(wc, 'focus-event', reason);
    const blurHandler = () => this.recordFocusRetestFocus(wc, 'blur-event', reason);
    const inputHandler = (event, input) => {
      try {
        if (!input || input.type !== 'keyDown' || input.isAutoRepeat) return;
        const forwardedInput = {
          type: input.type || null,
          key: input.key || null,
          code: input.code || null,
          control: !!input.control,
          meta: !!input.meta,
          shift: !!input.shift,
          alt: !!input.alt,
          isAutoRepeat: !!input.isAutoRepeat,
          modifiers: Array.isArray(input.modifiers) ? [...input.modifiers] : []
        };
        this.pushFocusRetestItem(this.state.diagnostics.focusRetest.inputEvents, {
          at: new Date().toISOString(),
          reason,
          webContents: this.safeDescribeFocusWebContents(wc),
          input: forwardedInput
        }, 80);
      } catch (error) {
        console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] focus retest input log failed`, error);
      }
    };

    const contextMenuHandler = (event, params) => {
      try {
        const selectionText = params && typeof params.selectionText === 'string' ? params.selectionText : '';
        const selected = selectionText.trim();
        const selectionRect = params && params.selectionRect ? {
          x: params.selectionRect.x,
          y: params.selectionRect.y,
          width: params.selectionRect.width,
          height: params.selectionRect.height
        } : null;
        const webContents = this.safeDescribeFocusWebContents(wc);
        const pageURL = params?.pageURL || '';
        const frameURL = params?.frameURL || '';
        const isPdfContext = !!(
          (typeof pageURL === 'string' && pageURL.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/')) ||
          (typeof frameURL === 'string' && /^http:\/\/127\.0\.0\.1:\d+\/pdf\/.+\.pdf(?:#.*)?$/i.test(frameURL)) ||
          params?.mediaType === 'plugin'
        );

        // Diagnostics observe the context-menu event only. Main Bridge is the
        // sole production owner of PDF context-menu suppression and publication.
        const defaultMenuSuppressed = false;

        const view = this.ports.getActiveReader();
        const activeFile = view && view.file instanceof TFile ? view.file : null;

        this.pushFocusRetestItem(this.state.diagnostics.focusRetest.contextMenuEvents, {
          at: new Date().toISOString(),
          reason,
          webContents,
          selectionText,
          selectionLength: selectionText.length,
          selectionRect,
          pageURL: pageURL || null,
          frameURL: frameURL || null,
          mediaType: params?.mediaType || null,
          menuSourceType: params?.menuSourceType || null,
          isPdfContext,
          activePdf: activeFile ? activeFile.path : null,
          defaultMenuSuppressed,
          editFlags: params?.editFlags ? {
            canCopy: !!params.editFlags.canCopy,
            canCut: !!params.editFlags.canCut,
            canPaste: !!params.editFlags.canPaste,
            canSelectAll: !!params.editFlags.canSelectAll
          } : null
        }, 40);

        return;
      } catch (error) {
        this.pushFocusRetestItem(this.state.diagnostics.focusRetest.contextMenuActions, {
          at: new Date().toISOString(), stage: 'context-menu-error',
          error: error instanceof Error ? error.message : String(error)
        }, 40);
        console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] native context-menu gate failed`, error);
      }
    };

    try {
      wc.on('focus', focusHandler);
      wc.on('blur', blurHandler);
      wc.on('before-input-event', inputHandler);
      if (typeof wc.prependListener === 'function') wc.prependListener('context-menu', contextMenuHandler);
      else wc.on('context-menu', contextMenuHandler);
      this.state.diagnostics.focusRetestListeners.set(id, { wc, focusHandler, blurHandler, inputHandler, contextMenuHandler, reason });
      this.state.diagnostics.focusRetest.listenerCount = this.state.diagnostics.focusRetestListeners.size;
      return true;
    } catch (error) {
      console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] focus retest could not attach to WebContents ${id}`, error);
      return false;
    }
  }

  pollFocusRetest() {
    const state = this.state.diagnostics.focusRetest;
    const adapter = this.electronFocusDiagnosticsAdapter;
    if (!state || !adapter) return;
    try {
      const focused = adapter.getFocusedWebContents();
      const desc = this.safeDescribeFocusWebContents(focused, focused);
      const signature = desc ? `${desc.id ?? '?'}|${desc.type || ''}|${desc.url || ''}` : 'none';
      if (signature !== this.state.diagnostics.focusRetestLastSignature) {
        this.state.diagnostics.focusRetestLastSignature = signature;
        this.pushFocusRetestItem(state.focusHistory, {
          at: new Date().toISOString(),
          source: 'poll-change',
          webContents: desc
        }, 80);
      }
    } catch (_) {}
  }

  installFocusRetestDiagnostics() {
    const state = this.state.diagnostics.focusRetest;
    try {
      const adapter = this.electronFocusDiagnosticsAdapter;
      if (!adapter) throw new Error('Electron fokusdiagnostikk-adapter mangler');
      const boundary = adapter.resolveBoundary();
      if (!boundary?.ok) throw new Error(boundary?.error || boundary?.reason || 'Electron fokusdiagnostikk er utilgjengelig');

      const existing = adapter.getAllWebContents() || [];
      state.initialExistingCount = existing.length;
      for (const wc of existing) this.attachFocusRetestListeners(wc, 'existing-at-install');

      this.state.diagnostics.focusRetestCreatedSubscription = adapter.onWebContentsCreated(wc => {
        try {
          this.attachFocusRetestListeners(wc, 'web-contents-created');
          this.recordFocusRetestFocus(wc, 'web-contents-created', 'main-app');
        } catch (error) {
          console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] focus retest web-contents-created failed`, error);
        }
      });

      state.installed = true;
      state.method = 'Main Bridge context capture + renderer DOM category menu + canonical before-input-event keyboard routing';
      state.installError = null;
      state.listenerCount = this.state.diagnostics.focusRetestListeners.size;

      // Focus/input history listeners are diagnostics-only. The 100 ms
      // focus-history poll runs only while diagnostics are enabled.
      this.syncFocusRetestDiagnosticsPolling();
      console.log(`[PDFium Gate Test ${PLUGIN_VERSION}] focus retest diagnostics installed`, {
        initialExistingCount: state.initialExistingCount,
        listenerCount: state.listenerCount
      });
    } catch (error) {
      state.installed = false;
      state.installError = error instanceof Error ? error.message : String(error);
      console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] focus retest diagnostics unavailable`, error);
    }
  }

  syncFocusRetestDiagnosticsPolling() {
    const shouldPoll = this.settings?.diagnosticsEnabled === true;
    if (shouldPoll) {
      if (!this.state.diagnostics.focusRetestPollTimer) {
        this.pollFocusRetest();
        this.state.diagnostics.focusRetestPollTimer = window.setInterval(() => this.pollFocusRetest(), 100);
      }
      return true;
    }
    if (this.state.diagnostics.focusRetestPollTimer) {
      try { window.clearInterval(this.state.diagnostics.focusRetestPollTimer); } catch (_) {}
      this.state.diagnostics.focusRetestPollTimer = null;
    }
    return false;
  }

  openFocusRetestDiagnostic() {
    const state = this.state.diagnostics.focusRetest || {};
    let focused = null;
    try { focused = this.electronFocusDiagnosticsAdapter?.getFocusedWebContents?.() || null; } catch (_) {}

    let activeElement = null;
    try {
      const el = document.activeElement;
      activeElement = el ? {
        tagName: el.tagName || null,
        id: el.id || null,
        className: typeof el.className === 'string' ? el.className : null
      } : null;
    } catch (_) {}

    const view = this.ports.getActiveReader();
    let clipboardText = '';
    try { clipboardText = clipboardTextAdapter.readText() || ''; } catch (_) {}

    // RuntimeDriver relationship history is exposed only through the explicit
    // platform-capability diagnostic; normal Main Bridge state stays operational.
    let chromiumPdfRuntime = null;
    let chromiumPdfRuntimeDiagnosticError = null;
    try {
      const caps = this.mainProcessTransport?.getPlatformCapabilities?.() || null;
      chromiumPdfRuntime = caps?.chromiumPdfRuntime || null;
    } catch (error) {
      chromiumPdfRuntimeDiagnosticError = error instanceof Error ? error.message : String(error);
    }

    const diagnostic = {
      version: PLUGIN_VERSION,
      diagnosticsEnabled: !!this.settings?.diagnosticsEnabled,
      purpose: 'Canonical runtime diagnostic: Obsidian 1.13.7 + Electron 43 + embedded PDF frame',
      includeHeaderFooterText: this.settings?.includeHeaderFooterText !== false,
      activeCustomPdfView: !!view,
      activePdf: view?.file?.path || null,
      installed: !!state.installed,
      method: state.method || null,
      installError: state.installError || null,
      listenerCount: this.state.diagnostics.focusRetestListeners?.size || 0,
      currentFocusedWebContents: this.safeDescribeFocusWebContents(focused, focused),
      webContentsSnapshot: this.snapshotFocusRetestWebContents(),
      documentActiveElement: activeElement,
      focusHistory: Array.isArray(state.focusHistory) ? [...state.focusHistory] : [],
      inputEvents: Array.isArray(state.inputEvents) ? [...state.inputEvents] : [],
      contextMenuEvents: Array.isArray(state.contextMenuEvents) ? [...state.contextMenuEvents] : [],
      contextMenuActions: Array.isArray(state.contextMenuActions) ? [...state.contextMenuActions] : [],
      mainProcessBridge: this.ports.refreshMainBridgeDiagnosticSnapshot() || this.state.diagnostics.mainBridge.state || null,
      mainProcessBridgeFile: this.state.diagnostics.mainBridge.fileState || null,
      chromiumPdfRuntime,
      chromiumPdfRuntimeDiagnosticError,
      runtimeCompatibility: this.state.diagnostics.runtimeCompatibility || null,
      obsidianCommandBridge: this.state.bridge.command.state || null,
      pdfKeyboardSelectionState: this.state.bridge.keyboardSelection.state || null,
      pdfKeyboardCopyBridgeState: this.state.bridge.keyboardCopy.state || null,
      pdfNativeCopyBridgeState: this.state.bridge.nativeCopy.state || null,
      keyboardTextModelPrewarmState: this.state.annotation.keyboardTextModelPrewarm || null,
      lastContextNavigationState: this.state.navigation.lastContextNavigationState || null,
      lastEffectiveCategoryConfig: this.state.context.lastEffectiveCategoryConfig || null,
      lastKnownPdfFilePath: this.state.navigation.lastKnownPdfFilePath || null,
      lastResolvedPdfIdentity: this.state.navigation.lastResolvedPdfIdentity || null,
      lastPdfLeafReuse: this.state.navigation.lastPdfLeafReuse || null,
      lastLinkLocatorRestore: this.state.navigation.lastLinkLocatorRestore || null,
      lastSelectionLinkDiagnostic: this.state.navigation.lastSelectionLinkDiagnostic || null,
      lastNativeSelectionIdentityDiagnostic: this.state.navigation.lastNativeSelectionIdentityDiagnostic || null,
      lastExistingCategoryCopyArtifactFilter: this.state.navigation.lastExistingCategoryCopyArtifactFilter || null,
      lastContextSelectionText: Array.isArray(state.contextMenuEvents) && state.contextMenuEvents.length ? (state.contextMenuEvents[state.contextMenuEvents.length - 1].selectionText || '') : '',
      contextAutoHighlightInFlight: !!this.state.context.autoHighlightInFlight,
      lastContextAutoHighlight: this.state.context.lastAutoHighlight || null,
      clipboardText,
      clipboardLength: clipboardText.length,
      testReminder: 'Right-click selected PDF text should show the PDFium Gate category menu; Esc should close the overlay once.'
    };

    new FocusRetestDiagnosticModal(this.app, this, diagnostic).open();
  }

  getPlatformCapabilitiesModulePath() {
    return this.obsidianPluginPathsAdapter.resolvePluginPath('platform', 'capabilities.js');
  }

  buildRemainingPlatformAccessInventory() {
    // Current-state architecture inventory only. Historical migration bookkeeping
    // belongs in source control, not in runtime diagnostics.
    return deepClone({
      inventoryVersion: '1.0',
      runtimeContract: 'Obsidian 1.13.7 + Electron 43.x + embedded PDF frame',
      productionDirectCandidates: [],
      diagnosticsDirectCandidates: [
        {
          symbol: 'buildPlatformCapabilityReport()',
          directAccess: 'this.app?.version + this.manifest.{id,minAppVersion}',
          role: 'diagnostic metadata only',
          classification: 'diagnostics-only-plugin-metadata-access'
        }
      ],
      compositionRootBindings: [
        'this.app.workspace -> pdf-leaf adapter',
        'this.app.commands -> obsidian-command-execution adapter',
        'this.app.workspace -> obsidian-open-link-hook adapter',
        'this.app.metadataCache -> obsidian-link-resolution adapter',
        'this.app.fileManager -> obsidian-markdown-link adapter',
        'this.app.viewRegistry -> obsidian-view-registry adapter',
        'this.app.workspace -> obsidian-workspace-lifecycle adapter',
        'this.app.vault -> obsidian-vault-read adapter',
        'this.app.vault -> obsidian-vault-write adapter',
        'this.app.vault + manifest -> obsidian-plugin-paths adapter',
        "renderer require('electron')/require('fs') -> adapter dependency injection",
        'electron-remote-require adapter -> MainProcessTransport composition binding'
      ],
      mainBridgeBoundary: {
        classification: 'intentional-main-process-platform-boundary',
        pdfHosting: 'embedded-frame-only',
        rendererTransport: 'MainProcessTransport -> electron.remote.require(exactPath)',
        note: 'electron.remote.require is transport only; PDF identity/hosting never uses remote WebContents.'
      },
      status: 'no-unisolated-production-platform-access-detected'
    });
  }

  buildRuntimeCompatibilityFacts() {
    let bridgeState = this.state.diagnostics.mainBridge.state || null;
    const transport = this.mainProcessTransport;
    try {
      if (transport?.getCapabilities?.().loaded) {
        bridgeState = transport.getState() || bridgeState;
      }
    } catch (_) {}

    let mainPlatform = null;
    try {
      if (transport?.getCapabilities?.().loaded) {
        mainPlatform = transport.getPlatformCapabilities();
      }
    } catch (_) {}

    let remoteRequireAvailable = null;
    try {
      const caps = transport?.getCapabilities?.();
      if (typeof caps?.loadBoundaryAvailable === 'boolean') remoteRequireAvailable = caps.loadBoundaryAvailable;
    } catch (_) {}

    return {
      obsidianVersion: OBSIDIAN_RUNTIME_VERSION || this.app?.version || null,
      electronVersion: typeof process !== 'undefined' ? (process.versions?.electron || null) : null,
      chromeVersion: typeof process !== 'undefined' ? (process.versions?.chrome || null) : null,
      nodeVersion: typeof process !== 'undefined' ? (process.versions?.node || null) : null,
      hostingMode: mainPlatform?.runtimeContract?.pdfHostingMode || null,
      mainBridgeInstalled: typeof bridgeState?.installed === 'boolean' ? bridgeState.installed : null,
      rendererMainBridgeRequireAvailable: remoteRequireAvailable,
      mainCapabilities: mainPlatform?.capabilities || null,
      mainPlatformCapabilities: mainPlatform || null,
      bridgeState: bridgeState ? {
        installed: bridgeState.installed === true,
        installError: bridgeState.installError || bridgeState.error || null
      } : null
    };
  }

  evaluateRuntimeCompatibilityGate(source = 'manual', showNotice = false) {
    const facts = this.buildRuntimeCompatibilityFacts();
    const result = evaluateRuntimeCompatibility(facts);
    const rec = {
      ...result,
      source:String(source || 'manual'),
      pluginVersion:PLUGIN_VERSION,
      facts:{
        obsidianVersion:facts.obsidianVersion,
        electronVersion:facts.electronVersion,
        chromeVersion:facts.chromeVersion,
        nodeVersion:facts.nodeVersion,
        hostingMode:facts.hostingMode,
        mainBridgeInstalled:facts.mainBridgeInstalled,
        rendererMainBridgeRequireAvailable:facts.rendererMainBridgeRequireAvailable
      }
    };
    this.state.diagnostics.runtimeCompatibility = rec;

    const text = compatibilityNoticeText(rec, PLUGIN_VERSION);
    if (showNotice && rec.severity !== 'ok') {
      const duration = rec.severity === 'error' ? 15000 : 9000;
      new Notice(text, duration);
    }
    const log = rec.severity === 'error' ? console.warn : console.log;
    log(`[PDFium Gate Test ${PLUGIN_VERSION}] runtime compatibility gate`, rec);
    return rec;
  }

  copyRuntimeCompatibilityStatus() {
    try {
      const result = this.evaluateRuntimeCompatibilityGate('manual-copy', false);
      clipboardTextAdapter.writeText(JSON.stringify(result, null, 2));
      new Notice(compatibilityNoticeText(result, PLUGIN_VERSION), result.severity === 'error' ? 12000 : 7000);
      return result;
    } catch (error) {
      new Notice(this.i18n.t('diagnostics.runtimeStatusFailed',{version:PLUGIN_VERSION,error:error instanceof Error ? error.message : String(error)}), 10000);
      return null;
    }
  }

  async buildPlatformCapabilityReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      pluginVersion: PLUGIN_VERSION,
      contractVersion: PLATFORM_CONTRACT_VERSION,
      architecture: {
        premise: 'PDFium Gate core depends on internal contracts; Obsidian/Electron access is isolated behind explicit adapters.',
        runtimeContract: 'Obsidian 1.13.7 + Electron 43.x + embedded-frame only',
        pdfIdentity: 'token logical identity; processId + routingId physical frame identity; ambiguity fails closed',
        runtimeDriver: 'verified wrapper -> nearest capability-verified Chromium pdf-viewer ancestor',
        rendererMainTransport: 'MainProcessTransport -> electron.remote.require(exactPath)'
      },
      remainingDirectPlatformAccess: this.buildRemainingPlatformAccessInventory(),
      platformModule: {
        path: null,
        exists: false,
        loadOk: false,
        error: null
      },
      environment: null,
      renderer: null,
      mainBridge: null,
      runtimeCompatibility: this.state.diagnostics.runtimeCompatibility || null,
      currentProductionAccess: {
        bridgePathDiscovery: 'obsidian-plugin-paths adapter resolvePluginPath(main-bridge-<version>.js)',
        bridgeLoadBoundary: 'main-process-transport loadExact(exactPath) -> electron-remote-require implementation',
        note: 'Renderer production calls reach Main Bridge only through MainProcessTransport; the current electron.remote.require implementation is a transport boundary, not PDF hosting.'
      }
    };

    try {
      const modulePath = this.getPlatformCapabilitiesModulePath();
      report.platformModule.path = modulePath;
      try { report.platformModule.exists = this.nodeFilesystemAdapter.exists(modulePath); } catch (_) {}
      if (!report.platformModule.exists) throw new Error(`platform capability module finnes ikke: ${modulePath}`);
      const platformCapabilities = require(modulePath);
      report.platformModule.loadOk = true;
      report.environment = typeof platformCapabilities?.detectEnvironment === 'function'
        ? platformCapabilities.detectEnvironment({
            pluginId:this.manifest.id,
            pluginVersion:PLUGIN_VERSION,
            minAppVersion:this.manifest.minAppVersion || null,
            obsidianVersion:this.app?.version || null
          })
        : { error:'detectEnvironment() mangler' };
      report.renderer = typeof platformCapabilities?.detectRendererCapabilities === 'function'
        ? platformCapabilities.detectRendererCapabilities()
        : { error:'detectRendererCapabilities() mangler' };
    } catch (error) {
      report.platformModule.error = error instanceof Error ? error.message : String(error);
    }

    try {
      const transport = this.mainProcessTransport;
      const transportCaps = transport?.getCapabilities?.() || null;
      report.mainProcessTransport = transportCaps;
      report.mainBridge = {
        available: transportCaps?.loaded === true,
        api: transportCaps?.api?.methods || null,
        capabilities: null,
        error: null
      };
      if (transportCaps?.loaded) {
        try { report.mainBridge.capabilities = transport.getPlatformCapabilities(); }
        catch (error) { report.mainBridge.error = error instanceof Error ? error.message : String(error); }
      }
    } catch (error) {
      report.mainProcessTransport = null;
      report.mainBridge = { available:false, api:null, capabilities:null, error:error instanceof Error ? error.message : String(error) };
    }

    try { report.runtimeCompatibility = this.evaluateRuntimeCompatibilityGate('platform-report', false); }
    catch (error) { report.runtimeCompatibility = { status:'error', error:error instanceof Error ? error.message : String(error) }; }
    return deepClone(report);
  }

  async copyPlatformCapabilityReport() {
    try {
      const report = await this.buildPlatformCapabilityReport();
      this.state.diagnostics.lastPlatformCapabilityReport = report;
      clipboardTextAdapter.writeText(JSON.stringify(report, null, 2));
      const transport = report?.mainProcessTransport?.loadBoundaryAvailable === true ? 'main-transport=JA' : 'main-transport=NEI';
      const main = report?.mainBridge?.capabilities ? 'main-capabilities=JA' : 'main-capabilities=NEI';
      const remaining = Number(report?.remainingDirectPlatformAccess?.summary?.productionDirectCandidates ?? -1);
      new Notice(this.i18n.t('diagnostics.platformCopied',{version:PLUGIN_VERSION,transport,main,remaining}), 9000);
      console.log(`[PDFium Gate Test ${PLUGIN_VERSION}] platform capability report`, report);
    } catch (error) {
      new Notice(this.i18n.t('diagnostics.platformFailed',{version:PLUGIN_VERSION,error:error instanceof Error ? error.message : String(error)}), 12000);
    }
  }

  addDiagnosticCommand(command) {
    const source = command && typeof command === 'object' ? command : {};
    const callback = typeof source.callback === 'function' ? source.callback : null;
    const originalCheck = typeof source.checkCallback === 'function' ? source.checkCallback : null;
    const wrapped = { ...source };
    delete wrapped.callback;
    wrapped.checkCallback = checking => {
      if (this.settings?.diagnosticsEnabled !== true) return false;
      if (originalCheck) return originalCheck(checking);
      if (!checking && callback) callback();
      return true;
    };
    return this.obsidianPluginRegistrationAdapter.addCommand(wrapped);
  }

  refreshDiagnosticsVisibility() {
    const visible = this.settings?.diagnosticsEnabled === true;
    try {
      for (const el of document.querySelectorAll('.pdfium-gate-diagnostics-chrome')) {
        el.classList.toggle('pdfium-gate-diagnostics-hidden', !visible);
      }
    } catch (error) {
      console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] kunne ikke oppdatere diagnostikkvisning`, error);
    }
    this.syncFocusRetestDiagnosticsPolling();
  }

  async toggleDiagnostics() {
    this.settings = this.settings || { diagnosticsEnabled: false };
    this.settings.diagnosticsEnabled = !this.settings.diagnosticsEnabled;
    try { await this.obsidianPluginDataAdapter.saveData(this.settings); } catch (error) {
      console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] kunne ikke lagre diagnostikkinnstilling`, error);
    }
    this.refreshDiagnosticsVisibility();
    new Notice(this.i18n.t('diagnostics.toggleNotice',{version:PLUGIN_VERSION,state:this.settings.diagnosticsEnabled ? this.i18n.t('diagnostics.stateOn') : this.i18n.t('diagnostics.stateOff')}), 5000);
  }
}

module.exports = { DiagnosticsFeature };
