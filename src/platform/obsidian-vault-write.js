'use strict';
const OBSIDIAN_VAULT_WRITE_CONTRACT_VERSION = '0.3';
function createObsidianVaultWriteAdapter({ vault }) {
  async function createBinary(vaultPath, data) {
    if (!vault || typeof vault.createBinary !== 'function') throw new Error('vault.createBinary er ikke tilgjengelig');
    return await vault.createBinary(vaultPath, data);
  }
  async function modifyBinary(file, data) {
    if (!vault || typeof vault.modifyBinary !== 'function') throw new Error('vault.modifyBinary er ikke tilgjengelig');
    return await vault.modifyBinary(file, data);
  }
  async function createText(vaultPath, data) {
    if (!vault || typeof vault.create !== 'function') throw new Error('vault.create er ikke tilgjengelig');
    return await vault.create(vaultPath, String(data));
  }
  async function modifyText(file, data) {
    if (!vault || typeof vault.modify !== 'function') throw new Error('vault.modify er ikke tilgjengelig');
    return await vault.modify(file, String(data));
  }
  async function ensureFolder(vaultPath) {
    const target=String(vaultPath||'').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
    if(!target) return null;
    const existing=typeof vault?.getAbstractFileByPath==='function' ? vault.getAbstractFileByPath(target) : null;
    if(existing){
      if(Array.isArray(existing.children)) return existing;
      throw new Error(`Kan ikke opprette mappe: ${target} finnes, men er ikke en mappe.`);
    }
    if(!vault || typeof vault.createFolder!=='function') throw new Error('vault.createFolder er ikke tilgjengelig');
    return await vault.createFolder(target);
  }
  return Object.freeze({contractVersion:OBSIDIAN_VAULT_WRITE_CONTRACT_VERSION,createBinary,modifyBinary,createText,modifyText,ensureFolder});
}
module.exports={OBSIDIAN_VAULT_WRITE_CONTRACT_VERSION,createObsidianVaultWriteAdapter};
