'use strict';

class MainBridgeKernelFeature {
  freshState() {
      const __bridgeRuntime = this;
      return {
          version: VERSION,
          installed: false,
          mainProcessPid: process.pid,
          shortcutTriggerSeq: 0,
          shortcutSeq: 0,
          lastShortcutAction: null,
          menuShowSeq: 0,
          lastMenuShow: null,
          contextListenerCount: 0,
          contextEventSeq: 0,
          lastContextEvent: null,
          rendererMenuOpen: false,
          escapeRegistered: false,
          escapeDismissSeq: 0,
          lastEscapeDismiss: null,
          filterWebContentsCount: 0,
          filteredListenerCount: 0,
          suppressedListenerCallCount: 0,
          lastSuppressedListenerCall: null,
          lastFilterScan: null,
          pdfRuntimeRegistrationSeq: 0,
          pdfRuntimeRegistrationCount: 0,
          pdfRuntimeRegisteredWrapperCount: 0,
          lastPdfRuntimeRegistration: null,
          pdfRuntimeFrameLifecycleSeq: 0,
          lastPdfRuntimeFrameLifecycle: null,
          pdfRuntimeFrameLifecycleListenerCount: 0,
          lastWrapperInstrumentationState: null,
          keyboardAutoScrollSeq: 0,
          lastKeyboardAutoScroll: null,
          obsidianShortcutRouteSeq: 0,
          lastObsidianShortcutRoute: null,
          embeddedKeyboardInputListenerCount: 0,
          embeddedKeyboardInputSeq: 0,
          lastEmbeddedKeyboardInput: null,
          embeddedKeyboardRoutingMode: null,
          keyboardSelectionTriggerSeq: 0,
          lastKeyboardSelectionTrigger: null,
          keyboardSelectionSetSeq: 0,
          lastKeyboardSelectionSet: null,
          keyboardSelectionResultSeq: 0,
          lastKeyboardSelectionResult: null,
          keyboardCopySeq: 0,
          lastKeyboardCopy: null,
          includeHeaderFooterText: false,
          nativeMouseCopySeq: 0,
          lastNativeMouseCopy: null,
          keyboardSelection: null,
          keyboardSelectionClearSeq: 0,
          lastKeyboardSelectionClear: null,
          nativeSelectionClearSeq: 0,
          lastNativeSelectionClear: null,
          pdfMouseActivationSeq: 0,
          lastPdfMouseActivation: null,
          lastKeyboardSelectionMouseClearProbe: null,
          linkLocatorSeq: 0,
          lastLinkLocator: null,
          activePdfIdentity: null,
          activePdfIdentitySeq: 0,
          lastReservedShortcutTarget: null,
          lastEmbeddedPdfTargetResolution: null,
          installError: null
      };
  }

  safeDescribe(value, focused) {
      const __bridgeRuntime = this;
      if (!value)
          return null;
      if (__bridgeRuntime.ports.isEmbeddedPdfTarget(value)) {
          const owner = value.ownerWebContents;
          return {
              id: (() => { try {
                  return owner?.id ?? null;
              }
              catch (_) {
                  return null;
              } })(),
              type: 'embedded-pdf-target',
              url: __bridgeRuntime.ports.safeFrameUrl(value.wrapperFrame),
              title: null,
              isFocusedWebContents: !!focused && __bridgeRuntime.ports.sameWebContents(owner, focused),
              pdfiumHostingMode: 'embedded-frame',
              pdfToken: value.token,
              wrapperFrame: __bridgeRuntime.ports.describeFrame(value.wrapperFrame)
          };
      }
      const out = {};
      try {
          out.id = value.id;
      }
      catch (_) { }
      try {
          out.type = value.getType();
      }
      catch (_) { }
      try {
          out.url = value.getURL();
      }
      catch (_) { }
      try {
          out.title = value.getTitle();
      }
      catch (_) { }
      try {
          out.isFocusedWebContents = !!focused && __bridgeRuntime.ports.sameWebContents(value, focused);
      }
      catch (_) { }
      return out;
  }

  isEmbeddedPdfTarget(target) {
      const __bridgeRuntime = this;
      return !!target && target?.kind === 'embedded-pdf-target' && !!target?.ownerWebContents && !!target?.wrapperFrame && !!String(target?.token || '').trim();
  }

  safeFrameUrl(frame) {
      const __bridgeRuntime = this;
      try {
          return String(frame?.url || '');
      }
      catch (_) {
          return '';
      }
  }

  pdfTokenFromAnyFrame(frame) {
      const __bridgeRuntime = this;
      let current = frame || null;
      for (let depth = 0; current && depth < 8; depth += 1) {
          const token = pdfTokenFromWrapperFrameUrl(__bridgeRuntime.ports.safeFrameUrl(current));
          if (token)
              return token;
          try {
              current = current.parent || null;
          }
          catch (_) {
              current = null;
          }
      }
      return null;
  }

  focusedPdfTokenForWebContents(wc) {
      const __bridgeRuntime = this;
      if (!wc)
          return null;
      if (__bridgeRuntime.ports.isEmbeddedPdfTarget(wc))
          return String(wc.token || '') || null;
      try {
          return __bridgeRuntime.ports.pdfTokenFromAnyFrame(wc.focusedFrame || null);
      }
      catch (_) {
          return null;
      }
  }

  webContentsFocusMatchesPdfToken(wc, token) {
      const __bridgeRuntime = this;
      const safeToken = String(token || '').trim();
      if (!wc || !safeToken)
          return false;
      return __bridgeRuntime.ports.focusedPdfTokenForWebContents(wc) === safeToken;
  }

  describeFrame(frame) {
      const __bridgeRuntime = this;
      if (!frame)
          return null;
      const out = { url: __bridgeRuntime.ports.safeFrameUrl(frame) };
      try {
          out.processId = frame.processId;
      }
      catch (_) { }
      try {
          out.routingId = frame.routingId;
      }
      catch (_) { }
      try {
          out.isMainFrame = !!frame.isMainFrame;
      }
      catch (_) { }
      return out;
  }

  sameWebContents(a, b) {
      const __bridgeRuntime = this;
      if (!a || !b)
          return false;
      try {
          const ai = Number(a.id), bi = Number(b.id);
          return Number.isFinite(ai) && Number.isFinite(bi) && ai === bi;
      }
      catch (_) {
          return false;
      }
  }

  createEmbeddedPdfTarget(ownerWc, token, wrapperFrame) {
      const __bridgeRuntime = this;
      const safeToken = String(token || '').trim();
      if (!ownerWc || !safeToken || !wrapperFrame)
          return null;
      const key = `${ownerWc.id}:${safeToken}:${wrapperFrame.processId}:${wrapperFrame.routingId}`;
      const cached = __bridgeRuntime.runtime.targets.embeddedPdfTargetCache.get(key);
      if (cached && !cached.isDestroyed?.())
          return cached;
      let cachedViewerFrame = null;
      async function resolveViewerFrame() {
          const resolved = await __bridgeRuntime.chromiumPdfRuntimeDriver.resolveViewerFrame({
              ownerWc,
              wrapperFrame,
              cachedFrame: cachedViewerFrame
          });
          if (!resolved?.ok || !resolved.frame) {
              cachedViewerFrame = null;
              return null;
          }
          cachedViewerFrame = resolved.frame;
          return cachedViewerFrame;
      }
      // This object is an explicit PDF runtime target, not a WebContents proxy.
      // runtimeFrame is the only execution surface and resolves the canonical
      // Chromium pdf-viewer ancestor on demand through RuntimeDriver.
      const runtimeFrame = {
          get url() { return __bridgeRuntime.ports.safeFrameUrl(cachedViewerFrame || wrapperFrame); },
          get processId() { try {
              return (cachedViewerFrame || wrapperFrame).processId;
          }
          catch (_) {
              return null;
          } },
          get routingId() { try {
              return (cachedViewerFrame || wrapperFrame).routingId;
          }
          catch (_) {
              return null;
          } },
          get isMainFrame() { return false; },
          isDestroyed() { try {
              return !!ownerWc.isDestroyed?.();
          }
          catch (_) {
              return false;
          } },
          async executeJavaScript(code, userGesture) {
              const frame = await resolveViewerFrame();
              if (!frame || typeof frame.executeJavaScript !== 'function')
                  throw new Error('Embedded PDF viewer-frame mangler executeJavaScript()');
              return frame.executeJavaScript(code, userGesture);
          }
      };
      const target = {
          kind: 'embedded-pdf-target',
          token: safeToken,
          ownerWebContents: ownerWc,
          wrapperFrame,
          runtimeFrame,
          isDestroyed: () => { try {
              return !!ownerWc.isDestroyed?.();
          }
          catch (_) {
              return false;
          } }
      };
      __bridgeRuntime.runtime.targets.embeddedPdfTargetCache.set(key, target);
      return target;
  }

  webContentsContainsPdfFrame(wc) {
      const __bridgeRuntime = this;
      if (!wc)
          return false;
      try {
          return __bridgeRuntime.ports.listFrameSubtree(wc).some(frame => !!pdfTokenFromWrapperFrameUrl(__bridgeRuntime.ports.safeFrameUrl(frame)));
      }
      catch (_) {
          return false;
      }
  }

  isPdfContext(params) {
      const __bridgeRuntime = this;
      return __bridgeRuntime.chromiumPdfRuntimeDriver.isPdfContext(params);
  }

  extractPdfToken(params) {
      const __bridgeRuntime = this;
      const frameURL = String(params?.frameURL || '');
      const m = frameURL.match(/\/pdf\/([^/?#]+)\.pdf(?:#.*)?$/i);
      return m ? m[1] : null;
  }

  setEmbeddedPdfTargetResolution(record) {
      const __bridgeRuntime = this;
      __bridgeRuntime.state.lastEmbeddedPdfTargetResolution = record ? { ...record } : null;
      return __bridgeRuntime.state.lastEmbeddedPdfTargetResolution;
  }

  recordEmbeddedPdfTargetResolution(result) {
      const __bridgeRuntime = this;
      if (!result?.ok || !result?.target)
          return result;
      const focused = (() => { try {
          return webContents.getFocusedWebContents();
      }
      catch (_) {
          return null;
      } })();
      const record = {
          at: new Date().toISOString(),
          token: result.token || null,
          reason: result.reason || null,
          owner: __bridgeRuntime.ports.safeDescribe(result.ownerWc || result.target?.ownerWebContents || null, focused),
          wrapperFrame: __bridgeRuntime.ports.describeFrame(result.wrapperFrame || result.target?.wrapperFrame || null),
          duplicateMatchCount: Number(result.matchCount || 0) > 1 ? Number(result.matchCount || 0) : undefined
      };
      if (record.duplicateMatchCount === undefined)
          delete record.duplicateMatchCount;
      __bridgeRuntime.ports.setEmbeddedPdfTargetResolution(record);
      return result;
  }

  resolveEmbeddedPdfTargetExact(token) {
      const __bridgeRuntime = this;
      return __bridgeRuntime.embeddedPdfTargetAdapter.resolveExact(token);
  }

  findEmbeddedPdfTargetExact(token) {
      const __bridgeRuntime = this;
      return __bridgeRuntime.ports.resolveEmbeddedPdfTargetExact(token).target;
  }
}

module.exports = { MainBridgeKernelFeature };
