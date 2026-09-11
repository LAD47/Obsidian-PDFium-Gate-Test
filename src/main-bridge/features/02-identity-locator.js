'use strict';

class MainBridgeIdentityLocatorFeature {
  setActivePdfIdentity(payload) {
      const __bridgeRuntime = this;
      const published = __bridgeRuntime.runtime.targets.activePdfTargetAdapter.publish(payload);
      __bridgeRuntime.state.activePdfIdentitySeq += 1;
      __bridgeRuntime.state.activePdfIdentity = published;
      if (published.token) {
          // Active identity and runtime registration are separate contracts. Publication
          // may opportunistically ensure instrumentation, but it never selects a wrapper.
          void __bridgeRuntime.ports.ensurePdfRuntime({ token: published.token, source: 'active-identity-publication' });
      }
      if (__bridgeRuntime.runtime.keyboard.selection && published.token !== __bridgeRuntime.runtime.keyboard.selection.token) {
          void __bridgeRuntime.ports.clearKeyboardSelection('active-pdf-identity-changed');
      }
      return { ok: true, seq: __bridgeRuntime.state.activePdfIdentitySeq, identity: published };
  }

  resolveReservedShortcutPdfTarget() {
      const __bridgeRuntime = this;
      const resolved = __bridgeRuntime.runtime.targets.activePdfTargetAdapter.resolve();
      __bridgeRuntime.state.lastReservedShortcutTarget = {
          at: new Date().toISOString(),
          ok: !!resolved?.ok,
          token: resolved?.token || null,
          source: resolved?.source || null,
          reason: resolved?.reason || null,
          webContents: __bridgeRuntime.ports.safeDescribe(resolved?.target || null, (() => { try {
              return webContents.getFocusedWebContents();
          }
          catch (_) {
              return null;
          } })()),
          focusedFrame: (() => { try {
              return __bridgeRuntime.ports.describeFrame(webContents.getFocusedWebContents()?.focusedFrame || null);
          }
          catch (_) {
              return null;
          } })(),
          error: resolved?.error || null
      };
      return resolved;
  }

  // Locator discovery is not a focus contract. Try canonical token resolution first;
  // when focus is outside the PDF, discover the one <embed>-verified wrapper across
  // owner WebContents and construct the same explicit embedded PDF target from that
  // proven physical identity. Multiple verified owners fail closed.
  async resolveLocatorEmbeddedPdfTargetExact(token) {
      const __bridgeRuntime = this;
      const safeToken = String(token || '').trim();
      if (!safeToken)
          return { ok: false, target: null, reason: 'missing-token', error: 'PDF-token mangler', syncReason: null, ownerCount: 0, verifiedCount: 0, verification: [] };
      const sync = __bridgeRuntime.ports.resolveEmbeddedPdfTargetExact(safeToken);
      if (sync?.target) {
          return { ok: true, target: sync.target, reason: `sync-${sync.reason || 'exact'}`, error: null, syncReason: sync.reason || null, ownerCount: 0, verifiedCount: null, verification: [] };
      }
      let all = [];
      try {
          all = webContents.getAllWebContents() || [];
      }
      catch (error) {
          return { ok: false, target: null, reason: 'enumeration-failed', error: error instanceof Error ? error.message : String(error), syncReason: sync?.reason || null, ownerCount: 0, verifiedCount: 0, verification: [] };
      }
      const verification = [];
      const hits = [];
      let ownerCount = 0;
      for (const ownerWc of all) {
          let hasTokenFrame = false;
          try {
              hasTokenFrame = (__bridgeRuntime.ports.listFrameSubtree(ownerWc) || []).some(frame => pdfTokenFromWrapperFrameUrl(__bridgeRuntime.ports.safeFrameUrl(frame)) === safeToken);
          }
          catch (_) {
              hasTokenFrame = false;
          }
          if (!hasTokenFrame)
              continue;
          ownerCount += 1;
          const resolved = await __bridgeRuntime.pdfWrapperFrameAdapter.resolveExactVerified(ownerWc, safeToken);
          verification.push({
              ownerId: Number(ownerWc?.id),
              ok: !!resolved?.ok,
              reason: resolved?.reason || null,
              error: resolved?.error || null,
              matchCount: Number(resolved?.matchCount || 0),
              verifiedCount: Number(resolved?.verifiedCount || 0),
              selected: resolved?.frame ? __bridgeRuntime.ports.describeFrame(resolved.frame) : null
          });
          if (resolved?.ok && resolved.frame)
              hits.push({ ownerWc, resolved });
      }
      if (hits.length === 1) {
          const hit = hits[0];
          const target = __bridgeRuntime.ports.createEmbeddedPdfTarget(hit.ownerWc, safeToken, hit.resolved.frame);
          if (!target)
              return { ok: false, target: null, reason: 'target-create-failed', error: 'Kunne ikke opprette embedded PDF-target fra verifisert wrapper', syncReason: sync?.reason || null, ownerCount, verifiedCount: 1, verification };
          __bridgeRuntime.ports.setEmbeddedPdfTargetResolution({ at: new Date().toISOString(), token: safeToken, reason: 'locator-verified-embed-wrapper', owner: __bridgeRuntime.ports.safeDescribe(hit.ownerWc, webContents.getFocusedWebContents()), wrapperFrame: __bridgeRuntime.ports.describeFrame(hit.resolved.frame), syncReason: sync?.reason || null });
          return { ok: true, target, reason: 'locator-verified-embed-wrapper', error: null, syncReason: sync?.reason || null, ownerCount, verifiedCount: 1, verification };
      }
      if (hits.length > 1) {
          return { ok: false, target: null, reason: 'locator-verified-embed-ambiguous', error: 'Flere Obsidian WebContents inneholder verifisert Chromium PDF-wrapper for samme token', syncReason: sync?.reason || null, ownerCount, verifiedCount: hits.length, verification };
      }
      return { ok: false, target: null, reason: 'locator-verified-embed-not-ready', error: 'Eksakt Chromium PDF-viewer er ikke klar ennå', syncReason: sync?.reason || null, ownerCount, verifiedCount: 0, verification };
  }

  async focusPdfRuntime(token) {
      const __bridgeRuntime = this;
      const safeToken = String(token || '').trim();
      if (!safeToken) return { ok:false, token:null, reason:'missing-token', error:'PDF-token mangler' };
      const resolved = await __bridgeRuntime.ports.resolveLocatorEmbeddedPdfTargetExact(safeToken);
      if (!resolved?.ok || !resolved.target) {
          return { ok:false, token:safeToken, reason:resolved?.reason || 'target-not-resolved', error:resolved?.error || 'Eksakt PDF-runtime kunne ikke resolves' };
      }
      const focusResult = await __bridgeRuntime.chromiumPdfRuntimeDriver.focusViewerRuntime(resolved.target.runtimeFrame);
      if (!focusResult?.ok) return { ok:false, token:safeToken, reason:'viewer-focus-failed', error:focusResult?.error || 'PDF-viewer kunne ikke få fokus' };
      return { ok:true, token:safeToken, reason:'exact-runtime-focused', targetReason:resolved.reason || null, focus:focusResult };
  }

  async capturePdfIframeRect(ownerWc, token) {
      const __bridgeRuntime = this;
      return __bridgeRuntime.pdfIframeAdapter.resolveExact(ownerWc, token);
  }
}

module.exports = { MainBridgeIdentityLocatorFeature };
