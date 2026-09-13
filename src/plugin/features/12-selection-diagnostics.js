'use strict';

class SelectionDiagnosticsFeature {
  collectSelectionPages(winner) {
    if (!winner || !Array.isArray(winner.progress)) return [];
    const pages = [];
    for (const p of winner.progress) {
      if (!p || !Array.isArray(p.results) || p.results.length === 0) continue;
      const value = p.page;
      if (value === undefined || value === null) continue;
      if (!pages.includes(value)) pages.push(value);
    }
    return pages;
  }

  async runSelectionBridgeTest(file) {
    let clipboardText = '';
    try { clipboardText = String(clipboardTextAdapter.readText() || '').trim(); } catch (_) {}
    if (!clipboardText) {
      new Notice(this.i18n.t('selectionDiagnostics.clipboardEmpty'), 12000);
      return;
    }

    new Notice(this.i18n.t('selectionDiagnostics.searching',{version:PLUGIN_VERSION}), 5000);
    try {
      const original = await this.obsidianVaultReadAdapter.readBinary(file);
      const result = await this.ports.findSelectionWithAnnotator(original, clipboardText);
      const winner = result.winner || null;
      const diagnostic = {
        version: PLUGIN_VERSION,
        file: file.path,
        clipboardText,
        found: !!result.found,
        total: winner ? winner.total : 0,
        queryMode: winner ? winner.mode : null,
        queryUsed: winner ? winner.query : null,
        pages: this.collectSelectionPages(winner),
        fullGeometry: result.fullGeometry || null,
        directGeometry: result.directGeometry || null,
        primitiveDiagnostics: result.primitiveDiagnostics || null,
        engineResult: {
          winner,
          attempts: result.attempts || [],
          fullGeometry: result.fullGeometry || null,
          directGeometry: result.directGeometry || null,
          primitiveDiagnostics: result.primitiveDiagnostics || null
        }
      };
      console.log(`[PDFium Gate ${PLUGIN_VERSION}] selection bridge diagnostic`, diagnostic);
      new SelectionBridgeResultModal(this.app, this, diagnostic).open();
    } catch (error) {
      console.error(`[PDFium Gate ${PLUGIN_VERSION}] selection bridge failed:`, error);
      new Notice(this.i18n.t('selectionDiagnostics.failed',{error:error instanceof Error ? error.message : String(error)}), 15000);
    }
  }
}

module.exports = { SelectionDiagnosticsFeature };
