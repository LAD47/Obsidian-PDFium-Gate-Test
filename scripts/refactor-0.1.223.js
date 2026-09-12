'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function abs(rel) { return path.join(ROOT, rel); }
function read(rel) { return fs.readFileSync(abs(rel), 'utf8'); }
function write(rel, content) { fs.mkdirSync(path.dirname(abs(rel)), {recursive:true}); fs.writeFileSync(abs(rel), content, 'utf8'); }
function replaceRequired(rel, from, to) {
  const before = read(rel);
  if (!before.includes(from)) throw new Error(`${rel}: expected text not found: ${from.slice(0,120)}`);
  write(rel, before.split(from).join(to));
}
function listFiles(dir) {
  const root = abs(dir);
  if (!fs.existsSync(root)) return [];
  const out=[];
  for (const entry of fs.readdirSync(root,{withFileTypes:true})) {
    const rel=path.posix.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...listFiles(rel));
    else out.push(rel);
  }
  return out;
}
function replaceInActiveFiles(from,to) {
  const candidates=[
    ...listFiles('src'),
    ...listFiles('scripts').filter(rel=>rel!=='scripts/refactor-0.1.223.js'),
    ...listFiles('docs/architecture'),
    ...listFiles('docs/examples'),
    'README.md','ARCHITECTURE.md'
  ].filter(rel=>/\.(?:js|json|md|base|yml|yaml)$/.test(rel));
  let count=0;
  for(const rel of candidates) {
    const before=read(rel);
    if(!before.includes(from)) continue;
    const after=before.split(from).join(to);
    write(rel,after);
    count += before.split(from).length - 1;
  }
  return count;
}

// 0.1.223 is intentionally destructive pre-beta metadata-format work. No migration
// from the 0.1.222 test record format is carried forward.
const replacements={
  pdfmeta:replaceInActiveFiles('pdfmeta_','filemeta_'),
  recordRoot:replaceInActiveFiles('PDF Metadata','File Metadata'),
  oldType:replaceInActiveFiles('pdf_document','pdf')
};
if(replacements.pdfmeta < 5) throw new Error(`expected pdfmeta_ references, found ${replacements.pdfmeta}`);
if(replacements.recordRoot < 2) throw new Error(`expected PDF Metadata references, found ${replacements.recordRoot}`);

write('src/metadata/record-contract.js', `'use strict';

const METADATA_RECORD_CONTRACT_VERSION = '0.2';
const METADATA_RECORD_FORMAT_VERSION = 2;
const METADATA_RECORD_DEFAULT_FILE_TYPE = 'pdf';
const METADATA_RECORD_DEFAULT_PROFILE = 'document';
// Current PDF feature code still reads METADATA_RECORD_TYPE; keep this runtime
// adapter alias while persisted identity is file-type/profile based.
const METADATA_RECORD_TYPE = METADATA_RECORD_DEFAULT_FILE_TYPE;
const METADATA_RECORD_PROFILE = METADATA_RECORD_DEFAULT_PROFILE;
const METADATA_RECORDS_ROOT = 'File Metadata';
const METADATA_RECORD_STATUS_ACTIVE = 'active';
const METADATA_RECORD_STATUS_MISSING = 'missing';
const METADATA_RECORD_SYSTEM_PROPERTIES = Object.freeze([
  'filemeta_type',
  'filemeta_profile',
  'filemeta_version',
  'filemeta_id',
  'filemeta_file',
  'filemeta_status'
]);
const METADATA_RECORD_SYSTEM_PROPERTY_SET = new Set(METADATA_RECORD_SYSTEM_PROPERTIES);
const METADATA_RECORD_UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METADATA_RECORD_SUPPORTED = Object.freeze({
  pdf:Object.freeze({
    document:Object.freeze({extensions:Object.freeze(['pdf'])})
  })
});

function metadataRecordNormalizeVaultPath(value) {
  return String(value || '').replace(/\\\\/g, '/').replace(/^\\/+|\\/+$/g, '');
}

function metadataRecordIsUuidV4(value) {
  return METADATA_RECORD_UUID_V4_PATTERN.test(String(value || ''));
}

function metadataRecordPathFromId(id) {
  const value=String(id || '').trim().toLowerCase();
  if(!metadataRecordIsUuidV4(value)) throw new Error('metadata record id must be UUID v4');
  return \`${'${METADATA_RECORDS_ROOT}'}/\${value.slice(0,2)}/\${value}.md\`;
}

function metadataRecordIsPath(value) {
  const path=metadataRecordNormalizeVaultPath(value);
  return path===METADATA_RECORDS_ROOT || path.startsWith(\`${'${METADATA_RECORDS_ROOT}'}/\`);
}

function metadataRecordFileLink(filePath) {
  const path=metadataRecordNormalizeVaultPath(filePath);
  if(!path) throw new Error('metadata record file path is empty');
  return \`[[\${path}]]\`;
}

function metadataRecordFilePathFromLink(value) {
  const text=String(value || '').trim();
  if(!text) return '';
  const wiki=/^\\[\\[([\\s\\S]+)\\]\\]$/.exec(text);
  if(!wiki) return metadataRecordNormalizeVaultPath(text);
  const target=String(wiki[1] || '').split('|',1)[0];
  return metadataRecordNormalizeVaultPath(target);
}

// PDF-specific aliases are runtime adapters for the current product feature,
// not persisted compatibility with the old pdfmeta_* record format.
function metadataRecordPdfLink(pdfPath) { return metadataRecordFileLink(pdfPath); }
function metadataRecordPdfPathFromLink(value) { return metadataRecordFilePathFromLink(value); }

function metadataRecordSupportedDescriptor(fileType, profile) {
  return METADATA_RECORD_SUPPORTED[String(fileType || '')]?.[String(profile || '')] || null;
}

function metadataRecordValidateSupportedFilePath(fileType, profile, filePath) {
  const descriptor=metadataRecordSupportedDescriptor(fileType,profile);
  const normalized=metadataRecordNormalizeVaultPath(filePath);
  if(!descriptor || !normalized) return false;
  const extension=(normalized.split('.').pop() || '').toLowerCase();
  return descriptor.extensions.includes(extension);
}

function metadataRecordClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function metadataRecordIsEmptyUserValue(value) {
  return value===null || value===undefined || (Array.isArray(value) && value.length===0);
}

function metadataRecordNormalizeFrontmatterValue(field, value) {
  if(value===undefined || value===null) return null;
  const type=String(field?.type || '');
  if(type==='date') {
    if(value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0,10);
    return String(value);
  }
  if(type==='time' || type==='text' || type==='select' || type==='link') return String(value);
  if(type==='integer' || type==='decimal') return typeof value==='number' ? value : Number(value);
  if(type==='boolean') return value===true || value==='true';
  if(type==='multiselect') return Array.isArray(value) ? value.map(item=>String(item)) : (value==='' ? [] : [String(value)]);
  return metadataRecordClone(value);
}

function metadataRecordFromFrontmatter(frontmatter, schema = null) {
  if(!frontmatter || typeof frontmatter!=='object' || Array.isArray(frontmatter)) {
    return {ok:false,error:'frontmatter mangler eller er ugyldig'};
  }
  const unknownSystem=Object.keys(frontmatter).filter(key=>String(key).startsWith('filemeta_') && !METADATA_RECORD_SYSTEM_PROPERTY_SET.has(key));
  if(unknownSystem.length) return {ok:false,error:\`ukjente filemeta_ systemfelter: \${unknownSystem.join(', ')}\`};
  const id=String(frontmatter.filemeta_id || '').trim().toLowerCase();
  if(!metadataRecordIsUuidV4(id)) return {ok:false,error:'filemeta_id er ikke UUID v4'};
  const fileType=String(frontmatter.filemeta_type || '').trim();
  const profile=String(frontmatter.filemeta_profile || '').trim();
  if(!metadataRecordSupportedDescriptor(fileType,profile)) return {ok:false,error:\`filemeta_type/profile støttes ikke: \${fileType || '(tom)'}/\${profile || '(tom)'}\`};
  if(Number(frontmatter.filemeta_version)!==METADATA_RECORD_FORMAT_VERSION) return {ok:false,error:\`filemeta_version må være \${METADATA_RECORD_FORMAT_VERSION}\`};
  const status=String(frontmatter.filemeta_status || '');
  if(![METADATA_RECORD_STATUS_ACTIVE,METADATA_RECORD_STATUS_MISSING].includes(status)) return {ok:false,error:'filemeta_status er ugyldig'};
  const filePath=metadataRecordFilePathFromLink(frontmatter.filemeta_file);
  if(!metadataRecordValidateSupportedFilePath(fileType,profile,filePath)) return {ok:false,error:'filemeta_file peker ikke til en støttet fil for type/profile'};

  const fields=Array.isArray(schema?.fields) ? schema.fields : [];
  const byProperty=new Map(fields.map(field=>[field.property,field]));
  const values={};
  for(const [key,raw] of Object.entries(frontmatter)) {
    if(METADATA_RECORD_SYSTEM_PROPERTY_SET.has(key) || String(key).startsWith('filemeta_')) continue;
    const field=byProperty.get(key);
    values[key]=field ? metadataRecordNormalizeFrontmatterValue(field,raw) : metadataRecordClone(raw);
  }
  return {ok:true,record:{id,fileType,profile,filePath,pdfPath:filePath,status,values}};
}

function metadataRecordYamlScalar(value, field = null) {
  if(value===null || value===undefined) return 'null';
  if(typeof value==='boolean') return value ? 'true' : 'false';
  if(typeof value==='number') {
    if(!Number.isFinite(value)) throw new Error('kan ikke serialisere ikke-endelig tall');
    return String(value);
  }
  const text=String(value);
  if(field?.type==='date' && /^\\d{4}-\\d{2}-\\d{2}$/.test(text)) return text;
  return JSON.stringify(text);
}

function metadataRecordSerializeMarkdown(record, schema = null) {
  if(!record || typeof record!=='object') throw new Error('metadata record mangler');
  if(!metadataRecordIsUuidV4(record.id)) throw new Error('metadata record id er ugyldig');
  const fileType=String(record.fileType || METADATA_RECORD_DEFAULT_FILE_TYPE);
  const profile=String(record.profile || METADATA_RECORD_DEFAULT_PROFILE);
  const filePath=metadataRecordNormalizeVaultPath(record.filePath || record.pdfPath);
  if(!metadataRecordValidateSupportedFilePath(fileType,profile,filePath)) throw new Error('metadata record file path/type/profile er ugyldig');
  if(![METADATA_RECORD_STATUS_ACTIVE,METADATA_RECORD_STATUS_MISSING].includes(record.status)) throw new Error('metadata record status er ugyldig');

  const lines=['---'];
  lines.push(\`filemeta_type: \${metadataRecordYamlScalar(fileType)}\`);
  lines.push(\`filemeta_profile: \${metadataRecordYamlScalar(profile)}\`);
  lines.push(\`filemeta_version: \${METADATA_RECORD_FORMAT_VERSION}\`);
  lines.push(\`filemeta_id: \${metadataRecordYamlScalar(String(record.id).toLowerCase())}\`);
  lines.push(\`filemeta_file: \${metadataRecordYamlScalar(metadataRecordFileLink(filePath))}\`);
  lines.push(\`filemeta_status: \${metadataRecordYamlScalar(record.status)}\`);

  const values=record.values && typeof record.values==='object' && !Array.isArray(record.values) ? record.values : {};
  const fields=Array.isArray(schema?.fields) ? schema.fields : [];
  const fieldByProperty=new Map(fields.map(field=>[field.property,field]));
  const ordered=[];
  const seen=new Set();
  for(const field of fields) {
    if(Object.prototype.hasOwnProperty.call(values,field.property)) {
      ordered.push(field.property);
      seen.add(field.property);
    }
  }
  for(const key of Object.keys(values).sort((a,b)=>a.localeCompare(b))) if(!seen.has(key) && !String(key).startsWith('filemeta_')) ordered.push(key);

  for(const key of ordered) {
    const value=values[key];
    if(metadataRecordIsEmptyUserValue(value)) continue;
    const field=fieldByProperty.get(key) || null;
    if(Array.isArray(value)) {
      if(value.length===0) continue;
      lines.push(\`\${key}:\`);
      for(const item of value) lines.push(\`  - \${metadataRecordYamlScalar(item,field)}\`);
    } else {
      lines.push(\`\${key}: \${metadataRecordYamlScalar(value,field)}\`);
    }
  }
  lines.push('---','');
  return \`\${lines.join('\\n')}\\n\`;
}

const metadataRecordContract=Object.freeze({
  METADATA_RECORD_CONTRACT_VERSION,
  METADATA_RECORD_FORMAT_VERSION,
  METADATA_RECORD_DEFAULT_FILE_TYPE,
  METADATA_RECORD_DEFAULT_PROFILE,
  METADATA_RECORD_TYPE,
  METADATA_RECORD_PROFILE,
  METADATA_RECORDS_ROOT,
  METADATA_RECORD_STATUS_ACTIVE,
  METADATA_RECORD_STATUS_MISSING,
  METADATA_RECORD_SYSTEM_PROPERTIES,
  METADATA_RECORD_SUPPORTED,
  metadataRecordNormalizeVaultPath,
  metadataRecordIsUuidV4,
  metadataRecordPathFromId,
  metadataRecordIsPath,
  metadataRecordFileLink,
  metadataRecordFilePathFromLink,
  metadataRecordPdfLink,
  metadataRecordPdfPathFromLink,
  metadataRecordSupportedDescriptor,
  metadataRecordValidateSupportedFilePath,
  metadataRecordClone,
  metadataRecordIsEmptyUserValue,
  metadataRecordNormalizeFrontmatterValue,
  metadataRecordFromFrontmatter,
  metadataRecordSerializeMarkdown
});

module.exports=metadataRecordContract;
`);

write('src/metadata/record-repository.js', `'use strict';

const METADATA_RECORD_REPOSITORY_CONTRACT_VERSION='0.2';

function createMetadataRecordRepository({vaultReadAdapter,vaultWriteAdapter,frontmatterAdapter,parseYamlFn,recordApi}) {
  if(!vaultReadAdapter || typeof vaultReadAdapter.readText!=='function' || typeof vaultReadAdapter.getAbstractFileByPath!=='function') throw new Error('metadata record repository: vault read adapter incomplete');
  if(!vaultWriteAdapter || typeof vaultWriteAdapter.createText!=='function' || typeof vaultWriteAdapter.ensureFolder!=='function') throw new Error('metadata record repository: vault write adapter incomplete');
  if(!frontmatterAdapter || typeof frontmatterAdapter.processFrontMatter!=='function') throw new Error('metadata record repository: frontmatter adapter incomplete');
  if(typeof parseYamlFn!=='function') throw new Error('metadata record repository: parseYaml function missing');
  if(!recordApi) throw new Error('metadata record repository: record contract missing');

  function parseMarkdown(text,schema) {
    const source=String(text || '');
    const match=/^---\\r?\\n([\\s\\S]*?)\\r?\\n---(?:\\r?\\n|$)/.exec(source);
    if(!match) return {ok:false,error:'metadata record mangler YAML frontmatter'};
    let frontmatter;
    try { frontmatter=parseYamlFn(match[1]); }
    catch(error) { return {ok:false,error:\`ugyldig YAML: \${error instanceof Error?error.message:String(error)}\`}; }
    return recordApi.metadataRecordFromFrontmatter(frontmatter,schema);
  }

  async function readRecordFile(file,schema) {
    if(!file) return {ok:false,error:'metadata record file mangler'};
    const text=await vaultReadAdapter.readText(file);
    const parsed=parseMarkdown(text,schema);
    return parsed.ok ? {...parsed,file,recordPath:String(file.path || '')} : {...parsed,file,recordPath:String(file.path || '')};
  }

  async function verifyRecordPath(recordPath,expectedId,schema) {
    const file=vaultReadAdapter.getAbstractFileByPath(recordPath);
    if(!file || String(file.extension || '').toLowerCase()!=='md') throw new Error(\`metadata record write verification failed: \${recordPath} mangler\`);
    const readBack=await readRecordFile(file,schema);
    if(!readBack.ok) throw new Error(\`metadata record write verification failed: \${readBack.error}\`);
    if(readBack.record.id!==expectedId) throw new Error('metadata record write verification failed: filemeta_id mismatch');
    return readBack;
  }

  async function createRecord(record,schema) {
    const recordPath=recordApi.metadataRecordPathFromId(record.id);
    const parts=recordPath.split('/');
    const shardFolder=parts.slice(0,-1).join('/');
    await vaultWriteAdapter.ensureFolder(recordApi.METADATA_RECORDS_ROOT);
    await vaultWriteAdapter.ensureFolder(shardFolder);
    if(vaultReadAdapter.getAbstractFileByPath(recordPath)) throw new Error(\`metadata record finnes allerede: \${recordPath}\`);
    const markdown=recordApi.metadataRecordSerializeMarkdown(record,schema);
    const file=await vaultWriteAdapter.createText(recordPath,markdown);
    return await verifyRecordPath(recordPath,record.id,schema);
  }

  async function updateRecord(file,record,schema) {
    if(!file) throw new Error('metadata record update mangler fil');
    const fieldProperties=new Set(Array.isArray(schema?.fields)?schema.fields.map(field=>field.property):[]);
    const fileType=String(record.fileType || recordApi.METADATA_RECORD_DEFAULT_FILE_TYPE);
    const profile=String(record.profile || recordApi.METADATA_RECORD_DEFAULT_PROFILE);
    const filePath=record.filePath || record.pdfPath;
    if(!recordApi.metadataRecordValidateSupportedFilePath(fileType,profile,filePath)) throw new Error('metadata record update har ugyldig file type/profile/path');
    await frontmatterAdapter.processFrontMatter(file,frontmatter=>{
      frontmatter.filemeta_type=fileType;
      frontmatter.filemeta_profile=profile;
      frontmatter.filemeta_version=recordApi.METADATA_RECORD_FORMAT_VERSION;
      frontmatter.filemeta_id=String(record.id).toLowerCase();
      frontmatter.filemeta_file=recordApi.metadataRecordFileLink(filePath);
      frontmatter.filemeta_status=record.status;
      const values=record.values && typeof record.values==='object' && !Array.isArray(record.values) ? record.values : {};
      for(const property of fieldProperties) {
        if(Object.prototype.hasOwnProperty.call(values,property) && !recordApi.metadataRecordIsEmptyUserValue(values[property])) frontmatter[property]=recordApi.metadataRecordClone(values[property]);
        else delete frontmatter[property];
      }
    });
    return await verifyRecordPath(String(file.path || ''),record.id,schema);
  }

  return Object.freeze({
    contractVersion:METADATA_RECORD_REPOSITORY_CONTRACT_VERSION,
    parseMarkdown,
    readRecordFile,
    createRecord,
    updateRecord,
    verifyRecordPath
  });
}

module.exports={METADATA_RECORD_REPOSITORY_CONTRACT_VERSION,createMetadataRecordRepository};
`);

write('src/metadata/record-index-cache.js', `'use strict';

const METADATA_RECORD_INDEX_CACHE_CONTRACT_VERSION='0.2';
const METADATA_RECORD_INDEX_CACHE_FORMAT_VERSION=2;
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
    const fileType=String(record.fileType || recordApi.METADATA_RECORD_DEFAULT_FILE_TYPE);
    const profile=String(record.profile || recordApi.METADATA_RECORD_DEFAULT_PROFILE);
    const filePath=recordApi.metadataRecordNormalizeVaultPath(record.filePath || record.pdfPath);
    const status=String(record.status||'');
    const values=record.values && typeof record.values==='object' && !Array.isArray(record.values) ? clone(record.values) : {};
    if(!recordApi.metadataRecordIsUuidV4(id)) return null;
    if(recordApi.metadataRecordPathFromId(id)!==recordApi.metadataRecordNormalizeVaultPath(recordPath)) return null;
    if(!recordApi.metadataRecordValidateSupportedFilePath(fileType,profile,filePath)) return null;
    if(![recordApi.METADATA_RECORD_STATUS_ACTIVE,recordApi.METADATA_RECORD_STATUS_MISSING].includes(status)) return null;
    return {id,fileType,profile,filePath,pdfPath:filePath,status,values};
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
`);

// The standard PDF document register is a profile-specific view over the generic
// record layer. Keep its user-facing PDF naming, but filter on both system axes.
replaceRequired(
  'src/metadata/document-register-base-config.js',
  `    - \${metadataDocumentRegisterYamlString('filemeta_type == "pdf"')},`,
  `    - \${metadataDocumentRegisterYamlString('filemeta_type == "pdf"')},\n    - \${metadataDocumentRegisterYamlString('filemeta_profile == "document"')},`
);

replaceRequired(
  'src/metadata/example-files.js',
  `    \`    - \${q('filemeta_type == \\"pdf\\"')}\`,`,
  `    \`    - \${q('filemeta_type == \\"pdf\\"')}\`,\n    \`    - \${q('filemeta_profile == \\"document\\"')}\`,`
);
replaceRequired('src/metadata/example-files.js', "    pdfPath:'Example Documents/example-letter.pdf',", "    filePath:'Example Documents/example-letter.pdf',");
replaceRequired('src/metadata/example-files.js', "    pdfPath:'Example Documents/missing-example-decision.pdf',", "    filePath:'Example Documents/missing-example-decision.pdf',");

for(const rel of ['docs/examples/Example - Active PDF record.md','docs/examples/Example - Missing PDF record.md']) {
  replaceRequired(rel,'filemeta_type: pdf','filemeta_type: pdf\nfilemeta_profile: document');
}
replaceRequired(
  'docs/examples/Example PDF Document Register.base',
  `    - 'filemeta_type == "pdf"'`,
  `    - 'filemeta_type == "pdf"'\n    - 'filemeta_profile == "document"'`
);

// Keep the example verifier synchronized with the new six system properties.
replaceRequired(
  'scripts/check-examples.js',
  "const systemFields = ['filemeta_type','filemeta_version','filemeta_id','filemeta_file','filemeta_status'];",
  "const systemFields = ['filemeta_type','filemeta_profile','filemeta_version','filemeta_id','filemeta_file','filemeta_status'];"
);
replaceRequired(
  'scripts/check-examples.js',
  "if (!baseExample.includes('- type: table')) fail('example Base must use native Obsidian table view');",
  "if (!baseExample.includes('filemeta_profile == \\\"document\\\"')) fail('native Base must filter the document profile');\nif (!baseExample.includes('- type: table')) fail('example Base must use native Obsidian table view');"
);

// Version bump is source-only here; generated runtime stays out of this refactor commit.
const pkg=JSON.parse(read('package.json'));
pkg.version='0.1.223';
pkg.scripts['check:filemeta']='node scripts/check-filemeta-foundation.js';
pkg.scripts.check=pkg.scripts.check.replace(' && npm run verify',' && npm run check:filemeta && npm run verify');
write('package.json',JSON.stringify(pkg,null,2)+'\n');
const manifest=JSON.parse(read('manifest.json'));
manifest.version='0.1.223';
manifest.description='PDFium Gate test build 0.1.223 - file-type-neutral metadata record foundation; PDF remains the first supported document profile.';
write('manifest.json',JSON.stringify(manifest,null,2)+'\n');
replaceRequired('src/main/00-header.js',"const PLUGIN_VERSION = '0.1.222';","const PLUGIN_VERSION = '0.1.223';");

write('scripts/check-filemeta-foundation.js', `'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const fail=message=>{ console.error(\`File metadata foundation check failed: \${message}\`); process.exit(1); };
const record=require(path.join(root,'src/metadata/record-contract.js'));
const expected=['filemeta_type','filemeta_profile','filemeta_version','filemeta_id','filemeta_file','filemeta_status'];
if(JSON.stringify(record.METADATA_RECORD_SYSTEM_PROPERTIES)!==JSON.stringify(expected)) fail('system property set differs from canonical six-field contract');
if(record.METADATA_RECORDS_ROOT!=='File Metadata') fail('record root must be File Metadata');
if(record.METADATA_RECORD_DEFAULT_FILE_TYPE!=='pdf') fail('current default file type must be pdf');
if(record.METADATA_RECORD_DEFAULT_PROFILE!=='document') fail('current default profile must be document');
if(!record.metadataRecordSupportedDescriptor('pdf','document')) fail('pdf/document descriptor is missing');
if(record.metadataRecordSupportedDescriptor('html','web_page')) fail('HTML must not be enabled in 0.1.223');
const id='11111111-1111-4111-8111-111111111111';
const frontmatter={filemeta_type:'pdf',filemeta_profile:'document',filemeta_version:2,filemeta_id:id,filemeta_file:'[[Example/test.pdf]]',filemeta_status:'active'};
const parsed=record.metadataRecordFromFrontmatter(frontmatter,{fields:[]});
if(!parsed.ok) fail(\`canonical frontmatter did not parse: \${parsed.error}\`);
if(parsed.record.filePath!=='Example/test.pdf' || parsed.record.pdfPath!==parsed.record.filePath) fail('generic path and current PDF adapter alias diverge');
const markdown=record.metadataRecordSerializeMarkdown({id,fileType:'pdf',profile:'document',filePath:'Example/test.pdf',status:'active',values:{}},{fields:[]});
for(const field of expected) if(!markdown.includes(\`\${field}:\`)) fail(\`serialized Markdown missing \${field}\`);
if(markdown.includes('pdfmeta_') || markdown.includes('pdf_document')) fail('serialized Markdown contains old system identity');
const old=record.metadataRecordFromFrontmatter({pdfmeta_type:'pdf_document',pdfmeta_version:1,pdfmeta_id:id,pdfmeta_file:'[[Example/test.pdf]]',pdfmeta_status:'active'},{fields:[]});
if(old.ok) fail('old 0.1.222 persisted record format must not be accepted');
const activeExample=fs.readFileSync(path.join(root,'docs/examples/Example - Active PDF record.md'),'utf8');
const baseExample=fs.readFileSync(path.join(root,'docs/examples/Example PDF Document Register.base'),'utf8');
if(!activeExample.includes('filemeta_profile: document')) fail('active example lacks document profile');
if(!baseExample.includes('filemeta_profile == "document"')) fail('example Base lacks document profile filter');
console.log('File metadata foundation OK: generic filemeta_* identity, type/profile separation, File Metadata root, PDF/document as the only active descriptor.');
`);

// Turn the architecture note from a future intention into the 0.1.223 contract.
{
  const rel='docs/architecture/08-metadata-schema.md';
  let text=read(rel);
  const marker='## Planned pre-beta multi-file-type metadata direction';
  const at=text.indexOf(marker);
  if(at<0) throw new Error(`${rel}: planned direction marker missing`);
  text=text.slice(0,at)+`## Multi-file-type metadata foundation (0.1.223)\n\n0.1.223 changes the permanent Markdown record identity from the PDF-specific \`pdfmeta_*\` namespace to the file-type-neutral \`filemeta_*\` namespace. Records now separate \`filemeta_type\` from \`filemeta_profile\`; the first and only enabled combination is \`pdf\` + \`document\`. The persisted record root is \`File Metadata/\`.\n\nThe current document schema remains the first profile schema and keeps its existing nine user fields. Future content types should add profile-specific schemas while reusing the same field type registry, validation rules, record identity and Markdown/YAML persistence. 0.1.223 deliberately does **not** enable HTML, image or SVG product support.\n\nThe technical \`.pdf-metadata/\` configuration root is intentionally unchanged in this build because it also contains PDF-specific configuration such as highlight categories and the current document-profile cache. Renaming or splitting that technical storage is a separate decision and must not be coupled mechanically to record identity.\n\nUser-facing terminology continues to follow the content model rather than the internal architecture: Document information for the PDF/document profile now, with future Web page information or Image information only when those product features are actually implemented.\n`;
  write(rel,text);
}
for(const [rel,section] of [
  ['docs/architecture/09-document-records.md',`\n## 0.1.223 file-neutral record identity\n\nPermanent records now live under \`File Metadata/\` and use \`filemeta_type\`, \`filemeta_profile\`, \`filemeta_version\`, \`filemeta_id\`, \`filemeta_file\` and \`filemeta_status\`. The current supported descriptor is only \`pdf\` + \`document\`. Runtime PDF code may use a \`pdfPath\` adapter alias internally, but that alias is not persisted and is not backward compatibility for the old \`pdfmeta_*\` format.\n`],
  ['docs/architecture/11-document-register.md',`\n## 0.1.223 profile filter\n\nThe standard PDF Document Register remains a PDF-specific user view, but its Base filter now targets the generic record layer with both \`filemeta_type == "pdf"\` and \`filemeta_profile == "document"\`. This keeps the current UI simple while allowing future registers to select other type/profile combinations.\n`]
]) {
  const text=read(rel);
  if(!text.includes(section.trim())) write(rel,text.trimEnd()+'\n'+section);
}

// Active source/docs must no longer define or document the old persisted namespace/root.
const audit=[
  ...listFiles('src'),
  ...listFiles('scripts').filter(rel=>rel!=='scripts/refactor-0.1.223.js'),
  ...listFiles('docs/architecture'),
  ...listFiles('docs/examples'),
  'README.md','ARCHITECTURE.md'
].filter(rel=>/\.(?:js|json|md|base)$/.test(rel));
for(const rel of audit) {
  const text=read(rel);
  if(text.includes('pdfmeta_')) throw new Error(`${rel}: old pdfmeta_ persisted namespace remains`);
  if(text.includes('PDF Metadata')) throw new Error(`${rel}: old PDF Metadata record root remains`);
  if(text.includes('pdf_document')) throw new Error(`${rel}: old combined pdf_document identity remains`);
}

console.log('Prepared 0.1.223 file-type-neutral metadata foundation.');
