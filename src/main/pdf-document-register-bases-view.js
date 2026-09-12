'use strict';

const BasesViewBase = typeof obsidianModule.BasesView === 'function'
  ? obsidianModule.BasesView
  : class {
      constructor(controller) {
        this.controller = controller || null;
        this.data = controller?.data || { groupedData:[] };
        this.config = controller?.config || null;
      }
    };

function pdfDocumentRegisterT(host,key,params){ return host?.getI18n?.()?.t?.(key,params) || key; }

function pdfDocumentRegisterEntries(data) {
  const groups = Array.isArray(data?.groupedData) ? data.groupedData : [];
  const out = [];
  const seen = new Set();
  for (const group of groups) {
    for (const entry of Array.isArray(group?.entries) ? group.entries : []) {
      const path = String(entry?.file?.path || '');
      if (!path || seen.has(path)) continue;
      seen.add(path);
      out.push(entry);
    }
  }
  return out;
}

class PdfDocumentRelinkModal extends Modal {
  constructor(app, host, recordId, previousPath) {
    super(app);
    this.host = host || {};
    this.recordId = String(recordId || '').toLowerCase();
    this.previousPath = String(previousPath || '');
    this.pdfFiles = [];
    this.busy = false;
  }

  onOpen() {
    this.modalEl?.addClass?.('pdfium-document-relink-modal');
    this.pdfFiles = (this.host?.listPdfFiles?.() || [])
      .filter(file => String(file?.extension || '').toLowerCase() === 'pdf' && String(file?.path || ''))
      .slice()
      .sort((a,b) => String(a.path).localeCompare(String(b.path), undefined, { numeric:true, sensitivity:'base' }));
    this.render();
  }

  onClose() { this.contentEl.empty(); }

  render() {
    const { contentEl } = this;
    const t=(key,params)=>pdfDocumentRegisterT(this.host,key,params);
    contentEl.empty();
    contentEl.createEl('h2', { text:t('documentRegister.relink.title') });
    contentEl.createEl('p', { text:t('documentRegister.relink.intro') });
    if (this.previousPath) {
      const previous = contentEl.createDiv({ cls:'pdfium-document-relink-previous' });
      previous.createSpan({ text:`${t('documentRegister.relink.previous')} ` });
      previous.createEl('code', { text:this.previousPath });
    }
    contentEl.createEl('p', { cls:'pdfium-document-relink-warning', text:t('documentRegister.relink.warning') });

    const search = contentEl.createEl('input', { cls:'pdfium-document-relink-search', type:'search', placeholder:t('documentRegister.relink.searchPlaceholder') });
    search.setAttribute('aria-label',t('documentRegister.relink.searchAria'));
    const resultInfo = contentEl.createDiv({ cls:'pdfium-document-relink-result-info' });
    const results = contentEl.createDiv({ cls:'pdfium-document-relink-results' });
    const errorEl = contentEl.createDiv({ cls:'pdfium-document-relink-error' });
    errorEl.setAttribute('aria-live','polite');

    const renderResults = () => {
      const query = String(search.value || '').trim().toLocaleLowerCase();
      const matching = query
        ? this.pdfFiles.filter(file => String(file.path || '').toLocaleLowerCase().includes(query))
        : this.pdfFiles;
      const visible = matching.slice(0,100);
      results.empty();
      resultInfo.setText(matching.length > visible.length
        ? t('documentRegister.relink.matchesLimited',{count:matching.length,visible:visible.length})
        : t('documentRegister.relink.matches',{count:matching.length}));
      if (!visible.length) {
        results.createDiv({ cls:'pdfium-document-relink-empty', text:t('documentRegister.relink.noMatches') });
        return;
      }
      for (const file of visible) {
        const button = results.createEl('button', { cls:'pdfium-document-relink-choice' });
        button.createSpan({ cls:'pdfium-document-relink-choice-name', text:String(file.name || String(file.path).split('/').pop() || file.path) });
        button.createSpan({ cls:'pdfium-document-relink-choice-path', text:String(file.path || '') });
        button.addEventListener('click', async event => {
          event.preventDefault();
          event.stopPropagation();
          if (this.busy) return;
          this.busy = true;
          errorEl.setText('');
          search.disabled = true;
          for (const candidate of results.querySelectorAll('button')) candidate.disabled = true;
          const outcome = await this.host?.relinkMissingRecord?.(this.recordId, String(file.path || ''));
          if (!outcome?.ok) {
            this.busy = false;
            search.disabled = false;
            for (const candidate of results.querySelectorAll('button')) candidate.disabled = false;
            errorEl.setText(outcome?.error || t('documentRegister.relink.failed'));
            return;
          }
          new Notice(t('documentRegister.relink.done',{path:String(file.path || '')}), 5000);
          this.close();
        });
      }
    };

    search.addEventListener('input',renderResults);
    search.addEventListener('keydown',event=>{
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });
    renderResults();
    search.focus();
  }
}

function pdfDocumentRegisterBareProperty(property) {
  return String(property || '').replace(/^(?:note|formula|file)\./,'');
}

function pdfDocumentRegisterPropertyId(property) {
  const value = String(property || '').trim();
  if (!value) return '';
  if (/^(?:note|formula|file)\./.test(value)) return value;
  return `note.${value}`;
}

const PDF_DOCUMENT_REGISTER_HEADER_FILTERS_CONFIG_KEY = 'pdfiumHeaderFilters';

function pdfDocumentRegisterSanitizeStoredFilter(filter) {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return null;
  const kind=String(filter.kind || '');
  if (kind === 'contains') {
    const query=String(filter.query || '').trim();
    return query ? {kind:'contains',query} : null;
  }
  if (kind === 'boolean') {
    return typeof filter.value === 'boolean' ? {kind:'boolean',value:filter.value} : null;
  }
  if (kind === 'choices') {
    const values=Array.isArray(filter.values) ? [...new Set(filter.values.map(value=>String(value)).filter(Boolean))] : [];
    const includeEmpty=filter.includeEmpty === true;
    const systemType=filter.systemType === 'status' ? 'status' : '';
    return values.length || includeEmpty ? {kind:'choices',values,includeEmpty,systemType} : null;
  }
  if (kind === 'range') {
    const valueType=String(filter.valueType || '');
    if (!['date','time','integer','decimal'].includes(valueType)) return null;
    const normalizeBound=value=>{
      if (value == null || value === '') return null;
      if (valueType === 'integer' || valueType === 'decimal') {
        const number=Number(value);
        return Number.isFinite(number) ? number : null;
      }
      return String(value);
    };
    const from=normalizeBound(filter.from);
    const to=normalizeBound(filter.to);
    return from == null && to == null ? null : {kind:'range',valueType,from,to};
  }
  return null;
}

function pdfDocumentRegisterHeaderFiltersFromConfig(value) {
  const filters=new Map();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return filters;
  for (const [property,filter] of Object.entries(value)) {
    const key=String(property || '').trim();
    const sanitized=pdfDocumentRegisterSanitizeStoredFilter(filter);
    if (key && sanitized) filters.set(key,sanitized);
  }
  return filters;
}

function pdfDocumentRegisterHeaderFiltersToConfig(filters) {
  const out={};
  if (!(filters instanceof Map)) return out;
  for (const [property,filter] of filters.entries()) {
    const key=String(property || '').trim();
    const sanitized=pdfDocumentRegisterSanitizeStoredFilter(filter);
    if (key && sanitized) out[key]=sanitized;
  }
  return out;
}

function pdfDocumentRegisterFilterType(field, systemType = '') {
  const type = String(field?.type || systemType || 'text');
  return ['text','date','time','integer','decimal','boolean','select','multiselect','link','status'].includes(type) ? type : 'text';
}

function pdfDocumentRegisterFilterOptionLabel(field, value) {
  const option=(field?.config?.options || []).find(item=>String(item?.value ?? '')===String(value ?? ''));
  return String(option?.label || value || '');
}

function pdfDocumentRegisterFilterFormatBound(field, value, settings) {
  if (value == null || value === '') return '';
  const descriptor=metadataFieldTypeRegistry.get(field?.type);
  return descriptor ? String(descriptor.format(value,settings,field) || '') : String(value);
}

function pdfDocumentRegisterFilterParseBound(field, raw, settings) {
  const text=String(raw ?? '').trim();
  if (!text) return { ok:true, value:null };
  const result=metadataFieldTypeRegistry.parseNormalizeValidate({ ...(field || {}), required:false }, text, settings || {});
  if (!result.ok) return { ok:false, value:null, error:(result.errors || []).join(' · ') || 'Invalid value' };
  return { ok:true, value:result.value };
}

function pdfDocumentRegisterFilterSummary(filter, field, settings, i18n=null) {
  const t=(key,params)=>i18n?.t?.(key,params) || key;
  if (!filter || !filter.kind) return '';
  if (filter.kind === 'contains') return String(filter.query || '');
  if (filter.kind === 'boolean') return filter.value === true
    ? String(settings?.uiBooleanLabels?.yes || 'Yes')
    : String(settings?.uiBooleanLabels?.no || 'No');
  if (filter.kind === 'choices') {
    const labels=(Array.isArray(filter.values) ? filter.values : []).map(value=>
      filter.systemType === 'status'
        ? (value === 'active' ? t('documentRegister.filter.statusActive') : value === 'missing' ? t('documentRegister.filter.statusMissing') : String(value))
        : pdfDocumentRegisterFilterOptionLabel(field,value)
    );
    if (filter.includeEmpty) labels.push(t('common.emptyValue'));
    return labels.join(', ');
  }
  if (filter.kind === 'range') {
    const from=filter.from == null ? '' : pdfDocumentRegisterFilterFormatBound(field,filter.from,settings);
    const to=filter.to == null ? '' : pdfDocumentRegisterFilterFormatBound(field,filter.to,settings);
    if (from && to) return `${from} – ${to}`;
    if (from) return t('documentRegister.filter.fromOnly',{value:from});
    if (to) return t('documentRegister.filter.toOnly',{value:to});
  }
  return '';
}

function pdfDocumentRegisterIsEmptyFilterValue(value) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

function pdfDocumentRegisterMatchesFilter(filter, value) {
  if (!filter || !filter.kind) return true;
  const raw=value?.raw;
  const display=String(value?.display ?? '');
  if (filter.kind === 'contains') {
    const needle=String(filter.query || '').trim().toLocaleLowerCase();
    return !needle || display.toLocaleLowerCase().includes(needle);
  }
  if (filter.kind === 'boolean') return raw === filter.value;
  if (filter.kind === 'choices') {
    const selected=new Set((Array.isArray(filter.values) ? filter.values : []).map(item=>String(item)));
    if (pdfDocumentRegisterIsEmptyFilterValue(raw)) return filter.includeEmpty === true;
    if (Array.isArray(raw)) return raw.some(item=>selected.has(String(item)));
    return selected.has(String(raw));
  }
  if (filter.kind === 'range') {
    if (pdfDocumentRegisterIsEmptyFilterValue(raw)) return false;
    if (filter.valueType === 'integer' || filter.valueType === 'decimal') {
      const number=Number(raw);
      if (!Number.isFinite(number)) return false;
      if (filter.from != null && number < Number(filter.from)) return false;
      if (filter.to != null && number > Number(filter.to)) return false;
      return true;
    }
    const comparable=String(raw);
    if (filter.from != null && comparable < String(filter.from)) return false;
    if (filter.to != null && comparable > String(filter.to)) return false;
    return true;
  }
  return true;
}

class PdfDocumentRegisterHeaderFilterModal extends Modal {
  constructor(app, { label, field=null, systemType='', filter=null, settings={}, i18n=null, rememberFilters=false, onApply }) {
    super(app);
    this.label = String(label || 'Column');
    this.field = field || null;
    this.systemType = String(systemType || '');
    this.filter = filter || null;
    this.settings = settings || {};
    this.i18n = i18n || null;
    this.rememberFilters = rememberFilters === true;
    this.onApply = typeof onApply === 'function' ? onApply : () => {};
  }

  onOpen() {
    this.modalEl?.addClass?.('pdfium-document-register-filter-modal');
    const { contentEl } = this;
    const t=(key,params)=>this.i18n?.t?.(key,params) || key;
    contentEl.empty();
    contentEl.createEl('h2', { text:t('documentRegister.filter.title',{label:this.label}) });
    contentEl.createEl('p', { text:this.rememberFilters
      ? t('documentRegister.filter.persisted')
      : t('documentRegister.filter.temporary') });
    const body=contentEl.createDiv({ cls:'pdfium-document-register-filter-body' });
    const errorEl=contentEl.createDiv({ cls:'pdfium-document-register-filter-error' });
    errorEl.setAttribute('aria-live','polite');
    const actions = contentEl.createDiv({ cls:'pdfium-document-register-filter-actions' });
    const apply = actions.createEl('button', { text:t('common.applyFilter') });
    const clear = actions.createEl('button', { text:t('common.clearFilter') });
    const cancel = actions.createEl('button', { text:t('common.cancel') });
    const type=pdfDocumentRegisterFilterType(this.field,this.systemType);
    const current=this.filter || null;
    let readFilter=()=>null;
    let focusEl=null;

    if (type === 'text' || type === 'link') {
      const input = body.createEl('input', {
        cls:'pdfium-document-register-filter-input',
        type:'search',
        value:current?.kind === 'contains' ? String(current.query || '') : '',
        placeholder:type === 'link' ? t('documentRegister.filter.linkPlaceholder') : t('documentRegister.filter.textPlaceholder')
      });
      input.setAttribute('aria-label',t('documentRegister.filter.aria',{label:this.label}));
      focusEl=input;
      readFilter=()=>{
        const query=String(input.value || '').trim();
        return { ok:true, filter:query ? { kind:'contains', query } : null };
      };
      input.addEventListener('keydown',event=>{
        if (event.key === 'Enter') { event.preventDefault(); submit(); }
        else if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      });
    } else if (type === 'boolean') {
      const select=body.createEl('select',{ cls:'pdfium-document-register-filter-select' });
      const options=[['',t('common.all')],['true',String(this.settings?.uiBooleanLabels?.yes || 'Yes')],['false',String(this.settings?.uiBooleanLabels?.no || 'No')]];
      for (const [value,label] of options) { const el=select.createEl('option',{text:label}); el.value=value; }
      select.value=current?.kind === 'boolean' ? String(current.value === true) : '';
      focusEl=select;
      readFilter=()=>({ ok:true, filter:select.value === '' ? null : { kind:'boolean', value:select.value === 'true' } });
    } else if (type === 'select' || type === 'multiselect' || type === 'status') {
      const selected=new Set(current?.kind === 'choices' && Array.isArray(current.values) ? current.values.map(String) : []);
      const optionDefs=type === 'status'
        ? [{value:'active',label:t('documentRegister.filter.statusActive'),active:true},{value:'missing',label:t('documentRegister.filter.statusMissing'),active:true}]
        : (this.field?.config?.options || []).filter(option=>option?.active !== false || selected.has(String(option?.value ?? '')));
      const list=body.createDiv({ cls:'pdfium-document-register-filter-choices' });
      const checkboxes=[];
      for (const option of optionDefs) {
        const value=String(option?.value ?? '');
        if (!value) continue;
        const row=list.createEl('label',{ cls:'pdfium-document-register-filter-choice' });
        const checkbox=row.createEl('input',{type:'checkbox'});
        checkbox.checked=selected.has(value);
        row.createSpan({text:String(option?.label || value)});
        checkboxes.push({checkbox,value});
        if (!focusEl) focusEl=checkbox;
      }
      const emptyRow=list.createEl('label',{ cls:'pdfium-document-register-filter-choice is-empty-choice' });
      const emptyCheckbox=emptyRow.createEl('input',{type:'checkbox'});
      emptyCheckbox.checked=current?.kind === 'choices' && current.includeEmpty === true;
      emptyRow.createSpan({text:t('common.emptyValue')});
      if (!focusEl) focusEl=emptyCheckbox;
      readFilter=()=>{
        const values=checkboxes.filter(item=>item.checkbox.checked).map(item=>item.value);
        const includeEmpty=emptyCheckbox.checked;
        return { ok:true, filter:(values.length || includeEmpty) ? { kind:'choices', values, includeEmpty, systemType:type === 'status' ? 'status' : '' } : null };
      };
    } else if (['date','time','integer','decimal'].includes(type)) {
      const range=body.createDiv({ cls:'pdfium-document-register-filter-range' });
      const fromLabel=range.createEl('label');
      fromLabel.createSpan({text:t('common.from')});
      const fromInput=fromLabel.createEl('input',{type:'text'});
      const toLabel=range.createEl('label');
      toLabel.createSpan({text:t('common.to')});
      const toInput=toLabel.createEl('input',{type:'text'});
      if (type === 'date') {
        const placeholder=metadataRegionalSettings(this.settings).dateFormat;
        fromInput.placeholder=placeholder; toInput.placeholder=placeholder;
      } else if (type === 'time') {
        const placeholder=this.field?.config?.precision === 'second' ? 'HH:mm:ss' : metadataRegionalSettings(this.settings).timeFormat;
        fromInput.placeholder=placeholder; toInput.placeholder=placeholder;
      } else if (type === 'decimal') {
        const placeholder=metadataRegionalSettings(this.settings).decimalSeparator === ',' ? 'f.eks. 12,5' : 'e.g. 12.5';
        fromInput.placeholder=placeholder; toInput.placeholder=placeholder;
      }
      if (current?.kind === 'range') {
        fromInput.value=pdfDocumentRegisterFilterFormatBound(this.field,current.from,this.settings);
        toInput.value=pdfDocumentRegisterFilterFormatBound(this.field,current.to,this.settings);
      }
      focusEl=fromInput;
      readFilter=()=>{
        const from=pdfDocumentRegisterFilterParseBound(this.field,fromInput.value,this.settings);
        if (!from.ok) return {ok:false,error:`Fra: ${from.error}`};
        const to=pdfDocumentRegisterFilterParseBound(this.field,toInput.value,this.settings);
        if (!to.ok) return {ok:false,error:`Til: ${to.error}`};
        if (from.value == null && to.value == null) return {ok:true,filter:null};
        const compare=(a,b)=>type === 'integer' || type === 'decimal' ? Number(a)-Number(b) : String(a).localeCompare(String(b));
        if (from.value != null && to.value != null && compare(from.value,to.value) > 0) return {ok:false,error:t('documentRegister.filter.rangeOrder')};
        return {ok:true,filter:{kind:'range',valueType:type,from:from.value,to:to.value}};
      };
      for (const input of [fromInput,toInput]) input.addEventListener('keydown',event=>{
        if (event.key === 'Enter') { event.preventDefault(); submit(); }
        else if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      });
    }

    const submit = () => {
      errorEl.setText('');
      const result=readFilter();
      if (!result?.ok) { errorEl.setText(result?.error || 'Ugyldig filter'); focusEl?.focus?.(); return; }
      this.onApply(result.filter || null);
      this.close();
    };
    apply.addEventListener('click', event => { event.preventDefault(); submit(); });
    clear.addEventListener('click', event => { event.preventDefault(); this.onApply(null); this.close(); });
    cancel.addEventListener('click', event => { event.preventDefault(); this.close(); });
    focusEl?.focus?.();
    focusEl?.select?.();
  }

  onClose() { this.contentEl.empty(); }
}

class PdfDocumentRegisterBasesView extends BasesViewBase {
  constructor(controller, parentEl, host) {
    super(controller);
    this.type = PDF_DOCUMENT_REGISTER_BASE_VIEW_TYPE;
    this.host = host || {};
    this.containerEl = parentEl.createDiv('pdfium-document-register-base-view');
    this.activeEditCancel = null;
    this.headerFilters = new Map();
    this.headerFilterPersistenceEnabled = null;
  }

  t(key,params){ return pdfDocumentRegisterT(this.host,key,params); }

  presentationSettings() {
    return metadataPresentationSettings(this.host?.getSettings?.() || {},this.host?.getI18n?.() || null);
  }

  shouldPersistHeaderFilters() {
    return this.host?.getSettings?.()?.rememberDocumentRegisterFilters === true;
  }

  syncHeaderFilterPersistenceState() {
    const enabled=this.shouldPersistHeaderFilters();
    if (enabled && this.headerFilterPersistenceEnabled !== true && this.headerFilters.size === 0) {
      const stored=typeof this.config?.get === 'function'
        ? this.config.get(PDF_DOCUMENT_REGISTER_HEADER_FILTERS_CONFIG_KEY)
        : null;
      this.headerFilters=pdfDocumentRegisterHeaderFiltersFromConfig(stored);
    }
    this.headerFilterPersistenceEnabled=enabled;
    return enabled;
  }

  persistHeaderFiltersIfEnabled() {
    if (!this.shouldPersistHeaderFilters() || typeof this.config?.set !== 'function') return false;
    this.config.set(
      PDF_DOCUMENT_REGISTER_HEADER_FILTERS_CONFIG_KEY,
      pdfDocumentRegisterHeaderFiltersToConfig(this.headerFilters)
    );
    return true;
  }

  getSortDirection(property) {
    const target = pdfDocumentRegisterBareProperty(property);
    const sort = typeof this.config?.getSort === 'function' ? this.config.getSort() : [];
    const match = (Array.isArray(sort) ? sort : []).find(item => pdfDocumentRegisterBareProperty(item?.property) === target);
    return match?.direction === 'ASC' || match?.direction === 'DESC' ? match.direction : null;
  }

  nextSortDirection(current) {
    // 0.1.209 UX contract: ordinary click only, single-column sort.
    // First click on an unsorted column = ASC; every later click toggles ASC/DESC.
    return current === 'ASC' ? 'DESC' : 'ASC';
  }

  cycleSort(property) {
    if (!this.config || typeof this.config.getSort !== 'function' || typeof this.config.setSortProperty !== 'function') {
      new Notice(this.t('documentRegister.sortUnavailable'), 5000);
      return;
    }
    const current = this.getSortDirection(property);
    const next = this.nextSortDirection(current);
    const propertyId = pdfDocumentRegisterPropertyId(property);

    // 0.1.210: use Bases' dedicated sort operation instead of mutating the
    // serialized `sort` config through generic config.set(). Keep the UX
    // deliberately single-column by removing any current sort keys first.
    const existing = this.config.getSort();
    for (const item of Array.isArray(existing) ? existing : []) {
      const existingProperty = String(item?.property || '');
      if (existingProperty) this.config.setSortProperty(existingProperty, 'NONE');
    }
    this.config.setSortProperty(propertyId, next);
  }

  renderHeaderCell(headRow, { property, label, field=null, systemType='', sortable=true, filterable=true }) {
    const th = headRow.createEl('th');
    const wrap = th.createDiv({ cls:'pdfium-document-register-header' });
    const sortButton = wrap.createEl('button', { cls:'pdfium-document-register-header-sort' });
    const direction = sortable ? this.getSortDirection(property) : null;
    sortButton.createSpan({ text:String(label || property) });
    if (direction) {
      sortButton.createSpan({
        cls:'pdfium-document-register-sort-indicator',
        text:direction === 'ASC' ? ' ↑' : ' ↓'
      });
      sortButton.classList.add('is-sorted');
    }
    if (sortable) {
      sortButton.setAttribute('aria-label', direction === 'ASC'
        ? this.t('documentRegister.sortDescAria',{label})
        : this.t('documentRegister.sortAscAria',{label}));
      sortButton.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        this.cycleSort(property);
      });
    } else {
      sortButton.disabled = true;
    }

    if (filterable) {
      const filterButton = wrap.createEl('button', { cls:'pdfium-document-register-header-filter' });
      if (typeof obsidianModule.setIcon === 'function') obsidianModule.setIcon(filterButton,'list-filter');
      else filterButton.setText(this.t('common.filter'));
      const currentFilter = this.headerFilters.get(String(property)) || null;
      const summary=pdfDocumentRegisterFilterSummary(currentFilter,field,this.presentationSettings(),this.host?.getI18n?.() || null);
      if (currentFilter) filterButton.classList.add('is-active');
      filterButton.setAttribute('aria-label',currentFilter ? this.t('documentRegister.filter.changeAria',{label,summary:summary || this.t('documentRegister.filter.activeSummary')}) : this.t('documentRegister.filter.openAria',{label}));
      filterButton.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        new PdfDocumentRegisterHeaderFilterModal(this.host?.app,{
          label,
          field,
          systemType,
          filter:currentFilter,
          settings:this.presentationSettings(),
          i18n:this.host?.getI18n?.() || null,
          rememberFilters:this.shouldPersistHeaderFilters(),
          onApply:filter=>{
            if (filter) this.headerFilters.set(String(property),filter);
            else this.headerFilters.delete(String(property));
            this.persistHeaderFiltersIfEnabled();
            this.onDataUpdated();
          }
        }).open();
      });
    }
    return th;
  }

  matchesHeaderFilters(values) {
    if (!this.headerFilters.size) return true;
    for (const [property, filter] of this.headerFilters.entries()) {
      if (!pdfDocumentRegisterMatchesFilter(filter,values?.[property] || {raw:null,display:''})) return false;
    }
    return true;
  }

  cancelActiveEdit() {
    const cancel = this.activeEditCancel;
    this.activeEditCancel = null;
    if (typeof cancel === 'function') cancel();
  }

  renderDisplayCell(cell, { field, value, pdfPath, editable }) {
    if (!cell) return;
    cell.empty();
    cell.classList.remove('is-editing','has-error','is-saving');
    cell.dataset.property = String(field.property || '');
    cell.dataset.rawValue = value == null ? '' : (Array.isArray(value) ? JSON.stringify(value) : String(value));
    const display = metadataBaseFormatFieldValue(metadataFieldTypeRegistry, field, value, this.presentationSettings());
    const text = display || '—';
    const valueEl = cell.createSpan({ cls:'pdfium-document-register-cell-value', text });
    if (!editable) return;
    cell.classList.add('is-editable');
    cell.setAttribute('tabindex','0');
    cell.setAttribute('title',this.t('documentRegister.editAria',{label:String(field.label || field.property)}));
    const begin = event => {
      if (event?.type === 'keydown' && event.key !== 'Enter' && event.key !== 'F2') return;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      this.beginCellEdit(cell,{ field, value, pdfPath });
    };
    cell.onclick = begin;
    cell.onkeydown = begin;
    if (valueEl) valueEl.setAttribute('aria-label',`${String(field.label || field.property)}: ${text}`);
  }

  beginCellEdit(cell, { field, value, pdfPath }) {
    if (!cell || !field || !pdfPath || cell.classList.contains('is-editing')) return false;
    this.cancelActiveEdit();
    const descriptor = metadataFieldTypeRegistry.get(field.type);
    if (!descriptor?.renderEdit) return false;

    cell.onclick = null;
    cell.onkeydown = null;
    cell.removeAttribute('tabindex');
    cell.classList.remove('has-error');
    cell.classList.add('is-editing');
    cell.empty();

    const editor = cell.createDiv({ cls:'pdfium-document-register-cell-editor' });
    const controlHost = editor.createDiv({ cls:'pdfium-document-register-cell-control' });
    const control = descriptor.renderEdit(controlHost,{ value, field, settings:this.presentationSettings() });
    const actions = editor.createDiv({ cls:'pdfium-document-register-cell-actions' });
    const saveButton = actions.createEl('button',{ cls:'pdfium-document-register-cell-save', text:'✓' });
    const cancelButton = actions.createEl('button',{ cls:'pdfium-document-register-cell-cancel', text:'×' });
    saveButton.setAttribute('aria-label',this.t('documentRegister.saveValueAria'));
    cancelButton.setAttribute('aria-label',this.t('documentRegister.cancelEditAria'));
    const errorEl = cell.createDiv({ cls:'pdfium-document-register-cell-error' });
    errorEl.setAttribute('aria-live','polite');

    let finished = false;
    let saving = false;
    const cancel = () => {
      if (finished) return;
      finished = true;
      if (this.activeEditCancel === cancel) this.activeEditCancel = null;
      this.renderDisplayCell(cell,{ field, value, pdfPath, editable:true });
      cell.focus?.();
    };
    this.activeEditCancel = cancel;

    const commit = async () => {
      if (finished || saving) return false;
      const raw = typeof control?.readRaw === 'function' ? control.readRaw() : null;
      const prepared = metadataBasePrepareFieldUpdate(field, raw, this.presentationSettings(), metadataFieldTypeRegistry);
      if (!prepared.ok) {
        cell.classList.add('has-error');
        errorEl.setText((prepared.errors || []).join(' · ') || 'Invalid value');
        control?.inputEl?.focus?.();
        return false;
      }
      saving = true;
      cell.classList.add('is-saving');
      errorEl.setText('');
      saveButton.disabled = true;
      cancelButton.disabled = true;
      const persisted = await this.host?.saveValues?.(pdfPath,{ [prepared.property]:prepared.value });
      saving = false;
      if (!persisted?.ok) {
        cell.classList.remove('is-saving');
        cell.classList.add('has-error');
        saveButton.disabled = false;
        cancelButton.disabled = false;
        errorEl.setText(persisted?.error || this.t('documentRegister.valueSaveFailed'));
        control?.inputEl?.focus?.();
        return false;
      }
      finished = true;
      if (this.activeEditCancel === cancel) this.activeEditCancel = null;
      const stored = Object.prototype.hasOwnProperty.call(persisted.values || {}, prepared.property)
        ? persisted.values[prepared.property]
        : prepared.value;
      if (cell.isConnected !== false) this.renderDisplayCell(cell,{ field, value:stored, pdfPath, editable:true });
      return true;
    };

    saveButton.addEventListener('click',event=>{ event.preventDefault(); event.stopPropagation(); void commit(); });
    cancelButton.addEventListener('click',event=>{ event.preventDefault(); event.stopPropagation(); cancel(); });
    const inputEl = control?.inputEl || null;
    if (inputEl) {
      inputEl.addEventListener('keydown',event=>{
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancel();
          return;
        }
        if (event.key === 'Enter' && field.type !== 'multiselect') {
          event.preventDefault();
          event.stopPropagation();
          void commit();
        }
      });
      if (field.type === 'boolean' || field.type === 'select') {
        inputEl.addEventListener('change',()=>{ void commit(); });
      }
      inputEl.focus?.();
      if (typeof inputEl.select === 'function' && !['select','boolean','multiselect'].includes(field.type)) inputEl.select();
    }
    return true;
  }

  onDataUpdated() {
    this.activeEditCancel = null;
    this.containerEl.empty();
    const schema = this.host?.getSchema?.() || null;
    if (!schema) {
      this.containerEl.createDiv({ cls:'pdfium-document-register-message', text:this.t('documentRegister.schemaUnavailable') });
      return;
    }

    this.syncHeaderFilterPersistenceState();
    const fields = metadataBaseVisibleFields(schema);
    const entries = pdfDocumentRegisterEntries(this.data);
    if (!entries.length) {
      this.containerEl.createDiv({ cls:'pdfium-document-register-message', text:this.t('documentRegister.noDocuments') });
      return;
    }

    const help = this.containerEl.createDiv({ cls:'pdfium-document-register-edit-help' });
    const filterCount = this.headerFilters.size;
    const rememberFilters=this.shouldPersistHeaderFilters();
    help.setText(filterCount
      ? this.t('documentRegister.helpActive',{count:filterCount,persistence:rememberFilters ? this.t('documentRegister.filtersSaved') : this.t('documentRegister.filtersTemporary')})
      : this.t('documentRegister.helpIdle',{persistence:rememberFilters ? this.t('documentRegister.filtersSaved') : this.t('documentRegister.filtersTemporary')}));

    const scroll = this.containerEl.createDiv({ cls:'pdfium-document-register-scroll' });
    const table = scroll.createEl('table', { cls:'pdfium-document-register-table' });
    const thead = table.createEl('thead');
    const headRow = thead.createEl('tr');
    for (const field of fields) this.renderHeaderCell(headRow,{ property:field.property, label:String(field.label || field.property), field });
    this.renderHeaderCell(headRow,{ property:'filemeta_status', label:this.t('documentRegister.status'), systemType:'status' });
    this.renderHeaderCell(headRow,{ property:'filemeta_file', label:this.t('documentRegister.pdf'), systemType:'link' });

    const tbody = table.createEl('tbody');
    let visibleRows = 0;
    for (const entry of entries) {
      const frontmatter = this.host?.getFrontmatter?.(entry.file) || null;
      const parsedRecord = metadataRecordFromFrontmatter(frontmatter, schema);
      if (!parsedRecord.ok) continue;
      const canonicalFrontmatter = { ...frontmatter, ...parsedRecord.record.values };
      const presented = metadataBasePresentFrontmatter(canonicalFrontmatter, schema, this.presentationSettings(), metadataFieldTypeRegistry);
      if (!presented.ok) continue;

      const rawLink = String(frontmatter?.filemeta_file || '');
      const linkTarget = metadataRecordPdfPathFromLink(rawLink);
      const resolvedPath = this.host?.resolvePdfPath?.(linkTarget, entry.file?.path || '') || linkTarget;
      const activeRecord = String(frontmatter?.filemeta_status || '') === METADATA_RECORD_STATUS_ACTIVE;
      const canOpenPdf = activeRecord && !!resolvedPath;
      const presentedByProperty = new Map(presented.fields.map(item=>[item.property,item]));
      const filterValues = {};
      for (const field of fields) {
        const item = presentedByProperty.get(field.property) || { raw:null, display:'—' };
        filterValues[field.property] = { raw:item.raw, display:item.display || '—' };
      }
      filterValues.filemeta_status = { raw:activeRecord ? 'active' : 'missing', display:activeRecord ? this.t('common.active') : this.t('common.missing') };
      filterValues.filemeta_file = { raw:resolvedPath || linkTarget || '', display:resolvedPath || linkTarget || this.t('documentRegister.pdfMissing') };
      if (!this.matchesHeaderFilters(filterValues)) continue;
      visibleRows += 1;
      const row = tbody.createEl('tr');
      row.dataset.pdfmetaStatus = activeRecord ? METADATA_RECORD_STATUS_ACTIVE : METADATA_RECORD_STATUS_MISSING;

      const fieldByProperty = new Map(fields.map(field=>[field.property,field]));
      for (const field of fields) {
        const item = presentedByProperty.get(field.property) || { property:field.property, raw:null, display:'—' };
        const cell = row.createEl('td');
        const canonicalField = fieldByProperty.get(item.property);
        if (!canonicalField) {
          cell.setText(item.display || '—');
          continue;
        }
        this.renderDisplayCell(cell,{ field:canonicalField, value:item.raw, pdfPath:resolvedPath, editable:canOpenPdf });
      }

      const statusCell = row.createEl('td', { cls:'pdfium-document-register-status-cell' });
      statusCell.createSpan({
        cls:activeRecord ? 'pdfium-document-register-status is-active' : 'pdfium-document-register-status is-missing',
        text:activeRecord ? this.t('common.active') : this.t('common.missing')
      });

      const pdfCell = row.createEl('td', { cls:'pdfium-document-register-pdf-cell' });
      if (canOpenPdf) {
        const openButton = pdfCell.createEl('button', { cls:'pdfium-document-register-open', text:this.t('common.open') });
        const fileName = String(resolvedPath).split('/').pop() || 'PDF';
        openButton.setAttribute('aria-label',this.t('documentRegister.openPdfAria',{name:fileName}));
        openButton.setAttribute('title',String(resolvedPath));
        openButton.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          void this.host?.openLink?.(resolvedPath, entry.file?.path || '');
        });
        pdfCell.createSpan({ cls:'pdfium-document-register-pdf-name', text:fileName });
      } else {
        const label = resolvedPath ? String(resolvedPath).split('/').pop() : (linkTarget ? String(linkTarget).split('/').pop() : this.t('documentRegister.pdfMissing'));
        pdfCell.createSpan({ cls:'pdfium-document-register-missing-path', text:label || this.t('documentRegister.pdfMissing') });
        const relinkButton = pdfCell.createEl('button', { cls:'pdfium-document-register-relink', text:this.t('documentRegister.relinkButton') });
        relinkButton.setAttribute('aria-label',this.t('documentRegister.relinkAria',{id:parsedRecord.record.id}));
        relinkButton.addEventListener('click',event=>{
          event.preventDefault();
          event.stopPropagation();
          new PdfDocumentRelinkModal(this.host?.app, this.host, parsedRecord.record.id, parsedRecord.record.pdfPath || linkTarget).open();
        });
      }
    }
    if (!visibleRows && this.headerFilters.size) {
      const emptyRow = tbody.createEl('tr');
      const emptyCell = emptyRow.createEl('td', { cls:'pdfium-document-register-filter-empty', text:this.t('documentRegister.noFilterMatches') });
      emptyCell.setAttribute('colspan',String(fields.length + 2));
    }
  }}
