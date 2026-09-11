'use strict';

const METADATA_BASE_PRESENTATION_CONTRACT_VERSION = '0.2';

function metadataBaseVisibleFields(schema) {
  return Array.isArray(schema?.fields)
    ? schema.fields.filter(field => field?.active === true && field?.show_in_default_base === true)
    : [];
}

function metadataBaseFormatFieldValue(registry, field, value, settings = {}) {
  if (!registry || typeof registry.format !== 'function') throw new Error('metadata field-type registry mangler');
  return registry.format(field, value, settings);
}

function metadataBasePrepareFieldUpdate(field, raw, settings = {}, registry = null) {
  if (!field || !String(field.property || '').trim()) return { ok:false, property:'', value:null, errors:['metadatafelt mangler property'] };
  if (!registry || typeof registry.parseNormalizeValidate !== 'function') return { ok:false, property:String(field.property), value:null, errors:['metadata field-type registry mangler'] };
  const parsed = registry.parseNormalizeValidate(field, raw, settings);
  return parsed.ok
    ? { ok:true, property:String(field.property), value:parsed.value, errors:[] }
    : { ok:false, property:String(field.property), value:null, errors:Array.isArray(parsed.errors) ? parsed.errors : [String(parsed.errors || 'Ugyldig verdi')] };
}

function metadataBasePresentFrontmatter(frontmatter, schema, settings = {}, registry = null) {
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) return { ok:false, reason:'frontmatter-missing', fields:[] };
  if (String(frontmatter.pdfmeta_type || '') !== 'pdf_document') return { ok:false, reason:'not-pdf-document-record', fields:[] };
  const fields = metadataBaseVisibleFields(schema).map(field => ({
    property:field.property,
    label:field.label,
    type:field.type,
    raw:Object.prototype.hasOwnProperty.call(frontmatter, field.property) ? frontmatter[field.property] : null,
    display:metadataBaseFormatFieldValue(registry, field, Object.prototype.hasOwnProperty.call(frontmatter, field.property) ? frontmatter[field.property] : null, settings)
  }));
  return { ok:true, fields };
}

module.exports = {
  METADATA_BASE_PRESENTATION_CONTRACT_VERSION,
  metadataBaseVisibleFields,
  metadataBaseFormatFieldValue,
  metadataBasePrepareFieldUpdate,
  metadataBasePresentFrontmatter
};
