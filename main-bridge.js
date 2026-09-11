'use strict';

const { app, globalShortcut, webContents, webFrameMain, clipboard, BrowserWindow, screen } = require('electron');

const VERSION = '0.1.194';
const categories = [
  { id: 'slot-1', label: 'Kategori 1', slot: 1, accelerator: 'CommandOrControl+Alt+1' },
  { id: 'slot-2', label: 'Kategori 2', slot: 2, accelerator: 'CommandOrControl+Alt+2' },
  { id: 'slot-3', label: 'Kategori 3', slot: 3, accelerator: 'CommandOrControl+Alt+3' },
  { id: 'slot-4', label: 'Kategori 4', slot: 4, accelerator: 'CommandOrControl+Alt+4' },
  { id: 'slot-5', label: 'Kategori 5', slot: 5, accelerator: 'CommandOrControl+Alt+5' }
];

const OWN_LISTENER = Symbol('pdfiumGateOwnContextListener');
const FILTER_WRAPPER = Symbol('pdfiumGateContextFilterWrapper');

// Keyboard integration for the canonical embedded PDF target. Ctrl/Cmd+P and Ctrl/Cmd+O still route to real Obsidian commands.
// Shift+Left/Right/Up/Down drive a plugin-owned PDFium selection state.
// Ctrl+Shift+Left/Right on Windows/Linux (Option+Shift+Left/Right on macOS)
// reuse the same state but move focus one word at a time. Shift+Home/End reuse
// the same state and move the active focus to the physical text-line edge.
// Ctrl/Cmd+Shift+Home/End reuse the same state and move to document edges.
// Shift+PageUp/PageDown reuse the same state and move roughly one visible viewport.
// Chromium's native mouse selection is only used to seed the first keyboard step.
// Plain arrows remain native PDF navigation.
const WORD_SELECTION_MODIFIER = process.platform === 'darwin' ? 'Alt' : 'Control';

const OBSIDIAN_RESERVED_SHORTCUTS = [
    { id: 'command-palette', accelerator: 'CommandOrControl+P', commandId: 'command-palette:open', routeType: 'obsidian' },
    { id: 'quick-switcher', accelerator: 'CommandOrControl+O', commandId: 'switcher:open', routeType: 'obsidian' },
    { id: 'selection-left', accelerator: 'Shift+Left', direction: 'left', unit: 'glyph', routeType: 'pdf-keyboard' },
    { id: 'selection-right', accelerator: 'Shift+Right', direction: 'right', unit: 'glyph', routeType: 'pdf-keyboard' },
    { id: 'selection-up', accelerator: 'Shift+Up', direction: 'up', unit: 'glyph', routeType: 'pdf-keyboard' },
    { id: 'selection-down', accelerator: 'Shift+Down', direction: 'down', unit: 'glyph', routeType: 'pdf-keyboard' },
    { id: 'selection-word-left', accelerator: `${WORD_SELECTION_MODIFIER}+Shift+Left`, direction: 'left', unit: 'word', routeType: 'pdf-keyboard' },
    { id: 'selection-word-right', accelerator: `${WORD_SELECTION_MODIFIER}+Shift+Right`, direction: 'right', unit: 'word', routeType: 'pdf-keyboard' },
    { id: 'selection-line-home', accelerator: 'Shift+Home', direction: 'left', unit: 'line-edge', routeType: 'pdf-keyboard' },
    { id: 'selection-line-end', accelerator: 'Shift+End', direction: 'right', unit: 'line-edge', routeType: 'pdf-keyboard' },
    { id: 'selection-document-home', accelerator: 'CommandOrControl+Shift+Home', direction: 'left', unit: 'document-edge', routeType: 'pdf-keyboard' },
    { id: 'selection-document-end', accelerator: 'CommandOrControl+Shift+End', direction: 'right', unit: 'document-edge', routeType: 'pdf-keyboard' },
    { id: 'selection-page-up', accelerator: 'Shift+PageUp', direction: 'up', unit: 'viewport', routeType: 'pdf-keyboard' },
    { id: 'selection-page-down', accelerator: 'Shift+PageDown', direction: 'down', unit: 'viewport', routeType: 'pdf-keyboard' },
    { id: 'selection-all', accelerator: 'CommandOrControl+A', direction: 'all', unit: 'select-all', routeType: 'pdf-keyboard' },
];

// BEGIN GENERATED SHARED BRIDGE CONTRACTS
// Canonical Main Bridge -> renderer event contract. Production actions travel
// only through these explicit events; diagnostics may mirror state but must not
// be used as a production transport.
const RENDERER_BRIDGE_EVENTS = Object.freeze({
  OBSIDIAN_COMMAND: 'pdfium-gate-obsidian-command',
  KEYBOARD_SELECTION: 'pdfium-gate-pdf-keyboard-selection',
  NATIVE_COPY: 'pdfium-gate-native-copy',
  KEYBOARD_COPY: 'pdfium-gate-keyboard-copy',
  PDF_CONTEXT_MENU: 'pdfium-gate-pdf-context-menu',
  CATEGORY_SHORTCUT: 'pdfium-gate-category-shortcut',
  ESCAPE_DISMISS: 'pdfium-gate-escape-dismiss',
  PDF_MOUSE_ACTIVATION: 'pdfium-gate-pdf-mouse-activation'
});

const RENDERER_BRIDGE_EVENT_NAMES = new Set(Object.values(RENDERER_BRIDGE_EVENTS));

function validateRendererBridgeEventDetail(eventName, detail) {
  const name=String(eventName||'');
  if(!RENDERER_BRIDGE_EVENT_NAMES.has(name)) return {ok:false,error:`ukjent renderer bridge-event: ${name}`};
  if(!detail || typeof detail!=='object' || Array.isArray(detail)) return {ok:false,error:`${name}: detail må være et objekt`};
  const token=String(detail.token||detail.keyboardSelectionState?.token||'').trim();
  const text=String(detail.selectedText||detail.keyboardSelectionState?.text||'');
  const finite=value=>Number.isFinite(Number(value));
  if(name===RENDERER_BRIDGE_EVENTS.OBSIDIAN_COMMAND && !String(detail.commandId||'').trim()) return {ok:false,error:'obsidian-command: commandId mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.KEYBOARD_SELECTION && (!token || !String(detail.direction||'').trim())) return {ok:false,error:'keyboard-selection: token/direction mangler'};
  if((name===RENDERER_BRIDGE_EVENTS.NATIVE_COPY || name===RENDERER_BRIDGE_EVENTS.KEYBOARD_COPY) && (!token || !text)) return {ok:false,error:'copy-event: token/selectedText mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.PDF_CONTEXT_MENU && (detail.isPdfContext!==true || !String(detail.token||'').trim())) return {ok:false,error:'pdf-context-menu: isPdfContext/token mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.CATEGORY_SHORTCUT && (!String(detail.id||'').trim() || !finite(detail.resultSeq))) return {ok:false,error:'category-shortcut: id/resultSeq mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.ESCAPE_DISMISS && !finite(detail.dismissSeq)) return {ok:false,error:'escape-dismiss: dismissSeq mangler'};
  if(name===RENDERER_BRIDGE_EVENTS.PDF_MOUSE_ACTIVATION && (!String(detail.token||'').trim() || !finite(detail.activationSeq))) return {ok:false,error:'pdf-mouse-activation: token/activationSeq mangler'};
  return {ok:true,detail};
}

function readRendererBridgeEventDetail(eventName, event) {
  const detail=event && event.detail && typeof event.detail==='object' ? event.detail : null;
  return validateRendererBridgeEventDetail(eventName,detail);
}

// END GENERATED SHARED BRIDGE CONTRACTS
// BEGIN GENERATED MAIN-BRIDGE RUNTIME CONTRACTS
// Sources: canonical src/runtime modules; bundled at build time; no runtime local require.
// Chromium PDF Runtime Driver — the single main-process boundary for Chromium's
// built-in PDF viewer identity, probing, viewer DOM/viewport access, coordinate
// conversion and wrapper-scroll primitives. Feature code delegates these operations
// instead of depending on Chromium viewer internals directly.
const CHROMIUM_PDF_RUNTIME_DRIVER_CONTRACT_VERSION = '0.1';
const CHROMIUM_PDF_VIEWER_ORIGIN = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/';
const CHROMIUM_PDF_VIEWER_PROBE_SCRIPT = `(() => { try { const v=document.querySelector('pdf-viewer'); return !!(v && v.viewport); } catch(_) { return false; } })()`;

function createChromiumPdfRuntimeDriver() {
  let viewerFrameResolutionSeq = 0;
  const viewerFrameResolutionHistory = [];

  function frameUrl(frame) {
    try { return String(frame?.url || ''); } catch (_) { return ''; }
  }

  function runtimeFrameIdentity(frame) {
    if (!frame) return null;
    const out = {url:frameUrl(frame),processId:null,routingId:null,isMainFrame:null};
    try { out.processId = Number(frame.processId); } catch (_) {}
    try { out.routingId = Number(frame.routingId); } catch (_) {}
    try { out.isMainFrame = !!frame.isMainFrame; } catch (_) {}
    return out;
  }

  function physicalFrameKey(frame) {
    if (!frame) return null;
    let processId = null, routingId = null;
    try { processId = Number(frame.processId); } catch (_) {}
    try { routingId = Number(frame.routingId); } catch (_) {}
    return Number.isFinite(processId) && Number.isFinite(routingId) ? `${processId}:${routingId}` : null;
  }

  function frameParentKeys(frame) {
    const keys=[];
    let current=frame||null;
    for(let depth=0; current && depth<12; depth+=1){
      const key=physicalFrameKey(current);
      if(key && !keys.includes(key)) keys.push(key);
      try { current=current.parent||null; } catch (_) { current=null; }
    }
    return keys;
  }

  function relationToWrapper(frame, wrapperFrame) {
    const frameKey=physicalFrameKey(frame), wrapperKey=physicalFrameKey(wrapperFrame);
    if(!frameKey||!wrapperKey) return 'unknown';
    if(frameKey===wrapperKey) return 'same-frame';
    const frameParents=frameParentKeys(frame);
    if(frameParents.includes(wrapperKey)) return 'descendant-of-wrapper';
    const wrapperParents=frameParentKeys(wrapperFrame);
    if(wrapperParents.includes(frameKey)) return 'ancestor-of-wrapper';
    return 'no-direct-ancestry';
  }

  function recordViewerFrameResolution(rec) {
    viewerFrameResolutionHistory.push(rec);
    while(viewerFrameResolutionHistory.length>20) viewerFrameResolutionHistory.shift();
    return rec;
  }

  function isViewerUrl(url) {
    return String(url || '').startsWith(CHROMIUM_PDF_VIEWER_ORIGIN);
  }

  function isPdfContext(params) {
    const pageURL = String(params?.pageURL || '');
    const frameURL = String(params?.frameURL || '');
    return isViewerUrl(pageURL) ||
      /^http:\/\/127\.0\.0\.1:\d+\/pdf\/.+\.pdf(?:#.*)?$/i.test(frameURL) ||
      params?.mediaType === 'plugin';
  }

  async function probeViewerFrame(frame) {
    if (!frame || typeof frame.executeJavaScript !== 'function') return false;
    try { return !!(await frame.executeJavaScript(CHROMIUM_PDF_VIEWER_PROBE_SCRIPT, true)); }
    catch (_) { return false; }
  }

  async function resolveViewerFrame({ ownerWc, wrapperFrame, cachedFrame = null }) {
    viewerFrameResolutionSeq += 1;
    const diagnostic={
      at:new Date().toISOString(),
      seq:viewerFrameResolutionSeq,
      owner:ownerWc?{id:Number(ownerWc.id),type:(()=>{try{return String(ownerWc.getType?.()||'');}catch(_){return '';}})()}:null,
      wrapper:runtimeFrameIdentity(wrapperFrame),
      cached:runtimeFrameIdentity(cachedFrame),
      frameCount:0,
      viewerUrlCandidates:[],
      probeOrder:[],
      selected:null,
      reason:null,
      error:null,
      cachedRejectedReason:null
    };

    if (!ownerWc || !wrapperFrame) {
      diagnostic.reason='missing-runtime-input';
      recordViewerFrameResolution(diagnostic);
      return { ok:false, frame:null, reason:'missing-runtime-input', probed:0 };
    }

    // Canonical viewer identity:
    // the Chromium pdf-viewer must be a physical ancestor of the already
    // verified HTTP <embed> wrapper. Never arbitrate between unrelated viewer
    // frames from the owner WebContents, and never execute against the wrapper
    // as a fallback when viewer identity/readiness cannot be proven.
    if (cachedFrame) {
      let destroyed=true;
      try { destroyed=!!cachedFrame.isDestroyed?.(); } catch (_) { destroyed=true; }
      if (!destroyed && isViewerUrl(frameUrl(cachedFrame)) && relationToWrapper(cachedFrame,wrapperFrame)==='ancestor-of-wrapper') {
        diagnostic.selected=runtimeFrameIdentity(cachedFrame);
        diagnostic.reason='cached-verified-viewer-ancestor';
        recordViewerFrameResolution(diagnostic);
        return { ok:true, frame:cachedFrame, reason:'cached-verified-viewer-ancestor', probed:0 };
      }
      diagnostic.cachedRejectedReason=destroyed?'destroyed':(!isViewerUrl(frameUrl(cachedFrame))?'not-viewer-url':'not-wrapper-ancestor');
    }

    const ancestry=[];
    let current=null;
    try { current=wrapperFrame.parent||null; } catch (_) { current=null; }
    for(let depth=0; current && depth<12; depth+=1){
      ancestry.push(current);
      try { current=current.parent||null; } catch (_) { current=null; }
    }
    diagnostic.frameCount=ancestry.length;
    diagnostic.viewerUrlCandidates=ancestry.filter(frame=>isViewerUrl(frameUrl(frame))).map(frame=>({
      ...runtimeFrameIdentity(frame),
      relationToWrapper:relationToWrapper(frame,wrapperFrame),
      parentChain:frameParentKeys(frame)
    }));

    let probed=0;
    for(let index=0; index<ancestry.length; index+=1){
      const frame=ancestry[index];
      if(!isViewerUrl(frameUrl(frame)) || typeof frame?.executeJavaScript!=='function') continue;
      probed+=1;
      const hit=await probeViewerFrame(frame);
      diagnostic.probeOrder.push({
        index,
        ...runtimeFrameIdentity(frame),
        viewerUrl:true,
        relationToWrapper:relationToWrapper(frame,wrapperFrame),
        parentChain:frameParentKeys(frame),
        probeOk:!!hit
      });
      if(hit){
        diagnostic.selected=runtimeFrameIdentity(frame);
        diagnostic.reason='verified-viewer-ancestor';
        recordViewerFrameResolution(diagnostic);
        return {ok:true,frame,reason:'verified-viewer-ancestor',probed};
      }
    }

    diagnostic.reason='no-verified-viewer-ancestor';
    recordViewerFrameResolution(diagnostic);
    return {ok:false,frame:null,reason:'no-verified-viewer-ancestor',probed};
  }

  function buildViewerPointScript(x, y) {
    const clickX = Number(x);
    const clickY = Number(y);
    return `(() => {
      try {
        const clickX = ${JSON.stringify(clickX)};
        const clickY = ${JSON.stringify(clickY)};
        const viewer = document.querySelector('pdf-viewer');
        if (!viewer || !viewer.viewport) {
          return { ok:false, error:'pdf-viewer/viewport ikke funnet', candidates:[] };
        }

        const vp = viewer.viewport;
        const shadowRoot = viewer.shadowRoot || null;
        const scroller = shadowRoot ? shadowRoot.querySelector('#scroller') : null;
        const scrollerRect = scroller && typeof scroller.getBoundingClientRect === 'function'
          ? scroller.getBoundingClientRect()
          : { left:0, top:0, width:window.innerWidth, height:window.innerHeight };

        // Electron/Chromium context-menu x/y are in the root RenderView coordinate
        // space. Viewport.getPageScreenRect() is relative to the PDF scroller.
        // Convert the click once into the same scroller-local coordinate system.
        const scrollerX = clickX - Number(scrollerRect.left || 0);
        const scrollerY = clickY - Number(scrollerRect.top || 0);

        const docDims = viewer.documentDimensions || viewer.documentDimensions_ || null;
        const pageDims = Array.isArray(docDims?.pageDimensions) ? docDims.pageDimensions : [];
        const docLength = Number(
          viewer.docLength_ || viewer.docLength || pageDims.length ||
          viewer.documentDimensions?.pageDimensions?.length || 0
        );
        const zoom = Number(typeof vp.getZoom === 'function' ? vp.getZoom() : 1) || 1;
        const mostVisiblePage = Number(
          typeof vp.getMostVisiblePage === 'function' ? vp.getMostVisiblePage() : -1
        );

        const indexes = [];
        if (Number.isFinite(mostVisiblePage) && mostVisiblePage >= 0) {
          const first = Math.max(0, mostVisiblePage - 4);
          const last = docLength > 0
            ? Math.min(docLength - 1, mostVisiblePage + 4)
            : mostVisiblePage + 4;
          for (let i = first; i <= last; i++) indexes.push(i);
        } else if (docLength > 0) {
          for (let i = 0; i < Math.min(docLength, 12); i++) indexes.push(i);
        }

        const candidates = [];
        const pageDiagnostics = [];

        for (const pageIndex of indexes) {
          let r = null;
          try { r = vp.getPageScreenRect(pageIndex); } catch (_) { continue; }
          if (!r) continue;

          const rx = Number(r.x || 0);
          const ry = Number(r.y || 0);
          const rw = Number(r.width || 0);
          const rh = Number(r.height || 0);
          const margin = 10;
          const inside =
            scrollerX >= rx - margin && scrollerX <= rx + rw + margin &&
            scrollerY >= ry - margin && scrollerY <= ry + rh + margin;

          const diag = {
            pageIndex,
            pageScreenRect:{x:rx,y:ry,width:rw,height:rh},
            inside
          };
          pageDiagnostics.push(diag);
          if (!inside) continue;

          // Use Chromium's own page->screen conversion as an affine transform,
          // then invert it. This automatically includes the viewer's 96/72
          // points-to-pixels conversion, Y inversion and page rotation.
          try {
            if (typeof vp.convertPageToScreen !== 'function') {
              throw new Error('viewport.convertPageToScreen mangler');
            }

            let inset = null;
            try { inset = vp.getPageInsetDimensions(pageIndex); } catch (_) {}
            const pageDim = pageDims[pageIndex] || null;

            const shadowLeft =
              inset && pageDim ? Number(inset.x || 0) - Number(pageDim.x || 0) : 0;
            const shadowTop =
              inset && pageDim ? Number(inset.y || 0) - Number(pageDim.y || 0) : 0;

            // getPageScreenRect() starts at the page CONTENT edge (shadow removed).
            // convertPageToScreen() returns coordinates relative to the whole page
            // box and includes the shadow offset. Recover the page-box screen origin.
            const pageBoxOriginX = rx - shadowLeft * zoom;
            const pageBoxOriginY = ry - shadowTop * zoom;

            const toScroller = point => {
              const q = vp.convertPageToScreen(pageIndex, point);
              return {
                x: pageBoxOriginX + Number(q.x || 0) * zoom,
                y: pageBoxOriginY + Number(q.y || 0) * zoom
              };
            };

            const p0 = toScroller({x:0, y:0});
            const px = toScroller({x:1, y:0});
            const py = toScroller({x:0, y:1});

            const ax = px.x - p0.x;
            const ay = px.y - p0.y;
            const bx = py.x - p0.x;
            const by = py.y - p0.y;
            const det = ax * by - ay * bx;

            if (!Number.isFinite(det) || Math.abs(det) < 1e-9) {
              throw new Error('singulær page→screen-transform');
            }

            const dx = scrollerX - p0.x;
            const dy = scrollerY - p0.y;
            const pageX = (dx * by - dy * bx) / det;
            const pageY = (ax * dy - ay * dx) / det;

            if (Number.isFinite(pageX) && Number.isFinite(pageY)) {
              candidates.push({
                pageIndex,
                pageX,
                pageY,
                zoom,
                // Chromium convertPageToScreen() accepts native PDF page coordinates:
                // X from left, Y from bottom. The inverse therefore returns bottom-origin Y.
                // Keep this contract explicit; consumers must never guess by trying both Y axes.
                coordinateSpace:'pdf-bottom-origin',
                transform:'chromium-convertPageToScreen-inverse',
                pageScreenRect:{x:rx,y:ry,width:rw,height:rh},
                pageBoxOrigin:{x:pageBoxOriginX,y:pageBoxOriginY},
                scrollerPoint:{x:scrollerX,y:scrollerY},
                scrollerRect:{
                  left:Number(scrollerRect.left || 0),
                  top:Number(scrollerRect.top || 0),
                  width:Number(scrollerRect.width || 0),
                  height:Number(scrollerRect.height || 0)
                },
                basis:{p0,px,py,det}
              });
              diag.pagePoint = {x:pageX,y:pageY};
              diag.transform = 'chromium-convertPageToScreen-inverse';
            }
          } catch (e) {
            diag.transformError = String(e && e.message || e);
          }
        }

        let navigationPoint = null;
        try {
          if (typeof vp.retrieveCurrentScreenCoordinates_ === 'function') {
            const p = vp.retrieveCurrentScreenCoordinates_();
            if (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) {
              navigationPoint = {x:Number(p.x), y:Number(p.y)};
            }
          }
        } catch (_) {}
        if (!navigationPoint) {
          try {
            const r = vp.getPageScreenRect(mostVisiblePage);
            navigationPoint = {
              x:Math.max(0, -Number(r.x || 0) / zoom),
              y:Math.max(0, -Number(r.y || 0) / zoom)
            };
          } catch (_) { navigationPoint = {x:0,y:0}; }
        }
        const viewportPosition = vp.position || {x:0,y:0};

        return {
          ok:true,
          clickX,
          clickY,
          scrollerPoint:{x:scrollerX,y:scrollerY},
          scrollerRect:{
            left:Number(scrollerRect.left || 0),
            top:Number(scrollerRect.top || 0),
            width:Number(scrollerRect.width || 0),
            height:Number(scrollerRect.height || 0)
          },
          zoom,
          mostVisiblePage,
          navigationPoint,
          position:{x:Number(viewportPosition.x||0), y:Number(viewportPosition.y||0)},
          docLength,
          candidates,
          pageDiagnostics
        };
      } catch (e) {
        return { ok:false, error:String(e && e.message || e), candidates:[] };
      }
    })()`;
  }

  async function captureViewerPoint(target, x, y) {
    if (!target || typeof target.executeJavaScript !== 'function') return { ok:false, error:'executeJavaScript ikke tilgjengelig', candidates:[] };
    const timeout = new Promise(resolve => setTimeout(() => resolve({ ok:false, error:'viewport-timeout', candidates:[] }), 350));
    try {
      const result = await Promise.race([target.executeJavaScript(buildViewerPointScript(x, y), true), timeout]);
      return result && typeof result === 'object' ? result : { ok:false, error:'ugyldig viewport-resultat', candidates:[] };
    } catch (e) {
      return { ok:false, error:e instanceof Error ? e.message : String(e), candidates:[] };
    }
  }

  async function captureNavigationState(target) {
    if (!target || typeof target.executeJavaScript !== 'function') return {ok:false,error:'PDF viewer target executeJavaScript mangler'};
    try {
      const result = await target.executeJavaScript(`(() => {
        try {
          const viewer=document.querySelector('pdf-viewer');
          const vp=viewer&&viewer.viewport;
          if(!viewer||!vp) return {ok:false,error:'pdf-viewer/viewport ikke funnet'};
          const page=Number(typeof vp.getMostVisiblePage==='function'?vp.getMostVisiblePage():-1);
          const zoom=Number(typeof vp.getZoom==='function'?vp.getZoom():1)||1;
          let point=null;
          try {
            if(typeof vp.retrieveCurrentScreenCoordinates_==='function'){
              const p=vp.retrieveCurrentScreenCoordinates_();
              if(p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))) point={x:Number(p.x),y:Number(p.y)};
            }
          } catch(_) {}
          if(!point&&Number.isFinite(page)&&page>=0){
            try {
              const r=vp.getPageScreenRect(page);
              point={x:Math.max(0,-Number(r?.x||0)/zoom),y:Math.max(0,-Number(r?.y||0)/zoom)};
            } catch(_) {}
          }
          const position=vp.position?{x:Number(vp.position.x||0),y:Number(vp.position.y||0)}:null;
          if(!Number.isFinite(page)||page<0||!point||!Number.isFinite(Number(point.x))||!Number.isFinite(Number(point.y))) {
            return {ok:false,error:'kunne ikke lese gjeldende PDF viewport-state'};
          }
          return {ok:true,source:'chromium-runtime-current-viewport',page,zoom,point,position};
        } catch(e) { return {ok:false,error:String(e&&e.message||e)}; }
      })()`,true);
      return result&&typeof result==='object'?result:{ok:false,error:'tomt navigation-state-resultat'};
    } catch(e) { return {ok:false,error:e instanceof Error?e.message:String(e)}; }
  }


  function buildPagePointToRemoteScript(hint) {
    const pageIndex = Number(hint?.pageIndex);
    const x = Number(hint?.x);
    const y = Number(hint?.y);
    return `(() => {
      try {
        const pageIndex=${JSON.stringify(pageIndex)};
        const point={x:${JSON.stringify(x)},y:${JSON.stringify(y)}};
        const viewer=document.querySelector('pdf-viewer');
        const vp=viewer&&viewer.viewport;
        if(!viewer||!vp) return {ok:false,error:'pdf-viewer/viewport ikke funnet'};
        const shadowRoot=viewer.shadowRoot||null;
        const scroller=shadowRoot?shadowRoot.querySelector('#scroller'):null;
        const sr=scroller&&scroller.getBoundingClientRect?scroller.getBoundingClientRect():{left:0,top:0};
        const docDims=viewer.documentDimensions||viewer.documentDimensions_||null;
        const pageDims=Array.isArray(docDims?.pageDimensions)?docDims.pageDimensions:[];
        const r=vp.getPageScreenRect(pageIndex);
        const zoom=Number(typeof vp.getZoom==='function'?vp.getZoom():1)||1;
        let inset=null; try{inset=vp.getPageInsetDimensions(pageIndex);}catch(_){}
        const pageDim=pageDims[pageIndex]||null;
        const shadowLeft=inset&&pageDim?Number(inset.x||0)-Number(pageDim.x||0):0;
        const shadowTop=inset&&pageDim?Number(inset.y||0)-Number(pageDim.y||0):0;
        const pageBoxOriginX=Number(r.x||0)-shadowLeft*zoom;
        const pageBoxOriginY=Number(r.y||0)-shadowTop*zoom;
        const q=vp.convertPageToScreen(pageIndex,point);
        const scrollerX=pageBoxOriginX+Number(q.x||0)*zoom;
        const scrollerY=pageBoxOriginY+Number(q.y||0)*zoom;
        const vpPos=vp.position||{x:0,y:0};
        return {
          ok:true,
          remotePoint:{x:scrollerX+Number(sr.left||0),y:scrollerY+Number(sr.top||0)},
          scrollerPoint:{x:scrollerX,y:scrollerY},
          zoom,
          diagnostic:{
            pageScreenRect:r?{x:Number(r.x||0),y:Number(r.y||0),width:Number(r.width||0),height:Number(r.height||0)}:null,
            convertPageToScreen:{x:Number(q.x||0),y:Number(q.y||0)},
            pageBoxOrigin:{x:pageBoxOriginX,y:pageBoxOriginY},
            shadowOffset:{left:shadowLeft,top:shadowTop},
            pageDimension:pageDim?{x:Number(pageDim.x||0),y:Number(pageDim.y||0),width:Number(pageDim.width||0),height:Number(pageDim.height||0)}:null,
            inset:inset?{x:Number(inset.x||0),y:Number(inset.y||0),width:Number(inset.width||0),height:Number(inset.height||0)}:null,
            viewportPosition:{x:Number(vpPos.x||0),y:Number(vpPos.y||0)},
            scrollerRect:{left:Number(sr.left||0),top:Number(sr.top||0),width:Number(sr.width||0),height:Number(sr.height||0)},
            scrollerScroll:{left:Number(scroller?.scrollLeft||0),top:Number(scroller?.scrollTop||0)},
            viewerWindowScroll:{x:Number(window.scrollX||0),y:Number(window.scrollY||0)}
          }
        };
      } catch(e){ return {ok:false,error:String(e&&e.message||e)}; }
    })()`;
  }

  async function pagePointToRemote(target, hint) {
    const out={ok:false,hint:null,remotePoint:null,error:null};
    try {
      const pageIndex=Number(hint?.pageIndex), x=Number(hint?.x), y=Number(hint?.y);
      out.hint={pageIndex,x,y};
      if(![pageIndex,x,y].every(Number.isFinite)) throw new Error('ugyldig selectionHint');
      if(!target||typeof target.executeJavaScript!=='function') throw new Error('PDF mainFrame executeJavaScript mangler');
      const result=await target.executeJavaScript(buildPagePointToRemoteScript({pageIndex,x,y}),true);
      if(!result?.ok) throw new Error(result?.error||'kunne ikke konvertere selectionHint til remote punkt');
      out.remotePoint={x:Number(result.remotePoint?.x),y:Number(result.remotePoint?.y)};
      out.detail=result;
      out.ok=[out.remotePoint.x,out.remotePoint.y].every(Number.isFinite);
      if(!out.ok) throw new Error('ugyldig remote punkt');
    } catch(e){ out.error=e instanceof Error?e.message:String(e); }
    return out;
  }



  function buildScrollerOffsetScript() {
    return `(() => {
      try{
        const viewer=document.querySelector('pdf-viewer');
        const root=viewer&&viewer.shadowRoot;
        const scroller=root&&root.querySelector('#scroller');
        const r=scroller&&scroller.getBoundingClientRect?scroller.getBoundingClientRect():null;
        return r?{ok:true,left:Number(r.left||0),top:Number(r.top||0),width:Number(r.width||0),height:Number(r.height||0)}:{ok:false,error:'scroller ikke funnet'};
      }catch(e){return {ok:false,error:String(e&&e.message||e)};}
    })()`;
  }

  async function captureScrollerOffset(target) {
    if(!target||typeof target.executeJavaScript!=='function') return {ok:false,error:'PDF viewer target executeJavaScript mangler'};
    try {
      const result=await target.executeJavaScript(buildScrollerOffsetScript(),true);
      return result&&typeof result==='object'?result:{ok:false,error:'tomt scroller-resultat'};
    } catch(e) { return {ok:false,error:e instanceof Error?e.message:String(e)}; }
  }

  async function captureKeyboardState(target, includeViewportMap = false) {
    try {
      const includeMap = !!includeViewportMap;
      if(!target||typeof target.executeJavaScript!=='function') return {ok:false,error:'PDF viewer target executeJavaScript mangler'};
      const result = await target.executeJavaScript(`(() => {
        try {
          const includeViewportMap=${JSON.stringify(includeMap)};
          const viewer = document.querySelector('pdf-viewer');
          const vp = viewer && viewer.viewport;
          if (!viewer || !vp) return {ok:false,error:'pdf-viewer/viewport ikke funnet'};
          const shadowRoot=viewer.shadowRoot||null;
          const scroller=shadowRoot?shadowRoot.querySelector('#scroller'):null;
          const sr=scroller&&typeof scroller.getBoundingClientRect==='function'
            ? scroller.getBoundingClientRect()
            : {left:0,top:0,width:window.innerWidth,height:window.innerHeight};
          const zoom=Number(typeof vp.getZoom === 'function' ? vp.getZoom() : 1) || 1;
          const state={
            ok:true,
            mostVisiblePage:Number(typeof vp.getMostVisiblePage === 'function' ? vp.getMostVisiblePage() : -1),
            zoom,
            position:vp.position ? {x:Number(vp.position.x||0),y:Number(vp.position.y||0)} : null,
            scrollerRect:{left:Number(sr.left||0),top:Number(sr.top||0),width:Number(sr.width||0),height:Number(sr.height||0)},
            viewportHeight:Number(sr.height||window.innerHeight||0),
            pageTransforms:[]
          };
          if(!includeViewportMap) return state;

          const docDims=viewer.documentDimensions||viewer.documentDimensions_||null;
          const pageDims=Array.isArray(docDims?.pageDimensions)?docDims.pageDimensions:[];
          const docLength=Number(viewer.docLength_||viewer.docLength||pageDims.length||viewer.documentDimensions?.pageDimensions?.length||0);
          state.docLength=docLength;
          for(let pageIndex=0;pageIndex<docLength;pageIndex+=1){
            try{
              const r=vp.getPageScreenRect(pageIndex);
              if(!r) continue;
              let inset=null; try{inset=vp.getPageInsetDimensions(pageIndex);}catch(_){}
              const pageDim=pageDims[pageIndex]||null;
              const shadowLeft=inset&&pageDim?Number(inset.x||0)-Number(pageDim.x||0):0;
              const shadowTop=inset&&pageDim?Number(inset.y||0)-Number(pageDim.y||0):0;
              const pageBoxOriginX=Number(r.x||0)-shadowLeft*zoom;
              const pageBoxOriginY=Number(r.y||0)-shadowTop*zoom;
              const toScroller=point=>{
                const q=vp.convertPageToScreen(pageIndex,point);
                return {x:pageBoxOriginX+Number(q.x||0)*zoom,y:pageBoxOriginY+Number(q.y||0)*zoom};
              };
              const p0=toScroller({x:0,y:0});
              const px=toScroller({x:1,y:0});
              const py=toScroller({x:0,y:1});
              if(![p0.x,p0.y,px.x,px.y,py.x,py.y].every(Number.isFinite)) continue;
              state.pageTransforms.push({
                pageIndex,
                rect:{x:Number(r.x||0),y:Number(r.y||0),width:Number(r.width||0),height:Number(r.height||0)},
                p0,px,py
              });
            }catch(_){}
          }
          return state;
        } catch (e) { return {ok:false,error:String(e && e.message || e)}; }
      })()`, true);
      return result || {ok:false,error:'tomt viewer-resultat'};
    } catch (e) { return {ok:false,error:e instanceof Error ? e.message : String(e)}; }
  }

  function buildKeyboardOverlayScript(payload) {
    const safe = JSON.stringify(payload || {});
    return `(() => {
      try {
        const payload=${safe};
        const viewer=document.querySelector('pdf-viewer');
        const vp=viewer&&viewer.viewport;
        if(!viewer||!vp) return {ok:false,error:'pdf-viewer/viewport ikke funnet'};
        const shadowRoot=viewer.shadowRoot||null;
        const scroller=shadowRoot?shadowRoot.querySelector('#scroller'):null;
        let overlay=document.getElementById('pdfium-gate-keyboard-selection-overlay');
        if(!overlay){
          overlay=document.createElement('div');
          overlay.id='pdfium-gate-keyboard-selection-overlay';
          overlay.style.position='fixed'; overlay.style.inset='0'; overlay.style.pointerEvents='none';
          overlay.style.zIndex='2147483000'; overlay.setAttribute('aria-hidden','true');
          document.documentElement.appendChild(overlay);
        }
        const state=window.__pdfiumGateKeyboardSelection || {payload:null,installed:false,raf:0,lastViewportSignature:null};
        state.payload=payload;
        const viewportSignature=()=>{
          const pos=vp.position||{x:0,y:0};
          let zoom=1; try{zoom=Number(typeof vp.getZoom==='function'?vp.getZoom():1)||1;}catch(_){}
          return [Number(pos.x||0),Number(pos.y||0),zoom,Number(scroller?.scrollLeft||0),Number(scroller?.scrollTop||0),Number(window.scrollX||0),Number(window.scrollY||0)].join('|');
        };
        const render=()=>{
          try{
            if(!state.payload) { overlay.replaceChildren(); return; }
            overlay.replaceChildren();
            const rects=Array.isArray(state.payload?.rects)?state.payload.rects:[];
            const sr=scroller&&scroller.getBoundingClientRect?scroller.getBoundingClientRect():{left:0,top:0};
            const docDims=viewer.documentDimensions||viewer.documentDimensions_||null;
            const pageDims=Array.isArray(docDims?.pageDimensions)?docDims.pageDimensions:[];
            const zoom=Number(typeof vp.getZoom==='function'?vp.getZoom():1)||1;
            const convertPoint=(pageIndex,p)=>{
              const r=vp.getPageScreenRect(pageIndex);
              let inset=null; try{inset=vp.getPageInsetDimensions(pageIndex);}catch(_){}
              const pageDim=pageDims[pageIndex]||null;
              const shadowLeft=inset&&pageDim?Number(inset.x||0)-Number(pageDim.x||0):0;
              const shadowTop=inset&&pageDim?Number(inset.y||0)-Number(pageDim.y||0):0;
              const pageBoxOriginX=Number(r.x||0)-shadowLeft*zoom;
              const pageBoxOriginY=Number(r.y||0)-shadowTop*zoom;
              const q=vp.convertPageToScreen(pageIndex,p);
              return {x:pageBoxOriginX+Number(q.x||0)*zoom+Number(sr.left||0),y:pageBoxOriginY+Number(q.y||0)*zoom+Number(sr.top||0)};
            };
            for(const spec of rects){
              const pageIndex=Number(spec.pageIndex), x=Number(spec.origin?.x), y=Number(spec.origin?.y);
              const w=Number(spec.size?.width), h=Number(spec.size?.height), pageHeight=Number(spec.pageHeight);
              if(![pageIndex,x,y,w,h,pageHeight].every(Number.isFinite)||w<=0||h<=0) continue;
              const p1=convertPoint(pageIndex,{x,y:pageHeight-(y+h)});
              const p2=convertPoint(pageIndex,{x:x+w,y:pageHeight-y});
              const left=Math.min(p1.x,p2.x), top=Math.min(p1.y,p2.y), width=Math.abs(p2.x-p1.x), height=Math.abs(p2.y-p1.y);
              if(width<0.5||height<0.5) continue;
              const el=document.createElement('div');
              el.style.position='fixed'; el.style.left=left+'px'; el.style.top=top+'px';
              el.style.width=width+'px'; el.style.height=height+'px';
              el.style.background='rgba(80, 140, 230, 0.38)'; el.style.borderRadius='1px';
              overlay.appendChild(el);
            }
            state.lastViewportSignature=viewportSignature();
            state.lastRender={at:new Date().toISOString(),rectCount:overlay.childElementCount,zoom,viewportSignature:state.lastViewportSignature};
          }catch(e){state.lastError=String(e&&e.message||e);}
        };
        const scheduleRender=()=>requestAnimationFrame(render);
        const tick=()=>{
          try{
            if(state.payload){
              const sig=viewportSignature();
              if(sig!==state.lastViewportSignature) render();
              state.raf=requestAnimationFrame(tick);
            } else state.raf=0;
          }catch(e){state.lastError=String(e&&e.message||e);state.raf=requestAnimationFrame(tick);}
        };
        if(!state.installed){
          try{scroller&&scroller.addEventListener('scroll',scheduleRender,{passive:true});}catch(_){}
          try{window.addEventListener('scroll',scheduleRender,{passive:true,capture:true});}catch(_){}
          try{document.addEventListener('scroll',scheduleRender,{passive:true,capture:true});}catch(_){}
          try{window.addEventListener('resize',scheduleRender,{passive:true});}catch(_){}
          state.installed=true;
        }
        state.render=render; state.viewportSignature=viewportSignature; window.__pdfiumGateKeyboardSelection=state;
        render();
        if(!state.raf) state.raf=requestAnimationFrame(tick);
        return {ok:true,rectCount:overlay.childElementCount,textLength:String(payload.text||'').length,range:payload.range||null,selectionModel:payload.selectionModel||null,lastRender:state.lastRender||null};
      } catch(e) { return {ok:false,error:String(e&&e.message||e)}; }
    })()`;
  }

  async function renderKeyboardSelectionOverlay(target, payload) {
    if(!target||typeof target.executeJavaScript!=='function') return {ok:false,error:'PDF viewer target executeJavaScript mangler'};
    try { return await target.executeJavaScript(buildKeyboardOverlayScript(payload),true); }
    catch(e) { return {ok:false,error:e instanceof Error?e.message:String(e)}; }
  }

  async function removeKeyboardSelectionOverlay(target) {
    if(!target||typeof target.executeJavaScript!=='function') return {ok:false,error:'PDF viewer target executeJavaScript mangler'};
    try {
      return await target.executeJavaScript(`(() => { try { const el=document.getElementById('pdfium-gate-keyboard-selection-overlay'); if(el) el.remove(); if(window.__pdfiumGateKeyboardSelection){ window.__pdfiumGateKeyboardSelection.payload=null; if(window.__pdfiumGateKeyboardSelection.raf){ cancelAnimationFrame(window.__pdfiumGateKeyboardSelection.raf); window.__pdfiumGateKeyboardSelection.raf=0; } } return {ok:true}; } catch(e){ return {ok:false,error:String(e&&e.message||e)}; } })()`,true);
    } catch(e) { return {ok:false,error:e instanceof Error?e.message:String(e)}; }
  }

  function buildPdfLinkLocatorOverlayScript(payload) {
    const safe = JSON.stringify(payload || {});
    return `(() => {
      try {
        const payload=${safe};
        const viewer=document.querySelector('pdf-viewer');
        const vp=viewer&&viewer.viewport;
        if(!viewer||!vp) return {ok:false,error:'pdf-viewer/viewport ikke funnet'};
        const shadowRoot=viewer.shadowRoot||null;
        const scroller=shadowRoot?shadowRoot.querySelector('#scroller'):null;
        const sr=()=>scroller&&scroller.getBoundingClientRect?scroller.getBoundingClientRect():{left:0,top:0,width:window.innerWidth,height:window.innerHeight};
        let overlay=document.getElementById('pdfium-gate-link-locator-overlay');
        if(!overlay){
          overlay=document.createElement('div');
          overlay.id='pdfium-gate-link-locator-overlay';
          overlay.style.position='fixed'; overlay.style.inset='0'; overlay.style.pointerEvents='none';
          overlay.style.zIndex='2147482999'; overlay.setAttribute('aria-hidden','true');
          document.documentElement.appendChild(overlay);
        }
        const state=window.__pdfiumGateLinkLocator || {payload:null,raf:0,lastViewportSignature:null,lastRender:null,lastError:null};
        state.payload=payload;
        const viewportSignature=()=>{
          const pos=vp.position||{x:0,y:0};
          let zoom=1; try{zoom=Number(typeof vp.getZoom==='function'?vp.getZoom():1)||1;}catch(_){}
          const r=sr();
          return [Number(pos.x||0),Number(pos.y||0),zoom,Number(scroller?.scrollLeft||0),Number(scroller?.scrollTop||0),Number(window.scrollX||0),Number(window.scrollY||0),Number(r.left||0),Number(r.top||0)].join('|');
        };
        const render=()=>{
          try{
            overlay.replaceChildren();
            const spec=state.payload||{};
            const pageIndex=Number(spec.pageIndex), x=Number(spec.x), y=Number(spec.y);
            if(![pageIndex,x,y].every(Number.isFinite)) throw new Error('ugyldig locator-posisjon');
            const r=vp.getPageScreenRect(pageIndex);
            if(!r) throw new Error('pageScreenRect mangler');
            const rect=sr();
            const docDims=viewer.documentDimensions||viewer.documentDimensions_||null;
            const pageDims=Array.isArray(docDims?.pageDimensions)?docDims.pageDimensions:[];
            const zoom=Number(typeof vp.getZoom==='function'?vp.getZoom():1)||1;
            let inset=null; try{inset=vp.getPageInsetDimensions(pageIndex);}catch(_){}
            const pageDim=pageDims[pageIndex]||null;
            const shadowLeft=inset&&pageDim?Number(inset.x||0)-Number(pageDim.x||0):0;
            const shadowTop=inset&&pageDim?Number(inset.y||0)-Number(pageDim.y||0):0;
            const pageBoxOriginX=Number(r.x||0)-shadowLeft*zoom;
            const pageBoxOriginY=Number(r.y||0)-shadowTop*zoom;
            const q=vp.convertPageToScreen(pageIndex,{x,y});
            const pointX=pageBoxOriginX+Number(q.x||0)*zoom+Number(rect.left||0);
            const pointY=pageBoxOriginY+Number(q.y||0)*zoom+Number(rect.top||0);
            const pageLeft=Number(rect.left||0)+Number(r.x||0);
            const left=Math.max(Number(rect.left||0)+4,pageLeft-23);
            const top=pointY-15;
            const bar=document.createElement('div');
            bar.style.position='fixed'; bar.style.left=left+'px'; bar.style.top=top+'px';
            bar.style.width='7px'; bar.style.height='30px'; bar.style.borderRadius='4px';
            bar.style.background='rgba(255, 138, 0, 0.98)';
            bar.style.boxShadow='0 0 0 2px rgba(255,255,255,.80), 0 2px 7px rgba(0,0,0,.48)';
            const arm=document.createElement('div');
            arm.style.position='fixed'; arm.style.left=(left+7)+'px'; arm.style.top=(pointY-2.5)+'px';
            arm.style.width='16px'; arm.style.height='5px'; arm.style.borderRadius='0 3px 3px 0';
            arm.style.background='rgba(255, 138, 0, 0.98)';
            arm.style.boxShadow='0 0 0 1px rgba(255,255,255,.70)';
            overlay.appendChild(bar); overlay.appendChild(arm);
            state.lastViewportSignature=viewportSignature();
            state.lastRender={
              at:new Date().toISOString(),pageIndex,pointX,pointY,pageLeft,left,top,zoom,markerCount:overlay.childElementCount,
              pageScreenRect:{x:Number(r.x||0),y:Number(r.y||0),width:Number(r.width||0),height:Number(r.height||0)},
              convertPageToScreen:{x:Number(q.x||0),y:Number(q.y||0)},
              pageBoxOrigin:{x:pageBoxOriginX,y:pageBoxOriginY},
              scrollerRect:{left:Number(rect.left||0),top:Number(rect.top||0),width:Number(rect.width||0),height:Number(rect.height||0)},
              scrollerScroll:{left:Number(scroller?.scrollLeft||0),top:Number(scroller?.scrollTop||0)},
              viewportPosition:{x:Number(vp.position?.x||0),y:Number(vp.position?.y||0)},
              viewerWindowScroll:{x:Number(window.scrollX||0),y:Number(window.scrollY||0)}
            };
            state.lastError=null;
          }catch(e){ state.lastError=String(e&&e.message||e); }
        };
        const tick=()=>{
          try{
            if(state.payload){
              const sig=viewportSignature();
              if(sig!==state.lastViewportSignature) render();
              state.raf=requestAnimationFrame(tick);
            } else state.raf=0;
          }catch(e){state.lastError=String(e&&e.message||e);state.raf=requestAnimationFrame(tick);}
        };
        state.render=render; window.__pdfiumGateLinkLocator=state;
        render();
        if(!state.raf) state.raf=requestAnimationFrame(tick);
        return {ok:!state.lastError,error:state.lastError,lastRender:state.lastRender,markerCount:overlay.childElementCount};
      } catch(e) { return {ok:false,error:String(e&&e.message||e)}; }
    })()`;
  }

  async function renderLinkLocatorOverlay(target, payload) {
    if(!target||typeof target.executeJavaScript!=='function') return {ok:false,error:'PDF viewer target executeJavaScript mangler'};
    try { return await target.executeJavaScript(buildPdfLinkLocatorOverlayScript(payload),true); }
    catch(e) { return {ok:false,error:e instanceof Error?e.message:String(e)}; }
  }

  async function focusViewerRuntime(target) {
    if(!target||typeof target.executeJavaScript!=='function') return {ok:false,error:'PDF viewer target executeJavaScript mangler'};
    try {
      return await target.executeJavaScript(`(() => {
        try {
          window.focus();
          const viewer=document.querySelector('pdf-viewer');
          if(viewer&&typeof viewer.focus==='function') {
            try { viewer.focus({preventScroll:true}); } catch (_) { try { viewer.focus(); } catch (_) {} }
          }
          return {ok:true,hasFocus:document.hasFocus(),activeTag:document.activeElement?.tagName||null};
        } catch(e) { return {ok:false,error:String(e&&e.message||e)}; }
      })()`,true);
    } catch(e) { return {ok:false,error:e instanceof Error?e.message:String(e)}; }
  }

  async function scrollWrapperForKeyboard(wrapperFrame, targetY, direction) {
    if(!wrapperFrame||typeof wrapperFrame.executeJavaScript!=='function') return {ok:false,error:'Chromium PDF-wrapper executeJavaScript mangler'};
    try {
      return await wrapperFrame.executeJavaScript(`(() => {
        try {
          const targetY=${JSON.stringify(Number(targetY))};
          const direction=${JSON.stringify(String(direction||''))};
          const h=Number(window.innerHeight||document.documentElement.clientHeight||0);
          if(!Number.isFinite(h)||h<=0) return {ok:false,error:'ugyldig wrapper viewport-høyde',targetY,h};
          const margin=Math.max(42,Math.min(68,h*0.12));
          const topLimit=margin;
          const bottomLimit=h-margin;
          let dy=0;
          if(targetY<topLimit) dy=targetY-topLimit;
          else if(targetY>bottomLimit) dy=targetY-bottomLimit;
          const before=Number(window.scrollY||0);
          if(Math.abs(dy)>0.5) window.scrollBy({left:0,top:dy,behavior:'auto'});
          const after=Number(window.scrollY||0);
          return {ok:true,direction,targetY,h,margin,topLimit,bottomLimit,dy,before,after,moved:Math.abs(after-before)>0.5};
        } catch(e) { return {ok:false,error:String(e&&e.message||e)}; }
      })()`,true);
    } catch(e) { return {ok:false,error:e instanceof Error?e.message:String(e)}; }
  }

  async function scrollWrapperForLocator(wrapperFrame, targetY) {
    if(!wrapperFrame||typeof wrapperFrame.executeJavaScript!=='function') return {ok:false,error:'Chromium PDF-wrapper executeJavaScript mangler'};
    try {
      return await wrapperFrame.executeJavaScript(`(() => {
        try {
          const targetY=${JSON.stringify(Number(targetY))};
          const de=document.documentElement, body=document.body;
          const snapshot=()=>({
            windowScrollX:Number(window.scrollX||0),windowScrollY:Number(window.scrollY||0),
            documentScrollTop:Number(de?.scrollTop||0),bodyScrollTop:Number(body?.scrollTop||0),
            innerHeight:Number(window.innerHeight||de?.clientHeight||0),innerWidth:Number(window.innerWidth||de?.clientWidth||0),
            documentClientHeight:Number(de?.clientHeight||0),documentScrollHeight:Number(de?.scrollHeight||0),
            bodyClientHeight:Number(body?.clientHeight||0),bodyScrollHeight:Number(body?.scrollHeight||0),
            scrollingElementTag:String(document.scrollingElement?.tagName||''),scrollingElementTop:Number(document.scrollingElement?.scrollTop||0),
            href:String(location.href||'')
          });
          const beforeState=snapshot();
          const h=Number(beforeState.innerHeight||0);
          if(!Number.isFinite(h)||h<=0) return {ok:false,error:'ugyldig wrapper viewport-høyde',beforeState};
          const desired=Math.max(90,Math.min(h-90,h*0.38));
          const tolerance=Math.max(28,Math.min(55,h*0.10));
          let dy=0;
          if(targetY<desired-tolerance||targetY>desired+tolerance) dy=targetY-desired;
          if(Math.abs(dy)>0.5) window.scrollBy({left:0,top:dy,behavior:'auto'});
          const afterState=snapshot();
          const before=Number(beforeState.windowScrollY||0), after=Number(afterState.windowScrollY||0);
          return {ok:true,targetY,h,desired,tolerance,dy,before,after,moved:Math.abs(after-before)>0.5,beforeState,afterState};
        } catch(e){ return {ok:false,error:String(e&&e.message||e)}; }
      })()`,true);
    } catch(e) { return {ok:false,error:e instanceof Error?e.message:String(e)}; }
  }
  function getCapabilities() {
    return {
      contractVersion: CHROMIUM_PDF_RUNTIME_DRIVER_CONTRACT_VERSION,
      viewerOrigin: CHROMIUM_PDF_VIEWER_ORIGIN,
      viewerSelector: 'pdf-viewer',
      viewportProperty: 'viewport',
      embeddedViewerProbe: true,
      viewerPointCapture: true,
      navigationStateCapture: true,
      pagePointToRemoteProduction: true,
      viewerDomBoundaryProduction: true,
      scrollerGeometryCapture: true,
      keyboardStateCapture: true,
      keyboardOverlayRendering: true,
      locatorOverlayRendering: true,
      focusRestoreProduction: true,
      wrapperScrollOperations: true,
      viewerFrameRelationshipDiagnostic: true,
      lastViewerFrameResolution: viewerFrameResolutionHistory.length ? viewerFrameResolutionHistory[viewerFrameResolutionHistory.length-1] : null,
      viewerFrameResolutionHistory: viewerFrameResolutionHistory.slice()
    };
  }

  return Object.freeze({
    contractVersion: CHROMIUM_PDF_RUNTIME_DRIVER_CONTRACT_VERSION,
    isViewerUrl,
    isPdfContext,
    probeViewerFrame,
    resolveViewerFrame,
    captureViewerPoint,
    captureNavigationState,
    pagePointToRemote,
    captureScrollerOffset,
    captureKeyboardState,
    renderKeyboardSelectionOverlay,
    removeKeyboardSelectionOverlay,
    renderLinkLocatorOverlay,
    focusViewerRuntime,
    scrollWrapperForKeyboard,
    scrollWrapperForLocator,
    getCapabilities
  });
}

// END GENERATED MAIN-BRIDGE RUNTIME CONTRACTS
// BEGIN GENERATED MAIN-BRIDGE PLATFORM CONTRACTS
// Sources: canonical src/platform modules; bundled at build time; no runtime local require.
// PDFium Gate Platform Contract — exact Chromium internal PDF wrapper frame identity.
// Source-of-truth for the adapter bundled into release main-bridge.js.
const PDF_WRAPPER_FRAME_CONTRACT_VERSION = '0.2';

function pdfTokenFromWrapperFrameUrl(url) {
  const text = String(url || '');
  const match = text.match(/^http:\/\/127\.0\.0\.1:\d+\/pdf\/([^/?#]+)\.pdf(?:[?#].*)?$/i);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); }
  catch (_) { return match[1]; }
}

function createPdfWrapperFrameAdapter({ listFrameSubtree }) {
  if (typeof listFrameSubtree !== 'function') {
    throw new Error('listFrameSubtree må være en funksjon');
  }

  function enumerate(pdfTarget, token) {
    const safeToken = String(token || '').trim();
    if (!safeToken) {
      return {
        ok:false, token:null, frames:[], candidates:[], matches:[], reason:'missing-token',
        matchCount:0, candidateCount:0, error:'PDF-token mangler'
      };
    }
    if (!pdfTarget) {
      return {
        ok:false, token:safeToken, frames:[], candidates:[], matches:[], reason:'missing-target',
        matchCount:0, candidateCount:0, error:'Embedded PDF-target mangler'
      };
    }
    let frames = [];
    try { frames = listFrameSubtree(pdfTarget) || []; }
    catch (error) {
      return {
        ok:false, token:safeToken, frames:[], candidates:[], matches:[], reason:'enumeration-failed',
        matchCount:0, candidateCount:0,
        error:error instanceof Error ? error.message : String(error)
      };
    }
    const candidates = frames.filter(frame => {
      try { return !!pdfTokenFromWrapperFrameUrl(frame?.url); }
      catch (_) { return false; }
    });
    const matches = candidates.filter(frame => {
      try { return pdfTokenFromWrapperFrameUrl(frame?.url) === safeToken; }
      catch (_) { return false; }
    });
    return {ok:true, token:safeToken, frames, candidates, matches, reason:null, matchCount:matches.length, candidateCount:candidates.length, error:null};
  }

  function preferredPhysicalMatch(pdfTarget, matches) {
    let preferred = null;
    try { preferred = pdfTarget?.wrapperFrame || null; } catch (_) {}
    if (!preferred) return null;
    let processId = null, routingId = null;
    try { processId = Number(preferred.processId); } catch (_) {}
    try { routingId = Number(preferred.routingId); } catch (_) {}
    if (!Number.isFinite(processId) || !Number.isFinite(routingId)) return null;
    return matches.find(frame => {
      try { return Number(frame?.processId) === processId && Number(frame?.routingId) === routingId; }
      catch (_) { return false; }
    }) || null;
  }

  function successfulFrameResult(base, frame, reason, matchCount=base.matches.length) {
    if (typeof frame?.executeJavaScript !== 'function') {
      return {
        ok:false, token:base.token, frame:null, candidates:base.candidates, reason:`${reason}-execute-unavailable`,
        matchCount, candidateCount:base.candidates.length,
        error:'Chromium PDF-wrapper frame mangler executeJavaScript()'
      };
    }
    return {
      ok:true, token:base.token, frame, candidates:base.candidates, reason,
      matchCount, candidateCount:base.candidates.length, error:null
    };
  }

  function resolveExact(pdfTarget, token) {
    const base = enumerate(pdfTarget, token);
    if (!base.ok) return {ok:false, token:base.token, frame:null, candidates:base.candidates, reason:base.reason, matchCount:base.matchCount, candidateCount:base.candidateCount, error:base.error};
    const { matches } = base;
    if (matches.length === 0) {
      return {
        ok:false, token:base.token, frame:null, candidates:base.candidates, reason:'not-found',
        matchCount:0, candidateCount:base.candidates.length,
        error:'Eksakt Chromium PDF-wrapper frame ble ikke funnet'
      };
    }
    if (matches.length > 1) {
      // Electron 43 can retain stale duplicate token-like frames. The canonical
      // target already carries its physical wrapper identity, so only that
      // processId+routingId pair may disambiguate the candidates.
      const physical = preferredPhysicalMatch(pdfTarget, matches);
      if (physical) return successfulFrameResult(base, physical, 'target-physical-frame-disambiguation');
      return {
        ok:false, token:base.token, frame:null, candidates:base.candidates, reason:'ambiguous',
        matchCount:matches.length, candidateCount:base.candidates.length,
        error:'Flere Chromium PDF-wrapper frames matcher samme token og ingen eksplisitt fysisk target-identitet kan skille dem'
      };
    }
    return successfulFrameResult(base, matches[0], 'exact-wrapper-url-token', 1);
  }

  async function resolveExactVerified(pdfTarget, token) {
    const base = enumerate(pdfTarget, token);
    if (!base.ok) return {ok:false, token:base.token, frame:null, candidates:base.candidates, reason:base.reason, matchCount:base.matchCount, candidateCount:base.candidateCount, verification:[], error:base.error};
    if (base.matches.length === 0) {
      return {
        ok:false, token:base.token, frame:null, candidates:base.candidates, reason:'not-found',
        matchCount:0, candidateCount:base.candidates.length, verification:[],
        error:'Eksakt Chromium PDF-wrapper frame ble ikke funnet'
      };
    }

    // A token-like HTTP frame is not necessarily Chromium's actual
    // pdf_internal_plugin_wrapper. Prove wrapper identity on demand by requiring
    // the frame itself to contain the PDF <embed>.
    const verification=[];
    const verified=[];
    for (const frame of base.matches) {
      const rec={
        url:String(frame?.url||''),
        processId:Number(frame?.processId),
        routingId:Number(frame?.routingId),
        ok:false,tag:null,error:null
      };
      try {
        if (typeof frame?.executeJavaScript !== 'function') throw new Error('executeJavaScript mangler');
        const probe=await frame.executeJavaScript(`(() => {
          try {
            const embed=document.querySelector('embed');
            return {ok:!!embed,tag:embed?String(embed.tagName||'EMBED'):null,href:String(location.href||'')};
          } catch(e) { return {ok:false,error:String(e&&e.message||e),href:String(location.href||'')}; }
        })()`,true);
        rec.ok=!!probe?.ok;
        rec.tag=probe?.tag||null;
        rec.error=probe?.error||null;
        if(rec.ok) verified.push(frame);
      } catch(error) {
        rec.error=error instanceof Error ? error.message : String(error);
      }
      verification.push(rec);
    }

    if (verified.length === 1) {
      const out=successfulFrameResult(base, verified[0], 'verified-embed-wrapper-disambiguation', base.matches.length);
      out.verification=verification;
      out.verifiedCount=1;
      return out;
    }
    if (verified.length > 1) {
      const physical=preferredPhysicalMatch(pdfTarget, verified);
      if (physical) {
        const out=successfulFrameResult(base, physical, 'verified-embed-target-physical-disambiguation', base.matches.length);
        out.verification=verification;
        out.verifiedCount=verified.length;
        return out;
      }
      return {
        ok:false, token:base.token, frame:null, candidates:base.candidates, reason:'verified-embed-ambiguous',
        matchCount:base.matches.length, candidateCount:base.candidates.length, verification, verifiedCount:verified.length,
        error:'Flere verifiserte Chromium PDF-wrapper frames inneholder <embed> og ingen eksplisitt fysisk target-identitet kan skille dem'
      };
    }
    return {
      ok:false, token:base.token, frame:null, candidates:base.candidates, reason:'verified-embed-not-ready',
      matchCount:base.matches.length, candidateCount:base.candidates.length, verification, verifiedCount:0,
      error:'Ingen token-matchende Chromium PDF-frame inneholder <embed> ennå'
    };
  }


  async function executeExactVerified(pdfTarget, token, code, userGesture = true) {
    const resolved = await resolveExactVerified(pdfTarget, token);
    if (!resolved?.ok || !resolved.frame) {
      return {
        ok:false, token:resolved?.token || String(token || '').trim() || null,
        frame:null, result:null, reason:resolved?.reason || 'resolution-failed',
        matchCount:Number(resolved?.matchCount || 0), candidateCount:Number(resolved?.candidateCount || 0),
        verifiedCount:Number(resolved?.verifiedCount || 0), verification:Array.isArray(resolved?.verification) ? resolved.verification : [],
        error:resolved?.error || 'Eksakt verifisert Chromium PDF-wrapper frame ble ikke funnet'
      };
    }
    if (typeof code !== 'string' || !code.trim()) {
      return {
        ok:false, token:resolved.token, frame:resolved.frame, result:null, reason:'missing-script',
        matchCount:resolved.matchCount, candidateCount:resolved.candidateCount,
        verifiedCount:Number(resolved.verifiedCount || 0), verification:Array.isArray(resolved.verification) ? resolved.verification : [],
        error:'Wrapper-operasjon mangler JavaScript-kode'
      };
    }
    try {
      const result = await resolved.frame.executeJavaScript(code, !!userGesture);
      return {
        ok:true, token:resolved.token, frame:resolved.frame, result,
        reason:resolved.reason, matchCount:resolved.matchCount, candidateCount:resolved.candidateCount,
        verifiedCount:Number(resolved.verifiedCount || 0), verification:Array.isArray(resolved.verification) ? resolved.verification : [], error:null
      };
    } catch (error) {
      return {
        ok:false, token:resolved.token, frame:resolved.frame, result:null, reason:'verified-wrapper-execution-failed',
        matchCount:resolved.matchCount, candidateCount:resolved.candidateCount,
        verifiedCount:Number(resolved.verifiedCount || 0), verification:Array.isArray(resolved.verification) ? resolved.verification : [],
        error:error instanceof Error ? error.message : String(error)
      };
    }
  }

  return Object.freeze({
    contractVersion: PDF_WRAPPER_FRAME_CONTRACT_VERSION,
    resolveExact,
    resolveExactVerified,
    executeExactVerified
  });
}

// PDFium Gate Platform Contract — exact embedded PDF target identity.
// Supported runtime: Obsidian 1.13.7 + Electron 43 + embedded PDF frame.
const EMBEDDED_PDF_TARGET_CONTRACT_VERSION = '0.5';

function createEmbeddedPdfTargetAdapter({
  webContents,
  listFrameSubtree,
  pdfTokenFromWrapperFrameUrl,
  createEmbeddedPdfTarget,
  onResolved = null
}) {
  if (!webContents || typeof webContents.getAllWebContents !== 'function') throw new Error('webContents.getAllWebContents er ikke tilgjengelig');
  if (typeof listFrameSubtree !== 'function') throw new Error('listFrameSubtree må være en funksjon');
  if (typeof pdfTokenFromWrapperFrameUrl !== 'function') throw new Error('pdfTokenFromWrapperFrameUrl må være en funksjon');
  if (typeof createEmbeddedPdfTarget !== 'function') throw new Error('createEmbeddedPdfTarget må være en funksjon');

  function emit(result) { try { onResolved?.(result); } catch (_) {} return result; }

  function physicalFrameKey(frame) {
    try {
      const processId=Number(frame?.processId), routingId=Number(frame?.routingId);
      return Number.isFinite(processId)&&Number.isFinite(routingId)?`${processId}:${routingId}`:null;
    } catch (_) { return null; }
  }

  function ownerKey(ownerWc) {
    try { const id=Number(ownerWc?.id); return Number.isFinite(id)?String(id):null; }
    catch (_) { return null; }
  }

  function focusedWrapperForToken(frame, token) {
    let current=frame||null;
    for(let depth=0;current&&depth<12;depth+=1){
      let url=''; try{url=String(current?.url||'');}catch(_){}
      if(pdfTokenFromWrapperFrameUrl(url)===token) return current;
      try{current=current.parent||null;}catch(_){current=null;}
    }
    return null;
  }

  function resolveExact(token) {
    const safeToken=String(token||'').trim();
    if(!safeToken) return emit({ok:false,token:null,target:null,reason:'missing-token',matchCount:0,candidateCount:0,error:'PDF-token mangler'});
    let all=[];
    try{all=webContents.getAllWebContents()||[];}
    catch(error){return emit({ok:false,token:safeToken,target:null,reason:'enumeration-failed',matchCount:0,candidateCount:0,error:error instanceof Error?error.message:String(error)});}

    // Electron may expose multiple JS wrapper objects and stale/new frames for
    // the same logical token. Collapse candidates by physical owner/frame ids;
    // JavaScript object identity is never a physical identity contract.
    const byPhysical=new Map();
    for(const ownerWc of all){
      let frames=[]; try{frames=listFrameSubtree(ownerWc)||[];}catch(_){}
      for(const frame of frames){
        let url=''; try{url=String(frame?.url||'');}catch(_){}
        if(pdfTokenFromWrapperFrameUrl(url)!==safeToken) continue;
        const oKey=ownerKey(ownerWc), fKey=physicalFrameKey(frame);
        const key=oKey&&fKey?`${oKey}:${fKey}`:null;
        if(key&&!byPhysical.has(key)) byPhysical.set(key,{ownerWc,frame});
      }
    }
    const matches=[...byPhysical.values()];
    if(matches.length===1){
      const hit=matches[0];
      const target=createEmbeddedPdfTarget(hit.ownerWc,safeToken,hit.frame);
      if(!target) return emit({ok:false,token:safeToken,target:null,reason:'target-create-failed',matchCount:1,candidateCount:1,error:'Kunne ikke opprette embedded PDF-target'});
      return emit({ok:true,token:safeToken,target,ownerWc:hit.ownerWc,wrapperFrame:hit.frame,reason:'exact-wrapper-frame-token',matchCount:1,candidateCount:1,error:null});
    }

    // Synchronous keyboard routing is the one contract where physical focus is
    // authoritative. Walk the actual focusedFrame parent chain to the wrapper
    // carrying this token and use that physical frame directly. This survives
    // stale duplicate wrappers and different JS objects for the same owner.
    let owner=null,frame=null,focusedWrapper=null;
    try{owner=webContents.getFocusedWebContents?.()||null;frame=owner?.focusedFrame||null;focusedWrapper=focusedWrapperForToken(frame,safeToken);}catch(_){}
    if(owner&&focusedWrapper){
      const target=createEmbeddedPdfTarget(owner,safeToken,focusedWrapper);
      if(target) return emit({ok:true,token:safeToken,target,ownerWc:owner,wrapperFrame:focusedWrapper,reason:'focused-wrapper-physical-disambiguation',matchCount:matches.length,candidateCount:matches.length,error:null});
    }

    if(matches.length===0) return emit({ok:false,token:safeToken,target:null,reason:'not-found',matchCount:0,candidateCount:0,error:'Eksakt embedded PDF-wrapper ble ikke funnet'});
    return emit({ok:false,token:safeToken,target:null,reason:'ambiguous-embedded',matchCount:matches.length,candidateCount:matches.length,error:'Flere embedded PDF-wrappers matcher samme token og fysisk fokus kan ikke bevise én eksakt wrapper'});
  }

  return Object.freeze({contractVersion:EMBEDDED_PDF_TARGET_CONTRACT_VERSION,resolveExact});
}

const ACTIVE_PDF_TARGET_CONTRACT_VERSION = '0.3';

function createActivePdfTargetAdapter({resolveExactPdf,getFocusedWebContents,focusMatchesToken,focusedPdfToken}) {
  let publication={known:false,token:null,filePath:null,source:null,at:null};
  const getPublication=()=>({...publication});
  function publish(payload){const o=payload&&typeof payload==='object'?payload:{};publication={known:true,token:String(o.token||'').trim()||null,filePath:String(o.filePath||'').trim()||null,source:String(o.source||'obsidian-active-leaf'),at:String(o.at||new Date().toISOString())};return getPublication();}
  function reset(){publication={known:false,token:null,filePath:null,source:null,at:null};}
  function resolve(){
    if(publication.known){
      let focused=null;try{focused=getFocusedWebContents();}catch(_){}
      if(!publication.token) return {ok:false,target:null,token:null,source:'obsidian-active-leaf',reason:'active-leaf-not-pdf',publication:getPublication(),error:'Aktiv Obsidian-leaf er ikke en PDFium PDF'};
      if(!focused||!focusMatchesToken(focused,publication.token)) return {ok:false,target:null,token:publication.token,source:'obsidian-active-leaf',reason:'electron-focus-not-active-pdf-frame',publication:getPublication(),focusedPdfToken:focused?focusedPdfToken(focused):null,error:'Electron-fokus er ikke i aktiv PDF/frame; keyboard-routing skal ikke kapre tastaturet'};
      const exact=resolveExactPdf(publication.token);
      if(exact?.ok&&exact.target) return {ok:true,target:exact.target,token:publication.token,source:'obsidian-active-leaf',reason:exact.reason||'exact-token',publication:getPublication(),error:null};
      return {ok:false,target:null,token:publication.token,source:'obsidian-active-leaf',reason:exact?.reason||'active-token-not-resolved',publication:getPublication(),error:exact?.error||'Aktiv PDF-token kunne ikke resolves eksakt'};
    }
    let focused=null;try{focused=getFocusedWebContents();}catch(_){}
    const token=focused?focusedPdfToken(focused):null;
    if(focused&&token){const exact=resolveExactPdf(token);if(exact?.ok&&exact.target)return {ok:true,target:exact.target,token,source:'electron-focused-frame',reason:exact.reason||'focused-frame-before-publication',publication:getPublication(),error:null};}
    return {ok:false,target:null,token:null,source:'electron-focused-frame',reason:'no-pdf-target',publication:getPublication(),error:'Ingen aktiv embedded PDF kunne bestemmes'};
  }
  return Object.freeze({contractVersion:ACTIVE_PDF_TARGET_CONTRACT_VERSION,publish,reset,getPublication,resolve});
}

// PDFium Gate Platform Contract — exact PDF iframe identity inside an Obsidian window.
// Source-of-truth for the adapter bundled into release main-bridge.js.
const PDF_IFRAME_CONTRACT_VERSION = '0.1';

function pdfTokenFromIframeSrc(src) {
  const text = String(src || '');
  const match = text.match(/\/pdf\/([^/?#]+)\.pdf(?:[?#].*)?$/i);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); }
  catch (_) { return match[1]; }
}

function resolveExactPdfIframeCandidates(candidates, token) {
  const safeToken = String(token || '').trim();
  const list = Array.isArray(candidates) ? candidates : [];
  if (!safeToken) {
    return {
      ok:false, token:null, match:null, candidates:list,
      reason:'missing-token', matchCount:0, candidateCount:list.length,
      error:'PDF-token mangler'
    };
  }

  const matches = list.filter(candidate => pdfTokenFromIframeSrc(candidate?.src) === safeToken);
  if (matches.length === 1) {
    return {
      ok:true, token:safeToken, match:matches[0], candidates:list,
      reason:'exact-src-token', matchCount:1, candidateCount:list.length,
      error:null
    };
  }
  if (matches.length === 0) {
    return {
      ok:false, token:safeToken, match:null, candidates:list,
      reason:'not-found', matchCount:0, candidateCount:list.length,
      error:'Eksakt PDFium iframe ble ikke funnet'
    };
  }
  return {
    ok:false, token:safeToken, match:null, candidates:list,
    reason:'ambiguous', matchCount:matches.length, candidateCount:list.length,
    error:'Flere PDFium iframes matcher samme token'
  };
}

function buildExactPdfIframeRectScript(token) {
  const safeToken = String(token || '').trim();
  const tokenParserSource = pdfTokenFromIframeSrc.toString();
  const resolverSource = resolveExactPdfIframeCandidates.toString();
  return `(() => {
    try {
      const pdfTokenFromIframeSrc = ${tokenParserSource};
      const resolveExactPdfIframeCandidates = ${resolverSource};
      const token = ${JSON.stringify(safeToken)};
      const frames = Array.from(document.querySelectorAll('iframe.pdfium-gate-frame'));
      const candidates = frames.map((frame, index) => {
        const r = frame.getBoundingClientRect();
        return {
          index,
          src:String(frame.src || ''),
          rect:{left:Number(r.left||0), top:Number(r.top||0), width:Number(r.width||0), height:Number(r.height||0)}
        };
      });
      return resolveExactPdfIframeCandidates(candidates, token);
    } catch (e) {
      return {
        ok:false, token:${JSON.stringify(safeToken)}, match:null, candidates:[],
        reason:'script-failed', matchCount:0, candidateCount:0,
        error:String(e && e.message || e)
      };
    }
  })()`;
}

function createPdfIframeAdapter() {
  async function resolveExact(ownerWc, token) {
    const safeToken = String(token || '').trim();
    if (!safeToken) {
      return {
        ok:false, token:null, match:null, candidates:[],
        reason:'missing-token', matchCount:0, candidateCount:0,
        error:'PDF-token mangler'
      };
    }
    const target = ownerWc?.mainFrame && typeof ownerWc.mainFrame.executeJavaScript === 'function'
      ? ownerWc.mainFrame
      : ownerWc;
    if (!target || typeof target.executeJavaScript !== 'function') {
      return {
        ok:false, token:safeToken, match:null, candidates:[],
        reason:'execute-unavailable', matchCount:0, candidateCount:0,
        error:'Obsidian mainFrame executeJavaScript ikke tilgjengelig'
      };
    }
    try {
      const result = await target.executeJavaScript(buildExactPdfIframeRectScript(safeToken), true);
      return result && typeof result === 'object'
        ? result
        : {
            ok:false, token:safeToken, match:null, candidates:[],
            reason:'invalid-result', matchCount:0, candidateCount:0,
            error:'ugyldig iframe-rect resultat'
          };
    } catch (error) {
      return {
        ok:false, token:safeToken, match:null, candidates:[],
        reason:'execute-failed', matchCount:0, candidateCount:0,
        error:error instanceof Error ? error.message : String(error)
      };
    }
  }

  return Object.freeze({
    contractVersion: PDF_IFRAME_CONTRACT_VERSION,
    resolveExact
  });
}

// PDFium Gate Platform Contract — exact BrowserWindow identity for an Obsidian WebContents.
// Source-of-truth for the adapter bundled into release main-bridge.js.
const BROWSER_WINDOW_CONTRACT_VERSION = '0.1';

function createBrowserWindowAdapter({ BrowserWindow }) {
  if (!BrowserWindow || typeof BrowserWindow.fromWebContents !== 'function') {
    throw new Error('BrowserWindow.fromWebContents er ikke tilgjengelig');
  }

  function resolveExact(ownerWc) {
    if (!ownerWc) {
      return {
        ok:false, webContents:null, browserWindow:null, reason:'missing-webcontents',
        error:'Obsidian owner WebContents mangler'
      };
    }
    try {
      const browserWindow = BrowserWindow.fromWebContents(ownerWc) || null;
      if (!browserWindow) {
        return {
          ok:false, webContents:ownerWc, browserWindow:null, reason:'not-found',
          error:'Fant ikke BrowserWindow som eksakt eier angitt Obsidian WebContents'
        };
      }
      return {
        ok:true, webContents:ownerWc, browserWindow, reason:'from-webcontents', error:null
      };
    } catch (error) {
      return {
        ok:false, webContents:ownerWc, browserWindow:null, reason:'lookup-failed',
        error:error instanceof Error ? error.message : String(error)
      };
    }
  }

  function getContentBoundsExact(ownerWc) {
    const resolved = resolveExact(ownerWc);
    if (!resolved.ok) return { ...resolved, bounds:null };
    if (typeof resolved.browserWindow?.getContentBounds !== 'function') {
      return {
        ...resolved, ok:false, bounds:null, reason:'bounds-unavailable',
        error:'Eksakt BrowserWindow mangler getContentBounds()'
      };
    }
    try {
      const raw = resolved.browserWindow.getContentBounds();
      const bounds = raw ? {
        x:Number(raw.x), y:Number(raw.y), width:Number(raw.width), height:Number(raw.height)
      } : null;
      if (!bounds || ![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)) {
        return {
          ...resolved, ok:false, bounds:null, reason:'invalid-bounds',
          error:'Eksakt BrowserWindow returnerte ugyldige content bounds'
        };
      }
      return { ...resolved, bounds };
    } catch (error) {
      return {
        ...resolved, ok:false, bounds:null, reason:'bounds-failed',
        error:error instanceof Error ? error.message : String(error)
      };
    }
  }

  return Object.freeze({
    contractVersion: BROWSER_WINDOW_CONTRACT_VERSION,
    resolveExact,
    getContentBoundsExact
  });
}

// PDFium Gate Platform Contract — OS cursor position in screen coordinates.
// Source-of-truth for the adapter bundled into release main-bridge.js.
const SCREEN_POINT_CONTRACT_VERSION = '0.1';

function createScreenPointAdapter({ screen }) {
  if (!screen || typeof screen.getCursorScreenPoint !== 'function') {
    throw new Error('screen.getCursorScreenPoint er ikke tilgjengelig');
  }

  function getCursorScreenPoint() {
    try {
      const raw = screen.getCursorScreenPoint();
      const point = raw ? { x:Number(raw.x), y:Number(raw.y) } : null;
      if (!point || ![point.x, point.y].every(Number.isFinite)) {
        return {
          ok:false, point:null, reason:'invalid-point',
          error:'Electron screen returnerte ugyldig musepekerposisjon'
        };
      }
      return { ok:true, point, reason:'electron-screen', error:null };
    } catch (error) {
      return {
        ok:false, point:null, reason:'read-failed',
        error:error instanceof Error ? error.message : String(error)
      };
    }
  }

  return Object.freeze({
    contractVersion: SCREEN_POINT_CONTRACT_VERSION,
    getCursorScreenPoint
  });
}

const RENDERER_EVENT_DISPATCH_CONTRACT_VERSION='0.1';

function createRendererEventDispatchAdapter({validateDetail=null}={}) {
  async function dispatchExact(ownerWc,eventName,detail) {
    if(!ownerWc) return {ok:false,dispatched:false,reason:'missing-owner',error:'Eksakt Obsidian owner WebContents mangler'};
    if(typeof validateDetail==='function') {
      const checked=validateDetail(eventName,detail);
      if(!checked?.ok) return {ok:false,dispatched:false,reason:'invalid-payload',error:checked?.error||'Renderer-event payload er ugyldig'};
    }
    const target=ownerWc?.mainFrame&&typeof ownerWc.mainFrame.executeJavaScript==='function'
      ? ownerWc.mainFrame
      : (typeof ownerWc?.executeJavaScript==='function' ? ownerWc : null);
    if(!target) return {ok:false,dispatched:false,reason:'execute-unavailable',error:'Eksakt Obsidian owner mangler executeJavaScript()'};
    let serialized;
    try { serialized=JSON.stringify(detail&&typeof detail==='object'?detail:{}); }
    catch(error) { return {ok:false,dispatched:false,reason:'serialize-failed',error:error instanceof Error?error.message:String(error)}; }
    const serializedName=JSON.stringify(String(eventName||''));
    try {
      const executeResult=await target.executeJavaScript(`(() => { try { const detail=${serialized}; window.dispatchEvent(new CustomEvent(${serializedName},{detail})); return {ok:true}; } catch(e){return {ok:false,error:String(e&&e.message||e)};} })()`,true);
      if(!executeResult?.ok) return {ok:false,dispatched:false,reason:'dispatch-failed',executeResult:executeResult||null,error:executeResult?.error||'CustomEvent ble ikke dispatch-et'};
      return {ok:true,dispatched:true,reason:'exact-owner-main-frame',executeResult,error:null};
    } catch(error) {
      return {ok:false,dispatched:false,reason:'execute-failed',executeResult:null,error:error instanceof Error?error.message:String(error)};
    }
  }
  return Object.freeze({contractVersion:RENDERER_EVENT_DISPATCH_CONTRACT_VERSION,dispatchExact});
}

// PDFium Gate Platform Contract — dispatch an Obsidian command event into the
// exact already-resolved owner WebContents. No focused-window/WebContents
// fallback is permitted. Transport is delegated to the canonical renderer
// event dispatcher shared by every Main Bridge -> renderer production event.
const OBSIDIAN_COMMAND_DISPATCH_CONTRACT_VERSION = '0.2';

function createObsidianCommandDispatchAdapter({rendererEventDispatchAdapter=null}={}) {
  async function dispatchExact(ownerWc, detail) {
    if(!rendererEventDispatchAdapter || typeof rendererEventDispatchAdapter.dispatchExact!=='function') {
      return {ok:false,dispatched:false,reason:'renderer-event-dispatch-unavailable',executeResult:null,error:'Canonical renderer-event dispatcher mangler'};
    }
    const result=await rendererEventDispatchAdapter.dispatchExact(ownerWc,RENDERER_BRIDGE_EVENTS.OBSIDIAN_COMMAND,detail&&typeof detail==='object'?detail:{});
    return {...result,executeResult:result?.executeResult||null};
  }
  return Object.freeze({contractVersion:OBSIDIAN_COMMAND_DISPATCH_CONTRACT_VERSION,dispatchExact});
}

// END GENERATED MAIN-BRIDGE PLATFORM CONTRACTS
// Main Bridge feature contracts: implementations depend on root-bound operation ports,
// not on peer feature implementations. Flat state mutation retains a single explicit owner.
const MAIN_BRIDGE_FEATURE_CONTRACTS = Object.freeze({
  "kernel": {
    "file": "01-kernel.js",
    "className": "MainBridgeKernelFeature",
    "stateFields": [
      "lastEmbeddedPdfTargetResolution"
    ],
    "ports": [
      "isEmbeddedPdfTarget",
      "safeFrameUrl",
      "sameWebContents",
      "describeFrame",
      "pdfTokenFromAnyFrame",
      "focusedPdfTokenForWebContents",
      "listFrameSubtree",
      "safeDescribe",
      "setEmbeddedPdfTargetResolution",
      "resolveEmbeddedPdfTargetExact"
    ]
  },
  "identityLocator": {
    "file": "02-identity-locator.js",
    "className": "MainBridgeIdentityLocatorFeature",
    "stateFields": [
      "activePdfIdentity",
      "activePdfIdentitySeq",
      "lastReservedShortcutTarget"
    ],
    "ports": [
      "ensurePdfRuntime",
      "clearKeyboardSelection",
      "safeDescribe",
      "describeFrame",
      "resolveEmbeddedPdfTargetExact",
      "listFrameSubtree",
      "safeFrameUrl",
      "createEmbeddedPdfTarget",
      "setEmbeddedPdfTargetResolution",
      "resolveLocatorEmbeddedPdfTargetExact"
    ]
  },
  "contextMenu": {
    "file": "03-context-menu.js",
    "className": "MainBridgeContextMenuFeature",
    "stateFields": [
      "contextEventSeq",
      "contextListenerCount",
      "escapeDismissSeq",
      "escapeRegistered",
      "filterWebContentsCount",
      "filteredListenerCount",
      "installed",
      "lastContextEvent",
      "lastEscapeDismiss",
      "lastFilterScan",
      "lastMenuShow",
      "lastSuppressedListenerCall",
      "menuShowSeq",
      "rendererMenuOpen",
      "suppressedListenerCallCount"
    ],
    "ports": [
      "safeDescribe",
      "clearKeyboardSelection",
      "unregisterEscapeShortcut",
      "isEmbeddedPdfTarget",
      "resolveReservedShortcutPdfTarget",
      "handleEscapeDismiss",
      "registerEscapeShortcut",
      "syncEscapeShortcut",
      "isPdfContext",
      "filterExistingContextListeners",
      "shouldSuppressOtherContextListener",
      "extractPdfToken",
      "capturePdfIframeRect",
      "findEmbeddedPdfTargetExact",
      "capturePdfViewerPoint",
      "keyboardSelectionAtViewerPoint",
      "capturePdfMouseGestureHint",
      "captureContextViewerPoint",
      "attachContextListenerWatcher",
      "publishContextSelection",
      "syncContextListenerCount"
    ]
  },
  "selectionCapture": {
    "file": "04-selection-capture.js",
    "className": "MainBridgeSelectionCaptureFeature",
    "stateFields": [
      "includeHeaderFooterText",
      "lastObsidianShortcutRoute",
      "obsidianShortcutRouteSeq"
    ],
    "ports": [
      "pdfTokenFromTarget",
      "capturePdfViewerPoint",
      "capturePdfWrapperMouseGestureHint",
      "isEmbeddedPdfTarget",
      "safeDescribe",
      "resolveEmbeddedPdfOwner",
      "capturePdfIframeRect",
      "findEmbeddedPdfTargetExact"
    ]
  },
  "selectionOperations": {
    "file": "05-selection-operations.js",
    "className": "MainBridgeSelectionOperationsFeature",
    "stateFields": [
      "keyboardAutoScrollSeq",
      "keyboardCopySeq",
      "keyboardSelection",
      "keyboardSelectionClearSeq",
      "keyboardSelectionResultSeq",
      "keyboardSelectionSetSeq",
      "keyboardSelectionTriggerSeq",
      "lastKeyboardAutoScroll",
      "lastKeyboardCopy",
      "lastKeyboardSelectionClear",
      "lastKeyboardSelectionResult",
      "lastKeyboardSelectionSet",
      "lastKeyboardSelectionTrigger",
      "lastLinkLocator",
      "lastNativeMouseCopy",
      "lastNativeSelectionClear",
      "linkLocatorSeq",
      "nativeMouseCopySeq",
      "nativeSelectionClearSeq"
    ],
    "ports": [
      "pdfTokenFromTarget",
      "isEmbeddedPdfTarget",
      "resolveEmbeddedPdfOwner",
      "safeDescribe",
      "capturePdfViewerKeyboardState",
      "capturePdfMouseGestureHint",
      "captureSelectedTextFromPdf",
      "recordKeyboardCopyResult",
      "pdfPagePointToRemotePoint",
      "findEmbeddedPdfTargetExact",
      "ensureKeyboardSelectionFocusVisible",
      "syncEscapeShortcut",
      "removeKeyboardOverlay",
      "resolveLocatorEmbeddedPdfTargetExact",
      "capturePdfIframeRect",
      "describeFrame",
      "clearKeyboardSelection",
      "clearStaleKeyboardSelectionBeforeRoute",
      "capturePdfKeyboardCursorHint",
      "clearNativePdfSelection"
    ]
  },
  "inputRouter": {
    "file": "06-input-router.js",
    "className": "MainBridgeInputRouterFeature",
    "stateFields": [
      "embeddedKeyboardInputListenerCount",
      "embeddedKeyboardInputSeq",
      "embeddedKeyboardRoutingMode",
      "lastEmbeddedKeyboardInput",
      "rendererMenuOpen"
    ],
    "ports": [
      "normalizeBeforeInputKey",
      "categorySlotFromBeforeInput",
      "pdfTokenFromTarget",
      "routeKeyboardSelectionCopyFromPdf",
      "routeNativeMouseCopyFromPdf",
      "recordKeyboardCopyResult",
      "focusedPdfTokenForWebContents",
      "resolveEmbeddedPdfTargetExact",
      "isEmbeddedPdfTarget",
      "sameWebContents",
      "keyboardRouteAllowedOnce",
      "setEmbeddedKeyboardRoutingMode",
      "handleEscapeDismiss",
      "routeEmbeddedCopy",
      "captureShortcut",
      "routeObsidianCommandFromPdf",
      "routePdfKeyboardSelectionFromPdf",
      "resolveEmbeddedInputPdfTarget",
      "matchEmbeddedKeyboardAction",
      "dispatchEmbeddedKeyboardAction",
      "describeFrame"
    ]
  },
  "wrapperLifecycle": {
    "file": "07-wrapper-lifecycle.js",
    "className": "MainBridgeWrapperLifecycleFeature",
    "stateFields": [
      "installed",
      "lastKeyboardSelectionMouseClearProbe",
      "lastPdfMouseActivation",
      "lastPdfRuntimeFrameLifecycle",
      "lastPdfRuntimeRegistration",
      "lastWrapperInstrumentationState",
      "pdfMouseActivationSeq",
      "pdfRuntimeFrameLifecycleListenerCount",
      "pdfRuntimeFrameLifecycleSeq",
      "pdfRuntimeRegisteredWrapperCount",
      "pdfRuntimeRegistrationCount",
      "pdfRuntimeRegistrationSeq"
    ],
    "ports": [
      "isEmbeddedPdfTarget",
      "safeDescribe",
      "pdfTokenFromTarget",
      "clearKeyboardSelection",
      "safeFrameUrl",
      "physicalWrapperKey",
      "describeFrame",
      "attachContextListener",
      "attachEmbeddedKeyboardInputListener",
      "wrapperInstrumentationInstallScript",
      "startWrapperInstrumentationPoll",
      "listFrameSubtree",
      "recordPdfFrameLifecycle",
      "ensurePhysicalPdfWrapperRuntime",
      "findFrameByPhysicalId",
      "ensurePdfRuntime",
      "attachPdfFrameLifecycle",
      "detachContextListenerWatchers",
      "syncContextListenerCount",
      "restoreFilteredListeners"
    ]
  },
  "lifecycle": {
    "file": "08-lifecycle.js",
    "className": "MainBridgeLifecycleFeature",
    "stateFields": [
      "installError",
      "installed",
      "lastShortcutAction",
      "shortcutSeq",
      "shortcutTriggerSeq"
    ],
    "ports": [
      "pdfTokenFromTarget",
      "resolveReservedShortcutPdfTarget",
      "safeDescribe",
      "capturePdfNavigationState",
      "finishShortcut",
      "captureSelectedTextFromPdf",
      "attachContextListener",
      "attachEmbeddedKeyboardInputListener",
      "attachPdfFrameLifecycle",
      "detachPdfFrameLifecycleListeners",
      "unregisterEscapeShortcut",
      "clearRendererMenuOpenState",
      "detachOwnerLifecycle",
      "detachContextListeners",
      "detachEmbeddedKeyboardInputListeners",
      "clearKeyboardSelection",
      "stopWrapperRuntimeInfrastructure",
      "getState",
      "uninstall",
      "freshState",
      "setEmbeddedKeyboardRoutingMode",
      "attachOwnerRuntime",
      "reconcileExistingPdfRuntime",
      "listFrameSubtree",
      "safeFrameUrl",
      "focusedPdfTokenForWebContents",
      "describeFrame"
    ]
  }
});

const MAIN_BRIDGE_STATE_FIELD_OWNERS = Object.freeze({
  "activePdfIdentity": "identityLocator",
  "activePdfIdentitySeq": "identityLocator",
  "contextEventSeq": "contextMenu",
  "contextListenerCount": "contextMenu",
  "embeddedKeyboardInputListenerCount": "inputRouter",
  "embeddedKeyboardInputSeq": "inputRouter",
  "embeddedKeyboardRoutingMode": "inputRouter",
  "escapeDismissSeq": "contextMenu",
  "escapeRegistered": "contextMenu",
  "filterWebContentsCount": "contextMenu",
  "filteredListenerCount": "contextMenu",
  "includeHeaderFooterText": "selectionCapture",
  "installError": "lifecycle",
  "installed": "lifecycle",
  "keyboardAutoScrollSeq": "selectionOperations",
  "keyboardCopySeq": "selectionOperations",
  "keyboardSelection": "selectionOperations",
  "keyboardSelectionClearSeq": "selectionOperations",
  "keyboardSelectionResultSeq": "selectionOperations",
  "keyboardSelectionSetSeq": "selectionOperations",
  "keyboardSelectionTriggerSeq": "selectionOperations",
  "lastContextEvent": "contextMenu",
  "lastEmbeddedKeyboardInput": "inputRouter",
  "lastEmbeddedPdfTargetResolution": "kernel",
  "lastEscapeDismiss": "contextMenu",
  "lastFilterScan": "contextMenu",
  "lastKeyboardAutoScroll": "selectionOperations",
  "lastKeyboardCopy": "selectionOperations",
  "lastKeyboardSelectionClear": "selectionOperations",
  "lastKeyboardSelectionMouseClearProbe": "wrapperLifecycle",
  "lastKeyboardSelectionResult": "selectionOperations",
  "lastKeyboardSelectionSet": "selectionOperations",
  "lastKeyboardSelectionTrigger": "selectionOperations",
  "lastLinkLocator": "selectionOperations",
  "lastMenuShow": "contextMenu",
  "lastNativeMouseCopy": "selectionOperations",
  "lastNativeSelectionClear": "selectionOperations",
  "lastObsidianShortcutRoute": "selectionCapture",
  "lastPdfMouseActivation": "wrapperLifecycle",
  "lastPdfRuntimeFrameLifecycle": "wrapperLifecycle",
  "lastPdfRuntimeRegistration": "wrapperLifecycle",
  "lastReservedShortcutTarget": "identityLocator",
  "lastShortcutAction": "lifecycle",
  "lastSuppressedListenerCall": "contextMenu",
  "lastWrapperInstrumentationState": "wrapperLifecycle",
  "linkLocatorSeq": "selectionOperations",
  "menuShowSeq": "contextMenu",
  "nativeMouseCopySeq": "selectionOperations",
  "nativeSelectionClearSeq": "selectionOperations",
  "obsidianShortcutRouteSeq": "selectionCapture",
  "pdfMouseActivationSeq": "wrapperLifecycle",
  "pdfRuntimeFrameLifecycleListenerCount": "wrapperLifecycle",
  "pdfRuntimeFrameLifecycleSeq": "wrapperLifecycle",
  "pdfRuntimeRegisteredWrapperCount": "wrapperLifecycle",
  "pdfRuntimeRegistrationCount": "wrapperLifecycle",
  "pdfRuntimeRegistrationSeq": "wrapperLifecycle",
  "rendererMenuOpen": "contextMenu",
  "shortcutSeq": "lifecycle",
  "shortcutTriggerSeq": "lifecycle",
  "suppressedListenerCallCount": "contextMenu"
});

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

class MainBridgeIdentityLocatorFeature {
  setActivePdfIdentity(payload) {
      const __bridgeRuntime = this;
      const published = __bridgeRuntime.runtime.targets.activePdfTargetAdapter.publish(payload);
      __bridgeRuntime.state.activePdfIdentitySeq += 1;
      __bridgeRuntime.state.activePdfIdentity = published;
      if (published.token) {
          // Active identity and runtime registration are separate contracts. Publication
          // may opportunistically ensure instrumentation, but it never selects a wrapper.
          void __bridgeRuntime.ports.ensurePdfRuntime({ token: published.token, source: 'active-identity-publication' });
      }
      if (__bridgeRuntime.runtime.keyboard.selection && published.token !== __bridgeRuntime.runtime.keyboard.selection.token) {
          void __bridgeRuntime.ports.clearKeyboardSelection('active-pdf-identity-changed');
      }
      return { ok: true, seq: __bridgeRuntime.state.activePdfIdentitySeq, identity: published };
  }

  resolveReservedShortcutPdfTarget() {
      const __bridgeRuntime = this;
      const resolved = __bridgeRuntime.runtime.targets.activePdfTargetAdapter.resolve();
      __bridgeRuntime.state.lastReservedShortcutTarget = {
          at: new Date().toISOString(),
          ok: !!resolved?.ok,
          token: resolved?.token || null,
          source: resolved?.source || null,
          reason: resolved?.reason || null,
          webContents: __bridgeRuntime.ports.safeDescribe(resolved?.target || null, (() => { try {
              return webContents.getFocusedWebContents();
          }
          catch (_) {
              return null;
          } })()),
          focusedFrame: (() => { try {
              return __bridgeRuntime.ports.describeFrame(webContents.getFocusedWebContents()?.focusedFrame || null);
          }
          catch (_) {
              return null;
          } })(),
          error: resolved?.error || null
      };
      return resolved;
  }

  // Locator discovery is not a focus contract. Try canonical token resolution first;
  // when focus is outside the PDF, discover the one <embed>-verified wrapper across
  // owner WebContents and construct the same explicit embedded PDF target from that
  // proven physical identity. Multiple verified owners fail closed.
  async resolveLocatorEmbeddedPdfTargetExact(token) {
      const __bridgeRuntime = this;
      const safeToken = String(token || '').trim();
      if (!safeToken)
          return { ok: false, target: null, reason: 'missing-token', error: 'PDF-token mangler', syncReason: null, ownerCount: 0, verifiedCount: 0, verification: [] };
      const sync = __bridgeRuntime.ports.resolveEmbeddedPdfTargetExact(safeToken);
      if (sync?.target) {
          return { ok: true, target: sync.target, reason: `sync-${sync.reason || 'exact'}`, error: null, syncReason: sync.reason || null, ownerCount: 0, verifiedCount: null, verification: [] };
      }
      let all = [];
      try {
          all = webContents.getAllWebContents() || [];
      }
      catch (error) {
          return { ok: false, target: null, reason: 'enumeration-failed', error: error instanceof Error ? error.message : String(error), syncReason: sync?.reason || null, ownerCount: 0, verifiedCount: 0, verification: [] };
      }
      const verification = [];
      const hits = [];
      let ownerCount = 0;
      for (const ownerWc of all) {
          let hasTokenFrame = false;
          try {
              hasTokenFrame = (__bridgeRuntime.ports.listFrameSubtree(ownerWc) || []).some(frame => pdfTokenFromWrapperFrameUrl(__bridgeRuntime.ports.safeFrameUrl(frame)) === safeToken);
          }
          catch (_) {
              hasTokenFrame = false;
          }
          if (!hasTokenFrame)
              continue;
          ownerCount += 1;
          const resolved = await __bridgeRuntime.pdfWrapperFrameAdapter.resolveExactVerified(ownerWc, safeToken);
          verification.push({
              ownerId: Number(ownerWc?.id),
              ok: !!resolved?.ok,
              reason: resolved?.reason || null,
              error: resolved?.error || null,
              matchCount: Number(resolved?.matchCount || 0),
              verifiedCount: Number(resolved?.verifiedCount || 0),
              selected: resolved?.frame ? __bridgeRuntime.ports.describeFrame(resolved.frame) : null
          });
          if (resolved?.ok && resolved.frame)
              hits.push({ ownerWc, resolved });
      }
      if (hits.length === 1) {
          const hit = hits[0];
          const target = __bridgeRuntime.ports.createEmbeddedPdfTarget(hit.ownerWc, safeToken, hit.resolved.frame);
          if (!target)
              return { ok: false, target: null, reason: 'target-create-failed', error: 'Kunne ikke opprette embedded PDF-target fra verifisert wrapper', syncReason: sync?.reason || null, ownerCount, verifiedCount: 1, verification };
          __bridgeRuntime.ports.setEmbeddedPdfTargetResolution({ at: new Date().toISOString(), token: safeToken, reason: 'locator-verified-embed-wrapper', owner: __bridgeRuntime.ports.safeDescribe(hit.ownerWc, webContents.getFocusedWebContents()), wrapperFrame: __bridgeRuntime.ports.describeFrame(hit.resolved.frame), syncReason: sync?.reason || null });
          return { ok: true, target, reason: 'locator-verified-embed-wrapper', error: null, syncReason: sync?.reason || null, ownerCount, verifiedCount: 1, verification };
      }
      if (hits.length > 1) {
          return { ok: false, target: null, reason: 'locator-verified-embed-ambiguous', error: 'Flere Obsidian WebContents inneholder verifisert Chromium PDF-wrapper for samme token', syncReason: sync?.reason || null, ownerCount, verifiedCount: hits.length, verification };
      }
      return { ok: false, target: null, reason: 'locator-verified-embed-not-ready', error: 'Eksakt Chromium PDF-viewer er ikke klar ennå', syncReason: sync?.reason || null, ownerCount, verifiedCount: 0, verification };
  }

  async focusPdfRuntime(token) {
      const __bridgeRuntime = this;
      const safeToken = String(token || '').trim();
      if (!safeToken) return { ok:false, token:null, reason:'missing-token', error:'PDF-token mangler' };
      const resolved = await __bridgeRuntime.ports.resolveLocatorEmbeddedPdfTargetExact(safeToken);
      if (!resolved?.ok || !resolved.target) {
          return { ok:false, token:safeToken, reason:resolved?.reason || 'target-not-resolved', error:resolved?.error || 'Eksakt PDF-runtime kunne ikke resolves' };
      }
      const focusResult = await __bridgeRuntime.chromiumPdfRuntimeDriver.focusViewerRuntime(resolved.target.runtimeFrame);
      if (!focusResult?.ok) return { ok:false, token:safeToken, reason:'viewer-focus-failed', error:focusResult?.error || 'PDF-viewer kunne ikke få fokus' };
      return { ok:true, token:safeToken, reason:'exact-runtime-focused', targetReason:resolved.reason || null, focus:focusResult };
  }

  async capturePdfIframeRect(ownerWc, token) {
      const __bridgeRuntime = this;
      return __bridgeRuntime.pdfIframeAdapter.resolveExact(ownerWc, token);
  }
}

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

'use strict';

const MAIN_BRIDGE_FEATURE_CLASSES = Object.freeze({
  kernel: MainBridgeKernelFeature,
  identityLocator: MainBridgeIdentityLocatorFeature,
  contextMenu: MainBridgeContextMenuFeature,
  selectionCapture: MainBridgeSelectionCaptureFeature,
  selectionOperations: MainBridgeSelectionOperationsFeature,
  inputRouter: MainBridgeInputRouterFeature,
  wrapperLifecycle: MainBridgeWrapperLifecycleFeature,
  lifecycle: MainBridgeLifecycleFeature
});

function createBoundMainBridgePorts(host) {
  const ports = Object.create(null);
  const owners = Object.create(null);
  for (const [featureId, featureClass] of Object.entries(MAIN_BRIDGE_FEATURE_CLASSES)) {
    for (const name of Object.getOwnPropertyNames(featureClass.prototype)) {
      if (name === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(featureClass.prototype, name);
      if (!descriptor || typeof descriptor.value !== 'function') continue;
      if (ports[name]) throw new Error(`Duplicate Main Bridge port provider ${name}: ${owners[name]} / ${featureId}`);
      ports[name] = descriptor.value.bind(host);
      owners[name] = featureId;
    }
  }
  for (const [featureId, contract] of Object.entries(MAIN_BRIDGE_FEATURE_CONTRACTS)) {
    for (const port of contract.ports || []) {
      if (typeof ports[port] !== 'function') throw new Error(`Unknown Main Bridge port ${featureId} -> ${port}`);
    }
  }
  return Object.freeze(ports);
}

class MainBridgeRuntime {
  constructor() {
    this.ports = createBoundMainBridgePorts(this);

    this.state = this.ports.freshState();
    this.runtime = {
      lifecycle:{webContentsCreatedHandler:null},
      contextMenu:{listeners:new Map(),filteredListeners:new Map(),newListenerWatchers:new Map()},
      shortcuts:{triggerCounter:0},
      wrapperRuntime:{pollers:new Map(),frameLifecycleListeners:new Map(),registrationInFlight:new Map()},
      keyboard:{
        inputListeners:new Map(),
        syntheticCtrlCUntil:0,
        routeDedupe:new Map(),
        selection:null,
        selectionRouteChain:Promise.resolve(),
        nativeMouseCopyRouteInFlight:false,
        nativeClearInputProbe:null,
        selectionMouseClearInFlight:false
      },
      targets:{activePdfTargetAdapter:null,embeddedPdfTargetCache:new Map()}
    };

    this.chromiumPdfRuntimeDriver = createChromiumPdfRuntimeDriver();
    this.rendererEventDispatchAdapter = createRendererEventDispatchAdapter({validateDetail:validateRendererBridgeEventDetail});

    this.embeddedPdfTargetAdapter = createEmbeddedPdfTargetAdapter({
      webContents,
      listFrameSubtree:this.ports.listFrameSubtree,
      pdfTokenFromWrapperFrameUrl,
      createEmbeddedPdfTarget:this.ports.createEmbeddedPdfTarget,
      onResolved:this.ports.recordEmbeddedPdfTargetResolution
    });
    this.runtime.targets.activePdfTargetAdapter = createActivePdfTargetAdapter({
      resolveExactPdf:this.ports.resolveEmbeddedPdfTargetExact,
      getFocusedWebContents:()=>webContents.getFocusedWebContents(),
      focusMatchesToken:this.ports.webContentsFocusMatchesPdfToken,
      focusedPdfToken:this.ports.focusedPdfTokenForWebContents
    });

    this.pdfIframeAdapter = createPdfIframeAdapter();
    this.pdfWrapperFrameAdapter = createPdfWrapperFrameAdapter({listFrameSubtree:this.ports.listFrameSubtree});
    this.browserWindowAdapter = createBrowserWindowAdapter({BrowserWindow});
    this.screenPointAdapter = createScreenPointAdapter({screen});
    this.obsidianCommandDispatchAdapter = createObsidianCommandDispatchAdapter({rendererEventDispatchAdapter:this.rendererEventDispatchAdapter});
  }
}

const mainBridgeRuntime = new MainBridgeRuntime();

module.exports = {
  install: mainBridgeRuntime.ports.install,
  uninstall: mainBridgeRuntime.ports.uninstall,
  getState: mainBridgeRuntime.ports.getState,
  getPlatformCapabilities: mainBridgeRuntime.ports.getPlatformCapabilities,
  setRendererMenuOpen: mainBridgeRuntime.ports.setRendererMenuOpen,
  setKeyboardSelection: mainBridgeRuntime.ports.setKeyboardSelection,
  clearKeyboardSelection: mainBridgeRuntime.ports.clearKeyboardSelection,
  reportKeyboardSelectionResult: mainBridgeRuntime.ports.reportKeyboardSelectionResult,
  showLinkLocator: mainBridgeRuntime.ports.showLinkLocator,
  setActivePdfIdentity: mainBridgeRuntime.ports.setActivePdfIdentity,
  focusPdfRuntime: mainBridgeRuntime.ports.focusPdfRuntime,
  ensurePdfRuntime: mainBridgeRuntime.ports.ensurePdfRuntime,
  setIncludeHeaderFooterText: mainBridgeRuntime.ports.setIncludeHeaderFooterText
};
