'use strict';

class AnnotatorHostFeature {
  installAnnotatorMessageListener() {
    if (this.state.annotation.messageHandler) return this.state.annotation.messageHandler;
    const handler = event => this.handleAnnotationMessage(event);
    this.state.annotation.messageHandler = handler;
    window.addEventListener('message', handler);
    return handler;
  }

  shutdownAnnotatorHost() {
    if (this.state.http.server) {
      try { this.state.http.server.close(); } catch (_) {}
    }
    this.state.http.server = null;
    this.state.http.port = null;
    this.state.http.tokenMap.clear();

    if (this.state.annotation.messageHandler) {
      try { window.removeEventListener('message', this.state.annotation.messageHandler); } catch (_) {}
      this.state.annotation.messageHandler = null;
    }
    if (this.state.annotation.frame) {
      try { this.state.annotation.frame.remove(); } catch (_) {}
      this.state.annotation.frame = null;
    }
    if (this.state.annotation.frameReady) {
      try { this.state.annotation.frameReady.reject(new Error('Plugin unloaded.')); } catch (_) {}
      this.state.annotation.frameReady = null;
    }
    for (const pending of this.state.annotation.requests.values()) {
      try { pending.reject(new Error('Plugin unloaded.')); } catch (_) {}
    }
    this.state.annotation.requests.clear();
  }

  async ensureHttpServer() {
    if (this.state.http.server && this.state.http.port) return this.state.http.port;
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        if (url.pathname === '/annotator.html') {
          const html = this.getAnnotatorHtml();
          const body = Buffer.from(html, 'utf8');
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': String(body.length),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
          });
          res.end(body);
          return;
        }
        const m = url.pathname.match(/^\/pdf\/([a-f0-9]+)\.pdf$/i);
        if (!m) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }
        const token = m[1];
        const path = this.state.http.tokenMap.get(token);
        if (!path) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Expired PDF token');
          return;
        }
        const file = this.obsidianVaultReadAdapter.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('PDF not found');
          return;
        }
        const data = Buffer.from(await this.obsidianVaultReadAdapter.readBinary(file));
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Length': String(data.length),
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'X-Content-Type-Options': 'nosniff'
        });
        if (req.method === 'HEAD') res.end(); else res.end(data);
      } catch (error) {
        console.error('[PDFium Gate Test] local PDF server error', error);
        try {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Internal error');
        } catch (_) {}
      }
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Kunne ikke finne lokal HTTP-port.');
    }
    this.state.http.server = server;
    this.state.http.port = address.port;
    console.log(`[PDFium Gate Test ${PLUGIN_VERSION}] local PDF server on 127.0.0.1:${this.state.http.port}`);
    return this.state.http.port;
  }

  async getHttpPdfUrl(file, page = 1, navigationState = null) {
    const port = await this.ensureHttpServer();
    const token = crypto.randomBytes(16).toString('hex');
    this.state.http.tokenMap.set(token, file.path);
    const n = Math.max(1, Math.floor(Number(page) || 1));

    // For a context-menu write, the right-click hit-test already
    // captured Chromium's own page-local viewport coordinates before any PDF
    // bytes are changed. Feed those directly back through PDF Open Parameters.
    // Normal opens/deep-links still use the simple #page=N form.
    const z = Number(navigationState?.zoom);
    const x = Number(navigationState?.point?.x);
    const y = Number(navigationState?.point?.y);
    if (Number.isFinite(z) && z > 0 && Number.isFinite(x) && Number.isFinite(y)) {
      const percent = Math.max(1, z * 100);
      return `http://127.0.0.1:${port}/pdf/${token}.pdf#page=${n}&zoom=${percent.toFixed(6)},${x.toFixed(3)},${y.toFixed(3)}`;
    }
    return `http://127.0.0.1:${port}/pdf/${token}.pdf#page=${n}`;
  }


  getAnnotatorHtml() {
    return __PDFIUM_GATE_ANNOTATOR_HTML__;
  }

  handleAnnotationMessage(event) {
    const data = event && event.data;
    if (!data || data.source !== 'pdfium-gate-annotator') return;
    if (data.type === 'ready' && this.state.annotation.frameReady) {
      this.state.annotation.frameReady.resolve();
      this.state.annotation.frameReady = null;
      return;
    }
    if (data.type === 'fatal' && this.state.annotation.frameReady) {
      this.state.annotation.frameReady.reject(new Error(data.error || 'Annotator kunne ikke starte.'));
      this.state.annotation.frameReady = null;
      return;
    }
    if (data.requestId) {
      const pending=this.state.annotation.requests.get(data.requestId);
      if(!pending) return;
      this.state.annotation.requests.delete(data.requestId);
      if(String(data.type||'')!==String(pending.expectedType||'')) {
        pending.reject(new Error(`Annotator svarte med ${String(data.type||'(mangler type)')} på ${String(pending.type||'request')}; forventet ${String(pending.expectedType||'(ukjent)')}.`));
        return;
      }
      const policy=String(pending.responsePolicy||'ok');
      if(policy==='allow-result') { pending.resolve(data); return; }
      if(!data.ok) { pending.reject(new Error(data.error||pending.failureMessage||'Annotator-request feilet.')); return; }
      if(policy==='ok-pdf-buffer'&&!data.pdfBuffer) { pending.reject(new Error(data.error||pending.failureMessage||'Annotator-resultat mangler PDF-buffer.')); return; }
      pending.resolve(data);
    }
  }

  async ensureAnnotationFrame() {
    if (this.state.annotation.frame && this.state.annotation.frame.isConnected && !this.state.annotation.frameReady) return this.state.annotation.frame;
    if (this.state.annotation.frame && this.state.annotation.frame.isConnected && this.state.annotation.frameReady) {
      await this.state.annotation.frameReady.promise;
      return this.state.annotation.frame;
    }
    const port = await this.ensureHttpServer();
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.opacity = '0';
    frame.style.pointerEvents = 'none';
    frame.style.left = '-10000px';
    frame.setAttribute('aria-hidden', 'true');
    frame.src = `http://127.0.0.1:${port}/annotator.html`;
    document.body.appendChild(frame);
    this.state.annotation.frame = frame;
    let resolveReady, rejectReady;
    const promise = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    this.state.annotation.frameReady = { promise, resolve: resolveReady, reject: rejectReady };
    const timeout = window.setTimeout(() => {
      if (this.state.annotation.frameReady) {
        this.state.annotation.frameReady.reject(new Error('Tidsavbrudd ved lasting av annotasjonsmotoren.'));
        this.state.annotation.frameReady = null;
      }
    }, 30000);
    try {
      await promise;
      return frame;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  makeAnnotationTestPath(file) {
    const dot = file.path.toLowerCase().lastIndexOf('.pdf');
    const stem = dot >= 0 ? file.path.slice(0, dot) : file.path;
    let path = `${stem}-annot-test.pdf`;
    let i = 2;
    while (this.obsidianVaultReadAdapter.getAbstractFileByPath(path)) {
      path = `${stem}-annot-test-${i}.pdf`;
      i += 1;
    }
    return path;
  }

  resolveSelectionHighlightWriteTarget(file) {
    const path = String(file?.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!path) return { blocked:true, reason:'PDF-filsti mangler.' };

    const pathSegments = path.split('/').filter(Boolean);
    if (pathSegments.some(segment => segment.toLowerCase() === PDF_BACKUP_DIR_NAME.toLowerCase())) {
      return {
        blocked: true,
        reason: `PDF-er i ${PDF_BACKUP_DIR_NAME} er sikkerhetskopier og kan ikke endres av PDFium Gate. Åpne arbeidsfilen utenfor backupmappen.`
      };
    }

    const fileName = pathSegments[pathSegments.length - 1] || '';
    const folder = vaultDirname(path);
    const backupEnabled = this.settings?.backupOriginalPdf !== false;

    if (!backupEnabled) {
      return {
        blocked: false,
        sourceFile: file,
        destination: path,
        backupEnabled: false,
        backupDirPath: null,
        backupPath: null,
        backupFile: null,
        backupExists: false,
        backupFormat: 'disabled',
        mode: 'modify-live-without-backup'
      };
    }

    const backupDirPath = vaultJoin(folder, PDF_BACKUP_DIR_NAME);
    const backupDirFsPath = this.ports.vaultPathToFs(backupDirPath);
    const backupDirKind = this.nodeFilesystemAdapter.statKind(backupDirFsPath);
    if (backupDirKind !== 'missing' && backupDirKind !== 'directory') {
      return { blocked:true, reason:`Kan ikke lage sikkerhetskopi: ${backupDirPath} finnes, men er ikke en mappe.` };
    }

    const backupPath = vaultJoin(backupDirPath, fileName);
    const backupFsPath = this.ports.vaultPathToFs(backupPath);
    const backupKind = this.nodeFilesystemAdapter.statKind(backupFsPath);
    if (backupKind !== 'missing' && backupKind !== 'file') {
      return { blocked:true, reason:`Kan ikke lage sikkerhetskopi: ${backupPath} finnes, men er ikke en fil.` };
    }

    const backupExists = backupKind === 'file';
    return {
      blocked: false,
      sourceFile: file,
      destination: path,
      backupEnabled: true,
      backupDirPath,
      backupDirFsPath,
      backupPath,
      backupFsPath,
      backupFile: null,
      backupExists,
      backupFormat: backupExists ? 'folder' : 'new-folder',
      mode: backupExists ? 'modify-live-with-existing-backup' : 'create-folder-backup-then-modify-live'
    };
  }

  createPdfBackupFromSource(workTarget) {
    if (!workTarget?.backupEnabled || workTarget.backupExists || !workTarget.backupDirPath || !workTarget.backupPath) return null;
    const backupDirFsPath = workTarget.backupDirFsPath || this.ports.vaultPathToFs(workTarget.backupDirPath);
    const backupFsPath = workTarget.backupFsPath || this.ports.vaultPathToFs(workTarget.backupPath);
    const sourceFsPath = this.ports.vaultPathToFs(workTarget.sourceFile?.path || workTarget.destination);
    this.nodeFilesystemAdapter.ensureDir(backupDirFsPath);
    const existingKind = this.nodeFilesystemAdapter.statKind(backupFsPath);
    if (existingKind === 'file') return { path:workTarget.backupPath, preserved:true };
    if (existingKind !== 'missing') throw new Error(`Kan ikke lage sikkerhetskopi: ${workTarget.backupPath} finnes, men er ikke en fil.`);
    this.nodeFilesystemAdapter.copyFile(sourceFsPath, backupFsPath);
    return { path:workTarget.backupPath, preserved:false };
  }

  async refreshOpenPdfViews(file, page = 1, navigationState = null) {
    const targetPath = String(file?.path || '');
    if (!targetPath) return 0;
    const leavesResult = this.pdfLeafAdapter?.listOpenLeaves?.();
    const leaves = leavesResult?.ok ? leavesResult.leaves : [];
    let refreshed = 0;
    for (const leaf of leaves) {
      const view = leaf?.view;
      if (!view || view?.file?.path !== targetPath || typeof view.renderFullPage !== 'function') continue;
      try {
        const targetPage = navigationState && Number.isFinite(Number(navigationState.page))
          ? Math.max(1, Math.floor(Number(navigationState.page)) + 1)
          : Math.max(1, Math.floor(Number(page) || 1));
        await view.renderFullPage(view.file, targetPage, navigationState);
        refreshed += 1;
      } catch (error) {
        console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] automatic PDF reload failed`, error);
      }
    }
    return refreshed;
  }

  getAnnotatorRequestContract(type) {
    return getAnnotatorMessageContract(type);
  }

  recordAnnotatorTiming(timing, field, value) {
    const target=timing?.target||null;
    const key=timing?.[field]||null;
    if(!target||!key) return;
    target[key]=Math.round(Number(value||0)*10)/10;
  }

  async sendAnnotatorRequest(type, payload = {}, pdfBuffer = null, timing = null) {
    const contract=this.getAnnotatorRequestContract(type);
    if(!contract) throw new Error(`Ukjent annotator-request: ${String(type||'')}`);
    const now=()=>performance.now();
    const frameStarted=now();
    const frame=await this.ensureAnnotationFrame();
    this.recordAnnotatorTiming(timing,'ensureField',now()-frameStarted);

    const requestId=crypto.randomBytes(12).toString('hex');
    const message={source:'pdfium-gate-parent',type:String(type),requestId,...(payload&&typeof payload==='object'?payload:{})};
    const transferList=[];
    if(pdfBuffer!=null) {
      const cloneStarted=now();
      const transferable=pdfBuffer.slice(0);
      this.recordAnnotatorTiming(timing,'cloneField',now()-cloneStarted);
      message.pdfBuffer=transferable;
      transferList.push(transferable);
    }

    let resolvePromise,rejectPromise;
    const resultPromise=new Promise((resolve,reject)=>{resolvePromise=resolve;rejectPromise=reject;});
    const timer=window.setTimeout(()=>{
      this.state.annotation.requests.delete(requestId);
      rejectPromise(new Error(contract.timeoutMessage));
    },contract.timeoutMs);
    const settleResolve=value=>{window.clearTimeout(timer);resolvePromise(value);};
    const settleReject=error=>{window.clearTimeout(timer);rejectPromise(error);};
    this.state.annotation.requests.set(requestId,{
      requestId,type:String(type),expectedType:contract.resultType,responsePolicy:contract.responsePolicy,
      failureMessage:contract.failureMessage,resolve:settleResolve,reject:settleReject
    });

    const roundTripStarted=now();
    try {
      frame.contentWindow.postMessage(message,'*',transferList);
    } catch(error) {
      this.state.annotation.requests.delete(requestId);
      settleReject(error instanceof Error?error:new Error(String(error)));
    }
    try { return await resultPromise; }
    finally { this.recordAnnotatorTiming(timing,'roundTripField',now()-roundTripStarted); }
  }
}

module.exports = { AnnotatorHostFeature };
