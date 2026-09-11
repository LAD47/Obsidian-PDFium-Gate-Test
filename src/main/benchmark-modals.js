function metadataBenchmarkT(plugin,key,params){ return plugin?.i18n?.t?.(key,params) || key; }
function metadataBenchmarkUiNumber(value){ const n=Number(value); return Number.isFinite(n) ? String(Math.trunc(n)) : '0'; }

class MetadataBenchmarkSizeModal extends Modal {
  constructor(app,plugin,onChoose,currentCount=0) {
    super(app);
    this.plugin=plugin;
    this.onChoose=onChoose;
    this.currentCount=Number(currentCount)||0;
  }
  onOpen() {
    const {contentEl}=this;
    const t=(key,params)=>metadataBenchmarkT(this.plugin,key,params);
    contentEl.empty();
    contentEl.createEl('h2',{text:t('benchmark.size.title')});
    contentEl.createEl('p',{text:t('benchmark.size.intro')});
    contentEl.createEl('p',{text:t('benchmark.size.current',{count:metadataBenchmarkUiNumber(this.currentCount)})});
    contentEl.createEl('p',{text:t('benchmark.size.choose')});
    for(const count of METADATA_BENCHMARK_ALLOWED_COUNTS) {
      new Setting(contentEl)
        .setName(t('benchmark.size.option',{count:metadataBenchmarkUiNumber(count)}))
        .setDesc(count===1000?t('benchmark.size.normal'):count===10000?t('benchmark.size.scale'):count===50000?t('benchmark.size.stress'):t('benchmark.size.extreme'))
        .addButton(button=>{
          button.setButtonText(t('common.generate'));
          button.setDisabled(count<this.currentCount);
          button.onClick(()=>{
            this.close();
            void this.onChoose?.(count);
          });
        });
    }
    new Setting(contentEl).addButton(button=>button.setButtonText(t('common.cancel')).onClick(()=>this.close()));
  }
  onClose(){ this.contentEl.empty(); }
}

class MetadataBenchmarkProgressModal extends Modal {
  constructor(app,plugin,title='PDF benchmark') {
    super(app);
    this.plugin=plugin;
    this.title=title;
    this.statusEl=null;
    this.detailEl=null;
  }
  onOpen() {
    const {contentEl}=this;
    contentEl.empty();
    contentEl.createEl('h2',{text:this.title});
    this.statusEl=contentEl.createEl('p',{text:metadataBenchmarkT(this.plugin,'common.starting')});
    this.detailEl=contentEl.createEl('p',{text:''});
    this.detailEl.style.opacity='0.75';
  }
  setProgress(done,total,detail='') {
    if(this.statusEl) this.statusEl.setText(`${metadataBenchmarkUiNumber(done)} / ${metadataBenchmarkUiNumber(total)}`);
    if(this.detailEl) this.detailEl.setText(detail);
  }
  setMessage(message,detail='') {
    if(this.statusEl) this.statusEl.setText(String(message||''));
    if(this.detailEl) this.detailEl.setText(String(detail||''));
  }
  onClose(){ this.contentEl.empty(); this.statusEl=null; this.detailEl=null; }
}

class MetadataBenchmarkCleanupModal extends Modal {
  constructor(app,plugin,onConfirm,count=0) {
    super(app);
    this.plugin=plugin;
    this.onConfirm=onConfirm;
    this.count=Number(count)||0;
  }
  onOpen() {
    const {contentEl}=this;
    const t=(key,params)=>metadataBenchmarkT(this.plugin,key,params);
    contentEl.empty();
    contentEl.createEl('h2',{text:t('benchmark.cleanup.title')});
    contentEl.createEl('p',{text:t('benchmark.cleanup.intro',{count:metadataBenchmarkUiNumber(this.count),root:METADATA_BENCHMARK_ROOT})});
    new Setting(contentEl)
      .addButton(button=>button.setButtonText(t('common.cancel')).onClick(()=>this.close()))
      .addButton(button=>{
        button.setButtonText(t('benchmark.cleanup.delete'));
        button.setWarning();
        button.onClick(()=>{ this.close(); void this.onConfirm?.(); });
      });
  }
  onClose(){ this.contentEl.empty(); }
}

class MetadataBenchmarkReportModal extends Modal {
  constructor(app,plugin,report,reportPath='') {
    super(app);
    this.plugin=plugin;
    this.report=report||{};
    this.reportPath=String(reportPath||'');
  }
  onOpen() {
    const {contentEl}=this;
    const r=this.report||{};
    const t=(key,params)=>metadataBenchmarkT(this.plugin,key,params);
    const cold=r.previousBuild||null;
    const forced=r.forcedBuild||null;
    const lookup=r.lookup||null;
    contentEl.empty();
    contentEl.createEl('h2',{text:t('benchmark.report.title')});
    const summary=contentEl.createDiv();
    summary.createEl('p',{text:t('benchmark.report.dataset',{count:metadataBenchmarkUiNumber(r.dataset?.count||0),pdfs:metadataBenchmarkUiNumber(r.dataset?.pdfFilesSeen||0),records:metadataBenchmarkUiNumber(r.dataset?.benchmarkRecordsIndexed||0)})});
    if(cold) {
      summary.createEl('p',{text:t('benchmark.report.cold',{ms:Number(cold.durationMs||0).toFixed(1),records:metadataBenchmarkUiNumber(cold.recordCount||0),invalid:cold.invalidCount||0})});
      if(typeof cold.cacheHits==='number') summary.createEl('p',{text:t('benchmark.report.coldCache',{hits:metadataBenchmarkUiNumber(cold.cacheHits||0),misses:metadataBenchmarkUiNumber(cold.cacheMisses||0),disk:Number(cold.diskReadParseMs||0).toFixed(1),load:Number(cold.cacheLoadMs||0).toFixed(1)})});
    }
    if(forced) {
      summary.createEl('p',{text:t('benchmark.report.forced',{ms:Number(forced.durationMs||0).toFixed(1),candidates:metadataBenchmarkUiNumber(forced.recordCandidateCount||0),index:metadataBenchmarkUiNumber(forced.recordCount||0)})});
      if(typeof forced.cacheHits==='number') summary.createEl('p',{text:t('benchmark.report.forcedCache',{hits:metadataBenchmarkUiNumber(forced.cacheHits||0),misses:metadataBenchmarkUiNumber(forced.cacheMisses||0),disk:Number(forced.diskReadParseMs||0).toFixed(1),load:Number(forced.cacheLoadMs||0).toFixed(1)})});
    }
    if(lookup) {
      summary.createEl('p',{text:t('benchmark.report.mapLookup',{iterations:metadataBenchmarkUiNumber(lookup.rawIterations||0),ms:Number(lookup.rawDurationMs||0).toFixed(2),avg:Number(lookup.rawAverageUs||0).toFixed(3)})});
      summary.createEl('p',{text:t('benchmark.report.stateLookup',{iterations:metadataBenchmarkUiNumber(lookup.stateIterations||0),ms:Number(lookup.stateDurationMs||0).toFixed(2),avg:Number(lookup.stateAverageUs||0).toFixed(3)})});
    }
    if(r.memory?.after) summary.createEl('p',{text:t('benchmark.report.memory',{heap:Number(r.memory.after.heapUsedMb||0).toFixed(1),rss:Number(r.memory.after.rssMb||0).toFixed(1)})});
    if(this.reportPath) summary.createEl('p',{text:t('benchmark.report.saved',{path:this.reportPath})});
    contentEl.createEl('h3',{text:t('benchmark.report.full')});
    const pre=contentEl.createEl('pre');
    pre.style.whiteSpace='pre-wrap';
    pre.style.maxHeight='45vh';
    pre.style.overflow='auto';
    pre.setText(JSON.stringify(r,null,2));
    new Setting(contentEl)
      .addButton(button=>button.setButtonText(t('common.copyReport')).onClick(()=>{
        try { clipboardTextAdapter.writeText(JSON.stringify(r,null,2)); new Notice(t('benchmark.report.copied')); }
        catch(error) { new Notice(t('benchmark.report.copyFailed',{error:error instanceof Error?error.message:String(error)})); }
      }))
      .addButton(button=>button.setButtonText(t('common.close')).setCta().onClick(()=>this.close()));
  }
  onClose(){ this.contentEl.empty(); }
}
