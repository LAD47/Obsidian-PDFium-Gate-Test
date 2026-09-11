'use strict';

class CategoryMutationFeature {
  async changeExistingHighlightCategory(file, match, category, navigationState = null) {
    const t=(key,params)=>this.i18n?.t?.(key,params) || key;
    try {
      const workTarget = this.ports.resolveSelectionHighlightWriteTarget(file);
      if (workTarget.blocked) throw new Error(workTarget.reason || t('category.mutation.cannotEditPdf'));
      const original = await this.obsidianVaultReadAdapter.readBinary(workTarget.sourceFile);
      const result = await this.ports.modifyExistingHighlightWithAnnotator(original, match, 'change-category', category);
      if (!result?.ok || !result?.pdfBuffer) throw new Error(result?.error || t('category.mutation.noUpdatedPdf'));

      if (workTarget.backupEnabled && !workTarget.backupExists) {
        this.ports.createPdfBackupFromSource(workTarget);
      }
      await this.obsidianVaultWriteAdapter.modifyBinary(workTarget.sourceFile, result.pdfBuffer);
      await this.ports.refreshOpenPdfViews(workTarget.sourceFile, Number(match?.pageIndex || 0) + 1, navigationState);
      new Notice(t(result?.grouped && Number(result?.affectedCount || 0) > 1 ? 'category.mutation.savedWhole' : 'category.mutation.saved',{category:categoryLabel(category)}), 2500);
      return true;
    } catch (error) {
      console.error(`[PDFium Gate Test ${PLUGIN_VERSION}] change existing highlight category failed`, error);
      new Notice(t('category.mutation.changeFailed',{error:error instanceof Error ? error.message : String(error)}), 12000);
      return false;
    }
  }

  async removeExistingHighlight(file, match, navigationState = null) {
    const t=(key,params)=>this.i18n?.t?.(key,params) || key;
    try {
      const workTarget = this.ports.resolveSelectionHighlightWriteTarget(file);
      if (workTarget.blocked) throw new Error(workTarget.reason || t('category.mutation.cannotEditPdf'));
      const original = await this.obsidianVaultReadAdapter.readBinary(workTarget.sourceFile);
      const result = await this.ports.modifyExistingHighlightWithAnnotator(original, match, 'remove');
      if (!result?.ok || !result?.pdfBuffer) throw new Error(result?.error || t('category.mutation.noUpdatedPdf'));

      if (workTarget.backupEnabled && !workTarget.backupExists) {
        this.ports.createPdfBackupFromSource(workTarget);
      }
      await this.obsidianVaultWriteAdapter.modifyBinary(workTarget.sourceFile, result.pdfBuffer);
      await this.ports.refreshOpenPdfViews(workTarget.sourceFile, Number(match?.pageIndex || 0) + 1, navigationState);
      new Notice(t(result?.grouped && Number(result?.affectedCount || 0) > 1 ? 'category.mutation.removedWhole' : 'category.mutation.removed',{count:result?.affectedCount || 0}), 2500);
      return true;
    } catch (error) {
      console.error(`[PDFium Gate Test ${PLUGIN_VERSION}] remove existing highlight failed`, error);
      new Notice(t('category.mutation.removeFailed',{error:error instanceof Error ? error.message : String(error)}), 12000);
      return false;
    }
  }

  async runSelectionHighlightTest(file, suppliedText = null, selectionSource = 'clipboard', category = null, navigationState = null, selectionContext = null) {
    const t=(key,params)=>this.i18n?.t?.(key,params) || key;
    let clipboardText = suppliedText == null ? '' : String(suppliedText).trim();
    if (!clipboardText) {
      try { clipboardText = String(clipboardTextAdapter.readText() || '').trim(); } catch (_) {}
    }
    if (!clipboardText) {
      new Notice(t('category.mutation.noSelection'), 12000);
      return false;
    }

    const diagnostic = {
      version: PLUGIN_VERSION,
      file: file.path,
      clipboardText,
      selectionSource,
      category: category ? { id: category.id || null, name: category.name || null, color: normalizeHexColor(category.color || '#FFFF00'), shortcut: category.shortcut ?? null } : null,
      ok: false,
      error: null,
      destination: null,
      sourceFile: null,
      testMode: null,
      geometry: null,
      searchGeometry: null,
      directGeometry: null,
      primitiveDiagnostics: null,
      writer: null,
      stages: []
    };
    const stage = (name, detail) => diagnostic.stages.push({ stage: name, ...(detail ? { detail } : {}) });

    if (this.settings?.diagnosticsEnabled) new Notice(t('category.mutation.diagnosticRunning',{version:PLUGIN_VERSION}), 3500);
    try {
      stage('selection-text-ready', `${clipboardText.length} characters via ${selectionSource}`);
      const workTarget = this.ports.resolveSelectionHighlightWriteTarget(file);
      if (workTarget.blocked) throw new Error(workTarget.reason || t('category.mutation.cannotEditPdf'));
      diagnostic.sourceFile = workTarget.sourceFile?.path || file.path;
      diagnostic.testMode = workTarget.mode;
      diagnostic.destination = workTarget.destination;
      diagnostic.backupPath = workTarget.backupPath || null;
      diagnostic.backupExistsBefore = !!workTarget.backupExists;
      stage('write-target-resolved', `${workTarget.mode}: ${diagnostic.sourceFile} | backup=${workTarget.backupEnabled ? workTarget.backupPath : 'OFF'}`);

      const original = await this.obsidianVaultReadAdapter.readBinary(workTarget.sourceFile);
      stage('source-pdf-read', `${original.byteLength} bytes from ${workTarget.sourceFile.path}`);

      const exactGeometry = this.ports.exactSelectionGeometryFromContext(selectionContext);
      let selection = null;
      let searchGeometry = null;
      let directGeometry = null;
      let geometry = exactGeometry;
      if (exactGeometry) {
        directGeometry = exactGeometry;
        stage('selection-exact-geometry', `${exactGeometry.mergedRectCount} rects on ${exactGeometry.pages.length} page(s)`);
      } else {
        selection = await this.ports.findSelectionWithAnnotator(original, clipboardText);
        stage('selection-search-returned');
        searchGeometry = selection && selection.fullGeometry;
        directGeometry = selection && selection.directGeometry;
        geometry = directGeometry && directGeometry.complete ? directGeometry : searchGeometry;
      }
      diagnostic.geometry = geometry || null;
      diagnostic.searchGeometry = searchGeometry || null;
      diagnostic.directGeometry = directGeometry || null;
      diagnostic.primitiveDiagnostics = selection && selection.primitiveDiagnostics ? selection.primitiveDiagnostics : null;
      if (!geometry || !geometry.complete) {
        const g = searchGeometry || geometry;
        const matched = g && Number.isFinite(Number(g.matchedChunkCount)) ? `${g.matchedChunkCount}/${g.chunkCount}` : '0/0';
        throw new Error(t('category.mutation.geometryNotFound',{matched}));
      }
      stage('selection-complete', geometry.source === 'keyboard-selection-state-exact-geometry'
        ? `exact keyboard geometry, ${geometry.mergedRectCount} rects on ${(geometry.pages || []).length} page(s)`
        : (geometry.source === 'native-resolved-range-exact-geometry'
          ? `exact mouse geometry, ${geometry.mergedRectCount} rects on ${(geometry.pages || []).length} page(s)`
          : (String(geometry.source || '').startsWith('extractText-index-map-glyphs')
          ? `direct glyph geometry, ${geometry.mergedRectCount} lines on ${(geometry.pages || []).length} page(s)`
          : `${geometry.matchedChunkCount}/${geometry.chunkCount} chunks`)));
      if (!Array.isArray(geometry.mergedRects) || geometry.mergedRects.length === 0) {
        throw new Error(t('category.mutation.noGeometry'));
      }
      stage('geometry-ready', `${geometry.mergedRects.length} mergedRects on page indexes ${(geometry.pages || []).join(', ')}`);

      // Before creating a new Highlight, check whether the same selection is
      // already covered by exactly one existing category highlight. If so,
      // modify that annotation instead of stacking another transparent color.
      const existingInspection = await this.ports.inspectSelectionHighlightsWithAnnotator(original, geometry.mergedRects);
      const existingMatches = Array.isArray(existingInspection?.matches) ? existingInspection.matches : [];
      diagnostic.existingHighlightMatches = existingMatches;
      let written;
      if (existingMatches.length > 1) {
        throw new Error(t('category.mutation.overlapMultiple',{count:existingMatches.length}));
      } else if (existingMatches.length === 1) {
        const match = existingMatches[0];
        let configuredCategories = [];
        try { configuredCategories = this.ports.getVisibleCategories(file); } catch (_) {}
        const matchColor = normalizeHexColor(match?.color || '#000000');
        const categoryMatches = configuredCategories.filter(c => normalizeHexColor(c.color || '#000000') === matchColor);
        if (categoryMatches.length !== 1) {
          throw new Error(t('category.mutation.overlapUnknown'));
        }
        if (!category) throw new Error(t('category.mutation.missingNewCategory'));
        const changed = await this.ports.modifyExistingHighlightWithAnnotator(original, match, 'change-category', category);
        written = {
          ...changed,
          annotationIds:[{ pageIndex:Number(match.pageIndex), annotationId:match.id, changed:true }],
          pageIndexes:[Number(match.pageIndex)],
          debug:{ action:'change-existing-category', fromCategoryId:categoryMatches[0].id, toCategoryId:category.id, overlap:match.coverage || null }
        };
        stage('existing-highlight-category-changed', `${categoryLabel(categoryMatches[0])} → ${categoryLabel(category)}`);
      } else {
        written = await this.ports.writeSelectionHighlightWithAnnotator(original, geometry.mergedRects, clipboardText, category);
        stage('new-highlight-created', category ? categoryLabel(category) : 'without category');
      }
      diagnostic.writer = {
        ok: !!(written && written.ok),
        error: written && written.error ? written.error : null,
        annotationIds: written && written.annotationIds ? written.annotationIds : [],
        pageIndexes: written && written.pageIndexes ? written.pageIndexes : [],
        debug: written && written.debug ? written.debug : null,
        pdfByteLength: written && written.pdfBuffer && written.pdfBuffer.byteLength !== undefined ? written.pdfBuffer.byteLength : null
      };
      if (selectionContext?.selectionSource === 'native-context-selection' && this.state.navigation.lastNativeSelectionIdentityDiagnostic) {
        const nativeWriterDiagnostic = this.ports.recordNativeSelectionIdentityDiagnostic({
          ...this.state.navigation.lastNativeSelectionIdentityDiagnostic,
          stage:'category-writer-returned',
          writerInput:{range:selectionContext?.nativeResolvedRange||null, pages:selectionContext?.nativeResolvedPages||null, geometry:exactGeometry||null},
          writer:diagnostic.writer
        });
        console.log(`[PDFium Gate Test ${PLUGIN_VERSION}] native selection writer diagnostic`, nativeWriterDiagnostic);
      }
      stage('writer-returned', written && written.ok ? 'OK' : `ERROR: ${(written && written.error) || 'unknown'}`);
      if (!written || !written.ok || !written.pdfBuffer) {
        throw new Error((written && written.error) || t('category.mutation.invalidPdfBuffer'));
      }

      const destination = workTarget.destination;
      stage('destination-ready', destination);

      // The backup contains the working PDF bytes from BEFORE the first plugin
      // modification. It is created once and is never overwritten automatically.
      if (!workTarget.backupEnabled) {
        stage('original-backup-disabled', 'Automatic PDF backup is OFF');
      } else if (!workTarget.backupExists) {
        const createdBackup = this.ports.createPdfBackupFromSource(workTarget);
        stage(createdBackup?.preserved ? 'original-backup-preserved' : 'original-backup-created', createdBackup?.path || workTarget.backupPath);
      } else {
        stage('original-backup-preserved', workTarget.backupPath);
      }

      await this.obsidianVaultWriteAdapter.modifyBinary(workTarget.sourceFile, written.pdfBuffer);
      stage('vault-modifyBinary-ok', workTarget.sourceFile.path);

      const pages = Array.isArray(written.pageIndexes) ? written.pageIndexes : geometry.pages || [];
      const firstPage = pages.length ? Number(pages[0]) + 1 : 1;
      const refreshedViews = await this.ports.refreshOpenPdfViews(workTarget.sourceFile, firstPage, navigationState);
      stage('viewer-auto-reload', `${refreshedViews} view(s), page ${firstPage}`);

      diagnostic.ok = true;
      stage('complete', `working PDF updated directly; backup ${workTarget.backupEnabled ? workTarget.backupPath : 'OFF'}; first page ${firstPage}`);
      console.log(`[PDFium Gate Test ${PLUGIN_VERSION}] selection highlight diagnostic`, diagnostic);
      // Keep successful category diagnostics available in logs, but do not
      // interrupt the user's marking flow with an automatic modal. Error diagnostics
      // below remain automatic when advanced diagnostics is enabled.
      new Notice(category ? t('category.mutation.saved',{category:categoryLabel(category)}) : t('category.mutation.savedWithoutCategory'), 2500);
      return true;
    } catch (error) {
      diagnostic.error = error instanceof Error ? error.message : String(error);
      stage('stopped', diagnostic.error);
      console.error(`[PDFium Gate Test ${PLUGIN_VERSION}] selection highlight diagnostic failed:`, diagnostic, error);
      if (this.settings?.diagnosticsEnabled) new SelectionHighlightDiagnosticModal(this.app, this, diagnostic).open();
      new Notice(t('category.mutation.stopped',{error:diagnostic.error}), 18000);
      return false;
    }
  }

  async createStandardHighlightTestCopy(file, page) {
    const t=(key,params)=>this.i18n?.t?.(key,params) || key;
    const n = Math.max(1, Math.floor(Number(page) || 1));
    new Notice(t('category.mutation.standardTestWriting',{version:PLUGIN_VERSION}), 5000);
    try {
      const original = await this.obsidianVaultReadAdapter.readBinary(file);
      const result = await this.ports.writeHighlightWithAnnotator(original, n);
      const destination = this.ports.makeAnnotationTestPath(file);
      const created = await this.obsidianVaultWriteAdapter.createBinary(destination, result.pdfBuffer);
      new Notice(t('category.mutation.testCopyCreated',{path:destination}), 10000);
      console.log(`[PDFium Gate Test ${PLUGIN_VERSION}] standard highlight test created`, {
        source: file.path,
        destination,
        page: n,
        annotationId: result.annotationId
      });
      const openTarget = this.pdfLeafAdapter
        ? this.pdfLeafAdapter.acquireOpenTarget(true)
        : { ok:false, leaf:null, reason:'adapter-unavailable', error:'PDF leaf adapter missing' };
      if (!openTarget?.ok || !openTarget.leaf) {
        throw new Error(openTarget?.error || t('category.mutation.newLeafFailed'));
      }
      const leaf = openTarget.leaf;
      this.ports.queuePendingPage(created.path, n);
      await leaf.openFile(created, { active: true });
    } catch (error) {
      console.error(`[PDFium Gate Test ${PLUGIN_VERSION}] annotation write test failed:`, error);
      new Notice(t('category.mutation.testFailed',{error:error instanceof Error ? error.message : String(error)}), 15000);
    }
  }
}

module.exports = { CategoryMutationFeature };
