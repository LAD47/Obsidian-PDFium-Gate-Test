'use strict';

// PDFium Gate Platform Contract — renderer text measurement.
// Source-of-truth for the adapter bundled into release main.js.
const TEXT_METRICS_CONTRACT_VERSION = '0.1';

function createTextMetricsAdapter({ document: documentObject }) {
  function measurePrefixFractions(value, options = {}) {
    const text = String(value ?? '');
    const n = text.length;
    if (!n) return { ok:true, fractions:[0], reason:'empty-text', error:null };

    if (!documentObject || typeof documentObject.createElement !== 'function') {
      return {
        ok:false, fractions:null, reason:'document-unavailable',
        error:'document.createElement er ikke tilgjengelig for tekstmåling'
      };
    }

    try {
      const canvas = documentObject.createElement('canvas');
      const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
      if (!ctx || typeof ctx.measureText !== 'function') {
        return {
          ok:false, fractions:null, reason:'canvas-context-unavailable',
          error:'Canvas 2D measureText er ikke tilgjengelig'
        };
      }

      const family = String(options.fontFamily || 'sans-serif').replace(/["']/g, '');
      const size = Math.max(1, Number(options.fontSize) || 12);
      ctx.font = `${size}px "${family}", sans-serif`;
      const total = Number(ctx.measureText(text).width || 0);
      if (!(Number.isFinite(total) && total > 0.01)) {
        return {
          ok:false, fractions:null, reason:'invalid-total-width',
          error:'Canvas returnerte ugyldig total tekstbredde'
        };
      }

      const fractions = [0];
      for (let i = 1; i <= n; i += 1) {
        const width = Number(ctx.measureText(text.slice(0, i)).width || 0);
        fractions.push(Math.max(0, Math.min(1, width / total)));
      }
      return { ok:true, fractions, reason:'canvas-2d-measure-text', error:null };
    } catch (error) {
      return {
        ok:false, fractions:null, reason:'measure-failed',
        error:error instanceof Error ? error.message : String(error)
      };
    }
  }

  return Object.freeze({
    contractVersion: TEXT_METRICS_CONTRACT_VERSION,
    measurePrefixFractions
  });
}

module.exports = { TEXT_METRICS_CONTRACT_VERSION, createTextMetricsAdapter };
