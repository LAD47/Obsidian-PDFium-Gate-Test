'use strict';

function pdfiumTranslationPlaceholders(text) {
  return [...String(text || '').matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map(match=>match[1]);
}

function pdfiumInterpolateTranslation(template, params = {}) {
  return String(template || '').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match,key) => {
    return Object.prototype.hasOwnProperty.call(params,key) ? String(params[key]) : `{{${key}}}`;
  });
}

function createPdfiumI18n({ requestedLanguage='auto', obsidianApi=null, windowObject=null, translations={} } = {}) {
  let requested=pdfiumNormalizeLanguageSetting(requestedLanguage);
  const dictionaries=Object.create(null);
  for(const [locale,dictionary] of Object.entries(translations || {})) {
    if(dictionary && typeof dictionary==='object' && !Array.isArray(dictionary)) dictionaries[String(locale)]=dictionary;
  }
  const english=dictionaries.en || {};

  function resolvedLanguage() {
    return pdfiumResolveUiLanguage(requested,obsidianApi,windowObject);
  }

  function translate(key, params = {}) {
    const translationKey=String(key || '');
    const language=resolvedLanguage();
    const dictionary=dictionaries[language] || english;
    const template=Object.prototype.hasOwnProperty.call(dictionary,translationKey)
      ? dictionary[translationKey]
      : (Object.prototype.hasOwnProperty.call(english,translationKey) ? english[translationKey] : translationKey);
    return pdfiumInterpolateTranslation(template,params);
  }

  return Object.freeze({
    t:translate,
    getRequestedLanguage(){ return requested; },
    getResolvedLanguage:resolvedLanguage,
    setRequestedLanguage(value){ requested=pdfiumNormalizeLanguageSetting(value); return resolvedLanguage(); },
    hasKey(key){ return Object.prototype.hasOwnProperty.call(english,String(key || '')); }
  });
}

function pdfiumTranslateMetadataValidationMessage(i18n, message) {
  const t=(key,params)=>i18n?.t?.(key,params) || String(message || '');
  const raw=String(message || '').trim();
  if(!raw) return raw;
  const lower=raw.toLowerCase();
  const exact=new Map([
    ['feltet er påkrevd','validation.required'],
    ['velg minst én verdi','validation.multiselectRequired'],
    ['forventet heltall','validation.expectedInteger'],
    ['ugyldig desimaltall','validation.invalidDecimal'],
    ['time må være mellom 1 og 12','validation.hour12Range']
  ]);
  if(exact.has(lower)) return t(exact.get(lower));

  let match=/^forventet datoformat\s+(.+)$/i.exec(raw);
  if(match) return t('validation.expectedDateFormat',{format:match[1]});
  match=/^forventet tidsformat\s+(.+)$/i.exec(raw);
  if(match) return t('validation.expectedTimeFormat',{format:match[1]});
  match=/^forventet desimaltall med\s+(punktum|komma)$/i.exec(raw);
  if(match) {
    const separatorName=t(match[1].toLowerCase()==='punktum'?'validation.separator.dot':'validation.separator.comma');
    return t('validation.expectedDecimalSeparator',{separatorName});
  }
  match=/^ukjent felttype\s+(.+)$/i.exec(raw);
  if(match) return t('validation.unknownFieldType',{type:match[1]});

  const canonicalSuffixes=[
    [': must be string','validation.mustBeString'],
    [': shorter than min_length','validation.shorterThanMinimum'],
    [': longer than max_length','validation.longerThanMaximum'],
    [': invalid canonical date','validation.invalidDate'],
    [': outside date range','validation.outsideDateRange'],
    [': invalid canonical time','validation.invalidTime'],
    [': outside time range','validation.outsideTimeRange'],
    [': must be integer','validation.mustBeInteger'],
    [': outside numeric range','validation.outsideNumericRange'],
    [': must be finite number','validation.mustBeFiniteNumber'],
    [': must be boolean','validation.mustBeBoolean'],
    [': must be option value string','validation.mustBeOptionValue'],
    [': option does not exist','validation.optionMissing'],
    [': must be string array','validation.mustBeStringArray'],
    [': duplicate values','validation.duplicateValues'],
    [': fewer than min_items','validation.tooFewItems'],
    [': more than max_items','validation.tooManyItems'],
    [': must be non-empty string','validation.mustBeNonEmptyString']
  ];
  for(const [suffix,key] of canonicalSuffixes) if(lower.endsWith(suffix)) return t(key);
  match=/: option\s+(.+)\s+does not exist$/i.exec(raw);
  if(match) return t('validation.optionDoesNotExist',{value:match[1]});
  return raw;
}

module.exports={
  pdfiumTranslationPlaceholders,
  pdfiumInterpolateTranslation,
  createPdfiumI18n,
  pdfiumTranslateMetadataValidationMessage
};
