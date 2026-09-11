'use strict';

// PDFium Gate Platform Contract — renderer Obsidian linkpath resolution.
// Source-of-truth for the adapter bundled into release main.js.
const OBSIDIAN_LINK_RESOLUTION_CONTRACT_VERSION = '0.1';

function createObsidianLinkResolutionAdapter({ metadataCache }) {
  function resolveFirst(linkpath, sourcePath = '') {
    const target = String(linkpath || '').trim();
    if (!target) {
      return {
        ok:false, file:null, linkpath:null, sourcePath:String(sourcePath || ''),
        reason:'missing-linkpath', error:'Obsidian linkpath mangler'
      };
    }
    if (!metadataCache || typeof metadataCache.getFirstLinkpathDest !== 'function') {
      return {
        ok:false, file:null, linkpath:target, sourcePath:String(sourcePath || ''),
        reason:'resolver-unavailable', error:'metadataCache.getFirstLinkpathDest er ikke tilgjengelig'
      };
    }
    const origin = sourcePath || '';
    try {
      const file = metadataCache.getFirstLinkpathDest(target, origin) || null;
      return {
        ok:true, file, linkpath:target, sourcePath:String(origin || ''),
        reason:file ? 'resolved-first-linkpath-destination' : 'not-found', error:null
      };
    } catch (error) {
      return {
        ok:false, file:null, linkpath:target, sourcePath:String(origin || ''),
        reason:'resolution-failed', error:error instanceof Error ? error.message : String(error)
      };
    }
  }

  return Object.freeze({
    contractVersion: OBSIDIAN_LINK_RESOLUTION_CONTRACT_VERSION,
    resolveFirst
  });
}

module.exports = { OBSIDIAN_LINK_RESOLUTION_CONTRACT_VERSION, createObsidianLinkResolutionAdapter };
