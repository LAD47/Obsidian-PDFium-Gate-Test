'use strict';

class MainBridgeWrapperLifecycleFeature {
  // Keyboard commands are routed only by the always-attached Electron 43
  // before-input-event listener. There is no separate registration/focus-poll layer.
  // Selection autoscroll inside Chromium's internal PDF plugin wrapper.
  // Chromium's own pdf_internal_plugin_wrapper listens for pointer events around
  // the <embed> plugin and forwards window scroll back to the parent Viewport.
  // We inject only into frames that actually contain the PDF <embed>. We never
  // preventDefault/stopPropagation, so PDFium remains the native selection owner.
  wrapperInstrumentationInstallScript() {
      const __bridgeRuntime = this;
      return `(() => {
      try {
        if (window.__pdfiumGateAutoScroll?.state) {
          return {ok:true, already:true, ready:true, href:String(location.href), state:{...window.__pdfiumGateAutoScroll.state}};
        }
        if (window.__pdfiumGateWrapperBootstrap?.state?.pending) {
          return {ok:true, already:true, ready:false, pendingEmbed:true, href:String(location.href), bootstrapState:{...window.__pdfiumGateWrapperBootstrap.state}};
        }
  
        const installReadyRuntime = () => {
          if (window.__pdfiumGateAutoScroll?.state) return true;
          const embed = document.querySelector('embed');
          if (!embed) return false;
  
          const state = {
            installedAt:new Date().toISOString(), href:String(location.href), dragging:false, instrumentationVersion:1,
            eventModel:'pointer-only', timerMode:'edge-only',
            downSeq:0, moveSeq:0, upSeq:0, tickSeq:0, scrollSeq:0,
            lastEvent:null, lastDown:null, lastUp:null, lastScroll:null, lastError:null
          };
          let pointerX = 0;
          let pointerY = 0;
          let timer = null;
  
          const edgeIntent = () => {
            const h = Number(window.innerHeight || document.documentElement.clientHeight || 0);
            const edge = Math.max(38, Math.min(74, h * 0.15));
            let direction = 0;
            let depth = 0;
            if (pointerY > h - edge) {
              direction = 1;
              depth = Math.min(1.6, Math.max(0, (pointerY - (h - edge)) / edge));
            } else if (pointerY < edge) {
              direction = -1;
              depth = Math.min(1.6, Math.max(0, (edge - pointerY) / edge));
            }
            return {h, edge, direction, depth};
          };
          const cancelTimer = () => {
            if (timer) { clearTimeout(timer); timer = null; }
          };
          const schedule = () => {
            if (!state.dragging || timer) return;
            const intent = edgeIntent();
            if (!intent.direction) return;
            timer = setTimeout(tick, 34);
          };
          const tick = () => {
            timer = null;
            if (!state.dragging) return;
            try {
              const intent = edgeIntent();
              if (!intent.direction) return;
              state.tickSeq += 1;
              const dy = intent.direction * Math.round(7 + 28 * intent.depth * intent.depth);
              const before = Number(window.scrollY || 0);
              window.scrollBy({left:0, top:dy, behavior:'auto'});
              const after = Number(window.scrollY || 0);
              state.scrollSeq += 1;
              state.lastScroll = {
                at:new Date().toISOString(), direction:intent.direction, depth:intent.depth, dy, before, after,
                moved:Math.abs(after-before) > 0.5, pointerX, pointerY,
                innerWidth:Number(window.innerWidth||0), innerHeight:intent.h
              };
            } catch (e) {
              state.lastError = String(e && e.message || e);
            }
            schedule();
          };
          const updatePoint = e => {
            if (Number.isFinite(Number(e.clientX))) pointerX = Number(e.clientX);
            if (Number.isFinite(Number(e.clientY))) pointerY = Number(e.clientY);
          };
          const onDown = e => {
            if (Number(e.button) !== 0) return;
            updatePoint(e);
            state.dragging = true;
            state.downSeq += 1;
            state.lastDown = {at:new Date().toISOString(), type:e.type, button:Number(e.button), x:pointerX, y:pointerY, scrollX:Number(window.scrollX||0), scrollY:Number(window.scrollY||0)};
            state.lastEvent = state.lastDown;
            schedule();
          };
          const onMove = e => {
            if (!state.dragging) return;
            updatePoint(e);
            state.moveSeq += 1;
            state.lastEvent = {at:new Date().toISOString(), type:e.type, buttons:Number(e.buttons||0), x:pointerX, y:pointerY};
            if (edgeIntent().direction) schedule();
            else cancelTimer();
          };
          const stop = e => {
            if (!state.dragging) return;
            updatePoint(e || {});
            state.dragging = false;
            state.upSeq += 1;
            state.lastUp = {at:new Date().toISOString(), type:String(e && e.type || 'stop'), x:pointerX, y:pointerY, scrollX:Number(window.scrollX||0), scrollY:Number(window.scrollY||0)};
            state.lastEvent = state.lastUp;
            cancelTimer();
          };
  
          // Electron 43 / Chrome 150 contract: Pointer Events are canonical.
          // Do not register parallel mouse events for the same physical gesture.
          document.addEventListener('pointerdown', onDown, true);
          document.addEventListener('pointermove', onMove, true);
          document.addEventListener('pointerup', stop, true);
          document.addEventListener('pointercancel', stop, true);
          window.addEventListener('blur', stop, true);
  
          window.__pdfiumGateAutoScroll = {state, stop};
          const bootstrap=window.__pdfiumGateWrapperBootstrap;
          if (bootstrap?.observer) { try { bootstrap.observer.disconnect(); } catch (_) {} }
          if (bootstrap?.state) {
            bootstrap.state.pending=false;
            bootstrap.state.ready=true;
            bootstrap.state.readyAt=new Date().toISOString();
          }
          return true;
        };
  
        if (installReadyRuntime()) {
          return {ok:true, installed:true, ready:true, href:String(location.href), tag:'EMBED'};
        }
  
        // did-frame-navigate/frame-created can precede Chromium inserting the
        // internal PDF <embed>. Register DOM readiness once and let the wrapper
        // converge when the embed actually appears; do not guess with delays.
        const bootstrapState={
          installedAt:new Date().toISOString(), href:String(location.href), bootstrapVersion:1,
          pending:true, ready:false, mutationSeq:0, lastError:null
        };
        const observer=new MutationObserver(() => {
          bootstrapState.mutationSeq+=1;
          try { installReadyRuntime(); }
          catch (e) { bootstrapState.lastError=String(e && e.message || e); }
        });
        const root=document.documentElement||document;
        observer.observe(root,{childList:true,subtree:true});
        window.__pdfiumGateWrapperBootstrap={state:bootstrapState,observer};
        return {ok:true, installed:true, ready:false, pendingEmbed:true, href:String(location.href), bootstrapState:{...bootstrapState}};
      } catch (e) {
        return {ok:false, reason:String(e && e.message || e), href:String(location.href)};
      }
    })()`;
  }

  listFrameSubtree(wc) {
      const __bridgeRuntime = this;
      const out = [];
      try {
          const actualWc = __bridgeRuntime.ports.isEmbeddedPdfTarget(wc) ? wc.ownerWebContents : wc;
          const root = actualWc?.mainFrame;
          if (!root)
              return out;
          out.push(root);
          for (const f of root.framesInSubtree || [])
              if (f && !out.includes(f))
                  out.push(f);
      }
      catch (_) { }
      return out;
  }

  startWrapperInstrumentationPoll(wc, frame, forceRestart = false) {
      const __bridgeRuntime = this;
      let key = null;
      try {
          key = `${wc.id}:${frame.processId}:${frame.routingId}`;
      }
      catch (_) {
          return;
      }
      const existingTimer = __bridgeRuntime.runtime.wrapperRuntime.pollers.get(key);
      if (existingTimer) {
          if (!forceRestart)
              return;
          clearInterval(existingTimer);
          __bridgeRuntime.runtime.wrapperRuntime.pollers.delete(key);
      }
      let lastActivationDownSeq = 0;
      const timer = setInterval(async () => {
          try {
              if (!__bridgeRuntime.state.installed || !wc || wc.isDestroyed?.() || frame.isDestroyed?.()) {
                  clearInterval(timer);
                  __bridgeRuntime.runtime.wrapperRuntime.pollers.delete(key);
                  __bridgeRuntime.state.pdfRuntimeRegisteredWrapperCount = __bridgeRuntime.runtime.wrapperRuntime.pollers.size;
                  return;
              }
              const result = await frame.executeJavaScript(`(() => {
          const x = window.__pdfiumGateAutoScroll;
          const b = window.__pdfiumGateWrapperBootstrap;
          return x ? {ok:true, ready:true, href:String(location.href), state:{...x.state}}
            : {ok:false, ready:false, pendingEmbed:!!b?.state?.pending, href:String(location.href), bootstrapState:b?.state?{...b.state}:null};
        })()`, true);
              __bridgeRuntime.state.lastWrapperInstrumentationState = {
                  at: new Date().toISOString(), webContents: __bridgeRuntime.ports.safeDescribe(wc, webContents.getFocusedWebContents()),
                  frame: { url: String(frame.url || ''), processId: frame.processId, routingId: frame.routingId }, result
              };
              if (result?.ok) {
                  // The wrapper Pointer Event listener records the exact physical left
                  // pointerdown. Publish each new
                  // wrapper downSeq as an exact PDF activation signal so the renderer can
                  // synchronize Obsidian activeLeaf before the next reserved Shift key.
                  const href = String(result?.href || frame.url || '');
                  const hrefMatch = href.match(/\/pdf\/([^/?#]+)\.pdf(?:#.*)?$/i);
                  const wrapperToken = hrefMatch ? hrefMatch[1] : __bridgeRuntime.ports.pdfTokenFromTarget(wc);
                  const wrapperDownSeq = Number(result?.state?.downSeq || 0);
                  const lastDown = result?.state?.lastDown || null;
                  if (lastDown && wrapperDownSeq > lastActivationDownSeq) {
                      lastActivationDownSeq = wrapperDownSeq;
                      __bridgeRuntime.state.pdfMouseActivationSeq += 1;
                      __bridgeRuntime.state.lastPdfMouseActivation = {
                          at: String(lastDown.at || new Date().toISOString()),
                          activationSeq: __bridgeRuntime.state.pdfMouseActivationSeq,
                          source: 'pdf-wrapper-poll',
                          token: wrapperToken || null,
                          wrapperDownSeq,
                          webContents: __bridgeRuntime.ports.safeDescribe(wc, webContents.getFocusedWebContents()),
                          frame: { url: href, processId: frame.processId, routingId: frame.routingId },
                          point: { x: Number(lastDown.x), y: Number(lastDown.y), globalX: null, globalY: null, clickCount: null }
                      };
                      void __bridgeRuntime.rendererEventDispatchAdapter.dispatchExact(wc, RENDERER_BRIDGE_EVENTS.PDF_MOUSE_ACTIVATION, __bridgeRuntime.state.lastPdfMouseActivation);
                  }
                  // The same wrapper signal remains authoritative for native
                  // mouse takeover of an existing custom keyboard selection.
                  const snapshot = __bridgeRuntime.runtime.keyboard.selection;
                  if (snapshot && lastDown && !__bridgeRuntime.runtime.keyboard.selectionMouseClearInFlight) {
                      const token = wrapperToken;
                      const downAt = Date.parse(String(lastDown.at || ''));
                      const createdAtMs = Number(snapshot.createdAtMs || 0);
                      const sameToken = !!token && token === snapshot.token;
                      const afterSelection = Number.isFinite(downAt) && downAt > createdAtMs;
                      __bridgeRuntime.state.lastKeyboardSelectionMouseClearProbe = {
                          at: new Date().toISOString(), source: 'pdf-wrapper-poll', token: snapshot.token,
                          wrapperToken: token || null, lastDown, selectionCreatedAtMs: createdAtMs,
                          sameToken, afterSelection, cleared: false, error: null
                      };
                      if (sameToken && afterSelection && __bridgeRuntime.runtime.keyboard.selection === snapshot) {
                          __bridgeRuntime.runtime.keyboard.selectionMouseClearInFlight = true;
                          __bridgeRuntime.state.lastKeyboardSelectionMouseClearProbe.cleared = true;
                          void __bridgeRuntime.ports.clearKeyboardSelection('pdf-wrapper-left-mousedown')
                              .catch(e => { if (__bridgeRuntime.state.lastKeyboardSelectionMouseClearProbe)
                              __bridgeRuntime.state.lastKeyboardSelectionMouseClearProbe.error = e instanceof Error ? e.message : String(e); })
                              .finally(() => { __bridgeRuntime.runtime.keyboard.selectionMouseClearInFlight = false; });
                      }
                  }
              }
          }
          catch (_) { }
      }, 100);
      __bridgeRuntime.runtime.wrapperRuntime.pollers.set(key, timer);
      __bridgeRuntime.state.pdfRuntimeRegisteredWrapperCount = __bridgeRuntime.runtime.wrapperRuntime.pollers.size;
  }

  physicalWrapperKey(ownerWc, frame) {
      const __bridgeRuntime = this;
      try {
          const ownerId = Number(ownerWc?.id), processId = Number(frame?.processId), routingId = Number(frame?.routingId);
          return Number.isFinite(ownerId) && Number.isFinite(processId) && Number.isFinite(routingId)
              ? `${ownerId}:${processId}:${routingId}` : null;
      }
      catch (_) {
          return null;
      }
  }

  async ensurePhysicalPdfWrapperRuntime(ownerWc, frame, expectedToken = null, source = 'unspecified', force = false) {
      const __bridgeRuntime = this;
      const frameUrl = __bridgeRuntime.ports.safeFrameUrl(frame);
      const token = pdfTokenFromWrapperFrameUrl(frameUrl);
      const safeExpected = String(expectedToken || '').trim() || null;
      const key = __bridgeRuntime.ports.physicalWrapperKey(ownerWc, frame);
      __bridgeRuntime.state.pdfRuntimeRegistrationSeq += 1;
      const rec = {
          at: new Date().toISOString(), seq: __bridgeRuntime.state.pdfRuntimeRegistrationSeq, source: String(source || 'unspecified'),
          token: token || safeExpected, expectedToken: safeExpected, physicalKey: key,
          owner: __bridgeRuntime.ports.safeDescribe(ownerWc, (() => { try {
              return webContents.getFocusedWebContents();
          }
          catch (_) {
              return null;
          } })()),
          frame: __bridgeRuntime.ports.describeFrame(frame), force: !!force, ok: false, already: false, installResult: null, error: null
      };
      if (!ownerWc || !frame || !key) {
          rec.error = 'owner/frame fysisk identitet mangler';
          __bridgeRuntime.state.lastPdfRuntimeRegistration = rec;
          return rec;
      }
      if (!token) {
          rec.error = 'frame er ikke en PDF-wrapper';
          __bridgeRuntime.state.lastPdfRuntimeRegistration = rec;
          return rec;
      }
      if (safeExpected && token !== safeExpected) {
          rec.error = 'wrapper-token matcher ikke forventet token';
          __bridgeRuntime.state.lastPdfRuntimeRegistration = rec;
          return rec;
      }
      __bridgeRuntime.ports.attachContextListener(ownerWc);
      __bridgeRuntime.ports.attachEmbeddedKeyboardInputListener(ownerWc);
      if (!force && __bridgeRuntime.runtime.wrapperRuntime.pollers.has(key)) {
          rec.ok = true;
          rec.already = true;
          __bridgeRuntime.state.lastPdfRuntimeRegistration = rec;
          __bridgeRuntime.state.pdfRuntimeRegisteredWrapperCount = __bridgeRuntime.runtime.wrapperRuntime.pollers.size;
          return rec;
      }
      const existing = __bridgeRuntime.runtime.wrapperRuntime.registrationInFlight.get(key);
      if (existing)
          return existing;
      const task = (async () => {
          try {
              const result = await frame.executeJavaScript(__bridgeRuntime.ports.wrapperInstrumentationInstallScript(), true);
              rec.installResult = result || null;
              if (!result?.ok)
                  throw new Error(result?.reason || 'wrapper-instrumentering feilet');
              __bridgeRuntime.ports.startWrapperInstrumentationPoll(ownerWc, frame, force);
              rec.ok = true;
              rec.already = !!result?.already;
              __bridgeRuntime.state.pdfRuntimeRegistrationCount += 1;
              __bridgeRuntime.state.pdfRuntimeRegisteredWrapperCount = __bridgeRuntime.runtime.wrapperRuntime.pollers.size;
          }
          catch (error) {
              rec.error = error instanceof Error ? error.message : String(error);
          }
          finally {
              __bridgeRuntime.state.lastPdfRuntimeRegistration = rec;
          }
          return rec;
      })();
      __bridgeRuntime.runtime.wrapperRuntime.registrationInFlight.set(key, task);
      try {
          return await task;
      }
      finally {
          if (__bridgeRuntime.runtime.wrapperRuntime.registrationInFlight.get(key) === task)
              __bridgeRuntime.runtime.wrapperRuntime.registrationInFlight.delete(key);
      }
  }

  findFrameByPhysicalId(ownerWc, processId, routingId) {
      const __bridgeRuntime = this;
      const p = Number(processId), r = Number(routingId);
      if (!Number.isFinite(p) || !Number.isFinite(r))
          return null;
      try {
          const direct = webFrameMain?.fromId?.(p, r) || null;
          if (direct)
              return direct;
      }
      catch (_) { }
      try {
          return (__bridgeRuntime.ports.listFrameSubtree(ownerWc) || []).find(frame => Number(frame?.processId) === p && Number(frame?.routingId) === r) || null;
      }
      catch (_) {
          return null;
      }
  }

  recordPdfFrameLifecycle(source, ownerWc, frame, url = null) {
      const __bridgeRuntime = this;
      __bridgeRuntime.state.pdfRuntimeFrameLifecycleSeq += 1;
      const rec = {
          at: new Date().toISOString(), seq: __bridgeRuntime.state.pdfRuntimeFrameLifecycleSeq, source: String(source || ''),
          owner: __bridgeRuntime.ports.safeDescribe(ownerWc, (() => { try {
              return webContents.getFocusedWebContents();
          }
          catch (_) {
              return null;
          } })()),
          frame: __bridgeRuntime.ports.describeFrame(frame), url: String(url || __bridgeRuntime.ports.safeFrameUrl(frame) || ''), token: pdfTokenFromWrapperFrameUrl(String(url || __bridgeRuntime.ports.safeFrameUrl(frame) || '')) || null
      };
      __bridgeRuntime.state.lastPdfRuntimeFrameLifecycle = rec;
      return rec;
  }

  attachPdfFrameLifecycle(ownerWc) {
      const __bridgeRuntime = this;
      if (!ownerWc || __bridgeRuntime.runtime.wrapperRuntime.frameLifecycleListeners.has(ownerWc.id) || typeof ownerWc.on !== 'function')
          return;
      const frameCreatedHandler = (_event, details) => {
          const frame = details?.frame || null;
          const rec = __bridgeRuntime.ports.recordPdfFrameLifecycle('frame-created', ownerWc, frame);
          if (rec.token && frame)
              void __bridgeRuntime.ports.ensurePhysicalPdfWrapperRuntime(ownerWc, frame, rec.token, 'frame-created', true);
      };
      const didFrameNavigateHandler = (_event, url, _httpResponseCode, _httpStatusText, _isMainFrame, frameProcessId, frameRoutingId) => {
          const token = pdfTokenFromWrapperFrameUrl(String(url || ''));
          if (!token)
              return;
          const frame = __bridgeRuntime.ports.findFrameByPhysicalId(ownerWc, frameProcessId, frameRoutingId);
          __bridgeRuntime.ports.recordPdfFrameLifecycle('did-frame-navigate', ownerWc, frame, url);
          if (frame)
              void __bridgeRuntime.ports.ensurePhysicalPdfWrapperRuntime(ownerWc, frame, token, 'did-frame-navigate', true);
          else
              void __bridgeRuntime.ports.ensurePdfRuntime({ token, source: 'did-frame-navigate-token-reconcile', force: true });
      };
      try {
          ownerWc.on('frame-created', frameCreatedHandler);
          ownerWc.on('did-frame-navigate', didFrameNavigateHandler);
          __bridgeRuntime.runtime.wrapperRuntime.frameLifecycleListeners.set(ownerWc.id, { wc: ownerWc, frameCreatedHandler, didFrameNavigateHandler });
          __bridgeRuntime.state.pdfRuntimeFrameLifecycleListenerCount = __bridgeRuntime.runtime.wrapperRuntime.frameLifecycleListeners.size;
      }
      catch (_) { }
  }

  detachPdfFrameLifecycleListeners() {
      const __bridgeRuntime = this;
      for (const { wc, frameCreatedHandler, didFrameNavigateHandler } of __bridgeRuntime.runtime.wrapperRuntime.frameLifecycleListeners.values()) {
          try {
              wc.removeListener('frame-created', frameCreatedHandler);
          }
          catch (_) {
              try {
                  wc.off('frame-created', frameCreatedHandler);
              }
              catch (_) { }
          }
          try {
              wc.removeListener('did-frame-navigate', didFrameNavigateHandler);
          }
          catch (_) {
              try {
                  wc.off('did-frame-navigate', didFrameNavigateHandler);
              }
              catch (_) { }
          }
      }
      __bridgeRuntime.runtime.wrapperRuntime.frameLifecycleListeners.clear();
      __bridgeRuntime.state.pdfRuntimeFrameLifecycleListenerCount = 0;
  }

  async ensurePdfRuntime(payload = {}) {
      const __bridgeRuntime = this;
      const token = String(payload?.token || '').trim();
      const source = String(payload?.source || 'renderer-runtime-ready');
      const force = payload?.force === true;
      if (!token)
          return { ok: false, token: null, source, matchCount: 0, registeredCount: 0, results: [], error: 'PDF-token mangler' };
      const matches = [];
      const seen = new Set();
      let owners = [];
      try {
          owners = webContents.getAllWebContents() || [];
      }
      catch (error) {
          return { ok: false, token, source, matchCount: 0, registeredCount: 0, results: [], error: error instanceof Error ? error.message : String(error) };
      }
      for (const ownerWc of owners) {
          __bridgeRuntime.ports.attachContextListener(ownerWc);
          __bridgeRuntime.ports.attachEmbeddedKeyboardInputListener(ownerWc);
          __bridgeRuntime.ports.attachPdfFrameLifecycle(ownerWc);
          let frames = [];
          try {
              frames = __bridgeRuntime.ports.listFrameSubtree(ownerWc) || [];
          }
          catch (_) { }
          for (const frame of frames) {
              if (pdfTokenFromWrapperFrameUrl(__bridgeRuntime.ports.safeFrameUrl(frame)) !== token)
                  continue;
              const key = __bridgeRuntime.ports.physicalWrapperKey(ownerWc, frame);
              if (!key || seen.has(key))
                  continue;
              seen.add(key);
              matches.push({ ownerWc, frame });
          }
      }
      const results = [];
      for (const hit of matches)
          results.push(await __bridgeRuntime.ports.ensurePhysicalPdfWrapperRuntime(hit.ownerWc, hit.frame, token, source, force));
      const registeredCount = results.filter(r => r?.ok).length;
      return { ok: registeredCount > 0, token, source, matchCount: matches.length, registeredCount, results, error: registeredCount > 0 ? null : 'Ingen fysisk PDF-wrapper med dette tokenet er klar ennå' };
  }

  async reconcileExistingPdfRuntime(source = 'main-install-reconciliation') {
      const __bridgeRuntime = this;
      const tokens = new Set();
      let owners = [];
      try {
          owners = webContents.getAllWebContents() || [];
      }
      catch (_) {
          owners = [];
      }
      for (const ownerWc of owners) {
          __bridgeRuntime.ports.attachContextListener(ownerWc);
          __bridgeRuntime.ports.attachEmbeddedKeyboardInputListener(ownerWc);
          __bridgeRuntime.ports.attachPdfFrameLifecycle(ownerWc);
          let frames = [];
          try {
              frames = __bridgeRuntime.ports.listFrameSubtree(ownerWc) || [];
          }
          catch (_) { }
          for (const frame of frames) {
              const token = pdfTokenFromWrapperFrameUrl(__bridgeRuntime.ports.safeFrameUrl(frame));
              if (token)
                  tokens.add(token);
          }
      }
      const results = [];
      for (const token of tokens)
          results.push(await __bridgeRuntime.ports.ensurePdfRuntime({ token, source, force: true }));
      return { ok: true, source, tokenCount: tokens.size, results };
  }

  stopWrapperRuntimeInfrastructure() {
      const __bridgeRuntime = this;
      for (const t of __bridgeRuntime.runtime.wrapperRuntime.pollers.values())
          clearInterval(t);
      __bridgeRuntime.runtime.wrapperRuntime.pollers.clear();
      __bridgeRuntime.runtime.wrapperRuntime.registrationInFlight.clear();
      __bridgeRuntime.state.pdfRuntimeRegisteredWrapperCount = 0;
  }

  detachContextListeners() {
      const __bridgeRuntime = this;
      __bridgeRuntime.ports.detachContextListenerWatchers();
      for (const { wc, handler } of __bridgeRuntime.runtime.contextMenu.listeners.values()) {
          try {
              wc.removeListener('context-menu', handler);
          }
          catch (_) {
              try {
                  wc.off('context-menu', handler);
              }
              catch (_) { }
          }
      }
      __bridgeRuntime.runtime.contextMenu.listeners.clear();
      __bridgeRuntime.ports.syncContextListenerCount();
      __bridgeRuntime.ports.restoreFilteredListeners();
  }
}

module.exports = { MainBridgeWrapperLifecycleFeature };
