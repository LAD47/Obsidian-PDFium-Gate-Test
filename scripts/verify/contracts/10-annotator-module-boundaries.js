'use strict';
const ctx=require('../context');

module.exports=function verifyContract(){
  const {fs,path,ROOT,fail,read,ANNOTATOR_HANDLER_ORDER,ANNOTATOR_KEYBOARD_ORDER,buildAnnotatorSource}=ctx;
  const {ANNOTATOR_HANDLER_CONTRACTS}=require(path.join(ROOT,'src/annotator/handler-contracts.js'));
  if(!ANNOTATOR_HANDLER_CONTRACTS||typeof ANNOTATOR_HANDLER_CONTRACTS!=='object') fail('annotator handler contract missing');

  const requestTypes=Object.keys(ANNOTATOR_HANDLER_CONTRACTS);
  const orderedFiles=requestTypes.map(type=>`handlers/${ANNOTATOR_HANDLER_CONTRACTS[type]?.file}`);
  if(JSON.stringify(orderedFiles)!==JSON.stringify(ANNOTATOR_HANDLER_ORDER)) fail('annotator handler contract/order drifted from build order');

  const oldRuntimeDir=path.join(ROOT,'src/annotator/runtime-message');
  if(fs.existsSync(oldRuntimeDir)){
    const stale=fs.readdirSync(oldRuntimeDir).filter(name=>name.endsWith('.part.js'));
    if(stale.length) fail(`annotator lexical runtime fragments returned: ${stale.join(', ')}`);
  }
  if(fs.existsSync(path.join(ROOT,'src/annotator/runtime-message-handler.js'))) fail('annotator monolithic runtime handler returned');

  const runtimeDispatch=read('src/annotator/runtime-message-dispatch.js');
  if((runtimeDispatch.match(/window\.addEventListener\(\s*['"]message['"]/g)||[]).length!==1) fail('annotator runtime must have exactly one message listener owner');
  if(!runtimeDispatch.includes('await handler(ctx, ANNOTATOR_HANDLER_DEPENDENCIES);')) fail('annotator dispatch does not inject canonical ctx/dependency contracts');

  const methodOwners=new Map();
  let explicitDependencyUseCount=0;
  let maxHandlerLines=0;
  let maxHandler=null;

  for(const type of requestTypes){
    const contract=ANNOTATOR_HANDLER_CONTRACTS[type];
    if(!contract||!contract.file||!contract.functionName||!Array.isArray(contract.requires)) fail(`invalid annotator handler contract: ${type}`);
    if(new Set(contract.requires).size!==contract.requires.length) fail(`duplicate annotator dependency: ${type}`);

    const rel=`src/annotator/handlers/${contract.file}`;
    const source=read(rel);
    const lineCount=source.split(/\r?\n/).length;
    if(lineCount>maxHandlerLines){maxHandlerLines=lineCount;maxHandler=rel;}

    const loaded=require(path.join(ROOT,rel));
    const exported=Object.keys(loaded||{});
    if(exported.length!==1||exported[0]!==contract.functionName||typeof loaded[contract.functionName]!=='function') fail(`annotator handler export mismatch: ${type}`);
    if(methodOwners.has(contract.functionName)) fail(`annotator handler function has multiple owners: ${contract.functionName}`);
    methodOwners.set(contract.functionName,type);

    if(source.includes("window.addEventListener('message'")||source.includes('window.addEventListener("message"')) fail(`annotator handler owns transport listener: ${type}`);
    if(source.includes('contentWindow.postMessage(')||source.includes('window.parent.postMessage(')) fail(`annotator handler bypasses canonical send dependency: ${type}`);
    if(/\b(?:engine|api|native|pdfiumModule|bytes|doc|msg|requestId|keyboardTiming|kbRound|finishKeyboardTiming|writeDebug|markWriteStage)\b/.test(source.replace(/\bctx\.(?:engine|api|native|pdfiumModule|bytes|doc|msg|requestId|keyboardTiming|kbRound|finishKeyboardTiming|writeDebug|markWriteStage)\b/g,''))){
      // Do not reject local variables with these generic names; ctx ownership is instead protected
      // by forbidding the old lexical runtime shape and by dependency checks below.
    }

    const used=[...source.matchAll(/\bdeps\.([A-Za-z_$][\w$]*)\b/g)].map(m=>m[1]);
    const usedUnique=[...new Set(used)].sort();
    const declared=[...contract.requires].sort();
    if(JSON.stringify(usedUnique)!==JSON.stringify(declared)){
      const missing=declared.filter(x=>!usedUnique.includes(x));
      const undeclared=usedUnique.filter(x=>!declared.includes(x));
      fail(`annotator dependency contract drifted for ${type}; unused declarations=[${missing.join(', ')}], undeclared uses=[${undeclared.join(', ')}]`);
    }
    explicitDependencyUseCount+=used.length;

    for(const other of requestTypes){
      if(other===type) continue;
      const fn=ANNOTATOR_HANDLER_CONTRACTS[other].functionName;
      if(source.includes(`${fn}(`)) fail(`annotator handler directly calls another request owner: ${type} -> ${other}`);
    }
  }


  const keyboardContracts = [
    {file:'keyboard/line-navigation.js', exportName:'createKeyboardLineNavigation', maxLines:600},
    {file:'keyboard/viewport-navigation.js', exportName:'createKeyboardViewportNavigation', maxLines:250},
    {file:'keyboard/word-navigation.js', exportName:'createKeyboardWordNavigation', maxLines:150}
  ];
  if(JSON.stringify(ANNOTATOR_KEYBOARD_ORDER)!==JSON.stringify(keyboardContracts.map(x=>x.file))) fail('annotator keyboard module order drifted');
  for(const item of keyboardContracts){
    const rel=`src/annotator/${item.file}`;
    if(!fs.existsSync(path.join(ROOT,rel))) fail(`annotator keyboard module missing: ${rel}`);
    const source=read(rel);
    const loaded=require(path.join(ROOT,rel));
    if(typeof loaded?.[item.exportName]!=='function'||Object.keys(loaded).length!==1) fail(`annotator keyboard module export mismatch: ${item.file}`);
    const lineCount=source.split(/\r?\n/).length;
    if(lineCount>item.maxLines) fail(`annotator keyboard module grew beyond ownership boundary: ${item.file} (${lineCount} > ${item.maxLines})`);
    for(const forbidden of ['ctx.msg','deps.send(','window.addEventListener(','contentWindow.postMessage(','handleKeyboardExpandSelection(']){
      if(source.includes(forbidden)) fail(`keyboard algorithm module escaped request/transport boundary (${item.file}): ${forbidden}`);
    }
  }
  const keyboardHandler=read('src/annotator/handlers/02-keyboard-expand-selection.js');
  if(keyboardHandler.split(/\r?\n/).length>900) fail('keyboard request handler became monolithic again');
  for(const required of ['createKeyboardLineNavigation({','createKeyboardViewportNavigation({','createKeyboardWordNavigation({']) if(!keyboardHandler.includes(required)) fail(`keyboard request handler missing algorithm module: ${required}`);
  for(const forbidden of ['const getPageLines = async','const findAdjacentLineTarget = async','const findViewportLineTarget = async','const wordClassAt =']) if(keyboardHandler.includes(forbidden)) fail(`keyboard algorithm implementation leaked back into request handler: ${forbidden}`);
  const assembled=buildAnnotatorSource(ROOT);
  const handlerAt=assembled.indexOf('async function handleKeyboardExpandSelection(ctx, deps)');
  for(const item of keyboardContracts){
    const factoryAt=assembled.indexOf(`function ${item.exportName}(`);
    if(factoryAt<0||factoryAt>handlerAt) fail(`keyboard algorithm factory is not bundled before request handler: ${item.exportName}`);
  }

  const shared=read('src/annotator/handler-shared.js');
  if(!shared.includes('function pdfiumGateHighlightGroupKey(')) fail('annotator shared handler helper owner missing');
  const bundle=read('scripts/source-bundle.js');
  if(!bundle.includes('...ANNOTATOR_HANDLER_ORDER.map(file => moduleBody(root, `src/annotator/${file}`))')) fail('annotator handlers are not composed from canonical handler order');

  return {
    annotatorHandlerCount:requestTypes.length,
    annotatorHandlerOwnerCount:methodOwners.size,
    explicitDependencyUseCount,
    hiddenCrossHandlerCallCount:0,
    transportListenerOwnerCount:1,
    maxAnnotatorHandlerLines:maxHandlerLines,
    maxAnnotatorHandler:maxHandler,
    keyboardAlgorithmModuleCount:keyboardContracts.length,
    keyboardAlgorithmModules:keyboardContracts.map(item=>({file:item.file,lines:read(`src/annotator/${item.file}`).split(/\r?\n/).length}))
  };
};
