'use strict';

function documentInfoFilePath(view) {
  return String(view?.file?.path || '').trim();
}

function documentInfoVisibleFields(schema) {
  return Array.isArray(schema?.fields)
    ? schema.fields.filter(field=>field?.active===true && field?.show_in_document_info===true)
    : [];
}

function documentInfoCurrentValue(values, field, useDefault = false) {
  if(values && Object.prototype.hasOwnProperty.call(values,field.property)) return metadataClone(values[field.property]);
  return useDefault ? metadataClone(field.default) : null;
}

class DocumentInfoFeature {
  getDocumentInfoValuesSnapshot(filePath) {
    const path=String(filePath || '').trim();
    if(!path) return null;
    const state=this.ports.getDocumentMetadataRecordState(path);
    return state?.ready && state?.ok && state?.registered ? metadataClone(state.values || {}) : null;
  }

  getDocumentInfoSchemaFields() {
    const schema=this.ports.getMetadataSchemaSnapshot();
    return documentInfoVisibleFields(schema);
  }

  handleDocumentInfoActiveLeafChange(leaf) {
    const view=leaf?.view || null;
    const activePath=view && typeof view.getViewType==='function' && view.getViewType()===VIEW_TYPE
      ? documentInfoFilePath(view)
      : null;
    if(this.state.documentInfo.editingPdfPath && this.state.documentInfo.editingPdfPath!==activePath) {
      this.state.documentInfo.editingPdfPath=null;
    }
    this.refreshDocumentInfoViews('active-leaf-change');
  }

  openDocumentInfoForView(view) {
    if(!view || typeof view.getViewType!=='function' || view.getViewType()!==VIEW_TYPE || !view.file) return false;
    this.state.documentInfo.panelOpen=true;
    this.state.documentInfo.editingPdfPath=null;
    this.refreshDocumentInfoViews('open');
    void this.ports.ensureDocumentRecordIndexReady().then(()=>this.refreshDocumentInfoViews('record-index-ready')).catch(error=>{
      console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] DocumentInfo metadata-index init failed`,error);
      this.refreshDocumentInfoViews('record-index-error');
    });
    return true;
  }

  toggleDocumentInfoForView(view) {
    const active=this.pdfLeafAdapter?.getActiveLeaf?.();
    const isActive=!!(active?.ok && active.leaf===view?.leaf);
    if(this.state.documentInfo.panelOpen && isActive) {
      this.closeDocumentInfoForView(view);
      return false;
    }
    return this.openDocumentInfoForView(view);
  }

  closeDocumentInfoForView(view) {
    this.state.documentInfo.panelOpen=false;
    this.state.documentInfo.editingPdfPath=null;
    this.refreshDocumentInfoViews('close');
    void this.restoreDocumentInfoPdfFocus(view);
    return true;
  }

  beginDocumentInfoEdit(view) {
    const path=documentInfoFilePath(view);
    if(!path) return false;
    const recordState=this.ports.getDocumentMetadataRecordState(path);
    if(!recordState?.ready || !recordState?.ok) return false;
    this.state.documentInfo.editingPdfPath=path;
    this.renderDocumentInfoForView(view);
    return true;
  }

  cancelDocumentInfoEdit(view) {
    this.state.documentInfo.editingPdfPath=null;
    this.renderDocumentInfoForView(view);
    void this.restoreDocumentInfoPdfFocus(view);
    return true;
  }

  async saveDocumentInfoFromView(view, controlsByProperty) {
    const path=documentInfoFilePath(view);
    if(!path) return {ok:false,errors:{_form:[this.i18n.t('documentInfo.error.missingPdfPath')]}};
    if(this.state.documentInfo.editingPdfPath!==path) return {ok:false,errors:{_form:[this.i18n.t('documentInfo.error.notEditing')]}};
    const fields=this.getDocumentInfoSchemaFields();
    const values={};
    const errors={};
    for(const field of fields) {
      const control=controlsByProperty?.get?.(field.property) || null;
      if(!control || typeof control.readRaw!=='function') {
        errors[field.property]=[this.i18n.t('documentInfo.error.missingControl')];
        continue;
      }
      const result=metadataFieldTypeRegistry.parseNormalizeValidate(field,control.readRaw(),this.settings || {});
      if(!result.ok) errors[field.property]=result.errors;
      else values[field.property]=result.value;
    }
    if(Object.keys(errors).length) return {ok:false,errors};
    const persisted=await this.ports.saveDocumentMetadataRecordValues(path,values);
    if(!persisted?.ok) return {ok:false,errors:{_form:[persisted?.error || this.i18n.t('documentInfo.error.saveFailed')]}};
    this.state.documentInfo.editingPdfPath=null;
    this.renderDocumentInfoForView(view);
    await this.restoreDocumentInfoPdfFocus(view);
    return {ok:true,values:metadataClone(persisted.values || values),id:persisted.id,recordPath:persisted.recordPath};
  }

  renderDocumentInfoForView(view) {
    const panel=view?.documentInfoPanelEl || null;
    const button=view?.documentInfoButtonEl || null;
    if(!panel || !button) return false;
    const t=(key,params)=>this.i18n?.t?.(key,params) || key;
    button.setText(t('documentInfo.button'));
    button.setAttribute('aria-label',t('documentInfo.buttonAria'));
    panel.setAttribute('aria-label',t('documentInfo.panelAria'));
    const active=this.pdfLeafAdapter?.getActiveLeaf?.();
    const visible=!!(this.state.documentInfo.panelOpen && active?.ok && active.leaf===view.leaf && view.file);
    panel.classList.toggle('pdfium-document-info-panel-hidden',!visible);
    button.classList.toggle('is-active',visible);
    button.setAttribute('aria-expanded',visible?'true':'false');
    if(!visible) {
      panel.empty();
      return false;
    }

    panel.empty();
    const path=documentInfoFilePath(view);
    const recordState=this.ports.getDocumentMetadataRecordState(path);
    const values=recordState?.ready && recordState?.ok && recordState?.registered ? metadataClone(recordState.values || {}) : {};
    const fields=this.getDocumentInfoSchemaFields();
    const editing=this.state.documentInfo.editingPdfPath===path && recordState?.ready && recordState?.ok;
    const presentationSettings=metadataPresentationSettings(this.settings || {},this.i18n);

    const header=panel.createDiv({cls:'pdfium-document-info-header'});
    const titleBox=header.createDiv({cls:'pdfium-document-info-heading-box'});
    titleBox.createEl('h3',{text:t('documentInfo.title')});
    const fileLabel=titleBox.createDiv({cls:'pdfium-document-info-file',text:view.file?.name || path});
    fileLabel.setAttribute('title',path);
    const closeButton=header.createEl('button',{cls:'pdfium-document-info-icon-button',text:'×'});
    closeButton.setAttribute('aria-label',t('documentInfo.closeAria'));
    closeButton.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();this.closeDocumentInfoForView(view);});

    const body=panel.createDiv({cls:'pdfium-document-info-body'});
    if(!this.ports.getMetadataSchemaSnapshot()) {
      body.createDiv({cls:'pdfium-document-info-message',text:t('documentInfo.schemaUnavailable')});
    } else if(!recordState?.ready) {
      body.createDiv({cls:'pdfium-document-info-message',text:t('documentInfo.loading')});
    } else if(!recordState?.ok) {
      body.createDiv({cls:'pdfium-document-info-message',text:recordState?.error || t('documentInfo.identityUnavailable')});
    } else if(fields.length===0) {
      body.createDiv({cls:'pdfium-document-info-message',text:t('documentInfo.noFields')});
    } else if(editing) {
      const controls=new Map();
      for(const field of fields) {
        const row=body.createDiv({cls:'pdfium-document-info-field pdfium-document-info-field-edit'});
        const label=row.createEl('label',{cls:'pdfium-document-info-label'});
        label.setText(`${field.label}${field.required?' *':''}`);
        if(field.description) label.setAttribute('title',field.description);
        const controlHost=row.createDiv({cls:'pdfium-document-info-control'});
        const descriptor=metadataFieldTypeRegistry.get(field.type);
        const value=documentInfoCurrentValue(values,field,true);
        const control=descriptor?.renderEdit?.(controlHost,{value,field,settings:presentationSettings}) || null;
        const errorEl=row.createDiv({cls:'pdfium-document-info-error'});
        errorEl.setAttribute('aria-live','polite');
        if(control?.inputEl && label) {
          const id=`pdfium-docinfo-${String(field.id || field.property).replace(/[^a-zA-Z0-9_-]/g,'')}`;
          control.inputEl.id=id;
          label.setAttribute('for',id);
        }
        controls.set(field.property,{...control,errorEl});
      }
      const formError=body.createDiv({cls:'pdfium-document-info-error pdfium-document-info-form-error'});
      formError.setAttribute('aria-live','polite');
      const actions=body.createDiv({cls:'pdfium-document-info-actions'});
      const cancel=actions.createEl('button',{text:t('documentInfo.cancel')});
      const save=actions.createEl('button',{cls:'mod-cta',text:t('documentInfo.save')});
      cancel.addEventListener('click',event=>{event.preventDefault();this.cancelDocumentInfoEdit(view);});
      save.addEventListener('click',async event=>{
        event.preventDefault();
        formError.setText('');
        for(const control of controls.values()) control.errorEl?.setText('');
        const result=await this.saveDocumentInfoFromView(view,controls);
        if(result.ok) return;
        for(const [property,messages] of Object.entries(result.errors || {})) {
          const rawMessages=Array.isArray(messages)?messages:[messages || t('documentInfo.error.invalidValue')];
          const message=rawMessages.map(item=>pdfiumTranslateMetadataValidationMessage(this.i18n,item)).join(' · ');
          if(property==='_form') formError.setText(message);
          else {
            const control=controls.get(property);
            if(control?.errorEl) control.errorEl.setText(message);
          }
        }
      });
    } else {
      for(const field of fields) {
        const row=body.createDiv({cls:'pdfium-document-info-field'});
        row.createDiv({cls:'pdfium-document-info-label',text:field.label});
        const descriptor=metadataFieldTypeRegistry.get(field.type);
        const value=documentInfoCurrentValue(values,field,false);
        if(descriptor?.renderRead) descriptor.renderRead(row,{value,field,settings:presentationSettings});
        else row.createDiv({cls:'pdfium-document-info-value',text:value==null?'—':String(value)});
      }
      const actions=body.createDiv({cls:'pdfium-document-info-actions'});
      const edit=actions.createEl('button',{cls:'mod-cta',text:t('documentInfo.edit')});
      edit.addEventListener('click',event=>{event.preventDefault();this.beginDocumentInfoEdit(view);});
    }

    panel.onkeydown=event=>{
      if(event.key!=='Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if(this.state.documentInfo.editingPdfPath===path) this.cancelDocumentInfoEdit(view);
      else this.closeDocumentInfoForView(view);
    };
    return true;
  }

  refreshDocumentInfoViews(_reason = 'refresh') {
    const listed=this.pdfLeafAdapter?.listOpenLeaves?.();
    if(!listed?.ok) return false;
    for(const leaf of listed.leaves || []) {
      const view=leaf?.view || null;
      if(view && typeof view.getViewType==='function' && view.getViewType()===VIEW_TYPE) this.renderDocumentInfoForView(view);
    }
    return true;
  }

  async restoreDocumentInfoPdfFocus(view) {
    const token=String(view?.pdfToken || '').trim();
    if(!token) return {ok:false,reason:'missing-token'};
    const exact=this.pdfLeafAdapter?.resolveExactToken?.(token);
    if(!exact?.ok || exact.leaf!==view?.leaf) {
      const result={ok:false,reason:exact?.reason || 'leaf-token-mismatch',error:exact?.error || 'Eksakt PDF-leaf kunne ikke verifiseres'};
      console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] DocumentInfo focus restore failed closed`,result);
      return result;
    }
    const transport=this.mainProcessTransport;
    if(!transport?.getCapabilities?.().loaded || typeof transport.focusPdfRuntime!=='function') {
      return {ok:false,reason:'main-transport-unavailable'};
    }
    try {
      return await transport.focusPdfRuntime(token);
    } catch(error) {
      const result={ok:false,reason:'focus-runtime-failed',error:error instanceof Error?error.message:String(error)};
      console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] DocumentInfo focus restore failed`,result);
      return result;
    }
  }
}

module.exports={DocumentInfoFeature};
