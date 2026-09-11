'use strict';
const ctx=require('../context');

module.exports=async function verifySafeConfigWriteContract(){
  const {fs,path,os,ROOT,fail,read}=ctx;
  const safe=require(path.join(ROOT,'src/core/safe-config-file-write.js'));
  const {safeWriteConfigText,safeConfigTimestamp}=safe;

  const files=new Map();
  const folders=new Set();
  const store={
    async exists(p){ return files.has(p)||folders.has(p); },
    async readText(p){ if(!files.has(p)) throw new Error(`missing ${p}`); return files.get(p); },
    async writeText(p,text){ files.set(p,String(text)); return {path:p}; },
    async ensureFolder(p){ folders.add(p); return {path:p}; },
    async copyFile(){ throw new Error('copyFile must not be used by safe config backup'); },
    async rename(from,to){ if(!files.has(from)) throw new Error(`missing ${from}`); const value=files.get(from); files.delete(from); files.set(to,value); return {from,path:to}; },
    async removeFile(p){ files.delete(p); return {path:p}; }
  };
  const validateJson=async text=>JSON.parse(text);
  const target='.pdf-metadata/document-metadata-schema.json';
  const backupDir='.pdf-metadata/backup/document-metadata-schema';

  const created=await safeWriteConfigText({store,targetPath:target,backupDir,backupStem:'document-metadata-schema',backupExtension:'json',text:'{"a":1}\n',validateText:validateJson,timestamp:'2026-09-08_13-00-00-000',operationToken:'create'});
  if(!created.changed||!created.created||created.backupPath!==null||files.get(target)!=='{"a":1}\n') fail('safe config create contract failed');

  const unchanged=await safeWriteConfigText({store,targetPath:target,backupDir,backupStem:'document-metadata-schema',backupExtension:'json',text:'{"a":1}\n',validateText:validateJson,timestamp:'2026-09-08_13-01-00-000',operationToken:'same'});
  if(unchanged.changed||unchanged.backupPath!==null) fail('safe config unchanged write created mutation/backup');

  const changed=await safeWriteConfigText({store,targetPath:target,backupDir,backupStem:'document-metadata-schema',backupExtension:'json',text:'{"a":2}\n',validateText:validateJson,timestamp:'2026-09-08_13-02-03-004',operationToken:'change'});
  const expectedBackup='.pdf-metadata/backup/document-metadata-schema/document-metadata-schema-2026-09-08_13-02-03-004.json';
  if(!changed.changed||changed.created||changed.backupPath!==expectedBackup) fail(`safe config backup path drifted: ${changed.backupPath}`);
  if(files.get(expectedBackup)!=='{"a":1}\n'||files.get(target)!=='{"a":2}\n') fail('safe config backup/current content mismatch');
  if([...files.keys()].some(p=>p.includes('.tmp-')||p.includes('.previous-'))) fail('safe config temp/previous artifact leaked after success');

  let rejected=false;
  try { await safeWriteConfigText({store,targetPath:target,backupDir,backupStem:'document-metadata-schema',backupExtension:'json',text:'not-json',validateText:validateJson,timestamp:'2026-09-08_13-03-00-000',operationToken:'invalid'}); }
  catch(_){ rejected=true; }
  if(!rejected||files.get(target)!=='{"a":2}\n') fail('invalid safe config payload touched canonical file');

  if(safeConfigTimestamp(new Date(2026,8,8,13,4,5,6))!=='2026-09-08_13-04-05-006') fail('safe config local timestamp format drifted');

  // A backup is not considered successful until it exists and round-trips exactly.
  const brokenFiles=new Map([[target,'{"a":10}\n']]);
  const brokenFolders=new Set();
  const brokenStore={
    async exists(p){ return brokenFiles.has(p)||brokenFolders.has(p); },
    async readText(p){ if(!brokenFiles.has(p)) throw new Error(`missing ${p}`); return brokenFiles.get(p); },
    async writeText(p,text){ if(p.startsWith(`${backupDir}/`)) return {path:p}; brokenFiles.set(p,String(text)); return {path:p}; },
    async ensureFolder(p){ brokenFolders.add(p); return {path:p}; },
    async rename(from,to){ if(!brokenFiles.has(from)) throw new Error(`missing ${from}`); const value=brokenFiles.get(from); brokenFiles.delete(from); brokenFiles.set(to,value); return {from,path:to}; },
    async removeFile(p){ brokenFiles.delete(p); return {path:p}; }
  };
  let missingBackupRejected=false;
  try { await safeWriteConfigText({store:brokenStore,targetPath:target,backupDir,backupStem:'document-metadata-schema',backupExtension:'json',text:'{"a":11}\n',validateText:validateJson,timestamp:'2026-09-08_13-04-00-000',operationToken:'missing-backup'}); }
  catch(_){ missingBackupRejected=true; }
  if(!missingBackupRejected||brokenFiles.get(target)!=='{"a":10}\n') fail('missing physical backup did not fail closed before canonical mutation');

  // Exercise the same contract against a real filesystem, not only a Map simulation.
  const realRoot=fs.mkdtempSync(path.join(os.tmpdir(),'pdfium-safe-config-'));
  const resolveReal=p=>path.join(realRoot,...String(p).split('/').filter(Boolean));
  const realStore={
    async exists(p){ return fs.existsSync(resolveReal(p)); },
    async readText(p){ return fs.readFileSync(resolveReal(p),'utf8'); },
    async writeText(p,text){ const q=resolveReal(p); fs.mkdirSync(path.dirname(q),{recursive:true}); fs.writeFileSync(q,String(text),'utf8'); return {path:p}; },
    async ensureFolder(p){ fs.mkdirSync(resolveReal(p),{recursive:true}); return {path:p}; },
    async rename(from,to){ fs.renameSync(resolveReal(from),resolveReal(to)); return {from,path:to}; },
    async removeFile(p){ if(fs.existsSync(resolveReal(p))) fs.unlinkSync(resolveReal(p)); return {path:p}; }
  };
  try {
    await safeWriteConfigText({store:realStore,targetPath:target,backupDir,backupStem:'document-metadata-schema',backupExtension:'json',text:'{"a":20}\n',validateText:validateJson,timestamp:'2026-09-08_13-05-00-000',operationToken:'real-create'});
    const realChanged=await safeWriteConfigText({store:realStore,targetPath:target,backupDir,backupStem:'document-metadata-schema',backupExtension:'json',text:'{"a":21}\n',validateText:validateJson,timestamp:'2026-09-08_13-06-00-000',operationToken:'real-change'});
    if(!realChanged.backupPath) fail('real filesystem safe config write did not report backup path');
    if(fs.readFileSync(resolveReal(realChanged.backupPath),'utf8')!=='{"a":20}\n') fail('real filesystem backup content mismatch');
    if(fs.readFileSync(resolveReal(target),'utf8')!=='{"a":21}\n') fail('real filesystem canonical content mismatch');
  } finally { fs.rmSync(realRoot,{recursive:true,force:true}); }

  const categorySource=read('src/plugin/features/04-category-config.js');
  const schemaRepoSource=read('src/metadata/schema-repository.js');
  if(!categorySource.includes('safeWriteConfigText({')) fail('category config no longer uses canonical safe config writer');
  if(!schemaRepoSource.includes('safeWriteConfigText({')) fail('metadata schema no longer uses canonical safe config writer');
  if(categorySource.includes('localTimestampForBackup()')) fail('duplicate category backup timestamp implementation returned');
  const categoryFoundation=read('src/core/pdf-link-category-foundation.js');
  if(!categoryFoundation.includes("const PDF_METADATA_ROOT = '.pdf-metadata';")) fail('shared hidden PDF metadata root drifted');
  if(!categoryFoundation.includes("const HIGHLIGHT_CATEGORIES_FILE_NAME = 'highlight-categories.yaml';")) fail('highlight category filename drifted');
  if(!categoryFoundation.includes("const HIGHLIGHT_CATEGORIES_BACKUP_SCOPE = 'highlight-categories';")) fail('highlight category backup scope drifted');
  if(!categorySource.includes("backupStem:'highlight-categories'")) fail('highlight category backup stem drifted');
  const categoryModalSource=read('src/main/category-modals.js');
  const storageSources=[categoryFoundation,categorySource,categoryModalSource,read('src/metadata/schema-contract.js')].join('\n');
  if(storageSources.includes('.pdf-markering')) fail('legacy .pdf-markering storage path returned');
  if(storageSources.includes('config.yaml')) fail('generic category config filename returned');
  if(!storageSources.includes('.pdf-metadata')) fail('canonical .pdf-metadata storage root missing');
  if(!storageSources.includes('highlight-categories.yaml')) fail('function-specific highlight category filename missing');

  return {
    contractVersion:safe.SAFE_CONFIG_FILE_WRITE_CONTRACT_VERSION,
    sharedBy:['category-config','document-metadata-schema'],
    storageRoot:'.pdf-metadata',
    highlightCategoriesFileName:'highlight-categories.yaml',
    highlightCategoriesBackupScope:'backup/highlight-categories',
    documentMetadataSchemaBackupScope:'backup/document-metadata-schema',
    categoryFolderInheritancePreserved:true,
    backupOnActualChangeOnly:true,
    backupWriteReadBackVerified:true,
    physicalFilesystemIntegration:true,
    preWriteValidation:true,
    tempReadBackValidation:true,
    restorePath:true,
    timestampFormat:'YYYY-MM-DD_HH-mm-ss-SSS'
  };
};
