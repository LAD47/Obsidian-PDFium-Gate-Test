'use strict';
const ctx=require('../context');

module.exports=function verifyMetadataBenchmarkContract(){
  const {path,ROOT,fail,read}=ctx;
  const recordApi=require(path.join(ROOT,'src/metadata/record-contract.js'));
  global.metadataRecordIsPath=recordApi.metadataRecordIsPath;
  const benchmarkApi=require(path.join(ROOT,'src/metadata/benchmark-contract.js'));
  const schemaApi=require(path.join(ROOT,'src/metadata/schema-contract.js'));
  const featureApi=require(path.join(ROOT,'src/plugin/features/19-metadata-benchmark.js'));

  if(benchmarkApi.METADATA_BENCHMARK_CONTRACT_VERSION!=='0.1') fail('benchmark contract version drifted');
  if(JSON.stringify(benchmarkApi.METADATA_BENCHMARK_ALLOWED_COUNTS)!==JSON.stringify([1000,10000,50000,100000])) fail('benchmark size choices drifted');
  if(benchmarkApi.METADATA_BENCHMARK_ROOT!=='PDFium Benchmark') fail('benchmark root drifted');
  const uuids=[];
  const shards=new Set();
  for(let i=1;i<=256;i++){
    const id=benchmarkApi.metadataBenchmarkUuid(i);
    uuids.push(id);
    if(!benchmarkApi.metadataBenchmarkIsUuid(id)) fail(`benchmark UUID marker/version invalid at ${i}`);
    shards.add(id.slice(0,2));
    const recordPath=recordApi.metadataRecordPathFromId(id);
    if(!benchmarkApi.metadataBenchmarkIsRecordPath(recordPath)) fail(`benchmark record path not recognized at ${i}`);
  }
  if(new Set(uuids).size!==uuids.length) fail('benchmark deterministic UUID collision in verification set');
  if(shards.size<100) fail(`benchmark UUIDs do not exercise sharding broadly enough: ${shards.size}/256`);
  if(benchmarkApi.metadataBenchmarkPdfPath(1)!=='PDFium Benchmark/PDF/000/benchmark-000001.pdf') fail('benchmark PDF path #1 drifted');
  if(benchmarkApi.metadataBenchmarkPdfPath(1001)!=='PDFium Benchmark/PDF/001/benchmark-001001.pdf') fail('benchmark PDF grouping drifted');
  if(!benchmarkApi.metadataBenchmarkIsPdfPath('PDFium Benchmark/PDF/050/benchmark-050001.pdf')) fail('benchmark PDF path predicate failed');
  const manifest=benchmarkApi.metadataBenchmarkManifest(10000,'0.1.199',10000);
  if(manifest.marker!==benchmarkApi.METADATA_BENCHMARK_DATASET_MARKER||manifest.count!==10000||manifest.complete!==true) fail('benchmark manifest identity failed');
  const partialManifest=benchmarkApi.metadataBenchmarkManifest(250,'0.1.199',10000);
  if(partialManifest.complete!==false||partialManifest.target_count!==10000) fail('benchmark manifest does not support resumable partial generation');

  const pdf=featureApi.metadataBenchmarkMinimalPdf(7);
  for(const token of ['%PDF-1.4','xref','trailer','startxref','%%EOF','PDFium Benchmark 000007']) if(!pdf.includes(token)) fail(`minimal benchmark PDF missing ${token}`);
  const values=featureApi.metadataBenchmarkValuesForSchema(schemaApi.metadataDefaultSchema(),5,benchmarkApi.metadataBenchmarkPdfPath(5));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(values.document_date||'')) fail('benchmark schema generator did not make canonical date');
  if(!['decision','letter','report','memo'].includes(values.document_type)) fail('benchmark select generator did not preserve machine value');

  const featureSource=read('src/plugin/features/19-metadata-benchmark.js');
  const recordsSource=read('src/plugin/features/16-document-records.js');
  const lifecycleSource=read('src/plugin/features/01-lifecycle.js');
  const nodeFsSource=read('src/platform/node-filesystem.js');
  const buildSource=read('build.js');
  for(const command of [
    'metadata-benchmark-generate',
    'metadata-benchmark-run',
    'metadata-benchmark-cleanup'
  ]) if(!featureSource.includes(command)) fail(`benchmark command missing: ${command}`);
  for(const required of [
    'metadataRecordSerializeMarkdown',
    'setDocumentRecordBenchmarkEventSuppression(true)',
    'runDocumentRecordIndexBenchmark',
    'benchmark-report-',
    "benchmark.notice.ready",
    'METADATA_BENCHMARK_ALLOWED_COUNTS'
  ]) if(!featureSource.includes(required)) fail(`benchmark feature contract missing: ${required}`);
  for(const required of ['lastBuildMetrics','benchmark-forced','documentRecordBenchmarkMemorySnapshot','benchmarkEventSuppression']) if(!recordsSource.includes(required)) fail(`DocumentRecords benchmark instrumentation missing: ${required}`);
  if(!lifecycleSource.includes('registerMetadataBenchmarkCommands')) fail('benchmark commands not registered through lifecycle composition');
  if(!nodeFsSource.includes('removeTree')||!nodeFsSource.includes('fsModule.rmSync')) fail('benchmark cleanup lacks scoped recursive filesystem removal');
  if(!buildSource.includes("src/main/benchmark-modals.js")) fail('benchmark modals are not bundled');
  if(featureSource.includes('processFrontMatter')) fail('benchmark feature must not introduce a parallel persistent record update path');

  delete global.metadataRecordIsPath;
  return {
    benchmarkContractVersion:benchmarkApi.METADATA_BENCHMARK_CONTRACT_VERSION,
    allowedCounts:[...benchmarkApi.METADATA_BENCHMARK_ALLOWED_COUNTS],
    deterministicMarkedUuids:true,
    shardCoverageInVerification:shards.size,
    minimalValidPdfFixture:true,
    canonicalRecordSerialization:true,
    directFilesystemBulkGeneration:true,
    benchmarkLifecycleEventsSuppressedUntilRestart:true,
    coldStartMetrics:true,
    forcedRebuildMetrics:true,
    lookupMetrics:true,
    memoryMetrics:true,
    jsonReport:true,
    scopedCleanup:true,
    resumableCheckpointManifest:true
  };
};
