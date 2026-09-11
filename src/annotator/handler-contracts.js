'use strict';

// One request type -> one handler owner. Handler helper dependencies are injected
// by runtime-message-dispatch.js and verified against actual deps.<name> usage.
const ANNOTATOR_HANDLER_CONTRACTS = Object.freeze({
  "prewarm-keyboard-model": {
    "file": "01-prewarm-keyboard-model.js",
    "functionName": "handlePrewarmKeyboardModel",
    "requires": [
      "buildKeyboardTextModel",
      "keyboardArtifactIndexCache",
      "keyboardGlyphModelCache",
      "keyboardTextModelCache",
      "putKeyboardArtifactIndexCache",
      "putKeyboardGlyphModelCache",
      "putKeyboardTextModelCache",
      "scanArtifactRawIndexes",
      "send"
    ]
  },
  "keyboard-expand-selection": {
    "file": "02-keyboard-expand-selection.js",
    "functionName": "handleKeyboardExpandSelection",
    "requires": [
      "buildKeyboardTextModel",
      "dedupeAndMergeRects",
      "glyphRectsForRawRange",
      "keyboardArtifactIndexCache",
      "keyboardGlyphModelCache",
      "keyboardTextModelCache",
      "normalizeSearchText",
      "putKeyboardArtifactIndexCache",
      "putKeyboardGlyphModelCache",
      "putKeyboardTextModelCache",
      "scanArtifactRawIndexes",
      "send"
    ]
  },
  "filter-selection-artifacts": {
    "file": "03-filter-selection-artifacts.js",
    "functionName": "handleFilterSelectionArtifacts",
    "requires": [
      "buildKeyboardTextModel",
      "dedupeAndMergeRects",
      "glyphRectsForRawRange",
      "keyboardArtifactIndexCache",
      "keyboardGlyphModelCache",
      "keyboardTextModelCache",
      "normalizeSearchText",
      "putKeyboardArtifactIndexCache",
      "putKeyboardGlyphModelCache",
      "putKeyboardTextModelCache",
      "scanArtifactRawIndexes",
      "scoreGesturePointsAgainstTopRects",
      "send"
    ]
  },
  "find-selection": {
    "file": "04-find-selection.js",
    "functionName": "handleFindSelection",
    "requires": [
      "dedupeAndMergeRects",
      "executeSearch",
      "glyphRectsForRawRange",
      "makeSearchCandidates",
      "makeSelectionChunks",
      "normalizePdfTextWithMap",
      "normalizeSearchText",
      "searchChunkAdaptive",
      "send"
    ]
  },
  "inspect-point-highlights": {
    "file": "05-inspect-point-highlights.js",
    "functionName": "handleInspectPointHighlights",
    "requires": [
      "pdfiumGateHighlightGroupKey",
      "send"
    ]
  },
  "inspect-selection-highlights": {
    "file": "06-inspect-selection-highlights.js",
    "functionName": "handleInspectSelectionHighlights",
    "requires": [
      "rectArea",
      "rectSetCoverage",
      "send"
    ]
  },
  "read-existing-highlight-selection": {
    "file": "07-read-existing-highlight-selection.js",
    "functionName": "handleReadExistingHighlightSelection",
    "requires": [
      "buildKeyboardTextModel",
      "normalizeSearchText",
      "pdfiumGateHighlightGroupKey",
      "rectArea",
      "rectIntersectionArea",
      "send"
    ]
  },
  "modify-existing-highlight": {
    "file": "08-modify-existing-highlight.js",
    "functionName": "handleModifyExistingHighlight",
    "requires": [
      "pdfiumGateHighlightGroupKey",
      "send"
    ]
  },
  "write-selection-highlight": {
    "file": "09-write-selection-highlight.js",
    "functionName": "handleWriteSelectionHighlight",
    "requires": [
      "boundingRect",
      "send"
    ]
  },
  "write-highlight": {
    "file": "10-write-highlight.js",
    "functionName": "handleWriteHighlight",
    "requires": [
      "send"
    ]
  }
});

module.exports = { ANNOTATOR_HANDLER_CONTRACTS };
