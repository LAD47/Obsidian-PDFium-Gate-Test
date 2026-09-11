'use strict';

// PDFium Gate text-normalization boundary.
//
// Chromium native selectionText is the textual truth for mouse selections.
// PDF.js textContent is used only to map that text back to native Obsidian
// selection item/offset coordinates. This module is the ONLY place where
// known representation differences between those two text sources should be
// described.
//
// Rule policy:
//   active       = already-observed behavior with a narrow, tested contract.
//   candidate    = likely future mismatch; documented here but NEVER applied.
//
// Add new production rules only after a diagnostic proves the exact mismatch.

const TEXT_NORMALIZATION_CATALOG = Object.freeze({
  contractVersion: '0.1',

  activeGlobalIgnore: Object.freeze([
    {
      id: 'non-whitespace-c0-c1-controls',
      kind: 'code-point-range',
      values: ['U+0000..U+001F except whitespace', 'U+007F..U+009F except whitespace'],
      reason: 'PDF text streams can contain invisible formatting/control codes that Chromium omits.'
    },
    {
      id: 'soft-hyphen',
      kind: 'code-point',
      values: ['U+00AD'],
      reason: 'Discretionary soft hyphen is formatting rather than copied text in the existing link contract.'
    },
    {
      id: 'unicode-noncharacters',
      kind: 'code-point-range',
      values: ['U+FDD0..U+FDEF', 'U+FFFE', 'U+FFFF'],
      reason: 'Unicode noncharacters must not participate in textual matching.'
    },
    {
      id: 'zero-width-formatting',
      kind: 'code-point',
      values: ['U+200B', 'U+200C', 'U+200D', 'U+2060', 'U+FEFF'],
      reason: 'Existing PDFium Gate behavior treats these zero-width formatting characters as non-text for link matching.',
      caution: 'U+200C/U+200D can be linguistically meaningful in some scripts; preserve this existing behavior until multilingual tests justify a change.'
    }
  ]),

  activeWhitespaceEquivalence: Object.freeze([
    {
      id: 'unicode-whitespace-collapse',
      kind: 'whitespace',
      values: ['JavaScript Unicode whitespace, including CR/LF/TAB/NBSP where matched by \\s'],
      reason: 'Compact link matching intentionally ignores layout whitespace.'
    }
  ]),

  activeContextualMismatch: Object.freeze([
    {
      id: 'pdfjs-discretionary-line-break-hyphen-minus',
      kind: 'contextual-skip-pdf-char',
      pdfChars: ['U+002D HYPHEN-MINUS'],
      action: 'skip-pdf-char',
      reason: 'PDF.js may represent a discretionary line-break hyphen while Chromium selectionText returns the joined word.',
      proofRequired: [
        'PDF.js current item is exactly "-" at offset 0',
        'an explicit PDF.js hasEOL marker occurs before the next meaningful text item',
        'Chromium does not expect "-" at this position',
        'the next compact PDF.js character exactly equals the Chromium expected character'
      ]
    }
  ]),

  candidates: Object.freeze([
    {
      id: 'alternate-hyphen-code-points',
      status: 'candidate',
      values: [
        'U+2010 HYPHEN',
        'U+2011 NON-BREAKING HYPHEN',
        'U+2012 FIGURE DASH',
        'U+2013 EN DASH',
        'U+2212 MINUS SIGN',
        'U+FF0D FULLWIDTH HYPHEN-MINUS'
      ],
      note: 'Do not normalize these automatically: each can be real semantic punctuation. Activate only with contextual evidence from diagnostics.'
    },
    {
      id: 'presentation-ligatures',
      status: 'candidate',
      values: ['U+FB00 ﬀ', 'U+FB01 ﬁ', 'U+FB02 ﬂ', 'U+FB03 ﬃ', 'U+FB04 ﬄ', 'U+FB05 ﬅ', 'U+FB06 ﬆ'],
      note: 'PDF.js and Chromium may expose ligatures differently. Expansion must preserve item/offset mapping and therefore needs a dedicated tested rule.'
    },
    {
      id: 'unicode-normalization-form',
      status: 'candidate',
      values: ['NFC/NFD composed vs decomposed characters'],
      note: 'Potential mismatch for accented characters. Do not normalize globally until offset mapping across combining marks is explicitly tested.'
    },
    {
      id: 'space-variants-not-covered-by-runtime-whitespace',
      status: 'candidate',
      values: ['U+00A0 NBSP', 'U+202F NARROW NBSP', 'U+2007 FIGURE SPACE'],
      note: 'Normally handled by Unicode whitespace collapsing in the current runtime; retained in the catalog as a regression watch item.'
    }
  ])
});

const EXACT_IGNORABLE_CODE_POINTS = new Set([
  0x00AD,
  0xFFFE,
  0xFFFF,
  0x200B,
  0x200C,
  0x200D,
  0x2060,
  0xFEFF
]);

function isObsidianLinkIgnorableChar(ch) {
  if (!ch) return true;
  const cp = ch.charCodeAt(0);
  // Preserve the canonical hyphen-join policy byte-for-byte at the policy level.
  if (((cp >= 0x0000 && cp <= 0x001F) || (cp >= 0x007F && cp <= 0x009F)) && !/\s/u.test(ch)) return true;
  if (EXACT_IGNORABLE_CODE_POINTS.has(cp)) return true;
  if (cp >= 0xFDD0 && cp <= 0xFDEF) return true;
  return false;
}

function isPdfJsDiscretionaryLineBreakHyphen(items, mappedCaret) {
  // Canonical rule: keep the proof narrow to standalone U+002D followed by
  // explicit EOL structure before the next meaningful PDF.js text item.
  const itemIndex = Number(mappedCaret?.itemIndex);
  const offset = Number(mappedCaret?.offset);
  if (![itemIndex, offset].every(Number.isFinite)) return false;
  const item = items[itemIndex] || {};
  const str = String(item.str || '');
  if (str !== '-' || offset !== 0) return false;

  let sawEol = !!item.hasEOL;
  for (let i = itemIndex + 1; i < Math.min(items.length, itemIndex + 5); i += 1) {
    const next = items[i] || {};
    if (next.hasEOL) sawEol = true;
    const nextStr = String(next.str || '');
    let hasMeaningfulText = false;
    for (let j = 0; j < nextStr.length; j += 1) {
      const ch = nextStr[j];
      if (!isObsidianLinkIgnorableChar(ch) && !/\s/u.test(ch)) {
        hasMeaningfulText = true;
        break;
      }
    }
    if (hasMeaningfulText) return sawEol;
  }
  return false;
}

const ACTIVE_CONTEXTUAL_RULES = Object.freeze([
  Object.freeze({
    id: 'pdfjs-discretionary-line-break-hyphen-minus',
    action: 'skip-pdf-char',
    matches(context) {
      const actual = String(context?.actualChar || '');
      const expected = String(context?.expectedChar || '');
      const nextActual = String(context?.nextActualChar || '');
      if (actual !== '-' || expected === '-' || nextActual !== expected) return false;
      return isPdfJsDiscretionaryLineBreakHyphen(context?.items || [], context?.mappedCaret || null);
    }
  })
]);

function resolvePdfJsTextMismatch(context) {
  for (const rule of ACTIVE_CONTEXTUAL_RULES) {
    let matched = false;
    try { matched = !!rule.matches(context); } catch (_) { matched = false; }
    if (matched) {
      return {
        matched: true,
        ruleId: rule.id,
        action: rule.action
      };
    }
  }
  return { matched:false, ruleId:null, action:null };
}

function getTextNormalizationCatalog() {
  // Return a clone so diagnostics/tests cannot mutate the policy catalog.
  return JSON.parse(JSON.stringify(TEXT_NORMALIZATION_CATALOG));
}

module.exports = {
  TEXT_NORMALIZATION_CATALOG,
  getTextNormalizationCatalog,
  isObsidianLinkIgnorableChar,
  isPdfJsDiscretionaryLineBreakHyphen,
  resolvePdfJsTextMismatch
};
