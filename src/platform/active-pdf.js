'use strict';

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
module.exports={ACTIVE_PDF_TARGET_CONTRACT_VERSION,createActivePdfTargetAdapter};
