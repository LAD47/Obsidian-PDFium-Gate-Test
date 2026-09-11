'use strict';
const OBSIDIAN_WORKSPACE_LIFECYCLE_CONTRACT_VERSION = '0.2';
function createObsidianWorkspaceLifecycleAdapter({ workspace, windowObject = (typeof window !== 'undefined' ? window : null) }) {
  function onActiveLeafChange(callback) {
    if (!workspace || typeof workspace.on !== 'function') throw new Error('workspace.on er ikke tilgjengelig');
    if (typeof callback !== 'function') throw new Error('active-leaf-change callback mangler');
    return workspace.on('active-leaf-change', callback);
  }
  function onLayoutReady(callback) {
    if (!workspace || typeof workspace.onLayoutReady !== 'function') throw new Error('workspace.onLayoutReady er ikke tilgjengelig');
    if (typeof callback !== 'function') throw new Error('layout-ready callback mangler');
    return workspace.onLayoutReady(callback);
  }
  function scheduleIdle(callback) {
    if (typeof callback !== 'function') throw new Error('idle callback mangler');
    if (windowObject && typeof windowObject.requestIdleCallback === 'function') {
      const id=windowObject.requestIdleCallback(()=>callback());
      return Object.freeze({kind:'requestIdleCallback',id});
    }
    const timerApi=windowObject || globalThis;
    const id=timerApi.setTimeout(()=>callback(),0);
    return Object.freeze({kind:'setTimeout0',id});
  }
  function cancelIdle(handle) {
    if(!handle) return false;
    if(handle.kind==='requestIdleCallback' && windowObject && typeof windowObject.cancelIdleCallback==='function') {
      windowObject.cancelIdleCallback(handle.id);
      return true;
    }
    const timerApi=windowObject || globalThis;
    if(typeof timerApi.clearTimeout==='function') { timerApi.clearTimeout(handle.id); return true; }
    return false;
  }
  return Object.freeze({contractVersion:OBSIDIAN_WORKSPACE_LIFECYCLE_CONTRACT_VERSION,onActiveLeafChange,onLayoutReady,scheduleIdle,cancelIdle});
}
module.exports={OBSIDIAN_WORKSPACE_LIFECYCLE_CONTRACT_VERSION,createObsidianWorkspaceLifecycleAdapter};
