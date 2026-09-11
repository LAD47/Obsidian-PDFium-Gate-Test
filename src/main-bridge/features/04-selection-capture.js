'use strict';

class MainBridgeSelectionCaptureFeature {
  // Keyboard selection mouse takeover is detected only from the canonical
  // wrapper Pointer Event instrumentation. No parallel owner mouse route exists.
  async capturePdfWrapperMouseGestureHint(pdfTarget) {
      const __bridgeRuntime = this;
      const out = { ok: false, source: 'pdf-wrapper', raw: null, down: null, up: null, ageMs: null, error: null, frame: null, frameResolution: null, scrollerOffset: null, wrapperScroll: null };
      try {
          const expectedToken = String(__bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget) || '').trim();
          if (!expectedToken)
              throw new Error('PDF-token mangler for wrapper-musegest');
          // Gesture recency is evidence about
          // the gesture itself, never a target-selection rule. First prove the one
          // physical Chromium <embed> wrapper, then read lastDown/lastUp only there.
          const executed = await __bridgeRuntime.pdfWrapperFrameAdapter.executeExactVerified(pdfTarget, expectedToken, `(() => {
        const x=window.__pdfiumGateAutoScroll;
        if(!x||!x.state) return null;
        const s=x.state;
        return {href:String(location.href),lastDown:s.lastDown||null,lastUp:s.lastUp||null,lastEvent:s.lastEvent||null,downSeq:Number(s.downSeq||0),upSeq:Number(s.upSeq||0),instrumentationVersion:Number(s.instrumentationVersion||0),currentScroll:{x:Number(window.scrollX||0),y:Number(window.scrollY||0)}};
      })()`, true);
          out.frameResolution = {
              reason: executed?.reason || null,
              candidateCount: Number(executed?.candidateCount || 0),
              matchCount: Number(executed?.matchCount || 0),
              verifiedCount: Number(executed?.verifiedCount || 0),
              verification: Array.isArray(executed?.verification) ? executed.verification : [],
              expectedToken
          };
          if (!executed?.ok || !executed.frame)
              throw new Error(executed?.error || 'verifisert Chromium PDF-wrapper ble ikke funnet');
          const wrapperResult = executed.result;
          if (!wrapperResult || (!wrapperResult.lastDown && !wrapperResult.lastUp))
              throw new Error('ingen lagret wrapper-musegest på verifisert PDF-wrapper');
          out.raw = wrapperResult;
          out.frame = { url: String(executed.frame.url || ''), processId: executed.frame.processId, routingId: executed.frame.routingId };
          const latest = wrapperResult.lastUp || wrapperResult.lastDown;
          const t = Date.parse(String(latest?.at || ''));
          out.ageMs = Number.isFinite(t) ? Math.max(0, Date.now() - t) : null;
          out.wrapperScroll = wrapperResult.currentScroll || null;
          const target = pdfTarget?.runtimeFrame || null;
          if (!target || typeof target.executeJavaScript !== 'function')
              throw new Error('PDF mainFrame executeJavaScript mangler');
          const offset = await __bridgeRuntime.chromiumPdfRuntimeDriver.captureScrollerOffset(target);
          if (!offset?.ok)
              throw new Error(offset?.error || 'kunne ikke finne scroller-offset');
          out.scrollerOffset = { left: Number(offset.left || 0), top: Number(offset.top || 0) };
          const currentScrollX = Number(wrapperResult?.currentScroll?.x || 0);
          const currentScrollY = Number(wrapperResult?.currentScroll?.y || 0);
          const convert = async (p) => {
              if (!p)
                  return null;
              const eventScrollX = Number.isFinite(Number(p.scrollX)) ? Number(p.scrollX) : currentScrollX;
              const eventScrollY = Number.isFinite(Number(p.scrollY)) ? Number(p.scrollY) : currentScrollY;
              const rawWrapperPoint = { x: Number(p.x), y: Number(p.y) };
              // Pointer coordinates were captured in the wrapper viewport at event time.
              // During native cross-page drag the wrapper autoscrolls. Reconstruct where
              // that same document point lives in the CURRENT viewport before asking the
              // Chromium viewer to convert it to page coordinates.
              const wrapperPoint = {
                  x: rawWrapperPoint.x + eventScrollX - currentScrollX,
                  y: rawWrapperPoint.y + eventScrollY - currentScrollY
              };
              const remotePoint = { x: wrapperPoint.x + out.scrollerOffset.left, y: wrapperPoint.y + out.scrollerOffset.top };
              const hit = await __bridgeRuntime.ports.capturePdfViewerPoint(target, remotePoint.x, remotePoint.y);
              const c = Array.isArray(hit?.candidates) && hit.candidates.length ? hit.candidates[0] : null;
              if (!c)
                  return { ok: false, rawWrapper: rawWrapperPoint, wrapper: wrapperPoint, remote: remotePoint, eventScroll: { x: eventScrollX, y: eventScrollY }, currentScroll: { x: currentScrollX, y: currentScrollY }, error: hit?.error || 'ingen PDF-side' };
              const point = { pageIndex: Number(c.pageIndex), x: Number(c.pageX), y: Number(c.pageY) };
              return { ok: [point.pageIndex, point.x, point.y].every(Number.isFinite), rawWrapper: rawWrapperPoint, wrapper: wrapperPoint, remote: remotePoint, eventScroll: { x: eventScrollX, y: eventScrollY }, currentScroll: { x: currentScrollX, y: currentScrollY }, point };
          };
          out.down = await convert(wrapperResult.lastDown);
          out.up = await convert(wrapperResult.lastUp);
          out.ok = !!(out.down?.ok || out.up?.ok);
          if (!out.ok)
              throw new Error('kunne ikke konvertere wrapper-musegest til PDF-koordinater');
      }
      catch (e) {
          out.error = e instanceof Error ? e.message : String(e);
      }
      return out;
  }

  async capturePdfMouseGestureHint(pdfTarget) {
      const __bridgeRuntime = this;
      // Electron 43 canonical path: wrapper instrumentation is the single physical
      // mouse-gesture source. No raw PDF-WebContents event fallback exists.
      return __bridgeRuntime.ports.capturePdfWrapperMouseGestureHint(pdfTarget);
  }

  pdfTokenFromTarget(target) {
      const __bridgeRuntime = this;
      if (!__bridgeRuntime.ports.isEmbeddedPdfTarget(target))
          return null;
      return String(target.token || '').trim() || null;
  }

  // Canonical embedded targets carry their physical Obsidian owner explicitly.
  // No global WebContents scan or iframe-token owner fallback is permitted here.
  resolveEmbeddedPdfOwner(pdfTarget) {
      const __bridgeRuntime = this;
      const token = __bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget);
      if (!__bridgeRuntime.ports.isEmbeddedPdfTarget(pdfTarget) || !token) {
          return { ok: false, token: token || null, ownerWc: null, method: null, reason: 'invalid-embedded-target', error: 'Eksakt embedded PDF-target mangler' };
      }
      const ownerWc = pdfTarget.ownerWebContents || null;
      if (!ownerWc)
          return { ok: false, token, ownerWc: null, method: null, reason: 'missing-owner', error: 'Embedded PDF-target mangler owner WebContents' };
      try {
          if (ownerWc.isDestroyed?.())
              return { ok: false, token, ownerWc: null, method: null, reason: 'owner-destroyed', error: 'Embedded PDF owner WebContents er destroyed' };
      }
      catch (_) { }
      return { ok: true, token, ownerWc, iframe: null, method: 'embedded-target-owner', reason: 'explicit-owner', matchCount: 1, candidateCount: 1, error: null };
  }

  async routeObsidianCommandFromPdf(pdfTarget, shortcut, source) {
      const __bridgeRuntime = this;
      const route = {
          at: new Date().toISOString(), source: String(source || 'unknown'),
          id: shortcut?.id || null, accelerator: shortcut?.accelerator || null,
          commandId: shortcut?.commandId || null,
          pdfTarget: __bridgeRuntime.ports.safeDescribe(pdfTarget, webContents.getFocusedWebContents()),
          owner: null, ownerMethod: null, dispatched: false, executeResult: null, error: null
      };
      try {
          const found = await __bridgeRuntime.ports.resolveEmbeddedPdfOwner(pdfTarget);
          const ownerWc = found?.ownerWc || null;
          route.ownerMethod = found?.method || null;
          route.owner = __bridgeRuntime.ports.safeDescribe(ownerWc, webContents.getFocusedWebContents());
          if (!ownerWc)
              throw new Error('Fant ikke Obsidian-vinduet som eier PDF-vieweren');
          const dispatch = await __bridgeRuntime.obsidianCommandDispatchAdapter.dispatchExact(ownerWc, {
              source: 'pdfium-gate-main-bridge',
              shortcutId: shortcut.id,
              accelerator: shortcut.accelerator,
              commandId: shortcut.commandId,
              at: new Date().toISOString()
          });
          route.executeResult = dispatch?.executeResult || null;
          route.dispatched = !!dispatch?.dispatched;
          if (!dispatch?.ok || !route.dispatched)
              throw new Error(dispatch?.error || 'CustomEvent ble ikke dispatch-et');
      }
      catch (e) {
          route.error = e instanceof Error ? e.message : String(e);
      }
      __bridgeRuntime.state.obsidianShortcutRouteSeq += 1;
      route.routeSeq = __bridgeRuntime.state.obsidianShortcutRouteSeq;
      __bridgeRuntime.state.lastObsidianShortcutRoute = route;
      return route;
  }

  async captureSelectedTextFromPdf(pdfTarget, ownerWc) {
      const __bridgeRuntime = this;
      const previousClipboard = String(clipboard.readText() || '');
      const attempts = [];
      const mods = process.platform === 'darwin' ? ['meta'] : ['control'];
      const timingNowMs = () => Number(process.hrtime.bigint()) / 1e6;
      const roundMs = value => Math.round(Number(value || 0) * 10) / 10;
      const describeFocusedFrame = (wc) => {
          try {
              const f = wc?.focusedFrame || null;
              return f ? { url: String(f.url || ''), processId: f.processId, routingId: f.routingId, isMainFrame: !!f.isMainFrame } : null;
          }
          catch (_) {
              return null;
          }
      };
      const tryMethod = async (method, wc, invoke, timeoutMs = 180) => {
          const methodStarted = timingNowMs();
          const rec = { method, webContents: __bridgeRuntime.ports.safeDescribe(wc, webContents.getFocusedWebContents()), focusedFrame: describeFocusedFrame(wc), ok: false, textLength: 0, durationMs: null, error: null };
          const finishAttempt = () => { rec.durationMs = roundMs(timingNowMs() - methodStarted); attempts.push(rec); };
          if (!wc) {
              rec.error = 'WebContents mangler';
              finishAttempt();
              return null;
          }
          const sentinel = `__PDFIUM_KEYSEL_${VERSION}_${Date.now()}_${Math.random()}__`;
          try {
              clipboard.writeText(sentinel);
          }
          catch (e) {
              rec.error = 'clipboard sentinel: ' + String(e && e.message || e);
              finishAttempt();
              return null;
          }
          try {
              invoke();
          }
          catch (e) {
              rec.error = String(e && e.message || e);
              finishAttempt();
              return null;
          }
          const started = Date.now();
          while (Date.now() - started < timeoutMs) {
              await new Promise(r => setTimeout(r, 15));
              let text = '';
              try {
                  text = String(clipboard.readText() || '');
              }
              catch (_) { }
              if (text && text !== sentinel && !/^__PDFIUM_KEYSEL_/i.test(text)) {
                  rec.ok = true;
                  rec.textLength = text.length;
                  finishAttempt();
                  return { text, method, attempts };
              }
          }
          rec.error = rec.error || 'clipboard uendret';
          finishAttempt();
          return null;
      };
      try {
          // Native selection capture has one supported Electron 43 route: the explicit
          // Obsidian owner WebContents whose focusedFrame is the embedded PDF.
          let hit = await tryMethod('owner-webContents.copy', ownerWc, () => {
              if (typeof ownerWc.copy !== 'function')
                  throw new Error('copy() mangler');
              ownerWc.copy();
          });
          if (hit)
              return hit;
          hit = await tryMethod('owner-webContents.synthetic-ctrl-c', ownerWc, () => {
              if (typeof ownerWc.sendInputEvent !== 'function')
                  throw new Error('sendInputEvent() mangler');
              __bridgeRuntime.runtime.keyboard.syntheticCtrlCUntil = Date.now() + 250;
              ownerWc.sendInputEvent({ type: 'keyDown', keyCode: 'C', modifiers: mods });
              ownerWc.sendInputEvent({ type: 'keyUp', keyCode: 'C', modifiers: mods });
          });
          if (hit)
              return hit;
          return { text: '', method: null, attempts };
      }
      finally {
          try {
              clipboard.writeText(previousClipboard);
          }
          catch (_) { }
      }
  }

  async capturePdfViewerKeyboardState(pdfTarget, includeViewportMap = false) {
      const __bridgeRuntime = this;
      const target = pdfTarget?.runtimeFrame || null;
      return __bridgeRuntime.chromiumPdfRuntimeDriver.captureKeyboardState(target, includeViewportMap);
  }

  async capturePdfNavigationState(pdfTarget) {
      const __bridgeRuntime = this;
      const target = pdfTarget?.runtimeFrame || null;
      if (!target)
          return { ok: false, error: 'PDF runtimeFrame mangler for viewport-state' };
      return __bridgeRuntime.chromiumPdfRuntimeDriver.captureNavigationState(target);
  }

  async capturePdfKeyboardCursorHint(pdfTarget, found) {
      const __bridgeRuntime = this;
      const out = { ok: false, cursorScreenPoint: null, contentBounds: null, rootPoint: null, remotePoint: null, candidate: null, error: null };
      try {
          const ownerWc = found?.ownerWc || null;
          if (!ownerWc)
              throw new Error('owner WebContents mangler');
          let iframe = found?.iframe || null;
          if (!iframe) {
              const token = __bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget);
              const hit = await __bridgeRuntime.ports.capturePdfIframeRect(ownerWc, token);
              iframe = hit?.match || null;
          }
          if (!iframe?.rect)
              throw new Error('PDF-iframe-rektangel mangler');
          const cursorHit = __bridgeRuntime.screenPointAdapter.getCursorScreenPoint();
          if (!cursorHit?.ok)
              throw new Error(cursorHit?.error || 'Musepekerposisjon er ikke tilgjengelig');
          const cursor = cursorHit.point;
          out.cursorScreenPoint = { x: Number(cursor.x), y: Number(cursor.y) };
          const windowHit = __bridgeRuntime.browserWindowAdapter.getContentBoundsExact(ownerWc);
          if (!windowHit?.ok)
              throw new Error(windowHit?.error || 'BrowserWindow for Obsidian owner mangler');
          const bounds = windowHit.bounds;
          out.contentBounds = bounds;
          const rootX = Number(cursor.x) - Number(bounds.x);
          const rootY = Number(cursor.y) - Number(bounds.y);
          out.rootPoint = { x: rootX, y: rootY };
          const rect = iframe.rect;
          const remoteX = rootX - Number(rect.left || 0);
          const remoteY = rootY - Number(rect.top || 0);
          out.remotePoint = { x: remoteX, y: remoteY };
          const target = pdfTarget?.runtimeFrame || null;
          const hit = await __bridgeRuntime.ports.capturePdfViewerPoint(target, remoteX, remoteY);
          const c = Array.isArray(hit?.candidates) && hit.candidates.length ? hit.candidates[0] : null;
          if (!c)
              throw new Error(hit?.error || 'musepekeren traff ingen PDF-side');
          out.candidate = { pageIndex: Number(c.pageIndex), x: Number(c.pageX), y: Number(c.pageY) };
          out.ok = [out.candidate.pageIndex, out.candidate.x, out.candidate.y].every(Number.isFinite);
          if (!out.ok)
              throw new Error('ugyldig PDF-koordinat for musepeker');
      }
      catch (e) {
          out.error = e instanceof Error ? e.message : String(e);
      }
      return out;
  }

  async removeKeyboardOverlay(token) {
      const __bridgeRuntime = this;
      try {
          const pdfTarget = __bridgeRuntime.ports.findEmbeddedPdfTargetExact(token || null);
          if (!pdfTarget?.runtimeFrame)
              return { ok: false, error: 'PDF-viewer ikke funnet' };
          return await __bridgeRuntime.chromiumPdfRuntimeDriver.removeKeyboardSelectionOverlay(pdfTarget.runtimeFrame);
      }
      catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
  }

  setIncludeHeaderFooterText(value) {
      const __bridgeRuntime = this;
      __bridgeRuntime.state.includeHeaderFooterText = value === true;
      return { ok: true, includeHeaderFooterText: __bridgeRuntime.state.includeHeaderFooterText };
  }
}

module.exports = { MainBridgeSelectionCaptureFeature };
