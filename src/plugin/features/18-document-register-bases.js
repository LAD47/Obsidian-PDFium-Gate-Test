'use strict';

class DocumentRegisterBasesFeature {
  async ensureStandardPdfDocumentRegisterBase() {
    const path = PDF_DOCUMENT_REGISTER_STANDARD_BASE_PATH;
    const existing = this.obsidianVaultReadAdapter?.getAbstractFileByPath?.(path) || null;
    if (existing) {
      if (String(existing?.extension || '').toLowerCase() !== 'base') {
        return { ok:false, created:false, path, error:this.i18n.t('documentRegister.baseExistsNotBase',{path}) };
      }
      return { ok:true, created:false, path, file:existing };
    }

    const schema = this.ports.getMetadataSchemaSnapshot();
    if (!schema) return { ok:false, created:false, path, error:this.i18n.t('documentRegister.schemaUnavailableShort') };
    if (!this.obsidianVaultWriteAdapter || typeof this.obsidianVaultWriteAdapter.createText !== 'function') {
      return { ok:false, created:false, path, error:this.i18n.t('documentRegister.writeUnavailable') };
    }

    try {
      const yaml = metadataDocumentRegisterStandardBaseYaml(schema);
      const file = await this.obsidianVaultWriteAdapter.createText(path, yaml);
      if (!file || String(file?.path || '') !== path) {
        return { ok:false, created:false, path, error:this.i18n.t('documentRegister.createReadbackFailed') };
      }
      return { ok:true, created:true, path, file };
    } catch (error) {
      const raced = this.obsidianVaultReadAdapter?.getAbstractFileByPath?.(path) || null;
      if (raced && String(raced?.extension || '').toLowerCase() === 'base') {
        return { ok:true, created:false, path, file:raced };
      }
      return { ok:false, created:false, path, error:error instanceof Error ? error.message : String(error) };
    }
  }

  async openStandardPdfDocumentRegister() {
    const ensured = await this.ensureStandardPdfDocumentRegisterBase();
    if (!ensured?.ok || !ensured.file) {
      new Notice(this.i18n.t('documentRegister.openFailed',{version:PLUGIN_VERSION,error:ensured?.error || this.i18n.t('common.unknown')}), 9000);
      return ensured || { ok:false, error:this.i18n.t('common.unknown') };
    }
    try {
      const leaf = this.app?.workspace?.getLeaf?.('tab');
      if (!leaf || typeof leaf.openFile !== 'function') throw new Error(this.i18n.t('documentRegister.workspaceOpenFailed'));
      await leaf.openFile(ensured.file);
      if (ensured.created) new Notice(this.i18n.t('documentRegister.created'), 5000);
      return { ...ensured, opened:true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(this.i18n.t('documentRegister.openFailedDetail',{version:PLUGIN_VERSION,error:message}), 9000);
      return { ...ensured, ok:false, opened:false, error:message };
    }
  }

  registerPdfDocumentRegisterBasesView() {
    if (!this.obsidianPluginRegistrationAdapter || typeof this.obsidianPluginRegistrationAdapter.registerBasesView !== 'function') {
      return { ok:false, registered:false, reason:'bases-registration-adapter-unavailable' };
    }
    const registered = this.obsidianPluginRegistrationAdapter.registerBasesView(PDF_DOCUMENT_REGISTER_BASE_VIEW_TYPE, {
      name:this.i18n.t('documentRegister.viewName'),
      icon:'lucide-files',
      factory:(controller, containerEl) => new PdfDocumentRegisterBasesView(controller, containerEl, {
        app:this.app,
        getSchema:() => this.ports.getMetadataSchemaSnapshot(),
        getSettings:() => this.settings || {},
        getI18n:() => this.i18n || null,
        getFrontmatter:file => this.obsidianMetadataCacheAdapter?.getFrontmatter?.(file) || null,
        resolvePdfPath:(linkTarget, recordPath) => this.ports.resolveDocumentRecordPdfPath(linkTarget, recordPath),
        saveValues:(pdfPath, updates) => this.ports.saveDocumentMetadataRecordValues(pdfPath, updates),
        relinkMissingRecord:(recordId, pdfPath) => this.ports.relinkMissingDocumentRecord(recordId, pdfPath),
        listPdfFiles:() => (this.obsidianVaultReadAdapter?.listFiles?.() || []).filter(file => String(file?.extension || '').toLowerCase()==='pdf'),
        openLink:(path, sourcePath) => this.app.workspace.openLinkText(path, sourcePath || '')
      })
    });
    if (registered === false) {
      console.warn(`[PDFium Gate ${PLUGIN_VERSION}] Bases view registration unavailable; Bases core plugin/API is not available.`);
      return { ok:false, registered:false, reason:'bases-unavailable' };
    }
    this.obsidianPluginRegistrationAdapter.addCommand({
      id:'open-pdf-document-register',
      name:this.i18n.t('commands.openDocumentRegister'),
      callback:() => { void this.openStandardPdfDocumentRegister(); }
    });
    return { ok:true, registered:true, viewType:PDF_DOCUMENT_REGISTER_BASE_VIEW_TYPE, standardBasePath:PDF_DOCUMENT_REGISTER_STANDARD_BASE_PATH };
  }
}

module.exports = { DocumentRegisterBasesFeature };
