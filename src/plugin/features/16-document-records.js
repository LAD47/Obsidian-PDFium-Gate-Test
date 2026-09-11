'use strict';

function documentRecordBenchmarkNowMs() {
  return typeof performance!=='undefined' && performance && typeof performance.now==='function' ? performance.now() : Date.now();
}

function documentRecordBenchmarkMemorySnapshot() {
  try {
    const usage=typeof process!=='undefined' && process && typeof process.memoryUsage==='function' ? process.memoryUsage() : null;
    if(!usage) return null;
    const mb=value=>Number((Number(value||0)/(1024*1024)).toFixed(3));
    return {rssMb:mb(usage.rss),heapUsedMb:mb(usage.heapUsed),heapTotalMb:mb(usage.heapTotal),externalMb:mb(usage.external)};
  } catch(_) { return null; }
}

class DocumentRecordsFeature {
  getDocumentRecordIndexCache() {
    if(this.metadataRecordIndexCache) return this.metadataRecordIndexCache;
    this.metadataRecordIndexCache=createMetadataRecordIndexCache({
      fileStore:this.obsidianAdapterFileStore,
      recordApi:metadataRecordContract,
      cryptoApi:crypto
    });
    return this.metadataRecordIndexCache;
  }

  getDocumentRecordRepository() {
    if(this.metadataRecordRepository) return this.metadataRecordRepository;
    this.metadataRecordRepository=createMetadataRecordRepository({
      vaultReadAdapter:this.obsidianVaultReadAdapter,
      vaultWriteAdapter:this.obsidianVaultWriteAdapter,
      frontmatterAdapter:this.obsidianFrontmatterAdapter,
      parseYamlFn:parseYaml,
      recordApi:metadataRecordContract
    });
    return this.metadataRecordRepository;
  }

  runDocumentRecordOperation(task) {
    const previous=this.state.documentRecords.operationQueue;
    const next=previous.then(()=>task(),()=>task());
    this.state.documentRecords.operationQueue=next.then(()=>undefined,()=>undefined);
    return next;
  }

  resolveDocumentRecordPdfPath(pdfPath, recordPath = '') {
    const linkPath=metadataRecordNormalizeVaultPath(pdfPath);
    if(!linkPath) return '';

    // Canonical identity is the actual vault TFile.path, never the textual
    // wikilink representation stored in pdfmeta_file. Obsidian may rewrite
    // an equivalent link from [[Folder/file.pdf]] to [[file.pdf]] after
    // rename; both must resolve to the same index key.
    // Resolve with Obsidian's own link semantics first. This is essential for
    // shortest-path links because a basename may refer to a file outside the
    // vault root and must not be mistaken for a same-named root file.
    const resolved=this.obsidianLinkResolutionAdapter?.resolveFirst?.(linkPath,metadataRecordNormalizeVaultPath(recordPath));
    if(resolved?.ok && resolved.file && String(resolved.file.extension || '').toLowerCase()==='pdf') {
      return metadataRecordNormalizeVaultPath(resolved.file.path);
    }

    // Direct lookup is only a fallback when Obsidian's resolver is unavailable
    // or cannot resolve an otherwise canonical vault path.
    const direct=this.obsidianVaultReadAdapter?.getAbstractFileByPath?.(linkPath) || null;
    if(direct && String(direct.extension || '').toLowerCase()==='pdf') {
      return metadataRecordNormalizeVaultPath(direct.path);
    }

    // Missing PDFs must retain their persisted path so delete/missing records
    // remain inspectable even when there is no TFile to resolve.
    return linkPath;
  }

  clearDocumentRecordIndex() {
    this.state.documentRecords.byPdfPath.clear();
    this.state.documentRecords.byId.clear();
    this.state.documentRecords.entryByRecordPath.clear();
    this.state.documentRecords.recordPathsById.clear();
    this.state.documentRecords.idsByPdfPath.clear();
    this.state.documentRecords.ambiguousIds.clear();
    this.state.documentRecords.ambiguousPdfPaths.clear();
  }

  recomputeDocumentRecordPdfPath(pdfPath) {
    const path=metadataRecordNormalizeVaultPath(pdfPath);
    if(!path) return;
    const ids=this.state.documentRecords.idsByPdfPath.get(path);
    if(!ids || ids.size===0) {
      this.state.documentRecords.idsByPdfPath.delete(path);
      this.state.documentRecords.byPdfPath.delete(path);
      this.state.documentRecords.ambiguousPdfPaths.delete(path);
      return;
    }
    if(ids.size===1) {
      const id=ids.values().next().value;
      const entry=this.state.documentRecords.byId.get(id);
      if(entry && !this.state.documentRecords.ambiguousIds.has(id) && entry.status===METADATA_RECORD_STATUS_ACTIVE && entry.pdfPath===path) {
        this.state.documentRecords.byPdfPath.set(path,id);
        this.state.documentRecords.ambiguousPdfPaths.delete(path);
        return;
      }
    }
    this.state.documentRecords.byPdfPath.delete(path);
    this.state.documentRecords.ambiguousPdfPaths.add(path);
  }

  recomputeDocumentRecordId(id) {
    const key=String(id || '').toLowerCase();
    const paths=this.state.documentRecords.recordPathsById.get(key);
    if(!paths || paths.size===0) {
      this.state.documentRecords.recordPathsById.delete(key);
      this.state.documentRecords.byId.delete(key);
      this.state.documentRecords.ambiguousIds.delete(key);
      return;
    }
    if(paths.size===1) {
      const recordPath=paths.values().next().value;
      const entry=this.state.documentRecords.entryByRecordPath.get(recordPath);
      if(entry) {
        this.state.documentRecords.byId.set(key,entry);
        this.state.documentRecords.ambiguousIds.delete(key);
      }
    } else {
      this.state.documentRecords.byId.delete(key);
      this.state.documentRecords.ambiguousIds.add(key);
    }
    for(const recordPath of paths) {
      const entry=this.state.documentRecords.entryByRecordPath.get(recordPath);
      if(entry?.pdfPath) this.recomputeDocumentRecordPdfPath(entry.pdfPath);
    }
  }

  addDocumentRecordEntry(entry) {
    const recordPath=metadataRecordNormalizeVaultPath(entry?.recordPath);
    const id=String(entry?.id || '').toLowerCase();
    const pdfPath=this.resolveDocumentRecordPdfPath(entry?.pdfPath,recordPath);
    if(!recordPath || !metadataRecordIsUuidV4(id) || !pdfPath) throw new Error('kan ikke indeksere ugyldig metadata-record');
    const canonicalPath=metadataRecordPathFromId(id);
    if(recordPath!==canonicalPath) throw new Error(`metadata-record ligger på ikke-canonical sti: ${recordPath}`);
    const normalized={...entry,recordPath,id,pdfPath,values:metadataRecordClone(entry.values || {})};
    this.state.documentRecords.entryByRecordPath.set(recordPath,normalized);
    let idPaths=this.state.documentRecords.recordPathsById.get(id);
    if(!idPaths) {
      idPaths=new Set();
      this.state.documentRecords.recordPathsById.set(id,idPaths);
    }
    idPaths.add(recordPath);
    if(normalized.status===METADATA_RECORD_STATUS_ACTIVE) {
      let pathIds=this.state.documentRecords.idsByPdfPath.get(pdfPath);
      if(!pathIds) {
        pathIds=new Set();
        this.state.documentRecords.idsByPdfPath.set(pdfPath,pathIds);
      }
      pathIds.add(id);
    }
    this.recomputeDocumentRecordId(id);
    this.recomputeDocumentRecordPdfPath(pdfPath);
    return normalized;
  }

  removeDocumentRecordEntryByPath(recordPath) {
    const path=metadataRecordNormalizeVaultPath(recordPath);
    const entry=this.state.documentRecords.entryByRecordPath.get(path);
    if(!entry) return null;
    this.state.documentRecords.entryByRecordPath.delete(path);
    const idPaths=this.state.documentRecords.recordPathsById.get(entry.id);
    if(idPaths) {
      idPaths.delete(path);
      if(idPaths.size===0) this.state.documentRecords.recordPathsById.delete(entry.id);
    }
    if(entry.status===METADATA_RECORD_STATUS_ACTIVE) {
      const pathIds=this.state.documentRecords.idsByPdfPath.get(entry.pdfPath);
      if(pathIds) {
        pathIds.delete(entry.id);
        if(pathIds.size===0) this.state.documentRecords.idsByPdfPath.delete(entry.pdfPath);
      }
    }
    this.recomputeDocumentRecordId(entry.id);
    this.recomputeDocumentRecordPdfPath(entry.pdfPath);
    return entry;
  }

  replaceDocumentRecordEntry(readBack) {
    const recordPath=metadataRecordNormalizeVaultPath(readBack?.recordPath || readBack?.file?.path);
    if(!readBack?.ok || !readBack.record || !recordPath) throw new Error(readBack?.error || 'metadata record read-back mangler');
    this.removeDocumentRecordEntryByPath(recordPath);
    return this.addDocumentRecordEntry({
      id:readBack.record.id,
      pdfPath:readBack.record.pdfPath,
      status:readBack.record.status,
      values:readBack.record.values,
      recordPath,
      file:readBack.file
    });
  }

  async parseDocumentRecordFile(file,schema,preferDisk = false) {
    const recordPath=metadataRecordNormalizeVaultPath(file?.path);
    if(!metadataRecordIsPath(recordPath) || String(file?.extension || '').toLowerCase()!=='md') return {ok:false,ignored:true,error:'ikke metadata-record'};
    const cached=preferDisk ? null : (this.obsidianMetadataCacheAdapter?.getFrontmatter?.(file) || null);
    if(cached) {
      const parsed=metadataRecordFromFrontmatter(cached,schema);
      if(parsed.ok) return {...parsed,file,recordPath};
    }
    return await this.getDocumentRecordRepository().readRecordFile(file,schema);
  }


  cancelDocumentRecordIndexWarmup() {
    const handle=this.state.documentRecords.warmupIdleHandle;
    if(!handle) return false;
    try { this.obsidianWorkspaceLifecycleAdapter?.cancelIdle?.(handle); } catch(_) {}
    this.state.documentRecords.warmupIdleHandle=null;
    return true;
  }

  markDocumentRecordLayoutReady() {
    if(!this.state.documentRecords.warmupLayoutReady) {
      this.state.documentRecords.warmupLayoutReady=true;
      this.state.documentRecords.warmupGateOrder=this.state.documentRecords.warmupGateOrder
        ? `${this.state.documentRecords.warmupGateOrder}>layout-ready`
        : 'layout-ready';
    }
    return this.scheduleDocumentRecordIndexWarmup();
  }

  markDocumentRecordMetadataResolved() {
    if(!this.state.documentRecords.warmupMetadataResolved) {
      this.state.documentRecords.warmupMetadataResolved=true;
      this.state.documentRecords.warmupGateOrder=this.state.documentRecords.warmupGateOrder
        ? `${this.state.documentRecords.warmupGateOrder}>metadata-resolved`
        : 'metadata-resolved';
    }
    return this.scheduleDocumentRecordIndexWarmup();
  }

  scheduleDocumentRecordIndexWarmup() {
    if(!this.state.documentRecords.warmupLayoutReady || !this.state.documentRecords.warmupMetadataResolved) return false;
    if(this.state.documentRecords.initialized || this.state.documentRecords.readyPromise || this.state.documentRecords.warmupIdleHandle) return false;
    const scheduler=this.obsidianWorkspaceLifecycleAdapter;
    if(!scheduler || typeof scheduler.scheduleIdle!=='function') {
      void this.ensureDocumentRecordIndexReady('cold-start-demand').catch(error=>console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] metadata record index warmup failed`,error));
      return false;
    }
    this.state.documentRecords.warmupScheduledAtMs=documentRecordBenchmarkNowMs();
    this.state.documentRecords.warmupScheduleMode='idle-after-layout-ready+metadata-resolved';
    this.state.documentRecords.warmupIdleHandle=scheduler.scheduleIdle(()=>{
      this.state.documentRecords.warmupIdleHandle=null;
      void this.ensureDocumentRecordIndexReady('cold-start-idle').catch(error=>console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] metadata record idle warmup failed`,error));
    });
    return true;
  }

  async rebuildDocumentRecordIndex(reason='normal') {
    const startedAt=documentRecordBenchmarkNowMs();
    const memoryBefore=documentRecordBenchmarkMemorySnapshot();
    const schema=this.ports.getMetadataSchemaSnapshot();
    if(!schema) throw new Error('metadata schema er ikke tilgjengelig for record-index');
    this.clearDocumentRecordIndex();
    const listedAt=documentRecordBenchmarkNowMs();
    const markdownFiles=this.obsidianVaultReadAdapter.listMarkdownFiles();
    const listedDoneAt=documentRecordBenchmarkNowMs();
    const files=markdownFiles.filter(file=>metadataRecordIsPath(file?.path));
    const filteredAt=documentRecordBenchmarkNowMs();

    const cacheStartedAt=documentRecordBenchmarkNowMs();
    let cacheState={ok:true,usable:false,reason:'unavailable',entries:new Map()};
    try { cacheState=await this.getDocumentRecordIndexCache().load(schema); }
    catch(error) {
      cacheState={ok:true,usable:false,reason:'load-error',entries:new Map(),error:error instanceof Error?error.message:String(error)};
      console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] Metadata index-cache ignoreres; Markdown brukes som sannhet.`,error);
    }
    const cacheLoadedAt=documentRecordBenchmarkNowMs();

    let invalidCount=0;
    let cacheHits=0;
    let cacheMisses=0;
    let diskReadParseMs=0;
    let indexPopulateMs=0;
    const cacheWriteItems=[];

    for(const file of files) {
      let parsed=null;
      try {
        parsed=this.getDocumentRecordIndexCache().get(cacheState,file);
        if(parsed) cacheHits++;
        else {
          cacheMisses++;
          const readStarted=documentRecordBenchmarkNowMs();
          parsed=await this.parseDocumentRecordFile(file,schema,true);
          diskReadParseMs+=documentRecordBenchmarkNowMs()-readStarted;
        }
        if(!parsed?.ok) { invalidCount++; continue; }
        cacheWriteItems.push({file,parsed});
        const indexStarted=documentRecordBenchmarkNowMs();
        this.addDocumentRecordEntry({
          id:parsed.record.id,
          pdfPath:parsed.record.pdfPath,
          status:parsed.record.status,
          values:parsed.record.values,
          recordPath:parsed.recordPath,
          file
        });
        indexPopulateMs+=documentRecordBenchmarkNowMs()-indexStarted;
      } catch(error) {
        invalidCount++;
        console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] Ignorerer ugyldig metadata-record ${file?.path || ''}`,error);
      }
    }

    let cacheWriteMs=0;
    let cacheWriteError=null;
    const shouldRefreshCache=!cacheState.usable || cacheMisses>0 || Number(cacheState.entries?.size||0)!==cacheWriteItems.length;
    if(shouldRefreshCache) {
      const writeStarted=documentRecordBenchmarkNowMs();
      try { await this.getDocumentRecordIndexCache().write(schema,cacheWriteItems); }
      catch(error) {
        cacheWriteError=error instanceof Error?error.message:String(error);
        console.warn(`[PDFium Gate Test ${PLUGIN_VERSION}] Metadata index-cache kunne ikke oppdateres; Markdown-indexen er fortsatt gyldig.`,error);
      }
      cacheWriteMs=documentRecordBenchmarkNowMs()-writeStarted;
    }

    this.state.documentRecords.lastError=invalidCount ? `${invalidCount} metadata-record(s) kunne ikke indekseres` : null;
    this.state.documentRecords.initialized=true;
    const finishedAt=documentRecordBenchmarkNowMs();
    const isStartupBuild=String(reason||'').startsWith('cold-start');
    const startupDeferralMs=isStartupBuild && Number.isFinite(this.state.documentRecords.warmupScheduledAtMs)
      ? Math.max(0,startedAt-this.state.documentRecords.warmupScheduledAtMs)
      : null;
    this.state.documentRecords.lastBuildMetrics={
      reason:String(reason||'normal'),
      startupScheduleMode:isStartupBuild ? String(this.state.documentRecords.warmupScheduleMode||'on-demand') : null,
      startupGateOrder:isStartupBuild ? String(this.state.documentRecords.warmupGateOrder||'') : null,
      startupDeferralMs:startupDeferralMs===null ? null : Number(startupDeferralMs.toFixed(3)),
      durationMs:Number((finishedAt-startedAt).toFixed(3)),
      listMarkdownMs:Number((listedDoneAt-listedAt).toFixed(3)),
      filterCandidatesMs:Number((filteredAt-listedDoneAt).toFixed(3)),
      cacheLoadMs:Number((cacheLoadedAt-cacheStartedAt).toFixed(3)),
      cacheReason:String(cacheState.reason||''),
      cacheUsable:cacheState.usable===true,
      cacheEntriesLoaded:Number(cacheState.entries?.size||0),
      cacheHits,
      cacheMisses,
      diskReadParseMs:Number(diskReadParseMs.toFixed(3)),
      indexPopulateMs:Number(indexPopulateMs.toFixed(3)),
      cacheWriteMs:Number(cacheWriteMs.toFixed(3)),
      cacheWriteError,
      parseAndIndexMs:Number((finishedAt-filteredAt).toFixed(3)),
      markdownFileCount:markdownFiles.length,
      recordCandidateCount:files.length,
      recordCount:this.state.documentRecords.entryByRecordPath.size,
      activePathCount:this.state.documentRecords.byPdfPath.size,
      ambiguousPathCount:this.state.documentRecords.ambiguousPdfPaths.size,
      ambiguousIdCount:this.state.documentRecords.ambiguousIds.size,
      invalidCount,
      memoryBefore,
      memoryAfter:documentRecordBenchmarkMemorySnapshot()
    };
    return {
      ok:true,
      recordCount:this.state.documentRecords.entryByRecordPath.size,
      activePathCount:this.state.documentRecords.byPdfPath.size,
      ambiguousPathCount:this.state.documentRecords.ambiguousPdfPaths.size,
      invalidCount,
      metrics:metadataRecordClone(this.state.documentRecords.lastBuildMetrics)
    };
  }

  ensureDocumentRecordIndexReady(reason='cold-start-demand') {
    if(this.state.documentRecords.initialized) return Promise.resolve({ok:true,alreadyReady:true});
    if(this.state.documentRecords.readyPromise) return this.state.documentRecords.readyPromise;
    if(this.state.documentRecords.warmupIdleHandle && reason!=='cold-start-idle') {
      this.cancelDocumentRecordIndexWarmup();
      this.state.documentRecords.warmupScheduleMode='on-demand-before-idle';
    } else if(reason!=='cold-start-idle' && (!this.state.documentRecords.warmupLayoutReady || !this.state.documentRecords.warmupMetadataResolved)) {
      this.state.documentRecords.warmupScheduleMode='on-demand-before-startup-gate';
    }
    const readyPromise=this.runDocumentRecordOperation(async()=>{
      if(this.state.documentRecords.initialized) return {ok:true,alreadyReady:true};
      try {
        return await this.rebuildDocumentRecordIndex(reason);
      } catch(error) {
        this.state.documentRecords.lastError=error instanceof Error?error.message:String(error);
        throw error;
      }
    });
    this.state.documentRecords.readyPromise=readyPromise;
    void readyPromise.catch(()=>{ if(this.state.documentRecords.readyPromise===readyPromise) this.state.documentRecords.readyPromise=null; });
    return readyPromise;
  }

  setDocumentRecordBenchmarkEventSuppression(enabled) {
    this.state.documentRecords.benchmarkEventSuppression=enabled===true;
    return this.state.documentRecords.benchmarkEventSuppression;
  }

  async runDocumentRecordIndexBenchmark() {
    return await this.runDocumentRecordOperation(async()=>{
      const previousBuild=metadataRecordClone(this.state.documentRecords.lastBuildMetrics || null);
      const memoryBefore=documentRecordBenchmarkMemorySnapshot();
      this.state.documentRecords.initialized=false;
      const rebuild=await this.rebuildDocumentRecordIndex('benchmark-forced');
      const paths=[...this.state.documentRecords.byPdfPath.keys()];
      const rawIterations=paths.length ? Math.min(100000,Math.max(10000,paths.length*2)) : 0;
      let checksum=0;
      let started=documentRecordBenchmarkNowMs();
      for(let i=0;i<rawIterations;i++) {
        const id=this.state.documentRecords.byPdfPath.get(paths[i%paths.length]);
        if(id) checksum+=id.charCodeAt(0)||0;
      }
      const rawDurationMs=documentRecordBenchmarkNowMs()-started;
      const stateIterations=paths.length ? Math.min(20000,Math.max(2000,paths.length)) : 0;
      started=documentRecordBenchmarkNowMs();
      for(let i=0;i<stateIterations;i++) {
        const state=this.getDocumentMetadataRecordState(paths[i%paths.length]);
        if(state?.registered) checksum+=String(state.id||'').length;
      }
      const stateDurationMs=documentRecordBenchmarkNowMs()-started;
      let benchmarkRecordsIndexed=0;
      for(const entry of this.state.documentRecords.byId.values()) if(metadataBenchmarkIsPdfPath(entry?.pdfPath)) benchmarkRecordsIndexed++;
      return {
        ok:true,
        previousBuild,
        forcedBuild:metadataRecordClone(this.state.documentRecords.lastBuildMetrics || rebuild?.metrics || null),
        lookup:{
          rawIterations,
          rawDurationMs:Number(rawDurationMs.toFixed(3)),
          rawAverageUs:rawIterations?Number(((rawDurationMs*1000)/rawIterations).toFixed(6)):0,
          stateIterations,
          stateDurationMs:Number(stateDurationMs.toFixed(3)),
          stateAverageUs:stateIterations?Number(((stateDurationMs*1000)/stateIterations).toFixed(6)):0,
          checksum
        },
        index:{
          recordCount:this.state.documentRecords.entryByRecordPath.size,
          activePathCount:this.state.documentRecords.byPdfPath.size,
          ambiguousPathCount:this.state.documentRecords.ambiguousPdfPaths.size,
          ambiguousIdCount:this.state.documentRecords.ambiguousIds.size
        },
        benchmarkRecordsIndexed,
        memory:{before:memoryBefore,after:documentRecordBenchmarkMemorySnapshot()}
      };
    });
  }

  getDocumentMetadataRecordState(pdfPath) {
    const path=metadataRecordNormalizeVaultPath(pdfPath);
    if(!path) return {ready:this.state.documentRecords.initialized,ok:false,registered:false,reason:'missing-pdf-path'};
    if(!this.state.documentRecords.initialized) return {ready:false,ok:true,registered:false};
    if(this.state.documentRecords.ambiguousPdfPaths.has(path)) return {ready:true,ok:false,registered:false,reason:'ambiguous-pdf-path',error:'Flere metadata-records peker til samme PDF-sti. Ingen record velges automatisk.'};
    const id=this.state.documentRecords.byPdfPath.get(path);
    if(!id) return {ready:true,ok:true,registered:false,values:{}};
    if(this.state.documentRecords.ambiguousIds.has(id)) return {ready:true,ok:false,registered:false,reason:'ambiguous-record-id',error:'Metadata-record-ID er duplisert. Ingen record velges automatisk.'};
    const entry=this.state.documentRecords.byId.get(id);
    if(!entry) return {ready:true,ok:false,registered:false,reason:'index-inconsistent',error:'Metadata-index er inkonsistent.'};
    return {
      ready:true,
      ok:true,
      registered:true,
      id:entry.id,
      recordPath:entry.recordPath,
      status:entry.status,
      pdfPath:entry.pdfPath,
      values:metadataRecordClone(entry.values || {})
    };
  }

  async saveDocumentMetadataRecordValues(pdfPath,updates) {
    const path=metadataRecordNormalizeVaultPath(pdfPath);
    if(!path || !/\.pdf$/i.test(path)) return {ok:false,error:'PDF-filsti mangler eller er ugyldig'};
    await this.ensureDocumentRecordIndexReady();
    return await this.runDocumentRecordOperation(async()=>{
      const state=this.getDocumentMetadataRecordState(path);
      if(!state.ok) return {ok:false,error:state.error || state.reason || 'metadata-record kan ikke identifiseres sikkert'};
      const schema=this.ports.getMetadataSchemaSnapshot();
      if(!schema) return {ok:false,error:'Metadata-skjema er ikke tilgjengelig'};
      const repository=this.getDocumentRecordRepository();
      const patch=updates && typeof updates==='object' && !Array.isArray(updates) ? updates : {};
      let readBack;
      if(state.registered) {
        const entry=this.state.documentRecords.byId.get(state.id);
        if(!entry?.file) return {ok:false,error:'Metadata-record-filen kunne ikke identifiseres'};
        const values=metadataRecordClone(entry.values || {});
        for(const [property,value] of Object.entries(patch)) values[property]=metadataRecordClone(value);
        readBack=await repository.updateRecord(entry.file,{
          id:entry.id,
          pdfPath:path,
          status:METADATA_RECORD_STATUS_ACTIVE,
          values
        },schema);
      } else {
        const id=metadataUuidV4();
        const values={};
        for(const [property,value] of Object.entries(patch)) values[property]=metadataRecordClone(value);
        readBack=await repository.createRecord({id,pdfPath:path,status:METADATA_RECORD_STATUS_ACTIVE,values},schema);
      }
      const entry=this.replaceDocumentRecordEntry(readBack);
      this.state.documentRecords.lastError=null;
      return {ok:true,id:entry.id,recordPath:entry.recordPath,values:metadataRecordClone(entry.values)};
    }).catch(error=>{
      this.state.documentRecords.lastError=error instanceof Error?error.message:String(error);
      return {ok:false,error:this.state.documentRecords.lastError};
    });
  }

  async refreshDocumentRecordFile(file) {
    const path=metadataRecordNormalizeVaultPath(file?.path);
    if(!metadataRecordIsPath(path) || String(file?.extension || '').toLowerCase()!=='md') return {ok:true,ignored:true};
    const schema=this.ports.getMetadataSchemaSnapshot();
    if(!schema) return {ok:false,error:'metadata schema mangler'};
    const parsed=await this.parseDocumentRecordFile(file,schema,true);
    this.removeDocumentRecordEntryByPath(path);
    if(!parsed.ok) {
      this.state.documentRecords.lastError=`Ugyldig metadata-record ${path}: ${parsed.error || 'ukjent feil'}`;
      return {ok:false,error:this.state.documentRecords.lastError};
    }
    this.addDocumentRecordEntry({id:parsed.record.id,pdfPath:parsed.record.pdfPath,status:parsed.record.status,values:parsed.record.values,recordPath:path,file});
    this.state.documentRecords.lastError=null;
    return {ok:true};
  }

  async updateDocumentRecordForPdfRename(oldPdfPath,newPdfPath) {
    const oldPath=metadataRecordNormalizeVaultPath(oldPdfPath);
    const newPath=metadataRecordNormalizeVaultPath(newPdfPath);
    if(!oldPath || !newPath || !/\.pdf$/i.test(oldPath) || !/\.pdf$/i.test(newPath)) return {ok:true,ignored:true};
    if(this.state.documentRecords.ambiguousPdfPaths.has(oldPath)) return {ok:false,error:'Gammel PDF-sti er tvetydig; rename håndteres fail closed'};
    const id=this.state.documentRecords.byPdfPath.get(oldPath);
    if(!id) return {ok:true,ignored:true};
    const entry=this.state.documentRecords.byId.get(id);
    if(!entry?.file) return {ok:false,error:'Metadata-record for rename mangler'};
    const conflicting=this.state.documentRecords.byPdfPath.get(newPath);
    const newAmbiguous=this.state.documentRecords.ambiguousPdfPaths.has(newPath);
    const schema=this.ports.getMetadataSchemaSnapshot();
    const repository=this.getDocumentRecordRepository();
    const record={id:entry.id,pdfPath:entry.pdfPath,status:entry.status,values:metadataRecordClone(entry.values || {})};
    if((conflicting && conflicting!==id) || newAmbiguous) {
      record.status=METADATA_RECORD_STATUS_MISSING;
    } else {
      record.pdfPath=newPath;
      record.status=METADATA_RECORD_STATUS_ACTIVE;
    }
    const readBack=await repository.updateRecord(entry.file,record,schema);
    this.replaceDocumentRecordEntry(readBack);
    return {ok:true,id,status:record.status,pdfPath:record.pdfPath};
  }

  async markDocumentRecordMissingForPdfDelete(pdfPath) {
    const path=metadataRecordNormalizeVaultPath(pdfPath);
    if(!path || !/\.pdf$/i.test(path)) return {ok:true,ignored:true};
    if(this.state.documentRecords.ambiguousPdfPaths.has(path)) return {ok:false,error:'PDF-sti er tvetydig; delete håndteres fail closed'};
    const id=this.state.documentRecords.byPdfPath.get(path);
    if(!id) return {ok:true,ignored:true};
    const entry=this.state.documentRecords.byId.get(id);
    if(!entry?.file) return {ok:false,error:'Metadata-record for slettet PDF mangler'};
    const schema=this.ports.getMetadataSchemaSnapshot();
    const readBack=await this.getDocumentRecordRepository().updateRecord(entry.file,{
      id:entry.id,
      pdfPath:entry.pdfPath,
      status:METADATA_RECORD_STATUS_MISSING,
      values:metadataRecordClone(entry.values || {})
    },schema);
    this.replaceDocumentRecordEntry(readBack);
    return {ok:true,id,status:METADATA_RECORD_STATUS_MISSING};
  }

  async relinkMissingDocumentRecord(recordId,newPdfPath) {
    const id=String(recordId || '').toLowerCase();
    const path=metadataRecordNormalizeVaultPath(newPdfPath);
    if(!metadataRecordIsUuidV4(id)) return {ok:false,error:'Metadata-record-ID er ugyldig'};
    if(!path || !/\.pdf$/i.test(path)) return {ok:false,error:'Ny PDF-sti mangler eller er ugyldig'};
    await this.ensureDocumentRecordIndexReady();
    return await this.runDocumentRecordOperation(async()=>{
      if(this.state.documentRecords.ambiguousIds.has(id)) return {ok:false,error:'Metadata-record-ID er duplisert; gjenkobling håndteres fail closed'};
      const entry=this.state.documentRecords.byId.get(id);
      if(!entry?.file) return {ok:false,error:'Metadata-recorden kunne ikke identifiseres'};
      if(entry.status!==METADATA_RECORD_STATUS_MISSING) return {ok:false,error:'Bare metadata-records med status missing kan kobles manuelt'};
      const target=this.obsidianVaultReadAdapter?.getAbstractFileByPath?.(path) || null;
      if(!target || String(target.extension || '').toLowerCase()!=='pdf') return {ok:false,error:'Valgt PDF finnes ikke i vaulten'};
      if(this.state.documentRecords.ambiguousPdfPaths.has(path)) return {ok:false,error:'Valgt PDF-sti er tvetydig; gjenkobling håndteres fail closed'};
      const conflicting=this.state.documentRecords.byPdfPath.get(path);
      if(conflicting && conflicting!==id) return {ok:false,error:'Valgt PDF har allerede en annen aktiv metadata-record'};
      const schema=this.ports.getMetadataSchemaSnapshot();
      if(!schema) return {ok:false,error:'Metadata-skjema er ikke tilgjengelig'};
      const readBack=await this.getDocumentRecordRepository().updateRecord(entry.file,{
        id:entry.id,
        pdfPath:path,
        status:METADATA_RECORD_STATUS_ACTIVE,
        values:metadataRecordClone(entry.values || {})
      },schema);
      const rebound=this.replaceDocumentRecordEntry(readBack);
      this.state.documentRecords.lastError=null;
      return {ok:true,id:rebound.id,recordPath:rebound.recordPath,pdfPath:rebound.pdfPath,status:rebound.status,values:metadataRecordClone(rebound.values || {})};
    }).catch(error=>{
      this.state.documentRecords.lastError=error instanceof Error?error.message:String(error);
      return {ok:false,error:this.state.documentRecords.lastError};
    });
  }

  handleDocumentRecordVaultCreate(file) {
    if(this.state.documentRecords.benchmarkEventSuppression && (metadataBenchmarkIsRecordPath(file?.path) || metadataBenchmarkIsPdfPath(file?.path))) return Promise.resolve({ok:true,ignored:true,benchmarkSuppressed:true});
    if(!metadataRecordIsPath(file?.path) || String(file?.extension || '').toLowerCase()!=='md') return;
    return this.ensureDocumentRecordIndexReady().then(()=>this.runDocumentRecordOperation(()=>this.refreshDocumentRecordFile(file))).catch(error=>({ok:false,error:error instanceof Error?error.message:String(error)}));
  }

  handleDocumentRecordVaultModify(file) {
    if(this.state.documentRecords.benchmarkEventSuppression && (metadataBenchmarkIsRecordPath(file?.path) || metadataBenchmarkIsPdfPath(file?.path))) return Promise.resolve({ok:true,ignored:true,benchmarkSuppressed:true});
    if(!metadataRecordIsPath(file?.path) || String(file?.extension || '').toLowerCase()!=='md') return;
    return this.ensureDocumentRecordIndexReady().then(()=>this.runDocumentRecordOperation(()=>this.refreshDocumentRecordFile(file))).catch(error=>({ok:false,error:error instanceof Error?error.message:String(error)}));
  }

  handleDocumentRecordVaultRename(file,oldPath) {
    const before=metadataRecordNormalizeVaultPath(oldPath);
    const after=metadataRecordNormalizeVaultPath(file?.path);
    if(this.state.documentRecords.benchmarkEventSuppression && (metadataBenchmarkIsRecordPath(before) || metadataBenchmarkIsRecordPath(after) || metadataBenchmarkIsPdfPath(before) || metadataBenchmarkIsPdfPath(after))) return Promise.resolve({ok:true,ignored:true,benchmarkSuppressed:true});
    const tasks=[];
    if(/\.pdf$/i.test(before) && /\.pdf$/i.test(after)) tasks.push(()=>this.updateDocumentRecordForPdfRename(before,after));
    if(metadataRecordIsPath(before) || metadataRecordIsPath(after)) tasks.push(async()=>{
      if(metadataRecordIsPath(before)) this.removeDocumentRecordEntryByPath(before);
      if(metadataRecordIsPath(after) && String(file?.extension || '').toLowerCase()==='md') await this.refreshDocumentRecordFile(file);
      return {ok:true};
    });
    if(tasks.length===0) return Promise.resolve({ok:true,ignored:true});
    return this.ensureDocumentRecordIndexReady().then(async()=>{
      let result={ok:true};
      for(const task of tasks) result=await this.runDocumentRecordOperation(task);
      return result;
    }).catch(error=>({ok:false,error:error instanceof Error?error.message:String(error)}));
  }

  handleDocumentRecordVaultDelete(file) {
    const path=metadataRecordNormalizeVaultPath(file?.path);
    if(this.state.documentRecords.benchmarkEventSuppression && (metadataBenchmarkIsRecordPath(path) || metadataBenchmarkIsPdfPath(path))) return Promise.resolve({ok:true,ignored:true,benchmarkSuppressed:true});
    const tasks=[];
    if(/\.pdf$/i.test(path)) tasks.push(()=>this.markDocumentRecordMissingForPdfDelete(path));
    if(metadataRecordIsPath(path) && String(file?.extension || '').toLowerCase()==='md') tasks.push(()=>{
      this.removeDocumentRecordEntryByPath(path);
      return {ok:true};
    });
    if(tasks.length===0) return Promise.resolve({ok:true,ignored:true});
    return this.ensureDocumentRecordIndexReady().then(async()=>{
      let result={ok:true};
      for(const task of tasks) result=await this.runDocumentRecordOperation(task);
      return result;
    }).catch(error=>({ok:false,error:error instanceof Error?error.message:String(error)}));
  }

}

module.exports={DocumentRecordsFeature};
