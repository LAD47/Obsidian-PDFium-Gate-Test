'use strict';

function metadataBenchmarkYield() {
  return new Promise(resolve=>setTimeout(resolve,0));
}

function metadataBenchmarkFsPath(basePath,vaultPath) {
  const parts=metadataBenchmarkNormalizePath(vaultPath).split('/').filter(Boolean);
  return path.join(String(basePath||''),...parts);
}

function metadataBenchmarkMinimalPdf(index) {
  const label=`PDFium Benchmark ${String(index).padStart(6,'0')}`;
  const content=`BT\n/F1 12 Tf\n72 720 Td\n(${label}) Tj\nET\n`;
  const objects=[
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(content,'ascii')} >>\nstream\n${content}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  ];
  let pdf='%PDF-1.4\n';
  const offsets=[0];
  for(const object of objects) {
    offsets.push(Buffer.byteLength(pdf,'ascii'));
    pdf+=object;
  }
  const xrefOffset=Buffer.byteLength(pdf,'ascii');
  pdf+=`xref\n0 ${objects.length+1}\n`;
  pdf+='0000000000 65535 f \n';
  for(let i=1;i<=objects.length;i++) pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

function metadataBenchmarkCanonicalDate(index,offset=0) {
  const value=Number(index)+Number(offset||0);
  const year=2000+(value%27);
  const month=1+(value%12);
  const day=1+(value%28);
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function metadataBenchmarkValuesForSchema(schema,index,pdfPath) {
  const values={};
  for(const field of Array.isArray(schema?.fields)?schema.fields:[]) {
    if(!field?.active || !field.property) continue;
    switch(String(field.type||'')) {
      case 'text': values[field.property]=`Benchmark ${field.label||field.property} ${(index%250)+1}`; break;
      case 'date': values[field.property]=metadataBenchmarkCanonicalDate(index); break;
      case 'time': values[field.property]=`${String(index%24).padStart(2,'0')}:${String(index%60).padStart(2,'0')}`; break;
      case 'integer': values[field.property]=index%10000; break;
      case 'decimal': values[field.property]=Number(((index%10000)/10).toFixed(1)); break;
      case 'boolean': values[field.property]=(index%2)===0; break;
      case 'select': {
        const options=Array.isArray(field.config?.options)?field.config.options.filter(option=>option?.active!==false&&option?.value):[];
        if(options.length) values[field.property]=String(options[index%options.length].value);
        break;
      }
      case 'multiselect': {
        const options=Array.isArray(field.config?.options)?field.config.options.filter(option=>option?.active!==false&&option?.value):[];
        if(options.length) values[field.property]=options.slice(0,Math.min(2,options.length)).map(option=>String(option.value));
        break;
      }
      case 'link':
        values[field.property]=field.config?.kind==='url' ? `https://example.invalid/benchmark/${index}` : `[[${pdfPath}]]`;
        break;
    }
  }
  return values;
}

class MetadataBenchmarkFeature {
  registerMetadataBenchmarkCommands() {
    this.obsidianPluginRegistrationAdapter.addCommand({
      id:'metadata-benchmark-generate',
      name:this.i18n.t('commands.benchmarkGenerate'),
      callback:()=>{ void this.openMetadataBenchmarkGenerator(); }
    });
    this.obsidianPluginRegistrationAdapter.addCommand({
      id:'metadata-benchmark-run',
      name:this.i18n.t('commands.benchmarkRun'),
      callback:()=>{ void this.runMetadataBenchmark(); }
    });
    this.obsidianPluginRegistrationAdapter.addCommand({
      id:'metadata-benchmark-cleanup',
      name:this.i18n.t('commands.benchmarkCleanup'),
      callback:()=>{ void this.openMetadataBenchmarkCleanup(); }
    });
  }

  getMetadataBenchmarkManifest() {
    const basePath=this.obsidianVaultReadAdapter?.getBasePath?.();
    if(!basePath) throw new Error('Vault basePath er ikke tilgjengelig');
    const manifestFsPath=metadataBenchmarkFsPath(basePath,METADATA_BENCHMARK_MANIFEST_PATH);
    if(!this.nodeFilesystemAdapter.exists(manifestFsPath)) return null;
    let manifest;
    try { manifest=JSON.parse(this.nodeFilesystemAdapter.readText(manifestFsPath,'utf8')); }
    catch(error) { throw new Error(`Benchmark-manifest kan ikke leses: ${error instanceof Error?error.message:String(error)}`); }
    if(manifest?.marker!==METADATA_BENCHMARK_DATASET_MARKER || Number(manifest?.format_version)!==METADATA_BENCHMARK_FORMAT_VERSION) {
      throw new Error(this.i18n.t('benchmark.error.invalidExistingRoot',{root:METADATA_BENCHMARK_ROOT}));
    }
    return manifest;
  }

  openMetadataBenchmarkGenerator() {
    let current=0;
    try { current=Number(this.getMetadataBenchmarkManifest()?.count||0); }
    catch(error) { new Notice(error instanceof Error?error.message:String(error),12000); return; }
    new MetadataBenchmarkSizeModal(this.app,this,count=>this.generateMetadataBenchmarkDataset(count),current).open();
  }

  async generateMetadataBenchmarkDataset(targetCount) {
    const target=Number(targetCount);
    if(!METADATA_BENCHMARK_ALLOWED_COUNTS.includes(target)) {
      new Notice(this.i18n.t('benchmark.notice.invalidSize'),8000);
      return {ok:false,error:'unsupported-count'};
    }
    const progress=new MetadataBenchmarkProgressModal(this.app,this,this.i18n.t('benchmark.progress.generate'));
    progress.open();
    try {
      const basePath=this.obsidianVaultReadAdapter.getBasePath();
      const rootFsPath=metadataBenchmarkFsPath(basePath,METADATA_BENCHMARK_ROOT);
      const manifestFsPath=metadataBenchmarkFsPath(basePath,METADATA_BENCHMARK_MANIFEST_PATH);
      const existingManifest=this.getMetadataBenchmarkManifest();
      if(!existingManifest && this.nodeFilesystemAdapter.exists(rootFsPath)) {
        throw new Error(this.i18n.t('benchmark.error.rootWithoutManifest',{root:METADATA_BENCHMARK_ROOT}));
      }
      const current=Number(existingManifest?.count||0);
      if(target<current) throw new Error(this.i18n.t('benchmark.error.shrink',{count:String(current)}));
      const schema=this.ports.getMetadataSchemaSnapshot();
      if(!schema) throw new Error('Metadata-skjema er ikke tilgjengelig');
      this.ports.setDocumentRecordBenchmarkEventSuppression(true);
      this.nodeFilesystemAdapter.ensureDir(rootFsPath);
      this.nodeFilesystemAdapter.ensureDir(metadataBenchmarkFsPath(basePath,METADATA_BENCHMARK_PDF_ROOT));
      const progressManifest=metadataBenchmarkManifest(current,PLUGIN_VERSION,target);
      progressManifest.created_at=existingManifest?.created_at || progressManifest.created_at;
      progressManifest.updated_at=new Date().toISOString();
      this.nodeFilesystemAdapter.writeText(manifestFsPath,JSON.stringify(progressManifest,null,2)+'\n','utf8');
      const batchSize=250;
      for(let index=current+1;index<=target;index++) {
        const pdfPath=metadataBenchmarkPdfPath(index);
        const pdfFsPath=metadataBenchmarkFsPath(basePath,pdfPath);
        const pdfDir=path.dirname(pdfFsPath);
        if(!this.nodeFilesystemAdapter.exists(pdfDir)) this.nodeFilesystemAdapter.ensureDir(pdfDir);
        if(!this.nodeFilesystemAdapter.exists(pdfFsPath)) this.nodeFilesystemAdapter.writeText(pdfFsPath,metadataBenchmarkMinimalPdf(index),'ascii');

        const id=metadataBenchmarkUuid(index);
        const recordPath=metadataRecordPathFromId(id);
        const recordFsPath=metadataBenchmarkFsPath(basePath,recordPath);
        const recordDir=path.dirname(recordFsPath);
        if(!this.nodeFilesystemAdapter.exists(recordDir)) this.nodeFilesystemAdapter.ensureDir(recordDir);
        if(this.nodeFilesystemAdapter.exists(recordFsPath)) {
          const existing=this.nodeFilesystemAdapter.readText(recordFsPath,'utf8');
          if(!existing.includes(`filemeta_id: "${id}"`) || !existing.includes(`filemeta_file: "[[${pdfPath}]]"`)) {
            throw new Error(this.i18n.t('benchmark.error.uuidCollision',{path:recordPath}));
          }
        } else {
          const markdown=metadataRecordSerializeMarkdown({
            id,
            pdfPath,
            status:METADATA_RECORD_STATUS_ACTIVE,
            values:metadataBenchmarkValuesForSchema(schema,index,pdfPath)
          },schema);
          this.nodeFilesystemAdapter.writeText(recordFsPath,markdown,'utf8');
        }

        if(index%batchSize===0 || index===target) {
          const checkpoint=metadataBenchmarkManifest(index,PLUGIN_VERSION,target);
          checkpoint.created_at=existingManifest?.created_at || progressManifest.created_at;
          checkpoint.updated_at=new Date().toISOString();
          this.nodeFilesystemAdapter.writeText(manifestFsPath,JSON.stringify(checkpoint,null,2)+'\n','utf8');
          progress.setProgress(index,target,this.i18n.t('benchmark.progress.writing'));
          await metadataBenchmarkYield();
        }
      }
      const manifest=metadataBenchmarkManifest(target,PLUGIN_VERSION,target);
      manifest.created_at=existingManifest?.created_at || manifest.created_at;
      manifest.updated_at=new Date().toISOString();
      this.nodeFilesystemAdapter.writeText(manifestFsPath,JSON.stringify(manifest,null,2)+'\n','utf8');
      progress.setMessage(this.i18n.t('benchmark.progress.generated'),this.i18n.t('benchmark.progress.generatedDetail',{count:String(target)}));
      new Notice(this.i18n.t('benchmark.notice.ready',{count:String(target)}),12000);
      return {ok:true,count:target};
    } catch(error) {
      const message=error instanceof Error?error.message:String(error);
      progress.setMessage(this.i18n.t('benchmark.progress.generateStopped'),message);
      new Notice(this.i18n.t('benchmark.notice.error',{error:message}),15000);
      return {ok:false,error:message};
    }
  }

  openMetadataBenchmarkCleanup() {
    let manifest;
    try { manifest=this.getMetadataBenchmarkManifest(); }
    catch(error) { new Notice(error instanceof Error?error.message:String(error),12000); return; }
    if(!manifest) { new Notice(this.i18n.t('benchmark.notice.none'),7000); return; }
    new MetadataBenchmarkCleanupModal(this.app,this,()=>this.cleanupMetadataBenchmarkData(),Number(manifest.count||0)).open();
  }

  async cleanupMetadataBenchmarkData() {
    const progress=new MetadataBenchmarkProgressModal(this.app,this,this.i18n.t('benchmark.progress.cleanup'));
    progress.open();
    try {
      const manifest=this.getMetadataBenchmarkManifest();
      if(!manifest) throw new Error(this.i18n.t('benchmark.error.noManifest'));
      const count=Math.max(Number(manifest.count||0),Number(manifest.target_count||0));
      const basePath=this.obsidianVaultReadAdapter.getBasePath();
      this.ports.setDocumentRecordBenchmarkEventSuppression(true);
      const batchSize=500;
      for(let index=1;index<=count;index++) {
        const id=metadataBenchmarkUuid(index);
        const recordFsPath=metadataBenchmarkFsPath(basePath,metadataRecordPathFromId(id));
        if(this.nodeFilesystemAdapter.exists(recordFsPath)) this.nodeFilesystemAdapter.removeFile(recordFsPath);
        if(index%batchSize===0 || index===count) {
          progress.setProgress(index,count,this.i18n.t('benchmark.progress.deleting'));
          await metadataBenchmarkYield();
        }
      }
      const rootFsPath=metadataBenchmarkFsPath(basePath,METADATA_BENCHMARK_ROOT);
      if(this.nodeFilesystemAdapter.exists(rootFsPath)) this.nodeFilesystemAdapter.removeTree(rootFsPath);
      progress.setMessage(this.i18n.t('benchmark.progress.deleted'),this.i18n.t('benchmark.progress.deletedDetail'));
      new Notice(this.i18n.t('benchmark.notice.deleted'),10000);
      return {ok:true,count};
    } catch(error) {
      const message=error instanceof Error?error.message:String(error);
      progress.setMessage(this.i18n.t('benchmark.progress.cleanupStopped'),message);
      new Notice(this.i18n.t('benchmark.notice.cleanupFailed',{error:message}),15000);
      return {ok:false,error:message};
    }
  }

  async runMetadataBenchmark() {
    let manifest;
    try { manifest=this.getMetadataBenchmarkManifest(); }
    catch(error) { new Notice(error instanceof Error?error.message:String(error),12000); return {ok:false}; }
    if(!manifest) {
      new Notice(this.i18n.t('benchmark.notice.runFirst'),10000);
      return {ok:false,error:'no-dataset'};
    }
    if(manifest.complete!==true || !METADATA_BENCHMARK_ALLOWED_COUNTS.includes(Number(manifest.count||0))) {
      new Notice(this.i18n.t('benchmark.notice.incomplete',{count:String(Number(manifest.count||0)),target:String(Number(manifest.target_count||0))}),12000);
      return {ok:false,error:'dataset-incomplete'};
    }
    const progress=new MetadataBenchmarkProgressModal(this.app,this,this.i18n.t('benchmark.progress.run'));
    progress.open();
    try {
      progress.setMessage(this.i18n.t('benchmark.progress.preparing'),this.i18n.t('benchmark.progress.noFilesChanged'));
      await metadataBenchmarkYield();
      await this.ports.ensureDocumentRecordIndexReady('cold-start-demand');
      const core=await this.ports.runDocumentRecordIndexBenchmark();
      const files=this.obsidianVaultReadAdapter.listFiles();
      const pdfFilesSeen=files.filter(file=>metadataBenchmarkIsPdfPath(file?.path)&&String(file?.extension||'').toLowerCase()==='pdf').length;
      const dataset={
        count:Number(manifest.count||0),
        pdfFilesSeen,
        benchmarkRecordsIndexed:Number(core?.benchmarkRecordsIndexed||0)
      };
      const report={
        report_version:1,
        plugin_version:PLUGIN_VERSION,
        created_at:new Date().toISOString(),
        dataset,
        previousBuild:core?.previousBuild||null,
        forcedBuild:core?.forcedBuild||null,
        lookup:core?.lookup||null,
        index:core?.index||null,
        memory:core?.memory||null,
        notes:[
          'File Metadata remains ordinary indexed Markdown storage.',
          'Forced rebuild mutates only RAM index state; persistent records are not rewritten.',
          'Bases render/search/sort responsiveness must still be judged manually in Obsidian.',
          '0.1.203 gates background cache/index warmup on both metadata-cache resolved and layout-ready, then browser idle; on-demand callers share one build promise.'
        ]
      };
      const basePath=this.obsidianVaultReadAdapter.getBasePath();
      const stamp=report.created_at.replace(/[:.]/g,'-');
      const reportVaultPath=`${METADATA_BENCHMARK_ROOT}/benchmark-report-${stamp}.json`;
      const reportFsPath=metadataBenchmarkFsPath(basePath,reportVaultPath);
      this.nodeFilesystemAdapter.writeText(reportFsPath,JSON.stringify(report,null,2)+'\n','utf8');
      progress.close();
      new MetadataBenchmarkReportModal(this.app,this,report,reportVaultPath).open();
      if(dataset.pdfFilesSeen!==dataset.count || dataset.benchmarkRecordsIndexed!==dataset.count) {
        new Notice(this.i18n.t('benchmark.notice.notIndexed',{pdfs:dataset.pdfFilesSeen,count:dataset.count,records:dataset.benchmarkRecordsIndexed}),15000);
      }
      return {ok:true,report,reportVaultPath};
    } catch(error) {
      const message=error instanceof Error?error.message:String(error);
      progress.setMessage(this.i18n.t('benchmark.progress.failed'),message);
      new Notice(this.i18n.t('benchmark.notice.error',{error:message}),15000);
      return {ok:false,error:message};
    }
  }
}

module.exports={MetadataBenchmarkFeature,metadataBenchmarkMinimalPdf,metadataBenchmarkValuesForSchema,metadataBenchmarkFsPath};
