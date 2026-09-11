'use strict';

// PDFium Gate Platform Contract — renderer text clipboard.
// Source-of-truth for the adapter bundled into release main.js.
const CLIPBOARD_TEXT_CONTRACT_VERSION = '0.1';

function createClipboardTextAdapter({ clipboard }) {
  if (!clipboard || typeof clipboard.readText !== 'function' || typeof clipboard.writeText !== 'function') {
    throw new Error('Electron clipboard.readText/writeText er ikke tilgjengelig');
  }

  function readText() {
    return String(clipboard.readText() || '');
  }

  function writeText(value) {
    clipboard.writeText(String(value ?? ''));
    return true;
  }

  return Object.freeze({
    contractVersion: CLIPBOARD_TEXT_CONTRACT_VERSION,
    readText,
    writeText
  });
}

module.exports = { CLIPBOARD_TEXT_CONTRACT_VERSION, createClipboardTextAdapter };
