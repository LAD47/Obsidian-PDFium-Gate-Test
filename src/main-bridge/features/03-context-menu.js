'use strict';

class MainBridgeContextMenuFeature {
  unregisterEscapeShortcut() {
      const __bridgeRuntime = this;
      try {
          if (globalShortcut.isRegistered('Escape'))
              globalShortcut.unregister('Escape');
      }
      catch (_) { }
      __bridgeRuntime.state.escapeRegistered = false;
  }

  syncContextListenerCount() {
      const __bridgeRuntime = this;
      __bridgeRuntime.state.contextListenerCount = __bridgeRuntime.runtime.contextMenu.listeners.size;
      return __bridgeRuntime.state.contextListenerCount;
  }

  clearRendererMenuOpenState() {
      const __bridgeRuntime = this;
      __bridgeRuntime.state.rendererMenuOpen = false;
      return false;
  }

  handleEscapeDismiss(source = 'globalShortcut') {
      const __bridgeRuntime = this;
      const dismissSeq = __bridgeRuntime.state.escapeDismissSeq + 1;
      const hadKeyboardSelection = !!__bridgeRuntime.runtime.keyboard.selection;
      const hadRendererMenu = !!__bridgeRuntime.state.rendererMenuOpen;
      __bridgeRuntime.state.lastEscapeDismiss = {
          at: new Date().toISOString(),
          dismissSeq,
          source: String(source || ''),
          phase: hadKeyboardSelection && hadRendererMenu ? 'keyboard-selection+renderer-menu-cancel' :
              (hadKeyboardSelection ? 'keyboard-selection-cancel' : 'single-renderer-overlay-cancel'),
          focusedWebContents: __bridgeRuntime.ports.safeDescribe(webContents.getFocusedWebContents(), webContents.getFocusedWebContents())
      };
      __bridgeRuntime.state.rendererMenuOpen = false;
      __bridgeRuntime.state.escapeDismissSeq = dismissSeq;
      try {
          const ownerWc = webContents.getFocusedWebContents();
          if (ownerWc)
              void __bridgeRuntime.rendererEventDispatchAdapter.dispatchExact(ownerWc, RENDERER_BRIDGE_EVENTS.ESCAPE_DISMISS, __bridgeRuntime.state.lastEscapeDismiss);
      }
      catch (_) { }
      if (hadKeyboardSelection)
          void __bridgeRuntime.ports.clearKeyboardSelection('escape');
      else
          __bridgeRuntime.ports.unregisterEscapeShortcut();
  }

  registerEscapeShortcut() {
      const __bridgeRuntime = this;
      __bridgeRuntime.ports.unregisterEscapeShortcut();
      if (__bridgeRuntime.ports.isEmbeddedPdfTarget(__bridgeRuntime.ports.resolveReservedShortcutPdfTarget()?.target || null)) {
          __bridgeRuntime.state.escapeRegistered = true;
          return true;
      }
      let ok = false;
      try {
          ok = !!globalShortcut.register('Escape', () => __bridgeRuntime.ports.handleEscapeDismiss('globalShortcut'));
      }
      catch (_) {
          ok = false;
      }
      __bridgeRuntime.state.escapeRegistered = ok;
      return ok;
  }

  syncEscapeShortcut() {
      const __bridgeRuntime = this;
      if (__bridgeRuntime.state.rendererMenuOpen || __bridgeRuntime.runtime.keyboard.selection)
          __bridgeRuntime.ports.registerEscapeShortcut();
      else
          __bridgeRuntime.ports.unregisterEscapeShortcut();
  }

  setRendererMenuOpen(open) {
      const __bridgeRuntime = this;
      __bridgeRuntime.state.rendererMenuOpen = !!open;
      __bridgeRuntime.ports.syncEscapeShortcut();
      return {
          ok: true,
          rendererMenuOpen: __bridgeRuntime.state.rendererMenuOpen,
          escapeRegistered: __bridgeRuntime.state.escapeRegistered,
          escapeDismissSeq: __bridgeRuntime.state.escapeDismissSeq
      };
  }

  shouldSuppressOtherContextListener(params) {
      const __bridgeRuntime = this;
      // All PDF context-menu events are owned here first. We must receive
      // right-clicks even when there is no text selection so an existing
      // Highlight can be hit-tested directly under the mouse pointer.
      return __bridgeRuntime.ports.isPdfContext(params);
  }

  attachContextListenerWatcher(wc) {
      const __bridgeRuntime = this;
      if (!wc || __bridgeRuntime.runtime.contextMenu.newListenerWatchers.has(wc.id) || typeof wc.on !== 'function')
          return;
      const handler = eventName => {
          if (eventName !== 'context-menu' || !__bridgeRuntime.state.installed)
              return;
          // EventEmitter emits newListener before the listener is attached. Defer only
          // to the microtask queue so filtering remains event-driven, not timer-driven.
          queueMicrotask(() => {
              try {
                  if (__bridgeRuntime.state.installed)
                      __bridgeRuntime.ports.filterExistingContextListeners(wc);
              }
              catch (_) { }
          });
      };
      try {
          wc.on('newListener', handler);
          __bridgeRuntime.runtime.contextMenu.newListenerWatchers.set(wc.id, { wc, handler });
      }
      catch (_) { }
  }

  detachContextListenerWatchers() {
      const __bridgeRuntime = this;
      for (const { wc, handler } of __bridgeRuntime.runtime.contextMenu.newListenerWatchers.values()) {
          try {
              wc.removeListener('newListener', handler);
          }
          catch (_) {
              try {
                  wc.off('newListener', handler);
              }
              catch (_) { }
          }
      }
      __bridgeRuntime.runtime.contextMenu.newListenerWatchers.clear();
  }

  filterExistingContextListeners(wc) {
      const __bridgeRuntime = this;
      if (!wc || (typeof wc.listeners !== 'function'))
          return;
      const wcId = wc.id;
      let records = __bridgeRuntime.runtime.contextMenu.filteredListeners.get(wcId);
      if (!records) {
          records = { wc, entries: [] };
          __bridgeRuntime.runtime.contextMenu.filteredListeners.set(wcId, records);
      }
      let listeners = [];
      try {
          listeners = wc.listeners('context-menu') || [];
      }
      catch (_) {
          return;
      }
      let wrappedNow = 0;
      for (const listener of listeners) {
          if (typeof listener !== 'function')
              continue;
          if (listener[OWN_LISTENER] || listener[FILTER_WRAPPER])
              continue;
          if (records.entries.some(e => e.original === listener || e.wrapper === listener))
              continue;
          const wrapper = function (event, params, ...rest) {
              if (__bridgeRuntime.ports.shouldSuppressOtherContextListener(params)) {
                  __bridgeRuntime.state.suppressedListenerCallCount += 1;
                  __bridgeRuntime.state.lastSuppressedListenerCall = {
                      at: new Date().toISOString(),
                      webContents: __bridgeRuntime.ports.safeDescribe(wc, webContents.getFocusedWebContents()),
                      pageURL: params?.pageURL || null,
                      frameURL: params?.frameURL || null,
                      mediaType: params?.mediaType || null,
                      selectionLength: String(params?.selectionText || '').length,
                      originalName: listener.name || '(anonymous)'
                  };
                  return undefined;
              }
              return listener.call(this, event, params, ...rest);
          };
          wrapper[FILTER_WRAPPER] = true;
          try {
              wc.removeListener('context-menu', listener);
              wc.on('context-menu', wrapper);
              records.entries.push({ original: listener, wrapper });
              wrappedNow += 1;
          }
          catch (_) { }
      }
      __bridgeRuntime.state.filterWebContentsCount = [...__bridgeRuntime.runtime.contextMenu.filteredListeners.values()].filter(r => r.entries.length > 0).length;
      __bridgeRuntime.state.filteredListenerCount = [...__bridgeRuntime.runtime.contextMenu.filteredListeners.values()].reduce((n, r) => n + r.entries.length, 0);
      __bridgeRuntime.state.lastFilterScan = {
          at: new Date().toISOString(),
          webContents: __bridgeRuntime.ports.safeDescribe(wc, webContents.getFocusedWebContents()),
          listenerCountSeen: listeners.length,
          wrappedNow,
          totalWrapped: records.entries.length
      };
  }

  restoreFilteredListeners() {
      const __bridgeRuntime = this;
      for (const { wc, entries } of __bridgeRuntime.runtime.contextMenu.filteredListeners.values()) {
          for (const { original, wrapper } of entries) {
              try {
                  wc.removeListener('context-menu', wrapper);
              }
              catch (_) { }
              try {
                  const current = wc.listeners('context-menu') || [];
                  if (!current.includes(original))
                      wc.on('context-menu', original);
              }
              catch (_) { }
          }
      }
      __bridgeRuntime.runtime.contextMenu.filteredListeners.clear();
      __bridgeRuntime.state.filterWebContentsCount = 0;
      __bridgeRuntime.state.filteredListenerCount = 0;
  }

  async capturePdfViewerPoint(target, x, y) {
      const __bridgeRuntime = this;
      return __bridgeRuntime.chromiumPdfRuntimeDriver.captureViewerPoint(target, x, y);
  }

  async captureContextViewerPoint(ownerWc, params, rootX, rootY) {
      const __bridgeRuntime = this;
      const token = __bridgeRuntime.ports.extractPdfToken(params);
      const iframeInfo = await __bridgeRuntime.ports.capturePdfIframeRect(ownerWc, token);
      const pdfTarget = __bridgeRuntime.ports.findEmbeddedPdfTargetExact(token);
      const bridge = {
          token,
          ownerWebContents: __bridgeRuntime.ports.safeDescribe(ownerWc, webContents.getFocusedWebContents()),
          pdfTarget: __bridgeRuntime.ports.safeDescribe(pdfTarget, webContents.getFocusedWebContents()),
          iframeInfo,
          rootPoint: { x: Number(rootX), y: Number(rootY) },
          remotePoint: null
      };
      if (!iframeInfo?.ok || !iframeInfo?.match?.rect) {
          return { ok: false, error: iframeInfo?.error || 'PDF-iframe-rektangel ikke funnet', candidates: [], bridge };
      }
      if (!pdfTarget) {
          return { ok: false, error: 'Eksakt embedded PDF-target ikke funnet', candidates: [], bridge };
      }
      const rect = iframeInfo.match.rect;
      const remoteX = Number(rootX) - Number(rect.left || 0);
      const remoteY = Number(rootY) - Number(rect.top || 0);
      bridge.remotePoint = { x: remoteX, y: remoteY };
      const target = pdfTarget?.runtimeFrame || null;
      const result = await __bridgeRuntime.ports.capturePdfViewerPoint(target, remoteX, remoteY);
      return { ...(result || {}), bridge };
  }

  keyboardSelectionAtViewerPoint(params, viewerPoint) {
      const __bridgeRuntime = this;
      const ks = __bridgeRuntime.runtime.keyboard.selection;
      const text = String(ks?.text || '').trim();
      const rects = Array.isArray(ks?.rects) ? ks.rects : [];
      const token = __bridgeRuntime.ports.extractPdfToken(params);
      const out = { active: !!ks, hit: false, token: token || null, keyboardToken: ks?.token || null, textLength: text.length, candidate: null, rect: null };
      if (!ks || !text || !rects.length)
          return out;
      if (token && ks.token && token !== ks.token)
          return out;
      const candidates = Array.isArray(viewerPoint?.candidates) ? viewerPoint.candidates : [];
      const margin = 2.5;
      for (const candidate of candidates) {
          const pageIndex = Number(candidate?.pageIndex);
          const pageX = Number(candidate?.pageX);
          const pageYTop = Number(candidate?.pageY);
          if (![pageIndex, pageX, pageYTop].every(Number.isFinite))
              continue;
          for (const rect of rects) {
              if (Number(rect?.pageIndex) !== pageIndex)
                  continue;
              const x = Number(rect?.origin?.x), y = Number(rect?.origin?.y);
              const w = Number(rect?.size?.width), h = Number(rect?.size?.height);
              const pageHeight = Number(rect?.pageHeight);
              if (![x, y, w, h, pageHeight].every(Number.isFinite))
                  continue;
              // viewerPoint.pageY is top-origin page space; PDFium glyph rectangles use
              // bottom-origin page space. Convert before hit-testing the custom overlay.
              const pageYPdfium = pageHeight - pageYTop;
              const hit = pageX >= x - margin && pageX <= x + w + margin &&
                  pageYPdfium >= y - margin && pageYPdfium <= y + h + margin;
              if (hit) {
                  out.hit = true;
                  out.candidate = { pageIndex, pageX, pageYTop, pageYPdfium };
                  out.rect = { pageIndex, origin: { x, y }, size: { width: w, height: h }, pageHeight };
                  return out;
              }
          }
      }
      return out;
  }

  publishContextSelection(wc, event, params) {
      const __bridgeRuntime = this;
      const selected = String(params?.selectionText || '').trim();
      const pdf = __bridgeRuntime.ports.isPdfContext(params);
      if (!pdf)
          return;
      // Receive right-clicks even with no text selection. This allows a
      // direct hit test on an existing Highlight annotation.
      try {
          event?.preventDefault?.();
      }
      catch (_) { }
      let cursorScreenPoint = null;
      let contentBounds = null;
      let clientPoint = null;
      try {
          const cursorHit = __bridgeRuntime.screenPointAdapter.getCursorScreenPoint();
          if (cursorHit?.ok)
              cursorScreenPoint = cursorHit.point;
          const windowHit = __bridgeRuntime.browserWindowAdapter.getContentBoundsExact(wc);
          if (windowHit?.ok)
              contentBounds = windowHit.bounds;
          if (cursorScreenPoint && contentBounds) {
              clientPoint = { x: cursorScreenPoint.x - contentBounds.x, y: cursorScreenPoint.y - contentBounds.y };
          }
      }
      catch (_) { }
      const base = {
          at: new Date().toISOString(),
          token: __bridgeRuntime.ports.extractPdfToken(params),
          webContents: __bridgeRuntime.ports.safeDescribe(wc, webContents.getFocusedWebContents()),
          selectionLength: selected.length,
          selectionText: selected,
          isPdfContext: pdf,
          pageURL: params?.pageURL || null,
          frameURL: params?.frameURL || null,
          mediaType: params?.mediaType || null,
          menuSourceType: params?.menuSourceType || null,
          hasFrame: !!params?.frame,
          x: params?.x ?? null,
          y: params?.y ?? null,
          cursorScreenPoint,
          contentBounds,
          clientPoint,
          otherListenersFiltered: __bridgeRuntime.state.filteredListenerCount > 0
      };
      const publish = (viewerPoint, selectionGestureHint = null) => {
          // An active custom keyboard-selection wins only when the actual
          // right-click point is inside its overlay. This prevents Chromium's stale
          // native mouse seed from hijacking Copy link after Shift-key expansion.
          const custom = __bridgeRuntime.ports.keyboardSelectionAtViewerPoint(params, viewerPoint);
          const useKeyboardSelection = !!(custom.hit && __bridgeRuntime.runtime.keyboard.selection?.text && __bridgeRuntime.runtime.keyboard.selection?.selectionModel);
          const effectiveSelectionText = useKeyboardSelection
              ? String(__bridgeRuntime.runtime.keyboard.selection.text || '').trim()
              : selected;
          const selectionSource = useKeyboardSelection
              ? 'keyboard-selection-state'
              : (selected ? 'native-context-selection' : 'none');
          const keyboardSelectionState = useKeyboardSelection ? {
              token: __bridgeRuntime.runtime.keyboard.selection.token || null,
              text: String(__bridgeRuntime.runtime.keyboard.selection.text || ''),
              range: __bridgeRuntime.runtime.keyboard.selection.range || null,
              rects: Array.isArray(__bridgeRuntime.runtime.keyboard.selection.rects) ? __bridgeRuntime.runtime.keyboard.selection.rects : [],
              selectionHint: __bridgeRuntime.runtime.keyboard.selection.selectionHint || null,
              selectionModel: __bridgeRuntime.runtime.keyboard.selection.selectionModel || null,
              direction: __bridgeRuntime.runtime.keyboard.selection.direction || null,
              createdAtMs: Number.isFinite(Number(__bridgeRuntime.runtime.keyboard.selection.createdAtMs)) ? Number(__bridgeRuntime.runtime.keyboard.selection.createdAtMs) : null
          } : null;
          __bridgeRuntime.state.contextEventSeq += 1;
          __bridgeRuntime.state.lastContextEvent = {
              ...base,
              selectionLength: effectiveSelectionText.length,
              selectionText: effectiveSelectionText,
              nativeSelectionLength: selected.length,
              nativeSelectionText: selected,
              selectionSource,
              keyboardSelectionHit: custom,
              keyboardSelectionState,
              viewerPoint: viewerPoint || null,
              selectionGestureHint: selectionGestureHint || null
          };
          void __bridgeRuntime.rendererEventDispatchAdapter.dispatchExact(wc, RENDERER_BRIDGE_EVENTS.PDF_CONTEXT_MENU, __bridgeRuntime.state.lastContextEvent);
          __bridgeRuntime.state.menuShowSeq += 1;
          __bridgeRuntime.state.lastMenuShow = {
              at: new Date().toISOString(),
              showSeq: __bridgeRuntime.state.menuShowSeq,
              requested: true,
              mode: 'electron-context-menu-direct-highlight-hit-test',
              selectionLength: effectiveSelectionText.length,
              selectionSource,
              keyboardSelectionHit: custom,
              keyboardSelectionState: keyboardSelectionState ? {
                  range: keyboardSelectionState.range,
                  selectionModel: keyboardSelectionState.selectionModel,
                  rectCount: keyboardSelectionState.rects.length
              } : null,
              cursorScreenPoint,
              contentBounds,
              clientPoint,
              viewerPoint: viewerPoint || null,
              selectionGestureHint: selectionGestureHint || null,
              filteredListenerCount: __bridgeRuntime.state.filteredListenerCount,
              error: viewerPoint?.ok === false ? viewerPoint.error || null : null
          };
      };
      const x = Number(params?.x), y = Number(params?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
          // For native text selection, capture the same physical mouse
          // gesture that already seeds keyboard selection. Copy-link can then map
          // mouseDown/mouseUp directly to PDF.js item+offset instead of searching
          // for selectionText again in the PDF text stream.
          const token = __bridgeRuntime.ports.extractPdfToken(params);
          const pdfTarget = __bridgeRuntime.ports.findEmbeddedPdfTargetExact(token);
          const gesturePromise = selected && pdfTarget
              ? __bridgeRuntime.ports.capturePdfMouseGestureHint(pdfTarget).catch(error => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
              : Promise.resolve(null);
          void Promise.all([__bridgeRuntime.ports.captureContextViewerPoint(wc, params, x, y), gesturePromise])
              .then(([viewerPoint, gesture]) => {
              const selectionGestureHint = gesture?.ok ? {
                  source: gesture.source || null,
                  ageMs: Number.isFinite(Number(gesture.ageMs)) ? Number(gesture.ageMs) : null,
                  coordinateSpace: 'pdf-bottom-origin',
                  down: gesture.down?.ok ? gesture.down.point || null : null,
                  up: gesture.up?.ok ? gesture.up.point || null : null,
                  // Retain the raw wrapper → remote → page transform chain. Page points are
                  // canonical native PDF coordinates (bottom-origin Y). Any top-origin conversion
                  // required by a text locator must be explicit at that consumer boundary.
                  debug: { raw: gesture.raw || null, frame: gesture.frame || null, scrollerOffset: gesture.scrollerOffset || null, down: gesture.down || null, up: gesture.up || null }
              } : (gesture ? { source: gesture.source || null, ageMs: null, down: null, up: null, error: gesture.error || null, debug: { raw: gesture.raw || null, frame: gesture.frame || null, scrollerOffset: gesture.scrollerOffset || null, down: gesture.down || null, up: gesture.up || null } } : null);
              publish(viewerPoint, selectionGestureHint);
          }, error => publish({ ok: false, error: String(error), candidates: [] }, null));
      }
      else {
          publish({ ok: false, error: 'context-menu mangler x/y', candidates: [] }, null);
      }
  }

  attachContextListener(wc) {
      const __bridgeRuntime = this;
      if (!wc)
          return;
      __bridgeRuntime.ports.attachContextListenerWatcher(wc);
      __bridgeRuntime.ports.filterExistingContextListeners(wc);
      if (__bridgeRuntime.runtime.contextMenu.listeners.has(wc.id))
          return;
      const handler = (event, params) => {
          try {
              __bridgeRuntime.ports.publishContextSelection(wc, event, params);
          }
          catch (e) {
              __bridgeRuntime.state.menuShowSeq += 1;
              __bridgeRuntime.state.lastMenuShow = {
                  at: new Date().toISOString(),
                  showSeq: __bridgeRuntime.state.menuShowSeq,
                  requested: true,
                  mode: 'electron-context-menu-selectionText-filtered',
                  error: e instanceof Error ? e.message : String(e)
              };
          }
      };
      handler[OWN_LISTENER] = true;
      try {
          if (typeof wc.prependListener === 'function')
              wc.prependListener('context-menu', handler);
          else
              wc.on('context-menu', handler);
          __bridgeRuntime.runtime.contextMenu.listeners.set(wc.id, { wc, handler });
          __bridgeRuntime.ports.syncContextListenerCount();
      }
      catch (_) { }
  }
}

module.exports = { MainBridgeContextMenuFeature };
