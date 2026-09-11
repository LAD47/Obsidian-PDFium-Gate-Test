'use strict';

// PDFium Gate Platform Contract — renderer-side Obsidian Plugin registration.
// Source-of-truth for the adapter bundled into release main.js.
const OBSIDIAN_PLUGIN_REGISTRATION_CONTRACT_VERSION = '0.3';

function createObsidianPluginRegistrationAdapter({ plugin }) {
  function addSettingTab(settingTab) {
    if (!plugin || typeof plugin.addSettingTab !== 'function') throw new Error('plugin.addSettingTab er ikke tilgjengelig');
    return plugin.addSettingTab(settingTab);
  }

  function registerView(viewType, creator) {
    if (!plugin || typeof plugin.registerView !== 'function') throw new Error('plugin.registerView er ikke tilgjengelig');
    if (typeof creator !== 'function') throw new Error('registerView creator mangler');
    return plugin.registerView(viewType, creator);
  }

  function registerEvent(eventRef) {
    if (!plugin || typeof plugin.registerEvent !== 'function') throw new Error('plugin.registerEvent er ikke tilgjengelig');
    return plugin.registerEvent(eventRef);
  }

  function addCommand(command) {
    if (!plugin || typeof plugin.addCommand !== 'function') throw new Error('plugin.addCommand er ikke tilgjengelig');
    if (!command || typeof command !== 'object') throw new Error('addCommand command mangler');
    return plugin.addCommand(command);
  }

  function registerExtensions(extensions, viewType) {
    if (!plugin || typeof plugin.registerExtensions !== 'function') throw new Error('plugin.registerExtensions er ikke tilgjengelig');
    if (!Array.isArray(extensions) || !extensions.length) throw new Error('registerExtensions extensions mangler');
    return plugin.registerExtensions(extensions, viewType);
  }

  function registerBasesView(viewType, registration) {
    if (!plugin || typeof plugin.registerBasesView !== 'function') return false;
    if (!viewType || !registration || typeof registration.factory !== 'function') throw new Error('registerBasesView registration mangler');
    return plugin.registerBasesView(viewType, registration);
  }

  return Object.freeze({
    contractVersion: OBSIDIAN_PLUGIN_REGISTRATION_CONTRACT_VERSION,
    addSettingTab,
    registerView,
    registerEvent,
    addCommand,
    registerExtensions,
    registerBasesView
  });
}

module.exports = { OBSIDIAN_PLUGIN_REGISTRATION_CONTRACT_VERSION, createObsidianPluginRegistrationAdapter };
