'use strict';

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

module.exports = {
  BROWSER_WINDOW_CONTRACT_VERSION,
  createBrowserWindowAdapter
};
