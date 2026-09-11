function categoryModalT(plugin, key, params = {}) { return plugin?.i18n?.t?.(key, params) || key; }

class CategoryConfigBootstrapModal extends Modal {
  constructor(app, plugin, file) {
    super(app);
    this.plugin = plugin;
    this.file = file instanceof TFile ? file : null;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: categoryModalT(this.plugin, 'category.bootstrap.title', { version:PLUGIN_VERSION }) });
    contentEl.createEl('p', {
      text: categoryModalT(this.plugin, 'category.bootstrap.intro')
    });

    const folder = this.file ? vaultDirname(this.file.path) : null;
    if (this.file && folder !== '') {
      new Setting(contentEl)
        .setName(categoryModalT(this.plugin, 'category.bootstrap.activeFolder.name'))
        .setDesc(categoryModalT(this.plugin, 'category.bootstrap.activeFolder.desc', { folder }))
        .addButton(b => b.setButtonText(categoryModalT(this.plugin, 'category.bootstrap.createHere')).setCta().onClick(() => void this.create(folder, true, true)));
    } else if (this.file && folder === '') {
      contentEl.createEl('p', { cls: 'setting-item-description', text: categoryModalT(this.plugin, 'category.bootstrap.pdfAtRoot') });
    } else {
      contentEl.createEl('p', { cls: 'setting-item-description', text: categoryModalT(this.plugin, 'category.bootstrap.noActivePdf') });
    }

    contentEl.createEl('p', {
      cls: 'setting-item-description',
      text: categoryModalT(this.plugin, 'category.bootstrap.globalOwner')
    });

    contentEl.createEl('p', {
      cls: 'setting-item-description',
      text: categoryModalT(this.plugin, 'category.bootstrap.backupInfo')
    });
  }

  async create(folder, inherit, openEditorAfter) {
    try {
      const result = await this.plugin.createDefaultCategoryConfig(folder, { inherit });
      if (!result.created) {
        new Notice(categoryModalT(this.plugin, 'category.notice.configExists', { version:PLUGIN_VERSION, path:result.configPath }), 12000);
        return;
      }
      new Notice(categoryModalT(this.plugin, 'category.notice.configCreated', { version:PLUGIN_VERSION, path:result.configPath }), 12000);
      this.close();
      if (openEditorAfter && this.file) {
        window.setTimeout(() => this.plugin.openCategoryEditor(this.file), 50);
      }
    } catch (error) {
      new Notice(categoryModalT(this.plugin, 'category.notice.createFailed', { error:error instanceof Error ? error.message : String(error) }), 15000);
    }
  }

  onClose() { this.contentEl.empty(); }
}

class CategoryFolderPickerModal extends Modal {
  constructor(app, plugin, currentFolder, onChoose) {
    super(app);
    this.plugin = plugin;
    this.currentFolder = String(currentFolder || '');
    this.onChoose = onChoose;
    this.query = '';
  }

  onOpen() { this.render(); }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('pdfium-category-folder-picker');
    contentEl.createEl('h2', { text: categoryModalT(this.plugin, 'category.folderPicker.title') });
    contentEl.createEl('p', { cls: 'setting-item-description', text: categoryModalT(this.plugin, 'category.folderPicker.description') });

    const searchSetting = new Setting(contentEl).setName(categoryModalT(this.plugin, 'category.folderPicker.search'));
    searchSetting.addText(t => {
      t.setPlaceholder(categoryModalT(this.plugin, 'category.folderPicker.placeholder'));
      t.setValue(this.query);
      t.onChange(value => { this.query = String(value || ''); this.renderList(listEl); });
      try { (contentEl.ownerDocument.defaultView || window).setTimeout(() => t.inputEl?.focus(), 0); } catch (_) {}
    });

    const listEl = contentEl.createDiv({ cls: 'pdfium-category-folder-list' });
    this.renderList(listEl);

    new Setting(contentEl).addButton(b => b.setButtonText(categoryModalT(this.plugin, 'common.cancel')).onClick(() => this.close()));
  }

  renderList(listEl) {
    listEl.empty();
    let paths = [];
    try { paths = this.plugin.listVaultFolderPaths(); }
    catch (error) {
      listEl.createEl('p', { cls: 'pdfium-category-validation-error', text: categoryModalT(this.plugin, 'category.folderPicker.readFailed', { error:error instanceof Error ? error.message : String(error) }) });
      return;
    }
    const q = this.query.trim().toLocaleLowerCase();
    const filtered = paths.filter(path => !q || (path || '/').toLocaleLowerCase().includes(q));
    if (!filtered.length) {
      listEl.createEl('p', { cls: 'setting-item-description', text: categoryModalT(this.plugin, 'category.folderPicker.noMatches') });
      return;
    }
    for (const path of filtered) {
      const row = listEl.createDiv({ cls: 'pdfium-category-folder-row' });
      const depth = path ? path.split('/').length : 0;
      row.style.paddingInlineStart = `${10 + Math.min(depth, 8) * 14}px`;
      const label = row.createDiv({ cls: 'pdfium-category-folder-label' });
      label.createSpan({ text: path ? '📁 ' : '⌂ ' });
      label.createSpan({ text: path || categoryModalT(this.plugin, 'common.vaultRoot') });
      if (path === this.currentFolder) label.createSpan({ cls: 'pdfium-category-folder-current', text: `  ·  ${categoryModalT(this.plugin, 'category.folderPicker.selected')}` });
      row.addEventListener('click', () => {
        const chosen = path;
        this.close();
        if (typeof this.onChoose === 'function') this.onChoose(chosen);
      });
    }
  }

  onClose() { this.contentEl.empty(); }
}

class CategoryConfigModal extends Modal {
  constructor(app, plugin, file, model, folderOverride = null) {
    super(app);
    this.plugin = plugin;
    this.file = file instanceof TFile ? file : null;
    this.folder = folderOverride !== null ? String(folderOverride || '') : vaultDirname(this.file?.path || '');
    this.page = 'main';
    this.selectedLocalIndex = null;
    this.selectedInheritedId = null;
    this.loadModel(model);
  }

  loadModel(model) {
    this.model = model;
    this.localConfig = deepClone(model.localConfig || { version: 1, inherit: true, categories: [] });
    if (!Array.isArray(this.localConfig.categories)) this.localConfig.categories = [];
    if (this.localConfig.inherit === undefined) this.localConfig.inherit = true;
    this.originalLocalConfig = deepClone(this.localConfig);
  }

  onOpen() { this.render(); }

  isDirty() { return JSON.stringify(this.localConfig) !== JSON.stringify(this.originalLocalConfig); }

  inheritedCategories() {
    return Array.isArray(this.model.parentEffective?.categories)
      ? this.model.parentEffective.categories.filter(c => c.enabled !== false)
      : [];
  }

  inheritedCategorySource(catOrId) {
    const id = String(typeof catOrId === 'object' ? catOrId?.id : catOrId || '').trim();
    return id ? (this.model.inheritedCategorySources?.[id] || null) : null;
  }

  inheritedSourceSummary() {
    const labels = [];
    const seen = new Set();
    for (const cat of this.inheritedCategories()) {
      const source = this.inheritedCategorySource(cat);
      const label = String(source?.sourceLabel || '').trim();
      if (label && !seen.has(label)) { seen.add(label); labels.push(label); }
    }
    if (!labels.length) return this.model.parentSourceLabel || categoryModalT(this.plugin, 'category.source.noParentOwner');
    if (labels.length <= 2) return labels.join(' · ');
    return categoryModalT(this.plugin, 'category.source.levelCount', { count:labels.length });
  }

  localDisplay(cat) {
    const parentCat = this.inheritedCategories().find(c => c.id === cat.id) || null;
    return {
      parentCat,
      name: cat.name !== undefined ? String(cat.name) : String(parentCat?.name || ''),
      color: cat.color !== undefined ? String(cat.color) : String(parentCat?.color || '#FFD84D'),
      shortcut: cat.shortcut !== undefined ? cat.shortcut : (parentCat?.shortcut || null),
      enabled: cat.enabled !== undefined ? cat.enabled !== false : parentCat?.enabled !== false
    };
  }

  validation() { return this.plugin.analyzeLocalCategoryConfig(this.localConfig, this.folder); }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('pdfium-category-editor');
    if (this.page === 'category') return this.renderCategoryPage();
    if (this.page === 'advanced') return this.renderAdvancedPage();
    if (this.page === 'inherited') return this.renderInheritedPage();
    if (this.page === 'inherited-detail') return this.renderInheritedDetailPage();
    return this.renderMainPage();
  }

  addBackHeader(title, target = 'main') {
    const header = this.contentEl.createDiv({ cls: 'pdfium-category-page-header' });
    const back = header.createEl('button', { text: categoryModalT(this.plugin, 'common.back'), cls: 'mod-muted' });
    back.addEventListener('click', () => { this.page = target; this.render(); });
    header.createEl('h2', { text: title });
  }

  renderMainPage() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: categoryModalT(this.plugin, 'category.editor.title', { version:PLUGIN_VERSION }) });

    new Setting(contentEl)
      .setName(categoryModalT(this.plugin, 'category.editor.folder'))
      .setDesc(this.folder || categoryModalT(this.plugin, 'common.vaultRoot'))
      .addButton(b => b.setButtonText(categoryModalT(this.plugin, 'category.editor.chooseFolder')).onClick(() => this.chooseFolder()));
    contentEl.createEl('p', { cls: 'setting-item-description pdfium-category-config-path', text: categoryModalT(this.plugin, 'category.editor.localFile', { path:this.model.localConfigPath }) });

    if (this.folder) {
      new Setting(contentEl)
        .setName(categoryModalT(this.plugin, 'category.editor.inherit.name'))
        .setDesc(categoryModalT(this.plugin, 'category.editor.inherit.description'))
        .addToggle(t => t.setValue(this.localConfig.inherit !== false).onChange(v => { this.localConfig.inherit = !!v; this.render(); }));
    } else {
      this.localConfig.inherit = false;
      contentEl.createEl('p', { cls: 'setting-item-description', text: categoryModalT(this.plugin, 'category.editor.rootNoInheritance') });
    }

    const validation = this.validation();
    if (validation.activeCount >= 13) {
      contentEl.createDiv({ cls: 'pdfium-category-warning', text: categoryModalT(this.plugin, 'category.editor.manyActive', { count:validation.activeCount }) });
    }
    if (!validation.ok) {
      const box = contentEl.createDiv({ cls: 'pdfium-category-validation-summary' });
      box.createDiv({ cls: 'pdfium-category-validation-title', text: categoryModalT(this.plugin, 'category.editor.mustFix') });
      for (const error of validation.errors.slice(0, 5)) box.createDiv({ text: `• ${error.message}` });
      if (validation.errors.length > 5) box.createDiv({ text: categoryModalT(this.plugin, 'category.editor.moreErrors', { count:validation.errors.length - 5 }) });
    }

    const heading = contentEl.createDiv({ cls: 'pdfium-category-section-heading' });
    heading.createEl('h3', { text: categoryModalT(this.plugin, this.folder ? 'category.editor.localCategories' : 'category.editor.globalCategories') });
    const headingActions = heading.createDiv({ cls: 'pdfium-category-section-actions' });
    headingActions.createSpan({ cls: 'setting-item-description', text: categoryModalT(this.plugin, 'category.editor.counts', { local:this.localConfig.categories.length, total:validation.totalCount }) });
    const addLocalButton = headingActions.createEl('button', { cls: 'pdfium-category-inline-action', text: `+ ${categoryModalT(this.plugin, this.folder ? 'category.editor.addLocal' : 'category.editor.addGlobal')}` });
    addLocalButton.disabled = validation.totalCount >= 35;
    addLocalButton.addEventListener('click', () => this.addCategory());

    if (!this.localConfig.categories.length) {
      contentEl.createEl('p', { cls: 'setting-item-description', text: categoryModalT(this.plugin, this.folder ? 'category.editor.emptyLocal' : 'category.editor.emptyGlobal') });
    }

    this.localConfig.categories.forEach((cat, index) => {
      const display = this.localDisplay(cat);
      const fieldErrors = validation.errors.filter(e => e.localIndex === index);
      const row = contentEl.createDiv({ cls: `pdfium-category-compact-row${fieldErrors.length ? ' has-error' : ''}` });
      const swatch = row.createSpan({ cls: 'pdfium-category-swatch' });
      swatch.style.backgroundColor = normalizeHexColor(display.color);
      const textWrap = row.createDiv({ cls: 'pdfium-category-compact-text' });
      textWrap.createDiv({ cls: 'pdfium-category-compact-name', text: display.name.trim() || categoryModalT(this.plugin, 'category.editor.nameMissing') });
      const meta = [];
      if (display.shortcut) meta.push(`Ctrl+Alt+${display.shortcut}`);
      if (display.enabled === false) meta.push(categoryModalT(this.plugin, 'category.editor.disabled'));
      if (display.parentCat) meta.push(categoryModalT(this.plugin, 'category.editor.localOverride'));
      textWrap.createDiv({ cls: 'setting-item-description', text: meta.join(' · ') || categoryModalT(this.plugin, 'category.editor.localCategory') });
      row.createSpan({ cls: 'pdfium-category-chevron', text: fieldErrors.length ? '!  ›' : '›' });
      row.addEventListener('click', () => { this.selectedLocalIndex = index; this.page = 'category'; this.render(); });
    });

    if (this.localConfig.inherit !== false) {
      const inherited = this.inheritedCategories();
      const inheritedRow = contentEl.createDiv({ cls: 'pdfium-category-nav-row' });
      const textWrap = inheritedRow.createDiv({ cls: 'pdfium-category-compact-text' });
      textWrap.createDiv({ cls: 'pdfium-category-compact-name', text: categoryModalT(this.plugin, 'category.editor.inheritedCategories', { count:inherited.length }) });
      textWrap.createDiv({ cls: 'setting-item-description', text: categoryModalT(this.plugin, 'category.source.from', { source:this.inheritedSourceSummary() }) });
      inheritedRow.createSpan({ cls: 'pdfium-category-chevron', text: '›' });
      inheritedRow.addEventListener('click', () => { this.page = 'inherited'; this.render(); });
    }

    const actions = new Setting(contentEl);
    actions.addButton(b => b.setButtonText(`+ ${categoryModalT(this.plugin, this.folder ? 'category.editor.addLocal' : 'category.editor.addGlobal')}`).setDisabled(validation.totalCount >= 35).onClick(() => this.addCategory()));
    actions.addButton(b => b.setButtonText(categoryModalT(this.plugin, 'common.save')).setCta().setDisabled(!validation.ok).onClick(() => void this.save()));
    actions.addButton(b => b.setButtonText(categoryModalT(this.plugin, 'common.cancel')).onClick(() => this.close()));

    if (validation.totalCount >= 35) {
      contentEl.createEl('p', { cls: 'setting-item-description', text: categoryModalT(this.plugin, 'category.editor.maxReached') });
    }
    contentEl.createEl('p', { cls: 'setting-item-description', text: categoryModalT(this.plugin, 'category.editor.backup') });
  }

  renderCategoryPage() {
    const index = Number(this.selectedLocalIndex);
    const cat = this.localConfig.categories[index];
    if (!cat) { this.page = 'main'; return this.render(); }
    const display = this.localDisplay(cat);
    this.addBackHeader(display.name.trim() || categoryModalT(this.plugin, 'category.field.title'));

    const validation = this.validation();
    const errors = field => validation.errors.filter(e => e.localIndex === index && e.field === field).map(e => e.message);

    const nameSetting = new Setting(this.contentEl).setName(categoryModalT(this.plugin, 'category.field.name')).setDesc(categoryModalT(this.plugin, 'category.field.nameDesc'));
    nameSetting.addText(t => t.setValue(display.name).onChange(v => { cat.name = String(v); }));
    this.renderFieldErrors(nameSetting.settingEl, errors('name'));

    const colorSetting = new Setting(this.contentEl).setName(categoryModalT(this.plugin, 'category.field.color')).setDesc(display.parentCat && cat.color === undefined ? categoryModalT(this.plugin, 'category.field.inheritedValue', { value:normalizeHexColor(display.parentCat.color) }) : categoryModalT(this.plugin, 'category.field.colorDesc'));
    const colorInput = this.contentEl.ownerDocument.createElement('input');
    colorInput.type = 'color';
    colorInput.value = normalizeHexColor(display.color);
    colorInput.addEventListener('input', () => { cat.color = normalizeHexColor(colorInput.value); });
    colorSetting.controlEl.appendChild(colorInput);
    this.renderFieldErrors(colorSetting.settingEl, errors('color'));

    const shortcutSetting = new Setting(this.contentEl).setName(categoryModalT(this.plugin, 'category.field.shortcut')).setDesc(categoryModalT(this.plugin, 'category.field.shortcutDesc'));
    shortcutSetting.addDropdown(d => {
      d.addOption('0', categoryModalT(this.plugin, 'common.none'));
      for (let i = 1; i <= 5; i += 1) d.addOption(String(i), `Ctrl+Alt+${i}`);
      d.setValue(display.shortcut ? String(display.shortcut) : '0').onChange(v => { cat.shortcut = Number(v) || null; });
    });
    this.renderFieldErrors(shortcutSetting.settingEl, errors('shortcut'));

    new Setting(this.contentEl).setName(categoryModalT(this.plugin, 'common.active')).setDesc(categoryModalT(this.plugin, 'category.field.activeDesc')).addToggle(t => t.setValue(display.enabled !== false).onChange(v => { cat.enabled = !!v; }));

    const createLabel = categoryModalT(this.plugin, this.folder ? 'category.editor.addLocal' : 'category.editor.addGlobal');
    new Setting(this.contentEl)
      .setName(createLabel)
      .setDesc(categoryModalT(this.plugin, this.folder ? 'category.field.createLocalDesc' : 'category.field.createGlobalDesc'))
      .addButton(b => b.setButtonText(`+ ${createLabel}`).setDisabled(validation.totalCount >= 35).onClick(() => this.addCategory()));

    const advanced = this.contentEl.createDiv({ cls: 'pdfium-category-nav-row' });
    const advancedText = advanced.createDiv({ cls: 'pdfium-category-compact-text' });
    advancedText.createDiv({ cls: 'pdfium-category-compact-name', text: categoryModalT(this.plugin, 'common.advanced') });
    advancedText.createDiv({ cls: 'setting-item-description', text: categoryModalT(this.plugin, 'category.field.advancedDesc') });
    advanced.createSpan({ cls: 'pdfium-category-chevron', text: '›' });
    advanced.addEventListener('click', () => { this.page = 'advanced'; this.render(); });
  }

  renderAdvancedPage() {
    const index = Number(this.selectedLocalIndex);
    const cat = this.localConfig.categories[index];
    if (!cat) { this.page = 'main'; return this.render(); }
    this.addBackHeader(categoryModalT(this.plugin, 'common.advanced'), 'category');
    const validation = this.validation();
    const idErrors = validation.errors.filter(e => e.localIndex === index && e.field === 'id').map(e => e.message);
    const idSetting = new Setting(this.contentEl).setName(categoryModalT(this.plugin, 'category.advanced.id')).setDesc(categoryModalT(this.plugin, 'category.advanced.idDesc'));
    idSetting.addText(t => {
      t.setValue(String(cat.id || ''));
      t.inputEl.readOnly = true;
      t.inputEl.setAttribute('aria-readonly', 'true');
    });
    idSetting.addButton(b => b.setButtonText(categoryModalT(this.plugin, 'category.advanced.copyId')).onClick(() => {
      const id = String(cat.id || '');
      try { electronClipboard.writeText(id); new Notice(categoryModalT(this.plugin, 'category.advanced.idCopied'), 3000); }
      catch (_) { new Notice(categoryModalT(this.plugin, 'category.advanced.idCopyFailed'), 5000); }
    }));
    this.renderFieldErrors(idSetting.settingEl, idErrors);

    new Setting(this.contentEl)
      .setName(categoryModalT(this.plugin, 'category.advanced.deleteLocal'))
      .setDesc(categoryModalT(this.plugin, 'category.advanced.deleteLocalDesc'))
      .addButton(b => b.setButtonText(categoryModalT(this.plugin, 'common.delete')).setWarning().onClick(() => {
        this.localConfig.categories.splice(index, 1);
        this.selectedLocalIndex = null;
        this.page = 'main';
        this.render();
      }));
  }

  renderInheritedPage() {
    this.addBackHeader(categoryModalT(this.plugin, 'category.inherited.title'));
    this.contentEl.createEl('p', { cls: 'setting-item-description', text: categoryModalT(this.plugin, 'category.source.inheritedFrom', { source:this.inheritedSourceSummary() }) });
    const inherited = this.inheritedCategories();
    if (!inherited.length) this.contentEl.createEl('p', { cls: 'setting-item-description', text: categoryModalT(this.plugin, 'category.inherited.none') });
    for (const cat of inherited) {
      const local = this.localConfig.categories.find(c => c.id === cat.id) || null;
      const row = this.contentEl.createDiv({ cls: 'pdfium-category-compact-row' });
      const swatch = row.createSpan({ cls: 'pdfium-category-swatch' });
      swatch.style.backgroundColor = normalizeHexColor(cat.color);
      const textWrap = row.createDiv({ cls: 'pdfium-category-compact-text' });
      textWrap.createDiv({ cls: 'pdfium-category-compact-name', text: categoryLabel(cat) });
      const meta = [];
      if (cat.shortcut) meta.push(`Ctrl+Alt+${cat.shortcut}`);
      const source = this.inheritedCategorySource(cat);
      if (source?.sourceLabel) meta.push(categoryModalT(this.plugin, 'category.source.fromLower', { source:source.sourceLabel }));
      if (local) meta.push(categoryModalT(this.plugin, local.enabled === false ? 'category.inherited.locallyDisabled' : 'category.inherited.locallyOverridden'));
      textWrap.createDiv({ cls: 'setting-item-description', text: meta.join(' · ') || categoryModalT(this.plugin, 'category.inherited.item') });
      if (source?.editable) {
        const ownerButton = row.createEl('button', {
          cls: 'pdfium-category-inline-action',
          text: categoryModalT(this.plugin, 'category.inherited.editParent')
        });
        ownerButton.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          void this.editInheritedCategoryAtOwner(cat);
        });
      }
      row.createSpan({ cls: 'pdfium-category-chevron', text: '›' });
      row.addEventListener('click', () => { this.selectedInheritedId = cat.id; this.page = 'inherited-detail'; this.render(); });
    }
  }

  renderInheritedDetailPage() {
    const cat = this.inheritedCategories().find(c => c.id === this.selectedInheritedId) || null;
    if (!cat) { this.page = 'inherited'; return this.render(); }
    this.addBackHeader(categoryLabel(cat), 'inherited');
    const summary = this.contentEl.createDiv({ cls: 'pdfium-category-inherited-summary' });
    const swatch = summary.createSpan({ cls: 'pdfium-category-swatch' });
    swatch.style.backgroundColor = normalizeHexColor(cat.color);
    summary.createSpan({ text: `${categoryLabel(cat)}${cat.shortcut ? ` · Ctrl+Alt+${cat.shortcut}` : ''}` });
    const source = this.inheritedCategorySource(cat);
    this.contentEl.createEl('p', { cls: 'setting-item-description', text: `${categoryModalT(this.plugin, 'category.source.inheritedFromOne', { source:source?.sourceLabel || this.model.parentSourceLabel || categoryModalT(this.plugin, 'category.source.unknownParent') })}${source?.configPath ? ` — ${source.configPath}` : ''}` });

    if (source?.editable) {
      new Setting(this.contentEl)
        .setName(categoryModalT(this.plugin, 'category.inherited.editParentName'))
        .setDesc(categoryModalT(this.plugin, 'category.inherited.editParentDesc', { source:source.sourceLabel || source.folder || categoryModalT(this.plugin, 'common.vaultRoot') }))
        .addButton(b => b.setButtonText(categoryModalT(this.plugin, 'category.inherited.editParent')).onClick(() => void this.editInheritedCategoryAtOwner(cat)));
    }

    const localIndex = this.localConfig.categories.findIndex(c => c.id === cat.id);
    if (localIndex >= 0 && this.localConfig.categories[localIndex].enabled !== false) {
      new Setting(this.contentEl).setName(categoryModalT(this.plugin, 'category.inherited.localOverrideExists')).setDesc(categoryModalT(this.plugin, 'category.inherited.localOverrideExistsDesc')).addButton(b => b.setButtonText(categoryModalT(this.plugin, 'category.inherited.editLocal')).onClick(() => {
        this.selectedLocalIndex = localIndex; this.page = 'category'; this.render();
      }));
    } else {
      new Setting(this.contentEl).setName(categoryModalT(this.plugin, 'category.inherited.overrideHere')).setDesc(categoryModalT(this.plugin, 'category.inherited.overrideHereDesc')).addButton(b => b.setButtonText(categoryModalT(this.plugin, 'category.inherited.overrideLocal')).onClick(() => {
        if (localIndex >= 0) this.localConfig.categories[localIndex] = deepClone(cat);
        else this.localConfig.categories.push(deepClone(cat));
        this.selectedLocalIndex = this.localConfig.categories.findIndex(c => c.id === cat.id);
        this.page = 'category'; this.render();
      }));
    }

    new Setting(this.contentEl).setName(categoryModalT(this.plugin, 'category.inherited.disableHere')).setDesc(categoryModalT(this.plugin, 'category.inherited.disableHereDesc')).addButton(b => b.setButtonText(categoryModalT(this.plugin, 'category.inherited.disableLocal')).setWarning().onClick(() => {
      const existing = this.localConfig.categories.find(c => c.id === cat.id);
      if (existing) existing.enabled = false;
      else this.localConfig.categories.push({ id: cat.id, enabled: false });
      this.page = 'inherited';
      this.render();
    }));
  }

  renderFieldErrors(settingEl, messages) {
    for (const message of messages || []) settingEl.createDiv({ cls: 'pdfium-category-validation-error', text: message });
  }

  addCategory() {
    const validation = this.validation();
    if (validation.totalCount >= 35) {
      new Notice(categoryModalT(this.plugin, 'category.notice.max35'), 8000);
      return;
    }
    let n = 1;
    const existingNames = new Set((validation.effective?.categories || []).map(c => String(c?.name || '').trim().toLocaleLowerCase()));
    while (existingNames.has(categoryModalT(this.plugin, 'category.new.defaultName', { number:n }).toLocaleLowerCase())) n += 1;
    let id = categoryUuidV4();
    const effectiveIds = new Set((validation.effective?.categories || []).map(c => String(c.id || '')));
    while (effectiveIds.has(id)) id = categoryUuidV4();
    this.localConfig.categories.push({ id, name: categoryModalT(this.plugin, 'category.new.defaultName', { number:n }), color: '#FFD84D', shortcut: null, enabled: true });
    this.selectedLocalIndex = this.localConfig.categories.length - 1;
    this.page = 'category';
    this.render();
  }


  async editInheritedCategoryAtOwner(cat) {
    const id = String(cat?.id || '').trim();
    if (!id) return;
    const source = this.inheritedCategorySource(cat);
    if (!source?.editable) {
      new Notice(categoryModalT(this.plugin, 'category.notice.noEditableParent'), 8000);
      return;
    }
    this.switchEditorFolder(source.folder, { categoryId: id });
  }

  switchEditorFolder(chosen, options = {}) {
    const switchNow = () => {
      try {
        const model = this.plugin.getCategoryEditorModelForFolder(chosen);
        this.folder = String(chosen || '');
        this.page = 'main';
        this.selectedLocalIndex = null;
        this.selectedInheritedId = null;
        this.loadModel(model);
        const categoryId = String(options.categoryId || '').trim();
        if (categoryId) {
          const localIndex = this.localConfig.categories.findIndex(c => String(c?.id || '').trim() === categoryId);
          if (localIndex >= 0) {
            this.selectedLocalIndex = localIndex;
            this.page = 'category';
          } else {
            new Notice(categoryModalT(this.plugin, 'category.notice.missingAtLevel', { id:categoryId }), 10000);
          }
        }
        this.render();
      } catch (error) {
        new Notice(categoryModalT(this.plugin, 'category.notice.openFolderFailed', { error:error instanceof Error ? error.message : String(error) }), 12000);
      }
    };
    if (options.skipDirtyConfirm || !this.isDirty()) return switchNow();
    const win = this.contentEl?.win || this.contentEl?.ownerDocument?.defaultView || window;
    if (win.confirm(categoryModalT(this.plugin, 'category.confirm.discardDirty'))) switchNow();
  }

  chooseFolder() {
    new CategoryFolderPickerModal(this.app, this.plugin, this.folder, chosen => this.switchEditorFolder(chosen)).open();
  }

  async save() {
    const validation = this.validation();
    if (!validation.ok) {
      new Notice(categoryModalT(this.plugin, 'category.notice.cannotSave', { error:validation.errors[0]?.message || categoryModalT(this.plugin, 'category.notice.invalidConfig') }), 10000);
      this.render();
      return;
    }
    try {
      const result = await this.plugin.saveFolderCategoryConfig(this.folder, this.localConfig);
      new Notice(categoryModalT(this.plugin, 'category.notice.saved', { version:PLUGIN_VERSION, backup:result.backupPath ? ` — backup: ${result.backupPath}` : '' }), 10000);
      this.originalLocalConfig = deepClone(this.localConfig);
      this.close();
    } catch (error) {
      new Notice(categoryModalT(this.plugin, 'category.notice.saveFailed', { error:error instanceof Error ? error.message : String(error) }), 15000);
    }
  }
}
