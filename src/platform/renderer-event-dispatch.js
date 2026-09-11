'use strict';

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

module.exports={RENDERER_EVENT_DISPATCH_CONTRACT_VERSION,createRendererEventDispatchAdapter};
