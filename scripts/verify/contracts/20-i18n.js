'use strict';
const ctx=require('../context');

module.exports=function verifyI18nContract(){
  const {path,ROOT,fail,read,run}=ctx;
  const report=JSON.parse(run([path.join(ROOT,'scripts/check-i18n.js')]));
  const uiGate=JSON.parse(run([path.join(ROOT,'scripts/check-i18n-ui.js')]));
  if(!report?.ok || report.canonical!=='en') fail('i18n checker/canonical English contract failed');
  if(report.locales?.en?.coverage!==100 || report.locales?.nb?.coverage!==100) fail('English and Norwegian locale files must remain at 100% coverage during the initial i18n migration');
  if(!uiGate?.ok || uiGate.protectedFiles<18 || uiGate.protectedRegions<1) fail('hard-coded migrated-UI gate failed');

  const resolverPath=path.join(ROOT,'src/i18n/locale-resolver.js');
  delete require.cache[require.resolve(resolverPath)];
  const resolver=require(resolverPath);
  for(const [key,value] of Object.entries(resolver)) global[key]=value;
  const servicePath=path.join(ROOT,'src/i18n/i18n-service.js');
  delete require.cache[require.resolve(servicePath)];
  const service=require(servicePath);
  const translations={en:JSON.parse(read('src/i18n/en.json')),nb:JSON.parse(read('src/i18n/nb.json'))};

  const en=service.createPdfiumI18n({requestedLanguage:'en',translations});
  if(en.t('documentInfo.save')!=='Save') fail('English DocumentInfo translation failed');
  const nb=service.createPdfiumI18n({requestedLanguage:'nb',translations});
  if(nb.t('documentInfo.save')!=='Lagre') fail('Norwegian DocumentInfo translation failed');
  if(en.t('category.context.changeCategoryHeading')!=='Change category'||nb.t('category.context.changeCategoryHeading')!=='Endre kategori') fail('category UI translation failed');
  if(en.t('commands.editFolderCategories')!=='PDF: Edit categories for this folder'||nb.t('commands.editFolderCategories')!=='PDF: Rediger kategorier for denne mappen') fail('category command translation failed');
  const autoNb=service.createPdfiumI18n({requestedLanguage:'auto',obsidianApi:{getLanguage:()=> 'no'},translations});
  if(autoNb.getResolvedLanguage()!=='nb') fail('Obsidian no -> nb locale resolution failed');
  const autoUnsupported=service.createPdfiumI18n({requestedLanguage:'auto',obsidianApi:{getLanguage:()=> 'de'},translations});
  if(autoUnsupported.getResolvedLanguage()!=='en') fail('unsupported locale must fall back to English');
  const partialNb=service.createPdfiumI18n({requestedLanguage:'nb',translations:{en:translations.en,nb:{'documentInfo.save':'Lagre'}}});
  if(partialNb.t('documentInfo.edit')!=='Edit') fail('missing locale key did not fall back to English');
  if(en.t('validation.expectedDateFormat',{format:'DD.MM.YYYY'})!=='Expected date format DD.MM.YYYY') fail('i18n placeholder interpolation failed');
  if(service.pdfiumTranslateMetadataValidationMessage(en,'forventet datoformat DD.MM.YYYY')!=='Expected date format DD.MM.YYYY') fail('DocumentInfo validation translation failed');
  if(service.pdfiumTranslateMetadataValidationMessage(en,'verdi: invalid canonical date')!=='Invalid date') fail('canonical validation translation failed');
  if(service.pdfiumTranslateMetadataValidationMessage(en,'technical-unknown-message')!=='technical-unknown-message') fail('unknown validation messages must fail open unchanged');

  const registryPath=path.join(ROOT,'src/metadata/field-type-registry.js');
  delete require.cache[require.resolve(registryPath)];
  const registryApi=require(registryPath);
  const registry=registryApi.createMetadataFieldTypeRegistry();
  const nbPresentation=registryApi.metadataPresentationSettings({regionalDateFormat:'DD.MM.YYYY',regionalTimeFormat:'HH:mm',regionalDecimalSeparator:','},nb);
  const enPresentation=registryApi.metadataPresentationSettings({regionalDateFormat:'DD.MM.YYYY',regionalTimeFormat:'HH:mm',regionalDecimalSeparator:','},en);
  if(registry.format({type:'boolean'},true,nbPresentation)!=='Ja'||registry.format({type:'boolean'},false,nbPresentation)!=='Nei') fail('Norwegian boolean presentation is not owned by i18n');
  if(registry.format({type:'boolean'},true,enPresentation)!=='Yes'||registry.format({type:'boolean'},false,enPresentation)!=='No') fail('English boolean presentation is not owned by i18n');

  const lifecycle=read('src/plugin/features/01-lifecycle.js');
  const settings=read('src/main/settings.js');
  const documentInfo=read('src/plugin/features/15-document-info.js');
  const view=read('src/main/pdfium-gate-view.js');
  const sourceBundle=read('scripts/source-bundle.js');
  const categoryModals=read('src/main/category-modals.js');
  const categoryConfig=read('src/plugin/features/04-category-config.js');
  const categoryContext=read('src/plugin/features/05-context-menu.js');
  const categoryMutation=read('src/plugin/features/13-category-mutation.js');
  const diagnosticModals=read('src/main/diagnostic-modals.js');
  const pkg=JSON.parse(read('package.json'));
  if(!sourceBundle.includes('function buildI18nSource(root)')||!sourceBundle.includes("src/i18n/en.json")||!sourceBundle.includes("src/i18n/nb.json")) fail('i18n source is not bundled from canonical locale files');
  if(!lifecycle.includes("pdfiumNormalizeLanguageSetting(persistedSettings.uiLanguage || 'auto')")||!lifecycle.includes('createPdfiumI18n({')||!lifecycle.includes("name: this.i18n.t('commands.showDocumentInfo')")) fail('plugin i18n initialization/DocumentInfo command pilot missing');
  if(!settings.includes("saveSetting('uiLanguage'")||!settings.includes("settings.language.followObsidian")||!settings.includes("settings.language.description")) fail('language Settings missing');
  for(const key of ['settings.pdf.section','settings.regional.section','settings.metadata.section','settings.documentRegister.section','settings.advanced.section']) if(!settings.includes(key)) fail(`Settings section is not localized: ${key}`);
  for(const key of ['settings.pdf.includeHeaderFooter.name','settings.pdf.backupOriginal.name','settings.regional.dateFormat.name','settings.regional.timeFormat.name','settings.regional.decimalSeparator.name','settings.metadata.fields.name','settings.metadata.hideFiles.name','settings.documentRegister.rememberFilters.name','settings.advanced.diagnostics.name']) if(!settings.includes(key)) fail(`Settings item is not localized: ${key}`);
  if(settings.includes('regionalLocale')||lifecycle.includes('regionalLocale')||read('src/metadata/field-type-registry.js').includes('regionalLocale')) fail('removed Locale setting or dependency remains in production source');
  if(!settings.includes("regionalDateFormat")||!settings.includes("regionalTimeFormat")||!settings.includes("regionalDecimalSeparator")) fail('existing regional formatting settings were displaced by i18n work');
  if(!read('src/metadata/field-type-registry.js').includes('metadataPresentationSettings')||!read('src/metadata/field-type-registry.js').includes('uiBooleanLabels')) fail('boolean presentation is not routed through i18n presentation context');
  for(const key of ['documentInfo.button','documentInfo.title','documentInfo.cancel','documentInfo.save','documentInfo.edit','documentInfo.closeAria']) {
    if(!documentInfo.includes(key) && !view.includes(key)) fail(`DocumentInfo pilot translation key not used: ${key}`);
  }
  for(const literal of ["text:'Dokumentinformasjon'","text:'Avbryt'","text:'Lagre'","text:'Rediger'","'Lukk dokumentinformasjon'"]) {
    if(documentInfo.includes(literal)) fail(`DocumentInfo retained hard-coded pilot UI literal: ${literal}`);
  }
  if(!documentInfo.includes('pdfiumTranslateMetadataValidationMessage(this.i18n,item)')) fail('DocumentInfo validation errors do not route through i18n presentation');
  if(!view.includes("t('documentInfo.button')")||!view.includes("t('documentInfo.buttonAria')")||!view.includes("t('documentInfo.panelAria')")) fail('PDF-view DocumentInfo chrome is not localized');
  if(pkg.scripts?.['check:i18n']!=='node scripts/check-i18n.js') fail('npm run check:i18n missing');
  if(pkg.scripts?.['check:i18n-ui']!=='node scripts/check-i18n-ui.js'||!String(pkg.scripts?.check||'').includes('check:i18n-ui')) fail('npm run check:i18n-ui missing from check pipeline');
  if(!read('TRANSLATING.md').includes('English (`src/i18n/en.json`) is the canonical translation source')) fail('translation contributor guide missing');
  for(const key of ['category.bootstrap.title','category.editor.title','category.field.name','category.inherited.title','category.context.changeCategoryHeading','category.mutation.saved']) {
    if(!categoryModals.includes(key) && !categoryContext.includes(key) && !categoryMutation.includes(key)) fail(`category translation key is not used in migrated UI: ${key}`);
  }
  for(const key of ['category.validation.localInvalidFormat','category.validation.effectiveMax','category.notice.editorStopped']) if(!categoryConfig.includes(key)) fail(`category validation/notice translation key missing: ${key}`);
  for(const key of ['commands.createCategoryConfig','commands.editFolderCategories','commands.showEffectiveCategoryConfig']) if(!lifecycle.includes(key)) fail(`category command not localized: ${key}`);
  if(!diagnosticModals.includes("t('category.effective.title')")||!diagnosticModals.includes("t('category.effective.folder'")) fail('effective category config modal is not localized');
  const categoryFoundation=read('src/core/pdf-link-category-foundation.js');
  const schemaContractSource=read('src/metadata/schema-contract.js');
  const schemaRepositorySource=read('src/metadata/schema-repository.js');
  const baseConfigSource=read('src/metadata/document-register-base-config.js');
  const documentRegisterFeature=read('src/plugin/features/18-document-register-bases.js');
  if(!categoryFoundation.includes('function createDefaultCategories()')||!categoryConfig.includes('createDefaultCategories()')||categoryFoundation.includes('factory.category.')) fail('category factory defaults must be canonical English and independent of UI language');
  if(!schemaContractSource.includes('function metadataDefaultSchema()')||!schemaRepositorySource.includes('defaultSchemaFactory = null')||!read('src/plugin/features/14-metadata-schema.js').includes('metadataDefaultSchema()')||schemaContractSource.includes('factory.metadata.')) fail('metadata factory defaults must be canonical English at creation/reset time');
  if(!baseConfigSource.includes('metadataDocumentRegisterStandardBaseYaml(schema)')||!documentRegisterFeature.includes('metadataDocumentRegisterStandardBaseYaml(schema)')||baseConfigSource.includes('factory.base.')) fail('standard Base factory text must be canonical English');
  for(const localeName of ['en','nb']) {
    const locale=JSON.parse(read(`src/i18n/${localeName}.json`));
    if(Object.keys(locale).some(key=>key.startsWith('factory.'))) fail(`factory defaults leaked into ${localeName} UI translation keys`);
  }
  if(!settings.includes('settings.language.reloadNote')||settings.includes('setRequestedLanguage(')) fail('language change must remain reload-consistent rather than partially switching runtime UI');

  for(const key of Object.keys(resolver)) delete global[key];
  return {
    canonicalLocale:'en',
    pilotLocales:['en','nb'],
    englishCoverage:report.locales.en.coverage,
    norwegianCoverage:report.locales.nb.coverage,
    englishFallback:true,
    obsidianLanguageResolverIsolated:true,
    regionalFormattingSeparate:true,
    localeSettingRemoved:true,
    settingsUiLocalized:true,
    booleanLabelsOwnedByUiLanguage:true,
    documentInfoPilot:true,
    validationPresentationLocalized:true,
    contributorGuide:true,
    checkScript:true,
    hardcodedUiGate:true,
    categoryUiLocalized:true,
    allPdfCommandNamesLocalized:true,
    diagnosticHeaderLocalized:true,
    metadataSchemaManagerLocalized:true,
    documentRegisterLocalized:true,
    diagnosticModalsLocalized:true,
    benchmarkUiLocalized:true,
    canonicalEnglishFactoryDefaults:true,
    persistedLabelsRemainUserOwned:true,
    reloadConsistentLanguageSwitch:true
  };
};
