'use strict';

const METADATA_SCHEMA_FORMAT_VERSION = 1;
const METADATA_SCHEMA_ROOT = '.pdf-metadata';
const METADATA_SCHEMA_FILE_NAME = 'document-metadata-schema.json';
const METADATA_SCHEMA_PATH = `${METADATA_SCHEMA_ROOT}/${METADATA_SCHEMA_FILE_NAME}`;
const METADATA_SCHEMA_BACKUP_ROOT = '.pdf-metadata/backup/document-metadata-schema';
const METADATA_RESERVED_PREFIX = 'pdfmeta_';
const METADATA_PROPERTY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const METADATA_UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METADATA_FIELD_TYPES = Object.freeze(['text','date','time','integer','decimal','boolean','select','multiselect','link']);
const METADATA_RESERVED_PROPERTIES = Object.freeze(new Set([
  'tags','aliases','cssclasses','tag','alias','cssclass','file','note','formula','this'
]));

function metadataUuidV4() {
  if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const c = require('crypto');
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = c.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function metadataIsUuidV4(value) {
  return METADATA_UUID_V4_PATTERN.test(String(value || ''));
}

function metadataIsCanonicalDate(value) {
  const text = String(value || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function metadataIsCanonicalTime(value, precision = 'minute') {
  const text = String(value || '');
  const pattern = precision === 'second' ? /^(\d{2}):(\d{2}):(\d{2})$/ : /^(\d{2}):(\d{2})$/;
  const m = pattern.exec(text);
  if (!m) return false;
  const hour = Number(m[1]), minute = Number(m[2]), second = precision === 'second' ? Number(m[3]) : 0;
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}

function metadataDefaultConfigForType(type) {
  switch (type) {
    case 'text': return { min_length: 0, max_length: null };
    case 'date': return { min: null, max: null };
    case 'time': return { precision: 'minute', min: null, max: null };
    case 'integer':
    case 'decimal': return { min: null, max: null };
    case 'boolean': return {};
    case 'select': return { options: [] };
    case 'multiselect': return { min_items: 0, max_items: null, options: [] };
    case 'link': return { kind: 'internal' };
    default: return {};
  }
}

function metadataMakeOption(value, label, id = metadataUuidV4()) {
  return { id, value: String(value || '').trim(), label: String(label || '').trim(), active: true };
}

function metadataMakeField({ property, label, type = 'text', description = '', required = false, defaultValue = null, showInDocumentInfo = true, showInDefaultBase = true, config = null, id = metadataUuidV4() }) {
  return {
    id,
    property: String(property || '').trim(),
    label: String(label || '').trim(),
    description: String(description || ''),
    type,
    active: true,
    required: !!required,
    default: defaultValue,
    show_in_document_info: !!showInDocumentInfo,
    show_in_default_base: !!showInDefaultBase,
    config: config && typeof config === 'object' ? config : metadataDefaultConfigForType(type)
  };
}

function metadataDefaultSchema() {
  const ids = {
    documentDate:'7ec7d2be-62c8-4a21-83fd-66f2522d7301',
    documentTime:'c0e66ac0-5228-4b43-82e0-0266cf2cf89a',
    sender:'4a5982ae-f142-42d4-8b7e-77332956953f',
    documentType:'eb3f6b84-897d-467b-beba-052112391dd4',
    responseReceived:'77760968-faf2-4eb7-8652-2f1bc28fc333',
    responseReceivedDate:'b004696a-6374-48f2-a1b0-36a5136aadf7',
    responseSent:'62b772bc-0330-4981-872c-3ba56c8195e5',
    responseSentDate:'b28899d7-dbb1-42bd-bd30-509c0f5e0a27',
    responseSentLink:'69606cae-7fd5-447f-b715-00b71a70a66a'
  };
  return {
    format_version: METADATA_SCHEMA_FORMAT_VERSION,
    revision: 1,
    fields: [
      metadataMakeField({ id:ids.documentDate, property:'document_date', label:'Document date', type:'date' }),
      metadataMakeField({ id:ids.documentTime, property:'document_time', label:'Document time', type:'time' }),
      metadataMakeField({ id:ids.sender, property:'sender', label:'Sender', type:'text' }),
      metadataMakeField({
        id:ids.documentType,
        property:'document_type',
        label:'Document type',
        type:'select',
        config:{ options:[
          metadataMakeOption('decision','Decision','4e10087e-4e09-4fab-9aa3-8f201af57f87'),
          metadataMakeOption('letter','Letter','2041af74-6dfb-4093-a661-ff2a56dad11f'),
          metadataMakeOption('report','Report','0fb750b8-8ead-4634-a65e-c2a864ff6ced'),
          metadataMakeOption('memo','Memo','ca49c00e-d71b-4df2-b365-dc836229aa2f')
        ] }
      }),
      metadataMakeField({ id:ids.responseReceived, property:'response_received', label:'Response received', type:'boolean' }),
      metadataMakeField({ id:ids.responseReceivedDate, property:'response_received_date', label:'Response received date', type:'date' }),
      metadataMakeField({ id:ids.responseSent, property:'response_sent', label:'Response sent', type:'boolean' }),
      metadataMakeField({ id:ids.responseSentDate, property:'response_sent_date', label:'Response sent date', type:'date' }),
      metadataMakeField({ id:ids.responseSentLink, property:'response_sent_link', label:'Sent response', type:'link' })
    ]
  };
}

function metadataClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function metadataValidateOption(option, path, errors, seenIds, seenValues) {
  const keys = ['id','value','label','active'];
  if (!option || typeof option !== 'object' || Array.isArray(option)) { errors.push(`${path}: option must be an object`); return; }
  for (const key of Object.keys(option)) if (!keys.includes(key)) errors.push(`${path}: unknown option property ${key}`);
  if (!metadataIsUuidV4(option.id)) errors.push(`${path}.id: must be UUID v4`);
  else if (seenIds.has(option.id)) errors.push(`${path}.id: duplicate option id`); else seenIds.add(option.id);
  if (!METADATA_PROPERTY_PATTERN.test(String(option.value || ''))) errors.push(`${path}.value: must match ${METADATA_PROPERTY_PATTERN}`);
  else if (seenValues.has(option.value)) errors.push(`${path}.value: duplicate option value`); else seenValues.add(option.value);
  if (typeof option.label !== 'string' || !option.label.trim()) errors.push(`${path}.label: required`);
  if (typeof option.active !== 'boolean') errors.push(`${path}.active: must be boolean`);
}

function metadataValidateConfig(field, path, errors) {
  const cfg = field.config;
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) { errors.push(`${path}.config: must be an object`); return; }
  const checkOnly = allowed => { for (const key of Object.keys(cfg)) if (!allowed.includes(key)) errors.push(`${path}.config: unknown property ${key}`); };
  const nullableNumber = (key, integer = false) => {
    const v = cfg[key];
    if (v === null) return;
    if (typeof v !== 'number' || !Number.isFinite(v) || (integer && !Number.isInteger(v))) errors.push(`${path}.config.${key}: invalid number`);
  };
  const nullableInt = key => { const v=cfg[key]; if(v!==null && (!Number.isInteger(v) || v<0)) errors.push(`${path}.config.${key}: must be null or non-negative integer`); };
  switch (field.type) {
    case 'text':
      checkOnly(['min_length','max_length']); nullableInt('min_length'); nullableInt('max_length');
      if (cfg.min_length == null) errors.push(`${path}.config.min_length: required`);
      if (Number.isInteger(cfg.min_length) && Number.isInteger(cfg.max_length) && cfg.min_length > cfg.max_length) errors.push(`${path}.config: min_length > max_length`);
      break;
    case 'date':
      checkOnly(['min','max']);
      for (const key of ['min','max']) if (cfg[key] !== null && !metadataIsCanonicalDate(cfg[key])) errors.push(`${path}.config.${key}: invalid canonical date`);
      if (cfg.min && cfg.max && cfg.min > cfg.max) errors.push(`${path}.config: min > max`);
      break;
    case 'time': {
      checkOnly(['precision','min','max']);
      if (!['minute','second'].includes(cfg.precision)) errors.push(`${path}.config.precision: must be minute or second`);
      const precision = ['minute','second'].includes(cfg.precision) ? cfg.precision : 'minute';
      for (const key of ['min','max']) if (cfg[key] !== null && !metadataIsCanonicalTime(cfg[key], precision)) errors.push(`${path}.config.${key}: invalid canonical time`);
      if (cfg.min && cfg.max && cfg.min > cfg.max) errors.push(`${path}.config: min > max`);
      break;
    }
    case 'integer':
      checkOnly(['min','max']); nullableNumber('min', true); nullableNumber('max', true);
      if (cfg.min !== null && cfg.max !== null && cfg.min > cfg.max) errors.push(`${path}.config: min > max`);
      break;
    case 'decimal':
      checkOnly(['min','max']); nullableNumber('min'); nullableNumber('max');
      if (cfg.min !== null && cfg.max !== null && cfg.min > cfg.max) errors.push(`${path}.config: min > max`);
      break;
    case 'boolean':
      checkOnly([]);
      break;
    case 'select':
    case 'multiselect': {
      const allowed = field.type === 'select' ? ['options'] : ['min_items','max_items','options'];
      checkOnly(allowed);
      if (field.type === 'multiselect') {
        nullableInt('min_items'); nullableInt('max_items');
        if (cfg.min_items == null) errors.push(`${path}.config.min_items: required`);
        if (Number.isInteger(cfg.min_items) && Number.isInteger(cfg.max_items) && cfg.min_items > cfg.max_items) errors.push(`${path}.config: min_items > max_items`);
      }
      if (!Array.isArray(cfg.options)) errors.push(`${path}.config.options: must be array`);
      else {
        const ids=new Set(), values=new Set();
        cfg.options.forEach((option,index)=>metadataValidateOption(option,`${path}.config.options[${index}]`,errors,ids,values));
      }
      break;
    }
    case 'link':
      checkOnly(['kind']);
      if (!['internal','url'].includes(cfg.kind)) errors.push(`${path}.config.kind: must be internal or url`);
      break;
  }
}

function metadataValidateCanonicalValue(field, value, path, errors) {
  if (value === null) return;
  const cfg=field.config || {};
  switch (field.type) {
    case 'text':
      if (typeof value !== 'string') errors.push(`${path}: must be string`);
      else {
        if (value.length < (cfg.min_length || 0)) errors.push(`${path}: shorter than min_length`);
        if (Number.isInteger(cfg.max_length) && value.length > cfg.max_length) errors.push(`${path}: longer than max_length`);
      }
      break;
    case 'date':
      if (!metadataIsCanonicalDate(value)) errors.push(`${path}: invalid canonical date`);
      else if ((cfg.min && value < cfg.min) || (cfg.max && value > cfg.max)) errors.push(`${path}: outside date range`);
      break;
    case 'time': {
      const precision = cfg.precision || 'minute';
      if (!metadataIsCanonicalTime(value, precision)) errors.push(`${path}: invalid canonical time`);
      else if ((cfg.min && value < cfg.min) || (cfg.max && value > cfg.max)) errors.push(`${path}: outside time range`);
      break;
    }
    case 'integer':
      if (!Number.isInteger(value)) errors.push(`${path}: must be integer`);
      else if ((cfg.min !== null && value < cfg.min) || (cfg.max !== null && value > cfg.max)) errors.push(`${path}: outside numeric range`);
      break;
    case 'decimal':
      if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`${path}: must be finite number`);
      else if ((cfg.min !== null && value < cfg.min) || (cfg.max !== null && value > cfg.max)) errors.push(`${path}: outside numeric range`);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: must be boolean`);
      break;
    case 'select': {
      if (typeof value !== 'string') errors.push(`${path}: must be option value string`);
      else if (!Array.isArray(cfg.options) || !cfg.options.some(option=>option.value===value)) errors.push(`${path}: option does not exist`);
      break;
    }
    case 'multiselect': {
      if (!Array.isArray(value) || value.some(v=>typeof v!=='string')) errors.push(`${path}: must be string array`);
      else {
        if (new Set(value).size !== value.length) errors.push(`${path}: duplicate values`);
        const allowed=new Set(Array.isArray(cfg.options)?cfg.options.map(option=>option.value):[]);
        for (const v of value) if (!allowed.has(v)) errors.push(`${path}: option ${v} does not exist`);
        if (Number.isInteger(cfg.min_items) && value.length < cfg.min_items) errors.push(`${path}: fewer than min_items`);
        if (Number.isInteger(cfg.max_items) && value.length > cfg.max_items) errors.push(`${path}: more than max_items`);
      }
      break;
    }
    case 'link':
      if (typeof value !== 'string' || !value.trim()) errors.push(`${path}: must be non-empty string`);
      break;
  }
}

function metadataValidateSchema(schema) {
  const errors=[];
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return {ok:false,errors:['schema: must be an object']};
  for (const key of Object.keys(schema)) if (!['format_version','revision','fields'].includes(key)) errors.push(`schema: unknown property ${key}`);
  if (schema.format_version !== METADATA_SCHEMA_FORMAT_VERSION) errors.push(`format_version: expected ${METADATA_SCHEMA_FORMAT_VERSION}`);
  if (!Number.isInteger(schema.revision) || schema.revision < 1) errors.push('revision: must be integer >= 1');
  if (!Array.isArray(schema.fields)) errors.push('fields: must be array');
  else {
    const ids=new Set(), properties=new Set();
    schema.fields.forEach((field,index)=>{
      const path=`fields[${index}]`;
      if (!field || typeof field !== 'object' || Array.isArray(field)) { errors.push(`${path}: must be object`); return; }
      const allowed=['id','property','label','description','type','active','required','default','show_in_document_info','show_in_default_base','config'];
      for (const key of Object.keys(field)) if (!allowed.includes(key)) errors.push(`${path}: unknown property ${key}`);
      if (!metadataIsUuidV4(field.id)) errors.push(`${path}.id: must be UUID v4`);
      else if (ids.has(field.id)) errors.push(`${path}.id: duplicate`); else ids.add(field.id);
      if (!METADATA_PROPERTY_PATTERN.test(String(field.property || ''))) errors.push(`${path}.property: must match ${METADATA_PROPERTY_PATTERN}`);
      else {
        if (String(field.property).startsWith(METADATA_RESERVED_PREFIX)) errors.push(`${path}.property: reserved prefix ${METADATA_RESERVED_PREFIX}`);
        if (METADATA_RESERVED_PROPERTIES.has(field.property)) errors.push(`${path}.property: reserved property`);
        if (properties.has(field.property)) errors.push(`${path}.property: duplicate`); else properties.add(field.property);
      }
      if (typeof field.label !== 'string' || !field.label.trim()) errors.push(`${path}.label: required`);
      if (typeof field.description !== 'string') errors.push(`${path}.description: must be string`);
      if (!METADATA_FIELD_TYPES.includes(field.type)) errors.push(`${path}.type: unsupported type`);
      for (const key of ['active','required','show_in_document_info','show_in_default_base']) if (typeof field[key] !== 'boolean') errors.push(`${path}.${key}: must be boolean`);
      if (METADATA_FIELD_TYPES.includes(field.type)) {
        metadataValidateConfig(field,path,errors);
        metadataValidateCanonicalValue(field,field.default,`${path}.default`,errors);
      }
    });
  }
  return {ok:errors.length===0,errors};
}

const metadataSchemaContract = Object.freeze({
  METADATA_SCHEMA_FORMAT_VERSION,
  METADATA_SCHEMA_ROOT,
  METADATA_SCHEMA_FILE_NAME,
  METADATA_SCHEMA_PATH,
  METADATA_SCHEMA_BACKUP_ROOT,
  METADATA_RESERVED_PREFIX,
  METADATA_PROPERTY_PATTERN,
  METADATA_UUID_V4_PATTERN,
  METADATA_FIELD_TYPES,
  METADATA_RESERVED_PROPERTIES,
  metadataUuidV4,
  metadataIsUuidV4,
  metadataIsCanonicalDate,
  metadataIsCanonicalTime,
  metadataDefaultConfigForType,
  metadataMakeOption,
  metadataMakeField,
  metadataDefaultSchema,
  metadataClone,
  metadataValidateSchema,
  metadataValidateCanonicalValue
});

module.exports = metadataSchemaContract;
