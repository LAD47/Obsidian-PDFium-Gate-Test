'use strict';
const OBSIDIAN_VAULT_READ_CONTRACT_VERSION = '0.5';
function createObsidianVaultReadAdapter({ vault, TFolderClass = null }) {
  async function readBinary(file) {
    if (!vault || typeof vault.readBinary !== 'function') throw new Error('vault.readBinary er ikke tilgjengelig');
    return await vault.readBinary(file);
  }
  async function readText(file) {
    if (!vault || typeof vault.read !== 'function') throw new Error('vault.read er ikke tilgjengelig');
    return await vault.read(file);
  }
  function getAbstractFileByPath(vaultPath) {
    if (!vault || typeof vault.getAbstractFileByPath !== 'function') throw new Error('vault.getAbstractFileByPath er ikke tilgjengelig');
    return vault.getAbstractFileByPath(vaultPath);
  }

  function listMarkdownFiles() {
    if (!vault || typeof vault.getMarkdownFiles !== 'function') throw new Error('vault.getMarkdownFiles er ikke tilgjengelig');
    const files=vault.getMarkdownFiles();
    return Array.isArray(files) ? files.slice() : [];
  }

  function listFiles() {
    if (!vault || typeof vault.getFiles !== 'function') throw new Error('vault.getFiles er ikke tilgjengelig');
    const files=vault.getFiles();
    return Array.isArray(files) ? files.slice() : [];
  }

  function getBasePath() {
    const adapter = vault && vault.adapter;
    if (!adapter) throw new Error('vault.adapter er ikke tilgjengelig');
    let basePath = null;
    if (typeof adapter.getBasePath === 'function') basePath = adapter.getBasePath();
    else basePath = adapter.basePath;
    if (!basePath) throw new Error('Kunne ikke finne vaultens lokale basePath.');
    return String(basePath);
  }
  function listFolderPaths() {
    if (!vault) throw new Error('vault er ikke tilgjengelig');
    let folders = null;
    if (typeof vault.getAllFolders === 'function') {
      try { folders = vault.getAllFolders(true); } catch (_) { folders = null; }
    }
    if (!Array.isArray(folders) && typeof vault.getAllLoadedFiles === 'function') {
      try { folders = vault.getAllLoadedFiles().filter(item => TFolderClass ? item instanceof TFolderClass : (item && Array.isArray(item.children))); } catch (_) { folders = null; }
    }
    if (!Array.isArray(folders) && typeof vault.getRoot === 'function') {
      try {
        const root = vault.getRoot();
        const out = [];
        const walk = folder => {
          if (!folder || !Array.isArray(folder.children)) return;
          out.push(folder);
          for (const child of folder.children) if (TFolderClass ? child instanceof TFolderClass : (child && Array.isArray(child.children))) walk(child);
        };
        walk(root);
        folders = out;
      } catch (_) { folders = null; }
    }
    if (!Array.isArray(folders)) throw new Error('Ingen støttet Obsidian-rute for å liste vault-mapper er tilgjengelig');
    const paths = folders.map(folder => String(folder?.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''));
    if (!paths.includes('')) paths.unshift('');
    return [...new Set(paths)].sort((a, b) => a.localeCompare(b, undefined, { numeric:true, sensitivity:'base' }));
  }
  return Object.freeze({contractVersion:OBSIDIAN_VAULT_READ_CONTRACT_VERSION,readBinary,readText,getAbstractFileByPath,listMarkdownFiles,listFiles,getBasePath,listFolderPaths});
}
module.exports={OBSIDIAN_VAULT_READ_CONTRACT_VERSION,createObsidianVaultReadAdapter};
