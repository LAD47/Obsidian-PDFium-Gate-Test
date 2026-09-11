class EffectiveConfigModal extends Modal {
  constructor(app, plugin, info) { super(app); this.plugin = plugin; this.info = info; }
  onOpen() {
    const { contentEl } = this;
    const t=(key,params)=>this.plugin?.i18n?.t?.(key,params) || key;
    contentEl.empty();
    contentEl.createEl('h2', { text: t('category.effective.title') });
    contentEl.createEl('p', { text: t('category.effective.folder', { folder:this.info.folder || '/' }) });
    const pre = contentEl.createEl('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.maxHeight = '60vh';
    pre.style.overflow = 'auto';
    pre.textContent = JSON.stringify(this.info, null, 2);
  }
}

class SelectionBridgeResultModal extends Modal {
  constructor(app, plugin, result) {
    super(app);
    this.plugin = plugin;
    this.result = result;
  }
  onOpen() {
    const { contentEl } = this;
    const r = this.result || {};
    const t=(key,params)=>this.plugin?.i18n?.t?.(key,params) || key;
    contentEl.createEl('h2', { text:t('diagnostics.selectionBridge.title') });
    contentEl.createEl('p', {
      text: r.found
        ? t('diagnostics.selectionBridge.found')
        : t('diagnostics.selectionBridge.notFound')
    });

    const summary = contentEl.createDiv();
    summary.createEl('p', { text: t('diagnostics.selectionBridge.hits',{count:r.total ?? 0}) });
    if (Array.isArray(r.pages) && r.pages.length) {
      summary.createEl('p', { text: t('diagnostics.selectionBridge.pages',{pages:r.pages.join(', ')}) });
    }
    if (r.queryUsed) {
      summary.createEl('p', { text: t('diagnostics.selectionBridge.query',{mode:r.queryMode || t('common.unknown'),query:r.queryUsed}) });
    }
    if (r.fullGeometry) {
      const g = r.fullGeometry;
      summary.createEl('p', { text: t('diagnostics.selectionBridge.geometry',{status:g.complete?t('diagnostics.selectionBridge.foundWord'):t('diagnostics.selectionBridge.incomplete'),matched:g.matchedChunkCount,count:g.chunkCount,pages:(g.pages||[]).join(', ')||'-',rects:g.mergedRectCount??0}) });
    }

    contentEl.createEl('h3', { text:t('diagnostics.clipboardText') });
    const textPre = contentEl.createEl('pre');
    textPre.style.whiteSpace = 'pre-wrap';
    textPre.style.maxHeight = '180px';
    textPre.style.overflow = 'auto';
    textPre.setText(r.clipboardText || t('diagnostics.empty'));

    contentEl.createEl('h3', { text:t('diagnostics.rawGeometry') });
    const raw = JSON.stringify(r.engineResult || {}, null, 2);
    const pre = contentEl.createEl('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.maxHeight = '360px';
    pre.style.overflow = 'auto';
    pre.setText(raw);

    new Setting(contentEl)
      .addButton(button => {
        button.setButtonText(t('common.copyDiagnostics'));
        button.onClick(() => {
          try {
            clipboardTextAdapter.writeText(JSON.stringify(r, null, 2));
            new Notice(t('diagnostics.copySelectionDone'));
          } catch (error) {
            new Notice(t('diagnostics.copyFailed',{error:error instanceof Error ? error.message : String(error)}));
          }
        });
      })
      .addButton(button => {
        button.setButtonText(t('common.close'));
        button.setCta();
        button.onClick(() => this.close());
      });
  }
  onClose() { this.contentEl.empty(); }
}

class SelectionHighlightDiagnosticModal extends Modal {
  constructor(app, plugin, result) {
    super(app);
    this.plugin = plugin;
    this.result = result;
  }
  onOpen() {
    const { contentEl } = this;
    const r = this.result || {};
    const t=(key,params)=>this.plugin?.i18n?.t?.(key,params) || key;
    contentEl.createEl('h2', { text:t('diagnostics.highlight.title') });
    contentEl.createEl('p', {
      text: r.ok
        ? t('diagnostics.highlight.ok')
        : t('diagnostics.highlight.failed')
    });

    const summary = contentEl.createDiv();
    summary.createEl('p', { text: t('diagnostics.result',{result:r.ok?'OK':t('common.error').toUpperCase()}) });
    if (r.error) summary.createEl('p', { text: t('diagnostics.errorLine',{error:r.error}) });
    if (r.file) summary.createEl('p', { text: t('diagnostics.sourceLine',{source:r.file}) });
    if (r.destination) summary.createEl('p', { text: t('diagnostics.workingCopy',{path:r.destination}) });
    if (r.geometry) {
      const g = r.geometry;
      summary.createEl('p', {
        text: t('diagnostics.selectionLine',{status:g.complete?t('diagnostics.complete'):t('diagnostics.selectionBridge.incomplete'),matched:g.matchedChunkCount??0,count:g.chunkCount??0,pages:(g.pages||[]).join(', ')||'-',rects:g.mergedRectCount??0})
      });
    }

    contentEl.createEl('h3', { text:t('common.steps') });
    const stages = Array.isArray(r.stages) ? r.stages : [];
    const stagePre = contentEl.createEl('pre');
    stagePre.style.whiteSpace = 'pre-wrap';
    stagePre.style.maxHeight = '260px';
    stagePre.style.overflow = 'auto';
    stagePre.setText(stages.length ? stages.map((x, i) => `${i + 1}. ${x.stage}${x.detail ? ` — ${x.detail}` : ''}`).join('\n') : t('diagnostics.stepsEmpty'));

    contentEl.createEl('h3', { text:t('common.fullDiagnostics') });
    const pre = contentEl.createEl('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.maxHeight = '420px';
    pre.style.overflow = 'auto';
    pre.setText(JSON.stringify(r, null, 2));

    new Setting(contentEl)
      .addButton(button => {
        button.setButtonText(t('common.copyDiagnostics'));
        button.onClick(() => {
          try {
            clipboardTextAdapter.writeText(JSON.stringify(r, null, 2));
            new Notice(t('diagnostics.copyHighlightDone'));
          } catch (error) {
            new Notice(t('diagnostics.copyFailed',{error:error instanceof Error ? error.message : String(error)}));
          }
        });
      })
      .addButton(button => {
        button.setButtonText(t('common.close'));
        button.setCta();
        button.onClick(() => this.close());
      });
  }
  onClose() { this.contentEl.empty(); }
}


class FocusRetestDiagnosticModal extends Modal {
  constructor(app, plugin, result) {
    super(app);
    this.plugin = plugin;
    this.result = result;
  }
  onOpen() {
    const { contentEl } = this;
    const r = this.result || {};
    const t=(key,params)=>this.plugin?.i18n?.t?.(key,params) || key;
    contentEl.createEl('h2', { text:t('diagnostics.main.title') });
    contentEl.createEl('p', {
      text:t('diagnostics.main.intro')
    });

    const summary = contentEl.createDiv();
    summary.createEl('p', { text: t('diagnostics.main.activeViewer',{yesno:r.activeCustomPdfView?t('common.yes').toUpperCase():t('common.no').toUpperCase(),pdf:r.activePdf?` | ${r.activePdf}`:''}) });
    summary.createEl('p', { text: t('diagnostics.main.installed',{yesno:r.installed?t('common.yes').toUpperCase():t('common.no').toUpperCase(),count:r.listenerCount??0}) });
    if (r.installError) summary.createEl('p', { text: t('diagnostics.main.installError',{error:r.installError}) });
    summary.createEl('p', { text: t('diagnostics.main.events',{contexts:(r.contextMenuEvents||[]).length,focus:(r.focusHistory||[]).length}) });
    summary.createEl('p', { text: t('diagnostics.main.selectionClipboard',{selection:(r.lastContextSelectionText||'').length,clipboard:r.clipboardLength??0}) });
    const bridge = r.mainProcessBridge || {};
    summary.createEl('p', { text: t('diagnostics.main.bridge',{yesno:bridge.installed?t('common.yes').toUpperCase():t('common.no').toUpperCase(),listeners:bridge.embeddedKeyboardInputListenerCount??0,menu:bridge.menuShowSeq??0,shortcut:bridge.shortcutSeq??0}) });
    if (bridge.installError || bridge.error) summary.createEl('p', { text: t('diagnostics.main.bridgeError',{error:bridge.installError||bridge.error}) });

    if (r.lastContextSelectionText) {
      contentEl.createEl('h3', { text:t('diagnostics.main.lastSelection') });
      const sel = contentEl.createEl('pre');
      sel.style.whiteSpace = 'pre-wrap';
      sel.style.maxHeight = '180px';
      sel.style.overflow = 'auto';
      sel.setText(r.lastContextSelectionText);
    }

    if (r.clipboardText) {
      contentEl.createEl('h3', { text:t('diagnostics.main.clipboardNow') });
      const clip = contentEl.createEl('pre');
      clip.style.whiteSpace = 'pre-wrap';
      clip.style.maxHeight = '180px';
      clip.style.overflow = 'auto';
      clip.setText(r.clipboardText);
    }

    contentEl.createEl('h3', { text:t('common.fullDiagnostics') });
    const pre = contentEl.createEl('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.maxHeight = '460px';
    pre.style.overflow = 'auto';
    pre.setText(JSON.stringify(r, null, 2));

    new Setting(contentEl)
      .addButton(button => {
        button.setButtonText(t('common.copyDiagnostics'));
        button.onClick(() => {
          try {
            clipboardTextAdapter.writeText(JSON.stringify(r, null, 2));
            new Notice(t('diagnostics.copyMainDone'));
          } catch (error) {
            new Notice(t('diagnostics.copyFailed',{error:error instanceof Error ? error.message : String(error)}));
          }
        });
      })
      .addButton(button => {
        button.setButtonText(t('common.close'));
        button.setCta();
        button.onClick(() => this.close());
      });
  }
  onClose() { this.contentEl.empty(); }
}
