'use strict';

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

module.exports={EMBEDDED_PDF_TARGET_CONTRACT_VERSION,createEmbeddedPdfTargetAdapter};
