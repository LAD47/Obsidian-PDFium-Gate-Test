'use strict';

// PDFium Gate Platform Contract — Obsidian plugin/config filesystem paths.
// Isolates vault.configDir + plugin-id path composition from renderer production code.
const OBSIDIAN_PLUGIN_PATHS_CONTRACT_VERSION = '0.1';

function createObsidianPluginPathsAdapter({ vault, manifest, pathModule, vaultReadAdapter }) {
  if (!pathModule || typeof pathModule.join !== 'function') throw new Error('Node path.join er ikke tilgjengelig');
  if (!manifest || !manifest.id) throw new Error('plugin manifest.id mangler');
  if (!vaultReadAdapter || typeof vaultReadAdapter.getBasePath !== 'function') throw new Error('vaultReadAdapter.getBasePath er ikke tilgjengelig');

  function getConfigDir() {
    const value = String(vault?.configDir || '.obsidian').trim();
    return value || '.obsidian';
  }

  function getPluginRootPath() {
    return pathModule.join(
      vaultReadAdapter.getBasePath(),
      getConfigDir(),
      'plugins',
      String(manifest.id)
    );
  }

  function resolvePluginPath(...segments) {
    return pathModule.join(getPluginRootPath(), ...segments.map(segment => String(segment)));
  }

  return Object.freeze({
    contractVersion: OBSIDIAN_PLUGIN_PATHS_CONTRACT_VERSION,
    getConfigDir,
    getPluginRootPath,
    resolvePluginPath
  });
}

module.exports = { OBSIDIAN_PLUGIN_PATHS_CONTRACT_VERSION, createObsidianPluginPathsAdapter };
