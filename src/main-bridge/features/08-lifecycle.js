'use strict';

class MainBridgeLifecycleFeature {
  finishShortcut(action, ownerWc = null) {
      const __bridgeRuntime = this;
      __bridgeRuntime.state.shortcutSeq += 1;
      action.resultSeq = __bridgeRuntime.state.shortcutSeq;
      action.pending = false;
      __bridgeRuntime.state.lastShortcutAction = action;
      if (ownerWc)
          void __bridgeRuntime.rendererEventDispatchAdapter.dispatchExact(ownerWc, RENDERER_BRIDGE_EVENTS.CATEGORY_SHORTCUT, action);
  }

  async captureShortcut(category, routedPdfTarget = null, source = 'category-shortcut') {
      const __bridgeRuntime = this;
      __bridgeRuntime.runtime.shortcuts.triggerCounter += 1;
      __bridgeRuntime.state.shortcutTriggerSeq = __bridgeRuntime.runtime.shortcuts.triggerCounter;
      let focused = null;
      try {
          focused = webContents.getFocusedWebContents();
      }
      catch (_) { }
      const resolvedTarget = routedPdfTarget
          ? { ok: true, target: routedPdfTarget, token: __bridgeRuntime.ports.pdfTokenFromTarget(routedPdfTarget), source: 'routed-embedded-input' }
          : __bridgeRuntime.ports.resolveReservedShortcutPdfTarget();
      const focusedPdf = resolvedTarget?.ok ? resolvedTarget.target : null;
      const token = focusedPdf ? __bridgeRuntime.ports.pdfTokenFromTarget(focusedPdf) : null;
      const ownerWc = focusedPdf?.ownerWebContents || focused || null;
      const publication = __bridgeRuntime.runtime.targets.activePdfTargetAdapter?.getPublication?.() || null;
      const publishedFilePath = publication?.known && publication?.token === token ? (publication.filePath || null) : null;
      const action = {
          at: new Date().toISOString(),
          source: String(source || 'category-shortcut'),
          id: category.id,
          label: category.label,
          accelerator: category.accelerator,
          slot: category.slot || null,
          triggerSeq: __bridgeRuntime.runtime.shortcuts.triggerCounter,
          pending: true,
          token: token || null,
          filePath: publishedFilePath,
          focusedWebContents: __bridgeRuntime.ports.safeDescribe(focused, focused),
          focusedPdfTarget: __bridgeRuntime.ports.safeDescribe(focusedPdf, focused),
          focusedIsPdf: !!focusedPdf,
          copyCalled: false,
          syntheticCtrlCCalled: false,
          captureMethod: null,
          captureAttempts: [],
          selectionSource: null,
          selectionContext: null,
          navigationState: null,
          navigationStateError: null,
          ok: false,
          selectionText: '',
          error: null
      };
      try {
          if (!focused)
              throw new Error('getFocusedWebContents() returnerte null');
          if (!action.focusedIsPdf || !focusedPdf || !token)
              throw new Error('Fokusert WebContents/frame er ikke aktiv PDF');
          // Preserve the exact user viewport before the PDF bytes are rewritten and
          // the iframe is reloaded. Viewport capture is best-effort: a failure must not
          // block the category write, but a successful state is forwarded to the
          // renderer and reused by the same refresh path as the context-menu route.
          const navigation = await __bridgeRuntime.ports.capturePdfNavigationState(focusedPdf);
          if (navigation?.ok) {
              action.navigationState = {
                  source: 'category-shortcut-current-viewport',
                  page: Number(navigation.page),
                  zoom: Number(navigation.zoom),
                  point: { x: Number(navigation.point?.x || 0), y: Number(navigation.point?.y || 0) },
                  position: navigation.position ? { x: Number(navigation.position.x || 0), y: Number(navigation.position.y || 0) } : null
              };
          }
          else {
              action.navigationStateError = navigation?.error || 'viewport-state unavailable';
          }
          // Keyboard selection already has authoritative INTERNAL range + geometry.
          // Do not round-trip through the clipboard/native selection and lose identity.
          if (__bridgeRuntime.runtime.keyboard.selection && __bridgeRuntime.runtime.keyboard.selection.token === token && __bridgeRuntime.runtime.keyboard.selection.text && Array.isArray(__bridgeRuntime.runtime.keyboard.selection.rects) && __bridgeRuntime.runtime.keyboard.selection.rects.length) {
              action.selectionText = String(__bridgeRuntime.runtime.keyboard.selection.text);
              action.captureMethod = 'keyboard-selection-state';
              action.selectionSource = 'keyboard-selection-state';
              action.selectionContext = {
                  selectionSource: 'keyboard-selection-state',
                  keyboardSelectionState: {
                      token: __bridgeRuntime.runtime.keyboard.selection.token,
                      text: __bridgeRuntime.runtime.keyboard.selection.text,
                      range: __bridgeRuntime.runtime.keyboard.selection.range || null,
                      rects: __bridgeRuntime.runtime.keyboard.selection.rects,
                      selectionHint: __bridgeRuntime.runtime.keyboard.selection.selectionHint || null,
                      selectionModel: __bridgeRuntime.runtime.keyboard.selection.selectionModel || null,
                      direction: __bridgeRuntime.runtime.keyboard.selection.direction || null
                  }
              };
              action.ok = true;
              __bridgeRuntime.ports.finishShortcut(action, ownerWc);
              return action;
          }
          // Native mouse selection uses the same canonical capture helper as the rest
          // of the embedded keyboard/copy bridge instead of a private polling loop.
          const ownerWc = focusedPdf?.ownerWebContents || focused;
          const capture = await __bridgeRuntime.ports.captureSelectedTextFromPdf(focusedPdf, ownerWc);
          action.captureMethod = capture?.method || null;
          action.captureAttempts = Array.isArray(capture?.attempts) ? capture.attempts : [];
          action.copyCalled = action.captureAttempts.some(a => String(a?.method || '').includes('.copy'));
          action.syntheticCtrlCCalled = action.captureAttempts.some(a => String(a?.method || '').includes('synthetic-ctrl-c'));
          action.selectionText = String(capture?.text || '');
          action.selectionSource = 'native-selection-capture';
          if (!action.selectionText)
              throw new Error('Ingen selectionText fra canonical embedded PDF capture');
          action.ok = true;
          __bridgeRuntime.ports.finishShortcut(action, ownerWc);
          return action;
      }
      catch (e) {
          action.error = e instanceof Error ? e.message : String(e);
          __bridgeRuntime.ports.finishShortcut(action, ownerWc);
          return action;
      }
  }

  attachOwnerRuntime(wc) {
      const __bridgeRuntime = this;
      if (!wc)
          return;
      __bridgeRuntime.ports.attachContextListener(wc);
      __bridgeRuntime.ports.attachEmbeddedKeyboardInputListener(wc);
      __bridgeRuntime.ports.attachPdfFrameLifecycle(wc);
  }

  detachOwnerLifecycle() {
      const __bridgeRuntime = this;
      if (__bridgeRuntime.runtime.lifecycle.webContentsCreatedHandler) {
          try {
              app.removeListener('web-contents-created', __bridgeRuntime.runtime.lifecycle.webContentsCreatedHandler);
          }
          catch (_) { }
          __bridgeRuntime.runtime.lifecycle.webContentsCreatedHandler = null;
      }
      __bridgeRuntime.ports.detachPdfFrameLifecycleListeners();
  }

  uninstall() {
      const __bridgeRuntime = this;
      try {
          __bridgeRuntime.runtime.targets.activePdfTargetAdapter?.reset();
      }
      catch (_) { }
      __bridgeRuntime.runtime.targets.embeddedPdfTargetCache.clear();
      __bridgeRuntime.ports.unregisterEscapeShortcut();
      __bridgeRuntime.ports.clearRendererMenuOpenState();
      __bridgeRuntime.ports.detachOwnerLifecycle();
      __bridgeRuntime.ports.detachContextListeners();
      __bridgeRuntime.ports.detachEmbeddedKeyboardInputListeners();
      try {
          void __bridgeRuntime.ports.clearKeyboardSelection('uninstall');
      }
      catch (_) { }
      __bridgeRuntime.ports.stopWrapperRuntimeInfrastructure();
      __bridgeRuntime.state.installed = false;
      return __bridgeRuntime.ports.getState();
  }

  install() {
      const __bridgeRuntime = this;
      try {
          __bridgeRuntime.ports.uninstall();
      }
      catch (_) { }
      __bridgeRuntime.state = __bridgeRuntime.ports.freshState();
      try {
          __bridgeRuntime.state.installed = true;
          __bridgeRuntime.ports.setEmbeddedKeyboardRoutingMode('before-input-event');
          for (const wc of webContents.getAllWebContents() || [])
              __bridgeRuntime.ports.attachOwnerRuntime(wc);
          __bridgeRuntime.runtime.lifecycle.webContentsCreatedHandler = (_event, wc) => {
              __bridgeRuntime.ports.attachOwnerRuntime(wc);
          };
          app.on('web-contents-created', __bridgeRuntime.runtime.lifecycle.webContentsCreatedHandler);
          // Existing wrappers may predate Main Bridge installation when Obsidian restores
          // workspace state. Reconcile them once immediately; future wrappers are handled
          // by frame-created/did-frame-navigate events and renderer runtime-ready signals.
          void __bridgeRuntime.ports.reconcileExistingPdfRuntime('main-install-reconciliation');
      }
      catch (e) {
          __bridgeRuntime.state.installError = e instanceof Error ? e.message : String(e);
          __bridgeRuntime.state.installed = false;
      }
      return __bridgeRuntime.ports.getState();
  }

  // Explicit main-process capability diagnostic for the supported runtime.
  getPlatformCapabilities() {
      const __bridgeRuntime = this;
      const out = {
          contractVersion: '0.1',
          generatedAt: new Date().toISOString(),
          bridgeVersion: VERSION,
          runtimeContract: { obsidianVersion: '1.13.7', electronMajor: 43, pdfHostingMode: 'embedded-frame' },
          chromiumPdfRuntime: __bridgeRuntime.chromiumPdfRuntimeDriver.getCapabilities(),
          process: {
              type: process.type || null,
              platform: process.platform || null,
              arch: process.arch || null,
              pid: process.pid || null,
              versions: process.versions ? {
                  electron: process.versions.electron || null,
                  chrome: process.versions.chrome || null,
                  node: process.versions.node || null,
                  v8: process.versions.v8 || null
              } : null
          },
          app: {
              available: !!app,
              getVersionFunction: typeof app?.getVersion === 'function',
              version: null
          },
          capabilities: {
              webContentsGetAll: typeof webContents?.getAllWebContents === 'function',
              webContentsGetFocused: typeof webContents?.getFocusedWebContents === 'function',
              browserWindowGetAll: typeof BrowserWindow?.getAllWindows === 'function',
              escapeGlobalShortcutRegister: typeof globalShortcut?.register === 'function',
              escapeGlobalShortcutIsRegistered: typeof globalShortcut?.isRegistered === 'function',
              beforeInputEventEmbeddedRouting: true,
              webFrameMainFromId: typeof webFrameMain?.fromId === 'function',
              frameLifecycleEvents: true,
              clipboardReadText: typeof clipboard?.readText === 'function',
              clipboardWriteText: typeof clipboard?.writeText === 'function',
              screenGetCursorScreenPoint: typeof screen?.getCursorScreenPoint === 'function'
          },
          runtime: {
              webContentsCount: null,
              embeddedPdfFrameCount: null,
              focusedPdfToken: null,
              focusedWebContents: null,
              browserWindowCount: null,
              errors: []
          }
      };
      try {
          if (out.app.getVersionFunction)
              out.app.version = app.getVersion();
      }
      catch (e) {
          out.runtime.errors.push('app.getVersion: ' + String(e && e.message || e));
      }
      let all = [];
      try {
          if (out.capabilities.webContentsGetAll)
              all = webContents.getAllWebContents() || [];
          out.runtime.webContentsCount = all.length;
          let embeddedCount = 0;
          for (const wc of all) {
              try {
                  embeddedCount += __bridgeRuntime.ports.listFrameSubtree(wc).filter(frame => !!pdfTokenFromWrapperFrameUrl(__bridgeRuntime.ports.safeFrameUrl(frame))).length;
              }
              catch (_) { }
          }
          out.runtime.embeddedPdfFrameCount = embeddedCount;
      }
      catch (e) {
          out.runtime.errors.push('webContents.getAllWebContents: ' + String(e && e.message || e));
      }
      try {
          if (out.capabilities.webContentsGetFocused) {
              const focused = webContents.getFocusedWebContents();
              out.runtime.focusedWebContents = __bridgeRuntime.ports.safeDescribe(focused, focused);
              out.runtime.focusedPdfToken = __bridgeRuntime.ports.focusedPdfTokenForWebContents(focused);
              out.runtime.focusedFrame = __bridgeRuntime.ports.describeFrame(focused?.focusedFrame || null);
          }
      }
      catch (e) {
          out.runtime.errors.push('webContents.getFocusedWebContents: ' + String(e && e.message || e));
      }
      try {
          if (out.capabilities.browserWindowGetAll)
              out.runtime.browserWindowCount = (BrowserWindow.getAllWindows() || []).length;
      }
      catch (e) {
          out.runtime.errors.push('BrowserWindow.getAllWindows: ' + String(e && e.message || e));
      }
      return JSON.parse(JSON.stringify(out));
  }

  getState() {
      const __bridgeRuntime = this;
      let focused = null;
      try {
          focused = webContents.getFocusedWebContents();
      }
      catch (_) { }
      const snapshot = [];
      try {
          for (const wc of webContents.getAllWebContents() || [])
              snapshot.push(__bridgeRuntime.ports.safeDescribe(wc, focused));
      }
      catch (_) { }
      const focusedFrame = (() => { try {
          return __bridgeRuntime.ports.describeFrame(focused?.focusedFrame || null);
      }
      catch (_) {
          return null;
      } })();
      const focusedPdfToken = __bridgeRuntime.ports.focusedPdfTokenForWebContents(focused);
      return JSON.parse(JSON.stringify({ ...__bridgeRuntime.state, focusedWebContents: __bridgeRuntime.ports.safeDescribe(focused, focused), focusedFrame, focusedPdfToken, webContentsSnapshot: snapshot }));
  }
}

module.exports = { MainBridgeLifecycleFeature };
