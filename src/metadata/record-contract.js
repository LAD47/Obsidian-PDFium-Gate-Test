'use strict';

const METADATA_RECORD_CONTRACT_VERSION = '0.1';
const METADATA_RECORD_FORMAT_VERSION = 1;
const METADATA_RECORD_TYPE = 'pdf_document';
const METADATA_RECORDS_ROOT = 'PDF Metadata';
const METADATA_RECORD_STATUS_ACTIVE = 'active';
const METADATA_RECORD_STATUS_MISSING = 'missing';
const METADATA_RECORD_SYSTEM_PROPERTIES = Object.freeze([
  'pdfmeta_type',
  'pdfmeta_version',
  'pdfmeta_id',
  'pdfmeta_file',
  'pdfmeta_status'
]);
const METADATA_RECORD_SYSTEM_PROPERTY_SET = new Set(METADATA_RECORD_SYSTEM_PROPERTIES);
const METADATA_RECORD_UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function metadataRecordPdfLink(pdfPath) {
  const path=metadataRecordNormalizeVaultPath(pdfPath);
  if(!path) throw new Error('metadata record PDF path is empty');
  return `[[${path}]]`;
}

function metadataRecordPdfPathFromLink(value) {
  const text=String(value || '').trim();
  if(!text) return '';
  const wiki=/^\[\[([\s\S]+)\]\]$/.exec(text);
  if(!wiki) return metadataRecordNormalizeVaultPath(text);
  const target=String(wiki[1] || '').split('|',1)[0];
  return metadataRecordNormalizeVaultPath(target);
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
  const unknownSystem=Object.keys(frontmatter).filter(key=>String(key).startsWith('pdfmeta_') && !METADATA_RECORD_SYSTEM_PROPERTY_SET.has(key));
  if(unknownSystem.length) return {ok:false,error:`ukjente pdfmeta_ systemfelter: ${unknownSystem.join(', ')}`};
  const id=String(frontmatter.pdfmeta_id || '').trim().toLowerCase();
  if(!metadataRecordIsUuidV4(id)) return {ok:false,error:'pdfmeta_id er ikke UUID v4'};
  if(String(frontmatter.pdfmeta_type || '')!==METADATA_RECORD_TYPE) return {ok:false,error:`pdfmeta_type må være ${METADATA_RECORD_TYPE}`};
  if(Number(frontmatter.pdfmeta_version)!==METADATA_RECORD_FORMAT_VERSION) return {ok:false,error:`pdfmeta_version må være ${METADATA_RECORD_FORMAT_VERSION}`};
  const status=String(frontmatter.pdfmeta_status || '');
  if(![METADATA_RECORD_STATUS_ACTIVE,METADATA_RECORD_STATUS_MISSING].includes(status)) return {ok:false,error:'pdfmeta_status er ugyldig'};
  const pdfPath=metadataRecordPdfPathFromLink(frontmatter.pdfmeta_file);
  if(!pdfPath || !/\.pdf$/i.test(pdfPath)) return {ok:false,error:'pdfmeta_file må peke til en PDF'};

  const fields=Array.isArray(schema?.fields) ? schema.fields : [];
  const byProperty=new Map(fields.map(field=>[field.property,field]));
  const values={};
  for(const [key,raw] of Object.entries(frontmatter)) {
    if(METADATA_RECORD_SYSTEM_PROPERTY_SET.has(key) || String(key).startsWith('pdfmeta_')) continue;
    const field=byProperty.get(key);
    values[key]=field ? metadataRecordNormalizeFrontmatterValue(field,raw) : metadataRecordClone(raw);
  }
  return {ok:true,record:{id,pdfPath,status,values}};
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
  const pdfPath=metadataRecordNormalizeVaultPath(record.pdfPath);
  if(!pdfPath || !/\.pdf$/i.test(pdfPath)) throw new Error('metadata record PDF path er ugyldig');
  if(![METADATA_RECORD_STATUS_ACTIVE,METADATA_RECORD_STATUS_MISSING].includes(record.status)) throw new Error('metadata record status er ugyldig');

  const lines=['---'];
  lines.push(`pdfmeta_type: ${metadataRecordYamlScalar(METADATA_RECORD_TYPE)}`);
  lines.push(`pdfmeta_version: ${METADATA_RECORD_FORMAT_VERSION}`);
  lines.push(`pdfmeta_id: ${metadataRecordYamlScalar(String(record.id).toLowerCase())}`);
  lines.push(`pdfmeta_file: ${metadataRecordYamlScalar(metadataRecordPdfLink(pdfPath))}`);
  lines.push(`pdfmeta_status: ${metadataRecordYamlScalar(record.status)}`);

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
  for(const key of Object.keys(values).sort((a,b)=>a.localeCompare(b))) if(!seen.has(key) && !String(key).startsWith('pdfmeta_')) ordered.push(key);

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
  METADATA_RECORD_TYPE,
  METADATA_RECORDS_ROOT,
  METADATA_RECORD_STATUS_ACTIVE,
  METADATA_RECORD_STATUS_MISSING,
  METADATA_RECORD_SYSTEM_PROPERTIES,
  metadataRecordNormalizeVaultPath,
  metadataRecordIsUuidV4,
  metadataRecordPathFromId,
  metadataRecordIsPath,
  metadataRecordPdfLink,
  metadataRecordPdfPathFromLink,
  metadataRecordClone,
  metadataRecordIsEmptyUserValue,
  metadataRecordNormalizeFrontmatterValue,
  metadataRecordFromFrontmatter,
  metadataRecordSerializeMarkdown
});

module.exports=metadataRecordContract;
