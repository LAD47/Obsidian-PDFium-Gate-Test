'use strict';

// PDFium Gate Platform Contract — OS cursor position in screen coordinates.
// Source-of-truth for the adapter bundled into release main-bridge.js.
const SCREEN_POINT_CONTRACT_VERSION = '0.1';

function createScreenPointAdapter({ screen }) {
  if (!screen || typeof screen.getCursorScreenPoint !== 'function') {
    throw new Error('screen.getCursorScreenPoint er ikke tilgjengelig');
  }

  function getCursorScreenPoint() {
    try {
      const raw = screen.getCursorScreenPoint();
      const point = raw ? { x:Number(raw.x), y:Number(raw.y) } : null;
      if (!point || ![point.x, point.y].every(Number.isFinite)) {
        return {
          ok:false, point:null, reason:'invalid-point',
          error:'Electron screen returnerte ugyldig musepekerposisjon'
        };
      }
      return { ok:true, point, reason:'electron-screen', error:null };
    } catch (error) {
      return {
        ok:false, point:null, reason:'read-failed',
        error:error instanceof Error ? error.message : String(error)
      };
    }
  }

  return Object.freeze({
    contractVersion: SCREEN_POINT_CONTRACT_VERSION,
    getCursorScreenPoint
  });
}

module.exports = {
  SCREEN_POINT_CONTRACT_VERSION,
  createScreenPointAdapter
};
