'use strict';
const OBSIDIAN_ADAPTER_FILE_STORE_CONTRACT_VERSION = '0.2';
function createObsidianAdapterFileStore({ adapter }) {
  if (!adapter) throw new Error('vault.adapter er ikke tilgjengelig');
  for (const method of ['exists','read','write','mkdir','copy','rename','remove']) {
    if (typeof adapter[method] !== 'function') throw new Error(`vault.adapter.${method} er ikke tilgjengelig`);
  }

  function normalize(vaultPath) {
    return String(vaultPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  }

  async function exists(vaultPath) {
    return !!(await adapter.exists(normalize(vaultPath)));
  }

  async function readText(vaultPath) {
    return String(await adapter.read(normalize(vaultPath)));
  }

  async function writeText(vaultPath, data) {
    const target = normalize(vaultPath);
    if (!target) throw new Error('Kan ikke skrive til tom vault-sti');
    await adapter.write(target, String(data));
    return { path:target };
  }

  async function ensureFolder(vaultPath) {
    const target = normalize(vaultPath);
    if (!target) return { path:'' };
    if (await adapter.exists(target)) return { path:target };
    const parts = target.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await adapter.exists(current))) await adapter.mkdir(current);
    }
    return { path:target };
  }

  async function copyFile(fromPath, toPath) {
    const source = normalize(fromPath);
    const target = normalize(toPath);
    if (!source || !target) throw new Error('Kan ikke kopiere med tom vault-sti');
    await adapter.copy(source, target);
    return { from:source, path:target };
  }

  async function rename(fromPath, toPath) {
    const source = normalize(fromPath);
    const target = normalize(toPath);
    if (!source || !target) throw new Error('Kan ikke flytte med tom vault-sti');
    await adapter.rename(source, target);
    return { from:source, path:target };
  }

  async function removeFile(vaultPath) {
    const target = normalize(vaultPath);
    if (!target) throw new Error('Kan ikke slette tom vault-sti');
    if (await adapter.exists(target)) await adapter.remove(target);
    return { path:target };
  }

  return Object.freeze({
    contractVersion:OBSIDIAN_ADAPTER_FILE_STORE_CONTRACT_VERSION,
    exists,
    readText,
    writeText,
    ensureFolder,
    copyFile,
    rename,
    removeFile
  });
}
module.exports={OBSIDIAN_ADAPTER_FILE_STORE_CONTRACT_VERSION,createObsidianAdapterFileStore};
