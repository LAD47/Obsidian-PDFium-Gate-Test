'use strict';

class MetadataSchemaFeature {
  async initializeMetadataSchema() {
    this.metadataSchemaRepository = createMetadataSchemaRepository({
      fileStore:this.obsidianAdapterFileStore,
      defaultSchemaFactory:() => metadataDefaultSchema()
    });
    try {
      const loaded = await this.metadataSchemaRepository.loadOrCreateDefault();
      this.state.metadata.schema = metadataClone(loaded.schema);
      this.state.metadata.loaded = true;
      this.state.metadata.lastError = null;
      this.state.metadata.lastBackupPath = loaded.backupPath || null;
      if (loaded.created) new Notice(this.i18n.t('metadataSchema.lifecycle.created',{version:PLUGIN_VERSION,path:METADATA_SCHEMA_PATH}), 7000);
      return { ok:true, created:!!loaded.created, schema:metadataClone(loaded.schema) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state.metadata.schema = null;
      this.state.metadata.loaded = false;
      this.state.metadata.lastError = message;
      this.state.metadata.lastBackupPath = null;
      console.error(`[PDFium Gate Test ${PLUGIN_VERSION}] metadata schema load failed:`, error);
      new Notice(this.i18n.t('metadataSchema.lifecycle.loadFailed',{version:PLUGIN_VERSION,error:message}), 12000);
      return { ok:false, error:message };
    }
  }

  async installMetadataExampleFiles() {
    const read = this.obsidianVaultReadAdapter;
    const write = this.obsidianVaultWriteAdapter;
    if (!read || !write) return {ok:false,error:'Vault adapters are unavailable.'};

    try {
      const rootEntry = read.getAbstractFileByPath(PDFIUM_EXAMPLES_ROOT);
      if (rootEntry && !Array.isArray(rootEntry.children)) {
        throw new Error(`${PDFIUM_EXAMPLES_ROOT} exists but is not a folder`);
      }
      if (!rootEntry) await write.ensureFolder(PDFIUM_EXAMPLES_ROOT);

      const created=[];
      const overwritten=[];
      for (const example of metadataExampleFiles()) {
        const existing = read.getAbstractFileByPath(example.path);
        if (existing && Array.isArray(existing.children)) {
          throw new Error(`${example.path} exists but is a folder`);
        }
        if (existing) {
          await write.modifyText(existing, example.content);
          overwritten.push(example.path);
        } else {
          await write.createText(example.path, example.content);
          created.push(example.path);
        }
      }
      return {ok:true,created,overwritten,total:created.length+overwritten.length};
    } catch (error) {
      const message=error instanceof Error ? error.message : String(error);
      return {ok:false,error:message};
    }
  }

  getMetadataSchemaStatus() {
    return {
      loaded:this.state.metadata.loaded === true,
      path:METADATA_SCHEMA_PATH,
      lastError:this.state.metadata.lastError || null,
      lastBackupPath:this.state.metadata.lastBackupPath || null,
      schema:metadataClone(this.state.metadata.schema)
    };
  }

  getMetadataSchemaSnapshot() {
    return metadataClone(this.state.metadata.schema);
  }

  async _persistMetadataSchemaCandidate(candidate) {
    if (!this.metadataSchemaRepository) throw new Error('Metadata schema repository er ikke initialisert');
    const validation = metadataValidateSchema(candidate);
    if (!validation.ok) throw new Error(validation.errors.join('\n'));
    const result = await this.metadataSchemaRepository.writeSchema(candidate);
    const saved = result.schema;
    this.state.metadata.schema = metadataClone(saved);
    this.state.metadata.loaded = true;
    this.state.metadata.lastError = null;
    this.state.metadata.lastBackupPath = result.backupPath || null;
    return metadataClone(saved);
  }

  async createMetadataSchemaField(field) {
    const current = this.getMetadataSchemaSnapshot();
    if (!current) throw new Error('Metadata-skjema er ikke lastet');
    const next = metadataClone(current);
    const candidate = metadataClone(field);
    if (!candidate || typeof candidate !== 'object') throw new Error('Feltdefinisjon mangler');
    if (!candidate.id) candidate.id = metadataUuidV4();
    next.fields.push(candidate);
    next.revision = current.revision + 1;
    return await this._persistMetadataSchemaCandidate(next);
  }

  async replaceMetadataSchemaField(fieldId, field) {
    const current = this.getMetadataSchemaSnapshot();
    if (!current) throw new Error('Metadata-skjema er ikke lastet');
    const index = current.fields.findIndex(item => item.id === fieldId);
    if (index < 0) throw new Error('Metadatafelt finnes ikke');
    const next = metadataClone(current);
    const replacement = metadataClone(field);
    if (!replacement || typeof replacement !== 'object') throw new Error('Feltdefinisjon mangler');
    replacement.id = fieldId;
    if (JSON.stringify(current.fields[index]) === JSON.stringify(replacement)) return current;
    next.fields[index] = replacement;
    next.revision = current.revision + 1;
    return await this._persistMetadataSchemaCandidate(next);
  }

  async setMetadataSchemaFieldActive(fieldId, active) {
    const current = this.getMetadataSchemaSnapshot();
    if (!current) throw new Error('Metadata-skjema er ikke lastet');
    const field = current.fields.find(item => item.id === fieldId);
    if (!field) throw new Error('Metadatafelt finnes ikke');
    if (field.active === !!active) return current;
    field.active = !!active;
    current.revision += 1;
    return await this._persistMetadataSchemaCandidate(current);
  }

  async moveMetadataSchemaField(fieldId, direction) {
    const current = this.getMetadataSchemaSnapshot();
    if (!current) throw new Error('Metadata-skjema er ikke lastet');
    const from = current.fields.findIndex(item => item.id === fieldId);
    if (from < 0) throw new Error('Metadatafelt finnes ikke');
    const delta = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    if (!delta) throw new Error('Ugyldig flytteretning');
    const to = from + delta;
    if (to < 0 || to >= current.fields.length) return current;
    const [field] = current.fields.splice(from, 1);
    current.fields.splice(to, 0, field);
    current.revision += 1;
    return await this._persistMetadataSchemaCandidate(current);
  }

  async deleteMetadataSchemaField(fieldId) {
    const current = this.getMetadataSchemaSnapshot();
    if (!current) throw new Error('Metadata-skjema er ikke lastet');
    const index = current.fields.findIndex(item => item.id === fieldId);
    if (index < 0) throw new Error('Metadatafelt finnes ikke');
    current.fields.splice(index, 1);
    current.revision += 1;
    return await this._persistMetadataSchemaCandidate(current);
  }

  async resetMetadataSchemaToTestDefaults() {
    const current = this.getMetadataSchemaSnapshot();
    const next = metadataDefaultSchema();
    if (current && current.format_version === next.format_version && JSON.stringify(current.fields) === JSON.stringify(next.fields)) return current;
    next.revision = Math.max(1, Number(current?.revision || 0) + 1);
    return await this._persistMetadataSchemaCandidate(next);
  }
}

module.exports = { MetadataSchemaFeature };
