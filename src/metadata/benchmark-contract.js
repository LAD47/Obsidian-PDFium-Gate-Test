'use strict';

const METADATA_BENCHMARK_CONTRACT_VERSION='0.1';
const METADATA_BENCHMARK_FORMAT_VERSION=1;
const METADATA_BENCHMARK_ROOT='PDFium Benchmark';
const METADATA_BENCHMARK_PDF_ROOT=`${METADATA_BENCHMARK_ROOT}/PDF`;
const METADATA_BENCHMARK_MANIFEST_PATH=`${METADATA_BENCHMARK_ROOT}/benchmark-manifest.json`;
const METADATA_BENCHMARK_ALLOWED_COUNTS=Object.freeze([1000,10000,50000,100000]);
const METADATA_BENCHMARK_DATASET_MARKER='obsidian-pdfium-gate-benchmark-v1';
const METADATA_BENCHMARK_UUID_MARKER_HEX='b1997e';

function metadataBenchmarkNormalizePath(value) {
  return String(value || '').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
}

function metadataBenchmarkHashBytes(index) {
  const value=Number(index);
  if(!Number.isInteger(value)||value<1) throw new Error('benchmark index must be positive integer');
  const hashApi=typeof crypto!=='undefined' && crypto && typeof crypto.createHash==='function' ? crypto : require('crypto');
  const digest=hashApi.createHash('sha256').update(`pdfium-benchmark-v1:${value}`).digest();
  const bytes=Buffer.from(digest.subarray(0,16));
  bytes[1]=0xb1; bytes[2]=0x99; bytes[3]=0x7e;
  bytes[6]=(bytes[6]&0x0f)|0x40;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  return bytes;
}

function metadataBenchmarkUuid(index) {
  const hex=metadataBenchmarkHashBytes(index).toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function metadataBenchmarkIsUuid(value) {
  const text=String(value || '').toLowerCase();
  return /^[0-9a-f]{2}b1997e-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text);
}

function metadataBenchmarkPdfPath(index) {
  const value=Number(index);
  if(!Number.isInteger(value)||value<1) throw new Error('benchmark index must be positive integer');
  const group=String(Math.floor((value-1)/1000)).padStart(3,'0');
  return `${METADATA_BENCHMARK_PDF_ROOT}/${group}/benchmark-${String(value).padStart(6,'0')}.pdf`;
}

function metadataBenchmarkIsPdfPath(value) {
  const path=metadataBenchmarkNormalizePath(value);
  return path===METADATA_BENCHMARK_PDF_ROOT || path.startsWith(`${METADATA_BENCHMARK_PDF_ROOT}/`);
}

function metadataBenchmarkIsRecordPath(value) {
  const path=metadataBenchmarkNormalizePath(value);
  const name=path.split('/').pop() || '';
  const id=name.toLowerCase().endsWith('.md') ? name.slice(0,-3) : '';
  return metadataRecordIsPath(path) && metadataBenchmarkIsUuid(id);
}

function metadataBenchmarkManifest(count, pluginVersion, targetCount = count) {
  const value=Number(count);
  const target=Number(targetCount);
  if(!Number.isInteger(value)||value<0) throw new Error('benchmark completed count must be non-negative integer');
  if(!METADATA_BENCHMARK_ALLOWED_COUNTS.includes(target)) throw new Error('unsupported benchmark target count');
  if(value>target) throw new Error('benchmark completed count exceeds target');
  return {
    marker:METADATA_BENCHMARK_DATASET_MARKER,
    format_version:METADATA_BENCHMARK_FORMAT_VERSION,
    plugin_version:String(pluginVersion || ''),
    count:value,
    target_count:target,
    complete:value===target,
    pdf_root:METADATA_BENCHMARK_PDF_ROOT,
    metadata_root:typeof METADATA_RECORDS_ROOT!=='undefined' ? METADATA_RECORDS_ROOT : 'File Metadata',
    created_at:new Date().toISOString()
  };
}

const metadataBenchmarkContract=Object.freeze({
  METADATA_BENCHMARK_CONTRACT_VERSION,
  METADATA_BENCHMARK_FORMAT_VERSION,
  METADATA_BENCHMARK_ROOT,
  METADATA_BENCHMARK_PDF_ROOT,
  METADATA_BENCHMARK_MANIFEST_PATH,
  METADATA_BENCHMARK_ALLOWED_COUNTS,
  METADATA_BENCHMARK_DATASET_MARKER,
  METADATA_BENCHMARK_UUID_MARKER_HEX,
  metadataBenchmarkNormalizePath,
  metadataBenchmarkUuid,
  metadataBenchmarkIsUuid,
  metadataBenchmarkPdfPath,
  metadataBenchmarkIsPdfPath,
  metadataBenchmarkIsRecordPath,
  metadataBenchmarkManifest
});

module.exports=metadataBenchmarkContract;
