'use strict';
const ctx=require('../context');

module.exports=function verifyDocumentRegisterBasesContract(){
  const {path,ROOT,fail,read}=ctx;
  const schemaApi=require(path.join(ROOT,'src/metadata/schema-contract.js'));
  global.metadataRegionalSettings=require(path.join(ROOT,'src/metadata/field-type-registry.js')).metadataRegionalSettings;
  global.metadataValidateCanonicalValue=schemaApi.metadataValidateCanonicalValue;
  global.metadataClone=schemaApi.metadataClone;
  const registryApi=require(path.join(ROOT,'src/metadata/field-type-registry.js'));
  const presentation=require(path.join(ROOT,'src/metadata/base-presentation.js'));
  const baseConfig=require(path.join(ROOT,'src/metadata/document-register-base-config.js'));
  const registrationApi=require(path.join(ROOT,'src/platform/obsidian-plugin-registration.js'));

  const schema=schemaApi.metadataDefaultSchema();
  const registry=registryApi.createMetadataFieldTypeRegistry();
  const settings={regionalDateFormat:'DD.MM.YYYY',regionalTimeFormat:'HH:mm',regionalDecimalSeparator:',',uiBooleanLabels:{yes:'Ja',no:'Nei'}};
  const sourceFrontmatter={
    pdfmeta_type:'pdf_document',
    pdfmeta_version:1,
    pdfmeta_id:'a49dde44-7872-4d89-b97e-027a6e689d94',
    pdfmeta_file:'[[10_Kilder/PDF/test.pdf]]',
    pdfmeta_status:'active',
    document_date:'2016-03-17',
    document_time:'14:35',
    sender:'Oslo kommune',
    document_type:'letter',
    response_received:true,
    response_received_date:'2026-03-24',
    response_sent:false
  };
  const before=JSON.stringify(sourceFrontmatter);
  const presented=presentation.metadataBasePresentFrontmatter(sourceFrontmatter,schema,settings,registry);
  if(!presented.ok) fail('Bases presentation rejected canonical PDF metadata frontmatter');
  const byProperty=new Map(presented.fields.map(item=>[item.property,item]));
  if(byProperty.get('document_type')?.raw!=='letter'||byProperty.get('document_type')?.display!=='Letter') fail('Bases select machine-value -> schema-label mapping failed');
  if(byProperty.get('document_date')?.display!=='17.03.2016') fail('Bases date presentation did not reuse regional formatter');
  if(byProperty.get('response_received')?.display!=='Ja') fail('Bases boolean presentation did not reuse regional formatter');
  if(JSON.stringify(sourceFrontmatter)!==before) fail('Bases presentation mutated persisted metadata values');

  const dateField=schema.fields.find(field=>field.property==='document_date');
  const validDate=presentation.metadataBasePrepareFieldUpdate(dateField,'18.03.2016',settings,registry);
  if(!validDate.ok||validDate.value!=='2016-03-18') fail('Bases inline edit did not reuse canonical localized date parsing');
  const invalidDate=presentation.metadataBasePrepareFieldUpdate(dateField,'31.02.2016',settings,registry);
  if(invalidDate.ok) fail('Bases inline edit accepted invalid date');
  const typeFieldForEdit=schema.fields.find(field=>field.property==='document_type');
  const selectEdit=presentation.metadataBasePrepareFieldUpdate(typeFieldForEdit,'letter',settings,registry);
  if(!selectEdit.ok||selectEdit.value!=='letter') fail('Bases inline edit did not preserve select machine value');

  const relabeled=schemaApi.metadataClone(schema);
  const typeField=relabeled.fields.find(field=>field.property==='document_type');
  const letter=typeField.config.options.find(option=>option.value==='letter');
  letter.label='Korrespondanse';
  const relabeledPresentation=presentation.metadataBasePresentFrontmatter(sourceFrontmatter,relabeled,settings,registry);
  if(relabeledPresentation.fields.find(item=>item.property==='document_type')?.display!=='Korrespondanse') fail('Bases presentation hardcoded select label instead of schema label');
  if(sourceFrontmatter.document_type!=='letter') fail('schema label change rewrote machine value');

  const hidden=schemaApi.metadataClone(schema);
  hidden.fields.find(field=>field.property==='sender').show_in_default_base=false;
  const visible=presentation.metadataBaseVisibleFields(hidden);
  if(visible.some(field=>field.property==='sender')) fail('show_in_default_base=false did not hide field from custom Bases view');

  const standardBaseYaml=baseConfig.metadataDocumentRegisterStandardBaseYaml(schema);
  if(baseConfig.PDF_DOCUMENT_REGISTER_STANDARD_BASE_PATH!=='PDF Dokumentregister.base') fail('standard Dokumentregister Base path drifted');
  if(baseConfig.PDF_DOCUMENT_REGISTER_BASE_VIEW_TYPE!=='pdfium-document-register') fail('standard Dokumentregister custom view type drifted');
  if(!standardBaseYaml.includes('file.inFolder(\\"PDF Metadata\\")')||!standardBaseYaml.includes('pdfmeta_type == \\"pdf_document\\"')) fail('standard Dokumentregister Base does not scope query to canonical PDF metadata records');
  if(!standardBaseYaml.includes('type: pdfium-document-register')||!standardBaseYaml.includes('property: document_date')||!standardBaseYaml.includes('direction: DESC')) fail('standard Dokumentregister Base lacks custom view/default newest-first sort');
  if(!standardBaseYaml.includes('displayName: "Document date"')||!standardBaseYaml.includes('displayName: "Status"')||!standardBaseYaml.includes('displayName: "PDF"')) fail('standard Document Register Base lacks canonical English human display names');
  const ignoredLocalizedBase=baseConfig.metadataDocumentRegisterStandardBaseYaml(schema,()=> 'SHOULD NOT BE USED');
  if(ignoredLocalizedBase!==standardBaseYaml) fail('standard Base factory unexpectedly depends on UI language');
  if(standardBaseYaml.includes('pdfmeta_id')||standardBaseYaml.includes('record filename')) fail('standard Dokumentregister Base exposes technical identity fields');
  const hiddenBaseYaml=baseConfig.metadataDocumentRegisterStandardBaseYaml(hidden);
  if(hiddenBaseYaml.includes('  sender:')||hiddenBaseYaml.includes('      - sender')) fail('standard Dokumentregister Base ignores show_in_default_base=false');

  const registrations=[];
  const adapter=registrationApi.createObsidianPluginRegistrationAdapter({plugin:{
    registerBasesView(type,registration){ registrations.push({type,registration}); return true; }
  }});
  const registered=adapter.registerBasesView('pdfium-document-register',{factory:()=>({})});
  if(registered!==true||registrations.length!==1||registrations[0].type!=='pdfium-document-register') fail('Obsidian Bases registration adapter failed');
  const unavailable=registrationApi.createObsidianPluginRegistrationAdapter({plugin:{}});
  if(unavailable.registerBasesView('pdfium-document-register',{factory:()=>({})})!==false) fail('Bases registration adapter must fail open when API is unavailable');

  const viewSource=read('src/main/pdf-document-register-bases-view.js');
  const baseConfigSource=read('src/metadata/document-register-base-config.js');
  const featureSource=read('src/plugin/features/18-document-register-bases.js');
  const lifecycleSource=read('src/plugin/features/01-lifecycle.js');
  const settingsSource=read('src/main/settings.js');
  const headerSource=read('src/main/00-header.js');
  const contextMenuSource=read('src/plugin/features/05-context-menu.js');
  const bridgeRoutingSource=read('src/plugin/features/07-main-bridge-routing.js');
  if(!baseConfigSource.includes("PDF_DOCUMENT_REGISTER_BASE_VIEW_TYPE = 'pdfium-document-register'")) fail('custom Bases view type id missing');
  const releaseVersion=JSON.parse(read('manifest.json')).version;
  if(!headerSource.includes(`const PLUGIN_VERSION = '${releaseVersion}';`)) fail(`internal PLUGIN_VERSION drifted from manifest ${releaseVersion}`);
  if(!contextMenuSource.includes('main-bridge-${PLUGIN_VERSION}.js')) fail('versioned Main Bridge runtime path contract missing');
  if(!bridgeRoutingSource.includes("resolvePluginPath('main-bridge-0.1.205.js')")||!bridgeRoutingSource.includes('removeFile(staleBridgePath)')) fail('stale main-bridge-0.1.205.js cleanup missing');
  if(!settingsSource.includes("settings.documentRegister.rememberFilters.name")||!settingsSource.includes("saveSetting('rememberDocumentRegisterFilters'")) fail('localized remember-filter setting missing');
  if(!lifecycleSource.includes('rememberDocumentRegisterFilters:persistedSettings.rememberDocumentRegisterFilters === true')) fail('remember-filter default/restore contract missing');
  if(!viewSource.includes('metadataBaseVisibleFields(schema)')||!viewSource.includes('metadataBasePresentFrontmatter(')) fail('custom Bases view bypasses schema-aware presentation contract');
  if(!viewSource.includes('metadataBasePrepareFieldUpdate(')||!viewSource.includes('metadataFieldTypeRegistry.get(field.type)')) fail('custom Bases inline edit bypasses field-type registry');
  if(!viewSource.includes('this.host?.saveValues?.(pdfPath')) fail('custom Bases inline edit does not route through explicit save operation');
  if(viewSource.includes('processFrontMatter(')||viewSource.includes('obsidianVaultWriteAdapter')||viewSource.includes('createText(')) fail('custom Bases view writes metadata directly');
  if(viewSource.includes("document_type==='letter'")||viewSource.includes("'letter':'Brev'")||viewSource.includes('letter → Brev')) fail('custom Bases view hardcodes document-type translation');
  if(!viewSource.includes('class PdfDocumentRelinkModal extends Modal')||!viewSource.includes("documentRegister.relinkButton")||!viewSource.includes('this.host?.relinkMissingRecord?.(')) fail('missing-PDF explicit relink UX missing from custom Bases view');
  if(!viewSource.includes('slice(0,100)')||!viewSource.includes("type:'search'")) fail('relink modal lacks bounded searchable PDF chooser');
  if(!viewSource.includes('getSortDirection(property)')||!viewSource.includes('this.config.setSortProperty(propertyId, next)')||!viewSource.includes('pdfDocumentRegisterPropertyId(property)')) fail('clickable header sort does not route through Bases setSortProperty operation');
  if(!viewSource.includes('nextSortDirection(current)')||!viewSource.includes("return current === 'ASC' ? 'DESC' : 'ASC'")) fail('simple ASC/DESC click toggle contract missing');
  if(viewSource.includes('event.shiftKey')||viewSource.includes('shiftKey')) fail('Dokumentregister sorting must not depend on Shift');
  if(!viewSource.includes("typeof this.config.setSortProperty !== 'function'")) fail('must capability-check BasesViewConfig.setSortProperty');
  if(!viewSource.includes("this.config.setSortProperty(existingProperty, 'NONE')")) fail('single-column sort must clear existing Bases sorts through setSortProperty');
  if(!viewSource.includes('this.config.setSortProperty(propertyId, next)')) fail('sort must use BasesViewConfig.setSortProperty');
  if(viewSource.includes("this.config.set('sort'")) fail('must not mutate Bases sort through generic config.set');
  if(!viewSource.includes('class PdfDocumentRegisterHeaderFilterModal extends Modal')||!viewSource.includes('this.headerFilters = new Map()')||!viewSource.includes('matchesHeaderFilters(values)')) fail('transient column-filter UX prototype missing');
  if(!viewSource.includes('pdfDocumentRegisterFilterType(field')||!viewSource.includes("kind:'range'")||!viewSource.includes("kind:'choices'")||!viewSource.includes("kind:'boolean'")||!viewSource.includes("kind:'contains'")) fail('0.1.206 schema-aware filter modes missing');
  if(!viewSource.includes("type === 'date'")||!viewSource.includes("type === 'select'")||!viewSource.includes("type === 'boolean'")||!viewSource.includes("systemType:'status'")) fail('0.1.206 filter UI is not datatype-aware');
  if(!viewSource.includes('metadataFieldTypeRegistry.parseNormalizeValidate')||!viewSource.includes('pdfDocumentRegisterMatchesFilter(filter')) fail('0.1.206 filter validation/matching does not reuse canonical field types');
  if(viewSource.includes("this.config.set('filters'")||viewSource.includes('modifyText(PDF_DOCUMENT_REGISTER_STANDARD_BASE_PATH')||viewSource.includes('modifyText("PDF Dokumentregister.base"')) fail('header filters must not rewrite native Bases filters or the Base file directly');
  if(!viewSource.includes("PDF_DOCUMENT_REGISTER_HEADER_FILTERS_CONFIG_KEY = 'pdfiumHeaderFilters'")||!viewSource.includes('pdfDocumentRegisterHeaderFiltersFromConfig(')||!viewSource.includes('pdfDocumentRegisterHeaderFiltersToConfig(')) fail('persistent header-filter config contract missing');
  if(!viewSource.includes('rememberDocumentRegisterFilters')||!viewSource.includes('persistHeaderFiltersIfEnabled()')||!viewSource.includes('this.config.set(')) fail('optional header-filter persistence path missing');
  if(viewSource.includes("sortButton.setAttribute('title'")||viewSource.includes("filterButton.setAttribute('title'")) fail('header buttons must not duplicate native title and Obsidian accessibility tooltip text');
  if(!viewSource.includes("property:'pdfmeta_status', label:this.t('documentRegister.status')")||!viewSource.includes("property:'pdfmeta_file', label:this.t('documentRegister.pdf')")) fail('status/PDF headers are not wired to localized shared header interaction');
  {
    const sanitize=eval(`(${ctx.extractNamedFunction(viewSource,'pdfDocumentRegisterSanitizeStoredFilter')})`);
    const fromConfig=eval(`(function(pdfDocumentRegisterSanitizeStoredFilter){ return (${ctx.extractNamedFunction(viewSource,'pdfDocumentRegisterHeaderFiltersFromConfig')}); })`)(sanitize);
    const toConfig=eval(`(function(pdfDocumentRegisterSanitizeStoredFilter){ return (${ctx.extractNamedFunction(viewSource,'pdfDocumentRegisterHeaderFiltersToConfig')}); })`)(sanitize);
    const stored={
      sender:{kind:'contains',query:'Oslo'},
      response_received:{kind:'boolean',value:false},
      document_type:{kind:'choices',values:['letter','decision'],includeEmpty:false,systemType:''},
      document_date:{kind:'range',valueType:'date',from:'2024-01-01',to:'2025-12-31'},
      unsafe:{kind:'unknown',payload:'drop-me'}
    };
    if(!sanitize(stored.sender)||sanitize(stored.unsafe)!==null) fail('stored header-filter sanitizer does not fail closed');
    const restored=fromConfig(stored);
    if(restored.size!==4||restored.get('sender')?.query!=='Oslo'||restored.get('response_received')?.value!==false) fail('stored header-filter restore failed');
    const serialized=toConfig(restored);
    if(Object.keys(serialized).length!==4||serialized.unsafe) fail('stored header-filter serialization failed');
  }
  if(!featureSource.includes("name:this.i18n.t('documentRegister.viewName')")||!featureSource.includes('registerBasesView(')) fail('custom Bases registration feature missing');
  if(!featureSource.includes('this.ports.getMetadataSchemaSnapshot()')||!featureSource.includes('this.ports.resolveDocumentRecordPdfPath(')||!featureSource.includes('this.ports.saveDocumentMetadataRecordValues(')||!featureSource.includes('this.ports.relinkMissingDocumentRecord(')) fail('custom Bases feature does not use explicit schema/identity/save/relink ports');
  if(featureSource.includes('obsidianFrontmatterAdapter')||featureSource.includes('processFrontMatter(')||featureSource.includes('modifyText(')) fail('custom Bases feature unexpectedly mutates metadata or overwrites Base files');
  if(!featureSource.includes('metadataDocumentRegisterStandardBaseYaml(schema)')||!featureSource.includes('this.obsidianVaultWriteAdapter.createText(path, yaml)')) fail('canonical English standard Document Register Base create-only path missing');
  if(!featureSource.includes("name:this.i18n.t('commands.openDocumentRegister')")||!featureSource.includes("getLeaf?.('tab')")||!featureSource.includes('await leaf.openFile(ensured.file)')) fail('standard Dokumentregister open command missing');
  const existingGuard=featureSource.indexOf('if (existing)');
  const createBase=featureSource.indexOf('this.obsidianVaultWriteAdapter.createText(path, yaml)');
  if(existingGuard<0||createBase<0||existingGuard>createBase) fail('standard Dokumentregister Base is not protected from overwrite');
  const schemaInit=lifecycleSource.indexOf('await this.ports.initializeMetadataSchema();');
  const basesRegistration=lifecycleSource.indexOf('this.ports.registerPdfDocumentRegisterBasesView();');
  if(schemaInit<0||basesRegistration<0||basesRegistration<schemaInit) fail('custom Bases view is not registered after metadata schema initialization');

  delete global.metadataRegionalSettings;
  delete global.metadataValidateCanonicalValue;
  delete global.metadataClone;

  return {
    customViewType:'pdfium-document-register',
    nativeBasesRegistration:true,
    basesOwnsQueryMembership:true,
    schemaDrivenColumns:true,
    showInDefaultBaseHonored:true,
    selectMachineValuePreserved:true,
    selectSchemaLabelPresented:true,
    regionalFormattingReused:true,
    schemaRelabelWithoutRecordRewrite:true,
    inlineEditing:true,
    editUsesFieldTypeRegistry:true,
    invalidDateRejectedBeforeWrite:true,
    canonicalSaveOperationOnly:true,
    missingRecordsReadOnlyUntilExplicitRelink:true,
    explicitMissingPdfRelinkUi:true,
    relinkUsesCanonicalDocumentRecordsOperation:true,
    standardBaseCreateOnly:true,
    standardBaseUserOwnedAfterCreation:true,
    standardBaseScopedToRecordRoot:true,
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
    multilingualUiRoadmapDocumented:read('MILESTONE.md').includes('Future localization reminder')
  };
};
