'use strict';

const DOCUMENT_RECORD_VISIBILITY_BODY_CLASS = 'pdfium-hide-document-records';
const DOCUMENT_RECORD_VISIBILITY_SETTING = 'hideDocumentMetadataFilesInExplorer';

class DocumentRecordVisibilityFeature {
  isDocumentRecordFolderHidden() {
    return this.settings?.[DOCUMENT_RECORD_VISIBILITY_SETTING] !== false;
  }

  applyDocumentRecordVisibility() {
    const doc = typeof document !== 'undefined' ? document : null;
    const body = doc?.body || null;
    if (!body?.classList) return { ok:false, hidden:this.isDocumentRecordFolderHidden(), reason:'document-body-unavailable' };
    const hidden = this.isDocumentRecordFolderHidden();
    body.classList.toggle(DOCUMENT_RECORD_VISIBILITY_BODY_CLASS, hidden);
    return { ok:true, hidden };
  }

  clearDocumentRecordVisibility() {
    const doc = typeof document !== 'undefined' ? document : null;
    const body = doc?.body || null;
    if (!body?.classList) return { ok:false, reason:'document-body-unavailable' };
    body.classList.remove(DOCUMENT_RECORD_VISIBILITY_BODY_CLASS);
    return { ok:true, hidden:false };
  }

  async setDocumentRecordFolderHidden(hidden) {
    this.settings = this.settings || {};
    this.settings[DOCUMENT_RECORD_VISIBILITY_SETTING] = !!hidden;
    await this.obsidianPluginDataAdapter.saveData(this.settings);
    const applied = this.applyDocumentRecordVisibility();
    return { ...applied, persisted:true };
  }

  async toggleDocumentRecordVisibility() {
    const hidden = !this.isDocumentRecordFolderHidden();
    const result = await this.setDocumentRecordFolderHidden(hidden);
    new Notice(hidden
      ? this.i18n?.t?.('metadataVisibility.hidden',{version:PLUGIN_VERSION}) || 'metadataVisibility.hidden'
      : this.i18n?.t?.('metadataVisibility.visible',{version:PLUGIN_VERSION}) || 'metadataVisibility.visible');
    return result;
  }
}

module.exports = {
  DOCUMENT_RECORD_VISIBILITY_BODY_CLASS,
  DOCUMENT_RECORD_VISIBILITY_SETTING,
  DocumentRecordVisibilityFeature
};
