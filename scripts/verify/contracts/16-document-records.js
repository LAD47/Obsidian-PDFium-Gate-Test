'use strict';
const ctx=require('../context');

module.exports=async function verifyDocumentRecordsContract(){
  const {path,ROOT,fail,read}=ctx;
  const schemaApi=require(path.join(ROOT,'src/metadata/schema-contract.js'));
  const recordApi=require(path.join(ROOT,'src/metadata/record-contract.js'));
  const benchmarkApi=require(path.join(ROOT,'src/metadata/benchmark-contract.js'));
  const cacheApi=require(path.join(ROOT,'src/metadata/record-index-cache.js'));
  const repositoryApi=require(path.join(ROOT,'src/metadata/record-repository.js'));
  const schema=schemaApi.metadataDefaultSchema();
  const id='123e4567-e89b-42d3-a456-426614174000';

  if(recordApi.METADATA_RECORD_CONTRACT_VERSION!=='0.1') fail('metadata record contract version drifted');
  if(recordApi.METADATA_RECORD_FORMAT_VERSION!==1) fail('metadata record format version drifted');
  if(recordApi.METADATA_RECORDS_ROOT!=='PDF Metadata') fail(`metadata record root drifted: ${recordApi.METADATA_RECORDS_ROOT}`);
  if(recordApi.METADATA_RECORDS_ROOT.startsWith('.')) fail('metadata record root is hidden from Obsidian indexing');
  if(recordApi.metadataRecordPathFromId(id)!==`PDF Metadata/12/${id}.md`) fail('metadata UUID sharding path drifted');
  if(!recordApi.metadataRecordIsPath(`PDF Metadata/12/${id}.md`)) fail('canonical metadata record path not recognized');
  if(recordApi.metadataRecordIsPath(`.pdf-metadata/${id}.md`)) fail('hidden technical metadata root accepted as document record root');

  const record={
    id,
    pdfPath:'Cases/2016/example.pdf',
    status:recordApi.METADATA_RECORD_STATUS_ACTIVE,
    values:{
      document_date:'2016-03-17',
      document_time:'14:35',
      sender:'Oslo kommune',
      document_type:'decision',
      response_received:false
    }
  };
  const markdown=recordApi.metadataRecordSerializeMarkdown(record,schema);
  for(const required of [
    'pdfmeta_type: "pdf_document"',
    'pdfmeta_version: 1',
    `pdfmeta_id: "${id}"`,
    'pdfmeta_file: "[[Cases/2016/example.pdf]]"',
    'pdfmeta_status: "active"',
    'document_date: 2016-03-17',
    'document_time: "14:35"',
    'sender: "Oslo kommune"',
    'document_type: "decision"',
    'response_received: false'
  ]) if(!markdown.includes(required)) fail(`metadata record serialization missing: ${required}`);

  const parsed=recordApi.metadataRecordFromFrontmatter({
    pdfmeta_type:'pdf_document',pdfmeta_version:1,pdfmeta_id:id,pdfmeta_file:'[[Cases/2016/example.pdf]]',pdfmeta_status:'active',
    document_date:'2016-03-17',document_time:'14:35',sender:'Oslo kommune',document_type:'decision',response_received:false
  },schema);
  if(!parsed.ok||parsed.record.id!==id||parsed.record.pdfPath!=='Cases/2016/example.pdf'||parsed.record.values.document_date!=='2016-03-17'||parsed.record.values.response_received!==false) fail('metadata record frontmatter parse contract failed');

  const repositorySource=read('src/metadata/record-repository.js');
  const cacheSource=read('src/metadata/record-index-cache.js');
  const feature=read('src/plugin/features/16-document-records.js');
  const lifecycle=read('src/plugin/features/01-lifecycle.js');
  const vaultRead=read('src/platform/obsidian-vault-read.js');
  if(repositoryApi.METADATA_RECORD_REPOSITORY_CONTRACT_VERSION!=='0.1') fail('metadata record repository contract version drifted');
  if(cacheApi.METADATA_RECORD_INDEX_CACHE_CONTRACT_VERSION!=='0.1') fail('metadata record index cache contract version drifted');
  if(cacheApi.METADATA_RECORD_INDEX_CACHE_PATH!=='.pdf-metadata/document-record-index-cache.json') fail('metadata record index cache path drifted');
  for(const required of ['schema_sha256','mtime','size','record_contract_version','record_format_version']) if(!cacheSource.includes(required)) fail(`metadata record index cache safety contract missing: ${required}`);
  const cacheFiles=new Map();
  const cacheStore={
    async exists(p){return cacheFiles.has(p)},
    async readText(p){return cacheFiles.get(p)||''},
    async writeText(p,data){cacheFiles.set(p,String(data));return {path:p}},
    async ensureFolder(){return {path:'.pdf-metadata'}}
  };
  const cache=cacheApi.createMetadataRecordIndexCache({fileStore:cacheStore,recordApi,cryptoApi:require('crypto')});
  const cacheFile={path:`PDF Metadata/12/${id}.md`,extension:'md',stat:{mtime:1000,size:321}};
  await cache.write(schema,[{file:cacheFile,parsed:{ok:true,record,recordPath:cacheFile.path}}]);
  let cacheState=await cache.load(schema);
  if(!cacheState.usable||cacheState.entries.size!==1) fail('metadata record index cache did not round-trip');
  if(!cache.get(cacheState,cacheFile)?.cacheHit) fail('metadata record index cache did not hit unchanged file');
  if(cache.get(cacheState,{...cacheFile,stat:{mtime:1001,size:321}})) fail('metadata record index cache trusted changed mtime');
  const changedSchema=JSON.parse(JSON.stringify(schema)); changedSchema.fields[0].label='Changed label';
  cacheState=await cache.load(changedSchema);
  if(cacheState.usable||cacheState.reason!=='schema-mismatch') fail('metadata record index cache did not invalidate on schema change');
  for(const required of ['vaultWriteAdapter.createText','frontmatterAdapter.processFrontMatter','verifyRecordPath']) if(!repositorySource.includes(required)) fail(`metadata record repository persistence contract missing: ${required}`);
  if(!vaultRead.includes('listMarkdownFiles()')||!vaultRead.includes('vault.getMarkdownFiles()')) fail('metadata RAM-index does not enumerate Obsidian-indexed Markdown files');
  if(!feature.includes('parseDocumentRecordFile(file,schema,true)')) fail('cold-start record index does not force canonical disk frontmatter reads');
  for(const required of ['byPdfPath','byId','metadataUuidV4()','METADATA_RECORD_STATUS_MISSING','updateDocumentRecordForPdfRename','markDocumentRecordMissingForPdfDelete','relinkMissingDocumentRecord','ambiguousPdfPaths','resolveDocumentRecordPdfPath','obsidianLinkResolutionAdapter?.resolveFirst']) if(!feature.includes(required)) fail(`DocumentRecords feature contract missing: ${required}`);
  if(feature.includes('refreshDocumentInfoViews')) fail('DocumentRecords calls back into DocumentInfo and creates a cross-feature cycle');
  if(!lifecycle.includes('onLayoutReady(() =>')||!lifecycle.includes('handleDocumentRecordVaultRename')||!lifecycle.includes('handleDocumentRecordVaultDelete')) fail('metadata record lifecycle listeners missing from layout-ready orchestration');
  if(lifecycle.indexOf('onLayoutReady(() =>')>lifecycle.indexOf('handleDocumentRecordVaultRename')) fail('metadata record vault listeners are registered before layoutReady');
  if(!lifecycle.includes("refreshDocumentInfoAfterRecordEvent")) fail('metadata record lifecycle does not refresh open DocumentInfo views through lifecycle owner');
  if(!lifecycle.includes("obsidianMetadataCacheAdapter.onResolved")||!lifecycle.includes("markDocumentRecordMetadataResolved()")) fail('metadata-resolved startup gate is not registered early by lifecycle owner');
  if(!lifecycle.includes("markDocumentRecordLayoutReady()")) fail('layout-ready startup gate is not signaled by lifecycle owner');
  if(lifecycle.includes("this.ports.scheduleDocumentRecordIndexWarmup()")) fail('lifecycle owner bypasses DocumentRecords two-signal startup gate');
  if(lifecycle.includes("void this.ports.ensureDocumentRecordIndexReady().catch")) fail('layout-ready still starts DocumentRecords synchronously');
  for(const required of ["markDocumentRecordLayoutReady()","markDocumentRecordMetadataResolved()","warmupLayoutReady","warmupMetadataResolved","idle-after-layout-ready+metadata-resolved","readyPromise","cold-start-idle"]) if(!feature.includes(required)) fail(`DocumentRecords resolved/layout/idle readiness contract missing: ${required}`);
  const metadataCacheAdapterSource=read('src/platform/obsidian-metadata-cache.js');
  if(!metadataCacheAdapterSource.includes("metadataCache.on('resolved'")||!metadataCacheAdapterSource.includes('onResolved')) fail('metadata cache adapter lacks resolved-event boundary');
  const metadataCacheApi=require(path.join(ROOT,'src/platform/obsidian-metadata-cache.js'));
  let resolvedCallback=null;
  const metadataAdapter=metadataCacheApi.createObsidianMetadataCacheAdapter({metadataCache:{on(name,callback){if(name!=='resolved') fail('metadata cache adapter subscribed to wrong event'); resolvedCallback=callback; return {event:name};},getFileCache(){return null;}}});
  if(metadataCacheApi.OBSIDIAN_METADATA_CACHE_CONTRACT_VERSION!=='0.2') fail('metadata cache adapter contract version drifted');
  const resolvedRef=metadataAdapter.onResolved(()=>{});
  if(resolvedRef?.event!=='resolved'||typeof resolvedCallback!=='function') fail('metadata cache resolved-event adapter contract failed');
  const workspaceLifecycle=read('src/platform/obsidian-workspace-lifecycle.js');
  if(!workspaceLifecycle.includes('requestIdleCallback')||!workspaceLifecycle.includes('cancelIdleCallback')) fail('workspace lifecycle adapter lacks browser idle scheduling');
  const workspaceLifecycleApi=require(path.join(ROOT,'src/platform/obsidian-workspace-lifecycle.js'));
  let idleCallback=null, cancelledIdleId=null;
  const fakeWindow={
    requestIdleCallback(callback){ idleCallback=callback; return 77; },
    cancelIdleCallback(id){ cancelledIdleId=id; },
    setTimeout(callback){ callback(); return 88; },
    clearTimeout(){}
  };
  const fakeWorkspace={on(){return {event:'active-leaf-change'}},onLayoutReady(callback){callback();return {event:'layout-ready'}}};
  const lifecycleAdapter=workspaceLifecycleApi.createObsidianWorkspaceLifecycleAdapter({workspace:fakeWorkspace,windowObject:fakeWindow});
  let idleRan=false;
  const idleHandle=lifecycleAdapter.scheduleIdle(()=>{idleRan=true});
  if(idleHandle.kind!=='requestIdleCallback'||idleHandle.id!==77||idleRan) fail('idle scheduler did not defer callback through requestIdleCallback');
  idleCallback();
  if(!idleRan) fail('idle scheduler callback did not run');
  lifecycleAdapter.cancelIdle(idleHandle);
  if(cancelledIdleId!==77) fail('idle scheduler cancellation did not use cancelIdleCallback');

  // Behavioral integration of the owner: lazy create -> indexed lookup -> PDF rename -> delete/missing -> ambiguity fail-closed.
  const globalKeys=[
    'METADATA_RECORD_CONTRACT_VERSION','METADATA_RECORD_FORMAT_VERSION','METADATA_RECORD_TYPE','METADATA_RECORDS_ROOT',
    'METADATA_RECORD_STATUS_ACTIVE','METADATA_RECORD_STATUS_MISSING','METADATA_RECORD_SYSTEM_PROPERTIES',
    'metadataRecordNormalizeVaultPath','metadataRecordIsUuidV4','metadataRecordPathFromId','metadataRecordIsPath',
    'metadataRecordPdfLink','metadataRecordPdfPathFromLink','metadataRecordClone','metadataRecordIsEmptyUserValue',
    'metadataRecordNormalizeFrontmatterValue','metadataRecordFromFrontmatter','metadataRecordSerializeMarkdown'
  ];
  for(const key of globalKeys) global[key]=recordApi[key];
  global.metadataUuidV4=schemaApi.metadataUuidV4;
  global.metadataBenchmarkIsPdfPath=benchmarkApi.metadataBenchmarkIsPdfPath;
  global.metadataBenchmarkIsRecordPath=benchmarkApi.metadataBenchmarkIsRecordPath;
  global.PLUGIN_VERSION=JSON.parse(read('manifest.json')).version;
  const featureModulePath=path.join(ROOT,'src/plugin/features/16-document-records.js');
  delete require.cache[require.resolve(featureModulePath)];
  const {DocumentRecordsFeature}=require(featureModulePath);
  const makeState=()=>({
    initialized:false,readyPromise:null,warmupIdleHandle:null,warmupScheduledAtMs:null,warmupScheduleMode:null,warmupLayoutReady:false,warmupMetadataResolved:false,warmupGateOrder:'',operationQueue:Promise.resolve(),byPdfPath:new Map(),byId:new Map(),entryByRecordPath:new Map(),
    recordPathsById:new Map(),idsByPdfPath:new Map(),ambiguousIds:new Set(),ambiguousPdfPaths:new Set(),lastError:null,
    lastBuildMetrics:null,benchmarkEventSuppression:false
  });
  const files=new Map();
  const fakeRepository={
    async createRecord(value){
      const recordPath=recordApi.metadataRecordPathFromId(value.id);
      const file={path:recordPath,extension:'md'};
      const cloned=recordApi.metadataRecordClone(value);
      files.set(recordPath,{file,record:cloned});
      return {ok:true,file,record:cloned,recordPath};
    },
    async updateRecord(file,value){
      const cloned=recordApi.metadataRecordClone(value);
      files.set(file.path,{file,record:cloned});
      return {ok:true,file,record:cloned,recordPath:file.path};
    },
    async readRecordFile(file){
      const stored=files.get(file.path);
      return stored ? {ok:true,file,record:recordApi.metadataRecordClone(stored.record),recordPath:file.path} : {ok:false,error:'missing',file,recordPath:file.path};
    }
  };
  const owner=new DocumentRecordsFeature();
  owner.state={documentRecords:makeState()};
  owner.ports={getMetadataSchemaSnapshot:()=>schema};
  const pdfFiles=new Map([
    ['Docs/a.pdf',{path:'Docs/a.pdf',extension:'pdf'}],
    ['Archive/a.pdf',{path:'Archive/a.pdf',extension:'pdf'}],
    ['Recovered/a.pdf',{path:'Recovered/a.pdf',extension:'pdf'}],
    ['Taken/occupied.pdf',{path:'Taken/occupied.pdf',extension:'pdf'}],
    ['10_Kilder/PDF/h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf',{path:'10_Kilder/PDF/h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf',extension:'pdf'}]
  ]);
  owner.obsidianVaultReadAdapter={
    listMarkdownFiles:()=>[...files.values()].map(item=>item.file),
    getAbstractFileByPath:path=>pdfFiles.get(String(path||'')) || null
  };
  owner.obsidianLinkResolutionAdapter={resolveFirst:(linkpath)=>{
    const target=String(linkpath||'');
    if(target==='h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf') return {ok:true,file:pdfFiles.get('10_Kilder/PDF/h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf')};
    const direct=pdfFiles.get(target) || null;
    return {ok:true,file:direct};
  }};
  owner.obsidianMetadataCacheAdapter={getFrontmatter:()=>null};
  owner.metadataRecordRepository=fakeRepository;
  owner.metadataRecordIndexCache={
    async load(){return {ok:true,usable:true,reason:'test-empty',entries:new Map()}},
    get(){return null},
    async write(){return {ok:true,entryCount:files.size,path:cacheApi.METADATA_RECORD_INDEX_CACHE_PATH}}
  };

  let scheduledOwnerIdle=null, ownerIdleCancelled=0;
  owner.obsidianWorkspaceLifecycleAdapter={
    scheduleIdle(callback){scheduledOwnerIdle=callback;return {kind:'requestIdleCallback',id:91}},
    cancelIdle(handle){if(handle?.id===91) ownerIdleCancelled++;return true}
  };
  if(owner.markDocumentRecordLayoutReady()!==false||scheduledOwnerIdle!==null) fail('layout-ready alone incorrectly scheduled DocumentRecords warmup');
  if(owner.markDocumentRecordMetadataResolved()!==true||typeof scheduledOwnerIdle!=='function') fail('resolved+layout-ready did not schedule background idle warmup');
  if(owner.state.documentRecords.warmupGateOrder!=='layout-ready>metadata-resolved') fail(`startup gate order not captured: ${owner.state.documentRecords.warmupGateOrder}`);
  if(owner.state.documentRecords.initialized) fail('DocumentRecords warmup ran before idle callback');
  const firstReady=owner.ensureDocumentRecordIndexReady('cold-start-demand');
  const secondReady=owner.ensureDocumentRecordIndexReady('cold-start-demand');
  if(firstReady!==secondReady) fail('DocumentRecords readiness is not single-flight');
  await firstReady;
  if(ownerIdleCancelled!==1) fail('on-demand readiness did not cancel pending idle warmup');
  if(!owner.state.documentRecords.lastBuildMetrics || owner.state.documentRecords.lastBuildMetrics.reason!=='cold-start-demand') fail('document record on-demand cold-start metrics were not captured');
  if(owner.state.documentRecords.lastBuildMetrics.startupScheduleMode!=='on-demand-before-idle') fail('on-demand startup scheduling mode not captured');
  let persisted=await owner.saveDocumentMetadataRecordValues('Docs/a.pdf',{sender:'Oslo kommune',document_date:'2016-03-17'});
  if(!persisted.ok) fail(`document record lazy create failed: ${persisted.error || 'unknown'}`);
  const firstId=persisted.id, firstRecordPath=persisted.recordPath;
  let lookup=owner.getDocumentMetadataRecordState('Docs/a.pdf');
  if(!lookup.registered||lookup.id!==firstId||lookup.values.sender!=='Oslo kommune') fail('document record lazy create was not indexed');
  let lifecycleResult=await owner.handleDocumentRecordVaultRename({path:'Archive/a.pdf',extension:'pdf'},'Docs/a.pdf');
  if(!lifecycleResult?.ok||owner.getDocumentMetadataRecordState('Docs/a.pdf').registered) fail('PDF rename did not remove old path binding');
  lookup=owner.getDocumentMetadataRecordState('Archive/a.pdf');
  if(!lookup.registered||lookup.id!==firstId) fail('PDF rename did not preserve record identity at new path');

  // Simulate full Obsidian restart after rename where metadataCache is stale but Markdown on disk is correct.
  // Cold-start rebuild must trust the persisted record, not cache frontmatter.
  owner.state.documentRecords=makeState();
  owner.obsidianMetadataCacheAdapter={getFrontmatter:()=>({
    pdfmeta_type:'pdf_document',pdfmeta_version:1,pdfmeta_id:firstId,pdfmeta_file:'[[Docs/a.pdf]]',pdfmeta_status:'active',
    sender:'Oslo kommune',document_date:'2016-03-17'
  })};
  await owner.ensureDocumentRecordIndexReady();
  lookup=owner.getDocumentMetadataRecordState('Archive/a.pdf');
  if(!lookup.registered||lookup.id!==firstId) fail('cold-start rebuild after PDF rename trusted stale metadataCache instead of persisted Markdown record');
  if(owner.getDocumentMetadataRecordState('Docs/a.pdf').registered) fail('cold-start rebuild after PDF rename resurrected stale pre-rename PDF path');

  // Obsidian may rewrite an equivalent pdfmeta_file link to shortest-path form on rename.
  // The textual link is not document identity: both forms must index as the same TFile.path.
  const shortestId='423e4567-e89b-42d3-a456-426614174000';
  const shortestRecordPath=recordApi.metadataRecordPathFromId(shortestId);
  const shortestFile={path:shortestRecordPath,extension:'md'};
  files.clear();
  files.set(shortestRecordPath,{file:shortestFile,record:{
    id:shortestId,
    pdfPath:'h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf',
    status:recordApi.METADATA_RECORD_STATUS_ACTIVE,
    values:{sender:'Oslo kommune'}
  }});
  owner.state.documentRecords=makeState();
  await owner.ensureDocumentRecordIndexReady();
  lookup=owner.getDocumentMetadataRecordState('10_Kilder/PDF/h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf');
  if(!lookup.registered||lookup.id!==shortestId||lookup.values.sender!=='Oslo kommune') fail('shortest-path pdfmeta_file was not canonicalized to resolved TFile.path');
  if(owner.getDocumentMetadataRecordState('h-2514-b-veileder-for-beregning-av-selvkost_xxx.pdf').registered) fail('raw shortest wikilink text leaked into byPdfPath identity');

  // Restore the first record for delete lifecycle continuation.
  files.clear();
  const firstFile={path:firstRecordPath,extension:'md'};
  files.set(firstRecordPath,{file:firstFile,record:{id:firstId,pdfPath:'Archive/a.pdf',status:recordApi.METADATA_RECORD_STATUS_ACTIVE,values:{sender:'Oslo kommune',document_date:'2016-03-17'}}});
  owner.state.documentRecords=makeState();
  await owner.ensureDocumentRecordIndexReady();
  lifecycleResult=await owner.handleDocumentRecordVaultDelete({path:'Archive/a.pdf',extension:'pdf'});
  if(!lifecycleResult?.ok||owner.getDocumentMetadataRecordState('Archive/a.pdf').registered) fail('PDF delete retained an active path binding');
  const retained=files.get(firstRecordPath)?.record;
  if(!retained||retained.status!==recordApi.METADATA_RECORD_STATUS_MISSING||retained.pdfPath!=='Archive/a.pdf') fail('PDF delete did not retain the record as missing');

  // Reappearance at the same path must not auto-bind a missing record. Path alone is not identity.
  pdfFiles.set('Archive/a.pdf',{path:'Archive/a.pdf',extension:'pdf'});
  const createResult=owner.handleDocumentRecordVaultCreate({path:'Archive/a.pdf',extension:'pdf'});
  if(createResult!==undefined) fail('PDF create unexpectedly entered document-record create handler');
  if(owner.getDocumentMetadataRecordState('Archive/a.pdf').registered) fail('missing record auto-rebound when a PDF merely reappeared at the same path');

  // Explicit relink must fail closed when the target PDF already has another active record.
  const occupiedId='523e4567-e89b-42d3-a456-426614174000';
  const occupiedRecordPath=recordApi.metadataRecordPathFromId(occupiedId);
  const occupiedFile={path:occupiedRecordPath,extension:'md'};
  files.set(occupiedRecordPath,{file:occupiedFile,record:{id:occupiedId,pdfPath:'Taken/occupied.pdf',status:recordApi.METADATA_RECORD_STATUS_ACTIVE,values:{sender:'Annen record'}}});
  owner.state.documentRecords=makeState();
  await owner.ensureDocumentRecordIndexReady();
  let relink=await owner.relinkMissingDocumentRecord(firstId,'Taken/occupied.pdf');
  if(relink.ok) fail('explicit missing-record relink overwrote an already-owned PDF target');
  if(files.get(firstRecordPath)?.record?.status!==recordApi.METADATA_RECORD_STATUS_MISSING) fail('failed relink mutated missing record status');

  // Explicit safe relink preserves UUID and user metadata while activating the chosen PDF.
  relink=await owner.relinkMissingDocumentRecord(firstId,'Recovered/a.pdf');
  if(!relink.ok||relink.id!==firstId||relink.status!==recordApi.METADATA_RECORD_STATUS_ACTIVE||relink.pdfPath!=='Recovered/a.pdf') fail(`explicit missing-record relink failed: ${relink.error || 'unknown'}`);
  lookup=owner.getDocumentMetadataRecordState('Recovered/a.pdf');
  if(!lookup.registered||lookup.id!==firstId||lookup.values.sender!=='Oslo kommune'||lookup.values.document_date!=='2016-03-17') fail('explicit relink did not preserve record identity and metadata');
  if(owner.getDocumentMetadataRecordState('Archive/a.pdf').registered) fail('explicit relink left stale old-path binding active');

  const benchmarkResult=await owner.runDocumentRecordIndexBenchmark();
  if(!benchmarkResult?.ok || benchmarkResult?.forcedBuild?.reason!=='benchmark-forced' || typeof benchmarkResult?.lookup?.rawAverageUs!=='number') fail('document record benchmark instrumentation failed');

  owner.setDocumentRecordBenchmarkEventSuppression(true);
  const suppressed=await owner.handleDocumentRecordVaultCreate({path:recordApi.metadataRecordPathFromId(benchmarkApi.metadataBenchmarkUuid(1)),extension:'md'});
  if(!suppressed?.benchmarkSuppressed) fail('benchmark bulk lifecycle suppression did not ignore benchmark record event');
  owner.setDocumentRecordBenchmarkEventSuppression(false);

  const duplicateIds=['223e4567-e89b-42d3-a456-426614174000','323e4567-e89b-42d3-a456-426614174000'];
  for(const duplicateId of duplicateIds){
    const recordPath=recordApi.metadataRecordPathFromId(duplicateId);
    const file={path:recordPath,extension:'md'};
    files.set(recordPath,{file,record:{id:duplicateId,pdfPath:'Dup/x.pdf',status:recordApi.METADATA_RECORD_STATUS_ACTIVE,values:{}}});
  }
  owner.state.documentRecords=makeState();
  await owner.ensureDocumentRecordIndexReady();
  lookup=owner.getDocumentMetadataRecordState('Dup/x.pdf');
  if(lookup.ok||lookup.reason!=='ambiguous-pdf-path') fail('duplicate PDF-path records did not fail closed');

  for(const key of globalKeys) delete global[key];
  delete global.metadataUuidV4;
  delete global.metadataBenchmarkIsPdfPath;
  delete global.metadataBenchmarkIsRecordPath;
  delete global.PLUGIN_VERSION;

  return {
    recordContractVersion:recordApi.METADATA_RECORD_CONTRACT_VERSION,
    recordFormatVersion:recordApi.METADATA_RECORD_FORMAT_VERSION,
    recordRoot:recordApi.METADATA_RECORDS_ROOT,
    visibleIndexedRoot:true,
    uuidSharded:true,
    lazyFirstSave:true,
    systemProperties:[...recordApi.METADATA_RECORD_SYSTEM_PROPERTIES],
    markdownYamlSourceOfTruth:true,
    ramIndex:{byPdfPath:true,byId:true},
    pdfRenameMoveTracking:true,
    pdfDeleteRetainsRecord:true,
    failClosedAmbiguity:true,
    frontmatterUpdatesViaFileManager:true,
    lifecycleAfterLayoutReady:true,
    backgroundWarmupAfterBrowserIdle:true,
    metadataResolvedAndLayoutReadyGate:true,
    startupGateOrderCaptured:true,
    singleFlightReadinessPromise:true,
    fixedStartupDelay:false,
    behavioralLazyCreate:true,
    behavioralRenamePreservesId:true,
    coldStartRenameReadsCanonicalDisk:true,
    wikilinkRepresentationResolvesToCanonicalTFilePath:true,
    behavioralDeleteRetainsMissing:true,
    missingPdfDoesNotAutoRebind:true,
    explicitMissingRelinkPreservesId:true,
    explicitRelinkConflictFailClosed:true,
    behavioralAmbiguityFailClosed:true,
    coldIndexMetricsCaptured:true,
    forcedIndexBenchmark:true,
    benchmarkEventSuppressionScoped:true,
    disposableIndexCache:true,
    cacheUsesFileMtimeAndSize:true,
    cacheInvalidatesOnSchemaChange:true,
    cacheKeepsMarkdownSourceOfTruth:true
  };
};
