class PdfiumGateView extends FileView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.allowNoFile = false;
    this.viewerEl = null;
    this.pdfToken = null;
    this.documentInfoPanelEl = null;
    this.documentInfoButtonEl = null;
    this.mode = 'full';

    // Every Obsidian pop-out has its own Window/Document globals.
    // Bind renderer bridge events to the window that actually owns this view,
    // and bind again if Obsidian migrates the leaf between windows.
    try { this.plugin?.registerRendererBridgeForElement?.(this.contentEl); } catch (_) {}
    try {
      if (typeof this.contentEl?.onWindowMigrated === 'function') {
        this.contentEl.onWindowMigrated(() => {
          try { this.plugin?.registerRendererBridgeForElement?.(this.contentEl); } catch (_) {}
          try { void this.plugin?.ensurePdfRuntimeForLeaf?.('view-window-migrated', this.leaf); } catch (_) {}
          try { void this.plugin?.syncActivePdfIdentity?.('view-window-migrated', this.leaf); } catch (_) {}
        });
      }
    } catch (_) {}
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.file ? this.file.basename : 'PDFium PDF'; }
  getIcon() { return 'file-text'; }
  canAcceptExtension(extension) { return String(extension).toLowerCase() === PDF_EXTENSION; }

  async onLoadFile(file) {
    await super.onLoadFile(file);
    const pendingPage = this.plugin.consumePendingPage(file.path);
    await this.renderFullPage(file, pendingPage || 1);
  }

  async onUnloadFile(file) {
    this.cleanupViewer();
    this.contentEl.empty();
    await super.onUnloadFile(file);
  }

  cleanupViewer() {
    if (this.plugin) this.plugin.state.navigation.linkLocatorAttemptSeq = (this.plugin.state.navigation.linkLocatorAttemptSeq || 0) + 1;
    this.pdfToken = null;
    this.documentInfoPanelEl = null;
    this.documentInfoButtonEl = null;
    if (this.viewerEl) {
      try { this.viewerEl.src = 'about:blank'; } catch (_) {}
      try { this.viewerEl.remove(); } catch (_) {}
      this.viewerEl = null;
    }
  }

  buildShell(file, detailText) {
    this.cleanupViewer();
    const t=(key,params)=>this.plugin.i18n?.t?.(key,params) || key;
    this.contentEl.empty();
    this.contentEl.addClass('pdfium-gate-root');

    // Diagnostic control marker: deliberately impossible to miss.
    // If this banner is not visible, this FileView is not the active PDF viewer.
    const diagnosticsVisible = this.plugin.settings?.diagnosticsEnabled === true;
    const versionBanner = this.contentEl.createDiv({ cls: 'pdfium-gate-version-banner pdfium-gate-diagnostics-chrome' });
    versionBanner.classList.toggle('pdfium-gate-diagnostics-hidden', !diagnosticsVisible);
    const versionMain = versionBanner.createDiv({ cls: 'pdfium-gate-version-main' });
    versionMain.setText(t('pdfView.banner',{version:PLUGIN_VERSION}));
    const versionHint = versionBanner.createDiv({ cls: 'pdfium-gate-version-hint' });
    versionHint.setText(t('pdfView.bannerHint'));
    const diagnosticButton = versionBanner.createEl('button', {
      cls: 'pdfium-gate-focus-diagnostic-button',
      text: t('pdfView.openDiagnostics')
    });
    diagnosticButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.plugin.openFocusRetestDiagnostic();
    });

    const bar = this.contentEl.createDiv({ cls: 'pdfium-gate-bar pdfium-gate-diagnostics-chrome' });
    bar.classList.toggle('pdfium-gate-diagnostics-hidden', !diagnosticsVisible);
    const title = bar.createDiv({ cls: 'pdfium-gate-title' });
    title.setText(t('pdfView.title',{version:PLUGIN_VERSION}));
    const detail = bar.createDiv({ cls: 'pdfium-gate-detail' });
    detail.setText(`${file.path} | ${detailText}`);

    const body = this.contentEl.createDiv({ cls: 'pdfium-gate-body' });
    const stage = body.createDiv({ cls: 'pdfium-gate-stage' });
    const infoButton = stage.createEl('button', {
      cls: 'pdfium-document-info-toggle',
      text: t('documentInfo.button')
    });
    infoButton.setAttribute('aria-expanded', 'false');
    infoButton.setAttribute('aria-label', t('documentInfo.buttonAria'));
    infoButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.plugin?.ports?.toggleDocumentInfoForView?.(this);
    });

    const panel = body.createDiv({ cls: 'pdfium-document-info-panel pdfium-document-info-panel-hidden' });
    panel.setAttribute('aria-label', t('documentInfo.panelAria'));
    this.documentInfoPanelEl = panel;
    this.documentInfoButtonEl = infoButton;
    try { this.plugin?.ports?.renderDocumentInfoForView?.(this); } catch (_) {}

    const loading = stage.createDiv({ cls: 'pdfium-gate-message' });
    loading.setText(t('pdfView.loading'));
    return { stage, loading };
  }

  async renderFullPage(file, page = 1, navigationState = null, linkLocator = null) {
    this.mode = 'full';
    if (file && file.path) this.plugin.state.navigation.lastKnownPdfFilePath = file.path;
    const n = Math.max(1, Math.floor(Number(page) || 1));
    const { stage, loading } = this.buildShell(file, `FULL-PAGE IFRAME test | requested page=${n}`);
    try {
      const url = await this.plugin.getHttpPdfUrl(file, n, navigationState);
      const tokenMatch = String(url || '').match(/\/pdf\/([^/?#]+)\.pdf/i);
      this.pdfToken = tokenMatch ? tokenMatch[1] : null;
      const activeLeafAtRender = this.plugin?.pdfLeafAdapter?.getActiveLeaf?.();
      if (activeLeafAtRender?.ok && activeLeafAtRender.leaf === this.leaf) {
        void this.plugin.syncActivePdfIdentity('view-render', this.leaf);
      }
      const viewDoc = this.contentEl?.doc || this.contentEl?.ownerDocument || document;
      const viewWin = this.contentEl?.win || viewDoc?.defaultView || window;
      try { this.plugin?.registerRendererBridgeWindow?.(viewWin); } catch (_) {}
      const viewer = viewDoc.createElement('iframe');
      viewer.className = 'pdfium-gate-frame';
      viewer.setAttribute('title', this.plugin.i18n?.t?.('pdfView.frameTitle',{name:file.basename}) || `PDF full-page: ${file.basename}`);
      viewer.setAttribute('allow', 'clipboard-read; clipboard-write');
      viewer.src = url;
      viewer.addEventListener('load', () => {
        if (loading.isConnected) loading.remove();
        // Runtime readiness belongs to every loaded PDF leaf, not only the active one.
        // Main Bridge registration is idempotent and instruments physical wrappers
        // without changing active-PDF identity.
        void this.plugin.ensurePdfRuntimeForLeaf('iframe-load', this.leaf).catch(error => {
          console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] PDF runtime registration failed`, error);
        });
        const activeLeafAtLoad = this.plugin?.pdfLeafAdapter?.getActiveLeaf?.();
        if (activeLeafAtLoad?.ok && activeLeafAtLoad.leaf === this.leaf) {
          void this.plugin.syncActivePdfIdentity('iframe-load', this.leaf);
        }
        // Retain hidden-frame/text-model prewarm and additionally precompute
        // glyph data for the active PDF in the hidden PDFium worker.
        // This remains background-only and does not alter keyboard-selection state.
        viewWin.setTimeout(() => {
          const m = String(url || '').match(/\/pdf\/([^/?#]+)\.pdf/i);
          const pdfToken = m ? m[1] : '';
          void this.plugin.prewarmKeyboardTextModel(file, pdfToken).catch(error => {
            console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] keyboard text-model prewarm failed`, error);
          });
          if (linkLocator && pdfToken) {
            void this.plugin.activatePdfLinkLocator(pdfToken, linkLocator).catch(error => {
              console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] link locator failed`, error);
            });
          }
        }, 0);
      }, { once: true });
      stage.appendChild(viewer);
      this.viewerEl = viewer;
      viewWin.setTimeout(() => { if (loading.isConnected) loading.remove(); }, 1200);
    } catch (error) {
      console.error('[PDFium Gate Test] FULL PDF load failed:', error);
      loading.setText(this.plugin.i18n?.t?.('pdfView.loadFailed',{error:error instanceof Error ? error.message : String(error)}) || String(error));
    }
  }
}
