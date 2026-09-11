class PdfiumGateSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async saveSetting(key, value) {
    this.plugin.settings = this.plugin.settings || {};
    this.plugin.settings[key] = value;
    await this.plugin.obsidianPluginDataAdapter.saveData(this.plugin.settings);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'PDFium Gate Test' });

    const t=(key,params)=>this.plugin.i18n?.t?.(key,params) || key;
    containerEl.createEl('h3', { text: t('settings.language.section') });
    new Setting(containerEl)
      .setName(t('settings.language.name'))
      .setDesc(`${t('settings.language.description')} ${t('settings.language.reloadNote')}`)
      .addDropdown(dropdown => dropdown
        .addOption('auto',t('settings.language.followObsidian'))
        .addOption('en',t('settings.language.english'))
        .addOption('nb',t('settings.language.norwegianBokmal'))
        .setValue(pdfiumNormalizeLanguageSetting(this.plugin.settings?.uiLanguage || 'auto'))
        .onChange(async value => { await this.saveSetting('uiLanguage', pdfiumNormalizeLanguageSetting(value)); }));

    containerEl.createEl('h3', { text: t('settings.pdf.section') });

    new Setting(containerEl)
      .setName(t('settings.pdf.includeHeaderFooter.name'))
      .setDesc(t('settings.pdf.includeHeaderFooter.description'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings?.includeHeaderFooterText !== false)
        .onChange(async value => {
          await this.saveSetting('includeHeaderFooterText', !!value);
          try { if (this.plugin.mainProcessTransport?.getCapabilities?.().loaded) this.plugin.mainProcessTransport.setIncludeHeaderFooterText(this.plugin.settings.includeHeaderFooterText); } catch (_) {}
        }));

    new Setting(containerEl)
      .setName(t('settings.pdf.backupOriginal.name'))
      .setDesc(t('settings.pdf.backupOriginal.description'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings?.backupOriginalPdf !== false)
        .onChange(async value => { await this.saveSetting('backupOriginalPdf', !!value); }));

    containerEl.createEl('h3', { text: t('settings.regional.section') });
    containerEl.createEl('p', { text:t('settings.regional.description') });

    new Setting(containerEl)
      .setName(t('settings.regional.dateFormat.name'))
      .addDropdown(dropdown => dropdown
        .addOption('DD.MM.YYYY','17.03.2016')
        .addOption('DD/MM/YYYY','17/03/2016')
        .addOption('MM/DD/YYYY','03/17/2016')
        .addOption('YYYY-MM-DD','2016-03-17')
        .setValue(this.plugin.settings?.regionalDateFormat || 'DD.MM.YYYY')
        .onChange(async value => { await this.saveSetting('regionalDateFormat', value); }));

    new Setting(containerEl)
      .setName(t('settings.regional.timeFormat.name'))
      .addDropdown(dropdown => dropdown
        .addOption('HH:mm',t('settings.regional.timeFormat.24hour'))
        .addOption('h:mm A',t('settings.regional.timeFormat.12hour'))
        .setValue(this.plugin.settings?.regionalTimeFormat || 'HH:mm')
        .onChange(async value => { await this.saveSetting('regionalTimeFormat', value); }));

    new Setting(containerEl)
      .setName(t('settings.regional.decimalSeparator.name'))
      .addDropdown(dropdown => dropdown
        .addOption(',',t('settings.regional.decimalSeparator.comma'))
        .addOption('.',t('settings.regional.decimalSeparator.dot'))
        .setValue(this.plugin.settings?.regionalDecimalSeparator || ',')
        .onChange(async value => { await this.saveSetting('regionalDecimalSeparator', value); }));

    containerEl.createEl('h3', { text: t('settings.metadata.section') });
    const metadataStatus = this.plugin.ports.getMetadataSchemaStatus();
    const metadataSummary = metadataStatus.loaded && metadataStatus.schema
      ? t('settings.metadata.fields.summary',{count:metadataStatus.schema.fields.length,revision:metadataStatus.schema.revision,path:METADATA_SCHEMA_PATH})
      : t('settings.metadata.fields.schemaInactive',{path:METADATA_SCHEMA_PATH});

    new Setting(containerEl)
      .setName(t('settings.metadata.fields.name'))
      .setDesc(metadataSummary)
      .addButton(button => button.setCta().setButtonText(t('settings.metadata.fields.manage')).onClick(() => {
        new MetadataSchemaManagerModal(this.app, this.plugin).open();
      }));

    new Setting(containerEl)
      .setName(t('settings.metadata.hideFiles.name'))
      .setDesc(t('settings.metadata.hideFiles.description'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings?.hideDocumentMetadataFilesInExplorer !== false)
        .onChange(async value => {
          await this.saveSetting('hideDocumentMetadataFilesInExplorer', !!value);
          this.plugin.ports.applyDocumentRecordVisibility();
        }));

    containerEl.createEl('h3', { text: t('settings.documentRegister.section') });

    new Setting(containerEl)
      .setName(t('settings.documentRegister.rememberFilters.name'))
      .setDesc(t('settings.documentRegister.rememberFilters.description'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings?.rememberDocumentRegisterFilters === true)
        .onChange(async value => {
          await this.saveSetting('rememberDocumentRegisterFilters', !!value);
        }));

    containerEl.createEl('h3', { text: t('settings.advanced.section') });

    new Setting(containerEl)
      .setName(t('settings.advanced.diagnostics.name'))
      .setDesc(t('settings.advanced.diagnostics.description'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings?.diagnosticsEnabled === true)
        .onChange(async value => {
          await this.saveSetting('diagnosticsEnabled', !!value);
          this.plugin.refreshDiagnosticsVisibility();
        }));
  }
}
