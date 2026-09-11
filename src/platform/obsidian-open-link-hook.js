'use strict';

// PDFium Gate Platform Contract — renderer Obsidian openLinkText hook lifecycle.
// The source file is canonical/documentary; release runtime bundles this adapter into main.js.
const OBSIDIAN_OPEN_LINK_HOOK_CONTRACT_VERSION = '0.1';

function createObsidianOpenLinkHookAdapter({ workspace }) {
  let originalOpenLinkText = null;
  let hook = null;
  let installed = false;

  function install(intercept) {
    if (!workspace || typeof workspace.openLinkText !== 'function') {
      return {
        ok:false, installed:false, reason:'open-link-unavailable',
        error:'workspace.openLinkText er ikke tilgjengelig'
      };
    }
    if (typeof intercept !== 'function') {
      return {
        ok:false, installed:false, reason:'invalid-interceptor',
        error:'openLinkText interceptor må være en funksjon'
      };
    }
    if (installed) {
      return {
        ok:false, installed:true, reason:'already-installed',
        error:'openLinkText hook er allerede installert'
      };
    }

    originalOpenLinkText = workspace.openLinkText;
    hook = async function(linktext, sourcePath, newLeaf, openViewState) {
      const handled = await intercept(linktext, sourcePath, newLeaf, openViewState);
      if (handled) return;
      return originalOpenLinkText.call(workspace, linktext, sourcePath, newLeaf, openViewState);
    };

    try {
      workspace.openLinkText = hook;
    } catch (error) {
      originalOpenLinkText = null;
      hook = null;
      return {
        ok:false, installed:false, reason:'install-failed',
        error:error instanceof Error ? error.message : String(error)
      };
    }

    if (workspace.openLinkText !== hook) {
      originalOpenLinkText = null;
      hook = null;
      return {
        ok:false, installed:false, reason:'install-not-retained',
        error:'workspace.openLinkText beholdt ikke installert hook'
      };
    }

    installed = true;
    return { ok:true, installed:true, reason:'exact-open-link-hook', error:null };
  }

  function restore() {
    if (!installed) {
      return { ok:true, restored:false, reason:'not-installed', error:null };
    }
    if (!workspace || workspace.openLinkText !== hook) {
      return {
        ok:false, restored:false, reason:'hook-replaced',
        error:'workspace.openLinkText peker ikke lenger på PDFium Gate-hooken'
      };
    }
    try {
      workspace.openLinkText = originalOpenLinkText;
    } catch (error) {
      return {
        ok:false, restored:false, reason:'restore-failed',
        error:error instanceof Error ? error.message : String(error)
      };
    }
    installed = false;
    originalOpenLinkText = null;
    hook = null;
    return { ok:true, restored:true, reason:'original-restored', error:null };
  }

  function getState() {
    return {
      installed,
      ownsCurrentHook:!!(installed && workspace && workspace.openLinkText === hook)
    };
  }

  return Object.freeze({
    contractVersion: OBSIDIAN_OPEN_LINK_HOOK_CONTRACT_VERSION,
    install,
    restore,
    getState
  });
}

module.exports = {
  OBSIDIAN_OPEN_LINK_HOOK_CONTRACT_VERSION,
  createObsidianOpenLinkHookAdapter
};
