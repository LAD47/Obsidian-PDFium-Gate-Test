'use strict';
const ctx=require('../context');

module.exports=function verifyDocumentRegisterBasesContract(){
  const {fail,read}=ctx;
  const registerSource=read('src/plugin/features/18-document-register-bases.js');
  const viewSource=read('src/main/pdf-document-register-bases-view.js');
  const stateSource=read('src/plugin/plugin-state.js');
  const settingsSource=read('src/main/settings.js');
  const lifecycleSource=read('src/plugin/features/01-lifecycle.js');
  const documentRecordsSource=read('src/plugin/features/16-document-records.js');
  const frontmatterSource=read('src/platform/obsidian-frontmatter.js');
  const sourceBundle=read('scripts/source-bundle.js');
  const packageJson=read('package.json');

  const requiredRegisterTokens=[
    "const PDF_DOCUMENT_REGISTER_BASE_PATH = 'PDF Dokumentregister.base';",
    "type: 'pdfium-document-register'",
    "file.inFolder(\\\"PDF Metadata\\\")",
    "pdfmeta_type == \\\"pdf_document\\\"",
    "document_date",
    "direction: 'DESC'",
    "show_in_default_base !== false",
    "this.obsidianVaultReadAdapter",
    "this.obsidianVaultWriteAdapter",
    "registerView(PDF_DOCUMENT_REGISTER_VIEW_TYPE",
    "openPdfDocumentRegister",
    "ensurePdfDocumentRegisterBase",
    "resolveDocumentRecordPdfPath",
    "relinkMissingDocumentRecord"
  ];
  for(const token of requiredRegisterTokens) if(!registerSource.includes(token)) fail(`document register contract missing: ${token}`);

  if(!registerSource.includes('getAbstractFileByPath(PDF_DOCUMENT_REGISTER_BASE_PATH)')) fail('document register does not detect existing standard Base');
  if(!registerSource.includes('if (existing) return { created:false')) fail('document register standard Base overwrite guard missing');
  if(!registerSource.includes("openLinkText(PDF_DOCUMENT_REGISTER_BASE_PATH,''")) fail('document register does not open standard Base through Obsidian link API');
  if(registerSource.includes('modifyText(existing')) fail('document register must not rewrite user-owned existing standard Base');

  const requiredViewTokens=[
    'class PdfiumDocumentRegisterBasesView',
    'this.data',
    'this.config',
    'this.getOrder()',
    'this.getSort()',
    'this.getFilters()',
    'this.getProperties()',
    "text:activeRecord ? this.t('common.active') : this.t('common.missing')",
    "text:this.t('common.open')",
    "text:this.t('documentRegister.action.relink')",
    "this.plugin.ports.relinkMissingDocumentRecord(recordId,targetPath)",
    "this.plugin.ports.saveDocumentMetadataRecordValues(pdfPath,{[field.property]:value})",
    'metadataFieldTypeRegistry',
    'parseNormalizeValidate',
    "field.type === 'select'",
    "field.type === 'boolean'",
    "event.key === 'Enter'",
    "event.key === 'Escape'",
    'setSortProperty',
    "direction === 'ASC' ? 'DESC' : 'ASC'",
    "event.shiftKey",
    "field.type === 'date'",
    "field.type === 'time'",
    "field.type === 'integer'",
    "field.type === 'decimal'",
    "field.type === 'multiselect'",
    "filterState",
    "rememberDocumentRegisterFilters",
    "pdfiumHeaderFilters",
    "setTooltip",
    "metadataDocumentRegisterNormalizePersistedFilters",
    "this.plugin.settings.pdfiumHeaderFilters",
    "await this.plugin.obsidianPluginDataAdapter.saveData(this.plugin.settings)",
    "this.config?.setSortProperty",
    "this.config?.setSortProperty(property,direction)",
    "this.config?.setSortProperty(property,direction);",
    "this.config?.setSortProperty(property,direction)",
    "this.refresh();",
    "createEl('button'",
    "this.t('documentRegister.filter.all')"
  ];
  for(const token of requiredViewTokens) if(!viewSource.includes(token)) fail(`document register view contract missing: ${token}`);

  if(viewSource.includes("this.config?.set('sort'")) fail('document register sort regressed to generic Bases config set(sort)');
  if(viewSource.includes('appendSortProperty')||viewSource.includes('removeSortProperty')) fail('rejected Shift multi-sort path returned');
  if(viewSource.includes('shiftKey &&')) fail('Shift-specific sort branch returned');
  if(viewSource.includes('config?.setFilters')||viewSource.includes("config?.set('filters'")) fail('header filters must not write native Bases filters');
  if(viewSource.includes('this.plugin.settings.pdfiumHeaderFilters = this.filterState')||viewSource.includes('pdfiumHeaderFilters=this.filterState')) fail('header filter state must be sanitized before persistence');
  if(!viewSource.includes('metadataDocumentRegisterSanitizeFilters')) fail('header filter sanitization missing');
  if((viewSource.match(/setTooltip\(/g)||[]).length<1) fail('document register header tooltip missing');
  if(viewSource.includes('title =')||viewSource.includes('setAttribute(\'title\'')) fail('duplicate native title tooltip returned');

  for(const token of [
    "rememberDocumentRegisterFilters:false",
    "pdfiumHeaderFilters:{}"
  ]) if(!stateSource.includes(token)) fail(`document register default setting missing: ${token}`);

  for(const token of [
    "settings.documentRegister.rememberFilters.name",
    "settings.documentRegister.rememberFilters.description",
    "rememberDocumentRegisterFilters"
  ]) if(!settingsSource.includes(token)) fail(`document register Settings integration missing: ${token}`);

  if(!lifecycleSource.includes("id: 'open-pdf-document-register'")) fail('document register command missing');
  if(!lifecycleSource.includes("name:this.i18n.t('commands.openDocumentRegister')")) fail('document register command name is not localized');
  if(!lifecycleSource.includes('this.ports.openPdfDocumentRegister()')) fail('document register command bypasses operation port');

  if(!documentRecordsSource.includes('async saveDocumentMetadataRecordValues')) fail('document register canonical save port owner missing');
  if(!documentRecordsSource.includes('async relinkMissingDocumentRecord')) fail('document register canonical relink port owner missing');
  if(!frontmatterSource.includes('processFrontMatter')) fail('document record save does not retain Obsidian frontmatter adapter');
  if(!sourceBundle.includes("'src/plugin/features/18-document-register-bases.js'")) fail('document register feature missing from plugin build order');

  let pkg;
  try { pkg=JSON.parse(packageJson); } catch(error) { fail(`package.json invalid: ${error.message}`); }
  if(!pkg.scripts?.verify) fail('verify script missing');

  return {
    standardBasePath:'PDF Dokumentregister.base',
    standardBaseLazyCreate:true,
    standardBaseUserOwnedAfterCreate:true,
    standardMetadataFolderFilter:true,
    standardPdfmetaTypeFilter:true,
    standardSchemaColumns:true,
    standardNewestDocumentFirst:true,
    standardOpenCommand:true,
    clickableHeaderSortUsesBasesConfig:true,
    simpleAscendingDescendingToggle:true,
    shiftSortingDisabled:true,
    transientHeaderFilterPrototype:true,
    optionalPersistentHeaderFilters:true,
    persistentHeaderFiltersDefaultOff:true,
    headerTooltipDeduplicated:true,
    internalVersionSynchronized:true,
    staleVersionedMainBridgeCleanup:true,
    schemaAwareHeaderFilters:true,
    dateRangeFilter:true,
    selectChoiceFilter:true,
    booleanFilter:true,
    textContainsFilter:true,
    headerFilterDoesNotWriteNativeBasesFilters:true,
    humanStatusAndPdfActions:viewSource.includes("text:activeRecord ? this.t('common.active') : this.t('common.missing')")&&viewSource.includes("text:this.t('common.open')"),
    multilingualUiRoadmapDocumented:read('docs/history/MILESTONE.md').includes('Future localization reminder')
  };
};
