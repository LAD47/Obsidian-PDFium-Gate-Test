#!/usr/bin/env node
'use strict';
const ctx=require('./verify/context');
const {fs,path,ROOT,fail,read,checkSyntax,PLUGIN_FEATURE_ORDER,MAIN_BRIDGE_FEATURE_ORDER}=ctx;

const manifest=JSON.parse(read('manifest.json'));
const pkg=JSON.parse(read('package.json'));
if(!/^\d+\.\d+\.\d+$/.test(String(manifest.version || ''))) fail(`invalid manifest version ${manifest.version}`);
if(pkg.version!==manifest.version) fail('package/manifest version mismatch');

for(const rel of ['main.js','main-bridge.js','build.js','scripts/source-bundle.js','scripts/verify/context.js']) checkSyntax(rel);
for(const dir of ['src/platform','src/selection','src/runtime','src/bridge','src/core','src/annotator','src/plugin','src/metadata','src/i18n']){
  const abs=path.join(ROOT,dir);
  if(!fs.existsSync(abs)) continue;
  const walkSyntax=current=>{
    for(const ent of fs.readdirSync(current,{withFileTypes:true})){
      const full=path.join(current,ent.name);
      if(ent.isDirectory()) walkSyntax(full);
      else if(ent.name.endsWith('.js')) checkSyntax(path.relative(ROOT,full));
    }
  };
  walkSyntax(abs);
}
// Plugin features are standalone source modules; Main Bridge sections are still assembled into one runtime.
for(const name of PLUGIN_FEATURE_ORDER){ if(!fs.existsSync(path.join(ROOT,'src/plugin/features',name))) fail(`plugin feature missing: ${name}`); }
for(const name of MAIN_BRIDGE_FEATURE_ORDER){ if(!fs.existsSync(path.join(ROOT,'src/main-bridge/features',name))) fail(`Main Bridge feature missing: ${name}`); }

const contractFiles=[
  '00-structure.js',
  '01-runtime-input.js',
  '02-selection-output.js',
  '03-runtime-driver.js',
  '04-identity-locator.js',
  '05-release-build.js',
  '06-startup-lifecycle.js',
  '07-explicit-data-flow.js',
  '08-plugin-module-boundaries.js',
  '09-main-bridge-module-boundaries.js',
  '10-annotator-module-boundaries.js',
  '11-architecture-completion.js',
  '12-metadata-schema.js',
  '13-safe-config-write.js',
  '14-category-editor-ownership.js',
  '15-document-info.js',
  '16-document-records.js',
  '17-document-record-visibility.js',
  '18-document-register-bases.js',
  '19-metadata-benchmark.js',
  '20-i18n.js'
];
let structureResult=null;
let releaseResult=null;
let pluginModuleBoundaryResult=null;
let mainBridgeModuleBoundaryResult=null;
let annotatorModuleBoundaryResult=null;
let architectureCompletionResult=null;
let metadataSchemaResult=null;
let safeConfigWriteResult=null;
let categoryEditorOwnershipResult=null;
let documentInfoResult=null;
let documentRecordsResult=null;
let documentRecordVisibilityResult=null;
let documentRegisterBasesResult=null;
let metadataBenchmarkResult=null;
let i18nResult=null;
async function runVerify(){
for(const file of contractFiles){
  const verify=require(`./verify/contracts/${file}`);
  const result=await verify();
  if(file==='00-structure.js') structureResult=result;
  if(file==='05-release-build.js') releaseResult=result;
  if(file==='07-explicit-data-flow.js') releaseResult={...(releaseResult||{}),dataFlow:result};
  if(file==='08-plugin-module-boundaries.js') pluginModuleBoundaryResult=result;
  if(file==='09-main-bridge-module-boundaries.js') mainBridgeModuleBoundaryResult=result;
  if(file==='10-annotator-module-boundaries.js') annotatorModuleBoundaryResult=result;
  if(file==='11-architecture-completion.js') architectureCompletionResult=result;
  if(file==='12-metadata-schema.js') metadataSchemaResult=result;
  if(file==='13-safe-config-write.js') safeConfigWriteResult=result;
  if(file==='14-category-editor-ownership.js') categoryEditorOwnershipResult=result;
  if(file==='15-document-info.js') documentInfoResult=result;
  if(file==='16-document-records.js') documentRecordsResult=result;
  if(file==='17-document-record-visibility.js') documentRecordVisibilityResult=result;
  if(file==='18-document-register-bases.js') documentRegisterBasesResult=result;
  if(file==='19-metadata-benchmark.js') metadataBenchmarkResult=result;
  if(file==='20-i18n.js') i18nResult=result;
}
console.log(JSON.stringify({ok:true,version:manifest.version,structure:structureResult,...releaseResult,moduleBoundaries:{plugin:pluginModuleBoundaryResult,mainBridge:mainBridgeModuleBoundaryResult,annotator:annotatorModuleBoundaryResult},architectureCompletion:architectureCompletionResult,metadataSchema:metadataSchemaResult,safeConfigWrite:safeConfigWriteResult,categoryEditorOwnership:categoryEditorOwnershipResult,documentInfo:documentInfoResult,documentRecords:documentRecordsResult,documentRecordVisibility:documentRecordVisibilityResult,documentRegisterBases:documentRegisterBasesResult,metadataBenchmark:metadataBenchmarkResult,i18n:i18nResult},null,2));
}
runVerify().catch(error=>{ console.error(error && error.stack ? error.stack : error); process.exit(1); });
