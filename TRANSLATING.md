# Translating PDFium Gate Test

English (`src/i18n/en.json`) is the canonical translation source. Other locale files may be incomplete; missing strings fall back to English.

## Add or improve a translation

1. Copy `src/i18n/en.json` to a locale file such as `de.json`.
2. Translate only the values on the right-hand side.
3. Keep every translation key unchanged.
4. Keep placeholders such as `{{format}}`, `{{type}}`, and `{{value}}` unchanged.
5. Run `npm run check:i18n` before opening a pull request.
6. Run `npm run check:i18n-ui` if your change touches an already-migrated UI surface.

## Do not translate

- translation keys
- UUIDs
- `pdfmeta_*` properties
- stable machine values such as `active`, `missing`, `letter`, and `decision`
- file paths and code identifiers
- user-defined metadata labels or category names
- diagnostic JSON/property keys intended for bug reports

## Source-code language

Source-code identifiers, technical comments, architecture documentation, and contributor documentation use English. User-facing interface text belongs in the i18n locale files.

## Partial translations are welcome

A locale does not need 100% coverage to be useful. Missing keys fall back to English. Unknown keys and placeholder mismatches are rejected by `npm run check:i18n`.


## UI migration protection

`npm run check:i18n-ui` prevents hard-coded user-facing text from re-entering modules that have already been migrated. The protected set grows module-by-module during the initial internationalization work. See `I18N-AUDIT.md` for the current migration inventory.


### Commands and diagnostics
Translate Command Palette display names and user-facing diagnostic labels/buttons. Never translate command IDs, JSON diagnostic keys, UUIDs, paths, `pdfmeta_*` properties, or canonical machine values.

## Factory defaults and persistent labels

Factory defaults are **not translation resources**. New default category names, metadata field labels/options, and standard Base presentation text are canonical English regardless of UI language. Locale files should not contain `factory.*` keys.

After creation, category names and metadata labels/options are user-owned persistent data and may be edited freely by the user. Translation changes must never rewrite them or change UUIDs, metadata property names, option machine values, or other stable identifiers.
