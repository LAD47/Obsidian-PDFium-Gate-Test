'use strict';

const PDFIUM_UI_LANGUAGE_AUTO = 'auto';
const PDFIUM_UI_LANGUAGE_ENGLISH = 'en';
const PDFIUM_UI_LANGUAGE_NORWEGIAN_BOKMAL = 'nb';
const PDFIUM_UI_LANGUAGES = Object.freeze([
  PDFIUM_UI_LANGUAGE_AUTO,
  PDFIUM_UI_LANGUAGE_ENGLISH,
  PDFIUM_UI_LANGUAGE_NORWEGIAN_BOKMAL
]);

function pdfiumNormalizeLanguageCode(value) {
  const raw=String(value || '').trim().replace('_','-');
  const lower=raw.toLowerCase();
  if(lower==='nb' || lower.startsWith('nb-') || lower==='no' || lower.startsWith('no-')) return PDFIUM_UI_LANGUAGE_NORWEGIAN_BOKMAL;
  if(lower==='en' || lower.startsWith('en-')) return PDFIUM_UI_LANGUAGE_ENGLISH;
  return PDFIUM_UI_LANGUAGE_ENGLISH;
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
  PDFIUM_UI_LANGUAGES,
  pdfiumNormalizeLanguageCode,
  pdfiumNormalizeLanguageSetting,
  pdfiumReadObsidianLanguage,
  pdfiumResolveUiLanguage
};
