'use strict';
const ctx=require('../context');

module.exports=function verifyContract(){
  const {fs,path,cp,ROOT,fail,read}=ctx;
  const events=read('src/bridge/renderer-events.js');
  const dispatch=read('src/platform/renderer-event-dispatch.js');
  const onload=read('src/plugin/features/01-lifecycle.js');
  const productionBridge=read('src/plugin/features/02-renderer-bridge.js');
  const diagnostics=read('src/plugin/features/03-diagnostics.js');
  const routing=read('src/plugin/features/07-main-bridge-routing.js');
  const pluginState=read('src/plugin/plugin-state.js');
  const annotationTransport=read('src/plugin/features/09-annotator-host.js');
  const annotationIo=read('src/plugin/features/11-annotation-io.js');
  const selectionBridge=read('src/plugin/features/10-selection-bridge.js');
  const annotatorContract=read('src/bridge/annotator-messages.js');
  const bundle=read('scripts/source-bundle.js');
  const mainBridgeParts=['03-context-menu.js','05-selection-operations.js','07-wrapper-lifecycle.js','08-lifecycle.js'].map(name=>read(`src/main-bridge/features/${name}`)).join('\n');

  const productionEvents=[
    'OBSIDIAN_COMMAND','KEYBOARD_SELECTION','NATIVE_COPY','KEYBOARD_COPY',
    'PDF_CONTEXT_MENU','CATEGORY_SHORTCUT','ESCAPE_DISMISS','PDF_MOUSE_ACTIVATION'
  ];
  for(const name of productionEvents){
    if(!events.includes(`${name}:`)) fail(`canonical renderer event missing: ${name}`);
    if(!productionBridge.includes(`RENDERER_BRIDGE_EVENTS.${name}`)) fail(`renderer production listener missing: ${name}`);
  }
  for(const name of ['PDF_CONTEXT_MENU','CATEGORY_SHORTCUT','ESCAPE_DISMISS','PDF_MOUSE_ACTIVATION']){
    if(!mainBridgeParts.includes(`RENDERER_BRIDGE_EVENTS.${name}`)) fail(`Main Bridge production dispatch missing: ${name}`);
  }
  if(!mainBridgeParts.includes('RENDERER_BRIDGE_EVENTS.NATIVE_COPY')||!mainBridgeParts.includes('RENDERER_BRIDGE_EVENTS.KEYBOARD_COPY')||!mainBridgeParts.includes('RENDERER_BRIDGE_EVENTS.KEYBOARD_SELECTION')) fail('existing selection/copy events do not use canonical dispatcher');
  if(!read('src/platform/obsidian-command-dispatch.js').includes('rendererEventDispatchAdapter.dispatchExact')) fail('Obsidian command event bypasses canonical renderer dispatcher');

  // Renderer production must not be driven by diagnostic state polling.
  for(const forbidden of ['refreshMainProcessUxBridge','mainBridge.pollTimer','lastShortcutSeq','lastContextSeq','lastEscapeDismissSeq','lastPdfMouseActivationSeq']){
    if(routing.includes(forbidden)||pluginState.includes(forbidden)||onload.includes(forbidden)) fail(`diagnostic production polling returned: ${forbidden}`);
  }
  if(routing.includes('window.setInterval')||routing.includes('setInterval(() => this.refreshMain')) fail('Main Bridge renderer routing contains production polling');
  if(!routing.includes('refreshMainBridgeDiagnosticSnapshot()')) fail('on-demand Main Bridge diagnostic snapshot missing');
  if(!diagnostics.includes('refreshMainBridgeDiagnosticSnapshot()')) fail('diagnostics do not fetch Main Bridge state on demand');
  if(diagnostics.includes('registerRendererBridgeWindow(')||diagnostics.includes('RENDERER_BRIDGE_EVENTS.')) fail('diagnostics file regained production bridge ownership');
  if(!onload.includes('this.ports.configureRendererBridgeHandlers();')||onload.includes('.handler = event =>')) fail('onload regained renderer production handler implementation');

  // There must be exactly one physical CustomEvent injection implementation.
  const eventInjectionReaders=[];
  const walk=dir=>{
    for(const ent of fs.readdirSync(path.join(ROOT,dir),{withFileTypes:true})){
      const rel=path.join(dir,ent.name);
      if(ent.isDirectory()) walk(rel);
      else if(ent.name.endsWith('.js')&&read(rel.replace(/\\/g,'/')).includes('new CustomEvent(')) eventInjectionReaders.push(rel.replace(/\\/g,'/'));
    }
  };
  walk('src');
  if(eventInjectionReaders.length!==1||eventInjectionReaders[0]!=='src/platform/renderer-event-dispatch.js') fail(`CustomEvent injection boundary drifted: ${eventInjectionReaders.join(', ')||'none'}`);
  if(!dispatch.includes('validateDetail(eventName,detail)')) fail('renderer event dispatcher does not validate payload contract');

  // Behavioral smoke for the pure event contract + exact-owner dispatcher.
  const smoke=`
(async()=>{
  const contract=require(${JSON.stringify(path.join(ROOT,'src/bridge/renderer-events.js'))});
  const mod=require(${JSON.stringify(path.join(ROOT,'src/platform/renderer-event-dispatch.js'))});
  const E=contract.RENDERER_BRIDGE_EVENTS;
  const valid={
    [E.OBSIDIAN_COMMAND]:{commandId:'switcher:open'},
    [E.KEYBOARD_SELECTION]:{token:'abc',direction:'right'},
    [E.NATIVE_COPY]:{token:'abc',selectedText:'x'},
    [E.KEYBOARD_COPY]:{token:'abc',selectedText:'x'},
    [E.PDF_CONTEXT_MENU]:{token:'abc',isPdfContext:true},
    [E.CATEGORY_SHORTCUT]:{id:'slot-1',resultSeq:1},
    [E.ESCAPE_DISMISS]:{dismissSeq:1},
    [E.PDF_MOUSE_ACTIVATION]:{token:'abc',activationSeq:1}
  };
  for(const [name,detail] of Object.entries(valid)) if(!contract.validateRendererBridgeEventDetail(name,detail).ok) throw new Error('valid event rejected '+name);
  if(contract.validateRendererBridgeEventDetail(E.PDF_MOUSE_ACTIVATION,{activationSeq:1}).ok) throw new Error('invalid mouse event accepted');
  let calls=0,code='';
  const owner={mainFrame:{async executeJavaScript(src){calls++;code=String(src);return {ok:true};}}};
  const adapter=mod.createRendererEventDispatchAdapter({validateDetail:contract.validateRendererBridgeEventDetail});
  const bad=await adapter.dispatchExact(owner,E.PDF_MOUSE_ACTIVATION,{activationSeq:1});
  if(bad.ok||calls!==0) throw new Error('invalid event reached executeJavaScript');
  const good=await adapter.dispatchExact(owner,E.PDF_MOUSE_ACTIVATION,{token:'abc',activationSeq:2});
  if(!good.ok||calls!==1||!code.includes(E.PDF_MOUSE_ACTIVATION)||!code.includes('abc')) throw new Error('exact renderer event dispatch failed');
})().catch(e=>{console.error(e);process.exit(1);});`;
  try{cp.execFileSync(process.execPath,['-e',smoke],{cwd:ROOT,stdio:'pipe',encoding:'utf8'});}catch(error){fail(`renderer event contract smoke failed: ${error.stderr||error.message}`);}

  // Annotator messages have one shared contract and one request transport.
  const annotatorTypes=[
    'prewarm-keyboard-model','keyboard-expand-selection','filter-selection-artifacts','find-selection',
    'inspect-point-highlights','inspect-selection-highlights','read-existing-highlight-selection',
    'modify-existing-highlight','write-selection-highlight','write-highlight'
  ];
  for(const type of annotatorTypes) if(!annotatorContract.includes(`'${type}'`)) fail(`annotator message contract missing: ${type}`);
  if(!bundle.includes('ANNOTATOR_MESSAGE_CONTRACT_ORDER')) fail('annotator shared message contract is not part of build composition');
  if(!annotationTransport.includes('getAnnotatorMessageContract(type)')) fail('renderer annotator transport does not consume shared message contract');
  if(!ctx.buildAnnotatorSource(ROOT).includes('getAnnotatorMessageContract(msg.type)?.resultType')) fail('annotator runtime does not consume shared result-type contract');
  for(const rel of ['src/plugin/features/10-selection-bridge.js','src/plugin/features/11-annotation-io.js']){
    const src=read(rel);
    if(src.includes('annotation.requests.set(')||src.includes('contentWindow.postMessage(')) fail(`parallel annotator request transport returned: ${rel}`);
  }
  if((annotationTransport.match(/annotation\.requests\.set\(/g)||[]).length!==1||(annotationTransport.match(/contentWindow\.postMessage\(/g)||[]).length!==1) fail('canonical annotator transport must own exactly one pending-request insertion and one postMessage');
  if(!annotationIo.includes("this.ports.sendAnnotatorRequest('write-selection-highlight'")||!selectionBridge.includes("this.ports.sendAnnotatorRequest('keyboard-expand-selection'")) fail('annotator callers do not route through canonical request transport');

  // Annotator request control-flow has one real source-module owner per request type.
  if(fs.existsSync(path.join(ROOT,'src/annotator/runtime-message-handler.js'))) fail('annotator message-handler monolith returned');
  const oldRuntimeDir=path.join(ROOT,'src/annotator/runtime-message');
  if(fs.existsSync(oldRuntimeDir)){
    const staleParts=fs.readdirSync(oldRuntimeDir).filter(name=>name.endsWith('.part.js'));
    if(staleParts.length) fail(`annotator lexical runtime fragments returned: ${staleParts.join(', ')}`);
  }
  const handlerContracts=require(path.join(ROOT,'src/annotator/handler-contracts.js')).ANNOTATOR_HANDLER_CONTRACTS;
  const handlerTypes=Object.keys(handlerContracts||{});
  if(JSON.stringify(handlerTypes)!==JSON.stringify(annotatorTypes)) fail('annotator handler ownership drifted from request contract order');
  let maxLines=0,maxName=null;
  for(const type of handlerTypes){
    const rel=`src/annotator/handlers/${handlerContracts[type].file}`;
    const count=read(rel).split(/\r?\n/).length;
    if(count>maxLines){maxLines=count;maxName=rel;}
  }

  return {rendererProductionEventCount:productionEvents.length,annotatorRequestTypeCount:annotatorTypes.length,annotatorHandlerCount:handlerTypes.length,maxAnnotatorHandlerLines:maxLines,maxAnnotatorHandler:maxName};
};
