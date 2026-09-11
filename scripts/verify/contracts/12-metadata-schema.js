'use strict';
const ctx=require('../context');

module.exports=async function verifyMetadataSchemaContract(){
  const {path,ROOT,fail,read}=ctx;
  const schemaContract=require(path.join(ROOT,'src/metadata/schema-contract.js'));
  const repositoryContract=require(path.join(ROOT,'src/metadata/schema-repository.js'));
  const safeWriteContract=require(path.join(ROOT,'src/core/safe-config-file-write.js'));
  const {
    METADATA_SCHEMA_ROOT,
    METADATA_SCHEMA_FILE_NAME,
    METADATA_SCHEMA_PATH,
    METADATA_SCHEMA_BACKUP_ROOT,
    METADATA_FIELD_TYPES,
    metadataDefaultSchema,
    metadataValidateSchema,
    metadataClone
  }=schemaContract;

  if(METADATA_SCHEMA_ROOT!=='.pdf-metadata') fail(`metadata schema root drifted: ${METADATA_SCHEMA_ROOT}`);
  if(METADATA_SCHEMA_FILE_NAME!=='document-metadata-schema.json') fail(`metadata schema filename drifted: ${METADATA_SCHEMA_FILE_NAME}`);
  if(METADATA_SCHEMA_PATH!=='.pdf-metadata/document-metadata-schema.json') fail(`metadata schema path drifted: ${METADATA_SCHEMA_PATH}`);
  if(METADATA_SCHEMA_BACKUP_ROOT!=='.pdf-metadata/backup/document-metadata-schema') fail(`metadata schema backup root drifted: ${METADATA_SCHEMA_BACKUP_ROOT}`);
  if(Object.prototype.hasOwnProperty.call(schemaContract,'METADATA_RECORDS_ROOT')) fail('metadata record location was prematurely reintroduced into schema contract');
  if(JSON.stringify(METADATA_FIELD_TYPES)!==JSON.stringify(['text','date','time','integer','decimal','boolean','select','multiselect','link'])) fail('metadata v1 field-type set drifted');

  const schema=metadataDefaultSchema();
  const validation=metadataValidateSchema(schema);
  if(!validation.ok) fail(`default metadata schema invalid: ${validation.errors.join('; ')}`);
  const expectedProperties=['document_date','document_time','sender','document_type','response_received','response_received_date','response_sent','response_sent_date'];
  if(JSON.stringify(schema.fields.map(field=>field.property))!==JSON.stringify(expectedProperties)) fail('default metadata field order/properties drifted');
  if(schema.fields.length!==8) fail(`default metadata field count drifted: ${schema.fields.length}`);
  if(schema.fields.find(field=>field.property==='document_time')?.type!=='time') fail('document_time is not canonical time type');
  if(schema.fields.find(field=>field.property==='response_received')?.type!=='boolean') fail('response_received is not boolean');
  if(schema.fields.find(field=>field.property==='response_sent_date')?.type!=='date') fail('response_sent_date is not date');

  const reserved=metadataClone(schema);
  reserved.fields[0].property='pdfmeta_user_field';
  if(metadataValidateSchema(reserved).ok) fail('reserved pdfmeta_ prefix was accepted');

  const badDate=metadataClone(schema);
  badDate.fields[0].default='2016-02-31';
  if(metadataValidateSchema(badDate).ok) fail('invalid canonical calendar date was accepted');

  const badTime=metadataClone(schema);
  badTime.fields[1].default='24:01';
  if(metadataValidateSchema(badTime).ok) fail('invalid canonical time was accepted');

  const duplicateProperty=metadataClone(schema);
  duplicateProperty.fields[1].property=duplicateProperty.fields[0].property;
  if(metadataValidateSchema(duplicateProperty).ok) fail('duplicate metadata property was accepted');

  const duplicateOption=metadataClone(schema);
  const select=duplicateOption.fields.find(field=>field.property==='document_type');
  select.config.options[1].value=select.config.options[0].value;
  if(metadataValidateSchema(duplicateOption).ok) fail('duplicate select option value was accepted');

  const files=new Map();
  const folders=new Set();
  const fakeFileStore={
    async exists(vaultPath){ return files.has(vaultPath)||folders.has(vaultPath); },
    async readText(vaultPath){ if(!files.has(vaultPath)) throw new Error('missing fake file'); return files.get(vaultPath); },
    async writeText(vaultPath,text){ files.set(vaultPath,String(text)); return {path:vaultPath}; },
    async ensureFolder(vaultPath){ folders.add(vaultPath); return {path:vaultPath}; },
    async copyFile(fromPath,toPath){ if(!files.has(fromPath)) throw new Error('missing fake source'); files.set(toPath,files.get(fromPath)); return {from:fromPath,path:toPath}; },
    async rename(fromPath,toPath){ if(!files.has(fromPath)) throw new Error('missing fake rename source'); const value=files.get(fromPath); files.delete(fromPath); files.set(toPath,value); return {from:fromPath,path:toPath}; },
    async removeFile(vaultPath){ files.delete(vaultPath); return {path:vaultPath}; }
  };
  const repository=repositoryContract.createMetadataSchemaRepository({fileStore:fakeFileStore,schemaApi:schemaContract,safeWriteApi:safeWriteContract});
  const first=await repository.loadOrCreateDefault();
  if(!first.created||!files.has(METADATA_SCHEMA_PATH)||!folders.has(METADATA_SCHEMA_ROOT)) fail('schema repository did not create hidden default schema lazily');
  const second=await repository.loadOrCreateDefault();
  if(second.created) fail('schema repository recreated an existing schema');
  const edited=metadataClone(second.schema);
  edited.revision+=1;
  edited.fields[2].label='Avsender / organisasjon';
  const saved=await repository.writeSchema(edited);
  if(saved.schema.revision!==2||saved.schema.fields[2].label!=='Avsender / organisasjon') fail('schema repository save/read verification failed');
  if(!saved.changed||!saved.backupPath||!saved.backupPath.startsWith(`${METADATA_SCHEMA_BACKUP_ROOT}/document-metadata-schema-`)||!saved.backupPath.endsWith('.json')) fail(`schema repository backup path invalid: ${saved.backupPath}`);
  if(!files.has(saved.backupPath)) fail('schema repository backup file missing after actual change');
  const unchanged=await repository.writeSchema(saved.schema);
  if(unchanged.changed||unchanged.backupPath!==null) fail('unchanged schema write created backup');

  const featureSource=read('src/plugin/features/14-metadata-schema.js');
  const settingsSource=read('src/main/settings.js');
  const modalSource=read('src/main/metadata-schema-modal.js');
  const lifecycleSource=read('src/plugin/features/01-lifecycle.js');
  const adapterSource=read('src/platform/obsidian-adapter-file-store.js');
  const runtimeSources=[featureSource,settingsSource,modalSource,lifecycleSource,adapterSource].join('\n');
  if(runtimeSources.includes("'.md'")||runtimeSources.includes('`.md`')) fail('metadata schema slice unexpectedly writes PDF metadata markdown records');
  if(!runtimeSources.includes('resetMetadataSchemaToTestDefaults')) fail('test-schema reset surface missing');
  if(settingsSource.includes('regionalLocale')) fail('removed Locale setting leaked back into Settings UI');
  for(const key of ['regionalDateFormat','regionalTimeFormat','regionalDecimalSeparator']) if(!settingsSource.includes(key)) fail(`regional formatting setting missing: ${key}`);
  if(settingsSource.includes('status.schema.fields.forEach')) fail('metadata field administration leaked back into ordinary Settings page');
  if(!settingsSource.includes("settings.metadata.fields.manage")) fail('localized compact Settings entry point to metadata field manager missing');
  if(!modalSource.includes('class MetadataSchemaManagerModal extends Modal')) fail('dedicated metadata schema manager modal missing');
  if(!modalSource.includes('status.schema.fields.forEach')) fail('metadata manager does not own field list administration');
  if(!lifecycleSource.includes("id: 'manage-metadata-fields'")) fail('metadata manager command missing');
  if(!lifecycleSource.includes('createObsidianAdapterFileStore')) fail('hidden schema storage is not initialized through Adapter API file store');
  if(featureSource.includes('obsidianVaultReadAdapter')||featureSource.includes('obsidianVaultWriteAdapter')) fail('metadata schema repository fell back to indexed Vault API');
  for(const method of ['adapter.exists','adapter.read','adapter.write','adapter.mkdir','adapter.copy','adapter.rename','adapter.remove']) if(!adapterSource.includes(method)) fail(`Adapter API store missing ${method}`);

  return {
    schemaPath:METADATA_SCHEMA_PATH,
    schemaBackupRoot:METADATA_SCHEMA_BACKUP_ROOT,
    hiddenAdapterStorage:true,
    metadataRecordLocationOwnedSeparately:true,
    dedicatedFieldManager:true,
    commandPaletteEntry:true,
    defaultFieldCount:schema.fields.length,
    fieldTypes:[...METADATA_FIELD_TYPES],
    defaultProperties:expectedProperties,
    repositoryCreateReadWrite:true,
    backupOnActualSchemaChange:true,
    invalidDateRejected:true,
    invalidTimeRejected:true,
    reservedPrefixRejected:true,
    pdfMetadataRecordWritesOwnedSeparately:true
  };
};
