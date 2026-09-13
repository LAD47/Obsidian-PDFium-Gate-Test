'use strict';

class AnnotationIoFeature {
  async inspectPointHighlightsWithAnnotator(pdfBuffer, candidates) {
    return this.ports.sendAnnotatorRequest('inspect-point-highlights',{
      candidates:Array.isArray(candidates)?candidates:[],tolerance:4
    },pdfBuffer);
  }

  async inspectSelectionHighlightsWithAnnotator(pdfBuffer, mergedRects) {
    return this.ports.sendAnnotatorRequest('inspect-selection-highlights',{mergedRects},pdfBuffer);
  }

  async readExistingHighlightSelectionWithAnnotator(pdfBuffer, match) {
    return this.ports.sendAnnotatorRequest('read-existing-highlight-selection',{
      pageIndex:Number(match?.pageIndex),annotationId:String(match?.id||'')
    },pdfBuffer);
  }

  async copyExistingCategoryReference(file, match, mode) {
    try {
      const pdfBuffer = await this.obsidianVaultReadAdapter.readBinary(file);
      const logical = await this.readExistingHighlightSelectionWithAnnotator(pdfBuffer, match);
      const text = String(logical?.text || '').trim();
      const rects = Array.isArray(logical?.rects) ? logical.rects : [];
      const model = logical?.selectionModel || null;
      if (!text || !rects.length || !model) throw new Error('Category highlight is missing text or geometry.');
      const pageIndexes = Array.isArray(logical?.pageIndexes) ? logical.pageIndexes.map(Number).filter(Number.isFinite) : [];
      if (!pageIndexes.length) throw new Error('Category highlight is missing known page identity.');
      const syntheticContext = {
        selectionSource:'category-marking-state',
        categoryMarkingState:{
          pageIndexes,
          range:logical.range || null,
          rects,
          selectionModel:model,
          groupId:logical.groupId || null,
          annotationId:logical.annotationId || null
        }
      };
      let outwardText=text;
      let artifactFilter={ok:true,text,artifactExcludedRawCount:0,filtered:false,range:logical.range||null,pages:pageIndexes,occurrenceCount:1};
      if (this.settings?.includeHeaderFooterText === false) {
        artifactFilter=await this.ports.filterSelectionArtifactsForOutput(file,text,syntheticContext);
        outwardText=String(artifactFilter?.text||'');
      }
      this.state.navigation.lastExistingCategoryCopyArtifactFilter=deepClone({
        at:new Date().toISOString(),mode,file:file.path,
        rawLength:text.length,filteredLength:outwardText.length,
        artifactExcludedRawCount:Number(artifactFilter?.artifactExcludedRawCount||0),
        continuityExcludedRawCount:Number(artifactFilter?.continuityExcludedRawCount||0),
        range:artifactFilter?.range||logical.range||null,pages:artifactFilter?.pages||pageIndexes,
        occurrenceCount:Number(artifactFilter?.occurrenceCount||0),
        artifactDiagnostics:artifactFilter?.artifactDiagnostics||null
      });
      await this.ports.copyObsidianPdfSelectionReference(file, text, syntheticContext, null, mode, outwardText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[PDFium Gate ${PLUGIN_VERSION}] could not copy category highlight`, {mode,file:file?.path || null,error:message});
      new Notice(this.i18n.t('annotation.copyCategoryFailed',{version:PLUGIN_VERSION,error:message}), 8000);
    }
  }

  async modifyExistingHighlightWithAnnotator(pdfBuffer, match, action, category = null) {
    return this.ports.sendAnnotatorRequest('modify-existing-highlight',{
      action,
      pageIndex:Number(match?.pageIndex),
      annotationId:String(match?.id||''),
      color:category?normalizeHexColor(category.color||'#FFFF00'):null,
      categoryId:category?.id||null,
      categoryName:category?.name||null
    },pdfBuffer);
  }

  async writeHighlightWithAnnotator(pdfBuffer, page) {
    return this.ports.sendAnnotatorRequest('write-highlight',{page},pdfBuffer);
  }

  async findSelectionWithAnnotator(pdfBuffer, text) {
    return this.ports.sendAnnotatorRequest('find-selection',{text},pdfBuffer);
  }

  async writeSelectionHighlightWithAnnotator(pdfBuffer, mergedRects, text, category = null) {
    // Category popups are intentionally removed. Never write /Contents for highlights.
    return this.ports.sendAnnotatorRequest('write-selection-highlight',{
      mergedRects,text,
      color:normalizeHexColor(category?.color||'#FFFF00'),
      opacity:Number.isFinite(Number(category?.opacity))?Number(category.opacity):DEFAULT_HIGHLIGHT_OPACITY,
      categoryId:category?.id||null,
      categoryName:category?.name||null
    },pdfBuffer);
  }
}

module.exports = { AnnotationIoFeature };
