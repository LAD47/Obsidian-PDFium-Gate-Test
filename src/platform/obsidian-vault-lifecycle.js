'use strict';
const OBSIDIAN_VAULT_LIFECYCLE_CONTRACT_VERSION='0.1';
function createObsidianVaultLifecycleAdapter({vault}) {
  function on(eventName,callback) {
    if(!vault || typeof vault.on!=='function') throw new Error('vault.on er ikke tilgjengelig');
    if(typeof callback!=='function') throw new Error(`${eventName} callback mangler`);
    return vault.on(eventName,callback);
  }
  return Object.freeze({
    contractVersion:OBSIDIAN_VAULT_LIFECYCLE_CONTRACT_VERSION,
    onCreate:callback=>on('create',callback),
    onModify:callback=>on('modify',callback),
    onRename:callback=>on('rename',callback),
    onDelete:callback=>on('delete',callback)
  });
}
module.exports={OBSIDIAN_VAULT_LIFECYCLE_CONTRACT_VERSION,createObsidianVaultLifecycleAdapter};
