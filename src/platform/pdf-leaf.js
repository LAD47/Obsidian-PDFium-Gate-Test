'use strict';

// PDFium Gate Platform Contract — exact open PDF leaf identity + activation.
// Source-of-truth for the adapter bundled into release main.js.
const PDF_LEAF_CONTRACT_VERSION = '0.5';

function createPdfLeafAdapter({ workspace, viewType }) {
  if (!workspace || typeof workspace.getLeavesOfType !== 'function') {
    throw new Error('workspace.getLeavesOfType er ikke tilgjengelig');
  }
  const safeViewType = String(viewType || '').trim();
  if (!safeViewType) throw new Error('viewType mangler');

  function leafFilePath(leaf) {
    try {
      const loadedPath = leaf?.view?.file?.path;
      if (loadedPath) return String(loadedPath);
    } catch (_) {}
    // Background tabs may be DeferredView since Obsidian 1.7.2. Match on the
    // public view state as well, so exact identity does not depend on the tab
    // already being visible/loaded.
    try {
      const state = typeof leaf?.getViewState === 'function' ? leaf.getViewState() : null;
      const statePath = state?.state?.file;
      if (state?.type === safeViewType && statePath) return String(statePath);
    } catch (_) {}
    return null;
  }

  function leafPdfToken(leaf) {
    // Token identity exists only on a loaded PDFium view. That is intentional:
    // this route is used only after a physical mouse event arrived from the
    // already-running embedded Chromium PDF frame.
    try {
      const view = leaf?.view || null;
      if (!view || typeof view.getViewType !== 'function' || view.getViewType() !== safeViewType) return null;
      return String(view.pdfToken || '').trim() || null;
    } catch (_) {
      return null;
    }
  }

  function enumerateLeaves(reasonTarget) {
    try { return { ok:true, leaves:workspace.getLeavesOfType(safeViewType) || [], error:null }; }
    catch (error) {
      return { ok:false, leaves:[], error:error instanceof Error ? error.message : String(error), reasonTarget };
    }
  }

  function getActiveLeaf() {
    try { return { ok:true, leaf:workspace.activeLeaf || null, error:null }; }
    catch (error) {
      return { ok:false, leaf:null, error:error instanceof Error ? error.message : String(error) };
    }
  }

  function listOpenLeaves() {
    const result = enumerateLeaves('list-open-pdf-leaves');
    return result.ok
      ? { ok:true, leaves:result.leaves, error:null }
      : { ok:false, leaves:[], error:result.error };
  }

  function resolveExact(filePath) {
    const targetPath = String(filePath || '').trim();
    if (!targetPath) {
      return { ok:false, filePath:null, leaf:null, reason:'missing-file-path', matchCount:0, candidateCount:0, error:'PDF-filsti mangler' };
    }
    const enumeration = enumerateLeaves(targetPath);
    if (!enumeration.ok) {
      return { ok:false, filePath:targetPath, leaf:null, reason:'enumeration-failed', matchCount:0, candidateCount:0, error:enumeration.error };
    }
    const leaves = enumeration.leaves;
    const matches = leaves.filter(leaf => leafFilePath(leaf) === targetPath);
    if (matches.length === 1) {
      return { ok:true, filePath:targetPath, leaf:matches[0], reason:'exact-file-path', matchCount:1, candidateCount:leaves.length, error:null };
    }
    if (matches.length === 0) {
      return { ok:false, filePath:targetPath, leaf:null, reason:'not-found', matchCount:0, candidateCount:leaves.length, error:'Eksakt åpen PDFium-fane ble ikke funnet' };
    }
    return { ok:false, filePath:targetPath, leaf:null, reason:'ambiguous', matchCount:matches.length, candidateCount:leaves.length, error:'Flere åpne PDFium-faner matcher samme filsti' };
  }

  function resolveExactToken(pdfToken) {
    const targetToken = String(pdfToken || '').trim();
    if (!targetToken) {
      return { ok:false, token:null, leaf:null, reason:'missing-token', matchCount:0, candidateCount:0, error:'PDF-token mangler' };
    }
    const enumeration = enumerateLeaves(targetToken);
    if (!enumeration.ok) {
      return { ok:false, token:targetToken, leaf:null, reason:'enumeration-failed', matchCount:0, candidateCount:0, error:enumeration.error };
    }
    const leaves = enumeration.leaves;
    const matches = leaves.filter(leaf => leafPdfToken(leaf) === targetToken);
    if (matches.length === 1) {
      return { ok:true, token:targetToken, leaf:matches[0], reason:'exact-loaded-token', matchCount:1, candidateCount:leaves.length, error:null };
    }
    if (matches.length === 0) {
      return { ok:false, token:targetToken, leaf:null, reason:'not-found', matchCount:0, candidateCount:leaves.length, error:'Eksakt lastet PDFium-fane for PDF-token ble ikke funnet' };
    }
    return { ok:false, token:targetToken, leaf:null, reason:'ambiguous', matchCount:matches.length, candidateCount:leaves.length, error:'Flere lastede PDFium-faner matcher samme PDF-token' };
  }

  function activateExactToken(pdfToken) {
    const resolved = resolveExactToken(pdfToken);
    if (!resolved.ok) return { ...resolved, activated:false };
    if (typeof workspace.setActiveLeaf !== 'function') {
      return { ...resolved, ok:false, activated:false, reason:'activate-unavailable', error:'workspace.setActiveLeaf er ikke tilgjengelig' };
    }
    try {
      // A physical click has already placed input focus inside the Chromium PDF
      // iframe. Change only Obsidian's active-leaf identity; do not steal focus
      // back out of the iframe.
      workspace.setActiveLeaf(resolved.leaf, { focus:false });
      return { ...resolved, activated:true };
    } catch (error) {
      return { ...resolved, ok:false, activated:false, reason:'activate-failed', error:error instanceof Error ? error.message : String(error) };
    }
  }

  async function revealAndActivateExact(filePath) {
    const resolved = resolveExact(filePath);
    if (!resolved.ok) return { ...resolved, revealed:false, activated:false };
    if (typeof workspace.revealLeaf !== 'function') {
      return { ...resolved, ok:false, revealed:false, activated:false, reason:'reveal-unavailable', error:'workspace.revealLeaf er ikke tilgjengelig' };
    }
    if (typeof workspace.setActiveLeaf !== 'function') {
      return { ...resolved, ok:false, revealed:false, activated:false, reason:'activate-unavailable', error:'workspace.setActiveLeaf er ikke tilgjengelig' };
    }
    try {
      await workspace.revealLeaf(resolved.leaf);
    } catch (error) {
      return { ...resolved, ok:false, revealed:false, activated:false, reason:'reveal-failed', error:error instanceof Error ? error.message : String(error) };
    }
    try {
      workspace.setActiveLeaf(resolved.leaf, { focus:true });
      return { ...resolved, revealed:true, activated:true };
    } catch (error) {
      return { ...resolved, ok:false, revealed:true, activated:false, reason:'activate-failed', error:error instanceof Error ? error.message : String(error) };
    }
  }

  function acquireOpenTarget(requestedNewLeaf = false) {
    const wantNewLeaf = !!requestedNewLeaf;
    const mode = wantNewLeaf ? 'tab' : false;
    if (typeof workspace.getLeaf !== 'function') {
      return {
        ok:false, leaf:null, requestedNewLeaf:wantNewLeaf, mode, reason:'get-leaf-unavailable',
        error:'workspace.getLeaf er ikke tilgjengelig'
      };
    }
    let leaf = null;
    try { leaf = workspace.getLeaf(mode); }
    catch (error) {
      return {
        ok:false, leaf:null, requestedNewLeaf:wantNewLeaf, mode, reason:'get-leaf-failed',
        error:error instanceof Error ? error.message : String(error)
      };
    }
    if (!leaf || typeof leaf.openFile !== 'function') {
      return {
        ok:false, leaf:null, requestedNewLeaf:wantNewLeaf, mode, reason:'invalid-leaf',
        error:'workspace.getLeaf returnerte ikke en gyldig WorkspaceLeaf med openFile()'
      };
    }
    return { ok:true, leaf, requestedNewLeaf:wantNewLeaf, mode, reason:'workspace-get-leaf', error:null };
  }

  return Object.freeze({
    contractVersion: PDF_LEAF_CONTRACT_VERSION,
    leafFilePath,
    leafPdfToken,
    getActiveLeaf,
    listOpenLeaves,
    resolveExact,
    resolveExactToken,
    activateExactToken,
    acquireOpenTarget,
    revealAndActivateExact
  });
}

module.exports = { PDF_LEAF_CONTRACT_VERSION, createPdfLeafAdapter };
