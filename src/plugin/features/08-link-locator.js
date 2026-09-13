'use strict';

class LinkLocatorFeature {
  resetLinkLocatorLifecycleState() {
    this.state.navigation.pendingPages.clear();
  }

  async buildPdfSelectionStartLocator(file, pageNumber, range) {
    const out={ok:false,pageIndex:Number(pageNumber)-1,beginIndex:Number(range?.beginIndex),beginOffset:Number(range?.beginOffset),x:null,y:null,itemText:null,error:null};
    let loadingTask=null, pdfDoc=null;
    try {
      if (!(file instanceof TFile)) throw new Error('PDF-fil mangler');
      const pdfBuffer=await this.obsidianVaultReadAdapter.readBinary(file);
      const pdfjsLib=await loadPdfJs();
      if(!pdfjsLib||typeof pdfjsLib.getDocument!=='function') throw new Error('Obsidian loadPdfJs() mangler getDocument');
      loadingTask=pdfjsLib.getDocument({data:new Uint8Array(pdfBuffer.slice(0))});
      pdfDoc=await loadingTask.promise;
      const page=await pdfDoc.getPage(Number(pageNumber));
      const content=await page.getTextContent();
      const items=Array.isArray(content?.items)?content.items:[];
      const itemIndex=Number(range?.beginIndex);
      if(!Number.isInteger(itemIndex)||itemIndex<0||itemIndex>=items.length) throw new Error(`selection start-item ${itemIndex} finnes ikke på side ${pageNumber}`);
      const item=items[itemIndex]||{};
      const str=String(item.str||'');
      const offset=Math.max(0,Math.min(str.length,Number(range?.beginOffset)||0));
      const viewport=page.getViewport({scale:1});
      const tx=pdfJsItemViewportTransform(pdfjsLib,viewport,item);
      if(!tx||!tx.every(Number.isFinite)) throw new Error('PDF.js start-item mangler gyldig transform');
      let ux=Number(tx[0]), uy=Number(tx[1]);
      const ulen=Math.hypot(ux,uy);
      if(!(ulen>1e-6)){ux=1;uy=0;} else {ux/=ulen;uy/=ulen;}
      const scale=Math.max(0.0001,Math.abs(Number(viewport?.scale||1)));
      const width=Math.max(0.5,Math.abs(Number(item.width||0))*scale||ulen*Math.max(1,str.length));
      const style=content?.styles?.[item.fontName]||null;
      const fontHeight=Math.max(1,Math.hypot(Number(tx[2]),Number(tx[3]))||Math.abs(Number(item.height||0))*scale||ulen||1);
      const fractions=pdfJsItemCaretFractions(item,style,fontHeight);
      let along=(fractions[offset]??(offset/Math.max(1,str.length)))*width;
      if(String(item.dir||'').toLowerCase()==='rtl') along=width-along;

      // Locator tx is in PDF.js viewport space (top-origin),
      // while Chromium viewport.convertPageToScreen() expects a PDF page point.
      // Convert only at this boundary; link generation remains unchanged.
      const viewportX=Number(tx[4])+ux*along;
      const viewportY=Number(tx[5])+uy*along;
      if(![viewportX,viewportY].every(Number.isFinite)) throw new Error('ugyldig PDF.js viewport-startpunkt');
      if(typeof viewport?.convertToPdfPoint!=='function') throw new Error('PDF.js viewport.convertToPdfPoint() mangler');
      const pdfPoint=viewport.convertToPdfPoint(viewportX,viewportY);
      const x=Number(Array.isArray(pdfPoint)?pdfPoint[0]:pdfPoint?.x);
      const y=Number(Array.isArray(pdfPoint)?pdfPoint[1]:pdfPoint?.y);
      if(![x,y].every(Number.isFinite)) throw new Error('ugyldig PDF-sidepunkt for locator');

      out.ok=true; out.x=x; out.y=y; out.beginOffset=offset;
      out.itemText=str.slice(0,120);
      out.itemCount=items.length;
      out.coordinateSpace='pdf-page';
      out.viewportPoint={x:viewportX,y:viewportY};
      out.pdfPoint={x,y};
      out.viewport={width:Number(viewport?.width),height:Number(viewport?.height),scale:Number(viewport?.scale),rotation:Number(viewport?.rotation),viewBox:Array.isArray(viewport?.viewBox)?viewport.viewBox.slice(0,4):null};
      return out;
    } catch(e){ out.error=e instanceof Error?e.message:String(e); return out; }
    finally {
      try { if(pdfDoc&&typeof pdfDoc.destroy==='function') await pdfDoc.destroy(); }
      catch(_){ try { if(loadingTask&&typeof loadingTask.destroy==='function') await loadingTask.destroy(); } catch(_){} }
    }
  }

  async activatePdfLinkLocator(pdfToken, locator) {
    const seq=++this.state.navigation.linkLocatorAttemptSeq;
    const rec={at:new Date().toISOString(),seq,token:String(pdfToken||''),locator,attempts:[],ok:false,error:null};
    const delays=[60,120,220,380,650,1050];
    try {
      if(!locator?.ok) throw new Error(locator?.error||'locator er ugyldig');
      for(const delay of delays){
        await new Promise(resolve=>window.setTimeout(resolve,delay));
        if(seq!==this.state.navigation.linkLocatorAttemptSeq){ rec.error='erstattet av nyere locator'; break; }
        const transport=this.mainProcessTransport;
        if(!transport?.getCapabilities?.().loaded){
          rec.attempts.push({delay,ok:false,error:'main-process transport er ikke lastet'});
          continue;
        }
        const result=await transport.showLinkLocator({
          token:String(pdfToken||''),pageIndex:Number(locator.pageIndex),x:Number(locator.x),y:Number(locator.y),
          beginIndex:Number(locator.beginIndex),beginOffset:Number(locator.beginOffset)
        });
        rec.attempts.push({delay,result});
        if(result?.ok){ rec.ok=true; rec.result=result; break; }
      }
      if(!rec.ok&&!rec.error) rec.error='locator ble ikke klar innen retry-vinduet';
    } catch(e){ rec.error=e instanceof Error?e.message:String(e); }
    this.state.navigation.lastLinkLocatorRestore=rec;
    return rec;
  }

  installOpenLinkTextHook() {
    const adapter = this.obsidianOpenLinkHookAdapter;
    if (!adapter || typeof adapter.install !== 'function') {
      console.error('[PDFium Gate] openLinkText adapter is unavailable.');
      return;
    }
    const result = adapter.install(async (linktext, sourcePath, newLeaf, openViewState) => {
      try {
        return !!(await this.tryOpenPdfPageLink(linktext, sourcePath, newLeaf, openViewState));
      } catch (error) {
        console.error('[PDFium Gate] openLinkText hook failed:', error);
        return false;
      }
    });
    if (!result?.ok) {
      console.error('[PDFium Gate] could not install workspace.openLinkText adapter:', result?.error || result?.reason || 'unknown error');
    }
  }

  async tryOpenPdfPageLink(linktext, sourcePath, newLeaf, openViewState) {
    if (typeof linktext !== 'string') return false;
    let rawLink = linktext.trim();
    try { rawLink = decodeURIComponent(rawLink); } catch (_) {}

    const parsed = splitPdfLink(rawLink);
    if (!parsed) return false;
    const page = extractPage(parsed.fragment);
    if (!page) return false;
    const selectionRange = extractSelectionRange(parsed.fragment);

    const linkResolution = this.obsidianLinkResolutionAdapter
      ? this.obsidianLinkResolutionAdapter.resolveFirst(parsed.filePart, sourcePath || '')
      : { ok:false, file:null, reason:'adapter-unavailable', error:'obsidian-link-resolution adapter mangler' };
    if (!linkResolution?.ok) {
      console.warn(`[PDFium Gate ${PLUGIN_VERSION}] Obsidian link-resolution adapter failed`, linkResolution);
      return false;
    }
    const file = linkResolution.file;
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== PDF_EXTENSION) return false;

    let linkLocator=null;
    if(selectionRange){
      linkLocator=await this.buildPdfSelectionStartLocator(file,page,selectionRange);
    }
    this.state.navigation.lastInterceptedLink = `${rawLink} -> ${file.path} -> page ${page}`;
    console.log(`[PDFium Gate ${PLUGIN_VERSION}] intercepted openLinkText:`, {
      linktext: rawLink, sourcePath, newLeaf, page, file: file.path, selectionRange, linkLocator
    });

    // Platform adapter: on a normal click, reuse, reveal and explicitly activate one and only one
    // already-open PDFium leaf for this exact vault path. Never guess when the
    // file is absent or open more than once.  Explicit newLeaf semantics remain
    // unchanged and continue to request a new tab.
    if (!newLeaf && this.pdfLeafAdapter) {
      const reuse = await this.pdfLeafAdapter.revealAndActivateExact(file.path);
      this.state.navigation.lastPdfLeafReuse = {
        at:new Date().toISOString(),
        file:file.path,
        requestedNewLeaf:!!newLeaf,
        ok:!!reuse?.ok,
        revealed:!!reuse?.revealed,
        activated:!!reuse?.activated,
        reason:reuse?.reason || null,
        matchCount:Number(reuse?.matchCount || 0),
        candidateCount:Number(reuse?.candidateCount || 0),
        error:reuse?.error || null
      };
      const reusedLeaf = reuse?.ok ? reuse.leaf : null;
      if (reusedLeaf?.view instanceof PdfiumGateView &&
          reusedLeaf.view.file?.path === file.path &&
          typeof reusedLeaf.view.renderFullPage === 'function') {
        // publish the exact leaf identity synchronously after explicit
        // activation. Do not depend on active-leaf-change event timing before
        // the next keyboard-selection shortcut is routed.
        await this.ports.syncActivePdfIdentity('link-reuse-activate', reusedLeaf);
        await reusedLeaf.view.renderFullPage(file, page, null, linkLocator?.ok ? linkLocator : null);
        this.state.navigation.lastPdfLeafReuse.reused = true;
        return true;
      }
      if (reuse?.ok) {
        // revealLeaf() should have loaded the deferred view. If it did not,
        // Fail closed for reuse and continue through the ordinary open path.
        this.state.navigation.lastPdfLeafReuse.reused = false;
        this.state.navigation.lastPdfLeafReuse.error = this.state.navigation.lastPdfLeafReuse.error || 'Eksakt leaf ble vist, men PDFium-view var ikke klar';
      }
    } else {
      this.state.navigation.lastPdfLeafReuse = {
        at:new Date().toISOString(), file:file.path, requestedNewLeaf:!!newLeaf,
        ok:false, revealed:false, reused:false,
        reason:newLeaf ? 'explicit-new-leaf' : 'adapter-unavailable',
        matchCount:0, candidateCount:0, error:null
      };
    }

    // Platform adapter: preserve the existing Obsidian getLeaf semantics,
    // but keep the API boundary inside pdf-leaf.js.  Adapter failure does not
    // guess an active/first leaf; returning false lets standard Obsidian routing
    // handle the original link instead.
    const openTarget = this.pdfLeafAdapter
      ? this.pdfLeafAdapter.acquireOpenTarget(!!newLeaf)
      : { ok:false, leaf:null, reason:'adapter-unavailable', error:'pdf-leaf adapter mangler' };
    if (!openTarget?.ok || !openTarget.leaf) {
      console.warn(`[PDFium Gate ${PLUGIN_VERSION}] PDF leaf open-target adapter failed`, openTarget);
      return false;
    }
    const leaf = openTarget.leaf;

    // Tell onLoadFile about the requested page before opening, then explicitly
    // render full-page after openFile as a second guarantee. The manual full-page
    // command has already proven that renderFullPage(file, page) works.
    this.queuePendingPage(file.path, page);
    await leaf.openFile(file, { active: true });

    if (leaf.view && typeof leaf.view.getViewType === 'function' &&
        leaf.view.getViewType() === VIEW_TYPE) {
      this.consumePendingPage(file.path);
      await leaf.view.renderFullPage(file, page, null, linkLocator?.ok ? linkLocator : null);
      return true;
    }

    // If Obsidian chose a different leaf/view despite the .pdf override, do not
    // silently swallow the link. Let normal routing handle it.
    this.state.navigation.pendingPages.delete(file.path);
    return false;
  }

  queuePendingPage(path, page) {
    const n = Math.max(1, Math.floor(Number(page) || 1));
    this.state.navigation.pendingPages.set(path, n);
  }

  consumePendingPage(path) {
    const page = this.state.navigation.pendingPages.get(path) || null;
    this.state.navigation.pendingPages.delete(path);
    return page;
  }

  resolvePdfFileFromBridgePayload(payload) {
    const token = String(payload?.token || payload?.pdfToken || '').trim() || null;
    const explicitPath = String(payload?.filePath || '').trim() || null;

    if (token) {
      const vaultPath = this.state.http.tokenMap.get(token) || null;
      const file = vaultPath ? this.obsidianVaultReadAdapter.getAbstractFileByPath(vaultPath) : null;
      if (file instanceof TFile) {
        if (explicitPath && explicitPath !== file.path) {
          this.state.navigation.lastResolvedPdfIdentity = { at:new Date().toISOString(), method:'token-path-conflict', token, explicitPath, tokenPath:file.path, file:null };
          return null;
        }
        this.state.navigation.lastKnownPdfFilePath = file.path;
        this.state.navigation.lastResolvedPdfIdentity = { at:new Date().toISOString(), method:'http-token', token, file:file.path };
        return file;
      }
    }

    if (explicitPath) {
      const file = this.obsidianVaultReadAdapter.getAbstractFileByPath(explicitPath);
      if (file instanceof TFile) {
        this.state.navigation.lastKnownPdfFilePath = file.path;
        this.state.navigation.lastResolvedPdfIdentity = { at:new Date().toISOString(), method:'explicit-file-path', token, file:file.path };
        return file;
      }
    }

    this.state.navigation.lastResolvedPdfIdentity = { at:new Date().toISOString(), method:'failed-closed', token, explicitPath, file:null };
    return null;
  }

  getCommandTargetPdfFile() {
    const view = this.getActiveReader();
    if (view?.file instanceof TFile) {
      this.state.navigation.lastKnownPdfFilePath = view.file.path;
      return view.file;
    }
    if (this.state.navigation.lastKnownPdfFilePath) {
      const candidate = this.obsidianVaultReadAdapter.getAbstractFileByPath(this.state.navigation.lastKnownPdfFilePath);
      if (candidate instanceof TFile) return candidate;
    }
    return null;
  }

  getActiveReader() {
    const activeLeafResult = this.pdfLeafAdapter?.getActiveLeaf?.();
    const leaf = activeLeafResult?.ok ? activeLeafResult.leaf : null;
    if (leaf && leaf.view && typeof leaf.view.getViewType === 'function' && leaf.view.getViewType() === VIEW_TYPE) {
      if (leaf.view.file?.path) this.state.navigation.lastKnownPdfFilePath = leaf.view.file.path;
      return leaf.view;
    }

    const leavesResult = this.pdfLeafAdapter?.listOpenLeaves?.();
    const leaves = leavesResult?.ok ? leavesResult.leaves : [];
    if (this.state.navigation.lastKnownPdfFilePath) {
      const match = leaves.find(l => l?.view?.file?.path === this.state.navigation.lastKnownPdfFilePath);
      if (match?.view) return match.view;
    }
    if (leaves.length === 1 && leaves[0]?.view) {
      if (leaves[0].view.file?.path) this.state.navigation.lastKnownPdfFilePath = leaves[0].view.file.path;
      return leaves[0].view;
    }
    return null;
  }
}

module.exports = { LinkLocatorFeature };
