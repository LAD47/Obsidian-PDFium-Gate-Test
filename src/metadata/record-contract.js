'use strict';

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
const METADATA_RECORD_LEGACY_PREFIX = 'pdfmeta_';
const METADATA_RECORD_UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METADATA_RECORD_SUPPORTED = Object.freeze({
  pdf:Object.freeze({
    document:Object.freeze({extensions:Object.freeze(['pdf'])})
  })
});

function metadataRecordNormalizeVaultPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function metadataRecordIsUuidV4(value) {
  return METADATA_RECORD_UUID_V4_PATTERN.test(String(value || ''));
}

function metadataRecordPathFromId(id) {
  const value=String(id || '').trim().toLowerCase();
  if(!metadataRecordIsUuidV4(value)) throw new Error('metadata record id must be UUID v4');
  return `${METADATA_RECORDS_ROOT}/${value.slice(0,2)}/${value}.md`;
}

function metadataRecordIsPath(value) {
  const path=metadataRecordNormalizeVaultPath(value);
  return path===METADATA_RECORDS_ROOT || path.startsWith(`${METADATA_RECORDS_ROOT}/`);
}

function metadataRecordFileLink(filePath) {
  const path=metadataRecordNormalizeVaultPath(filePath);
  if(!path) throw new Error('metadata record file path is empty');
  return `[[${path}]]`;
}

function metadataRecordFilePathFromLink(value) {
  const text=String(value || '').trim();
  if(!text) return '';
  const wiki=/^\[\[([\s\S]+)\]\]$/.exec(text);
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
  const legacySystem=Object.keys(frontmatter).filter(key=>String(key).startsWith(METADATA_RECORD_LEGACY_PREFIX));
  if(legacySystem.length) return {ok:false,error:`legacy pdfmeta_ systemfelter støttes ikke: ${legacySystem.join(', ')}`};
  const unknownSystem=Object.keys(frontmatter).filter(key=>String(key).startsWith('filemeta_') && !METADATA_RECORD_SYSTEM_PROPERTY_SET.has(key));
  if(unknownSystem.length) return {ok:false,error:`ukjente filemeta_ systemfelter: ${unknownSystem.join(', ')}`};
  const id=String(frontmatter.filemeta_id || '').trim().toLowerCase();
  if(!metadataRecordIsUuidV4(id)) return {ok:false,error:'filemeta_id er ikke UUID v4'};
  const fileType=String(frontmatter.filemeta_type || '').trim();
  const profile=String(frontmatter.filemeta_profile || '').trim();
  if(!metadataRecordSupportedDescriptor(fileType,profile)) return {ok:false,error:`filemeta_type/profile støttes ikke: ${fileType || '(tom)'}/${profile || '(tom)'}`};
  if(Number(frontmatter.filemeta_version)!==METADATA_RECORD_FORMAT_VERSION) return {ok:false,error:`filemeta_version må være ${METADATA_RECORD_FORMAT_VERSION}`};
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
  if(field?.type==='date' && /^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
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
  lines.push(`filemeta_type: ${metadataRecordYamlScalar(fileType)}`);
  lines.push(`filemeta_profile: ${metadataRecordYamlScalar(profile)}`);
  lines.push(`filemeta_version: ${METADATA_RECORD_FORMAT_VERSION}`);
  lines.push(`filemeta_id: ${metadataRecordYamlScalar(String(record.id).toLowerCase())}`);
  lines.push(`filemeta_file: ${metadataRecordYamlScalar(metadataRecordFileLink(filePath))}`);
  lines.push(`filemeta_status: ${metadataRecordYamlScalar(record.status)}`);

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
  for(const key of Object.keys(values).sort((a,b)=>a.localeCompare(b))) if(!seen.has(key) && !String(key).startsWith('filemeta_') && !String(key).startsWith(METADATA_RECORD_LEGACY_PREFIX)) ordered.push(key);

  for(const key of ordered) {
    const value=values[key];
    if(metadataRecordIsEmptyUserValue(value)) continue;
    const field=fieldByProperty.get(key) || null;
    if(Array.isArray(value)) {
      if(value.length===0) continue;
      lines.push(`${key}:`);
      for(const item of value) lines.push(`  - ${metadataRecordYamlScalar(item,field)}`);
    } else {
      lines.push(`${key}: ${metadataRecordYamlScalar(value,field)}`);
    }
  }
  lines.push('---','');
  return `${lines.join('\n')}\n`;
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
  METADATA_RECORD_LEGACY_PREFIX,
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
