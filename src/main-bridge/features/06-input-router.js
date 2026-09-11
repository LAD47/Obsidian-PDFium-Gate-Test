'use strict';

class MainBridgeInputRouterFeature {
  keyboardRouteAllowedOnce(id, windowMs = 15) {
      const __bridgeRuntime = this;
      const key = String(id || '');
      const now = Date.now();
      const previous = Number(__bridgeRuntime.runtime.keyboard.routeDedupe.get(key) || 0);
      __bridgeRuntime.runtime.keyboard.routeDedupe.set(key, now);
      return !previous || (now - previous) > Math.max(0, Number(windowMs) || 0);
  }

  normalizeBeforeInputKey(input) {
      const __bridgeRuntime = this;
      let key = String(input?.key || input?.code || input?.keyCode || '').toLowerCase();
      if (key.startsWith('key') && key.length === 4)
          key = key.slice(3);
      if (key.startsWith('digit') && key.length === 6)
          key = key.slice(5);
      const aliases = { arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down', esc: 'escape', ' ': 'space' };
      return aliases[key] || key;
  }

  categorySlotFromBeforeInput(input) {
      const __bridgeRuntime = this;
      // Electron before-input-event exposes both KeyboardEvent.key and
      // KeyboardEvent.code. Ctrl+Alt is interpreted as AltGr on several keyboard
      // layouts, so `key` may be a symbol (@, £, $, …) even though the user pressed
      // the physical 1-5 keys. Category shortcuts are intentionally physical
      // Ctrl/Cmd+Alt+1..5 commands, therefore use Digit1..Digit5 as canonical input
      // identity and only fall back to `key` when code is unavailable.
      const code = String(input?.code || '').toLowerCase();
      const physical = code.match(/^digit([1-5])$/);
      if (physical)
          return Number(physical[1]);
      const key = String(input?.key || input?.keyCode || '').trim();
      return /^[1-5]$/.test(key) ? Number(key) : null;
  }

  matchEmbeddedKeyboardAction(input) {
      const __bridgeRuntime = this;
      if (String(input?.type || '').toLowerCase() !== 'keydown')
          return null;
      const key = __bridgeRuntime.ports.normalizeBeforeInputKey(input);
      const shift = !!input?.shift, alt = !!input?.alt, control = !!input?.control, meta = !!input?.meta;
      const commandOrControl = process.platform === 'darwin' ? meta : control;
      const wordModifier = process.platform === 'darwin' ? alt : control;
      if (key === 'escape' && (__bridgeRuntime.state.rendererMenuOpen || __bridgeRuntime.runtime.keyboard.selection))
          return { kind: 'escape', id: 'escape' };
      if (commandOrControl && !shift && !alt && key === 'p')
          return { kind: 'reserved', shortcut: OBSIDIAN_RESERVED_SHORTCUTS.find(x => x.id === 'command-palette') };
      if (commandOrControl && !shift && !alt && key === 'o')
          return { kind: 'reserved', shortcut: OBSIDIAN_RESERVED_SHORTCUTS.find(x => x.id === 'quick-switcher') };
      if (commandOrControl && !shift && !alt && key === 'c')
          return { kind: 'copy', id: 'copy' };
      if (commandOrControl && !shift && !alt && key === 'a')
          return { kind: 'reserved', shortcut: OBSIDIAN_RESERVED_SHORTCUTS.find(x => x.id === 'selection-all') };
      if (shift && !control && !meta && !alt && ['left', 'right', 'up', 'down'].includes(key))
          return { kind: 'reserved', shortcut: OBSIDIAN_RESERVED_SHORTCUTS.find(x => x.id === `selection-${key}`) };
      if (shift && wordModifier && !meta && (process.platform === 'darwin' ? !control : !alt) && ['left', 'right'].includes(key))
          return { kind: 'reserved', shortcut: OBSIDIAN_RESERVED_SHORTCUTS.find(x => x.id === `selection-word-${key}`) };
      if (shift && !control && !meta && !alt && key === 'home')
          return { kind: 'reserved', shortcut: OBSIDIAN_RESERVED_SHORTCUTS.find(x => x.id === 'selection-line-home') };
      if (shift && !control && !meta && !alt && key === 'end')
          return { kind: 'reserved', shortcut: OBSIDIAN_RESERVED_SHORTCUTS.find(x => x.id === 'selection-line-end') };
      if (shift && commandOrControl && !alt && key === 'home')
          return { kind: 'reserved', shortcut: OBSIDIAN_RESERVED_SHORTCUTS.find(x => x.id === 'selection-document-home') };
      if (shift && commandOrControl && !alt && key === 'end')
          return { kind: 'reserved', shortcut: OBSIDIAN_RESERVED_SHORTCUTS.find(x => x.id === 'selection-document-end') };
      if (shift && !control && !meta && !alt && key === 'pageup')
          return { kind: 'reserved', shortcut: OBSIDIAN_RESERVED_SHORTCUTS.find(x => x.id === 'selection-page-up') };
      if (shift && !control && !meta && !alt && key === 'pagedown')
          return { kind: 'reserved', shortcut: OBSIDIAN_RESERVED_SHORTCUTS.find(x => x.id === 'selection-page-down') };
      if (commandOrControl && alt && !shift) {
          const slot = __bridgeRuntime.ports.categorySlotFromBeforeInput(input);
          const category = slot == null ? null : categories.find(c => Number(c.slot) === slot);
          if (category)
              return { kind: 'category', category, id: `category-${slot}` };
      }
      return null;
  }

  routeEmbeddedCopy(pdfTarget, source) {
      const __bridgeRuntime = this;
      const token = __bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget);
      const keyboardValid = !!(pdfTarget && __bridgeRuntime.runtime.keyboard.selection && token === __bridgeRuntime.runtime.keyboard.selection.token && __bridgeRuntime.runtime.keyboard.selection.text);
      if (keyboardValid) {
          void __bridgeRuntime.ports.routeKeyboardSelectionCopyFromPdf(pdfTarget, __bridgeRuntime.runtime.keyboard.selection, source);
          return;
      }
      if (pdfTarget) {
          // Native mouse Ctrl+C is an outward-copy operation regardless of
          // the header/footer preference. The renderer decides whether Artifact text
          // is filtered or preserved; the input route must not swallow Ctrl+C when
          // includeHeaderFooterText is enabled.
          void __bridgeRuntime.ports.routeNativeMouseCopyFromPdf(pdfTarget, source);
          return;
      }
      const rec = { at: new Date().toISOString(), token, valid: false, textLength: 0, error: 'Ctrl+C-ruten har ingen aktiv PDF-selection', source: String(source || 'embedded-before-input') };
      __bridgeRuntime.ports.recordKeyboardCopyResult(rec);
  }

  setEmbeddedKeyboardRoutingMode(mode) {
      const __bridgeRuntime = this;
      __bridgeRuntime.state.embeddedKeyboardRoutingMode = mode == null ? null : String(mode);
      return __bridgeRuntime.state.embeddedKeyboardRoutingMode;
  }

  resolveEmbeddedInputPdfTarget(ownerWc) {
      const __bridgeRuntime = this;
      if (!ownerWc)
          return null;
      const token = __bridgeRuntime.ports.focusedPdfTokenForWebContents(ownerWc);
      if (!token)
          return null;
      const publication = __bridgeRuntime.runtime.targets.activePdfTargetAdapter?.getPublication?.() || null;
      if (publication?.known && publication?.token && String(publication.token) !== String(token))
          return null;
      const exact = __bridgeRuntime.ports.resolveEmbeddedPdfTargetExact(token);
      if (!exact?.ok || !__bridgeRuntime.ports.isEmbeddedPdfTarget(exact?.target))
          return null;
      if (!__bridgeRuntime.ports.sameWebContents(exact.target.ownerWebContents, ownerWc))
          return null;
      return exact.target;
  }

  dispatchEmbeddedKeyboardAction(pdfTarget, action, input, source, focusedFrame = null) {
      const __bridgeRuntime = this;
      if (!pdfTarget || !action)
          return { handled: false, reason: 'missing-target-or-action' };
      const routeId = action.shortcut?.id || action.id || action.category?.id || action.kind;
      if (!__bridgeRuntime.ports.keyboardRouteAllowedOnce(routeId, 15))
          return { handled: true, deduped: true, routeId, kind: action.kind, token: __bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget) };
      __bridgeRuntime.state.embeddedKeyboardInputSeq += 1;
      __bridgeRuntime.state.lastEmbeddedKeyboardInput = {
          at: new Date().toISOString(), seq: __bridgeRuntime.state.embeddedKeyboardInputSeq, routeId, kind: action.kind,
          key: __bridgeRuntime.ports.normalizeBeforeInputKey(input), token: __bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget), focusedFrame: focusedFrame || null,
          source: String(source || 'embedded-input'),
          input: { type: input?.type || null, key: input?.key || null, code: input?.code || null, control: !!input?.control, meta: !!input?.meta, shift: !!input?.shift, alt: !!input?.alt, isAutoRepeat: !!input?.isAutoRepeat },
          error: null
      };
      __bridgeRuntime.ports.setEmbeddedKeyboardRoutingMode(String(source || 'embedded-input'));
      if (action.kind === 'escape')
          __bridgeRuntime.ports.handleEscapeDismiss(String(source || 'embedded-input'));
      else if (action.kind === 'copy')
          __bridgeRuntime.ports.routeEmbeddedCopy(pdfTarget, String(source || 'embedded-input'));
      else if (action.kind === 'category')
          void __bridgeRuntime.ports.captureShortcut(action.category, pdfTarget, String(source || 'embedded-input'));
      else {
          const shortcut = action.shortcut;
          if (shortcut?.routeType === 'obsidian')
              void __bridgeRuntime.ports.routeObsidianCommandFromPdf(pdfTarget, shortcut, String(source || 'embedded-input'));
          else if (shortcut)
              __bridgeRuntime.runtime.keyboard.selectionRouteChain = __bridgeRuntime.runtime.keyboard.selectionRouteChain.then(() => __bridgeRuntime.ports.routePdfKeyboardSelectionFromPdf(pdfTarget, shortcut, String(source || 'embedded-input'))).catch(() => { });
      }
      return { handled: true, deduped: false, routeId, kind: action.kind, token: __bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget) };
  }

  attachEmbeddedKeyboardInputListener(wc) {
      const __bridgeRuntime = this;
      if (!wc || __bridgeRuntime.runtime.keyboard.inputListeners.has(wc.id))
          return;
      const handler = (event, input) => {
          try {
              if (Date.now() < __bridgeRuntime.runtime.keyboard.syntheticCtrlCUntil) {
                  const key = __bridgeRuntime.ports.normalizeBeforeInputKey(input);
                  const commandOrControl = process.platform === 'darwin' ? !!input?.meta : !!input?.control;
                  if (commandOrControl && key === 'c')
                      return;
              }
              const pdfTarget = __bridgeRuntime.ports.resolveEmbeddedInputPdfTarget(wc);
              if (!pdfTarget)
                  return;
              const action = __bridgeRuntime.ports.matchEmbeddedKeyboardAction(input);
              if (!action)
                  return;
              const result = __bridgeRuntime.ports.dispatchEmbeddedKeyboardAction(pdfTarget, action, input, 'main-before-input-event', __bridgeRuntime.ports.describeFrame(wc.focusedFrame || null));
              if (result?.handled) {
                  try {
                      event?.preventDefault?.();
                  }
                  catch (_) { }
              }
          }
          catch (error) {
              __bridgeRuntime.state.embeddedKeyboardInputSeq += 1;
              __bridgeRuntime.state.lastEmbeddedKeyboardInput = { at: new Date().toISOString(), seq: __bridgeRuntime.state.embeddedKeyboardInputSeq, source: 'main-before-input-event', error: error instanceof Error ? error.message : String(error) };
          }
      };
      try {
          wc.on('before-input-event', handler);
          __bridgeRuntime.runtime.keyboard.inputListeners.set(wc.id, { wc, handler });
          __bridgeRuntime.state.embeddedKeyboardInputListenerCount = __bridgeRuntime.runtime.keyboard.inputListeners.size;
      }
      catch (_) { }
  }

  detachEmbeddedKeyboardInputListeners() {
      const __bridgeRuntime = this;
      for (const { wc, handler } of __bridgeRuntime.runtime.keyboard.inputListeners.values()) {
          try {
              wc.removeListener('before-input-event', handler);
          }
          catch (_) {
              try {
                  wc.off('before-input-event', handler);
              }
              catch (_) { }
          }
      }
      __bridgeRuntime.runtime.keyboard.inputListeners.clear();
      __bridgeRuntime.state.embeddedKeyboardInputListenerCount = 0;
      __bridgeRuntime.ports.setEmbeddedKeyboardRoutingMode(null);
      __bridgeRuntime.runtime.keyboard.routeDedupe.clear();
  }
}

module.exports = { MainBridgeInputRouterFeature };
