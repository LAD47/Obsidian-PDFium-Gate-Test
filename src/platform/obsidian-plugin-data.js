'use strict';
const OBSIDIAN_PLUGIN_DATA_CONTRACT_VERSION = '0.1';
function createObsidianPluginDataAdapter({ plugin }) {
  async function loadData() {
    if (!plugin || typeof plugin.loadData !== 'function') throw new Error('plugin.loadData er ikke tilgjengelig');
    return await plugin.loadData();
  }
  async function saveData(data) {
    if (!plugin || typeof plugin.saveData !== 'function') throw new Error('plugin.saveData er ikke tilgjengelig');
    return await plugin.saveData(data);
  }
  return Object.freeze({contractVersion:OBSIDIAN_PLUGIN_DATA_CONTRACT_VERSION,loadData,saveData});
}
module.exports={OBSIDIAN_PLUGIN_DATA_CONTRACT_VERSION,createObsidianPluginDataAdapter};
