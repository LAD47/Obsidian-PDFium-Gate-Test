'use strict';

function categoryFeatureT(owner, key, params = {}) { return owner?.i18n?.t?.(key, params) || key; }

class CategoryConfigFeature {
  getVaultBasePath() {
    return this.obsidianVaultReadAdapter.getBasePath();
  }

  vaultPathToFs(vaultPath) {
    const base = this.getVaultBasePath();
    const parts = String(vaultPath || '').replace(/\\/g, '/').split('/').filter(Boolean);
    return path.join(base, ...parts);
  }


  createCategoryConfigFileStore() {
    return Object.freeze({
      exists: async vaultPath => this.nodeFilesystemAdapter.exists(this.vaultPathToFs(vaultPath)),
      readText: async vaultPath => this.nodeFilesystemAdapter.readText(this.vaultPathToFs(vaultPath), 'utf8'),
      writeText: async (vaultPath, data) => { this.nodeFilesystemAdapter.writeText(this.vaultPathToFs(vaultPath), String(data), 'utf8'); return { path:vaultPath }; },
      ensureFolder: async vaultPath => { this.nodeFilesystemAdapter.ensureDir(this.vaultPathToFs(vaultPath)); return { path:vaultPath }; },
      copyFile: async (fromPath, toPath) => { this.nodeFilesystemAdapter.copyFile(this.vaultPathToFs(fromPath), this.vaultPathToFs(toPath)); return { from:fromPath, path:toPath }; },
      rename: async (fromPath, toPath) => { this.nodeFilesystemAdapter.rename(this.vaultPathToFs(fromPath), this.vaultPathToFs(toPath)); return { from:fromPath, path:toPath }; },
      removeFile: async vaultPath => { const fsPath=this.vaultPathToFs(vaultPath); if(this.nodeFilesystemAdapter.exists(fsPath)) this.nodeFilesystemAdapter.removeFile(fsPath); return { path:vaultPath }; }
    });
  }

  configPathForFolder(folder) {
    return vaultJoin(folder, PDF_METADATA_ROOT, HIGHLIGHT_CATEGORIES_FILE_NAME);
  }

  configBackupDirForFolder(folder) {
    return vaultJoin(folder, PDF_METADATA_BACKUP_ROOT, HIGHLIGHT_CATEGORIES_BACKUP_SCOPE);
  }

  readFolderCategoryConfig(folder) {
    const configPath = this.configPathForFolder(folder);
    const fsPath = this.vaultPathToFs(configPath);
    if (!this.nodeFilesystemAdapter.exists(fsPath)) return { exists: false, configPath, fsPath, config: null };
    const text = this.nodeFilesystemAdapter.readText(fsPath, 'utf8');
    let parsed;
    try { parsed = parseYaml(text); }
    catch (e) { throw new Error(categoryFeatureT(this, 'category.validation.invalidYaml', { path:configPath, error:e instanceof Error ? e.message : String(e) })); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(categoryFeatureT(this, 'category.validation.rootObject', { path:configPath }));
    const config = deepClone(parsed);
    if (config.inherit === undefined) config.inherit = true;
    if (config.categories === undefined) config.categories = [];
    if (!Array.isArray(config.categories)) throw new Error(categoryFeatureT(this, 'category.validation.categoriesList', { path:configPath }));
    for (let i = 0; i < config.categories.length; i++) {
      const c = config.categories[i];
      if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error(categoryFeatureT(this, 'category.validation.categoryObject', { path:configPath, index:i }));
    }
    return { exists: true, configPath, fsPath, config, text };
  }

  mergeCategoryConfig(base, local) {
    const out = deepClone(base || { version: 1, inherit: true, categories: [] });
    if (!Array.isArray(out.categories)) out.categories = [];
    const byId = new Map(out.categories.map((c, i) => [String(c.id || ''), i]));
    const locals = Array.isArray(local?.categories) ? local.categories : [];
    for (const raw of locals) {
      if (!raw || typeof raw !== 'object') continue;
      const id = String(raw.id || '').trim();
      if (!id) continue;
      if (byId.has(id)) {
        const index = byId.get(id);
        out.categories[index] = { ...out.categories[index], ...deepClone(raw), id };
      } else {
        byId.set(id, out.categories.length);
        out.categories.push({ id, ...deepClone(raw) });
      }
    }
    for (const [key, value] of Object.entries(local || {})) {
      if (key === 'categories' || key === 'inherit') continue;
      if (value !== undefined) out[key] = deepClone(value);
    }
    out.inherit = local?.inherit !== false;
    return out;
  }

  validateEffectiveCategories(categories, context = null) {
    const t=(key,params)=>categoryFeatureT(this,key,params);
    const contextLabel=String(context || t('category.validation.context'));
    const list = Array.isArray(categories) ? categories : [];
    if (list.length > 35) throw new Error(t('category.validation.max',{context:contextLabel,count:list.length}));
    const ids = new Set();
    const slots = new Map();
    const activeNames = new Map();
    for (const c of list) {
      const id = String(c?.id || '').trim();
      if (!id) throw new Error(t('category.validation.missingId',{context:contextLabel}));
      if (!categoryIsUuidV4(id)) throw new Error(t('category.validation.invalidId',{context:contextLabel,id}));
      if (ids.has(id)) throw new Error(t('category.validation.duplicateId',{context:contextLabel,id}));
      ids.add(id);
      const name = String(c?.name || '').trim();
      if (!name) throw new Error(t('category.validation.missingName',{context:contextLabel,id}));
      const color = String(c?.color || '').trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error(t('category.validation.invalidColor',{context:contextLabel,name:name||id}));
      if (c.enabled !== false) {
        const nameKey = name.toLocaleLowerCase();
        if (activeNames.has(nameKey)) throw new Error(t('category.validation.duplicateActiveName',{context:contextLabel,name,first:activeNames.get(nameKey),second:id}));
        activeNames.set(nameKey, id);
      }
      if (c.shortcut !== undefined && c.shortcut !== null && c.shortcut !== '') {
        const slot = Number(c.shortcut);
        if (!Number.isInteger(slot) || slot < 1 || slot > 5) throw new Error(t('category.validation.shortcutRange',{context:contextLabel,id}));
        if (c.enabled !== false && slots.has(slot)) throw new Error(t('category.validation.duplicateShortcut',{context:contextLabel,slot,first:slots.get(slot),second:id}));
        if (c.enabled !== false) slots.set(slot, id);
      }
    }
  }

  analyzeLocalCategoryConfig(config, folder) {
    const out = deepClone(config || {});
    out.version = 1;
    out.inherit = out.inherit !== false;
    if (!Array.isArray(out.categories)) out.categories = [];
    const errors = [];
    const localIdFirstIndex = new Map();
    const localIndexById = new Map();
    const localSlots = new Map();
    for (let index = 0; index < out.categories.length; index += 1) {
      const c = out.categories[index];
      if (!c || typeof c !== 'object' || Array.isArray(c)) {
        errors.push({ localIndex:index, field:'category', message:categoryFeatureT(this,'category.validation.localInvalidFormat',{number:index+1}) });
        continue;
      }
      const id = String(c.id || '').trim();
      if (!id) errors.push({ localIndex:index, field:'id', message:categoryFeatureT(this,'category.validation.localMissingId',{number:index+1}) });
      else if (!categoryIsUuidV4(id)) errors.push({ localIndex:index, field:'id', message:categoryFeatureT(this,'category.validation.localInvalidId',{id}) });
      else if (localIdFirstIndex.has(id)) errors.push({ localIndex:index, field:'id', message:categoryFeatureT(this,'category.validation.localDuplicateId',{id}) });
      else {
        localIdFirstIndex.set(id, index);
        localIndexById.set(id, index);
      }
      c.id = id;
      if (c.name !== undefined && !String(c.name).trim()) errors.push({ localIndex:index, field:'name', message:categoryFeatureT(this,'category.validation.nameRequired') });
      if (c.color !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(String(c.color).trim())) errors.push({ localIndex:index, field:'color', message:categoryFeatureT(this,'category.validation.colorRequired') });
      if (c.shortcut !== undefined && c.shortcut !== null && c.shortcut !== '') {
        const slot = Number(c.shortcut);
        if (!Number.isInteger(slot) || slot < 1 || slot > 5) errors.push({ localIndex:index, field:'shortcut', message:categoryFeatureT(this,'category.validation.shortcutRequired') });
        else {
          c.shortcut = slot;
          if (c.enabled !== false && localSlots.has(slot)) errors.push({ localIndex:index, field:'shortcut', message:categoryFeatureT(this,'category.validation.localShortcutDuplicate',{slot}) });
          if (c.enabled !== false) localSlots.set(slot, id || `#${index + 1}`);
        }
      } else delete c.shortcut;
      if (c.enabled === undefined) c.enabled = true;
    }

    let effective = { version:1, inherit:false, categories:[] };
    try {
      const base = out.inherit ? this.getParentEffectiveForFolder(folder, true) : { version:1, inherit:false, categories:[] };
      effective = this.mergeCategoryConfig(base, out);
    } catch (error) {
      errors.push({ localIndex:null, field:'inherit', message:categoryFeatureT(this,'category.validation.inheritedReadFailed',{error:error instanceof Error ? error.message : String(error)}) });
    }
    const effectiveList = Array.isArray(effective.categories) ? effective.categories : [];
    if (effectiveList.length > 35) errors.push({ localIndex:null, field:'count', message:categoryFeatureT(this,'category.validation.effectiveMax',{count:effectiveList.length}) });

    const ids = new Set();
    const activeNames = new Map();
    const slots = new Map();
    for (const c of effectiveList) {
      const id = String(c?.id || '').trim();
      const localIndex = localIndexById.has(id) ? localIndexById.get(id) : null;
      if (!id) { errors.push({ localIndex, field:'id', message:categoryFeatureT(this,'category.validation.effectiveMissingId') }); continue; }
      if (!categoryIsUuidV4(id)) errors.push({ localIndex, field:'id', message:categoryFeatureT(this,'category.validation.effectiveInvalidId',{id}) });
      if (ids.has(id)) errors.push({ localIndex, field:'id', message:categoryFeatureT(this,'category.validation.effectiveDuplicateId',{id}) });
      ids.add(id);
      const name = String(c?.name || '').trim();
      if (!name) errors.push({ localIndex, field:'name', message:categoryFeatureT(this,'category.validation.effectiveMissingName',{id}) });
      const color = String(c?.color || '').trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(color)) errors.push({ localIndex, field:'color', message:categoryFeatureT(this,'category.validation.effectiveInvalidColor',{name:name||id}) });
      if (c.enabled !== false && name) {
        const nameKey = name.toLocaleLowerCase();
        if (activeNames.has(nameKey)) {
          const previous = activeNames.get(nameKey);
          errors.push({ localIndex, field:'name', message:categoryFeatureT(this,'category.validation.nameAlreadyUsed',{name,previous:previous.name}) });
        } else activeNames.set(nameKey, { id, name });
      }
      if (c.shortcut !== undefined && c.shortcut !== null && c.shortcut !== '') {
        const slot = Number(c.shortcut);
        if (!Number.isInteger(slot) || slot < 1 || slot > 5) errors.push({ localIndex, field:'shortcut', message:categoryFeatureT(this,'category.validation.effectiveShortcutRange',{name:name||id}) });
        else if (c.enabled !== false) {
          if (slots.has(slot)) errors.push({ localIndex, field:'shortcut', message:categoryFeatureT(this,'category.validation.effectiveShortcutDuplicate',{slot,name:slots.get(slot).name}) });
          else slots.set(slot, { id, name:name || id });
        }
      }
    }

    const seen = new Set();
    const uniqueErrors = [];
    for (const error of errors) {
      const key = `${error.localIndex ?? 'g'}|${error.field}|${error.message}`;
      if (!seen.has(key)) { seen.add(key); uniqueErrors.push(error); }
    }
    return {
      ok: uniqueErrors.length === 0,
      errors: uniqueErrors,
      normalized: out,
      effective,
      totalCount: effectiveList.length,
      activeCount: effectiveList.filter(c => c?.enabled !== false).length
    };
  }

  resolveCategoryConfigForFolder(folder) {
    let current = String(folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const chainLeafFirst = [];
    let stopped = false;
    while (true) {
      const read = this.readFolderCategoryConfig(current);
      if (read.exists) {
        chainLeafFirst.push({ folder: current, ...read });
        if (read.config.inherit === false) { stopped = true; break; }
      }
      if (!current) break;
      current = vaultDirname(current);
    }

    const rootOwner = chainLeafFirst.find(item => String(item?.folder || '') === '');
    if (!stopped && !rootOwner) {
      throw new Error(categoryFeatureT(this,'category.validation.rootMissing',{path:this.configPathForFolder('')}));
    }

    let effective = stopped
      ? { version: 1, inherit: false, categories: [], opacity: DEFAULT_HIGHLIGHT_OPACITY }
      : { version: 1, inherit: true, categories: [], opacity: DEFAULT_HIGHLIGHT_OPACITY };
    const sources = [];
    for (const item of chainLeafFirst.slice().reverse()) {
      effective = this.mergeCategoryConfig(effective, item.config);
      sources.push({ folder: item.folder, configPath: item.configPath, inherit: item.config.inherit !== false });
    }
    effective.categories = (effective.categories || []).map(c => ({ enabled: true, ...c }));
    this.validateEffectiveCategories(effective.categories, categoryFeatureT(this,'category.validation.effectiveContext',{folder:folder||'/'}));
    effective.categories = effective.categories.map(c => ({ ...c, color: normalizeHexColor(c.color) }));
    return { folder, effective, sources, stopped, chainLeafFirst };
  }

  resolveCategoryConfigForPdf(file) {
    const folder = vaultDirname(file.path);
    const info = this.resolveCategoryConfigForFolder(folder);
    info.file = file.path;
    this.state.context.lastEffectiveCategoryConfig = deepClone({ file: file.path, folder, effective: info.effective, sources: info.sources });
    return info;
  }

  getShortcutCategory(file, slot) {
    const info = this.resolveCategoryConfigForPdf(file);
    return (info.effective.categories || []).find(c => c.enabled !== false && Number(c.shortcut) === Number(slot)) || null;
  }

  getVisibleCategories(file) {
    const info = this.resolveCategoryConfigForPdf(file);
    return (info.effective.categories || []).filter(c => c.enabled !== false);
  }

  getParentEffectiveForFolder(folder, inherit) {
    if (inherit === false) return { categories: [] };
    const parent = vaultDirname(folder);
    if (parent === folder) return { version:1, inherit:false, categories:[], opacity:DEFAULT_HIGHLIGHT_OPACITY };
    return this.resolveCategoryConfigForFolder(parent).effective;
  }

  listVaultFolderPaths() {
    return this.obsidianVaultReadAdapter.listFolderPaths();
  }

  categorySourceForResolvedInfo(info, categoryId) {
    const id = String(categoryId || '').trim();
    if (!id) return null;
    const chain = Array.isArray(info?.chainLeafFirst) ? info.chainLeafFirst : [];
    for (const item of chain) {
      const categories = Array.isArray(item?.config?.categories) ? item.config.categories : [];
      if (categories.some(category => String(category?.id || '').trim() === id)) {
        const folder = String(item.folder || '');
        return {
          folder,
          configPath: String(item.configPath || this.configPathForFolder(folder)),
          editable: true,
          sourceLabel: folder || categoryFeatureT(this,'common.vaultRoot')
        };
      }
    }
    return null;
  }

  categorySourceMapForResolvedInfo(info) {
    const out = {};
    const categories = Array.isArray(info?.effective?.categories) ? info.effective.categories : [];
    for (const category of categories) {
      const id = String(category?.id || '').trim();
      if (!id) continue;
      const source = this.categorySourceForResolvedInfo(info, id);
      if (source) out[id] = source;
    }
    return out;
  }

  getCategoryEditorModelForFolder(folder) {
    const cleanFolder = String(folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const local = this.readFolderCategoryConfig(cleanFolder);
    const localConfig = local.exists ? local.config : { version: 1, inherit: true, categories: [] };
    const parentFolder = vaultDirname(cleanFolder);
    const parentInfo = cleanFolder
      ? this.resolveCategoryConfigForFolder(parentFolder)
      : { effective: { version: 1, inherit: false, categories: [], opacity: DEFAULT_HIGHLIGHT_OPACITY }, sources: [] };
    const inheritedCategorySources = this.categorySourceMapForResolvedInfo(parentInfo);
    return {
      localConfigPath: this.configPathForFolder(cleanFolder),
      localConfig,
      localExists: local.exists,
      parentEffective: parentInfo.effective,
      parentSourceLabel: parentInfo.sources.length ? parentInfo.sources[parentInfo.sources.length - 1].configPath : categoryFeatureT(this,'category.source.noneRoot'),
      inheritedCategorySources
    };
  }

  openCategoryEditor(file) {
    try {
      const folder = vaultDirname(file.path);
      const model = this.getCategoryEditorModelForFolder(folder);
      new CategoryConfigModal(this.app, this, file, model, folder).open();
    } catch (error) {
      new Notice(categoryFeatureT(this,'category.notice.editorStopped',{error:error instanceof Error ? error.message : String(error)}), 15000);
    }
  }

  openEffectiveCategoryConfig(file) {
    try {
      const info = this.resolveCategoryConfigForPdf(file);
      new EffectiveConfigModal(this.app, this, {
        file: file.path,
        folder: info.folder,
        sources: info.sources,
        effective: info.effective
      }).open();
    } catch (error) {
      new Notice(categoryFeatureT(this,'category.notice.readConfigFailed',{error:error instanceof Error ? error.message : String(error)}), 15000);
    }
  }

  validateLocalConfigForSave(config, folder) {
    const analysis = this.analyzeLocalCategoryConfig(config, folder);
    if (!analysis.ok) throw new Error(analysis.errors[0]?.message || categoryFeatureT(this,'category.validation.invalidData'));
    return analysis.normalized;
  }

  async createDefaultCategoryConfig(folder, options = {}) {
    const cleanFolder = String(folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const configVaultPath = this.configPathForFolder(cleanFolder);
    const configFsPath = this.vaultPathToFs(configVaultPath);
    if (this.nodeFilesystemAdapter.exists(configFsPath)) {
      return { created: false, exists: true, configPath: configVaultPath };
    }

    const inherit = options.inherit !== undefined ? !!options.inherit : cleanFolder !== '';
    const config = {
      version: 1,
      inherit,
      categories: cleanFolder && inherit ? [] : deepClone(DEFAULT_CATEGORIES)
    };
    const yaml = serializeCategoryConfig(config);
    try { parseYaml(yaml); }
    catch (e) { throw new Error(categoryFeatureT(this,'category.validation.internalYaml',{error:e instanceof Error ? e.message : String(e)})); }

    const configDirFs = path.dirname(configFsPath);
    const backupFsDir = this.vaultPathToFs(this.configBackupDirForFolder(cleanFolder));
    this.nodeFilesystemAdapter.ensureDir(configDirFs);
    this.nodeFilesystemAdapter.ensureDir(backupFsDir);

    const tempPath = `${configFsPath}.tmp-create-${process.pid}-${Date.now()}`;
    this.nodeFilesystemAdapter.writeText(tempPath, yaml, 'utf8');
    try {
      const verify = this.nodeFilesystemAdapter.readText(tempPath, 'utf8');
      parseYaml(verify);
      if (this.nodeFilesystemAdapter.exists(configFsPath)) {
        this.nodeFilesystemAdapter.removeFile(tempPath);
        return { created: false, exists: true, configPath: configVaultPath };
      }
      this.nodeFilesystemAdapter.rename(tempPath, configFsPath);
    } catch (e) {
      try { if (this.nodeFilesystemAdapter.exists(tempPath)) this.nodeFilesystemAdapter.removeFile(tempPath); } catch (_) {}
      throw e;
    }

    // Verify that the just-created file participates in the inheritance engine.
    const effectiveInfo = this.resolveCategoryConfigForFolder(cleanFolder);
    return {
      created: true,
      exists: false,
      configPath: configVaultPath,
      inherit,
      effectiveCategoryCount: (effectiveInfo.effective?.categories || []).filter(c => c.enabled !== false).length
    };
  }

  async ensureRootCategoryConfigInitialized() {
    const root = this.readFolderCategoryConfig('');
    if (root.exists) {
      if (root.config?.inherit === false) {
        return { created:false, normalized:false, configPath:root.configPath };
      }
      const normalized = deepClone(root.config || { version:1, categories:[] });
      normalized.version = 1;
      normalized.inherit = false;
      const result = await this.saveFolderCategoryConfig('', normalized);
      return { created:false, normalized:true, configPath:root.configPath, backupPath:result.backupPath || null };
    }
    return this.createDefaultCategoryConfig('', { inherit:false });
  }

  async saveFolderCategoryConfig(folder, config) {
    const validated = this.validateLocalConfigForSave(config, folder);
    const yaml = serializeCategoryConfig(validated);
    const validateYamlText = async text => {
      try { parseYaml(String(text)); }
      catch (error) { throw new Error(categoryFeatureT(this,'category.validation.internalYaml',{error:error instanceof Error ? error.message : String(error)})); }
    };
    await validateYamlText(yaml);

    const configVaultPath = this.configPathForFolder(folder);
    const backupVaultDir = this.configBackupDirForFolder(folder);
    const result = await safeWriteConfigText({
      store:this.createCategoryConfigFileStore(),
      targetPath:configVaultPath,
      backupDir:backupVaultDir,
      backupStem:'highlight-categories',
      backupExtension:'yaml',
      text:yaml,
      validateText:validateYamlText
    });

    // Force a read/merge validation of the newly written effective config.
    this.resolveCategoryConfigForFolder(folder);
    return { changed:result.changed, configPath:configVaultPath, backupPath:result.backupPath || null };
  }
}

module.exports = { CategoryConfigFeature };
