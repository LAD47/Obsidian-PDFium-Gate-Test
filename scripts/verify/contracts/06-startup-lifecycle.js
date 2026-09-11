'use strict';
const ctx=require('../context');

module.exports=function verifyContract(){
  const {fs,path,os,cp,ROOT,fail,read}=ctx;
  const bridge=read('main-bridge.js');
  const lifecycle=read('src/main-bridge/features/08-lifecycle.js');
  const wrapper=read('src/main-bridge/features/07-wrapper-lifecycle.js');
  const routing=read('src/plugin/features/07-main-bridge-routing.js');
  const view=read('src/main/pdfium-gate-view.js');
  const onload=read('src/plugin/features/01-lifecycle.js');
  const transport=read('src/platform/main-process-transport.js');

  for(const forbidden of [
    'scheduleRescan(',
    'scheduleInternalAutoScrollInjection(',
    'rescanTimers',
    'wrapperRuntime.timers',
    'setTimeout(() => {\n    runtime.wrapperRuntime'
  ]) if(bridge.includes(forbidden)) fail(`timer-driven startup registration returned: ${forbidden}`);

  const lifecycleSource=(wrapper+'\n'+lifecycle).replace(/\s+/g,'');
  for(const required of [
    "ownerWc.on('frame-created',frameCreatedHandler)",
    "ownerWc.on('did-frame-navigate',didFrameNavigateHandler)",
    "void__bridgeRuntime.ports.reconcileExistingPdfRuntime('main-install-reconciliation')",
    'asyncensurePdfRuntime(payload={})',
    'asyncensurePhysicalPdfWrapperRuntime(ownerWc,frame',
    'pdfRuntimeRegisteredWrapperCount'
  ]) if(!lifecycleSource.includes(required.replace(/\s+/g,''))) fail(`event-driven PDF runtime lifecycle missing: ${required}`);

  if(!transport.includes("'ensurePdfRuntime'" )||!transport.includes("ensurePdfRuntime: (...args) => invoke('ensurePdfRuntime'")) fail('MainProcessTransport does not expose ensurePdfRuntime');
  if(!view.includes("this.plugin.ensurePdfRuntimeForLeaf('iframe-load', this.leaf)")) fail('every iframe load does not publish runtime readiness');
  if(!onload.includes("this.ports.reconcileOpenPdfRuntimes('layout-ready')")) fail('layout-ready open-leaf runtime reconciliation missing');
  if(!routing.includes('async reconcileOpenPdfRuntimes(')||!routing.includes('this.pdfLeafAdapter?.listOpenLeaves?.()')) fail('renderer runtime reconciliation does not enumerate all open PDF leaves');
  if(routing.includes("if (activeLeafAtLoad")&&routing.indexOf("ensurePdfRuntimeForLeaf('iframe-load'")>routing.indexOf('if (activeLeafAtLoad')) fail('runtime readiness is still gated by active leaf');
  if(!read('src/main-bridge/composition.js').includes('ensurePdfRuntime: mainBridgeRuntime.ports.ensurePdfRuntime')) fail('Main Bridge public API does not expose ensurePdfRuntime');

  // Behavioral smoke with real assembled main-bridge.js and a fake Electron main runtime.
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pdfium-startup-lifecycle-'));
  const nm=path.join(tmp,'node_modules');
  fs.mkdirSync(path.join(nm,'electron'),{recursive:true});
  fs.copyFileSync(path.join(ROOT,'main-bridge.js'),path.join(tmp,'main-bridge.js'));
  fs.writeFileSync(path.join(nm,'electron','index.js'),`
const {EventEmitter}=require('events');
const app=new EventEmitter();
const frameMap=new Map();
function makeFrame(token,pid,rid){
  const frame={
    url:'http://127.0.0.1:12345/pdf/'+token+'.pdf#page=1',processId:pid,routingId:rid,isMainFrame:false,parent:null,
    isDestroyed(){return false;},
    async executeJavaScript(code){
      if(String(code).includes("querySelector('embed')")) return {ok:true,installed:true,href:this.url};
      if(String(code).includes('__pdfiumGateAutoScroll')) return {ok:true,href:this.url,state:{downSeq:0,lastDown:null}};
      return true;
    }
  };
  frameMap.set(pid+':'+rid,frame);return frame;
}
const frameA=makeFrame('token-a',7,11);
const frameB1=makeFrame('token-b',7,12);
const frameB2=makeFrame('token-b',8,13);
const root={url:'app://obsidian.md/index.html',processId:4,routingId:1,isMainFrame:true,framesInSubtree:[frameA,frameB1,frameB2]};
for(const f of root.framesInSubtree) f.parent=root;
const owner=new EventEmitter();owner.id=1;owner.mainFrame=root;owner.focusedFrame=frameA;
owner.getType=()=> 'window';owner.getURL=()=> 'app://obsidian.md/index.html';owner.getTitle=()=> 'Vault';owner.isDestroyed=()=>false;
const webContents={getAllWebContents:()=>[owner],getFocusedWebContents:()=>owner};
const webFrameMain={fromId:(p,r)=>frameMap.get(p+':'+r)||null};
const globalShortcut={register:()=>true,unregister(){},isRegistered:()=>false};
const clipboard={readText:()=>'',writeText(){}};
const BrowserWindow={getAllWindows:()=>[],fromWebContents:()=>({getContentBounds:()=>({x:0,y:0,width:1000,height:800})})};
const screen={getCursorScreenPoint:()=>({x:0,y:0})};
module.exports={app,webContents,webFrameMain,globalShortcut,clipboard,BrowserWindow,screen,__test:{owner,root,frameMap,makeFrame}};
`);
  const smoke=`
(async()=>{
  const electron=require('electron');
  const bridge=require(${JSON.stringify(path.join(tmp,'main-bridge.js'))});
  const initial=bridge.install();
  if(!initial.installed) throw new Error('bridge install failed');
  if(electron.__test.owner.listenerCount('frame-created')<1||electron.__test.owner.listenerCount('did-frame-navigate')<1) throw new Error('frame lifecycle listeners not installed');
  await new Promise(r=>setImmediate(r));
  const b=await bridge.ensurePdfRuntime({token:'token-b',source:'verify-duplicate'});
  if(!b.ok||b.matchCount!==2||b.registeredCount!==2) throw new Error('duplicate token wrappers were not all instrumented');
  let state=bridge.getState();
  if(state.activePdfIdentity!==null) throw new Error('runtime registration changed active PDF identity');
  if(state.pdfRuntimeRegisteredWrapperCount<3) throw new Error('existing startup wrappers were not reconciled');
  let lateContextCalls=0;const lateContextListener=()=>{lateContextCalls++;};
  electron.__test.owner.on('context-menu',lateContextListener);
  await new Promise(r=>setImmediate(r));
  electron.__test.owner.emit('context-menu',{}, {frameURL:'http://127.0.0.1:12345/pdf/token-a.pdf#page=1',pageURL:'',mediaType:'plugin',selectionText:''});
  await new Promise(r=>setImmediate(r));
  if(lateContextCalls!==0) throw new Error('late context-menu listener was not event-driven filtered');
  electron.__test.owner.emit('context-menu',{}, {frameURL:'app://obsidian.md/index.html',pageURL:'app://obsidian.md/index.html',mediaType:'none',selectionText:''});
  if(lateContextCalls!==1) throw new Error('non-PDF context-menu listener was incorrectly suppressed');
  const frameC=electron.__test.makeFrame('token-c',9,14);frameC.parent=electron.__test.root;electron.__test.root.framesInSubtree.push(frameC);
  electron.__test.owner.emit('did-frame-navigate',{},frameC.url,200,'OK',false,9,14);
  await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
  state=bridge.getState();
  if(state.pdfRuntimeRegisteredWrapperCount<4) throw new Error('did-frame-navigate did not register new wrapper');
  if(state.lastPdfRuntimeFrameLifecycle?.token!=='token-c') throw new Error('frame lifecycle diagnostic did not record token-c');
  bridge.uninstall();
  console.log('startup-lifecycle-smoke-ok');
})().catch(e=>{console.error(e);process.exit(1);});
`;
  try{
    cp.execFileSync(process.execPath,['-e',smoke],{cwd:tmp,env:{...process.env,NODE_PATH:nm},stdio:'pipe',encoding:'utf8',timeout:10000});
  }catch(error){fail(`startup lifecycle behavioral smoke failed: ${error.stderr||error.message}`);}
  finally{fs.rmSync(tmp,{recursive:true,force:true});}
};
