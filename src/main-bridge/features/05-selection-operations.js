'use strict';

class MainBridgeSelectionOperationsFeature {
  async routeNativeMouseCopyFromPdf(pdfTarget, source) {
      const __bridgeRuntime = this;
      const rec = { at: new Date().toISOString(), source: String(source || 'before-input-event'), token: __bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget), capture: null, owner: null, viewerState: null, gesture: null, geometryOnly: false, dispatched: false, error: null };
      if (__bridgeRuntime.runtime.keyboard.nativeMouseCopyRouteInFlight) {
          rec.error = 'Native Ctrl+C: tidligere copy-rute pågår';
          return rec;
      }
      __bridgeRuntime.runtime.keyboard.nativeMouseCopyRouteInFlight = true;
      try {
          if (!pdfTarget || !__bridgeRuntime.ports.isEmbeddedPdfTarget(pdfTarget))
              throw new Error('Native Ctrl+C: eksakt embedded PDF target mangler');
          const found = await __bridgeRuntime.ports.resolveEmbeddedPdfOwner(pdfTarget);
          const ownerWc = found?.ownerWc || null;
          rec.owner = __bridgeRuntime.ports.safeDescribe(ownerWc, webContents.getFocusedWebContents());
          if (!ownerWc)
              throw new Error('Native Ctrl+C: fant ikke Obsidian-eier for PDF');
          // Native mouse Ctrl+C must carry the same two truths as the
          // right-click copy path: Chromium's actual selection text plus the physical
          // gesture endpoints. Geometry alone is not authoritative enough for a
          // cross-page selection and previously could expand to a much larger range.
          rec.viewerState = await __bridgeRuntime.ports.capturePdfViewerKeyboardState(pdfTarget, false);
          rec.gesture = await __bridgeRuntime.ports.capturePdfMouseGestureHint(pdfTarget);
          const downPoint = rec.gesture?.down?.point || null;
          const upPoint = rec.gesture?.up?.point || null;
          const hasTwoPoints = !!(rec.gesture?.ok && downPoint && upPoint &&
              [downPoint.pageIndex, downPoint.x, downPoint.y, upPoint.pageIndex, upPoint.x, upPoint.y].every(v => Number.isFinite(Number(v))));
          const crossPage = hasTwoPoints && Number(downPoint.pageIndex) !== Number(upPoint.pageIndex);
          const capture = await __bridgeRuntime.ports.captureSelectedTextFromPdf(pdfTarget, ownerWc);
          rec.capture = { method: capture?.method || null, textLength: String(capture?.text || '').length, attempts: Array.isArray(capture?.attempts) ? capture.attempts : [] };
          const text = String(capture?.text || '');
          rec.geometryOnly = false;
          if (!text.trim())
              throw new Error(crossPage
                  ? 'Native Ctrl+C: kunne ikke hente Chromium-selection for flersidig musemarkering; avbryter i stedet for å gjette range fra geometri alene'
                  : 'Native Ctrl+C: ingen musemarkering å kopiere');
          const detail = { source: 'pdfium-gate-main-bridge-native-copy', token: rec.token, selectedText: text, selectionSource: 'native-pdf-copy', viewerState: rec.viewerState || null, selectionGestureHint: rec.gesture?.ok ? { source: rec.gesture.source || null, down: downPoint, up: upPoint } : null, geometryOnly: rec.geometryOnly, at: new Date().toISOString() };
          const result = await __bridgeRuntime.rendererEventDispatchAdapter.dispatchExact(ownerWc, RENDERER_BRIDGE_EVENTS.NATIVE_COPY, detail);
          rec.dispatched = !!result?.ok;
          if (!rec.dispatched)
              throw new Error(result?.error || 'Native Ctrl+C: renderer-event ble ikke dispatch-et');
      }
      catch (e) {
          rec.error = e instanceof Error ? e.message : String(e);
      }
      finally {
          __bridgeRuntime.runtime.keyboard.nativeMouseCopyRouteInFlight = false;
      }
      __bridgeRuntime.state.nativeMouseCopySeq += 1;
      rec.copySeq = __bridgeRuntime.state.nativeMouseCopySeq;
      __bridgeRuntime.state.lastNativeMouseCopy = rec;
      return rec;
  }

  async routeKeyboardSelectionCopyFromPdf(pdfTarget, selection, source) {
      const __bridgeRuntime = this;
      const rec = {
          at: new Date().toISOString(), source: String(source || 'before-input-event'), token: __bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget),
          valid: false, textLength: String(selection?.text || '').length, range: selection?.range || null,
          owner: null, dispatched: false, error: null
      };
      try {
          if (!pdfTarget || !__bridgeRuntime.ports.isEmbeddedPdfTarget(pdfTarget))
              throw new Error('Keyboard Ctrl+C: eksakt embedded PDF target mangler');
          if (!rec.token || rec.token !== String(selection?.token || ''))
              throw new Error('Keyboard Ctrl+C: selection-token matcher ikke aktiv PDF');
          if (!String(selection?.text || '').trim())
              throw new Error('Keyboard Ctrl+C: selection-tekst mangler');
          const range = selection?.range || null;
          if (![Number(range?.start), Number(range?.end)].every(Number.isFinite) || Number(range.end) < Number(range.start)) {
              throw new Error('Keyboard Ctrl+C: eksakt selection-range mangler');
          }
          const found = await __bridgeRuntime.ports.resolveEmbeddedPdfOwner(pdfTarget);
          const ownerWc = found?.ownerWc || null;
          rec.owner = __bridgeRuntime.ports.safeDescribe(ownerWc, webContents.getFocusedWebContents());
          if (!ownerWc)
              throw new Error('Keyboard Ctrl+C: fant ikke Obsidian-eier for PDF');
          const detail = {
              source: 'pdfium-gate-main-bridge-keyboard-copy', token: rec.token,
              selectedText: String(selection.text || ''), selectionSource: 'keyboard-selection-state',
              keyboardSelectionState: {
                  token: rec.token, text: String(selection.text || ''), range: { start: Number(range.start), end: Number(range.end) },
                  selectionModel: selection?.selectionModel || null, selectionHint: selection?.selectionHint || null
              },
              at: new Date().toISOString()
          };
          const result = await __bridgeRuntime.rendererEventDispatchAdapter.dispatchExact(ownerWc, RENDERER_BRIDGE_EVENTS.KEYBOARD_COPY, detail);
          rec.dispatched = !!result?.ok;
          if (!rec.dispatched)
              throw new Error(result?.error || 'Keyboard Ctrl+C: renderer-event ble ikke dispatch-et');
          rec.valid = true;
      }
      catch (e) {
          rec.error = e instanceof Error ? e.message : String(e);
      }
      return __bridgeRuntime.ports.recordKeyboardCopyResult(rec);
  }

  recordKeyboardCopyResult(rec) {
      const __bridgeRuntime = this;
      __bridgeRuntime.state.keyboardCopySeq += 1;
      rec.copySeq = __bridgeRuntime.state.keyboardCopySeq;
      __bridgeRuntime.state.lastKeyboardCopy = rec;
      return rec;
  }

  async ensureKeyboardSelectionFocusVisible(pdfTarget, hint, direction) {
      const __bridgeRuntime = this;
      const out = {
          at: new Date().toISOString(), direction: String(direction || ''), hint: hint || null,
          conversion: null, wrapper: null, result: null, scrolled: false, ok: false, error: null
      };
      try {
          if (!['left', 'right', 'up', 'down'].includes(direction)) {
              out.ok = true;
              out.result = { skipped: true, reason: 'ukjent keyboard-selection-retning' };
              return out;
          }
          if (!hint)
              throw new Error('selectionHint mangler for keyboard-autoscroll');
          const converted = await __bridgeRuntime.ports.pdfPagePointToRemotePoint(pdfTarget, hint);
          out.conversion = converted;
          if (!converted?.ok)
              throw new Error(converted?.error || 'kunne ikke konvertere focus-glyph til wrapper-koordinat');
          const targetY = Number(converted?.detail?.scrollerPoint?.y);
          if (!Number.isFinite(targetY))
              throw new Error('ugyldig focus Y i PDF-wrapper');
          const wrapperResolved = __bridgeRuntime.pdfWrapperFrameAdapter.resolveExact(pdfTarget, __bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget));
          if (!wrapperResolved?.ok || !wrapperResolved.frame)
              throw new Error(wrapperResolved?.error || 'Eksakt Chromium PDF-wrapper frame ikke funnet');
          const wrapper = wrapperResolved.frame;
          out.wrapper = { url: String(wrapper.url || ''), processId: wrapper.processId, routingId: wrapper.routingId, targetY };
          const result = await __bridgeRuntime.chromiumPdfRuntimeDriver.scrollWrapperForKeyboard(wrapper, targetY, direction);
          out.result = result || null;
          if (!result?.ok)
              throw new Error(result?.error || 'keyboard-autoscroll feilet i wrapper');
          out.scrolled = !!result.moved;
          out.ok = true;
      }
      catch (e) {
          out.error = e instanceof Error ? e.message : String(e);
      }
      finally {
          __bridgeRuntime.state.keyboardAutoScrollSeq += 1;
          out.autoScrollSeq = __bridgeRuntime.state.keyboardAutoScrollSeq;
          __bridgeRuntime.state.lastKeyboardAutoScroll = out;
      }
      return out;
  }

  async setKeyboardSelection(payload) {
      const __bridgeRuntime = this;
      const rec = { at: new Date().toISOString(), payload: null, overlay: null, autoScroll: null, ok: false, error: null };
      try {
          const token = String(payload?.token || '');
          const text = String(payload?.text || '');
          const rects = Array.isArray(payload?.rects) ? payload.rects : [];
          if (!token || !text || !rects.length)
              throw new Error('token/text/rects mangler for keyboard-selection');
          const pdfTarget = __bridgeRuntime.ports.findEmbeddedPdfTargetExact(token);
          if (!pdfTarget?.runtimeFrame)
              throw new Error('Fant ikke Chromium PDF-vieweren for overlay');
          const clean = { token, text, range: payload?.range || null, rects, selectionHint: payload?.selectionHint || null, selectionModel: payload?.selectionModel || null, direction: String(payload?.direction || '') };
          rec.payload = { token, textLength: text.length, range: clean.range, rectCount: rects.length, selectionModel: clean.selectionModel, direction: clean.direction };
          rec.overlay = await __bridgeRuntime.chromiumPdfRuntimeDriver.renderKeyboardSelectionOverlay(pdfTarget.runtimeFrame, clean);
          if (!rec.overlay?.ok)
              throw new Error(rec.overlay?.error || 'Kunne ikke tegne keyboard-selection overlay');
          clean.createdAtMs = Date.now();
          __bridgeRuntime.runtime.keyboard.selection = clean;
          __bridgeRuntime.state.keyboardSelection = { token, text, textLength: text.length, range: clean.range, rectCount: rects.length, selectionHint: clean.selectionHint, selectionModel: clean.selectionModel };
          if (['left', 'right', 'up', 'down'].includes(clean.direction) && clean.selectionHint) {
              rec.autoScroll = await __bridgeRuntime.ports.ensureKeyboardSelectionFocusVisible(pdfTarget, clean.selectionHint, clean.direction);
          }
          __bridgeRuntime.ports.syncEscapeShortcut();
          rec.ok = true;
      }
      catch (e) {
          rec.error = e instanceof Error ? e.message : String(e);
      }
      __bridgeRuntime.state.keyboardSelectionSetSeq += 1;
      rec.setSeq = __bridgeRuntime.state.keyboardSelectionSetSeq;
      __bridgeRuntime.state.lastKeyboardSelectionSet = rec;
      return rec;
  }

  async clearKeyboardSelection(reason) {
      const __bridgeRuntime = this;
      const token = __bridgeRuntime.runtime.keyboard.selection?.token || null;
      const textLength = __bridgeRuntime.runtime.keyboard.selection?.text?.length || 0;
      const overlay = token ? await __bridgeRuntime.ports.removeKeyboardOverlay(token) : null;
      __bridgeRuntime.runtime.keyboard.selection = null;
      __bridgeRuntime.state.keyboardSelection = null;
      __bridgeRuntime.state.keyboardSelectionClearSeq += 1;
      __bridgeRuntime.state.lastKeyboardSelectionClear = { at: new Date().toISOString(), clearSeq: __bridgeRuntime.state.keyboardSelectionClearSeq, reason: String(reason || ''), token, textLength, overlay };
      __bridgeRuntime.ports.syncEscapeShortcut();
      return { ok: true, reason: String(reason || ''), overlay };
  }

  async pdfPagePointToRemotePoint(pdfTarget, hint) {
      const __bridgeRuntime = this;
      // RuntimeDriver is the single production authority for
      // PDF page-point -> Chromium remote/scroller-point conversion. Every existing
      // consumer (keyboard autoscroll, locator, native-selection collapse, etc.)
      // reaches the conversion through this boundary.
      const target = pdfTarget?.runtimeFrame || null;
      return __bridgeRuntime.chromiumPdfRuntimeDriver.pagePointToRemote(target, hint);
  }

  async showLinkLocator(payload) {
      const __bridgeRuntime = this;
      const rec = { at: new Date().toISOString(), payload: null, viewerResolution: null, viewer: null, conversion: null, wrapperResolution: null, scroll: null, postConversion: null, overlay: null, ok: false, error: null };
      __bridgeRuntime.state.linkLocatorSeq += 1;
      rec.seq = __bridgeRuntime.state.linkLocatorSeq;
      try {
          const token = String(payload?.token || '').trim();
          const point = { pageIndex: Number(payload?.pageIndex), x: Number(payload?.x), y: Number(payload?.y) };
          rec.payload = { token, ...point, beginIndex: Number(payload?.beginIndex), beginOffset: Number(payload?.beginOffset) };
          if (!token || ![point.pageIndex, point.x, point.y].every(Number.isFinite))
              throw new Error('token eller locator-punkt mangler');
          const viewerResolved = await __bridgeRuntime.ports.resolveLocatorEmbeddedPdfTargetExact(token);
          rec.viewerResolution = {
              ok: !!viewerResolved?.ok, reason: viewerResolved?.reason || null, error: viewerResolved?.error || null,
              syncReason: viewerResolved?.syncReason || null, ownerCount: Number(viewerResolved?.ownerCount || 0),
              verifiedCount: viewerResolved?.verifiedCount == null ? null : Number(viewerResolved.verifiedCount),
              verification: Array.isArray(viewerResolved?.verification) ? viewerResolved.verification : []
          };
          const pdfTarget = viewerResolved?.target || null;
          if (!pdfTarget?.runtimeFrame)
              throw new Error(viewerResolved?.error || 'eksakt Chromium PDF-viewer er ikke klar ennå');
          rec.viewer = __bridgeRuntime.ports.safeDescribe(pdfTarget, webContents.getFocusedWebContents());
          const converted = await __bridgeRuntime.ports.pdfPagePointToRemotePoint(pdfTarget, point);
          rec.conversion = converted;
          if (!converted?.ok)
              throw new Error(converted?.error || 'kunne ikke konvertere locator-punkt');
          const targetY = Number(converted?.detail?.scrollerPoint?.y);
          if (!Number.isFinite(targetY))
              throw new Error('ugyldig locator Y');
          const wrapperResolved = await __bridgeRuntime.pdfWrapperFrameAdapter.resolveExactVerified(pdfTarget, token);
          rec.wrapperResolution = {
              ok: !!wrapperResolved?.ok, reason: wrapperResolved?.reason || null, error: wrapperResolved?.error || null,
              matchCount: Number(wrapperResolved?.matchCount || 0), candidateCount: Number(wrapperResolved?.candidateCount || 0),
              selected: wrapperResolved?.frame ? { url: String(wrapperResolved.frame?.url || ''), processId: Number(wrapperResolved.frame?.processId), routingId: Number(wrapperResolved.frame?.routingId) } : null,
              candidates: Array.isArray(wrapperResolved?.candidates) ? wrapperResolved.candidates.map(frame => ({ url: String(frame?.url || ''), processId: Number(frame?.processId), routingId: Number(frame?.routingId) })) : [],
              verifiedCount: Number(wrapperResolved?.verifiedCount || 0),
              verification: Array.isArray(wrapperResolved?.verification) ? wrapperResolved.verification.map(item => ({ url: String(item?.url || ''), processId: Number(item?.processId), routingId: Number(item?.routingId), ok: !!item?.ok, tag: item?.tag || null, error: item?.error || null })) : []
          };
          if (!wrapperResolved?.ok || !wrapperResolved.frame)
              throw new Error(wrapperResolved?.error || 'Eksakt Chromium PDF-wrapper frame ikke funnet');
          const wrapper = wrapperResolved.frame;
          rec.scroll = await __bridgeRuntime.chromiumPdfRuntimeDriver.scrollWrapperForLocator(wrapper, targetY);
          if (!rec.scroll?.ok)
              throw new Error(rec.scroll?.error || 'locator-autoscroll feilet');
          await new Promise(resolve => setTimeout(resolve, 35));
          rec.postConversion = await __bridgeRuntime.ports.pdfPagePointToRemotePoint(pdfTarget, point);
          rec.overlay = await __bridgeRuntime.chromiumPdfRuntimeDriver.renderLinkLocatorOverlay(pdfTarget.runtimeFrame, point);
          if (!rec.overlay?.ok || Number(rec.overlay?.markerCount || 0) < 1)
              throw new Error(rec.overlay?.error || 'locator-markør ble ikke tegnet');
          rec.ok = true;
      }
      catch (e) {
          rec.error = e instanceof Error ? e.message : String(e);
      }
      __bridgeRuntime.state.lastLinkLocator = rec;
      return rec;
  }

  async clearNativePdfSelection(pdfTarget, ownerWc, selectionHint) {
      const __bridgeRuntime = this;
      // Only the proven CDP route is retained here.
      // Blink unselect() and Electron sendInputEvent() fallbacks were removed after
      // repeated verification showed that they do not clear PDFium's native selection.
      const out = {
          at: new Date().toISOString(), ok: false, cleared: false, method: null,
          attempts: [], verification: [], inputObserved: [], error: null
      };
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const verify = async (label) => {
          let capture = null;
          try {
              capture = await __bridgeRuntime.ports.captureSelectedTextFromPdf(pdfTarget, ownerWc);
          }
          catch (e) {
              capture = { text: '', method: null, error: e instanceof Error ? e.message : String(e) };
          }
          const text = String(capture?.text || '');
          const rec = {
              label, textLength: text.length, method: capture?.method || null,
              error: capture?.error || null,
              attempts: Array.isArray(capture?.attempts) ? capture.attempts : []
          };
          out.verification.push(rec);
          if (!text.trim()) {
              out.cleared = true;
              out.ok = true;
              return true;
          }
          return false;
      };
      const cdpClick = async (x, y) => {
          const timingNowMs = () => Number(process.hrtime.bigint()) / 1e6;
          const roundMs = v => Math.round(Number(v || 0) * 10) / 10;
          const clickStarted = timingNowMs();
          const rec = {
              method: 'cdp-input-dispatch-mouse-click',
              available: false, attachedBefore: false, attachedHere: false,
              x: Number(x), y: Number(y), called: false, error: null,
              timing: {
                  debuggerLookupMs: 0, isAttachedMs: 0, attachMs: 0,
                  mouseMovedMs: 0, mousePressedMs: 0, pressHoldMs: 0,
                  mouseReleasedMs: 0, postDispatchDelayMs: 0, detachMs: 0, totalMs: 0
              }
          };
          let dbg = null;
          try {
              let t = timingNowMs();
              dbg = ownerWc?.debugger || null;
              rec.available = !!(dbg && typeof dbg.sendCommand === 'function');
              rec.timing.debuggerLookupMs = roundMs(timingNowMs() - t);
              if (!rec.available)
                  throw new Error('webContents.debugger.sendCommand() mangler');
              if (![rec.x, rec.y].every(Number.isFinite))
                  throw new Error('ugyldige CDP-klikk-koordinater');
              t = timingNowMs();
              try {
                  rec.attachedBefore = typeof dbg.isAttached === 'function' ? !!dbg.isAttached() : false;
              }
              catch (_) { }
              rec.timing.isAttachedMs = roundMs(timingNowMs() - t);
              if (!rec.attachedBefore) {
                  if (typeof dbg.attach !== 'function')
                      throw new Error('webContents.debugger.attach() mangler');
                  t = timingNowMs();
                  dbg.attach('1.3');
                  rec.timing.attachMs = roundMs(timingNowMs() - t);
                  rec.attachedHere = true;
              }
              const observed = [];
              __bridgeRuntime.runtime.keyboard.nativeClearInputProbe = { wcId: ownerWc?.id ?? null, events: observed };
              try {
                  t = timingNowMs();
                  await dbg.sendCommand('Input.dispatchMouseEvent', {
                      type: 'mouseMoved', x: rec.x, y: rec.y, button: 'none', buttons: 0
                  });
                  rec.timing.mouseMovedMs = roundMs(timingNowMs() - t);
                  t = timingNowMs();
                  await dbg.sendCommand('Input.dispatchMouseEvent', {
                      type: 'mousePressed', x: rec.x, y: rec.y, button: 'left', buttons: 1, clickCount: 1
                  });
                  rec.timing.mousePressedMs = roundMs(timingNowMs() - t);
                  rec.timing.pressHoldMs = 0;
                  t = timingNowMs();
                  await dbg.sendCommand('Input.dispatchMouseEvent', {
                      type: 'mouseReleased', x: rec.x, y: rec.y, button: 'left', buttons: 0, clickCount: 1
                  });
                  rec.timing.mouseReleasedMs = roundMs(timingNowMs() - t);
                  rec.called = true;
              }
              finally {
                  rec.timing.postDispatchDelayMs = 0;
                  rec.inputObserved = observed.slice();
                  out.inputObserved.push(...observed);
                  __bridgeRuntime.runtime.keyboard.nativeClearInputProbe = null;
              }
              out.method = rec.method;
          }
          catch (e) {
              rec.error = e instanceof Error ? e.message : String(e);
              __bridgeRuntime.runtime.keyboard.nativeClearInputProbe = null;
          }
          finally {
              if (rec.attachedHere && dbg) {
                  const detachStarted = timingNowMs();
                  try {
                      dbg.detach();
                      rec.detachedHere = true;
                  }
                  catch (e) {
                      rec.detachError = e instanceof Error ? e.message : String(e);
                  }
                  rec.timing.detachMs = roundMs(timingNowMs() - detachStarted);
              }
              rec.timing.totalMs = roundMs(timingNowMs() - clickStarted);
          }
          out.attempts.push(rec);
          return rec.called;
      };
      try {
          out.physicalGesturePoint = null;
          out.selectionHint = selectionHint || null;
          let point = null;
          out.pointSource = null;
          if (selectionHint) {
              const converted = await __bridgeRuntime.ports.pdfPagePointToRemotePoint(pdfTarget, selectionHint);
              out.selectionHintConversion = converted;
              if (converted?.ok) {
                  point = { x: Number(converted.remotePoint.x), y: Number(converted.remotePoint.y) };
                  out.pointSource = 'selection-hint';
              }
          }
          if (!point)
              throw new Error('Fant ikke et gyldig punkt for å kollapse native PDF-selection');
          if (__bridgeRuntime.ports.isEmbeddedPdfTarget(pdfTarget) && ownerWc) {
              try {
                  const iframeHit = await __bridgeRuntime.ports.capturePdfIframeRect(ownerWc, __bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget));
                  const rect = iframeHit?.match?.rect || null;
                  if (rect) {
                      out.embeddedOwnerOffset = { left: Number(rect.left || 0), top: Number(rect.top || 0) };
                      point = { x: Number(point.x) + out.embeddedOwnerOffset.left, y: Number(point.y) + out.embeddedOwnerOffset.top };
                  }
              }
              catch (_) { }
          }
          if (await cdpClick(point.x, point.y)) {
              // CDP click is the proven native-selection collapse path.
              // Do not synchronously re-capture clipboard text here: when selection is
              // correctly empty, captureSelectedTextFromPdf() burns ~0.8 s exhausting
              // its fallback copy attempts before it can prove that emptiness.
              out.cleared = true;
              out.ok = true;
              out.verification.push({
                  label: 'skipped-blocking-clipboard-verification',
                  textLength: null,
                  method: 'trusted-cdp-click',
                  error: null,
                  attempts: []
              });
          }
      }
      catch (e) {
          out.error = e instanceof Error ? e.message : String(e);
      }
      finally {
          __bridgeRuntime.runtime.keyboard.nativeClearInputProbe = null;
          __bridgeRuntime.state.nativeSelectionClearSeq += 1;
          out.clearSeq = __bridgeRuntime.state.nativeSelectionClearSeq;
          __bridgeRuntime.state.lastNativeSelectionClear = out;
      }
      return out;
  }

  reportKeyboardSelectionResult(payload) {
      const __bridgeRuntime = this;
      __bridgeRuntime.state.keyboardSelectionResultSeq += 1;
      const rec = {
          at: new Date().toISOString(),
          resultSeq: __bridgeRuntime.state.keyboardSelectionResultSeq,
          token: String(payload?.token || ''),
          direction: String(payload?.direction || ''), unit: String(payload?.unit || 'glyph'),
          rendererSeq: Number(payload?.seq || 0),
          ok: !!payload?.ok,
          error: payload?.error ? String(payload.error) : null
      };
      __bridgeRuntime.state.lastKeyboardSelectionResult = rec;
      return rec;
  }

  async clearStaleKeyboardSelectionBeforeRoute(pdfTarget) {
      const __bridgeRuntime = this;
      const snapshot = __bridgeRuntime.runtime.keyboard.selection;
      const out = {
          at: new Date().toISOString(),
          checked: false,
          hadKeyboardSelection: !!snapshot,
          token: snapshot?.token || null,
          selectionCreatedAtMs: Number(snapshot?.createdAtMs || 0),
          wrapperToken: null,
          wrapperResolution: null,
          lastDown: null,
          downAtMs: null,
          sameToken: false,
          afterSelection: false,
          cleared: false,
          error: null
      };
      if (!snapshot || !pdfTarget)
          return out;
      out.checked = true;
      try {
          const expectedToken = String(snapshot?.token || __bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget) || '').trim();
          if (!expectedToken)
              throw new Error('Stale mouse takeover: PDF-token mangler');
          const executed = await __bridgeRuntime.pdfWrapperFrameAdapter.executeExactVerified(pdfTarget, expectedToken, `(() => {
        const x=window.__pdfiumGateAutoScroll;
        if(!x||!x.state) return {ok:false,href:String(location.href||''),reason:'autoscroll-state-not-ready'};
        const s=x.state;
        return {ok:true,href:String(location.href||''),lastDown:s.lastDown||null};
      })()`, true);
          out.wrapperResolution = {
              ok: !!executed?.ok, reason: executed?.reason || null, error: executed?.error || null,
              matchCount: Number(executed?.matchCount || 0), candidateCount: Number(executed?.candidateCount || 0),
              verifiedCount: Number(executed?.verifiedCount || 0),
              frame: executed?.frame ? __bridgeRuntime.ports.describeFrame(executed.frame) : null
          };
          if (!executed?.ok || !executed.frame) {
              out.error = executed?.error || 'Stale mouse takeover: eksakt verifisert wrapper ble ikke funnet';
              return out;
          }
          const result = executed.result || null;
          if (!result?.ok || !result?.lastDown)
              return out;
          const href = String(result.href || executed.frame?.url || '');
          const token = pdfTokenFromWrapperFrameUrl(href) || __bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget);
          const lastDown = result.lastDown || null;
          const downAtMs = Date.parse(String(lastDown?.at || ''));
          const createdAtMs = Number(snapshot.createdAtMs || 0);
          out.wrapperToken = token || null;
          out.lastDown = lastDown;
          out.downAtMs = Number.isFinite(downAtMs) ? downAtMs : null;
          out.sameToken = !!token && token === snapshot.token;
          out.afterSelection = Number.isFinite(downAtMs) && downAtMs > createdAtMs;
          if (out.sameToken && out.afterSelection && __bridgeRuntime.runtime.keyboard.selection === snapshot) {
              await __bridgeRuntime.ports.clearKeyboardSelection('fresh-native-mouse-before-keyboard-route');
              out.cleared = true;
          }
      }
      catch (e) {
          out.error = e instanceof Error ? e.message : String(e);
      }
      return out;
  }

  async routePdfKeyboardSelectionFromPdf(pdfTarget, shortcut, source) {
      const __bridgeRuntime = this;
      const timingNowMs = () => Number(process.hrtime.bigint()) / 1e6;
      const roundMs = value => Math.round(Number(value || 0) * 10) / 10;
      const routeStarted = timingNowMs();
      const rec = {
          at: new Date().toISOString(), source: String(source || 'unknown'), id: shortcut?.id || null,
          accelerator: shortcut?.accelerator || null, direction: shortcut?.direction || null, unit: shortcut?.unit || 'glyph',
          token: __bridgeRuntime.ports.pdfTokenFromTarget(pdfTarget), selectedText: '', selectionLength: 0, selectionSource: null,
          rangeHint: null, selectionModel: null, selectionCaptureMethod: null, selectionCaptureAttempts: [], viewerState: null, cursorHint: null, selectionGestureHint: null,
          freshMouseTakeover: null, owner: null, ownerMethod: null, dispatched: false,
          timing: { ownerLookupMs: null, staleMouseCheckMs: null, selectionCaptureMs: null, viewerStateMs: null, cursorHintMs: null, gestureHintMs: null, nativeClearMs: null, dispatchMs: null, rendererWaitMs: null, totalMs: null },
          error: null
      };
      const timed = async (name, fn) => {
          const started = timingNowMs();
          try {
              return await fn();
          }
          finally {
              rec.timing[name] = roundMs(timingNowMs() - started);
          }
      };
      const setSeqBefore = __bridgeRuntime.state.keyboardSelectionSetSeq;
      const resultSeqBefore = __bridgeRuntime.state.keyboardSelectionResultSeq;
      const isSelectAll = shortcut?.unit === 'select-all';
      try {
          const found = await timed('ownerLookupMs', () => __bridgeRuntime.ports.resolveEmbeddedPdfOwner(pdfTarget));
          const ownerWc = found?.ownerWc || null;
          rec.ownerMethod = found?.method || null;
          rec.owner = __bridgeRuntime.ports.safeDescribe(ownerWc, webContents.getFocusedWebContents());
          if (!ownerWc)
              throw new Error('Fant ikke Obsidian-vinduet som eier PDF-vieweren');
          // The wrapper poller normally clears custom keyboard state
          // when the user starts a new native mouse selection. A fast double-click /
          // drag followed immediately by Shift+Arrow can beat that poll. Re-check the
          // wrapper synchronously here before deciding whether custom state is still
          // authoritative. This makes the fresh mouse selection win deterministically.
          rec.freshMouseTakeover = await timed('staleMouseCheckMs', () => __bridgeRuntime.ports.clearStaleKeyboardSelectionBeforeRoute(pdfTarget));
          if (isSelectAll) {
              rec.selectedText = '';
              rec.selectionSource = 'select-all';
              rec.rangeHint = null;
              rec.selectionModel = null;
              rec.selectionCaptureMethod = 'direct-pdfium-select-all';
              rec.selectionCaptureAttempts = [];
              rec.timing.selectionCaptureMs = 0;
          }
          else if (__bridgeRuntime.runtime.keyboard.selection && __bridgeRuntime.runtime.keyboard.selection.token === rec.token && __bridgeRuntime.runtime.keyboard.selection.text) {
              rec.selectedText = String(__bridgeRuntime.runtime.keyboard.selection.text);
              rec.selectionSource = 'custom-state';
              rec.rangeHint = __bridgeRuntime.runtime.keyboard.selection.range || null;
              rec.selectionModel = __bridgeRuntime.runtime.keyboard.selection.selectionModel || null;
              rec.selectionCaptureMethod = 'custom-state';
              rec.selectionCaptureAttempts = [];
              rec.timing.selectionCaptureMs = 0;
          }
          else {
              const capture = await timed('selectionCaptureMs', () => __bridgeRuntime.ports.captureSelectedTextFromPdf(pdfTarget, ownerWc));
              rec.selectedText = String(capture?.text || '');
              rec.selectionSource = 'native-pdf-copy';
              rec.selectionCaptureMethod = capture?.method || null;
              rec.selectionCaptureAttempts = Array.isArray(capture?.attempts) ? capture.attempts : [];
          }
          rec.selectionLength = rec.selectedText.length;
          rec.viewerState = await timed('viewerStateMs', () => __bridgeRuntime.ports.capturePdfViewerKeyboardState(pdfTarget, shortcut?.unit === 'viewport'));
          if (rec.selectionSource === 'native-pdf-copy') {
              rec.cursorHint = await timed('cursorHintMs', () => __bridgeRuntime.ports.capturePdfKeyboardCursorHint(pdfTarget, found));
              rec.selectionGestureHint = await timed('gestureHintMs', () => __bridgeRuntime.ports.capturePdfMouseGestureHint(pdfTarget));
          }
          else {
              rec.timing.cursorHintMs = 0;
              rec.timing.gestureHintMs = 0;
          }
          if (!isSelectAll && !rec.selectedText.trim())
              throw new Error('Marker først minst ett tegn med mus i PDF-en.');
          if (rec.selectionSource === 'native-pdf-copy') {
              rec.nativeSelectionClear = await timed('nativeClearMs', () => __bridgeRuntime.ports.clearNativePdfSelection(pdfTarget, ownerWc, rec.cursorHint?.ok ? rec.cursorHint.candidate : null));
          }
          else
              rec.timing.nativeClearMs = 0;
          const detail = { source: 'pdfium-gate-main-bridge', shortcutId: shortcut.id, accelerator: shortcut.accelerator,
              direction: shortcut.direction, unit: shortcut.unit || 'glyph', token: rec.token, selectedText: rec.selectedText, selectionSource: rec.selectionSource, rangeHint: rec.rangeHint, selectionModel: rec.selectionModel,
              viewerState: rec.viewerState, selectionHint: isSelectAll ? null : (rec.cursorHint?.ok ? rec.cursorHint.candidate : (__bridgeRuntime.runtime.keyboard.selection?.selectionHint || null)),
              selectionGestureHint: rec.selectionGestureHint?.ok ? { source: rec.selectionGestureHint.source || null, down: rec.selectionGestureHint.down?.point || null, up: rec.selectionGestureHint.up?.point || null } : null, at: new Date().toISOString() };
          const result = await timed('dispatchMs', () => __bridgeRuntime.rendererEventDispatchAdapter.dispatchExact(ownerWc, RENDERER_BRIDGE_EVENTS.KEYBOARD_SELECTION, detail));
          rec.dispatched = !!result?.ok;
          if (!rec.dispatched)
              throw new Error(result?.error || 'keyboard-selection event ble ikke dispatch-et');
          const waitStarted = timingNowMs();
          const started = Date.now();
          while (Date.now() - started < 5000 && __bridgeRuntime.state.keyboardSelectionSetSeq === setSeqBefore && __bridgeRuntime.state.keyboardSelectionResultSeq === resultSeqBefore)
              await new Promise(r => setTimeout(r, 25));
          rec.timing.rendererWaitMs = roundMs(timingNowMs() - waitStarted);
          if (__bridgeRuntime.state.keyboardSelectionSetSeq === setSeqBefore && __bridgeRuntime.state.keyboardSelectionResultSeq === resultSeqBefore)
              throw new Error('Tidsavbrudd: renderer svarte ikke på keyboard-selection request');
          if (__bridgeRuntime.state.keyboardSelectionResultSeq !== resultSeqBefore) {
              rec.rendererResult = __bridgeRuntime.state.lastKeyboardSelectionResult;
              if (rec.rendererResult && !rec.rendererResult.ok)
                  throw new Error(rec.rendererResult.error || 'Renderer avviste keyboard-selection request');
          }
      }
      catch (e) {
          rec.error = e instanceof Error ? e.message : String(e);
      }
      rec.timing.totalMs = roundMs(timingNowMs() - routeStarted);
      __bridgeRuntime.state.keyboardSelectionTriggerSeq += 1;
      rec.triggerSeq = __bridgeRuntime.state.keyboardSelectionTriggerSeq;
      __bridgeRuntime.state.lastKeyboardSelectionTrigger = rec;
      return rec;
  }
}

module.exports = { MainBridgeSelectionOperationsFeature };
