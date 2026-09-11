'use strict';

class RendererBridgeFeature {
  configureRendererBridgeHandlers() {
    // Main Bridge dispatches explicit Obsidian
    // command requests here. We execute the real command rather than
    // synthesizing Ctrl/Cmd keystrokes into the app renderer.
    this.state.bridge.command.handler = event => {
      const parsed=readRendererBridgeEventDetail(RENDERER_BRIDGE_EVENTS.OBSIDIAN_COMMAND,event);
      if(!parsed?.ok) { console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] obsidian-command bridge rejected`,parsed?.error); return; }
      const detail=parsed.detail;
      const commandId = String(detail.commandId || '');
      const rec = {
        at:new Date().toISOString(),
        seq:(this.state.bridge.command.state?.seq || 0) + 1,
        shortcutId:detail.shortcutId || null,
        accelerator:detail.accelerator || null,
        commandId,
        tried:[],
        ok:false,
        result:null,
        error:null
      };
      try {
        const candidates = commandId === 'command-palette:open'
          ? ['command-palette:open']
          : commandId === 'switcher:open'
            ? ['switcher:open']
            : [commandId].filter(Boolean);
        for (const id of candidates) {
          const executed = this.obsidianCommandExecutionAdapter?.executeExact?.(id) || {
            ok:false, executed:false, commandId:id, result:null,
            reason:'adapter-unavailable', error:'Obsidian command execution adapter mangler'
          };
          if (executed.error) rec.tried.push({id, result:false, error:executed.error});
          else rec.tried.push({id, result:executed.result});
          if (executed.ok) { rec.ok = true; rec.result = {id, result:executed.result}; break; }
        }
        if (!rec.ok) rec.error = 'Obsidian returnerte false for kommandoen';
      } catch (e) { rec.error = e instanceof Error ? e.message : String(e); }
      this.state.bridge.command.state = { seq:rec.seq, last:rec };
    };


    // Keyboard-selection requests arrive from the canonical Main Bridge input route.
    // Serialize them so repeated keypresses build on the exact previous range.
    this.state.bridge.keyboardSelection.handler = event => {
      const parsed=readRendererBridgeEventDetail(RENDERER_BRIDGE_EVENTS.KEYBOARD_SELECTION,event);
      if(!parsed?.ok) { console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] keyboard-selection bridge rejected`,parsed?.error); return; }
      const detail=parsed.detail;
      this.state.bridge.keyboardSelection.queue = this.state.bridge.keyboardSelection.queue
        .then(() => this.ports.handlePdfKeyboardSelectionRequest(detail))
        .catch(error => {
          console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] keyboard-selection queue failed`, error);
        });
    };

    // Native mouse Ctrl+C is captured by Main Bridge before-input-event routing;
    // cross-page identity still resolves from Chromium selection text + gesture geometry.
    this.state.bridge.nativeCopy.handler = event => {
      const parsed=readRendererBridgeEventDetail(RENDERER_BRIDGE_EVENTS.NATIVE_COPY,event);
      if(!parsed?.ok) { console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] native-copy bridge rejected`,parsed?.error); return; }
      const detail=parsed.detail;
      this.state.bridge.nativeCopy.queue = this.state.bridge.nativeCopy.queue
        .then(() => this.ports.handlePdfNativeCopyRequest(detail))
        .catch(error => console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] native-copy queue failed`, error));
    };

    // Keyboard Ctrl+C is an outward-copy operation. Keep the custom
    // keyboard range raw internally, but filter clipboard text in the renderer
    // where PDF bytes + Artifact/continuity logic are available.
    this.state.bridge.keyboardCopy.handler = event => {
      const parsed=readRendererBridgeEventDetail(RENDERER_BRIDGE_EVENTS.KEYBOARD_COPY,event);
      if(!parsed?.ok) { console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] keyboard-copy bridge rejected`,parsed?.error); return; }
      this.state.bridge.keyboardCopy.queue = this.state.bridge.keyboardCopy.queue
        .then(() => this.ports.handlePdfKeyboardCopyRequest(parsed.detail))
        .catch(error => console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] keyboard-copy queue failed`, error));
    };

    this.state.bridge.contextMenu.handler = event => {
      const parsed=readRendererBridgeEventDetail(RENDERER_BRIDGE_EVENTS.PDF_CONTEXT_MENU,event);
      if(!parsed?.ok) { console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] context-menu bridge rejected`,parsed?.error); return; }
      this.ports.handlePdfContextMenuBridgeEvent(parsed.detail);
    };
    this.state.bridge.categoryShortcut.handler = event => {
      const parsed=readRendererBridgeEventDetail(RENDERER_BRIDGE_EVENTS.CATEGORY_SHORTCUT,event);
      if(!parsed?.ok) { console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] category-shortcut bridge rejected`,parsed?.error); return; }
      this.ports.handleCategoryShortcutBridgeEvent(parsed.detail);
    };
    this.state.bridge.escapeDismiss.handler = event => {
      const parsed=readRendererBridgeEventDetail(RENDERER_BRIDGE_EVENTS.ESCAPE_DISMISS,event);
      if(!parsed?.ok) { console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] escape-dismiss bridge rejected`,parsed?.error); return; }
      this.ports.handleEscapeDismissBridgeEvent(parsed.detail);
    };
    this.state.bridge.pdfMouseActivation.handler = event => {
      const parsed=readRendererBridgeEventDetail(RENDERER_BRIDGE_EVENTS.PDF_MOUSE_ACTIVATION,event);
      if(!parsed?.ok) { console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] pdf-mouse-activation bridge rejected`,parsed?.error); return; }
      void this.ports.handlePdfMouseActivationBridgeEvent(parsed.detail);
    };

  }

  clearRendererBridgeHandlers() {
    this.state.bridge.command.handler=null;
    this.state.bridge.keyboardSelection.handler=null;
    this.state.bridge.nativeCopy.handler=null;
    this.state.bridge.keyboardCopy.handler=null;
    this.state.bridge.contextMenu.handler=null;
    this.state.bridge.categoryShortcut.handler=null;
    this.state.bridge.escapeDismiss.handler=null;
    this.state.bridge.pdfMouseActivation.handler=null;
  }

  registerRendererBridgeWindow(targetWindow) {
    const win = targetWindow || null;
    if (!win || typeof win.addEventListener !== 'function') return false;
    if (!this.state.bridge.rendererWindows) this.state.bridge.rendererWindows = new Set();
    if (this.state.bridge.rendererWindows.has(win)) return true;
    try {
      if (this.state.bridge.command.handler) win.addEventListener(RENDERER_BRIDGE_EVENTS.OBSIDIAN_COMMAND, this.state.bridge.command.handler);
      if (this.state.bridge.keyboardSelection.handler) win.addEventListener(RENDERER_BRIDGE_EVENTS.KEYBOARD_SELECTION, this.state.bridge.keyboardSelection.handler);
      if (this.state.bridge.nativeCopy.handler) win.addEventListener(RENDERER_BRIDGE_EVENTS.NATIVE_COPY, this.state.bridge.nativeCopy.handler);
      if (this.state.bridge.keyboardCopy.handler) win.addEventListener(RENDERER_BRIDGE_EVENTS.KEYBOARD_COPY, this.state.bridge.keyboardCopy.handler);
      if (this.state.bridge.contextMenu.handler) win.addEventListener(RENDERER_BRIDGE_EVENTS.PDF_CONTEXT_MENU, this.state.bridge.contextMenu.handler);
      if (this.state.bridge.categoryShortcut.handler) win.addEventListener(RENDERER_BRIDGE_EVENTS.CATEGORY_SHORTCUT, this.state.bridge.categoryShortcut.handler);
      if (this.state.bridge.escapeDismiss.handler) win.addEventListener(RENDERER_BRIDGE_EVENTS.ESCAPE_DISMISS, this.state.bridge.escapeDismiss.handler);
      if (this.state.bridge.pdfMouseActivation.handler) win.addEventListener(RENDERER_BRIDGE_EVENTS.PDF_MOUSE_ACTIVATION, this.state.bridge.pdfMouseActivation.handler);
      this.state.bridge.rendererWindows.add(win);
      return true;
    } catch (error) {
      console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] renderer-window bridge registration failed`, error);
      return false;
    }
  }

  registerRendererBridgeForElement(element) {
    const doc = element?.doc || element?.ownerDocument || null;
    const win = element?.win || doc?.defaultView || null;
    return this.registerRendererBridgeWindow(win);
  }

  unregisterRendererBridgeWindows() {
    if (!this.state.bridge.rendererWindows) return;
    for (const win of this.state.bridge.rendererWindows) {
      try { if (this.state.bridge.command.handler) win.removeEventListener(RENDERER_BRIDGE_EVENTS.OBSIDIAN_COMMAND, this.state.bridge.command.handler); } catch (_) {}
      try { if (this.state.bridge.keyboardSelection.handler) win.removeEventListener(RENDERER_BRIDGE_EVENTS.KEYBOARD_SELECTION, this.state.bridge.keyboardSelection.handler); } catch (_) {}
      try { if (this.state.bridge.nativeCopy.handler) win.removeEventListener(RENDERER_BRIDGE_EVENTS.NATIVE_COPY, this.state.bridge.nativeCopy.handler); } catch (_) {}
      try { if (this.state.bridge.keyboardCopy.handler) win.removeEventListener(RENDERER_BRIDGE_EVENTS.KEYBOARD_COPY, this.state.bridge.keyboardCopy.handler); } catch (_) {}
      try { if (this.state.bridge.contextMenu.handler) win.removeEventListener(RENDERER_BRIDGE_EVENTS.PDF_CONTEXT_MENU, this.state.bridge.contextMenu.handler); } catch (_) {}
      try { if (this.state.bridge.categoryShortcut.handler) win.removeEventListener(RENDERER_BRIDGE_EVENTS.CATEGORY_SHORTCUT, this.state.bridge.categoryShortcut.handler); } catch (_) {}
      try { if (this.state.bridge.escapeDismiss.handler) win.removeEventListener(RENDERER_BRIDGE_EVENTS.ESCAPE_DISMISS, this.state.bridge.escapeDismiss.handler); } catch (_) {}
      try { if (this.state.bridge.pdfMouseActivation.handler) win.removeEventListener(RENDERER_BRIDGE_EVENTS.PDF_MOUSE_ACTIVATION, this.state.bridge.pdfMouseActivation.handler); } catch (_) {}
    }
    this.state.bridge.rendererWindows.clear();
  }

  resolveRendererWindowContextForPdfEvent(contextEvent) {
    const token = String(contextEvent?.token || '').trim();
    let leaf = null;
    let reason = 'default-renderer-window';
    if (token && this.pdfLeafAdapter?.resolveExactToken) {
      const resolved = this.pdfLeafAdapter.resolveExactToken(token);
      if (resolved?.ok && resolved.leaf) { leaf = resolved.leaf; reason = 'exact-pdf-token'; }
    }
    const contentEl = leaf?.view?.contentEl || null;
    const doc = contentEl?.doc || contentEl?.ownerDocument || document;
    const win = contentEl?.win || doc?.defaultView || window;
    try { this.registerRendererBridgeWindow(win); } catch (_) {}
    return { token:token || null, leaf, contentEl, document:doc, window:win, reason };
  }
}

module.exports = { RendererBridgeFeature };
