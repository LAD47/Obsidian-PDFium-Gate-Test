'use strict';

const MAIN_PROCESS_TRANSPORT_CONTRACT_VERSION = '0.2';
const MAIN_PROCESS_TRANSPORT_KIND = 'electron-remote-require';
const REQUIRED_MAIN_BRIDGE_METHODS = Object.freeze([
  'install',
  'uninstall',
  'getState',
  'getPlatformCapabilities',
  'setRendererMenuOpen',
  'setKeyboardSelection',
  'clearKeyboardSelection',
  'reportKeyboardSelectionResult',
  'showLinkLocator',
  'setActivePdfIdentity',
  'focusPdfRuntime',
  'ensurePdfRuntime',
  'setIncludeHeaderFooterText'
]);

function createMainProcessTransport({ remoteRequireAdapter }) {
  let bridge = null;
  let modulePath = null;
  let lastLoad = null;

  function apiStatus(target = bridge) {
    const methods = {};
    for (const name of REQUIRED_MAIN_BRIDGE_METHODS) methods[name] = typeof target?.[name] === 'function';
    return {
      complete: REQUIRED_MAIN_BRIDGE_METHODS.every(name => methods[name]),
      methods
    };
  }

  function getCapabilities() {
    let remote = null;
    try { remote = remoteRequireAdapter?.getCapabilities?.() || null; } catch (_) {}
    return {
      contractVersion: MAIN_PROCESS_TRANSPORT_CONTRACT_VERSION,
      kind: MAIN_PROCESS_TRANSPORT_KIND,
      loaded: !!bridge,
      modulePath,
      loadBoundaryAvailable: remote?.requireFunction === true,
      remoteRequire: remote,
      api: apiStatus(),
      lastLoad
    };
  }

  function loadExact(exactModulePath) {
    const target = String(exactModulePath || '').trim();
    const rec = {
      ok: false,
      kind: MAIN_PROCESS_TRANSPORT_KIND,
      modulePath: target || null,
      reason: null,
      error: null,
      api: null
    };
    bridge = null;
    modulePath = null;
    if (!target) {
      rec.reason = 'missing-module-path';
      rec.error = 'Main-process bridge-sti mangler';
      lastLoad = rec;
      return rec;
    }
    if (!remoteRequireAdapter || typeof remoteRequireAdapter.requireInMain !== 'function') {
      rec.reason = 'transport-load-boundary-unavailable';
      rec.error = 'Renderer-to-main load boundary er ikke tilgjengelig';
      lastLoad = rec;
      return rec;
    }
    const loaded = remoteRequireAdapter.requireInMain(target);
    if (!loaded?.ok) {
      rec.reason = loaded?.reason || 'bridge-load-failed';
      rec.error = loaded?.error || rec.reason;
      lastLoad = rec;
      return rec;
    }
    const candidate = loaded.module;
    rec.api = apiStatus(candidate);
    if (!rec.api.complete) {
      rec.reason = 'bridge-api-incomplete';
      rec.error = 'main-bridge.js eksponerer ikke forventet API';
      lastLoad = rec;
      return rec;
    }
    bridge = candidate;
    modulePath = target;
    rec.ok = true;
    rec.reason = loaded?.reason || 'loaded';
    lastLoad = rec;
    return rec;
  }

  function reset() {
    bridge = null;
    modulePath = null;
    return getCapabilities();
  }

  function requireMethod(name) {
    if (!bridge) throw new Error('Main-process transport er ikke lastet');
    const fn = bridge[name];
    if (typeof fn !== 'function') throw new Error(`Main-process bridge mangler ${name}()`);
    return fn;
  }

  function invoke(name, ...args) {
    return requireMethod(name).apply(bridge, args);
  }

  return Object.freeze({
    contractVersion: MAIN_PROCESS_TRANSPORT_CONTRACT_VERSION,
    kind: MAIN_PROCESS_TRANSPORT_KIND,
    requiredMethods: REQUIRED_MAIN_BRIDGE_METHODS,
    getCapabilities,
    loadExact,
    reset,
    install: (...args) => invoke('install', ...args),
    uninstall: (...args) => invoke('uninstall', ...args),
    getState: (...args) => invoke('getState', ...args),
    getPlatformCapabilities: (...args) => invoke('getPlatformCapabilities', ...args),
    setRendererMenuOpen: (...args) => invoke('setRendererMenuOpen', ...args),
    setKeyboardSelection: (...args) => invoke('setKeyboardSelection', ...args),
    clearKeyboardSelection: (...args) => invoke('clearKeyboardSelection', ...args),
    reportKeyboardSelectionResult: (...args) => invoke('reportKeyboardSelectionResult', ...args),
    showLinkLocator: (...args) => invoke('showLinkLocator', ...args),
    setActivePdfIdentity: (...args) => invoke('setActivePdfIdentity', ...args),
    focusPdfRuntime: (...args) => invoke('focusPdfRuntime', ...args),
    ensurePdfRuntime: (...args) => invoke('ensurePdfRuntime', ...args),
    setIncludeHeaderFooterText: (...args) => invoke('setIncludeHeaderFooterText', ...args)
  });
}

module.exports = {
  MAIN_PROCESS_TRANSPORT_CONTRACT_VERSION,
  MAIN_PROCESS_TRANSPORT_KIND,
  REQUIRED_MAIN_BRIDGE_METHODS,
  createMainProcessTransport
};
