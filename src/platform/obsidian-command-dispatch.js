'use strict';

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

module.exports={OBSIDIAN_COMMAND_DISPATCH_CONTRACT_VERSION,createObsidianCommandDispatchAdapter};
