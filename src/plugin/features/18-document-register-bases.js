'use strict';

class DocumentRegisterBasesFeature {
  async ensureExampleFiles() {
    const statePath = `${METADATA_SCHEMA_ROOT}/example-files-bootstrap.json`;
    const store = this.obsidianAdapterFileStore;
    const read = this.obsidianVaultReadAdapter;
    const write = this.obsidianVaultWriteAdapter;
    if (!store || !read || !write) return {ok:false,error:'vault adapters unavailable'};

    try {
      let installedVersion = 0;
      if (await store.exists(statePath)) {
        try {
          const parsed = JSON.parse(await store.readText(statePath));
          installedVersion = Number(parsed?.example_set_version || 0);
        } catch (_) {
          installedVersion = 0;
        }
      }
      if (installedVersion >= PDFIUM_EXAMPLES_BOOTSTRAP_VERSION) {
        return {ok:true,alreadyInstalled:true,created:[],skipped:[],version:installedVersion};
      }

      const rootEntry = read.getAbstractFileByPath(PDFIUM_EXAMPLES_ROOT);
      if (rootEntry && !Array.isArray(rootEntry.children)) {
        throw new Error(`${PDFIUM_EXAMPLES_ROOT} exists but is not a folder`);
      }
      if (!rootEntry) await write.ensureFolder(PDFIUM_EXAMPLES_ROOT);

      const created=[];
      const skipped=[];
      for (const example of metadataExampleFiles()) {
        if (read.getAbstractFileByPath(example.path)) {
          skipped.push(example.path);
          continue;
        }
        await write.createText(example.path, example.content);
        created.push(example.path);
      }

      await store.writeText(statePath, `${JSON.stringify({format_version:1,example_set_version:PDFIUM_EXAMPLES_BOOTSTRAP_VERSION},null,2)}\n`);
      return {ok:true,alreadyInstalled:false,created,skipped,version:PDFIUM_EXAMPLES_BOOTSTRAP_VERSION};
    } catch (error) {
      const message=error instanceof Error ? error.message : String(error);
      console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] Could not install example files: ${message}`);
      return {ok:false,error:message};
    }
  }

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
    void this.ensureExampleFiles();
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
      console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] Bases view registration unavailable; Bases core plugin/API is not available.`);
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
