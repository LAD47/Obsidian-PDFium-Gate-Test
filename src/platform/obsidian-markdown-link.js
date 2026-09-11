'use strict';

// PDFium Gate Platform Contract — renderer Obsidian Markdown-link generation.
// Source-of-truth for the adapter bundled into release main.js.
const OBSIDIAN_MARKDOWN_LINK_CONTRACT_VERSION = '0.1';

function createObsidianMarkdownLinkAdapter({ fileManager }) {
  function generate(file, sourcePath = '', subpath = '', displayText = '') {
    if (!file) {
      return {
        ok:false, link:null, reason:'missing-file', error:'Obsidian-fil mangler'
      };
    }
    if (!fileManager || typeof fileManager.generateMarkdownLink !== 'function') {
      return {
        ok:false, link:null, reason:'generator-unavailable',
        error:'fileManager.generateMarkdownLink er ikke tilgjengelig'
      };
    }
    try {
      const link = fileManager.generateMarkdownLink(
        file,
        String(sourcePath || ''),
        String(subpath || ''),
        String(displayText || '')
      );
      return {
        ok:true, link:String(link ?? ''), reason:'generate-markdown-link', error:null
      };
    } catch (error) {
      return {
        ok:false, link:null, reason:'generation-failed',
        error:error instanceof Error ? error.message : String(error)
      };
    }
  }

  return Object.freeze({
    contractVersion: OBSIDIAN_MARKDOWN_LINK_CONTRACT_VERSION,
    generate
  });
}

module.exports = { OBSIDIAN_MARKDOWN_LINK_CONTRACT_VERSION, createObsidianMarkdownLinkAdapter };
