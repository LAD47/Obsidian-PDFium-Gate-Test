'use strict';

const PDFIUM_UI_LANGUAGE_AUTO = 'auto';
const PDFIUM_UI_LANGUAGE_ENGLISH = 'en';
const PDFIUM_UI_LANGUAGE_NORWEGIAN_BOKMAL = 'nb';
const PDFIUM_UI_LANGUAGE_GERMAN = 'de';
const PDFIUM_UI_LANGUAGE_SPANISH = 'es';
const PDFIUM_UI_LANGUAGE_SWEDISH = 'sv';
const PDFIUM_UI_LANGUAGE_DANISH = 'da';
const PDFIUM_UI_LANGUAGE_FRENCH = 'fr';
const PDFIUM_UI_LANGUAGE_CODES = Object.freeze([
  PDFIUM_UI_LANGUAGE_ENGLISH,
  PDFIUM_UI_LANGUAGE_NORWEGIAN_BOKMAL,
  PDFIUM_UI_LANGUAGE_GERMAN,
  PDFIUM_UI_LANGUAGE_SPANISH,
  PDFIUM_UI_LANGUAGE_SWEDISH,
  PDFIUM_UI_LANGUAGE_DANISH,
  PDFIUM_UI_LANGUAGE_FRENCH
]);
const PDFIUM_UI_LANGUAGES = Object.freeze([
  PDFIUM_UI_LANGUAGE_AUTO,
  ...PDFIUM_UI_LANGUAGE_CODES
]);
const PDFIUM_UI_LANGUAGE_LABELS = Object.freeze({
  en:'English',
  nb:'Norsk bokmål',
  de:'Deutsch',
  es:'Español',
  sv:'Svenska',
  da:'Dansk',
  fr:'Français'
});

function pdfiumNormalizeLanguageCode(value) {
  const raw=String(value || '').trim().replace('_','-');
  const lower=raw.toLowerCase();
  if(lower==='nb' || lower.startsWith('nb-') || lower==='no' || lower.startsWith('no-')) return PDFIUM_UI_LANGUAGE_NORWEGIAN_BOKMAL;
  const base=lower.split('-')[0];
  return PDFIUM_UI_LANGUAGE_CODES.includes(base) ? base : PDFIUM_UI_LANGUAGE_ENGLISH;
}

function pdfiumNormalizeLanguageSetting(value) {
  const raw=String(value || '').trim().toLowerCase();
  return PDFIUM_UI_LANGUAGES.includes(raw) ? raw : PDFIUM_UI_LANGUAGE_AUTO;
}

function pdfiumReadObsidianLanguage(obsidianApi, windowObject) {
  try {
    if(obsidianApi && typeof obsidianApi.getLanguage === 'function') {
      const resolved=obsidianApi.getLanguage();
      if(resolved) return String(resolved);
    }
  } catch (_) {}

  // Compatibility fallback is intentionally isolated here. It is not a production
  // dependency for any other feature and can be replaced if Obsidian changes its API.
  try {
    const stored=windowObject?.localStorage?.getItem?.('language');
    if(stored) return String(stored);
  } catch (_) {}

  try {
    const browserLanguage=windowObject?.navigator?.language;
    if(browserLanguage) return String(browserLanguage);
  } catch (_) {}
  return PDFIUM_UI_LANGUAGE_ENGLISH;
}

function pdfiumResolveUiLanguage(requestedLanguage, obsidianApi, windowObject) {
  const requested=pdfiumNormalizeLanguageSetting(requestedLanguage);
  if(requested!==PDFIUM_UI_LANGUAGE_AUTO) return requested;
  return pdfiumNormalizeLanguageCode(pdfiumReadObsidianLanguage(obsidianApi,windowObject));
}

module.exports={
  PDFIUM_UI_LANGUAGE_AUTO,
  PDFIUM_UI_LANGUAGE_ENGLISH,
  PDFIUM_UI_LANGUAGE_NORWEGIAN_BOKMAL,
  PDFIUM_UI_LANGUAGE_GERMAN,
  PDFIUM_UI_LANGUAGE_SPANISH,
  PDFIUM_UI_LANGUAGE_SWEDISH,
  PDFIUM_UI_LANGUAGE_DANISH,
  PDFIUM_UI_LANGUAGE_FRENCH,
  PDFIUM_UI_LANGUAGE_CODES,
  PDFIUM_UI_LANGUAGES,
  PDFIUM_UI_LANGUAGE_LABELS,
  pdfiumNormalizeLanguageCode,
  pdfiumNormalizeLanguageSetting,
  pdfiumReadObsidianLanguage,
  pdfiumResolveUiLanguage
};
