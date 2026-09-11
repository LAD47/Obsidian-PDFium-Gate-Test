'use strict';

// PDFium Gate Platform Contract — exact Chromium internal PDF wrapper frame identity.
// Source-of-truth for the adapter bundled into release main-bridge.js.
const PDF_WRAPPER_FRAME_CONTRACT_VERSION = '0.2';

function pdfTokenFromWrapperFrameUrl(url) {
  const text = String(url || '');
  const match = text.match(/^http:\/\/127\.0\.0\.1:\d+\/pdf\/([^/?#]+)\.pdf(?:[?#].*)?$/i);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); }
  catch (_) { return match[1]; }
}

function createPdfWrapperFrameAdapter({ listFrameSubtree }) {
  if (typeof listFrameSubtree !== 'function') {
    throw new Error('listFrameSubtree må være en funksjon');
  }

  function enumerate(pdfTarget, token) {
    const safeToken = String(token || '').trim();
    if (!safeToken) {
      return {
        ok:false, token:null, frames:[], candidates:[], matches:[], reason:'missing-token',
        matchCount:0, candidateCount:0, error:'PDF-token mangler'
      };
    }
    if (!pdfTarget) {
      return {
        ok:false, token:safeToken, frames:[], candidates:[], matches:[], reason:'missing-target',
        matchCount:0, candidateCount:0, error:'Embedded PDF-target mangler'
      };
    }
    let frames = [];
    try { frames = listFrameSubtree(pdfTarget) || []; }
    catch (error) {
      return {
        ok:false, token:safeToken, frames:[], candidates:[], matches:[], reason:'enumeration-failed',
        matchCount:0, candidateCount:0,
        error:error instanceof Error ? error.message : String(error)
      };
    }
    const candidates = frames.filter(frame => {
      try { return !!pdfTokenFromWrapperFrameUrl(frame?.url); }
      catch (_) { return false; }
    });
    const matches = candidates.filter(frame => {
      try { return pdfTokenFromWrapperFrameUrl(frame?.url) === safeToken; }
      catch (_) { return false; }
    });
    return {ok:true, token:safeToken, frames, candidates, matches, reason:null, matchCount:matches.length, candidateCount:candidates.length, error:null};
  }

  function preferredPhysicalMatch(pdfTarget, matches) {
    let preferred = null;
    try { preferred = pdfTarget?.wrapperFrame || null; } catch (_) {}
    if (!preferred) return null;
    let processId = null, routingId = null;
    try { processId = Number(preferred.processId); } catch (_) {}
    try { routingId = Number(preferred.routingId); } catch (_) {}
    if (!Number.isFinite(processId) || !Number.isFinite(routingId)) return null;
    return matches.find(frame => {
      try { return Number(frame?.processId) === processId && Number(frame?.routingId) === routingId; }
      catch (_) { return false; }
    }) || null;
  }

  function successfulFrameResult(base, frame, reason, matchCount=base.matches.length) {
    if (typeof frame?.executeJavaScript !== 'function') {
      return {
        ok:false, token:base.token, frame:null, candidates:base.candidates, reason:`${reason}-execute-unavailable`,
        matchCount, candidateCount:base.candidates.length,
        error:'Chromium PDF-wrapper frame mangler executeJavaScript()'
      };
    }
    return {
      ok:true, token:base.token, frame, candidates:base.candidates, reason,
      matchCount, candidateCount:base.candidates.length, error:null
    };
  }

  function resolveExact(pdfTarget, token) {
    const base = enumerate(pdfTarget, token);
    if (!base.ok) return {ok:false, token:base.token, frame:null, candidates:base.candidates, reason:base.reason, matchCount:base.matchCount, candidateCount:base.candidateCount, error:base.error};
    const { matches } = base;
    if (matches.length === 0) {
      return {
        ok:false, token:base.token, frame:null, candidates:base.candidates, reason:'not-found',
        matchCount:0, candidateCount:base.candidates.length,
        error:'Eksakt Chromium PDF-wrapper frame ble ikke funnet'
      };
    }
    if (matches.length > 1) {
      // Electron 43 can retain stale duplicate token-like frames. The canonical
      // target already carries its physical wrapper identity, so only that
      // processId+routingId pair may disambiguate the candidates.
      const physical = preferredPhysicalMatch(pdfTarget, matches);
      if (physical) return successfulFrameResult(base, physical, 'target-physical-frame-disambiguation');
      return {
        ok:false, token:base.token, frame:null, candidates:base.candidates, reason:'ambiguous',
        matchCount:matches.length, candidateCount:base.candidates.length,
        error:'Flere Chromium PDF-wrapper frames matcher samme token og ingen eksplisitt fysisk target-identitet kan skille dem'
      };
    }
    return successfulFrameResult(base, matches[0], 'exact-wrapper-url-token', 1);
  }

  async function resolveExactVerified(pdfTarget, token) {
    const base = enumerate(pdfTarget, token);
    if (!base.ok) return {ok:false, token:base.token, frame:null, candidates:base.candidates, reason:base.reason, matchCount:base.matchCount, candidateCount:base.candidateCount, verification:[], error:base.error};
    if (base.matches.length === 0) {
      return {
        ok:false, token:base.token, frame:null, candidates:base.candidates, reason:'not-found',
        matchCount:0, candidateCount:base.candidates.length, verification:[],
        error:'Eksakt Chromium PDF-wrapper frame ble ikke funnet'
      };
    }

    // A token-like HTTP frame is not necessarily Chromium's actual
    // pdf_internal_plugin_wrapper. Prove wrapper identity on demand by requiring
    // the frame itself to contain the PDF <embed>.
    const verification=[];
    const verified=[];
    for (const frame of base.matches) {
      const rec={
        url:String(frame?.url||''),
        processId:Number(frame?.processId),
        routingId:Number(frame?.routingId),
        ok:false,tag:null,error:null
      };
      try {
        if (typeof frame?.executeJavaScript !== 'function') throw new Error('executeJavaScript mangler');
        const probe=await frame.executeJavaScript(`(() => {
          try {
            const embed=document.querySelector('embed');
            return {ok:!!embed,tag:embed?String(embed.tagName||'EMBED'):null,href:String(location.href||'')};
          } catch(e) { return {ok:false,error:String(e&&e.message||e),href:String(location.href||'')}; }
        })()`,true);
        rec.ok=!!probe?.ok;
        rec.tag=probe?.tag||null;
        rec.error=probe?.error||null;
        if(rec.ok) verified.push(frame);
      } catch(error) {
        rec.error=error instanceof Error ? error.message : String(error);
      }
      verification.push(rec);
    }

    if (verified.length === 1) {
      const out=successfulFrameResult(base, verified[0], 'verified-embed-wrapper-disambiguation', base.matches.length);
      out.verification=verification;
      out.verifiedCount=1;
      return out;
    }
    if (verified.length > 1) {
      const physical=preferredPhysicalMatch(pdfTarget, verified);
      if (physical) {
        const out=successfulFrameResult(base, physical, 'verified-embed-target-physical-disambiguation', base.matches.length);
        out.verification=verification;
        out.verifiedCount=verified.length;
        return out;
      }
      return {
        ok:false, token:base.token, frame:null, candidates:base.candidates, reason:'verified-embed-ambiguous',
        matchCount:base.matches.length, candidateCount:base.candidates.length, verification, verifiedCount:verified.length,
        error:'Flere verifiserte Chromium PDF-wrapper frames inneholder <embed> og ingen eksplisitt fysisk target-identitet kan skille dem'
      };
    }
    return {
      ok:false, token:base.token, frame:null, candidates:base.candidates, reason:'verified-embed-not-ready',
      matchCount:base.matches.length, candidateCount:base.candidates.length, verification, verifiedCount:0,
      error:'Ingen token-matchende Chromium PDF-frame inneholder <embed> ennå'
    };
  }


  async function executeExactVerified(pdfTarget, token, code, userGesture = true) {
    const resolved = await resolveExactVerified(pdfTarget, token);
    if (!resolved?.ok || !resolved.frame) {
      return {
        ok:false, token:resolved?.token || String(token || '').trim() || null,
        frame:null, result:null, reason:resolved?.reason || 'resolution-failed',
        matchCount:Number(resolved?.matchCount || 0), candidateCount:Number(resolved?.candidateCount || 0),
        verifiedCount:Number(resolved?.verifiedCount || 0), verification:Array.isArray(resolved?.verification) ? resolved.verification : [],
        error:resolved?.error || 'Eksakt verifisert Chromium PDF-wrapper frame ble ikke funnet'
      };
    }
    if (typeof code !== 'string' || !code.trim()) {
      return {
        ok:false, token:resolved.token, frame:resolved.frame, result:null, reason:'missing-script',
        matchCount:resolved.matchCount, candidateCount:resolved.candidateCount,
        verifiedCount:Number(resolved.verifiedCount || 0), verification:Array.isArray(resolved.verification) ? resolved.verification : [],
        error:'Wrapper-operasjon mangler JavaScript-kode'
      };
    }
    try {
      const result = await resolved.frame.executeJavaScript(code, !!userGesture);
      return {
        ok:true, token:resolved.token, frame:resolved.frame, result,
        reason:resolved.reason, matchCount:resolved.matchCount, candidateCount:resolved.candidateCount,
        verifiedCount:Number(resolved.verifiedCount || 0), verification:Array.isArray(resolved.verification) ? resolved.verification : [], error:null
      };
    } catch (error) {
      return {
        ok:false, token:resolved.token, frame:resolved.frame, result:null, reason:'verified-wrapper-execution-failed',
        matchCount:resolved.matchCount, candidateCount:resolved.candidateCount,
        verifiedCount:Number(resolved.verifiedCount || 0), verification:Array.isArray(resolved.verification) ? resolved.verification : [],
        error:error instanceof Error ? error.message : String(error)
      };
    }
  }

  return Object.freeze({
    contractVersion: PDF_WRAPPER_FRAME_CONTRACT_VERSION,
    resolveExact,
    resolveExactVerified,
    executeExactVerified
  });
}

module.exports = {
  PDF_WRAPPER_FRAME_CONTRACT_VERSION,
  pdfTokenFromWrapperFrameUrl,
  createPdfWrapperFrameAdapter
};
