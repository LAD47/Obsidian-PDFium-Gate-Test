'use strict';

const METADATA_RECORD_INDEX_CACHE_CONTRACT_VERSION='0.1';
const METADATA_RECORD_INDEX_CACHE_FORMAT_VERSION=1;
const METADATA_RECORD_INDEX_CACHE_PATH='.pdf-metadata/document-record-index-cache.json';

function createMetadataRecordIndexCache({fileStore,recordApi,cryptoApi}) {
  if(!fileStore || typeof fileStore.exists!=='function' || typeof fileStore.readText!=='function' || typeof fileStore.writeText!=='function' || typeof fileStore.ensureFolder!=='function') {
    throw new Error('metadata record index cache: file store incomplete');
  }
  if(!recordApi) throw new Error('metadata record index cache: record contract missing');
  if(!cryptoApi || typeof cryptoApi.createHash!=='function') throw new Error('metadata record index cache: crypto missing');

  function clone(value) { return value==null ? value : JSON.parse(JSON.stringify(value)); }

  function schemaSignature(schema) {
    return cryptoApi.createHash('sha256').update(JSON.stringify(schema || null),'utf8').digest('hex');
  }

  function fileFingerprint(file) {
    const mtime=Number(file?.stat?.mtime);
    const size=Number(file?.stat?.size);
    if(!Number.isFinite(mtime) || !Number.isFinite(size) || mtime<0 || size<0) return null;
    return {mtime,size};
  }

  function validateCachedRecord(record,recordPath) {
    if(!record || typeof record!=='object' || Array.isArray(record)) return null;
    const id=String(record.id||'').toLowerCase();
    const pdfPath=recordApi.metadataRecordNormalizeVaultPath(record.pdfPath);
    const status=String(record.status||'');
    const values=record.values && typeof record.values==='object' && !Array.isArray(record.values) ? clone(record.values) : {};
    if(!recordApi.metadataRecordIsUuidV4(id)) return null;
    if(recordApi.metadataRecordPathFromId(id)!==recordApi.metadataRecordNormalizeVaultPath(recordPath)) return null;
    if(!pdfPath || !/\.pdf$/i.test(pdfPath)) return null;
    if(![recordApi.METADATA_RECORD_STATUS_ACTIVE,recordApi.METADATA_RECORD_STATUS_MISSING].includes(status)) return null;
    return {id,pdfPath,status,values};
  }

  async function load(schema) {
    const signature=schemaSignature(schema);
    if(!(await fileStore.exists(METADATA_RECORD_INDEX_CACHE_PATH))) {
      return {ok:true,usable:true,reason:'missing',schemaSignature:signature,entries:new Map()};
    }
    let parsed;
    try { parsed=JSON.parse(await fileStore.readText(METADATA_RECORD_INDEX_CACHE_PATH)); }
    catch(error) {
      return {ok:true,usable:false,reason:'invalid-json',schemaSignature:signature,entries:new Map(),error:error instanceof Error?error.message:String(error)};
    }
    if(Number(parsed?.format_version)!==METADATA_RECORD_INDEX_CACHE_FORMAT_VERSION || parsed?.contract_version!==METADATA_RECORD_INDEX_CACHE_CONTRACT_VERSION) {
      return {ok:true,usable:false,reason:'format-mismatch',schemaSignature:signature,entries:new Map()};
    }
    if(parsed?.record_contract_version!==recordApi.METADATA_RECORD_CONTRACT_VERSION || Number(parsed?.record_format_version)!==recordApi.METADATA_RECORD_FORMAT_VERSION) {
      return {ok:true,usable:false,reason:'record-contract-mismatch',schemaSignature:signature,entries:new Map()};
    }
    if(String(parsed?.schema_sha256||'')!==signature) {
      return {ok:true,usable:false,reason:'schema-mismatch',schemaSignature:signature,entries:new Map()};
    }
    const entries=new Map();
    const rawEntries=parsed?.entries && typeof parsed.entries==='object' && !Array.isArray(parsed.entries) ? parsed.entries : {};
    for(const [rawPath,rawEntry] of Object.entries(rawEntries)) {
      const recordPath=recordApi.metadataRecordNormalizeVaultPath(rawPath);
      if(!recordApi.metadataRecordIsPath(recordPath)) continue;
      const mtime=Number(rawEntry?.mtime);
      const size=Number(rawEntry?.size);
      const record=validateCachedRecord(rawEntry?.record,recordPath);
      if(!Number.isFinite(mtime) || !Number.isFinite(size) || !record) continue;
      entries.set(recordPath,{mtime,size,record});
    }
    return {ok:true,usable:true,reason:'loaded',schemaSignature:signature,entries};
  }

  function get(cacheState,file) {
    if(!cacheState?.usable || !(cacheState.entries instanceof Map)) return null;
    const recordPath=recordApi.metadataRecordNormalizeVaultPath(file?.path);
    const fingerprint=fileFingerprint(file);
    if(!recordPath || !fingerprint) return null;
    const cached=cacheState.entries.get(recordPath);
    if(!cached || cached.mtime!==fingerprint.mtime || cached.size!==fingerprint.size) return null;
    const record=validateCachedRecord(cached.record,recordPath);
    return record ? {ok:true,record,file,recordPath,cacheHit:true} : null;
  }

  function entryFor(file,parsed) {
    const recordPath=recordApi.metadataRecordNormalizeVaultPath(parsed?.recordPath || file?.path);
    const fingerprint=fileFingerprint(file);
    const record=validateCachedRecord(parsed?.record,recordPath);
    if(!recordPath || !fingerprint || !record) return null;
    return {recordPath,entry:{mtime:fingerprint.mtime,size:fingerprint.size,record}};
  }

  async function write(schema,filesAndParsed) {
    const entries={};
    for(const item of Array.isArray(filesAndParsed)?filesAndParsed:[]) {
      const cached=entryFor(item?.file,item?.parsed);
      if(cached) entries[cached.recordPath]=cached.entry;
    }
    await fileStore.ensureFolder('.pdf-metadata');
    const payload={
      format_version:METADATA_RECORD_INDEX_CACHE_FORMAT_VERSION,
      contract_version:METADATA_RECORD_INDEX_CACHE_CONTRACT_VERSION,
      record_contract_version:recordApi.METADATA_RECORD_CONTRACT_VERSION,
      record_format_version:recordApi.METADATA_RECORD_FORMAT_VERSION,
      schema_sha256:schemaSignature(schema),
      generated_at:new Date().toISOString(),
      entry_count:Object.keys(entries).length,
      entries
    };
    await fileStore.writeText(METADATA_RECORD_INDEX_CACHE_PATH,JSON.stringify(payload));
    return {ok:true,entryCount:payload.entry_count,path:METADATA_RECORD_INDEX_CACHE_PATH};
  }

  return Object.freeze({
    contractVersion:METADATA_RECORD_INDEX_CACHE_CONTRACT_VERSION,
    formatVersion:METADATA_RECORD_INDEX_CACHE_FORMAT_VERSION,
    cachePath:METADATA_RECORD_INDEX_CACHE_PATH,
    schemaSignature,
    fileFingerprint,
    load,
    get,
    entryFor,
    write
  });
}

module.exports={
  METADATA_RECORD_INDEX_CACHE_CONTRACT_VERSION,
  METADATA_RECORD_INDEX_CACHE_FORMAT_VERSION,
  METADATA_RECORD_INDEX_CACHE_PATH,
  createMetadataRecordIndexCache
};
