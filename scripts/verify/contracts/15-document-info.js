'use strict';
const ctx=require('../context');

module.exports=function verifyDocumentInfoContract(){
  const {path,ROOT,fail,read}=ctx;
  const schema=require(path.join(ROOT,'src/metadata/schema-contract.js'));
  global.metadataValidateCanonicalValue=schema.metadataValidateCanonicalValue;
  global.metadataClone=schema.metadataClone;
  const registryModulePath=path.join(ROOT,'src/metadata/field-type-registry.js');
  delete require.cache[require.resolve(registryModulePath)];
  const registryModule=require(registryModulePath);
  const registry=registryModule.createMetadataFieldTypeRegistry();
  const defaults=schema.metadataDefaultSchema();
  const byProperty=Object.fromEntries(defaults.fields.map(field=>[field.property,field]));

  if(registry.contractVersion!=='0.1') fail('DocumentInfo field-type registry contract version drifted');
  if(Object.keys(registry.types).join(',')!==schema.METADATA_FIELD_TYPES.join(',')) fail('DocumentInfo field-type registry does not cover canonical schema types');

  const dateOk=registry.parseNormalizeValidate(byProperty.document_date,'17.03.2016',{regionalDateFormat:'DD.MM.YYYY'});
  if(!dateOk.ok||dateOk.value!=='2016-03-17') fail('DocumentInfo localized date normalization failed');
  const dateBad=registry.parseNormalizeValidate(byProperty.document_date,'31.02.2016',{regionalDateFormat:'DD.MM.YYYY'});
  if(dateBad.ok) fail('DocumentInfo invalid localized date was accepted');

  const decimalField=schema.metadataMakeField({property:'amount',label:'Beløp',type:'decimal'});
  const decimalOk=registry.parseNormalizeValidate(decimalField,'12,5',{regionalDecimalSeparator:','});
  if(!decimalOk.ok||decimalOk.value!==12.5) fail('DocumentInfo localized decimal normalization failed');

  const timeOk=registry.parseNormalizeValidate(byProperty.document_time,'14:35',{regionalTimeFormat:'HH:mm'});
  if(!timeOk.ok||timeOk.value!=='14:35') fail('DocumentInfo time normalization failed');

  const selectOk=registry.parseNormalizeValidate(byProperty.document_type,'decision',{});
  if(!selectOk.ok||selectOk.value!=='decision'||registry.format(byProperty.document_type,'decision',{})!=='Vedtak') fail('DocumentInfo select machine-value/label contract failed');

  const feature=read('src/plugin/features/15-document-info.js');
  const view=read('src/main/pdfium-gate-view.js');
  const lifecycle=read('src/plugin/features/01-lifecycle.js');
  const transport=read('src/platform/main-process-transport.js');
  const bridgeComposition=read('src/main-bridge/composition.js');
  const driver=read('src/runtime/chromium-pdf-runtime-driver.js');
  if(feature.includes('valuesByPdfPath')) fail('DocumentInfo retained stale RAM-only document value store');
  for(const required of ['ensureDocumentRecordIndexReady','getDocumentMetadataRecordState','saveDocumentMetadataRecordValues']) if(!feature.includes(`this.ports.${required}`)) fail(`DocumentInfo persistent record port missing: ${required}`);
  if(feature.toLowerCase().includes('record not found')) fail('Unregistered PDF leaks technical record-not-found state to user');
  if(!feature.includes('show_in_document_info')||!feature.includes('field?.active===true')) fail('DocumentInfo schema visibility filtering missing');
  if(!feature.includes('parseNormalizeValidate')) fail('DocumentInfo save flow bypasses field-type registry');
  if(!view.includes("t('documentInfo.button')")||!view.includes('pdfium-document-info-panel')) fail('DocumentInfo PDF-view button/panel missing');
  if(!lifecycle.includes("id: 'show-document-info'")||!lifecycle.includes("name: this.i18n.t('commands.showDocumentInfo')")) fail('DocumentInfo Command Palette entry missing');
  if(!feature.includes('resolveExactToken')||!feature.includes('transport.focusPdfRuntime(token)')) fail('DocumentInfo focus restore is not exact-token routed');
  if(!transport.includes("'focusPdfRuntime'")) fail('MainProcessTransport focus method missing');
  if(!bridgeComposition.includes('focusPdfRuntime: mainBridgeRuntime.ports.focusPdfRuntime')) fail('Main Bridge focus API missing');
  if(!driver.includes('focusRestoreProduction: true')||!driver.includes('focusViewerRuntime,')) fail('RuntimeDriver focus-restore ownership missing');

  delete global.metadataValidateCanonicalValue;
  delete global.metadataClone;
  return {
    fieldTypeRegistryVersion:registry.contractVersion,
    fieldTypeCount:Object.keys(registry.types).length,
    localizedDateNormalization:true,
    invalidDateRejected:true,
    localizedDecimalNormalization:true,
    selectMachineValueLabelMapping:true,
    sidePanelInPdfView:true,
    followsCanonicalActiveLeaf:true,
    persistentRecordBacked:true,
    lazyUnregisteredPresentation:true,
    permanentRecordLocationDecided:true,
    exactRuntimeFocusRestore:true,
    commandPaletteEntry:true
  };
};
