'use strict';

const ELECTRON_FOCUS_DIAGNOSTICS_CONTRACT_VERSION = '0.4';

function createElectronFocusDiagnosticsAdapter({ mainModuleLoader }) {
  let resolved = null;

  function resolveBoundary() {
    if (resolved) return resolved;
    if (!mainModuleLoader || typeof mainModuleLoader.requireInMain !== 'function') {
      resolved = {ok:false,webContents:null,app:null,reason:'main-module-loader-unavailable',error:'Renderer-to-main module loader er ikke tilgjengelig'};
      return resolved;
    }
    const loaded = mainModuleLoader.requireInMain('electron');
    if (!loaded?.ok) {
      resolved = {ok:false,webContents:null,app:null,reason:loaded?.reason || 'main-electron-load-failed',error:loaded?.error || 'Kunne ikke laste Electron main-modulen'};
      return resolved;
    }
    const mainElectron = loaded.module || null;
    const webContents = mainElectron?.webContents || null;
    const app = mainElectron?.app || null;
    if (!webContents || typeof webContents.getAllWebContents !== 'function') {
      resolved = {ok:false,webContents:null,app,reason:'webcontents-unavailable',error:'Electron main-process webContents.getAllWebContents() er ikke tilgjengelig via main-transport'};
      return resolved;
    }
    resolved = {ok:true,webContents,app,reason:'main-transport-electron-module',error:null};
    return resolved;
  }

  function getAllWebContents() {
    const boundary=resolveBoundary();
    if(!boundary.ok) throw new Error(boundary.error || boundary.reason);
    return boundary.webContents.getAllWebContents() || [];
  }

  function getFocusedWebContents() {
    const boundary=resolveBoundary();
    if(!boundary.ok) throw new Error(boundary.error || boundary.reason);
    if(typeof boundary.webContents.getFocusedWebContents!=='function') throw new Error('Electron main-process webContents.getFocusedWebContents() er ikke tilgjengelig via main-transport');
    return boundary.webContents.getFocusedWebContents();
  }

  function describeFocusedFrame(wc) {
    try {
      const frame = wc && wc.focusedFrame;
      if (!frame) return null;
      const main = wc.mainFrame;
      const out = { isMainFrame: !!(main && frame === main) };
      for (const key of ['url', 'name', 'routingId', 'processId']) {
        try {
          const value = frame[key];
          if (value !== undefined && value !== null && value !== '') out[key] = value;
        } catch (_) {}
      }
      return out;
    } catch (error) {
      return { error:error instanceof Error ? error.message : String(error) };
    }
  }

  function onWebContentsCreated(callback) {
    if(typeof callback!=='function') throw new Error('web-contents-created callback mangler');
    const boundary=resolveBoundary();
    if(!boundary.ok) throw new Error(boundary.error || boundary.reason);
    const app=boundary.app;
    if(!app || typeof app.on!=='function') return {ok:true,subscribed:false,dispose:()=>false,reason:'main-app-event-unavailable',error:null};
    const handler=(_event,wc)=>callback(wc);
    app.on('web-contents-created',handler);
    let active=true;
    const dispose=()=>{
      if(!active) return false;
      active=false;
      if(typeof app.removeListener==='function') app.removeListener('web-contents-created',handler);
      else if(typeof app.off==='function') app.off('web-contents-created',handler);
      return true;
    };
    return {ok:true,subscribed:true,dispose,reason:'main-app-web-contents-created',error:null};
  }

  return Object.freeze({contractVersion:ELECTRON_FOCUS_DIAGNOSTICS_CONTRACT_VERSION,resolveBoundary,getAllWebContents,getFocusedWebContents,describeFocusedFrame,onWebContentsCreated});
}

module.exports={ELECTRON_FOCUS_DIAGNOSTICS_CONTRACT_VERSION,createElectronFocusDiagnosticsAdapter};
