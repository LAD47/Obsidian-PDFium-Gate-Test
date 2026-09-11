'use strict';

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

module.exports={CHROMIUM_PDF_RUNTIME_DRIVER_CONTRACT_VERSION,CHROMIUM_PDF_VIEWER_ORIGIN,createChromiumPdfRuntimeDriver};
