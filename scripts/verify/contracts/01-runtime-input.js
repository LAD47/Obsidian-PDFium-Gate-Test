'use strict';
const ctx=require('../context');
module.exports=function verifyContract(){
  const {fs,path,os,cp,ROOT,fail,read,hash,run,extractJsonStringAssignment,extractNamedFunction,verifyRootOnlyLoad,buildMainBridgeSource,buildPluginSource,MAIN_BRIDGE_PLATFORM_ORDER,MAIN_BRIDGE_FEATURE_ORDER}=ctx;
  const {main,bridge,bridgeSrc,pluginSrc,contextLinksSrc,runtimeAnnotatorSrc,annotator,embeddedBridge}=ctx.loadSources();
// retains the user-confirmed hidden backup filesystem contract.
{
  const smoke = `
const fs=require('fs'), os=require('os'), path=require('path');
const mod=require(${JSON.stringify(path.join(ROOT,'src/platform/node-filesystem.js'))});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pdfium-hidden-backup-'));
try {
  const a=mod.createNodeFilesystemAdapter({fsModule:fs});
  const source=path.join(tmp,'docs','report.pdf');
  const backupDir=path.join(tmp,'docs','.pdfium-backup');
  const backup=path.join(backupDir,'report.pdf');
  a.ensureDir(path.dirname(source));
  fs.writeFileSync(source,Buffer.from('original-pdf'));
  if(a.statKind(backupDir)!=='missing')throw new Error('hidden backup dir should start missing');
  a.ensureDir(backupDir);
  if(a.statKind(backupDir)!=='directory')throw new Error('hidden backup dir not created');
  if(a.statKind(backup)!=='missing')throw new Error('hidden backup should start missing');
  a.copyFile(source,backup);
  if(a.statKind(backup)!=='file')throw new Error('hidden backup file not created');
  if(fs.readFileSync(backup,'utf8')!=='original-pdf')throw new Error('hidden backup bytes mismatch');
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
`;
  try { cp.execFileSync(process.execPath,['-e',smoke],{cwd:ROOT,stdio:'pipe',encoding:'utf8'}); }
  catch(e){ fail(`hidden .pdfium-backup filesystem smoke failed\n${e.stderr||e.message}`); }
}

// retains the MainProcessTransport contract: exact-path load, full API validation, named pass-through.
{
  const transportModule = require(path.join(ROOT,'src/platform/main-process-transport.js'));
  const required = transportModule.REQUIRED_MAIN_BRIDGE_METHODS;
  let loadedPath = null;
  const calls = [];
  const bridge = {};
  for (const name of required) bridge[name] = (...args) => { calls.push({name,args}); return {name,args}; };
  const remoteRequireAdapter = {
    getCapabilities(){ return {remoteAvailable:true,requireFunction:true}; },
    requireInMain(modulePath){ loadedPath=modulePath; return {ok:true,modulePath,module:bridge,reason:'fake-exact-load',error:null}; }
  };
  const transport = transportModule.createMainProcessTransport({remoteRequireAdapter});
  if(transport.getCapabilities().loaded) fail('main-process transport starts loaded unexpectedly');
  const load = transport.loadExact('/exact/main-bridge.js');
  if(!load.ok||loadedPath!=='/exact/main-bridge.js'||!transport.getCapabilities().loaded) fail('main-process transport exact-path load failed');
  const routed = transport.setActivePdfIdentity({token:'abc'});
  if(routed?.name!=='setActivePdfIdentity'||calls.at(-1)?.args?.[0]?.token!=='abc') fail('main-process transport pass-through failed');
  transport.reset();
  if(transport.getCapabilities().loaded) fail('main-process transport reset failed');
  let unloadedFailed=false; try{ transport.getState(); } catch(_){ unloadedFailed=true; }
  if(!unloadedFailed) fail('unloaded main-process transport did not fail explicitly');
  const incompleteAdapter = {
    getCapabilities(){ return {remoteAvailable:true,requireFunction:true}; },
    requireInMain(modulePath){ return {ok:true,modulePath,module:{install(){}},reason:'fake-incomplete',error:null}; }
  };
  const incomplete = transportModule.createMainProcessTransport({remoteRequireAdapter:incompleteAdapter}).loadExact('/exact/incomplete.js');
  if(incomplete.ok||incomplete.reason!=='bridge-api-incomplete') fail('main-process transport incomplete API validation failed');
}

// runtime contract: exactly Obsidian 1.13.7 + Electron 43 + embedded-frame.
{
  const gate = require(path.join(ROOT,'src/platform/compatibility-gate.js'));
  const commonCaps = {
    webContentsGetAll:true,
    webContentsGetFocused:true,
    clipboardReadText:true,
    clipboardWriteText:true,
    beforeInputEventEmbeddedRouting:true
  };
  const verified = gate.evaluateRuntimeCompatibility({
    obsidianVersion:'1.13.7', electronVersion:'43.3.0', hostingMode:'embedded-frame',
    mainBridgeInstalled:true, rendererMainBridgeRequireAvailable:true, mainCapabilities:commonCaps
  });
  if(verified.status!=='verified'||!verified.operational||!verified.supportedRuntime) fail('runtime contract baseline classification failed');
  const oldObsidian = gate.evaluateRuntimeCompatibility({
    obsidianVersion:'1.13.6', electronVersion:'43.3.0', hostingMode:'embedded-frame',
    mainBridgeInstalled:true, rendererMainBridgeRequireAvailable:true, mainCapabilities:commonCaps
  });
  if(oldObsidian.status!=='unsupported-runtime'||oldObsidian.operational) fail('old Obsidian must fail closed');
  const otherElectron = gate.evaluateRuntimeCompatibility({
    obsidianVersion:'1.13.7', electronVersion:'44.0.0', hostingMode:'embedded-frame',
    mainBridgeInstalled:true, rendererMainBridgeRequireAvailable:true, mainCapabilities:commonCaps
  });
  if(otherElectron.status!=='unsupported-runtime'||otherElectron.operational) fail('non-Electron-43 runtime must fail closed');
  const remote = gate.evaluateRuntimeCompatibility({
    obsidianVersion:'1.13.7', electronVersion:'43.3.0', hostingMode:'remote-webcontents',
    mainBridgeInstalled:true, rendererMainBridgeRequireAvailable:true, mainCapabilities:commonCaps
  });
  if(remote.status!=='unsupported-runtime'||remote.operational) fail('remote-webcontents hosting must be rejected');
  const limited = gate.evaluateRuntimeCompatibility({
    obsidianVersion:'1.13.7', electronVersion:'43.3.0', hostingMode:'embedded-frame',
    mainBridgeInstalled:true, rendererMainBridgeRequireAvailable:true,
    mainCapabilities:{...commonCaps,clipboardWriteText:false}
  });
  if(limited.status!=='capability-limited'||limited.operational||!limited.capabilities.missing.includes('clipboardWriteText')) fail('capability-limited classification failed');
}

// architecture gate — Electron 43 embedded-frame is the only PDF hosting model.
{
  const embeddedTarget = read('src/platform/pdf-embedded-target.js');
  const activePdf = read('src/platform/active-pdf.js');
  const rendererCaps = read('src/platform/capabilities.js');
  const focusDiagnostics = read('src/platform/electron-focus-diagnostics.js');
  const remoteRequireTransport = read('src/platform/electron-remote-require.js');
  const compatibility = read('src/platform/compatibility-gate.js');
  const leaf = read('src/platform/pdf-leaf.js');
  if(fs.existsSync(path.join(ROOT,'src/platform/pdf-webcontents.js'))||fs.existsSync(path.join(ROOT,'platform/pdf-webcontents.js'))) fail('dual-hosting pdf-webcontents adapter returned');
  for(const forbidden of ['remote-webcontents','exact-title-token','ambiguous-remote','Legacy Electron 39']){
    if(embeddedTarget.includes(forbidden)||bridgeSrc.includes(forbidden)) fail(`legacy PDF hosting token returned: ${forbidden}`);
  }
  if(embeddedTarget.includes('getTitle(')||embeddedTarget.includes('.getTitle()')) fail('title-based PDF targeting returned');
  if(!embeddedTarget.includes('focused-wrapper-physical-disambiguation')) fail('physical focused-wrapper disambiguation missing');
  if(!embeddedTarget.includes('matchCount:matches.length')||!embeddedTarget.includes("reason:'ambiguous-embedded'")) fail('embedded ambiguity fail-closed gate missing');
  if(activePdf.includes('legacy-focus-before-publication')||activePdf.includes('isPdfWebContents')) fail('active PDF legacy focus branch returned');
  if(rendererCaps.includes('@electron/remote')||rendererCaps.includes('legacyRemote')||rendererCaps.includes('electronRemotePackage')) fail('renderer legacy remote probing returned');
  if(/\.remote\b|remote\.require/.test(rendererCaps)) fail('generic renderer capability probe bypasses canonical transport adapter');
  if(/\.remote\b|remote\.require|remote\.webContents|remote\.app/.test(focusDiagnostics)) fail('diagnostics bypass canonical main-module loader');
  if(!focusDiagnostics.includes("mainModuleLoader.requireInMain('electron')")) fail('diagnostics do not use canonical main-module loader');
  if(!remoteRequireTransport.includes('remote.require(target)')) fail('electron.remote.require Main Bridge transport was accidentally removed');
  if(!compatibility.includes("supportedHostingMode: 'embedded-frame'")) fail('embedded-only runtime policy missing');
  if(compatibility.includes('verifiedHostingModes')) fail('dual-hosting compatibility field returned');
  if(leaf.includes('revealExact')) fail('unused pdf-leaf compatibility alias returned');
  if(bridgeSrc.includes('pdfHostingMode: null')||bridgeSrc.includes('lastPdfTargetResolution')) fail('old hosting compatibility state returned');
  if(!/runtimeContract\s*:\s*\{\s*obsidianVersion\s*:\s*'1\.13\.7'\s*,\s*electronMajor\s*:\s*43\s*,\s*pdfHostingMode\s*:\s*'embedded-frame'\s*\}/.test(bridgeSrc)) fail('Main Bridge runtime contract missing');
  if(bridgeSrc.includes("obsidianReservedShortcutMode")||bridgeSrc.includes("registerCategoryGlobalShortcuts")) fail('dual shortcut hosting branch returned');
  if(/ownerWc\s*===\s*(?:owner|focusedOwner)/.test(embeddedTarget)||/_pdfiumOwnerWc\s*!==\s*ownerWc/.test(bridgeSrc)) fail('WebContents object-reference identity returned to embedded keyboard routing');
}

// cleanup phase 2: one explicit embedded target, one production input/menu
// owner, no dead separate-WebContents/native-menu scaffolding, and fail-closed bridge identity.
{
  const lifecycle=pluginSrc;
  const contextLinks=contextLinksSrc;
  const transport=read('src/platform/main-process-transport.js');
  const targetFn=extractNamedFunction(bridgeSrc,'createEmbeddedPdfTarget');
  for(const forbidden of ['copy() {','sendInputEvent(','getType() {','getURL() {','get focusedFrame()','mainFrame:']) {
    if(targetFn.includes(forbidden)) fail(`embedded target WebContents emulation returned: ${forbidden}`);
  }
  const targetFnCompact=targetFn.replace(/\s+/g,'');
  for(const required of ["kind:'embedded-pdf-target'",'ownerWebContents:ownerWc','wrapperFrame','runtimeFrame']) {
    if(!targetFnCompact.includes(required)) fail(`explicit embedded target contract missing: ${required}`);
  }

  const ownerFn=extractNamedFunction(bridgeSrc,'resolveEmbeddedPdfOwner');
  if(ownerFn.includes('getAllWebContents')||ownerFn.includes('listFrameSubtree')||ownerFn.includes('capturePdfIframeRect')) fail('embedded owner resolver reintroduced global/token fallback scanning');
  if(!ownerFn.includes('pdfTarget.ownerWebContents')) fail('embedded owner resolver does not use explicit target owner');
  if(bridgeSrc.includes('pdfOwnerAdapter')||bridgeSrc.includes('findObsidianOwnerForPdf')) fail('removed PDF-owner fallback abstraction returned');
  if(fs.existsSync(path.join(ROOT,'src/platform/pdf-owner.js'))||fs.existsSync(path.join(ROOT,'platform/pdf-owner.js'))) fail('dead pdf-owner platform file returned');

  const copyFn=extractNamedFunction(bridgeSrc,'captureSelectedTextFromPdf');
  if(copyFn.includes('remote-pdf-webContents')||copyFn.includes('pdfTarget.copy')||copyFn.includes('pdfTarget.sendInputEvent')) fail('separate-PDF-WebContents copy fallback returned');
  if(!copyFn.includes("'owner-webContents.copy'")||!copyFn.includes("'owner-webContents.synthetic-ctrl-c'")) fail('canonical owner copy routes missing');

  if(bridgeSrc.includes('choiceSeq')||bridgeSrc.includes('lastChoice')||bridgeSrc.includes('function setChoice(')) fail('dead native-menu choice channel returned');
  if(contextLinks.includes('focusMainBridgeLastChoiceSeq')||contextLinks.includes('remoteState.choiceSeq')||lifecycle.includes('focusMainBridgeLastChoiceSeq')) fail('renderer dead native-menu choice consumer returned');
  if(bridgeSrc.includes('routeEmbeddedKeyboardInput')||transport.includes('routeEmbeddedKeyboardInput')) fail('duplicate renderer-to-main keyboard route returned');
  if(bridgeSrc.includes('showContextMenu')||transport.includes('showContextMenu')) fail('obsolete Main Bridge native-menu API returned');
  if(lifecycle.includes('transport.routeEmbeddedKeyboardInput')||lifecycle.includes('mainProcessTransport.routeEmbeddedKeyboardInput')) fail('renderer diagnostics drive production keyboard routing');
  if(!lifecycle.includes('createElectronFocusDiagnosticsAdapter({ mainModuleLoader:this.electronRemoteRequireAdapter })')) fail('focus diagnostics are not wired through canonical main-module loader');
  if(lifecycle.includes('productionRoutesMigrated')||lifecycle.includes('diagnosticsOnly:')) fail('historical platform migration counters returned');
  if(lifecycle.includes('hostWebContentsId')||lifecycle.includes('wc === focused')) fail('diagnostics retained separate-WebContents/object-reference focus identity');

  const rendererContextStart=lifecycle.indexOf('const contextMenuHandler = (event, params) => {');
  const rendererContextEnd=lifecycle.indexOf("wc.on('before-input-event', inputHandler);",rendererContextStart);
  if(rendererContextStart<0||rendererContextEnd<0) fail('renderer diagnostic context-menu observer missing');
  const rendererContext=lifecycle.slice(rendererContextStart,rendererContextEnd);
  if(rendererContext.includes('event.preventDefault')) fail('renderer diagnostic context-menu observer suppresses production menu');

  const resolverStart=contextLinks.indexOf('  resolvePdfFileFromBridgePayload(payload) {');
  const resolverEnd=contextLinks.indexOf('\n\n  getCommandTargetPdfFile()',resolverStart);
  if(resolverStart<0||resolverEnd<0) fail('bridge payload PDF resolver missing');
  const resolver=contextLinks.slice(resolverStart,resolverEnd);
  for(const forbidden of ['getActiveReader()','focusedWebContents','frameURL','title']) {
    if(resolver.includes(forbidden)) fail(`bridge payload PDF identity fallback returned: ${forbidden}`);
  }
  if(/lastKnownPdfFilePath\s*\)|getAbstractFileByPath\(this\.lastKnownPdfFilePath|\|\|\s*this\.lastKnownPdfFilePath/.test(resolver)) fail('bridge payload resolver reads last-known path as identity fallback');
  if(!resolver.includes("method:'failed-closed'")&&!resolver.includes("method: 'failed-closed'")) fail('bridge payload identity does not fail closed');
}

// regression gate for the duplicate-wrapper focus failure class:
// stale + focused wrappers may share a token, and focused/getAll WebContents can
// be distinct JavaScript objects with the same physical webContents.id.
{
  const {createEmbeddedPdfTargetAdapter}=require(path.join(ROOT,'src/platform/pdf-embedded-target.js'));
  const token='fixture-token';
  const url=`http://127.0.0.1:12345/pdf/${token}.pdf#page=1`;
  const stale={url,processId:5,routingId:5,parent:null};
  const focusedWrapper={url,processId:7,routingId:8,parent:null};
  const enumeratedOwner={id:1};
  const focusedOwner={id:1,focusedFrame:focusedWrapper};
  const adapter=createEmbeddedPdfTargetAdapter({
    webContents:{getAllWebContents:()=>[enumeratedOwner],getFocusedWebContents:()=>focusedOwner},
    listFrameSubtree:()=>[stale,focusedWrapper],
    pdfTokenFromWrapperFrameUrl:u=>String(u||'').includes(`/pdf/${token}.pdf`)?token:null,
    createEmbeddedPdfTarget:(ownerWc,pdfToken,wrapperFrame)=>({kind:'embedded-pdf-target',ownerWebContents:ownerWc,token:pdfToken,wrapperFrame})
  });
  const resolved=adapter.resolveExact(token);
  if(!resolved.ok||resolved.reason!=='focused-wrapper-physical-disambiguation'||Number(resolved.wrapperFrame?.processId)!==7||Number(resolved.wrapperFrame?.routingId)!==8||Number(resolved.ownerWc?.id)!==1) fail('duplicate-wrapper focused physical identity regression');

  const ownerA={id:9}, ownerB={id:9};
  const frameA={url,processId:11,routingId:12,parent:null};
  const frameB={url,processId:11,routingId:12,parent:null};
  const dedupe=createEmbeddedPdfTargetAdapter({
    webContents:{getAllWebContents:()=>[ownerA,ownerB],getFocusedWebContents:()=>null},
    listFrameSubtree:o=>o===ownerA?[frameA]:[frameB],
    pdfTokenFromWrapperFrameUrl:u=>String(u||'').includes(`/pdf/${token}.pdf`)?token:null,
    createEmbeddedPdfTarget:(ownerWc,pdfToken,wrapperFrame)=>({kind:'embedded-pdf-target',ownerWebContents:ownerWc,token:pdfToken,wrapperFrame})
  }).resolveExact(token);
  if(!dedupe.ok||dedupe.matchCount!==1||dedupe.reason!=='exact-wrapper-frame-token') fail('physical wrapper deduplication regression');
}

// category-shortcut contract: Ctrl/Cmd+Alt+1..5 is a physical
// top-row-key command. KeyboardEvent.code must win over layout-dependent key text
// (for example AltGr-produced symbols on Nordic layouts), and an existing custom
// keyboard selection must keep its exact INTERNAL range/geometry instead of being
// rediscovered through clipboard text.
{
  const slotFn=(0,eval)(`(${extractNamedFunction(bridgeSrc,'categorySlotFromBeforeInput')})`);
  const fixtures=[
    [{key:'1',code:'Digit1'},1],
    [{key:'@',code:'Digit2'},2],
    [{key:'£',code:'Digit3'},3],
    [{key:'$',code:'Digit4'},4],
    [{key:'€',code:'Digit5'},5]
  ];
  for(const [input,expected] of fixtures){
    if(slotFn(input)!==expected) fail(`category physical Digit${expected} mapping regression`);
  }
  if(slotFn({key:'6',code:'Digit6'})!==null) fail('category shortcut accepted Digit6');

  const matcherSrc=extractNamedFunction(bridgeSrc,'matchEmbeddedKeyboardAction');
  const normalizeSrc=extractNamedFunction(bridgeSrc,'normalizeBeforeInputKey');
  const matcherFactory=new Function(`
    const process={platform:'win32'};
    const OBSIDIAN_RESERVED_SHORTCUTS=[];
    const categories=[1,2,3,4,5].map(slot=>({id:'slot-'+slot,slot,accelerator:'CommandOrControl+Alt+'+slot}));
    ${normalizeSrc}
    ${extractNamedFunction(bridgeSrc,'categorySlotFromBeforeInput')}
    ${matcherSrc}
    return {normalizeBeforeInputKey,categorySlotFromBeforeInput,matchEmbeddedKeyboardAction};
  `);
  const matcherFns=matcherFactory();
  const matcherHost={state:{rendererMenuOpen:false},runtime:{keyboard:{selection:null}},ports:{}};
  matcherHost.ports.normalizeBeforeInputKey=input=>matcherFns.normalizeBeforeInputKey.call(matcherHost,input);
  matcherHost.ports.categorySlotFromBeforeInput=input=>matcherFns.categorySlotFromBeforeInput.call(matcherHost,input);
  const altGrLike=matcherFns.matchEmbeddedKeyboardAction.call(matcherHost,{type:'keyDown',key:'@',code:'Digit2',control:true,meta:false,alt:true,shift:false});
  if(altGrLike?.kind!=='category'||Number(altGrLike?.category?.slot)!==2) fail('layout-dependent Ctrl+Alt+2 category detection regression');
  const noMods=matcherFns.matchEmbeddedKeyboardAction.call(matcherHost,{type:'keyDown',key:'2',code:'Digit2',control:false,meta:false,alt:false,shift:false});
  if(noMods) fail('bare Digit2 was incorrectly captured as category shortcut');

  const captureFn=extractNamedFunction(bridgeSrc,'captureShortcut');
  const captureFnCompact=captureFn.replace(/\s+/g,'');
  for(const required of [
    "captureMethod='keyboard-selection-state'",
    "selectionSource='keyboard-selection-state'",
    'keyboardSelectionState:{',
    'captureSelectedTextFromPdf(focusedPdf,ownerWc)'
  ]) if(!captureFnCompact.includes(required)) fail(`canonical category selection capture missing: ${required}`);
  if(captureFn.includes('__PDFIUM_GATE_')||captureFn.includes('setTimeout(poll')) fail('private category clipboard polling loop returned');

  const contextLinks=contextLinksSrc;
  const bridgeResolveStart=contextLinks.indexOf('  resolvePdfFileFromBridgePayload(payload) {');
  const bridgeResolveEnd=contextLinks.indexOf('\n\n  getCommandTargetPdfFile()',bridgeResolveStart);
  if(bridgeResolveStart<0||bridgeResolveEnd<0) fail('bridge PDF resolver method missing');
  const rendererShortcut=contextLinks.slice(bridgeResolveStart,bridgeResolveEnd);
  if(rendererShortcut.includes('focusedWebContents?.title')||rendererShortcut.includes('webContents?.title')||rendererShortcut.includes('title.match')) fail('title-based bridge PDF targeting returned');
  if(!/runSelectionHighlightTest\(file,a\.selectionText,[\s\S]*?a\.navigationState\s*\|\|\s*null,a\.selectionContext\s*\|\|\s*null\)/.test(contextLinks)) fail('category shortcut does not forward exact keyboard selection context + viewport state');
  if(!bridgeSrc.includes('navigationStateCapture: true')||!bridgeSrc.includes('captureNavigationState,')) fail('RuntimeDriver navigation-state capture capability missing');
  for(const required of [
    'capturePdfNavigationState(focusedPdf)',
    "source:'category-shortcut-current-viewport'",
    'action.navigationState={',
    'action.navigationStateError='
  ]) if(!captureFnCompact.includes(required)) fail(`category shortcut viewport preservation missing: ${required}`);
  if(!/a\.navigationState\s*\|\|\s*null,a\.selectionContext\s*\|\|\s*null/.test(contextLinks)) fail('category shortcut does not forward preserved viewport state to writer refresh');
  const runtimeAnnotator=runtimeAnnotatorSrc;
  if(!runtimeAnnotator.includes('view.renderFullPage(view.file, targetPage, navigationState)')) fail('canonical PDF refresh does not consume navigationState');
  if(contextLinks.includes('globalShortcut:slot-')) fail('legacy globalShortcut category source label returned');
}

// mouse-wrapper performance contract for the supported Electron 43 runtime.
// One physical gesture must have one canonical event family, and the autoscroll
// timer must stay idle unless the pointer is actually inside an edge zone.
{
  const autoScrollFn=extractNamedFunction(bridgeSrc,'wrapperInstrumentationInstallScript');
  for(const required of [
    "eventModel:'pointer-only'",
    "timerMode:'edge-only'",
    "document.addEventListener('pointerdown', onDown, true)",
    "document.addEventListener('pointermove', onMove, true)",
    "document.addEventListener('pointerup', stop, true)",
    "if (!intent.direction) return;"
  ]) if(!autoScrollFn.includes(required)) fail(`mouse wrapper performance contract missing: ${required}`);
  for(const forbidden of [
    "document.addEventListener('mousedown'",
    "document.addEventListener('mousemove'",
    "document.addEventListener('mouseup'"
  ]) if(autoScrollFn.includes(forbidden)) fail(`parallel mouse-event fallback returned: ${forbidden}`);

  // Behavioral smoke: normal drag does zero timer work; edge entry starts it.
  const installScript=(0,eval)(`(${autoScrollFn})`)();
  const listeners=new Map();
  let nextTimerId=1;
  const timers=new Map();
  const fakeSetTimeout=fn=>{const id=nextTimerId++;timers.set(id,fn);return id;};
  const fakeClearTimeout=id=>{timers.delete(id);};
  const fakeWindow={
    innerHeight:1000,innerWidth:800,scrollX:0,scrollY:0,
    scrollBy({top}){this.scrollY+=Number(top||0);},
    addEventListener(type,fn){listeners.set(`window:${type}`,fn);}
  };
  const fakeDocument={
    documentElement:{clientHeight:1000},
    querySelector(sel){return sel==='embed'?{tagName:'EMBED'}:null;},
    addEventListener(type,fn){listeners.set(type,fn);}
  };
  const runner=new Function('document','window','setTimeout','clearTimeout','location',`return ${installScript};`);
  const installed=runner(fakeDocument,fakeWindow,fakeSetTimeout,fakeClearTimeout,{href:'http://127.0.0.1:123/pdf/t.pdf'});
  if(!installed?.ok) fail('wrapper instrumentation behavioral smoke did not install');
  const state=fakeWindow.__pdfiumGateAutoScroll?.state;
  listeners.get('pointerdown')?.({button:0,clientX:200,clientY:500,type:'pointerdown'});
  listeners.get('pointermove')?.({buttons:1,clientX:300,clientY:520,type:'pointermove'});
  if(state?.downSeq!==1||state?.moveSeq!==1||state?.tickSeq!==0||timers.size!==0) fail('ordinary mouse drag still schedules duplicate/continuous autoscroll work');
  listeners.get('pointermove')?.({buttons:1,clientX:300,clientY:990,type:'pointermove'});
  if(timers.size!==1) fail('edge entry did not schedule autoscroll');
  const edgeTimer=[...timers.entries()][0]; timers.delete(edgeTimer[0]); edgeTimer[1]();
  if(state?.tickSeq!==1||state?.scrollSeq!==1||fakeWindow.scrollY<=0) fail('edge autoscroll tick did not execute');
  listeners.get('pointermove')?.({buttons:1,clientX:300,clientY:500,type:'pointermove'});
  if(timers.size!==0) fail('leaving edge did not cancel autoscroll timer');
  listeners.get('pointerup')?.({clientX:300,clientY:500,type:'pointerup'});
  if(state?.upSeq!==1||state?.dragging) fail('pointer-only wrapper stop state failed');

  // Readiness-race smoke: Electron frame navigation can complete before
  // Chromium inserts the PDF <embed>. The wrapper runtime must register a
  // MutationObserver and converge when the embed appears, without delays.
  {
    let embedReady=false;
    let observerCallback=null;
    let observerDisconnected=false;
    const delayedListeners=new Map();
    class FakeMutationObserver {
      constructor(cb){observerCallback=cb;}
      observe(){}
      disconnect(){observerDisconnected=true;}
    }
    const delayedWindow={
      innerHeight:1000,innerWidth:800,scrollX:0,scrollY:0,
      scrollBy({top}){this.scrollY+=Number(top||0);},
      addEventListener(type,fn){delayedListeners.set(`window:${type}`,fn);}
    };
    const delayedDocument={
      documentElement:{clientHeight:1000},
      querySelector(sel){return sel==='embed'&&embedReady?{tagName:'EMBED'}:null;},
      addEventListener(type,fn){delayedListeners.set(type,fn);}
    };
    const delayedRunner=new Function('document','window','setTimeout','clearTimeout','location','MutationObserver',`return ${installScript};`);
    const pending=delayedRunner(delayedDocument,delayedWindow,fakeSetTimeout,fakeClearTimeout,{href:'http://127.0.0.1:123/pdf/delayed.pdf'},FakeMutationObserver);
    if(!pending?.ok||!pending?.pendingEmbed||delayedWindow.__pdfiumGateAutoScroll) fail('wrapper runtime did not enter event-driven pending-embed state');
    if(!delayedWindow.__pdfiumGateWrapperBootstrap?.state?.pending||typeof observerCallback!=='function') fail('pending wrapper runtime did not install DOM readiness observer');
    embedReady=true;
    observerCallback([]);
    if(!delayedWindow.__pdfiumGateAutoScroll?.state) fail('wrapper runtime did not converge when delayed embed appeared');
    if(delayedWindow.__pdfiumGateWrapperBootstrap?.state?.pending!==false||delayedWindow.__pdfiumGateWrapperBootstrap?.state?.ready!==true) fail('wrapper bootstrap readiness state did not converge');
    if(!observerDisconnected) fail('wrapper bootstrap observer did not disconnect after embed readiness');
    delayedListeners.get('pointerdown')?.({button:0,clientX:240,clientY:500,type:'pointerdown'});
    if(delayedWindow.__pdfiumGateAutoScroll?.state?.downSeq!==1||!delayedWindow.__pdfiumGateAutoScroll?.state?.lastDown) fail('delayed wrapper readiness did not activate physical mouse takeover signal');
  }
}

};
