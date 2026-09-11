'use strict';

// PDFium Gate Platform Contract — exact PDF iframe identity inside an Obsidian window.
// Source-of-truth for the adapter bundled into release main-bridge.js.
const PDF_IFRAME_CONTRACT_VERSION = '0.1';

function pdfTokenFromIframeSrc(src) {
  const text = String(src || '');
  const match = text.match(/\/pdf\/([^/?#]+)\.pdf(?:[?#].*)?$/i);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); }
  catch (_) { return match[1]; }
}

function resolveExactPdfIframeCandidates(candidates, token) {
  const safeToken = String(token || '').trim();
  const list = Array.isArray(candidates) ? candidates : [];
  if (!safeToken) {
    return {
      ok:false, token:null, match:null, candidates:list,
      reason:'missing-token', matchCount:0, candidateCount:list.length,
      error:'PDF-token mangler'
    };
  }

  const matches = list.filter(candidate => pdfTokenFromIframeSrc(candidate?.src) === safeToken);
  if (matches.length === 1) {
    return {
      ok:true, token:safeToken, match:matches[0], candidates:list,
      reason:'exact-src-token', matchCount:1, candidateCount:list.length,
      error:null
    };
  }
  if (matches.length === 0) {
    return {
      ok:false, token:safeToken, match:null, candidates:list,
      reason:'not-found', matchCount:0, candidateCount:list.length,
      error:'Eksakt PDFium iframe ble ikke funnet'
    };
  }
  return {
    ok:false, token:safeToken, match:null, candidates:list,
    reason:'ambiguous', matchCount:matches.length, candidateCount:list.length,
    error:'Flere PDFium iframes matcher samme token'
  };
}

function buildExactPdfIframeRectScript(token) {
  const safeToken = String(token || '').trim();
  const tokenParserSource = pdfTokenFromIframeSrc.toString();
  const resolverSource = resolveExactPdfIframeCandidates.toString();
  return `(() => {
    try {
      const pdfTokenFromIframeSrc = ${tokenParserSource};
      const resolveExactPdfIframeCandidates = ${resolverSource};
      const token = ${JSON.stringify(safeToken)};
      const frames = Array.from(document.querySelectorAll('iframe.pdfium-gate-frame'));
      const candidates = frames.map((frame, index) => {
        const r = frame.getBoundingClientRect();
        return {
          index,
          src:String(frame.src || ''),
          rect:{left:Number(r.left||0), top:Number(r.top||0), width:Number(r.width||0), height:Number(r.height||0)}
        };
      });
      return resolveExactPdfIframeCandidates(candidates, token);
    } catch (e) {
      return {
        ok:false, token:${JSON.stringify(safeToken)}, match:null, candidates:[],
        reason:'script-failed', matchCount:0, candidateCount:0,
        error:String(e && e.message || e)
      };
    }
  })()`;
}

function createPdfIframeAdapter() {
  async function resolveExact(ownerWc, token) {
    const safeToken = String(token || '').trim();
    if (!safeToken) {
      return {
        ok:false, token:null, match:null, candidates:[],
        reason:'missing-token', matchCount:0, candidateCount:0,
        error:'PDF-token mangler'
      };
    }
    const target = ownerWc?.mainFrame && typeof ownerWc.mainFrame.executeJavaScript === 'function'
      ? ownerWc.mainFrame
      : ownerWc;
    if (!target || typeof target.executeJavaScript !== 'function') {
      return {
        ok:false, token:safeToken, match:null, candidates:[],
        reason:'execute-unavailable', matchCount:0, candidateCount:0,
        error:'Obsidian mainFrame executeJavaScript ikke tilgjengelig'
      };
    }
    try {
      const result = await target.executeJavaScript(buildExactPdfIframeRectScript(safeToken), true);
      return result && typeof result === 'object'
        ? result
        : {
            ok:false, token:safeToken, match:null, candidates:[],
            reason:'invalid-result', matchCount:0, candidateCount:0,
            error:'ugyldig iframe-rect resultat'
          };
    } catch (error) {
      return {
        ok:false, token:safeToken, match:null, candidates:[],
        reason:'execute-failed', matchCount:0, candidateCount:0,
        error:error instanceof Error ? error.message : String(error)
      };
    }
  }

  return Object.freeze({
    contractVersion: PDF_IFRAME_CONTRACT_VERSION,
    resolveExact
  });
}

module.exports = {
  PDF_IFRAME_CONTRACT_VERSION,
  pdfTokenFromIframeSrc,
  resolveExactPdfIframeCandidates,
  buildExactPdfIframeRectScript,
  createPdfIframeAdapter
};
