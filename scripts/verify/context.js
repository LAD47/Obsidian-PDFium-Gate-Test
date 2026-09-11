'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const crypto = require('crypto');
const sourceBundle = require('../source-bundle');

const ROOT = path.resolve(__dirname, '../..');
const fail = msg => { throw new Error(msg); };
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const run = (args, opts={}) => cp.execFileSync(process.execPath, args, { cwd: ROOT, stdio:'pipe', encoding:'utf8', ...opts });

function checkSyntax(rel){
  try { run(['--check', path.join(ROOT, rel)]); }
  catch (e) { fail(`Syntax check failed: ${rel}\n${e.stderr || e.message}`); }
}

function extractJsonStringAssignment(source, name){
  const prefix = `const ${name} = `;
  const at = source.indexOf(prefix);
  if (at < 0) fail(`${name} assignment not found`);
  const start = at + prefix.length;
  if (source[start] !== '"') fail(`${name} is not JSON-string encoded`);
  let i=start+1, escaped=false;
  for(; i<source.length; i++){
    const ch=source[i];
    if(escaped){ escaped=false; continue; }
    if(ch==='\\'){ escaped=true; continue; }
    if(ch==='"') break;
  }
  if(i>=source.length) fail(`${name} string is unterminated`);
  return JSON.parse(source.slice(start,i+1));
}

function extractNamedFunction(source, name){
  let methodMode = false;
  let start = source.indexOf(`function ${name}(`);
  if(start < 0){
    const methodPattern = new RegExp('(?:^|\\n)\\s*(?:async\\s+)?' + name + '\\s*\\(', 'm');
    const match = methodPattern.exec(source);
    if(match){ start = match.index + (match[0].startsWith('\n') ? 1 : 0); methodMode = true; }
  }
  if(start < 0) fail(`function/method ${name} not found`);
  const brace = source.indexOf('{', start);
  if(brace < 0) fail(`function/method ${name} opening brace not found`);
  let depth=0, quote=null, escaped=false;
  for(let i=brace;i<source.length;i++){
    const ch=source[i];
    if(quote){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===quote) quote=null;
      continue;
    }
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{') depth++;
    else if(ch==='}'){
      depth--;
      if(depth===0) {
        let out = source.slice(start,i+1);
        if(methodMode){
          const methodHead = new RegExp('(^|\\n)(\\s*)(async\\s+)?' + name + '\\s*\\(');
          out = out.replace(methodHead, (_m,nl,ws,asyncKw) => `${nl}${ws}${asyncKw||''}function ${name}(`);
        }
        return out;
      }
    }
  }
  fail(`function/method ${name} is unterminated`);
}

function verifyRootOnlyLoad(){
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfium-gate-root-only-'));
  const pluginDir = path.join(tmp, 'plugin');
  const nm = path.join(tmp, 'node_modules');
  fs.mkdirSync(pluginDir,{recursive:true});
  fs.mkdirSync(path.join(nm,'obsidian'),{recursive:true});
  fs.mkdirSync(path.join(nm,'electron'),{recursive:true});
  fs.copyFileSync(path.join(ROOT,'main.js'), path.join(pluginDir,'main.js'));
  fs.writeFileSync(path.join(nm,'obsidian','index.js'), `
class Base { constructor(){ this.app={}; } }
class FileView extends Base {}
class Modal extends Base {}
class Plugin extends Base {}
class PluginSettingTab extends Base {}
class Setting { setName(){return this} setDesc(){return this} addToggle(){return this} addButton(){return this} addText(){return this} addDropdown(){return this} addColorPicker(){return this} }
class TFile { constructor(path=''){ this.path=path; this.basename=String(path).split('/').pop()?.replace(/\.pdf$/i,'') || ''; } }
class TFolder { constructor(path=''){ this.path=path; this.children=[]; } }
module.exports={FileView,Modal,Notice:function(){},Plugin,PluginSettingTab,Setting,TFile,TFolder,parseYaml:()=>({}),loadPdfJs:async()=>({})};
`);
  fs.writeFileSync(path.join(nm,'electron','index.js'), `module.exports={clipboard:{readText(){return ''},writeText(){}},remote:null};`);
  const smoke = `
const obs=require('obsidian');
let intervalStarts=0, intervalStops=0;
global.window={setInterval(){intervalStarts++; return 77;},clearInterval(){intervalStops++;},setTimeout,clearTimeout};
const PluginClass=require(${JSON.stringify(path.join(pluginDir,'main.js'))});
const p=new PluginClass();
const categoryUuid=i=>Number(i).toString(16).padStart(8,'0')+'-1234-4abc-8def-'+Number(i).toString(16).padStart(12,'0');
const cats=Array.from({length:35},(_,i)=>({id:categoryUuid(i),name:'Category '+i,color:'#AABBCC',enabled:true}));
p.validateEffectiveCategories(cats,'smoke');
let maxBlocked=false; try{p.validateEffectiveCategories([...cats,{id:categoryUuid(35),name:'Category 35',color:'#AABBCC',enabled:true}],'smoke');}catch(_){maxBlocked=true;}
if(!maxBlocked) throw new Error('35-category maximum not enforced');
if(p.configPathForFolder('Cases/2016')!=='Cases/2016/.pdf-metadata/highlight-categories.yaml') throw new Error('category canonical config path drifted');
if(p.configPathForFolder('')!=='.pdf-metadata/highlight-categories.yaml') throw new Error('root category canonical config path drifted');
if(p.configBackupDirForFolder('Cases/2016')!=='Cases/2016/.pdf-metadata/backup/highlight-categories') throw new Error('category backup scope path drifted');
const file=new obs.TFile('docs/report.pdf');
p.settings={backupOriginalPdf:true,diagnosticsEnabled:false};
p.obsidianVaultReadAdapter={getBasePath(){return '/vault';},getAbstractFileByPath(){return null;}};
let hiddenBackupExists=false, hiddenBackupCopyCount=0;
p.nodeFilesystemAdapter={
  statKind(q){ if(q.endsWith('/docs/.pdfium-backup'))return 'directory'; if(q.endsWith('/docs/.pdfium-backup/report.pdf'))return hiddenBackupExists?'file':'missing'; return 'missing'; },
  ensureDir(){return true;},copyFile(){hiddenBackupCopyCount++;hiddenBackupExists=true;return true;}
};
let t=p.resolveSelectionHighlightWriteTarget(file);
if(t.blocked||t.backupPath!=='docs/.pdfium-backup/report.pdf'||t.backupExists) throw new Error('new hidden backup routing failed');
const firstBackup=p.createPdfBackupFromSource(t); if(!firstBackup||firstBackup.preserved||!hiddenBackupExists||hiddenBackupCopyCount!==1) throw new Error('hidden backup first copy failed');
const secondBackup=p.createPdfBackupFromSource(t); if(!secondBackup||!secondBackup.preserved||hiddenBackupCopyCount!==1) throw new Error('hidden backup overwrite protection failed');
p.settings.backupOriginalPdf=false; t=p.resolveSelectionHighlightWriteTarget(file);
if(t.blocked||t.backupEnabled||t.backupPath!==null) throw new Error('backup disabled routing failed');
p.settings.backupOriginalPdf=true;
hiddenBackupExists=true;
t=p.resolveSelectionHighlightWriteTarget(file); if(!t.backupExists||t.backupFile!==null) throw new Error('existing hidden backup routing failed');
const backupFile=new obs.TFile('docs/.pdfium-backup/copy.pdf'); t=p.resolveSelectionHighlightWriteTarget(backupFile); if(!t.blocked) throw new Error('backup-folder write protection failed');
const nativeGeometry=p.exactNativeSelectionGeometryFromContext({
  selectionSource:'native-context-selection',
  nativeResolvedRange:{start:10,end:20},
  nativeResolvedGeometry:{range:{start:10,end:20},mergedRects:[
    {pageIndex:3,origin:{x:10,y:20},size:{width:30,height:8}},
    {pageIndex:4,origin:{x:11,y:21},size:{width:31,height:8}}
  ]}
});
if(!nativeGeometry||!nativeGeometry.complete||nativeGeometry.pages.join(',')!=='3,4'||nativeGeometry.mergedRectCount!==2) throw new Error('native exact cross-page geometry handoff failed');
if(!p.selectionGeometryContainsViewerPoint({viewerPoint:{candidates:[{pageIndex:3,pageX:20,pageY:24}]}},nativeGeometry)) throw new Error('selection-under-cursor hit detection failed');
if(p.selectionGeometryContainsViewerPoint({viewerPoint:{candidates:[{pageIndex:3,pageX:100,pageY:100}]}},nativeGeometry)) throw new Error('selection-under-cursor false positive');
p.state={diagnostics:{focusRetestPollTimer:null}}; p.settings.diagnosticsEnabled=false; if(p.syncFocusRetestDiagnosticsPolling()!==false||intervalStarts!==0) throw new Error('diagnostics polling started while disabled');
p.pollFocusRetest=()=>{}; p.settings.diagnosticsEnabled=true; if(p.syncFocusRetestDiagnosticsPolling()!==true||intervalStarts!==1||p.state.diagnostics.focusRetestPollTimer!==77) throw new Error('diagnostics polling did not start');
p.settings.diagnosticsEnabled=false; p.syncFocusRetestDiagnosticsPolling(); if(p.state.diagnostics.focusRetestPollTimer!==null||intervalStops!==1) throw new Error('diagnostics polling did not stop');
console.log('root-only-smoke-ok');
`;
  try {
    cp.execFileSync(process.execPath, ['-e', smoke], {
      cwd: tmp,
      env:{...process.env, NODE_PATH:nm},
      stdio:'pipe', encoding:'utf8'
    });
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
}

function loadSources(){
  const main=read('main.js');
  const bridge=read('main-bridge.js');
  const bridgeSrc=sourceBundle.buildMainBridgeSource(ROOT);
  const pluginSrc=sourceBundle.buildPluginSource(ROOT);
  const contextLinksSrc=['05-context-menu.js','06-selection-links.js','07-main-bridge-routing.js','08-link-locator.js']
    .map(name=>read(`src/plugin/features/${name}`)).join('\n');
  const runtimeAnnotatorSrc=['03-diagnostics.js','09-annotator-host.js','10-selection-bridge.js','11-annotation-io.js']
    .map(name=>read(`src/plugin/features/${name}`)).join('\n');
  const annotator=sourceBundle.buildAnnotatorSource(ROOT);
  const embeddedBridge=extractJsonStringAssignment(main,'EMBEDDED_MAIN_BRIDGE_SOURCE');
  return {main,bridge,bridgeSrc,pluginSrc,contextLinksSrc,runtimeAnnotatorSrc,annotator,embeddedBridge};
}

module.exports={
  fs,path,os,cp,crypto,ROOT,fail,read,hash,run,checkSyntax,
  extractJsonStringAssignment,extractNamedFunction,verifyRootOnlyLoad,loadSources,
  ...sourceBundle
};
