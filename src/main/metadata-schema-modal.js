function metadataSchemaT(plugin,key,params){ return plugin?.i18n?.t?.(key,params) || key; }

function metadataFieldTypeLabel(type, plugin=null) {
  const key=String(type || '');
  const supported=new Set(['text','date','time','integer','decimal','boolean','select','multiselect','link']);
  return supported.has(key) ? metadataSchemaT(plugin,`metadataSchema.type.${key}`) : type;
}

function metadataParseDefaultFromEditor(type, text, plugin=null) {
  const value = String(text ?? '').trim();
  if (!value) return null;
  if (type === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(metadataSchemaT(plugin,'metadataSchema.default.boolean'));
  }
  if (type === 'integer') {
    const n = Number(value);
    if (!Number.isInteger(n)) throw new Error(metadataSchemaT(plugin,'metadataSchema.default.integer'));
    return n;
  }
  if (type === 'decimal') {
    const n = Number(value.replace(',', '.'));
    if (!Number.isFinite(n)) throw new Error(metadataSchemaT(plugin,'metadataSchema.default.decimal'));
    return n;
  }
  if (type === 'multiselect') return value.split(',').map(v => v.trim()).filter(Boolean);
  return value;
}

function metadataDefaultToEditorText(type, value) {
  if (value === null || value === undefined) return '';
  if (type === 'multiselect' && Array.isArray(value)) return value.join(', ');
  return String(value);
}

function metadataOptionsToEditorText(options) {
  return (Array.isArray(options) ? options : []).map(option => `${option.value} | ${option.label}`).join('\n');
}

function metadataParseOptionsEditorText(text, previousOptions = []) {
  const previousByValue = new Map((Array.isArray(previousOptions) ? previousOptions : []).map(option => [option.value, option]));
  const out=[];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line=rawLine.trim();
    if (!line) continue;
    const split=line.indexOf('|');
    const value=(split >= 0 ? line.slice(0, split) : line).trim();
    const label=(split >= 0 ? line.slice(split + 1) : line).trim();
    const previous=previousByValue.get(value);
    out.push({ id:previous?.id || metadataUuidV4(), value, label, active:previous?.active !== false });
  }
  return out;
}

class MetadataSchemaFieldModal extends Modal {
  constructor(app, plugin, field, onSave) {
    super(app);
    this.plugin = plugin;
    this.onSave = onSave;
    this.isNew = !field;
    this.draft = field ? metadataClone(field) : metadataMakeField({ property:'', label:'', type:'text' });
    this.defaultText = metadataDefaultToEditorText(this.draft.type, this.draft.default);
    this.optionsText = metadataOptionsToEditorText(this.draft.config?.options);
  }

  onOpen() { this.render(); }
  onClose() { this.contentEl.empty(); }

  render() {
    const { contentEl } = this;
    const t=(key,params)=>metadataSchemaT(this.plugin,key,params);
    contentEl.empty();
    contentEl.createEl('h2', { text:this.isNew ? t('metadataSchema.field.newTitle') : t('metadataSchema.field.editTitle') });
    contentEl.createEl('p', { text:t('metadataSchema.field.intro') });

    new Setting(contentEl)
      .setName(t('metadataSchema.field.label'))
      .setDesc(t('metadataSchema.field.labelDesc'))
      .addText(text => text.setValue(this.draft.label || '').onChange(value => { this.draft.label=value; }));

    new Setting(contentEl)
      .setName(t('metadataSchema.field.property'))
      .setDesc(t('metadataSchema.field.propertyDesc'))
      .addText(text => text.setValue(this.draft.property || '').onChange(value => { this.draft.property=String(value || '').trim(); }));

    new Setting(contentEl)
      .setName(t('metadataSchema.field.type'))
      .addDropdown(dropdown => {
        for (const type of METADATA_FIELD_TYPES) dropdown.addOption(type, metadataFieldTypeLabel(type,this.plugin));
        dropdown.setValue(this.draft.type);
        dropdown.onChange(value => {
          if (value === this.draft.type) return;
          this.draft.type=value;
          this.draft.config=metadataDefaultConfigForType(value);
          this.draft.default=null;
          this.defaultText='';
          this.optionsText='';
          this.render();
        });
      });

    new Setting(contentEl)
      .setName(t('metadataSchema.field.description'))
      .setDesc(t('metadataSchema.field.descriptionDesc'))
      .addText(text => text.setValue(this.draft.description || '').onChange(value => { this.draft.description=value; }));

    new Setting(contentEl)
      .setName(t('metadataSchema.field.required'))
      .addToggle(toggle => toggle.setValue(this.draft.required === true).onChange(value => { this.draft.required=!!value; }));

    new Setting(contentEl)
      .setName(t('metadataSchema.field.showDocumentInfo'))
      .addToggle(toggle => toggle.setValue(this.draft.show_in_document_info !== false).onChange(value => { this.draft.show_in_document_info=!!value; }));

    new Setting(contentEl)
      .setName(t('metadataSchema.field.showDefaultBase'))
      .setDesc(t('metadataSchema.field.showDefaultBaseDesc'))
      .addToggle(toggle => toggle.setValue(this.draft.show_in_default_base !== false).onChange(value => { this.draft.show_in_default_base=!!value; }));

    if (this.draft.type === 'time') {
      new Setting(contentEl)
        .setName(t('metadataSchema.field.timePrecision'))
        .addDropdown(dropdown => dropdown
          .addOption('minute',t('metadataSchema.field.minutes'))
          .addOption('second',t('metadataSchema.field.seconds'))
          .setValue(this.draft.config?.precision || 'minute')
          .onChange(value => { this.draft.config={...(this.draft.config||{}),precision:value,min:null,max:null}; }));
    }

    if (this.draft.type === 'link') {
      new Setting(contentEl)
        .setName(t('metadataSchema.field.linkType'))
        .addDropdown(dropdown => dropdown
          .addOption('internal',t('metadataSchema.field.internalLink'))
          .addOption('url',t('metadataSchema.field.url'))
          .setValue(this.draft.config?.kind || 'internal')
          .onChange(value => { this.draft.config={kind:value}; }));
    }

    if (this.draft.type === 'select' || this.draft.type === 'multiselect') {
      const setting = new Setting(contentEl)
        .setName(t('metadataSchema.field.options'))
        .setDesc(t('metadataSchema.field.optionsDesc'));
      const area = setting.controlEl.createEl('textarea');
      area.rows = 7;
      area.value = this.optionsText;
      area.addEventListener('input', () => { this.optionsText=area.value; });
    }

    new Setting(contentEl)
      .setName(t('metadataSchema.field.default'))
      .setDesc(t('metadataSchema.field.defaultDesc'))
      .addText(text => text.setValue(this.defaultText).onChange(value => { this.defaultText=value; }));

    const actions = new Setting(contentEl);
    actions.addButton(button => button.setButtonText(t('common.cancel')).onClick(() => this.close()));
    actions.addButton(button => button.setCta().setButtonText(this.isNew ? t('metadataSchema.field.create') : t('metadataSchema.field.save')).onClick(async () => {
      try {
        const next=metadataClone(this.draft);
        next.property=String(next.property || '').trim();
        next.label=String(next.label || '').trim();
        next.description=String(next.description || '');
        next.default=metadataParseDefaultFromEditor(next.type, this.defaultText, this.plugin);
        if (next.type === 'select' || next.type === 'multiselect') {
          const previous=this.draft.config?.options || [];
          const options=metadataParseOptionsEditorText(this.optionsText, previous);
          next.config=next.type === 'select'
            ? { options }
            : { min_items:Number.isInteger(next.config?.min_items) ? next.config.min_items : 0, max_items:Number.isInteger(next.config?.max_items) ? next.config.max_items : null, options };
        } else if (next.type === 'time') {
          next.config={ precision:next.config?.precision || 'minute', min:null, max:null };
        } else if (next.type === 'link') {
          next.config={ kind:next.config?.kind || 'internal' };
        } else {
          next.config=metadataDefaultConfigForType(next.type);
        }
        const validation=metadataValidateSchema({format_version:METADATA_SCHEMA_FORMAT_VERSION,revision:1,fields:[next]});
        if (!validation.ok) throw new Error(validation.errors.join('\n'));
        await this.onSave(next);
        this.close();
      } catch (error) {
        new Notice(t('metadataSchema.field.saveFailed',{error:error instanceof Error ? error.message : String(error)}), 12000);
      }
    }));
  }
}

class MetadataSchemaManagerModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    this.modalEl?.addClass?.('pdfium-metadata-schema-manager-modal');
    this.render();
  }

  onClose() { this.contentEl.empty(); }

  render() {
    const { contentEl } = this;
    const t=(key,params)=>metadataSchemaT(this.plugin,key,params);
    contentEl.empty();
    contentEl.createEl('h2', { text:t('metadataSchema.manager.title') });
    contentEl.createEl('p', { text:t('metadataSchema.manager.intro',{path:METADATA_SCHEMA_PATH}) });

    const status = this.plugin.ports.getMetadataSchemaStatus();
    if (!status.loaded || !status.schema) {
      const problem = status.lastError ? t('metadataSchema.manager.inactive',{error:status.lastError}) : t('metadataSchema.manager.notLoaded');
      contentEl.createEl('p', { text:problem });
      new Setting(contentEl)
        .setName(t('metadataSchema.manager.reload'))
        .addButton(button => button.setButtonText(t('common.retry')).onClick(async () => {
          await this.plugin.ports.initializeMetadataSchema();
          this.render();
        }));
      return;
    }

    contentEl.createEl('p', { text:t('metadataSchema.manager.status',{format:status.schema.format_version,revision:status.schema.revision,count:status.schema.fields.length}) });

    status.schema.fields.forEach((field, index) => {
      const setting = new Setting(contentEl)
        .setName(field.label)
        .setDesc(`${field.property} · ${metadataFieldTypeLabel(field.type,this.plugin)}${field.required ? ` · ${t('metadataSchema.manager.requiredSuffix')}` : ''}`)
        .addToggle(toggle => toggle.setValue(field.active !== false).onChange(async value => {
          try { await this.plugin.ports.setMetadataSchemaFieldActive(field.id, value); this.render(); }
          catch (error) { new Notice(t('metadataSchema.manager.changeFailed',{error:error instanceof Error ? error.message : String(error)}), 10000); }
        }));

      if (index > 0) setting.addButton(button => button.setButtonText('↑').setTooltip(t('metadataSchema.manager.moveUp')).onClick(async () => {
        try { await this.plugin.ports.moveMetadataSchemaField(field.id, 'up'); this.render(); }
        catch (error) { new Notice(t('metadataSchema.manager.moveFailed',{error:error instanceof Error ? error.message : String(error)}), 10000); }
      }));
      if (index < status.schema.fields.length - 1) setting.addButton(button => button.setButtonText('↓').setTooltip(t('metadataSchema.manager.moveDown')).onClick(async () => {
        try { await this.plugin.ports.moveMetadataSchemaField(field.id, 'down'); this.render(); }
        catch (error) { new Notice(t('metadataSchema.manager.moveFailed',{error:error instanceof Error ? error.message : String(error)}), 10000); }
      }));
      setting.addButton(button => button.setButtonText(t('common.edit')).onClick(() => {
        new MetadataSchemaFieldModal(this.app, this.plugin, field, async next => {
          await this.plugin.ports.replaceMetadataSchemaField(field.id, next);
          this.render();
        }).open();
      }));
      setting.addButton(button => button.setButtonText(t('common.delete')).onClick(async () => {
        try {
          await this.plugin.ports.deleteMetadataSchemaField(field.id);
          new Notice(t('metadataSchema.manager.deleted',{label:field.label}), 5000);
          this.render();
        } catch (error) { new Notice(t('metadataSchema.manager.deleteFailed',{error:error instanceof Error ? error.message : String(error)}), 10000); }
      }));
    });

    new Setting(contentEl)
      .setName(t('metadataSchema.manager.add'))
      .setDesc(t('metadataSchema.manager.addDesc'))
      .addButton(button => button.setCta().setButtonText(t('metadataSchema.manager.newField')).onClick(() => {
        new MetadataSchemaFieldModal(this.app, this.plugin, null, async field => {
          await this.plugin.ports.createMetadataSchemaField(field);
          this.render();
        }).open();
      }));

    new Setting(contentEl)
      .setName(t('metadataSchema.manager.reset'))
      .setDesc(t('metadataSchema.manager.resetDesc'))
      .addButton(button => button.setButtonText(t('common.reset')).onClick(async () => {
        try {
          await this.plugin.ports.resetMetadataSchemaToTestDefaults();
          new Notice(t('metadataSchema.manager.resetDone'), 5000);
          this.render();
        } catch (error) { new Notice(t('metadataSchema.manager.resetFailed',{error:error instanceof Error ? error.message : String(error)}), 10000); }
      }));
  }
}
