'use strict';

// PDFium Gate Platform Contract — renderer Obsidian view-registry lifecycle.
// Source-of-truth for the adapter bundled into release main.js.
const OBSIDIAN_VIEW_REGISTRY_CONTRACT_VERSION = '0.1';

function createObsidianViewRegistryAdapter({ viewRegistry, registerPluginExtensions }) {
  const pluginRegister = typeof registerPluginExtensions === 'function' ? registerPluginExtensions : null;

  function normalizeExtension(extension) {
    return String(extension || '').trim().replace(/^\.+/, '');
  }

  function getCurrentType(extension) {
    const ext = normalizeExtension(extension);
    if (!ext) {
      return { ok:false, extension:null, viewType:null, reason:'missing-extension', error:'Filendelse mangler' };
    }
    if (!viewRegistry || typeof viewRegistry.getTypeByExtension !== 'function') {
      return { ok:false, extension:ext, viewType:null, reason:'get-type-unavailable', error:'viewRegistry.getTypeByExtension er ikke tilgjengelig' };
    }
    try {
      return {
        ok:true,
        extension:ext,
        viewType:viewRegistry.getTypeByExtension(ext) || null,
        reason:'view-registry-get-type',
        error:null
      };
    } catch (error) {
      return { ok:false, extension:ext, viewType:null, reason:'get-type-failed', error:error instanceof Error ? error.message : String(error) };
    }
  }

  function takeOverExtension(extension, viewType, fallbackOriginalViewType = null) {
    const ext = normalizeExtension(extension);
    const targetViewType = String(viewType || '').trim();
    const fallback = String(fallbackOriginalViewType || '').trim() || null;
    if (!ext) {
      return { ok:false, extension:null, targetViewType:targetViewType || null, originalViewType:null, reason:'missing-extension', error:'Filendelse mangler' };
    }
    if (!targetViewType) {
      return { ok:false, extension:ext, targetViewType:null, originalViewType:null, reason:'missing-view-type', error:'View type mangler' };
    }
    if (!viewRegistry || typeof viewRegistry.unregisterExtensions !== 'function') {
      return { ok:false, extension:ext, targetViewType, originalViewType:null, reason:'unregister-unavailable', error:'viewRegistry.unregisterExtensions er ikke tilgjengelig' };
    }
    if (!pluginRegister) {
      return { ok:false, extension:ext, targetViewType, originalViewType:null, reason:'plugin-register-unavailable', error:'Plugin.registerExtensions er ikke tilgjengelig' };
    }

    let originalViewType = fallback;
    if (typeof viewRegistry.getTypeByExtension === 'function') {
      try { originalViewType = viewRegistry.getTypeByExtension(ext) || fallback; }
      catch (error) {
        return { ok:false, extension:ext, targetViewType, originalViewType:null, reason:'get-type-failed', error:error instanceof Error ? error.message : String(error) };
      }
    }

    try {
      viewRegistry.unregisterExtensions([ext]);
      pluginRegister([ext], targetViewType);
      return { ok:true, extension:ext, targetViewType, originalViewType, reason:'extension-taken-over', error:null };
    } catch (error) {
      return { ok:false, extension:ext, targetViewType, originalViewType, reason:'takeover-failed', error:error instanceof Error ? error.message : String(error) };
    }
  }

  function restoreExtension(extension, originalViewType) {
    const ext = normalizeExtension(extension);
    const original = String(originalViewType || '').trim() || null;
    if (!ext) {
      return { ok:false, extension:null, originalViewType:original, unregistered:false, restored:false, reason:'missing-extension', error:'Filendelse mangler' };
    }

    let unregistered = false;
    let unregisterError = null;
    if (viewRegistry && typeof viewRegistry.unregisterExtensions === 'function') {
      try {
        viewRegistry.unregisterExtensions([ext]);
        unregistered = true;
      } catch (error) {
        unregisterError = error instanceof Error ? error.message : String(error);
      }
    } else {
      unregisterError = 'viewRegistry.unregisterExtensions er ikke tilgjengelig';
    }

    if (!original) {
      return unregisterError
        ? { ok:false, extension:ext, originalViewType:null, unregistered, restored:false, reason:'unregister-failed', error:unregisterError }
        : { ok:true, extension:ext, originalViewType:null, unregistered, restored:false, reason:'no-original-view-type', error:null };
    }

    try {
      if (viewRegistry && typeof viewRegistry.registerExtensions === 'function') {
        viewRegistry.registerExtensions([ext], original);
      } else if (pluginRegister) {
        pluginRegister([ext], original);
      } else {
        return { ok:false, extension:ext, originalViewType:original, unregistered, restored:false, reason:'restore-register-unavailable', error:'Ingen registerExtensions-API er tilgjengelig' };
      }
      return {
        ok:true,
        extension:ext,
        originalViewType:original,
        unregistered,
        restored:true,
        reason:unregisterError ? 'extension-restored-with-unregister-warning' : 'extension-restored',
        error:null,
        warning:unregisterError
      };
    } catch (error) {
      return { ok:false, extension:ext, originalViewType:original, unregistered, restored:false, reason:'restore-failed', error:error instanceof Error ? error.message : String(error) };
    }
  }

  return Object.freeze({
    contractVersion: OBSIDIAN_VIEW_REGISTRY_CONTRACT_VERSION,
    getCurrentType,
    takeOverExtension,
    restoreExtension
  });
}

module.exports = { OBSIDIAN_VIEW_REGISTRY_CONTRACT_VERSION, createObsidianViewRegistryAdapter };
